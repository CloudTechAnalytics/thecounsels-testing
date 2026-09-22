-- ============================================================================
-- Migration 0171 — Record a live-only patch to is_org_admin() into version
-- control; sync employment_status changes to real workspace access.
--
-- Drift found while investigating today's HR bug report: the deployed
-- is_org_admin() on both testing and production already has an extra
-- `or public.has_permission(org, 'members.manage')` clause that no
-- migration file ever added — a manual Supabase SQL-editor fix from
-- earlier today (removing a Managing Partner membership hit an RLS error
-- until this was patched directly). Both environments already behave this
-- way; this migration only brings the migration history in sync with what
-- is actually deployed, so a fresh environment (or the bootstrap script)
-- doesn't silently rebuild the old, narrower version. No behavior change.
-- ============================================================================

create or replace function public.is_org_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
      or exists (
        select 1
        from public.memberships m
        where m.user_id = auth.uid()
          and m.organization_id = org
          and m.status = 'active'
          and m.is_owner = true
      )
      or public.has_permission(org, 'members.manage');
$$;
