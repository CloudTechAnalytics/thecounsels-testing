import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hrService } from '@/features/hr/services/hr.service'
import { supabase } from '@/shared/lib/supabase'
import type { StaffProfileRow } from '@/features/hr/types'
import { useInvalidateStorageUsage } from '@/shared/hooks/use-storage-quota'

export function useEmployees(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'employees', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listEmployees(organizationId!),
  })
}

export function useUpdateEmployeeProfile(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, patch }: { userId: string; patch: Partial<StaffProfileRow> }) =>
      hrService.updateEmployeeProfile(organizationId!, userId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'employees', organizationId] })
      // An employment-status change may have also flipped memberships.status
      // (see hrService.updateEmployeeProfile) — keep the other member lists
      // that read from that table in sync too.
      qc.invalidateQueries({ queryKey: ['administration', 'members', organizationId] })
      qc.invalidateQueries({ queryKey: ['firm-members', organizationId] })
    },
  })
}

export function useDepartments(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'departments', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listDepartments(organizationId!),
  })
}

export function useCreateDepartment(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => hrService.createDepartment(organizationId!, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'departments', organizationId] }),
  })
}

export function useDeleteDepartment(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => hrService.deleteDepartment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'departments', organizationId] }),
  })
}

export function useJobTitles(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'job-titles', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listJobTitles(organizationId!),
  })
}

export function useCreateJobTitle(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => hrService.createJobTitle(organizationId!, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'job-titles', organizationId] }),
  })
}

export function useDeleteJobTitle(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => hrService.deleteJobTitle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'job-titles', organizationId] }),
  })
}

export function useLeaveTypes(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'leave-types', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listLeaveTypes(organizationId!),
  })
}

export function useCreateLeaveType(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, days }: { name: string; days: number }) => hrService.createLeaveType(organizationId!, name, days),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'leave-types', organizationId] }),
  })
}

export function useUpdateLeaveTypeLimit(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) => hrService.updateLeaveTypeLimit(id, days),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'leave-types', organizationId] }),
  })
}

export function useMyLeaveRequests(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'my-leave', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.listMyLeaveRequests(organizationId!, userId!),
  })
}

export function useAllLeaveRequests(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'all-leave', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listAllLeaveRequests(organizationId!),
  })
}

export function useMyLeaveBalances(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'leave-balances', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.myLeaveBalances(organizationId!, userId!),
  })
}

export function useMyLeaveSummary(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'leave-summary', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.myLeaveSummary(organizationId!, userId!),
  })
}

function useInvalidateLeave(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['hr', 'my-leave', organizationId] })
    qc.invalidateQueries({ queryKey: ['hr', 'all-leave', organizationId] })
    qc.invalidateQueries({ queryKey: ['hr', 'leave-balances', organizationId] })
    qc.invalidateQueries({ queryKey: ['hr', 'leave-summary', organizationId] })
    qc.invalidateQueries({ queryKey: ['hr', 'pending-leave-count', organizationId] })
  }
}

export function usePendingLeaveCount(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'pending-leave-count', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.pendingLeaveCount(organizationId!),
  })
}

export function useUnreadAnnouncementCount(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'unread-announcement-count', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.unreadAnnouncementCount(organizationId!),
  })
}

/** Keeps the sidebar's Announcements badge live — mount once, high in the
 * HR shell, same relationship useLeaveBadgeRealtime has with HrLayout.
 * Unlike Leave (approvers only), announcements go to everyone, so this
 * isn't permission-gated. */
export function useAnnouncementBadgeRealtime(organizationId: string | null) {
  const qc = useQueryClient()
  React.useEffect(() => {
    if (!organizationId) return
    const channel = supabase
      .channel(`announcement-badge:${organizationId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `organization_id=eq.${organizationId}` },
        () => qc.invalidateQueries({ queryKey: ['hr', 'unread-announcement-count', organizationId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [organizationId, qc])
}

/** Keeps the sidebar's Leave badge live regardless of which page is open —
 * mount once, high in the HR shell (HrLayout), same relationship
 * useMessagingBadgeRealtime has with OrganizationLayout. */
export function useLeaveBadgeRealtime(organizationId: string | null) {
  const qc = useQueryClient()
  React.useEffect(() => {
    if (!organizationId) return
    const channel = supabase
      .channel(`leave-badge:${organizationId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests', filter: `organization_id=eq.${organizationId}` },
        () => qc.invalidateQueries({ queryKey: ['hr', 'pending-leave-count', organizationId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [organizationId, qc])
}

export function useRequestLeave(organizationId: string | null) {
  const invalidate = useInvalidateLeave(organizationId)
  return useMutation({
    mutationFn: ({ leaveTypeId, start, end, reason }: { leaveTypeId: string; start: string; end: string; reason?: string }) =>
      hrService.requestLeave(organizationId!, leaveTypeId, start, end, reason),
    onSuccess: invalidate,
  })
}

export function useReviewLeaveRequest(organizationId: string | null) {
  const invalidate = useInvalidateLeave(organizationId)
  return useMutation({
    mutationFn: ({ id, approve, comment }: { id: string; approve: boolean; comment?: string }) =>
      hrService.reviewLeaveRequest(id, approve, comment),
    onSuccess: invalidate,
  })
}

export function useCancelLeaveRequest(organizationId: string | null) {
  const invalidate = useInvalidateLeave(organizationId)
  return useMutation({
    mutationFn: (id: string) => hrService.cancelLeaveRequest(id),
    onSuccess: invalidate,
  })
}

export function useMyHrRequests(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'my-requests', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.listMyHrRequests(organizationId!, userId!),
  })
}

export function useAllHrRequests(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'all-requests', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listAllHrRequests(organizationId!),
  })
}

function useInvalidateHrRequests(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['hr', 'my-requests', organizationId] })
    qc.invalidateQueries({ queryKey: ['hr', 'all-requests', organizationId] })
  }
}

export function useSubmitHrRequest(organizationId: string | null, userId: string | null) {
  const invalidate = useInvalidateHrRequests(organizationId)
  return useMutation({
    mutationFn: ({ requestType, subject, details }: { requestType: string; subject: string; details?: string }) =>
      hrService.submitHrRequest(organizationId!, userId!, requestType, subject, details),
    onSuccess: invalidate,
  })
}

export function useUpdateHrRequestStatus(organizationId: string | null) {
  const invalidate = useInvalidateHrRequests(organizationId)
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      hrService.updateHrRequestStatus(id, status, note),
    onSuccess: invalidate,
  })
}

export function useMyHrDocuments(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'my-documents', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.listMyHrDocuments(organizationId!, userId!),
  })
}

export function useEmployeeHrDocuments(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'employee-documents', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.listEmployeeHrDocuments(organizationId!, userId!),
  })
}

export function useUploadHrDocument(organizationId: string | null, uploadedBy: string | null) {
  const qc = useQueryClient()
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return useMutation({
    mutationFn: (params: { userId: string; file: File; category: string }) =>
      hrService.uploadHrDocument({ organizationId: organizationId!, uploadedBy, ...params }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['hr', 'employee-documents', organizationId, vars.userId] })
      qc.invalidateQueries({ queryKey: ['hr', 'my-documents', organizationId, vars.userId] })
      invalidateStorage()
    },
  })
}

export function useDeleteHrDocument(organizationId: string | null) {
  const qc = useQueryClient()
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return useMutation({
    mutationFn: ({ id, storagePath }: { id: string; storagePath: string; userId: string }) => hrService.deleteHrDocument(id, storagePath),
    onSuccess: (_d, vars) => {
      invalidateStorage()
      qc.invalidateQueries({ queryKey: ['hr', 'employee-documents', organizationId, vars.userId] })
      qc.invalidateQueries({ queryKey: ['hr', 'my-documents', organizationId, vars.userId] })
    },
  })
}

export function useOnboardingTemplates(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'onboarding-templates', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listOnboardingTemplates(organizationId!),
  })
}

export function useCreateOnboardingTemplate(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, items }: { name: string; items: import('@/features/hr/types').OnboardingItem[] }) =>
      hrService.createOnboardingTemplate(organizationId!, name, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'onboarding-templates', organizationId] }),
  })
}

export function useDeleteOnboardingTemplate(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => hrService.deleteOnboardingTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'onboarding-templates', organizationId] }),
  })
}

export function useAssignOnboarding(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, templateId }: { userId: string; templateId: string }) =>
      hrService.assignOnboarding(organizationId!, userId, templateId),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['hr', 'onboarding-progress', organizationId, vars.userId] })
      qc.invalidateQueries({ queryKey: ['hr', 'all-onboarding', organizationId] })
    },
  })
}

export function useUnassignOnboarding(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (onboardingId: string) => hrService.unassignOnboarding(onboardingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'all-onboarding', organizationId] })
      // Broad prefix match (no userId) — clears every cached employee's
      // progress, not just whichever one happened to be viewed last.
      qc.invalidateQueries({ queryKey: ['hr', 'onboarding-progress'] })
    },
  })
}

/** Keeps onboarding progress live: completing a linked task in the Tasks
 * module doesn't otherwise tell the Onboarding page anything happened
 * (30s staleTime, no window-focus refetch) — this is what makes "3/5
 * completed" actually update while the page is open. */
export function useOnboardingTaskRealtime(organizationId: string | null) {
  const qc = useQueryClient()
  React.useEffect(() => {
    if (!organizationId) return
    const channel = supabase
      .channel(`onboarding-tasks:${organizationId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `organization_id=eq.${organizationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['hr', 'all-onboarding', organizationId] })
          qc.invalidateQueries({ queryKey: ['hr', 'onboarding-progress'] })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [organizationId, qc])
}

export function useEmployeeOnboardingProgress(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['hr', 'onboarding-progress', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => hrService.getEmployeeOnboardingProgress(organizationId!, userId!),
  })
}

export function useAllOnboarding(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'all-onboarding', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listAllOnboarding(organizationId!),
  })
}

export function useAnnouncements(organizationId: string | null) {
  return useQuery({
    queryKey: ['hr', 'announcements', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => hrService.listAnnouncements(organizationId!),
  })
}

export function useSendAnnouncement(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { title: string; body: string; audienceType: string; departmentId?: string; userIds?: string[]; branch?: string; roleKey?: string }) =>
      hrService.sendAnnouncement({ organizationId: organizationId!, ...params }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'announcements', organizationId] }),
  })
}

export function useUpdateAnnouncement(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: { title: string; body: string } }) => hrService.updateAnnouncement(id, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'announcements', organizationId] }),
  })
}

export function useDeleteAnnouncement(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => hrService.deleteAnnouncement(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'announcements', organizationId] }),
  })
}
