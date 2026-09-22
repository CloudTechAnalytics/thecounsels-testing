import { supabase } from '@/shared/lib/supabase'
import { administrationService } from '@/features/administration/services/administration.service'
import { storageQuotaService, storageLimitMessage } from '@/shared/services/storage-quota.service'
import { formatStorage } from '@/shared/lib/format'
import type { Database } from '@/shared/types/database.types'
import type {
  Employee, Department, JobTitle, LeaveType, LeaveBalanceRow, LeaveRequestRow, HrRequestRow, HrDocumentRow, StaffProfileRow,
  OnboardingTemplate, OnboardingItem, OnboardingProgress, HrAnnouncementRow, LeaveSummaryRow,
} from '@/features/hr/types'

/** employment_status values that mean "this person shouldn't have
 * workspace access right now" — synced to memberships.status = 'suspended'.
 * 'on_leave' is deliberately excluded: leave doesn't imply access should be
 * cut (they may still need to check messages, approve things, etc.). */
const NO_ACCESS_EMPLOYMENT_STATUSES = new Set(['suspended', 'terminated', 'resigned', 'former_employee'])
/** Setting employment_status back to one of these reactivates access if it
 * was suspended by the sync above. */
const REGAINS_ACCESS_EMPLOYMENT_STATUSES = new Set(['active', 'onboarding', 'applicant'])

export const hrService = {
  /** Merges the firm's existing member list (memberships+profiles+roles,
   * already used everywhere else in the app) with staff_profiles' HR
   * fields — a member with no staff_profiles row yet still shows up, just
   * without HR details filled in. */
  async listEmployees(organizationId: string): Promise<Employee[]> {
    const [members, { data: profiles, error: profErr }, { data: departments }, { data: jobTitles }] = await Promise.all([
      administrationService.listMembers(organizationId),
      supabase.from('staff_profiles').select('*').eq('organization_id', organizationId),
      supabase.from('departments').select('id, name').eq('organization_id', organizationId),
      supabase.from('job_titles').select('id, name').eq('organization_id', organizationId),
    ])
    if (profErr) throw profErr

    const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id, p as StaffProfileRow]))
    const deptById = new Map((departments ?? []).map((d) => [d.id, d.name]))
    const titleById = new Map((jobTitles ?? []).map((t) => [t.id, t.name]))
    const nameByUser = new Map(members.map((m) => [m.user_id, m.profile?.full_name ?? m.profile?.email ?? null]))

    return members
      .filter((m) => m.status === 'active' || m.status === 'suspended')
      .map((m) => {
        const p = profileByUser.get(m.user_id) ?? null
        return {
          userId: m.user_id,
          fullName: m.profile?.full_name ?? null,
          email: m.profile?.email ?? '',
          avatarUrl: m.profile?.avatar_url ?? null,
          roleName: m.role?.name ?? null,
          membershipStatus: m.status,
          profile: p,
          departmentName: p?.department_id ? deptById.get(p.department_id) ?? null : null,
          jobTitleName: p?.job_title_id ? titleById.get(p.job_title_id) ?? null : null,
          managerName: p?.manager_id ? nameByUser.get(p.manager_id) ?? null : null,
        }
      })
  },

  /** employment_status (this function's patch) is an HR record label —
   * memberships.status is the actual sign-in/workspace-access gate
   * everything else (RLS, is_org_member, etc.) checks. Those two used to
   * be fully decoupled: HR could mark someone "Suspended" here and the
   * person could still log in and use the app, because nothing ever wrote
   * to `memberships`. Real gap reported after HR suspended an employee
   * and access wasn't actually revoked — this keeps them in sync for the
   * statuses where the intent is unambiguous, without touching the org
   * owner's own access (mirrors the safety rule members-panel.tsx uses
   * for suspend/remove — an accidental employment-status edit should
   * never be able to lock out the one guaranteed-access account). */
  async updateEmployeeProfile(organizationId: string, userId: string, patch: Partial<StaffProfileRow>): Promise<{ accessChange: 'suspended' | 'active' | null }> {
    const { error } = await supabase
      .from('staff_profiles')
      .upsert({ organization_id: organizationId, user_id: userId, ...patch }, { onConflict: 'organization_id,user_id' })
    if (error) throw error

    let accessChange: 'suspended' | 'active' | null = null
    if (patch.employment_status) {
      const desired = NO_ACCESS_EMPLOYMENT_STATUSES.has(patch.employment_status) ? 'suspended'
        : REGAINS_ACCESS_EMPLOYMENT_STATUSES.has(patch.employment_status) ? 'active'
        : null
      if (desired) {
        const { data: membership, error: memReadErr } = await supabase
          .from('memberships')
          .select('id, status, is_owner')
          .eq('organization_id', organizationId)
          .eq('user_id', userId)
          .maybeSingle()
        if (memReadErr) throw memReadErr
        if (membership && !membership.is_owner && membership.status !== desired) {
          const { error: memErr } = await supabase.from('memberships').update({ status: desired }).eq('id', membership.id)
          if (memErr) throw memErr
          accessChange = desired
          await supabase.rpc('log_audit', {
            p_org: organizationId,
            p_action: desired === 'suspended' ? 'member.suspended' : 'member.reactivated',
            p_entity_type: 'membership',
            p_entity_id: membership.id,
            p_summary: desired === 'suspended'
              ? `Suspended workspace access (employment status set to ${patch.employment_status})`
              : `Reactivated workspace access (employment status set to ${patch.employment_status})`,
          })
        }
      }
    }

    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'employee.updated',
      p_entity_type: 'staff_profile',
      p_entity_id: userId,
      p_summary: 'Updated an employee profile',
    })
    return { accessChange }
  },

  // ---- Departments ----
  async listDepartments(organizationId: string): Promise<Department[]> {
    const { data, error } = await supabase.from('departments').select('*').eq('organization_id', organizationId).order('name')
    if (error) throw error
    return data ?? []
  },
  async createDepartment(organizationId: string, name: string): Promise<void> {
    const { error } = await supabase.from('departments').insert({ organization_id: organizationId, name })
    if (error) throw error
  },
  async deleteDepartment(id: string): Promise<void> {
    const { error } = await supabase.from('departments').delete().eq('id', id)
    if (error) throw error
  },

  // ---- Job titles ----
  async listJobTitles(organizationId: string): Promise<JobTitle[]> {
    const { data, error } = await supabase.from('job_titles').select('*').eq('organization_id', organizationId).order('name')
    if (error) throw error
    return data ?? []
  },
  async createJobTitle(organizationId: string, name: string): Promise<void> {
    const { error } = await supabase.from('job_titles').insert({ organization_id: organizationId, name })
    if (error) throw error
  },
  async deleteJobTitle(id: string): Promise<void> {
    const { error } = await supabase.from('job_titles').delete().eq('id', id)
    if (error) throw error
  },

  // ---- Leave ----
  async listLeaveTypes(organizationId: string): Promise<LeaveType[]> {
    const { data, error } = await supabase.from('leave_types').select('*').eq('organization_id', organizationId).order('name')
    if (error) throw error
    return data ?? []
  },
  async createLeaveType(organizationId: string, name: string, defaultEntitlementDays: number): Promise<void> {
    const { error } = await supabase
      .from('leave_types')
      .insert({ organization_id: organizationId, name, default_entitlement_days: defaultEntitlementDays })
    if (error) throw error
  },
  async updateLeaveTypeLimit(id: string, defaultEntitlementDays: number): Promise<void> {
    const { error } = await supabase.from('leave_types').update({ default_entitlement_days: defaultEntitlementDays }).eq('id', id)
    if (error) throw error
  },
  async listMyLeaveRequests(organizationId: string, userId: string): Promise<(LeaveRequestRow & { reviewer_name: string | null })[]> {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*, reviewer:profiles!leave_requests_reviewed_by_fkey(full_name)')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return ((data ?? []) as unknown as Array<LeaveRequestRow & { reviewer: { full_name: string | null } | null }>).map((r) => ({
      ...r,
      reviewer_name: r.reviewer?.full_name ?? null,
    }))
  },
  /** Every leave request in the org — for approvers (leave.manage). */
  async listAllLeaveRequests(organizationId: string): Promise<(LeaveRequestRow & { requester_name: string | null; reviewer_name: string | null })[]> {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*, requester:profiles!leave_requests_user_id_fkey(full_name), reviewer:profiles!leave_requests_reviewed_by_fkey(full_name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return ((data ?? []) as unknown as Array<
      LeaveRequestRow & { requester: { full_name: string | null } | null; reviewer: { full_name: string | null } | null }
    >).map((r) => ({
      ...r,
      requester_name: r.requester?.full_name ?? null,
      reviewer_name: r.reviewer?.full_name ?? null,
    }))
  },
  /** Cheap count-only query for the sidebar badge — no rows fetched. */
  async pendingLeaveCount(organizationId: string): Promise<number> {
    const { count, error } = await supabase
      .from('leave_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
    if (error) throw error
    return count ?? 0
  },
  /** Unread HR announcement notifications for the calling user — RLS on
   * notifications already scopes to user_id = auth.uid(), so this is
   * naturally "my unread announcements", no explicit user filter needed. */
  async unreadAnnouncementCount(organizationId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('entity_type', 'hr_announcement')
      .eq('is_read', false)
    if (error) throw error
    return count ?? 0
  },
  async myLeaveBalances(organizationId: string, userId: string): Promise<LeaveBalanceRow[]> {
    const year = new Date().getFullYear()
    const { data, error } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('year', year)
    if (error) throw error
    return data ?? []
  },
  /** Every configured leave type for the year, not just ones already
   * touched by an approved request — a type with zero usage still needs
   * to show its full Limit/Balance, not disappear from the picture. */
  async myLeaveSummary(organizationId: string, userId: string): Promise<LeaveSummaryRow[]> {
    const year = new Date().getFullYear()
    const [{ data: types, error: typesErr }, { data: balances, error: balErr }] = await Promise.all([
      supabase.from('leave_types').select('id, name, default_entitlement_days').eq('organization_id', organizationId).order('name'),
      supabase.from('leave_balances').select('leave_type_id, entitlement_days, used_days').eq('organization_id', organizationId).eq('user_id', userId).eq('year', year),
    ])
    if (typesErr) throw typesErr
    if (balErr) throw balErr
    const balanceByType = new Map((balances ?? []).map((b) => [b.leave_type_id, b]))
    return (types ?? []).map((t) => {
      const b = balanceByType.get(t.id)
      const limit = b?.entitlement_days ?? t.default_entitlement_days
      const taken = b?.used_days ?? 0
      return { leaveTypeId: t.id, name: t.name, limit, taken, balance: limit - taken }
    })
  },
  async requestLeave(organizationId: string, leaveTypeId: string, start: string, end: string, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('request_leave', {
      p_org: organizationId,
      p_leave_type: leaveTypeId,
      p_start: start,
      p_end: end,
      p_reason: reason ?? null,
    })
    if (error) throw error
  },
  async reviewLeaveRequest(requestId: string, approve: boolean, comment?: string): Promise<void> {
    const { error } = await supabase.rpc('review_leave_request', { p_request: requestId, p_approve: approve, p_comment: comment ?? null })
    if (error) throw error
  },
  async cancelLeaveRequest(requestId: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_leave_request', { p_request: requestId })
    if (error) throw error
  },

  // ---- HR Requests ----
  async listMyHrRequests(organizationId: string, userId: string): Promise<HrRequestRow[]> {
    const { data, error } = await supabase
      .from('hr_requests')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },
  async listAllHrRequests(organizationId: string): Promise<(HrRequestRow & { requester_name: string | null })[]> {
    const { data, error } = await supabase
      .from('hr_requests')
      .select('*, requester:profiles!hr_requests_user_id_fkey(full_name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return ((data ?? []) as unknown as Array<HrRequestRow & { requester: { full_name: string | null } | null }>).map((r) => ({
      ...r,
      requester_name: r.requester?.full_name ?? null,
    }))
  },
  async submitHrRequest(organizationId: string, userId: string, requestType: string, subject: string, details?: string): Promise<void> {
    const { error } = await supabase
      .from('hr_requests')
      .insert({ organization_id: organizationId, user_id: userId, request_type: requestType, subject, details: details || null })
    if (error) throw error
  },
  async updateHrRequestStatus(requestId: string, status: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc('update_hr_request_status', { p_request: requestId, p_status: status, p_note: note ?? null })
    if (error) throw error
  },

  // ---- HR Documents ----
  async listMyHrDocuments(organizationId: string, userId: string): Promise<HrDocumentRow[]> {
    const { data, error } = await supabase
      .from('hr_employee_documents')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },
  async listEmployeeHrDocuments(organizationId: string, userId: string): Promise<HrDocumentRow[]> {
    return this.listMyHrDocuments(organizationId, userId)
  },
  async uploadHrDocument(params: {
    organizationId: string
    userId: string
    file: File
    category: string
    uploadedBy: string | null
  }): Promise<void> {
    const { organizationId, userId, file, category, uploadedBy } = params

    const availability = await storageQuotaService.checkAvailability(organizationId, file.size)
    if (!availability.allowed) {
      throw new Error(storageLimitMessage(availability.usedBytes, availability.limitBytes, formatStorage))
    }

    const path = `${organizationId}/${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
    const { error: upErr } = await supabase.storage.from('hr-documents').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (upErr) throw upErr
    const { error } = await supabase.from('hr_employee_documents').insert({
      organization_id: organizationId,
      user_id: userId,
      category,
      display_name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: uploadedBy,
    })
    if (error) {
      await supabase.storage.from('hr-documents').remove([path])
      throw error
    }
  },
  async getHrDocumentUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from('hr-documents').createSignedUrl(path, 300)
    if (error) throw error
    return data.signedUrl
  },
  async deleteHrDocument(id: string, storagePath: string): Promise<void> {
    await supabase.storage.from('hr-documents').remove([storagePath])
    const { error } = await supabase.from('hr_employee_documents').delete().eq('id', id)
    if (error) throw error
  },

  // ---- Onboarding ----
  async listOnboardingTemplates(organizationId: string): Promise<OnboardingTemplate[]> {
    const { data, error } = await supabase.from('onboarding_templates').select('*').eq('organization_id', organizationId).order('name')
    if (error) throw error
    return data ?? []
  },
  async createOnboardingTemplate(organizationId: string, name: string, items: OnboardingItem[]): Promise<void> {
    const { error } = await supabase
      .from('onboarding_templates')
      .insert({ organization_id: organizationId, name, items: items as unknown as Database['public']['Tables']['onboarding_templates']['Insert']['items'] })
    if (error) throw error
  },
  /** Blocked by the FK (`employee_onboarding.template_id ... on delete
   * restrict`) once a template has actually been assigned to someone —
   * that's deliberate, so history stays intact; the caller surfaces a
   * friendly message for that case instead of a raw DB error. */
  async deleteOnboardingTemplate(id: string): Promise<void> {
    const { error } = await supabase.from('onboarding_templates').delete().eq('id', id)
    if (error) throw error
  },
  async assignOnboarding(organizationId: string, userId: string, templateId: string): Promise<void> {
    const { error } = await supabase.rpc('assign_onboarding', { p_org: organizationId, p_user: userId, p_template: templateId })
    if (error) throw error
  },
  /** Removes the assignment AND the real tasks it generated — leaving
   * those tasks behind with no checklist to explain them would just be a
   * new version of the same confusion this module keeps running into. */
  async unassignOnboarding(onboardingId: string): Promise<void> {
    const { error } = await supabase.rpc('unassign_onboarding', { p_onboarding_id: onboardingId })
    if (error) throw error
  },
  /** "6/9 completed" for whichever onboarding checklist(s) an employee has
   * been assigned — derived live from the real linked tasks, no separate
   * progress counter to keep in sync. */
  async getEmployeeOnboardingProgress(organizationId: string, userId: string): Promise<OnboardingProgress[]> {
    const { data: assignments, error } = await supabase
      .from('employee_onboarding')
      .select('*, template:onboarding_templates(name)')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
    if (error) throw error
    const list = (assignments ?? []) as unknown as Array<{ id: string; template: { name: string } | null } & Record<string, unknown>>
    if (list.length === 0) return []

    const { data: links, error: linksErr } = await supabase
      .from('onboarding_task_links')
      .select('employee_onboarding_id, task:tasks(status)')
      .in('employee_onboarding_id', list.map((a) => a.id))
    if (linksErr) throw linksErr
    const linkRows = (links ?? []) as unknown as Array<{ employee_onboarding_id: string; task: { status: string } | null }>

    return list.map((a) => {
      const rows = linkRows.filter((l) => l.employee_onboarding_id === a.id)
      return {
        onboarding: a as unknown as OnboardingProgress['onboarding'],
        templateName: a.template?.name ?? 'Onboarding',
        total: rows.length,
        done: rows.filter((r) => r.task?.status === 'done').length,
      }
    })
  },
  /** Every onboarding assignment across the whole firm, with employee name
   * attached — the tracking view HR actually needs, not just a per-person
   * fragment buried in one profile at a time. */
  async listAllOnboarding(organizationId: string): Promise<(OnboardingProgress & { employeeName: string })[]> {
    const { data: assignments, error } = await supabase
      .from('employee_onboarding')
      .select('*, template:onboarding_templates(name), employee:profiles!employee_onboarding_user_id_fkey(full_name, email)')
      .eq('organization_id', organizationId)
      .order('assigned_at', { ascending: false })
    if (error) throw error
    const list = (assignments ?? []) as unknown as Array<
      { id: string; template: { name: string } | null; employee: { full_name: string | null; email: string } | null } & Record<string, unknown>
    >
    if (list.length === 0) return []

    const { data: links, error: linksErr } = await supabase
      .from('onboarding_task_links')
      .select('employee_onboarding_id, task:tasks(status)')
      .in('employee_onboarding_id', list.map((a) => a.id))
    if (linksErr) throw linksErr
    const linkRows = (links ?? []) as unknown as Array<{ employee_onboarding_id: string; task: { status: string } | null }>

    return list.map((a) => {
      const rows = linkRows.filter((l) => l.employee_onboarding_id === a.id)
      return {
        onboarding: a as unknown as OnboardingProgress['onboarding'],
        templateName: a.template?.name ?? 'Onboarding',
        employeeName: a.employee?.full_name ?? a.employee?.email ?? 'Someone',
        total: rows.length,
        done: rows.filter((r) => r.task?.status === 'done').length,
      }
    })
  },

  // ---- Announcements ----
  async listAnnouncements(organizationId: string): Promise<HrAnnouncementRow[]> {
    const { data, error } = await supabase
      .from('hr_announcements')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },
  async sendAnnouncement(params: {
    organizationId: string
    title: string
    body: string
    audienceType: string
    departmentId?: string
    userIds?: string[]
    branch?: string
    roleKey?: string
  }): Promise<void> {
    const { organizationId, title, body, audienceType, departmentId, userIds, branch, roleKey } = params
    const { error } = await supabase.rpc('send_hr_announcement', {
      p_org: organizationId,
      p_title: title,
      p_body: body,
      p_audience_type: audienceType,
      p_department_id: departmentId ?? null,
      p_user_ids: userIds ?? null,
      p_branch: branch ?? null,
      p_role_key: (roleKey as Database['public']['Functions']['send_hr_announcement']['Args']['p_role_key']) ?? null,
    })
    if (error) throw error
  },
  /** Title/body only — audience isn't editable after the fact, since
   * notifications already went out to the original recipients. */
  async updateAnnouncement(id: string, values: { title: string; body: string }): Promise<void> {
    const { error } = await supabase.from('hr_announcements').update(values).eq('id', id)
    if (error) throw error
  },
  async deleteAnnouncement(id: string): Promise<void> {
    const { error } = await supabase.from('hr_announcements').delete().eq('id', id)
    if (error) throw error
  },
}
