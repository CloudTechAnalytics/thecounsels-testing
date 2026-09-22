import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { platformService, type PlanInput, type PlanPriceInput } from '@/features/platform/services/platform.service'
import { administrationService } from '@/features/administration/services/administration.service'
import { supabase } from '@/shared/lib/supabase'
import type { AuditLog } from '@/shared/types/database.types'

const keys = {
  stats: ['platform', 'stats'] as const,
  organizations: (deleted: boolean) => ['platform', 'organizations', deleted] as const,
  activity: ['platform', 'activity'] as const,
  growth: ['platform', 'growth'] as const,
  plans: ['platform', 'plans'] as const,
  subscriptions: ['platform', 'subscriptions'] as const,
  trials: ['platform', 'trials'] as const,
  members: ['platform', 'members'] as const,
}

function useInvalidateAll() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['platform'] })
  }
}

export function usePlatformStats() {
  return useQuery({ queryKey: keys.stats, queryFn: () => platformService.getStats() })
}
/** Real Supabase plan usage (database + storage bytes vs. the current
 * plan cap) — the on-demand counterpart to the daily automated alert
 * (see platform.service.ts's getResourceUsage). Refetches on its own
 * schedule since this doesn't change fast enough to need the health
 * page's 60s cadence. */
export function usePlatformResourceUsage() {
  return useQuery({
    queryKey: ['platform', 'resource-usage'],
    queryFn: () => platformService.getResourceUsage(),
    refetchInterval: 5 * 60_000,
  })
}
export function usePlatformOrganizations(includeDeleted = false) {
  return useQuery({
    queryKey: keys.organizations(includeDeleted),
    queryFn: () => platformService.listOrganizations(includeDeleted),
  })
}
/** Recent platform-wide activity, kept current via a Realtime subscription. */
export function usePlatformActivity() {
  const qc = useQueryClient()
  const [live, setLive] = useState(false)

  const query = useQuery({ queryKey: keys.activity, queryFn: () => platformService.getRecentActivity() })

  useEffect(() => {
    const channel = supabase
      .channel(`platform-activity:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        (payload) => {
          const row = payload.new as AuditLog
          qc.setQueryData<AuditLog[]>(keys.activity, (old) => {
            if (!old) return [row]
            if (old.some((r) => r.id === row.id)) return old
            return [row, ...old].slice(0, 12)
          })
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])

  return { ...query, live }
}
export function useClearAuditLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => platformService.clearAuditLog(),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.activity }),
  })
}
export function useOrganizationGrowth() {
  return useQuery({ queryKey: keys.growth, queryFn: () => platformService.getOrganizationGrowth() })
}
export function usePlans() {
  return useQuery({ queryKey: keys.plans, queryFn: () => platformService.listPlans() })
}
export function useSubscriptions() {
  return useQuery({ queryKey: keys.subscriptions, queryFn: () => platformService.listSubscriptions() })
}
export function useTrials() {
  return useQuery({ queryKey: keys.trials, queryFn: () => platformService.listTrials() })
}
export function useAllMembers() {
  return useQuery({ queryKey: keys.members, queryFn: () => platformService.listAllMembers() })
}
/** Platform Console's own suspend/reactivate for the cross-org directory —
 * reuses administrationService (memberships RLS already lets platform
 * admins write to any org's memberships, see is_org_admin()'s bypass), just
 * invalidates the platform-wide list instead of a single org's roster. */
export function usePlatformSetMembershipStatus(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, status, name }: { membershipId: string; status: 'active' | 'suspended'; name: string }) =>
      administrationService.setMembershipStatus(membershipId, organizationId!, status, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members }),
  })
}
export function usePlatformRemoveMember(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, name }: { membershipId: string; name: string }) =>
      administrationService.removeMember(membershipId, organizationId!, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members }),
  })
}
export function useRevenueAnalytics() {
  return useQuery({ queryKey: ['platform', 'revenue-analytics'], queryFn: () => platformService.getRevenueAnalytics() })
}
export function usePlatformUsers() {
  return useQuery({ queryKey: ['platform', 'platform-users'], queryFn: () => platformService.listPlatformUsers() })
}
export function usePlatformSettings() {
  return useQuery({ queryKey: ['platform', 'settings'], queryFn: () => platformService.getSettings() })
}
export function useCreatePlatformUser() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (input: { email: string; password: string; fullName: string; platformRole: string }) =>
      platformService.createPlatformUser(input),
    onSuccess: invalidate,
  })
}
export function useSetPlatformAccess() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ userId, role, isAdmin }: { userId: string; role: string; isAdmin: boolean }) =>
      platformService.setPlatformAccess(userId, role, isAdmin),
    onSuccess: invalidate,
  })
}
export function useUpdatePlatformSettings() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (patch: Parameters<typeof platformService.updateSettings>[0]) => platformService.updateSettings(patch),
    onSuccess: invalidate,
  })
}

export function useCreateOrganizationWithAdmin() {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: platformService.createOrganizationWithAdmin, onSuccess: invalidate })
}
export function useSetOrganizationStatus() {
  const invalidate = useInvalidateAll()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Parameters<typeof platformService.setOrganizationStatus>[1] }) =>
      platformService.setOrganizationStatus(id, status),
    // This can now also flip the org's subscription status (see
    // platformService.setOrganizationStatus's own comment) — invalidating
    // only the 'platform' namespace left the FIRM side (topbar status pill,
    // RequireActiveSubscription's own query, the locked-out screen) showing
    // the stale status until a manual reload. useSubscription's key is
    // ['administration', 'subscription', orgId] — invalidate the whole
    // prefix so every org's cached copy refetches, not just the one edited.
    onSuccess: () => {
      invalidate()
      void qc.invalidateQueries({ queryKey: ['administration', 'subscription'] })
    },
  })
}
export function useSoftDeleteOrganization() {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => platformService.softDeleteOrganization(id), onSuccess: invalidate })
}
export function useRestoreOrganization() {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => platformService.restoreOrganization(id), onSuccess: invalidate })
}
export function useHardDeleteOrganization() {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => platformService.hardDeleteOrganization(id), onSuccess: invalidate })
}
export function useResetDemoOrganization() {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => platformService.resetDemoOrganization(id), onSuccess: invalidate })
}
/** Same query key the onboarding wizard reads (features/onboarding/hooks/use-onboarding.ts)
 *  so a Platform Admin's save here invalidates what /onboarding shows next. */
export function useRegistrationSettingsAdmin() {
  return useQuery({ queryKey: ['registration-settings'], queryFn: () => platformService.getRegistrationSettings() })
}
export function useUpdateRegistrationSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Parameters<typeof platformService.updateRegistrationSettings>[0]) =>
      platformService.updateRegistrationSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registration-settings'] }),
  })
}
export function useUpdateOrganization() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof platformService.updateOrganization>[1] }) =>
      platformService.updateOrganization(args.id, args.patch),
    onSuccess: invalidate,
  })
}
export function useSavePlan() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (plan: PlanInput) => platformService.savePlan(plan),
    onSuccess: invalidate,
  })
}
/** 0161 — a plan's per-currency prices, loaded into the Plan Editor's
 * currency tabs when editing an existing plan. */
export function usePlanPrices(planId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'plan-prices', planId],
    enabled: Boolean(planId),
    queryFn: () => platformService.listPlanPrices(planId!),
  })
}
export function useSavePlanPrices() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ planId, prices }: { planId: string; prices: PlanPriceInput[] }) =>
      platformService.savePlanPrices(planId, prices),
    onSuccess: invalidate,
  })
}
export function useUpdateSubscription() {
  const invalidate = useInvalidateAll()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      id: string
      orgId: string
      action: string
      patch: Parameters<typeof platformService.updateSubscription>[1]
    }) => platformService.updateSubscription(args.id, args.patch, args.orgId, args.action),
    // Same reasoning as useSetOrganizationStatus above — this is the other
    // direction of the same sync, and had the same gap: the firm side's
    // cached subscription never got told to refetch.
    onSuccess: () => {
      invalidate()
      void qc.invalidateQueries({ queryKey: ['administration', 'subscription'] })
    },
  })
}

export function useReviewManualPayment() {
  const invalidate = useInvalidateAll()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { subscriptionId: string; action: 'verify_and_activate' | 'reject' }) =>
      platformService.reviewManualPayment(args.subscriptionId, args.action),
    onSuccess: () => {
      invalidate()
      void qc.invalidateQueries({ queryKey: ['administration', 'subscription'] })
    },
  })
}
