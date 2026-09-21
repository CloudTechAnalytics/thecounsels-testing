-- ============================================================================
-- Migration 0170 — Backfill-friendly fields for entering pre-existing data,
-- plus two missing matter/client fields (Case Number, Occupation + related).
--
-- Real gap: when a firm migrates historical records into the system, every
-- "when did this happen" date silently defaulted to today (invoice issue
-- date, payment date already had a column but no UI, matter opened date,
-- client "on file since" date). This migration adds the columns that were
-- missing (matters.case_number, clients.occupation/date_of_birth/gender/
-- identification_number/client_since) and extends generate_invoice() so an
-- invoice's issue date can be set explicitly at creation time instead of
-- always being current_date.
--
-- Additive only — no drops, no data changes to existing rows. New columns
-- are nullable (or default current_date for the two "since" dates, matching
-- matters.opened_on's existing default pattern) so every existing client/
-- matter/invoice is unaffected.
-- ============================================================================

alter table public.matters add column if not exists case_number text;

alter table public.clients add column if not exists occupation text;
alter table public.clients add column if not exists date_of_birth date;
alter table public.clients add column if not exists gender text;
alter table public.clients add column if not exists identification_number text;
-- "Client since" — distinct from created_at (an immutable audit timestamp
-- of when the *row* was inserted); this is the editable business date a
-- firm can backdate when filing up a client that was already on their books.
alter table public.clients add column if not exists client_since date not null default current_date;

-- generate_invoice(): add p_issue_date so a backfilled invoice can carry its
-- real historical issue date instead of always defaulting to current_date.
-- Signature change (new trailing param) — drop the old 8-arg overload first
-- per this project's established convention (see 0169).
drop function if exists public.generate_invoice(uuid, uuid, uuid, date, numeric, uuid[], uuid[], jsonb);

create or replace function public.generate_invoice(
  p_org uuid,
  p_client uuid,
  p_matter uuid default null,
  p_due_date date default null,
  p_tax_rate numeric default 0,
  p_time_entry_ids uuid[] default null,
  p_expense_ids uuid[] default null,
  p_manual_items jsonb default '[]'::jsonb,
  p_issue_date date default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
  item jsonb;
begin
  if not public.has_financial_access(p_org, 'invoices.manage') then
    raise exception 'Not allowed to create invoices' using errcode = '42501';
  end if;

  insert into public.invoices (organization_id, client_id, matter_id, status, issue_date, due_date, tax_rate, created_by)
  values (p_org, p_client, p_matter, 'draft', coalesce(p_issue_date, current_date), p_due_date, coalesce(p_tax_rate, 0), auth.uid())
  returning * into inv;

  -- Time entries -> items.
  insert into public.invoice_items (organization_id, invoice_id, kind, description, quantity, unit, rate, amount)
  select t.organization_id, inv.id, 'time',
         coalesce(t.description, 'Legal services'),
         round(t.minutes / 60.0, 2), 'hrs', t.rate,
         round(t.minutes / 60.0 * t.rate, 2)
  from public.time_entries t
  where t.organization_id = p_org and t.billable and not t.invoiced
    and (
      (p_time_entry_ids is not null and t.id = any(p_time_entry_ids))
      or (p_time_entry_ids is null and (
        p_matter is not null and t.matter_id = p_matter
        or p_matter is null and t.matter_id in (select id from public.matters where client_id = p_client)
      ))
    );

  update public.time_entries t set invoiced = true, invoice_id = inv.id
  where t.organization_id = p_org and t.billable and not t.invoiced
    and (
      (p_time_entry_ids is not null and t.id = any(p_time_entry_ids))
      or (p_time_entry_ids is null and (
        p_matter is not null and t.matter_id = p_matter
        or p_matter is null and t.matter_id in (select id from public.matters where client_id = p_client)
      ))
    );

  -- Expenses -> items.
  insert into public.invoice_items (organization_id, invoice_id, kind, description, quantity, unit, rate, amount)
  select e.organization_id, inv.id, 'expense', coalesce(e.description, 'Expense'), 1, null, e.amount, e.amount
  from public.expenses e
  where e.organization_id = p_org and e.billable and not e.invoiced
    and (
      (p_expense_ids is not null and e.id = any(p_expense_ids))
      or (p_expense_ids is null and (
        p_matter is not null and e.matter_id = p_matter
        or p_matter is null and e.matter_id in (select id from public.matters where client_id = p_client)
      ))
    );

  update public.expenses e set invoiced = true, invoice_id = inv.id
  where e.organization_id = p_org and e.billable and not e.invoiced
    and (
      (p_expense_ids is not null and e.id = any(p_expense_ids))
      or (p_expense_ids is null and (
        p_matter is not null and e.matter_id = p_matter
        or p_matter is null and e.matter_id in (select id from public.matters where client_id = p_client)
      ))
    );

  -- Manual lines (Professional Fee / Retainer / Other Charge).
  if p_manual_items is not null then
    for item in select * from jsonb_array_elements(p_manual_items)
    loop
      insert into public.invoice_items (organization_id, invoice_id, kind, description, quantity, unit, rate, amount)
      values (
        p_org, inv.id,
        coalesce(nullif(item->>'kind', ''), 'manual'),
        coalesce(nullif(item->>'description', ''), 'Charge'),
        coalesce((item->>'quantity')::numeric, 1),
        nullif(item->>'unit', ''),
        coalesce((item->>'rate')::numeric, (item->>'amount')::numeric, 0),
        coalesce((item->>'amount')::numeric, coalesce((item->>'quantity')::numeric, 1) * coalesce((item->>'rate')::numeric, 0))
      );
    end loop;
  end if;

  select * into inv from public.invoices where id = inv.id;

  perform public.log_audit(p_org, 'invoice.created', 'invoice', inv.id, 'Generated ' || inv.invoice_number);
  return inv;
end;
$$;

grant execute on function public.generate_invoice(uuid, uuid, uuid, date, numeric, uuid[], uuid[], jsonb, date) to authenticated;
