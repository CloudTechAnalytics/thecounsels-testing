import { supabase } from '@/shared/lib/supabase'
import { adminUsersService } from '@/shared/services/admin-users.service'
import { invokeEdgeFunction } from '@/shared/lib/edge-function'
import { monthlyEquivalent } from '@/shared/lib/billing-cycle'
import type {
  AuditLog,
  BillingCycle,
  Json,
  OrgStatus,
  Organization,
  Plan,
  PlanPrice,
  PlatformSettings,
  SubscriptionStatus,
} from '@/shared/types/database.types'

export interface PlanInput {
  id?: string
  name: string
  description?: string | null
  price_monthly?: number
  price_quarterly?: number
  price_semiannual?: number
  price_yearly?: number
  max_users?: number | null
  storage_gb?: number
  support_level?: string
  features?: Json
  highlights?: string[]
  is_active?: boolean
}

/** One currency's pricing for a plan (0161) — price_quarterly stays
 * optional/nullable, same as the legacy plans columns it mirrors. */
export interface PlanPriceInput {
  currency: string
  price_monthly: number
  price_quarterly: number | null
  price_semiannual: number | null
  price_yearly: number
}
import type {
  GrowthPoint,
  MemberDirectoryRow,
  OrgRow,
  PlatformStats,
  PlatformUser,
  RegistrationSettings,
  RevenueAnalytics,
  SubscriptionRow,
  SubscriptionWithPlan,
} from '@/features/platform/types'

/** Monthly-equivalent revenue contribution of one active subscription. */
function monthlyValue(sub: { billing_cycle: BillingCycle; plan: Plan | null } | null): number {
  if (!sub?.plan) return 0
  return monthlyEquivalent(sub.billing_cycle, sub.plan)
}

export const platformService = {
  /**
   * Three plain queries merged client-side rather than one combined
   * `*, memberships(count), subscription:subscriptions(*, plan:plans(*))`
   * select. The real failure (only visible once the page started
   * surfacing `error`, not just `data`) was that `subscriptions` has two
   * foreign keys into `plans` (`plan_id`, and `scheduled_plan_id` added in
   * migration 0053) — any bare `plan:plans(...)` embed is ambiguous and
   * PostgREST rejects the whole query (HTTP 300, "more than one
   * relationship was found"). Fixed by naming the FK explicitly
   * (`plans!subscriptions_plan_id_fkey`) everywhere a subscription embeds
   * its plan — see administrationService.getSubscription and
   * listSubscriptions/listTrials/getStats below, all hit the same bug.
   */
  async listOrganizations(includeDeleted = false): Promise<OrgRow[]> {
    let q = supabase.from('organizations').select('*').order('created_at', { ascending: false })
    q = includeDeleted ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
    const { data: orgs, error } = await q
    if (error) throw error
    const rows = (orgs ?? []) as Organization[]
    if (rows.length === 0) return []

    const ids = rows.map((o) => o.id)
    const [subsRes, membersRes, ownersRes, storageRes] = await Promise.all([
      // Explicit FK name required — subscriptions has two FKs into plans
      // (plan_id and scheduled_plan_id, 0053), so the bare `plan:plans(*)`
      // embed is ambiguous and PostgREST rejects it outright (HTTP 300).
      supabase.from('subscriptions').select('*, plan:plans!subscriptions_plan_id_fkey(*)').in('organization_id', ids),
      supabase.from('memberships').select('organization_id').eq('status', 'active').in('organization_id', ids),
      supabase
        .from('memberships')
        .select('organization_id, profile:profiles!memberships_user_id_fkey(full_name, email)')
        .eq('is_owner', true)
        .in('organization_id', ids),
      // organizations.storage_used_bytes is never actually written to
      // anywhere — computed live from documents.size_bytes instead so it
      // reflects real usage rather than a permanently-stale 0.
      supabase.rpc('platform_storage_usage'),
    ])
    if (subsRes.error) throw subsRes.error
    if (membersRes.error) throw membersRes.error
    if (ownersRes.error) throw ownersRes.error
    if (storageRes.error) throw storageRes.error

    const subByOrg = new Map(
      ((subsRes.data ?? []) as unknown as SubscriptionWithPlan[]).map((s) => [s.organization_id, s]),
    )
    const countByOrg = new Map<string, number>()
    for (const m of membersRes.data ?? []) {
      countByOrg.set(m.organization_id, (countByOrg.get(m.organization_id) ?? 0) + 1)
    }
    const ownerByOrg = new Map(
      (ownersRes.data ?? []).map((r) => [
        r.organization_id,
        r.profile as unknown as { full_name: string | null; email: string } | null,
      ]),
    )
    const storageByOrg = new Map((storageRes.data ?? []).map((r) => [r.organization_id, r.total_bytes]))

    return rows.map((o) => {
      const sub = subByOrg.get(o.id) ?? null
      // Already available on the subscriptions+plan embed fetched above —
      // no separate query needed.
      const storageGb = (sub?.plan?.storage_gb ?? 0) + (sub?.additional_storage_gb ?? 0)
      return {
        ...o,
        storage_used_bytes: storageByOrg.get(o.id) ?? 0,
        storage_limit_bytes: storageGb * 1024 ** 3,
        member_count: countByOrg.get(o.id) ?? 0,
        subscription: sub,
        owner: ownerByOrg.get(o.id) ?? null,
      }
    })
  },

  /** Real database/storage bytes against the current Supabase plan cap
   * (platform_settings.db_cap_mb/storage_cap_mb — update those the day this
   * project moves off Free tier). Backs the same 0158/0159 daily alert
   * check (check-resource-usage edge function), just the on-demand,
   * admin-viewable half of it. */
  async getResourceUsage(): Promise<{
    dbBytes: number
    storageBytes: number
    dbCapBytes: number
    storageCapBytes: number
    dbPct: number
    storagePct: number
  }> {
    const { data, error } = await supabase.rpc('platform_resource_usage')
    if (error) throw error
    const row = (Array.isArray(data) ? data[0] : data) as {
      db_bytes: number
      storage_bytes: number
      db_cap_bytes: number
      storage_cap_bytes: number
      db_pct: number
      storage_pct: number
    }
    return {
      dbBytes: row.db_bytes,
      storageBytes: row.storage_bytes,
      dbCapBytes: row.db_cap_bytes,
      storageCapBytes: row.storage_cap_bytes,
      dbPct: row.db_pct,
      storagePct: row.storage_pct,
    }
  },

  async getStats(): Promise<PlatformStats> {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const activeOrgs = supabase.from('organizations').select('*', { count: 'exact', head: true }).is('deleted_at', null)

    const [
      totalOrganizations,
      paidOrganizations,
      trialOrganizations,
      suspendedOrganizations,
      totalUsers,
      platformUsers,
      auditEvents,
      organizationsThisMonth,
      signedInToday,
      subs,
    ] = await Promise.all([
      activeOrgs.then((r) => r.count ?? 0),
      supabase.from('organizations').select('*', { count: 'exact', head: true }).eq('status', 'active').is('deleted_at', null).then((r) => r.count ?? 0),
      supabase.from('organizations').select('*', { count: 'exact', head: true }).eq('status', 'trial').is('deleted_at', null).then((r) => r.count ?? 0),
      supabase.from('organizations').select('*', { count: 'exact', head: true }).eq('status', 'suspended').is('deleted_at', null).then((r) => r.count ?? 0),
      // Distinct users with an active membership somewhere — NOT a raw
      // `profiles` count. Removing a member only ever deletes their
      // `memberships` row (see administrationService.removeMember); the
      // `profiles` row itself is intentionally kept for audit/history
      // (audit_logs, matter_events, etc. reference it). Counting profiles
      // directly means every removed user still inflates this figure
      // forever — this counts only people who actually still belong
      // somewhere.
      supabase
        .from('memberships')
        .select('user_id')
        .eq('status', 'active')
        .then((r) => {
          if (r.error) throw r.error
          return new Set((r.data ?? []).map((m) => m.user_id)).size
        }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_platform_admin', true).then((r) => r.count ?? 0),
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }).then((r) => r.count ?? 0),
      supabase.from('organizations').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth.toISOString()).then((r) => r.count ?? 0),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_seen_at', startOfDay.toISOString()).then((r) => r.count ?? 0),
      supabase
        .from('subscriptions')
        .select('billing_cycle, status, plan:plans!subscriptions_plan_id_fkey(price_monthly, price_quarterly, price_semiannual, price_yearly)')
        .eq('status', 'active'),
    ])

    if (subs.error) throw subs.error
    const mrr = ((subs.data ?? []) as unknown as { billing_cycle: BillingCycle; plan: Plan | null }[]).reduce(
      (sum, s) => sum + monthlyValue(s),
      0,
    )

    return {
      totalOrganizations,
      paidOrganizations,
      trialOrganizations,
      suspendedOrganizations,
      totalUsers,
      platformUsers,
      organizationsThisMonth,
      auditEvents,
      signedInToday,
      mrr,
      arr: mrr * 12,
    }
  },

  async setOrganizationStatus(id: string, status: OrgStatus): Promise<void> {
    const { error } = await supabase.from('organizations').update({ status }).eq('id', id)
    if (error) throw error

    // Keep this in sync with the subscription too, same direction as
    // updateSubscription already does the other way (subscription status
    // change -> organizations.status). Without this, this action only ever
    // updated one half: a real reported bug was toggling an org back to
    // "Active" here while its subscription stayed "Paused" underneath —
    // the Organizations table said Active, but RequireActiveSubscription
    // reads subscriptions.status, not organizations.status, so the firm
    // stayed locked out regardless of what this table showed.
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('organization_id', id)
      .maybeSingle()

    if (sub) {
      // Reactivating the org lifts a pure admin hold (paused/suspended) —
      // deliberately NOT touched for expired/past_due/cancelled, which are
      // real billing lapses that still need an actual plan/checkout, not
      // just a status flip (see expired-subscription-page.tsx).
      if (status === 'active' && (sub.status === 'paused' || sub.status === 'suspended')) {
        await supabase.from('subscriptions').update({ status: 'active' }).eq('id', sub.id)
      }
      // Suspending the org is meant to be a real hard stop — carry it
      // through to the subscription too, unless it's already a terminal
      // billing state (expired/cancelled) that shouldn't be overwritten.
      if (status === 'suspended' && sub.status !== 'expired' && sub.status !== 'cancelled') {
        await supabase.from('subscriptions').update({ status: 'suspended' }).eq('id', sub.id)
      }
    }

    await supabase.rpc('log_audit', {
      p_org: id,
      p_action: `organization.${status === 'suspended' ? 'suspended' : 'reactivated'}`,
      p_entity_type: 'organization',
      p_entity_id: id,
      p_summary: `Organization status set to ${status}`,
      p_platform: true,
    })
  },

  async softDeleteOrganization(id: string): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_organization', { p_org: id })
    if (error) throw error
  },

  async restoreOrganization(id: string): Promise<void> {
    const { error } = await supabase.rpc('restore_organization', { p_org: id })
    if (error) throw error
  },

  /**
   * Permanently removes an already-trashed organization via the
   * hard-delete-organization Edge Function — not a direct RPC. Purging the
   * login accounts of members who exist only for this org requires the Auth
   * Admin API (service role), which the SQL RPC alone can't reach.
   */
  async hardDeleteOrganization(id: string): Promise<{ purgedAccounts: number; warning?: string }> {
    return invokeEdgeFunction('hard-delete-organization', { organizationId: id })
  },

  async updateOrganization(
    id: string,
    patch: {
      name?: string
      legal_name?: string | null
      industry?: string | null
      website?: string | null
      phone?: string | null
      billing_email?: string | null
    },
  ): Promise<void> {
    const { error } = await supabase.from('organizations').update(patch).eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: id,
      p_action: 'organization.updated',
      p_entity_type: 'organization',
      p_entity_id: id,
      p_summary: 'Organization details updated',
      p_platform: true,
    })
  },

  async createOrganizationWithAdmin(input: {
    name: string
    slug: string
    legalName?: string | null
    planId: string | null
    trial: boolean
    billingCycle: BillingCycle
    adminEmail: string
    adminName: string
    adminPassword: string
    orgType?: 'customer' | 'demo' | 'internal'
  }): Promise<Organization> {
    // Pre-check the slug (including trashed orgs) so we fail early with a clear
    // message instead of hitting the unique constraint mid-flow.
    const { data: existing } = await supabase
      .from('organizations')
      .select('id, deleted_at')
      .eq('slug', input.slug.toLowerCase())
      .maybeSingle()
    if (existing) {
      throw new Error(
        existing.deleted_at
          ? `An organization with the slug "${input.slug}" is in Trash. Restore it or delete it permanently, or choose a different slug.`
          : `An organization with the slug "${input.slug}" already exists. Choose a different name or slug.`,
      )
    }

    // The org admin must be a brand-new account. Reject an email that already
    // has one (e.g. your own platform-owner login) — otherwise we'd hijack it.
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, is_platform_admin')
      .eq('email', input.adminEmail)
      .maybeSingle()
    if (existingProfile) {
      throw new Error(
        existingProfile.is_platform_admin
          ? `${input.adminEmail} is a platform account. Use a separate email for the firm's administrator.`
          : `${input.adminEmail} already has an account. Use a different email for the firm's administrator.`,
      )
    }

    const { data: org, error } = await supabase.rpc('create_organization', {
      p_name: input.name,
      p_slug: input.slug,
      p_legal_name: input.legalName ?? null,
      p_plan_id: input.planId,
      p_trial: input.trial,
      p_billing_cycle: input.billingCycle,
      p_org_type: input.orgType ?? 'customer',
    })
    if (error) throw new Error(error.message || 'The database rejected the organization.')
    const organization = org as Organization

    // Seat the org admin. If this fails the org would be orphaned (and its slug
    // would block retries), so roll the organization back and surface why.
    try {
      await adminUsersService.createUser({
        email: input.adminEmail,
        password: input.adminPassword,
        fullName: input.adminName,
        organizationId: organization.id,
        roleKey: 'managing_partner',
        title: 'Managing Partner',
        platformSeed: true,
      })
    } catch (adminErr) {
      try {
        await supabase.rpc('soft_delete_organization', { p_org: organization.id })
        await supabase.rpc('hard_delete_organization', { p_org: organization.id })
      } catch {
        /* best-effort cleanup */
      }
      const reason = adminErr instanceof Error ? adminErr.message : 'Unknown error'
      throw new Error(`Organization admin could not be created: ${reason}. No organization was created — please try again.`)
    }
    return organization
  },

  /** Platform-admin-only, guarded to organization_type='demo' server-side too (see migration 0052). */
  async resetDemoOrganization(id: string): Promise<void> {
    const { error } = await supabase.rpc('reset_demo_organization', { p_org: id })
    if (error) throw error
  },

  /** The self-service registration trial/plan knobs — §9's "don't hardcode 3 months". */
  async getRegistrationSettings(): Promise<RegistrationSettings> {
    const { data, error } = await supabase.from('registration_settings').select('*').eq('id', true).single()
    if (error) throw error
    return data as unknown as RegistrationSettings
  },

  async updateRegistrationSettings(patch: {
    trial_enabled?: boolean
    trial_duration_days?: number
    trial_plan_id?: string | null
    trial_future_price?: number | null
  }): Promise<void> {
    const { error } = await supabase.from('registration_settings').update(patch).eq('id', true)
    if (error) throw error
  },

  async listAllMembers(): Promise<MemberDirectoryRow[]> {
    const { data, error } = await supabase
      .from('memberships')
      .select(
        '*, user:profiles!memberships_user_id_fkey(id, full_name, email, avatar_url, last_seen_at), organization:organizations(id, name, slug), role:roles(id, name, key)',
      )
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as MemberDirectoryRow[]
  },

  // ── Platform users ─────────────────────────────────────────────────────────
  async listPlatformUsers(): Promise<PlatformUser[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, platform_role, last_seen_at, created_at')
      .eq('is_platform_admin', true)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as PlatformUser[]
  },

  async createPlatformUser(input: { email: string; password: string; fullName: string; platformRole: string }): Promise<void> {
    await adminUsersService.createPlatformUser(input)
  },

  async setPlatformAccess(userId: string, role: string, isAdmin: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_platform_access', { p_user: userId, p_role: role, p_is_admin: isAdmin })
    if (error) throw error
  },

  // ── Platform settings ───────────────────────────────────────────────────────
  async getSettings(): Promise<PlatformSettings> {
    const { data, error } = await supabase.from('platform_settings').select('*').eq('id', true).single()
    if (error) throw error
    return data as PlatformSettings
  },

  async updateSettings(patch: Partial<PlatformSettings>): Promise<void> {
    const { error } = await supabase.from('platform_settings').update(patch).eq('id', true)
    if (error) throw error
  },

  /** Only requests access now — the firm's own admin has to grant it (0133)
   * before this actually goes active. See SupportSessionDialog/
   * useSupportSessionGrantListener for the wait-then-enter flow. */
  async requestSupportSession(orgId: string, reason: string): Promise<{ id: string; organization_id: string; status: string }> {
    const { data, error } = await supabase.rpc('request_support_session', { p_org: orgId, p_reason: reason })
    if (error) throw error
    return data as { id: string; organization_id: string; status: string }
  },

  async endSupportSession(sessionId: string): Promise<void> {
    const { error } = await supabase.rpc('end_support_session', { p_id: sessionId })
    if (error) throw error
  },

  async getRecentActivity(limit = 12): Promise<AuditLog[]> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data ?? []
  },

  /** Platform-admin-only, enforced server-side (migration 0062). Wipes
   * every audit_logs row and writes back exactly one entry recording who
   * cleared it and when — never a silently-empty log. */
  async clearAuditLog(): Promise<void> {
    const { error } = await supabase.rpc('clear_audit_log')
    if (error) throw error
  },

  async getOrganizationGrowth(months = 6): Promise<GrowthPoint[]> {
    const since = new Date()
    since.setMonth(since.getMonth() - (months - 1))
    since.setDate(1)
    since.setHours(0, 0, 0, 0)
    const { data, error } = await supabase.from('organizations').select('created_at').gte('created_at', since.toISOString())
    if (error) throw error

    const buckets: GrowthPoint[] = []
    const fmt = new Intl.DateTimeFormat('en', { month: 'short' })
    for (let i = 0; i < months; i++) {
      const d = new Date(since)
      d.setMonth(since.getMonth() + i)
      buckets.push({ label: fmt.format(d), value: 0 })
    }
    for (const row of data ?? []) {
      const created = new Date(row.created_at)
      const idx = (created.getFullYear() - since.getFullYear()) * 12 + created.getMonth() - since.getMonth()
      if (idx >= 0 && idx < buckets.length) buckets[idx].value += 1
    }
    let running = 0
    return buckets.map((b) => ({ label: b.label, value: (running += b.value) }))
  },

  async getRevenueAnalytics(months = 6): Promise<RevenueAnalytics> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select(
        'status, billing_cycle, created_at, cancelled_at, plan:plans!subscriptions_plan_id_fkey(name, price_monthly, price_quarterly, price_semiannual, price_yearly), organization:organizations(id, name)',
      )
    if (error) throw error

    type Row = {
      status: SubscriptionStatus
      billing_cycle: BillingCycle
      created_at: string
      cancelled_at: string | null
      plan: { name: string; price_monthly: number; price_quarterly: number | null; price_semiannual: number | null; price_yearly: number } | null
      organization: { id: string; name: string } | null
    }
    const subs = (data ?? []) as unknown as Row[]
    const mv = (s: Row) => (!s.plan ? 0 : monthlyEquivalent(s.billing_cycle, s.plan))

    const active = subs.filter((s) => s.status === 'active')
    const mrr = active.reduce((sum, s) => sum + mv(s), 0)
    const payingCustomers = active.length
    const arpa = payingCustomers ? mrr / payingCustomers : 0
    const atRisk = subs.filter((s) => s.status === 'past_due').reduce((sum, s) => sum + mv(s), 0)

    // Month buckets for the trailing window.
    const start = new Date()
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    start.setMonth(start.getMonth() - (months - 1))
    const fmt = new Intl.DateTimeFormat('en', { month: 'short' })
    const monthIndex = (iso: string) => {
      const d = new Date(iso)
      return (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth()
    }
    const movement = Array.from({ length: months }, (_, i) => {
      const d = new Date(start)
      d.setMonth(start.getMonth() + i)
      return { label: fmt.format(d), newMrr: 0, churnedMrr: 0, netMrr: 0 }
    })
    for (const s of subs) {
      if (s.status === 'active') {
        const idx = monthIndex(s.created_at)
        if (idx >= 0 && idx < months) movement[idx].newMrr += mv(s)
      }
      if (s.status === 'cancelled' && s.cancelled_at) {
        const idx = monthIndex(s.cancelled_at)
        if (idx >= 0 && idx < months) movement[idx].churnedMrr += mv(s)
      }
    }
    movement.forEach((m) => (m.netMrr = m.newMrr - m.churnedMrr))

    // Reconstruct the cumulative MRR trend so the last point equals current MRR.
    const windowNet = movement.reduce((sum, m) => sum + m.netMrr, 0)
    let running = Math.max(0, mrr - windowNet)
    const trend: GrowthPoint[] = movement.map((m) => {
      running += m.netMrr
      return { label: m.label, value: Math.max(0, Math.round(running)) }
    })

    // By plan.
    const planMap = new Map<string, { label: string; value: number; customers: number }>()
    for (const s of active) {
      const name = s.plan?.name ?? 'Unassigned'
      const e = planMap.get(name) ?? { label: name, value: 0, customers: 0 }
      e.value += mv(s)
      e.customers += 1
      planMap.set(name, e)
    }
    const byPlan = [...planMap.values()].sort((a, b) => b.value - a.value)

    const byCycle = [
      { label: 'Monthly', value: active.filter((s) => s.billing_cycle === 'monthly').reduce((sum, s) => sum + mv(s), 0) },
      { label: 'Quarterly', value: active.filter((s) => s.billing_cycle === 'quarterly').reduce((sum, s) => sum + mv(s), 0) },
      { label: '6 Months', value: active.filter((s) => s.billing_cycle === 'semiannual').reduce((sum, s) => sum + mv(s), 0) },
      { label: 'Yearly', value: active.filter((s) => s.billing_cycle === 'yearly').reduce((sum, s) => sum + mv(s), 0) },
    ]

    const topCustomers = [...active]
      .map((s) => ({ id: s.organization?.id ?? '', name: s.organization?.name ?? '—', plan: s.plan?.name ?? '—', mrr: mv(s) }))
      .sort((a, b) => b.mrr - a.mrr)
      .slice(0, 6)

    // Simple linear forecast from the average monthly net-new over the window.
    const avgNet = windowNet / months
    const forecast = Array.from({ length: 6 }, (_, i) => {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() + i + 1)
      return { label: fmt.format(d), value: Math.max(0, Math.round(mrr + avgNet * (i + 1))) }
    })

    const projectedArr = Math.max(0, Math.round(mrr + avgNet * 6)) * 12

    return { mrr, arr: mrr * 12, arpa, payingCustomers, atRisk, projectedArr, trend, movement, byPlan, byCycle, topCustomers, forecast }
  },

  // ── Plans ────────────────────────────────────────────────────────────────
  async listPlans(): Promise<Plan[]> {
    const { data, error } = await supabase.from('plans').select('*').order('sort_order', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  /** Returns the saved plan's id — a brand-new plan doesn't have one until
   * this resolves, and the caller needs it right after to save this same
   * plan's per-currency prices (0161) in the same "Save" action. */
  async savePlan(plan: PlanInput): Promise<{ id: string }> {
    if (plan.id) {
      const { id, ...rest } = plan
      const { error } = await supabase.from('plans').update(rest).eq('id', id)
      if (error) throw error
      return { id }
    } else {
      const { id: _omit, ...rest } = plan
      void _omit
      const { data, error } = await supabase.from('plans').insert({ ...rest, is_custom: true, sort_order: 200 }).select('id').single()
      if (error) throw error
      return { id: data.id }
    }
  },

  async listPlanPrices(planId: string): Promise<PlanPrice[]> {
    const { data, error } = await supabase.from('plan_prices').select('*').eq('plan_id', planId)
    if (error) throw error
    return data ?? []
  },

  /** Upserts every currency passed in one go — the Plan Editor always sends
   * all 5 supported currencies (0161's SUPPORTED_CURRENCIES) together,
   * blank ones included as 0, so this doesn't need to separately handle
   * "remove a currency" — a 0 price just means not offered there yet. */
  async savePlanPrices(planId: string, prices: PlanPriceInput[]): Promise<void> {
    const { error } = await supabase
      .from('plan_prices')
      .upsert(
        prices.map((p) => ({ plan_id: planId, ...p })),
        { onConflict: 'plan_id,currency' },
      )
    if (error) throw error
  },

  // ── Subscriptions ─────────────────────────────────────────────────────────
  async listSubscriptions(): Promise<SubscriptionRow[]> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*, plan:plans!subscriptions_plan_id_fkey(*), organization:organizations(id, name, slug, logo_url, status)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as SubscriptionRow[]
  },

  async listTrials(): Promise<SubscriptionRow[]> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*, plan:plans!subscriptions_plan_id_fkey(*), organization:organizations(id, name, slug, logo_url, status)')
      .eq('status', 'trialing')
      .order('trial_ends_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as SubscriptionRow[]
  },

  async updateSubscription(
    id: string,
    patch: {
      plan_id?: string
      status?: SubscriptionStatus
      billing_cycle?: BillingCycle
      seats?: number
      trial_ends_at?: string
      current_period_end?: string
    },
    orgId: string,
    action: string,
  ): Promise<void> {
    const { error } = await supabase.from('subscriptions').update(patch).eq('id', id)
    if (error) throw error
    // Keep organization status in sync with subscription lifecycle. Was
    // previously only handling 'active'/'cancelled' — setting a
    // subscription to paused/suspended/expired left organizations.status
    // stale (still 'active'), a real reported inconsistency between what
    // the Platform Console's own Organizations table showed and what the
    // subscription actually was.
    if (patch.status === 'active') await supabase.from('organizations').update({ status: 'active' }).eq('id', orgId)
    if (patch.status === 'cancelled') await supabase.from('organizations').update({ status: 'cancelled' }).eq('id', orgId)
    if (patch.status === 'suspended' || patch.status === 'paused' || patch.status === 'expired') {
      await supabase.from('organizations').update({ status: 'suspended' }).eq('id', orgId)
    }
    await supabase.rpc('log_audit', {
      p_org: orgId,
      p_action: `subscription.${action}`,
      p_entity_type: 'subscription',
      p_entity_id: id,
      p_summary: `Subscription ${action}`,
      p_platform: true,
    })
  },

  /** Manual-payment review queue actions — see platform_review_manual_
   * payment() (migration 0167). Never activates a subscription just
   * because "manual" was chosen; this is the one explicit, confirmed step
   * that actually does. 'verify_and_activate' also flips the org's own
   * status to 'active', same sync updateSubscription above already does. */
  async reviewManualPayment(subscriptionId: string, action: 'verify_and_activate' | 'reject'): Promise<void> {
    const { error } = await supabase.rpc('platform_review_manual_payment', {
      p_subscription_id: subscriptionId,
      p_action: action,
    })
    if (error) throw error
  },
}
