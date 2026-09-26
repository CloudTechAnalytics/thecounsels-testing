-- ============================================================================
-- Migration 0173 — Semiannual (6-month) billing: plan pricing + checkout.
--
-- Depends on 0172 having committed first (adds the enum value this uses).
-- Same shape as 0122 did for quarterly: a price column on plans and
-- plan_prices, plus the 6-month branch in every place that turns a
-- billing_cycle into an amount or a period length. Paired with edge
-- function (paystack-init-transaction / paystack-webhook) + frontend changes
-- outside this file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. price_semiannual on plans (legacy NGN mirror) and plan_prices (the real
--    per-currency pricing, 0161). Backfilled at 14% off 6x monthly — between
--    quarterly (~10%) and yearly (~17%). NGN rounds to the nearest ₦1,000
--    like 0122 did; other currencies to the nearest whole unit, since
--    rounding USD 49 x 6 to the nearest 1,000 would zero it out. Tune any of
--    these afterward in Platform Console > Plans & Pricing.
-- ----------------------------------------------------------------------------
alter table public.plans add column if not exists price_semiannual numeric(12,2);
alter table public.plan_prices add column if not exists price_semiannual numeric;

update public.plans
set price_semiannual = case when coalesce(currency, 'NGN') = 'NGN'
                            then round(price_monthly * 6 * 0.86, -3)
                            else round(price_monthly * 6 * 0.86) end
where price_semiannual is null and price_monthly is not null and price_monthly > 0;

update public.plan_prices
set price_semiannual = case when currency = 'NGN'
                            then round(price_monthly * 6 * 0.86, -3)
                            else round(price_monthly * 6 * 0.86) end
where price_semiannual is null and price_monthly > 0;

-- ----------------------------------------------------------------------------
-- 2. create_organization — both live overloads (last defined in 0122) get
--    the 6-month period_end branch.
-- ----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_legal_name text default null,
  p_plan_id uuid default null,
  p_trial boolean default true,
  p_billing_cycle billing_cycle default 'monthly'::billing_cycle,
  p_owner_user_id uuid default null
)
returns organizations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  org public.organizations;
  owner_role_id uuid;
  resolved_plan_id uuid;
  period_end timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can create organizations' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, legal_name, status)
  values (
    p_name,
    lower(p_slug),
    p_legal_name,
    (case when p_trial then 'trial' else 'active' end)::public.org_status
  )
  returning * into org;

  resolved_plan_id := coalesce(p_plan_id, (select id from public.plans where key = 'professional'));

  if p_trial then
    insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, trial_ends_at, current_period_end)
    values (org.id, resolved_plan_id, 'trialing', p_billing_cycle, 5, now() + interval '14 days', now() + interval '14 days');
  else
    period_end := case
      when p_billing_cycle = 'yearly' then now() + interval '1 year'
      when p_billing_cycle = 'semiannual' then now() + interval '6 months'
      when p_billing_cycle = 'quarterly' then now() + interval '3 months'
      else now() + interval '1 month'
    end;
    insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, current_period_end)
    values (org.id, resolved_plan_id, 'active', p_billing_cycle,
            coalesce((select max_users from public.plans where id = resolved_plan_id), 5), period_end);
  end if;

  if p_owner_user_id is not null then
    select id into owner_role_id from public.roles where key = 'managing_partner';
    insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
    values (org.id, p_owner_user_id, owner_role_id, 'active', true, now())
    on conflict (organization_id, user_id) do nothing;
    update public.profiles set default_organization_id = coalesce(default_organization_id, org.id)
      where id = p_owner_user_id;
  end if;

  perform public.log_audit(org.id, 'organization.created', 'organization', org.id,
    'Organization provisioned', jsonb_build_object('name', p_name, 'trial', p_trial), true);
  return org;
end;
$function$;

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_legal_name text default null,
  p_plan_id uuid default null,
  p_trial boolean default true,
  p_billing_cycle billing_cycle default 'monthly'::billing_cycle,
  p_owner_user_id uuid default null,
  p_org_type text default 'customer'::text
)
returns organizations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  org public.organizations;
  owner_role_id uuid;
  resolved_plan_id uuid;
  resolved_trial_days integer;
  period_end timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can create organizations' using errcode = '42501';
  end if;
  if p_org_type not in ('customer', 'demo', 'internal') then
    raise exception 'Invalid organization type: %', p_org_type;
  end if;

  insert into public.organizations (name, slug, legal_name, status, organization_type)
  values (
    p_name,
    lower(p_slug),
    p_legal_name,
    (case when p_org_type <> 'customer' then 'active' when p_trial then 'trial' else 'active' end)::public.org_status,
    p_org_type
  )
  returning * into org;

  if p_org_type = 'customer' then
    resolved_plan_id := coalesce(p_plan_id, (select id from public.plans where key = 'starter'));

    if p_trial then
      resolved_trial_days := coalesce((select trial_duration_days from public.plans where id = resolved_plan_id), 30);
      insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, trial_ends_at, current_period_end)
      values (
        org.id, resolved_plan_id, 'trialing', p_billing_cycle,
        coalesce((select max_users from public.plans where id = resolved_plan_id), 5),
        now() + (resolved_trial_days || ' days')::interval,
        now() + (resolved_trial_days || ' days')::interval
      );
    else
      period_end := case
        when p_billing_cycle = 'yearly' then now() + interval '1 year'
        when p_billing_cycle = 'semiannual' then now() + interval '6 months'
      when p_billing_cycle = 'quarterly' then now() + interval '3 months'
        else now() + interval '1 month'
      end;
      insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, current_period_end, next_billing_date)
      values (org.id, resolved_plan_id, 'active', p_billing_cycle,
              coalesce((select max_users from public.plans where id = resolved_plan_id), 5), period_end, period_end);
    end if;
  end if;

  if p_owner_user_id is not null then
    select id into owner_role_id from public.roles where key = 'managing_partner';
    insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
    values (org.id, p_owner_user_id, owner_role_id, 'active', true, now())
    on conflict (organization_id, user_id) do nothing;
    update public.profiles set default_organization_id = coalesce(default_organization_id, org.id)
      where id = p_owner_user_id;
  end if;

  perform public.log_audit(org.id, 'organization.created', 'organization', org.id,
    'Organization provisioned', jsonb_build_object('name', p_name, 'trial', p_trial, 'org_type', p_org_type), true);
  return org;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 3. request_manual_payment / platform_review_manual_payment (last defined
--    in 0167) — semiannual amount and 6-month activation period.
-- ----------------------------------------------------------------------------
create or replace function public.request_manual_payment(
  p_org uuid,
  p_plan_id uuid,
  p_currency text default 'NGN',
  p_billing_cycle public.billing_cycle default 'monthly',
  p_country text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan public.plans;
  v_price public.plan_prices;
  v_amount numeric;
  v_currency text := coalesce(nullif(p_currency, ''), 'NGN');
  sub public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not authorized to manage billing for this organization' using errcode = '42501';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if v_plan.id is null or v_plan.is_custom then
    raise exception 'Select a valid plan' using errcode = 'P0001';
  end if;

  select * into v_price from public.plan_prices where plan_id = p_plan_id and currency = v_currency;
  if v_price.id is not null then
    v_amount := case p_billing_cycle
      when 'quarterly' then coalesce(v_price.price_quarterly, v_price.price_monthly * 3)
      when 'semiannual' then coalesce(v_price.price_semiannual, v_price.price_monthly * 6)
      when 'yearly' then v_price.price_yearly
      else v_price.price_monthly
    end;
  elsif v_currency = coalesce(v_plan.currency, 'NGN') then
    v_amount := case p_billing_cycle
      when 'quarterly' then coalesce(v_plan.price_quarterly, v_plan.price_monthly * 3)
      when 'semiannual' then coalesce(v_plan.price_semiannual, v_plan.price_monthly * 6)
      when 'yearly' then v_plan.price_yearly
      else v_plan.price_monthly
    end;
  else
    raise exception 'This plan has no % price set yet — contact support.', v_currency using errcode = 'P0001';
  end if;

  update public.subscriptions
  set plan_id = p_plan_id,
      billing_cycle = p_billing_cycle,
      amount = v_amount,
      currency = v_currency,
      billing_country = coalesce(nullif(p_country, ''), billing_country),
      payment_method = 'manual',
      payment_status = 'pending',
      provider = 'manual',
      status = 'awaiting_payment'
  where organization_id = p_org
  returning * into sub;

  if sub.id is null then
    raise exception 'No subscription found for this organization' using errcode = 'P0002';
  end if;

  perform public.log_audit(
    p_org, 'subscription.manual_payment_requested', 'subscription', sub.id,
    format('Requested manual payment for %s plan — %s %s', v_plan.name, v_currency, v_amount),
    jsonb_build_object('plan', v_plan.key, 'currency', v_currency, 'amount', v_amount, 'billing_cycle', p_billing_cycle, 'country', p_country),
    false
  );

  return sub;
end;
$$;

grant execute on function public.request_manual_payment(uuid, uuid, text, public.billing_cycle, text) to authenticated;

-- ----------------------------------------------------------------------------
-- platform_review_manual_payment() — the admin side. Requires an explicit
-- action; never auto-activates just because "manual" was chosen. Rejecting
-- leaves the org blocked (still awaiting_payment) but marks payment_status
-- so the admin console shows it was actually reviewed, not just untouched.
-- ----------------------------------------------------------------------------
create or replace function public.platform_review_manual_payment(p_subscription_id uuid, p_action text)
returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  sub public.subscriptions;
  v_period interval;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can review manual payments' using errcode = '42501';
  end if;
  if p_action not in ('verify_and_activate', 'reject') then
    raise exception 'Unknown action: %', p_action using errcode = 'P0001';
  end if;

  select * into sub from public.subscriptions where id = p_subscription_id;
  if sub.id is null then
    raise exception 'Subscription not found' using errcode = 'P0002';
  end if;

  if p_action = 'verify_and_activate' then
    v_period := case sub.billing_cycle when 'quarterly' then interval '3 months' when 'semiannual' then interval '6 months' when 'yearly' then interval '1 year' else interval '1 month' end;
    update public.subscriptions
    set payment_status = 'verified',
        status = 'active',
        last_payment_at = now(),
        current_period_end = now() + v_period,
        next_billing_date = now() + v_period
    where id = p_subscription_id
    returning * into sub;

    update public.organizations set status = 'active' where id = sub.organization_id and status <> 'active';

    perform public.log_audit(
      sub.organization_id, 'subscription.manual_payment_verified', 'subscription', sub.id,
      'Manual payment verified — subscription activated', '{}'::jsonb, true
    );
  else
    update public.subscriptions
    set payment_status = 'rejected'
    where id = p_subscription_id
    returning * into sub;

    perform public.log_audit(
      sub.organization_id, 'subscription.manual_payment_rejected', 'subscription', sub.id,
      'Manual payment rejected', '{}'::jsonb, true
    );
  end if;

  return sub;
end;
$$;

grant execute on function public.platform_review_manual_payment(uuid, text) to authenticated;
