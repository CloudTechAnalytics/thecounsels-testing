-- ============================================================================
-- Migration 0169 — Billing/financial workflow: invoicing-first, not just
-- unbilled-work sweeps.
--
-- Two real gaps found while auditing the billing module: (1) generate_
-- invoice() could ONLY sweep every unbilled time/expense for a client/
-- matter — a fixed-fee or retainer invoice with zero time entries came out
-- empty, and there was no way to pick specific unbilled items rather than
-- "all of them." (2) payment references had no duplicate protection at all.
--
-- Additive only — no table drops, no data changes to existing invoices/
-- payments. generate_invoice() keeps its old 5-arg call shape working
-- exactly as before (new params all default to "same as before"); this is
-- a signature change (new trailing params), so the old 5-arg overload is
-- explicitly dropped first per this project's own established convention
-- (Postgres treats an added-parameter CREATE OR REPLACE as a new overload,
-- not a true replace, unless the old one is dropped first).
-- ============================================================================

drop function if exists public.generate_invoice(uuid, uuid, uuid, date, numeric);

create or replace function public.generate_invoice(
  p_org uuid,
  p_client uuid,
  p_matter uuid default null,
  p_due_date date default null,
  p_tax_rate numeric default 0,
  -- Explicit list = "invoice exactly these" (the real ask: let the user
  -- pick which unbilled time/expenses go on this invoice). null (the old
  -- default) keeps the original "sweep every unbilled item for this
  -- client/matter" behavior, so any existing caller is unaffected.
  p_time_entry_ids uuid[] default null,
  p_expense_ids uuid[] default null,
  -- Professional Fee / Retainer / Other Charge lines, added directly at
  -- generation time — [{ "kind": "professional_fee", "description": "...",
  -- "quantity": 1, "unit": null, "rate": 500000, "amount": 500000 }, ...].
  -- amount is trusted when given (a flat fee has no meaningful qty*rate);
  -- otherwise computed from quantity*rate, same as invoice_items always has.
  p_manual_items jsonb default '[]'::jsonb
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

  insert into public.invoices (organization_id, client_id, matter_id, status, due_date, tax_rate, created_by)
  values (p_org, p_client, p_matter, 'draft', p_due_date, coalesce(p_tax_rate, 0), auth.uid())
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

  -- Manual lines — the fix for "fixed fee / retainer with zero time
  -- entries used to generate an empty invoice."
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

grant execute on function public.generate_invoice(uuid, uuid, uuid, date, numeric, uuid[], uuid[], jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- Duplicate payment-reference protection — a real gap, previously zero
-- enforcement beyond payment_number/receipt_number (system-generated, not
-- what a firm actually types in as "their" reference). Scoped to
-- (invoice_id, reference), matching the product's own example: the same
-- reference entered twice for the same invoice. A voided/deleted payment
-- physically removes its row (existing voidPayment behavior), so its
-- reference is naturally free again — no soft-delete complication here.
-- Verified no existing duplicates before adding this (see audit).
-- ----------------------------------------------------------------------------
create unique index if not exists uq_payments_invoice_reference
  on public.payments (invoice_id, reference)
  where reference is not null and reference <> '';
