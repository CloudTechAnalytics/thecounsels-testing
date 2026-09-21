import { supabase } from '@/shared/lib/supabase'
import type { MatterStatus } from '@/shared/types/database.types'
import type { MatterFormValues } from '@/features/matters/schemas'
import {
  MATTER_STATUS_FILTER_GROUPS,
  type MatterAssignmentRow,
  type MatterEventRow,
  type MatterNoteRow,
  type MatterRow,
  type MatterSummary,
} from '@/features/matters/types'

const MATTER_SELECT =
  '*, client:clients(id, display_name, type), lead_lawyer:profiles!matters_lead_lawyer_id_fkey(id, full_name, avatar_url), responsible_partner:profiles!matters_responsible_partner_id_fkey(id, full_name, avatar_url)'

export interface MatterFilters {
  search?: string
  status?: MatterStatus | 'all'
  practiceArea?: string | 'all'
  clientId?: string
  branchId?: string
}

function toRow(values: MatterFormValues) {
  return {
    title: values.title.trim(),
    client_id: values.clientId || null,
    practice_area: values.practiceArea || null,
    status: values.status,
    priority: values.priority,
    lead_lawyer_id: values.leadLawyerId || null,
    responsible_partner_id: values.responsiblePartnerId || null,
    opposing_counsel: values.opposingCounsel?.trim() || null,
    court: values.court?.trim() || null,
    judge: values.judge?.trim() || null,
    description: values.description?.trim() || null,
    branch_id: values.branchId || null,
  }
}

export const mattersService = {
  async list(organizationId: string, filters: MatterFilters = {}): Promise<MatterRow[]> {
    let q = supabase
      .from('matters')
      .select(MATTER_SELECT)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (filters.status && filters.status !== 'all') {
      const group = MATTER_STATUS_FILTER_GROUPS[filters.status]
      q = group ? q.in('status', group) : q.eq('status', filters.status)
    }
    if (filters.practiceArea && filters.practiceArea !== 'all') q = q.eq('practice_area', filters.practiceArea)
    if (filters.clientId) q = q.eq('client_id', filters.clientId)
    if (filters.branchId) q = q.eq('branch_id', filters.branchId)
    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`
      q = q.or(`title.ilike.${s},matter_number.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as MatterRow[]
  },

  async get(id: string): Promise<MatterRow> {
    const { data, error } = await supabase.from('matters').select(MATTER_SELECT).eq('id', id).single()
    if (error) throw error
    return data as unknown as MatterRow
  },

  async create(organizationId: string, values: MatterFormValues, createdBy: string | null): Promise<MatterRow> {
    const { data, error } = await supabase
      .from('matters')
      .insert({ organization_id: organizationId, created_by: createdBy, ...toRow(values) })
      .select(MATTER_SELECT)
      .single()
    if (error) throw error
    const row = data as unknown as MatterRow
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'matter.created',
      p_entity_type: 'matter',
      p_entity_id: row.id,
      p_summary: `Opened matter ${row.matter_number ?? ''} — ${row.title}`,
    })
    return row
  },

  async update(id: string, organizationId: string, values: MatterFormValues): Promise<MatterRow> {
    const isClosing = ['closed', 'won', 'lost'].includes(values.status)
    const patch = {
      ...toRow(values),
      closed_on: isClosing ? new Date().toISOString().slice(0, 10) : null,
    }
    const { data, error } = await supabase.from('matters').update(patch).eq('id', id).select(MATTER_SELECT).single()
    if (error) throw error
    const row = data as unknown as MatterRow
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: isClosing ? 'matter.closed' : 'matter.updated',
      p_entity_type: 'matter',
      p_entity_id: id,
      p_summary: isClosing ? `Closed matter ${row.matter_number ?? ''} — ${row.title}` : `Updated matter ${row.matter_number ?? ''}`,
    })
    return row
  },

  /** Quick status change, no full edit form — a minimal patch (not
   * update()'s full toRow() overwrite, which needs the entire form's worth
   * of fields). Only valid while the matter is NOT already closed/won/lost
   * — matters_update RLS (migration 0050) blocks any update at all once it
   * is, by design; the only way out of that state is reopen() below. The
   * caller (matter-status-menu.tsx) is responsible for routing to reopen()
   * instead when the current status is terminal — this method doesn't
   * re-check that itself, matching update()'s own lack of that guard. */
  async setStatus(id: string, organizationId: string, status: MatterStatus, matterNumber: string | null): Promise<void> {
    const isClosing = ['closed', 'won', 'lost'].includes(status)
    const { error } = await supabase
      .from('matters')
      .update({ status, closed_on: isClosing ? new Date().toISOString().slice(0, 10) : null })
      .eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: isClosing ? 'matter.closed' : 'matter.updated',
      p_entity_type: 'matter',
      p_entity_id: id,
      p_summary: isClosing ? `Closed matter ${matterNumber ?? ''}` : `Updated matter ${matterNumber ?? ''} status to ${status}`,
    })
  },

  async reopen(id: string, reason: string | undefined): Promise<void> {
    // Returns the bare matters row (no client/lead_lawyer joins) — callers
    // rely on query invalidation to refetch the full MatterRow shape.
    const { error } = await supabase.rpc('reopen_matter', { p_matter: id, p_reason: reason || null })
    if (error) throw error
  },

  async remove(id: string, organizationId: string, label: string): Promise<void> {
    const { error } = await supabase.from('matters').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'matter.deleted',
      p_entity_type: 'matter',
      p_entity_id: id,
      p_summary: `Deleted matter ${label}`,
    })
  },

  // Notes ---------------------------------------------------------------------
  async listNotes(matterId: string): Promise<MatterNoteRow[]> {
    const { data, error } = await supabase
      .from('matter_notes')
      .select(
        '*, author:profiles!matter_notes_author_id_fkey(id, full_name, avatar_url), edited_by_profile:profiles!matter_notes_edited_by_fkey(id, full_name)',
      )
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as MatterNoteRow[]
  },

  async addNote(organizationId: string, matterId: string, body: string, authorId: string | null): Promise<void> {
    const { data, error } = await supabase
      .from('matter_notes')
      .insert({ organization_id: organizationId, matter_id: matterId, author_id: authorId, body })
      .select('id')
      .single()
    if (error) throw error
    // Not a DB trigger (unlike document_added etc.) so it can carry a real
    // summary preview; matter_id in metadata lets the activity feed link back.
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'note.added',
      p_entity_type: 'matter_note',
      p_entity_id: data.id,
      p_summary: `Added a note: ${body.slice(0, 80)}`,
      p_metadata: { matter_id: matterId },
    })
  },

  async updateNote(id: string, body: string, editedBy: string | null): Promise<void> {
    const { error } = await supabase.from('matter_notes').update({ body, edited_by: editedBy }).eq('id', id)
    if (error) throw error
  },

  async deleteNote(id: string): Promise<void> {
    const { error } = await supabase.from('matter_notes').delete().eq('id', id)
    if (error) throw error
  },

  // Tracking timeline ---------------------------------------------------------
  async listEvents(matterId: string): Promise<MatterEventRow[]> {
    const { data, error } = await supabase
      .from('matter_events')
      .select('*, actor:profiles(id, full_name, avatar_url)')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as MatterEventRow[]
  },

  async addEvent(organizationId: string, matterId: string, summary: string, actorId: string | null): Promise<void> {
    const { error } = await supabase
      .from('matter_events')
      .insert({ organization_id: organizationId, matter_id: matterId, actor_id: actorId, kind: 'update', summary })
    if (error) throw error
  },

  // Team assignments ------------------------------------------------------
  async listAssignments(matterId: string): Promise<MatterAssignmentRow[]> {
    // matter_assignments has TWO foreign keys into profiles (user_id AND
    // assigned_by) — the embed must name which one, or PostgREST can't
    // resolve it and errors with "more than one relationship was found".
    // That error was never surfaced anywhere in the UI (no error state on
    // this query), so assigning someone silently kept showing "No one
    // else is assigned" even though the row was really being written.
    const { data, error } = await supabase
      .from('matter_assignments')
      .select('*, user:profiles!matter_assignments_user_id_fkey(id, full_name, avatar_url)')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as MatterAssignmentRow[]
  },

  /** Every team-assignment row across the whole org, in one query — powers
   * "active matters" on the Lawyers & Staff roster, which used to only
   * count matters someone LED (lead_lawyer_id), always 0 for support
   * staff (paralegals, litigation clerks, secretaries) who are genuinely
   * assigned to a matter's team but never its lead. */
  async listAllAssignments(organizationId: string): Promise<{ matter_id: string; user_id: string }[]> {
    const { data, error } = await supabase
      .from('matter_assignments')
      .select('matter_id, user_id')
      .eq('organization_id', organizationId)
    if (error) throw error
    return data ?? []
  },

  async assignMember(organizationId: string, matterId: string, userId: string, assignedBy: string | null): Promise<void> {
    const { error } = await supabase
      .from('matter_assignments')
      .insert({ organization_id: organizationId, matter_id: matterId, user_id: userId, assigned_by: assignedBy })
    if (error) throw error
  },

  async unassignMember(matterId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('matter_assignments').delete().eq('matter_id', matterId).eq('user_id', userId)
    if (error) throw error
  },

  // Summary widget --------------------------------------------------------
  async getSummary(matterId: string): Promise<MatterSummary> {
    const [docs, notes, hearings, tasks, invoices, time, expenses] = await Promise.all([
      supabase.from('documents').select('id', { count: 'exact', head: true }).eq('matter_id', matterId),
      supabase.from('matter_notes').select('id', { count: 'exact', head: true }).eq('matter_id', matterId),
      supabase.from('hearings').select('hearing_at, status').eq('matter_id', matterId),
      supabase.from('tasks').select('status').eq('matter_id', matterId),
      supabase.from('invoices').select('id, total, amount_paid, status, issue_date').eq('matter_id', matterId),
      supabase.from('time_entries').select('minutes, rate, invoiced').eq('matter_id', matterId).eq('billable', true),
      supabase.from('expenses').select('amount, invoiced').eq('matter_id', matterId).eq('billable', true),
    ])
    for (const r of [docs, notes, hearings, tasks, invoices, time, expenses]) if (r.error) throw r.error

    const hearingRows = hearings.data ?? []
    const taskRows = tasks.data ?? []
    // Excludes both void AND draft — a real, previously-inconsistent gap
    // found while auditing billing (draft invoices were counting toward
    // this matter's "Invoiced"/"Outstanding"/"Amount paid" figures, the
    // same bug class that caused the Billing dashboard's own Revenue MTD
    // to read ₦1M off two unsent drafts). Matches billing.service.ts's
    // getStats()/getClientFinancialSummary() "issued invoices only" rule.
    const invoiceRows = (invoices.data ?? []).filter((i) => i.status !== 'void' && i.status !== 'draft')
    const timeRows = time.data ?? []
    const expenseRows = expenses.data ?? []

    let lastPaymentDate: string | null = null
    const invoiceIds = invoiceRows.map((i) => i.id)
    if (invoiceIds.length > 0) {
      const { data: lastPayment, error: payErr } = await supabase
        .from('payments')
        .select('paid_at')
        .in('invoice_id', invoiceIds)
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (payErr) throw payErr
      lastPaymentDate = lastPayment?.paid_at ?? null
    }

    const invoiceDates = invoiceRows.map((i) => i.issue_date).sort()

    // Unbilled Time + Unbilled Expenses = Total Unbilled Work — same shape as
    // billing.service.ts's org/personal getStats()/getPersonalStats(), scoped
    // to this one matter and kept fresh automatically: every mutation that
    // touches these rows (log/edit/delete time or expenses, generate/void an
    // invoice) invalidates the ['matter-summary'] query.
    const unbilledTime = timeRows
      .filter((t) => !t.invoiced)
      .reduce((s, t) => s + Math.round((t.minutes / 60) * Number(t.rate) * 100) / 100, 0)
    const unbilledExpenses = expenseRows.filter((e) => !e.invoiced).reduce((s, e) => s + Number(e.amount), 0)

    return {
      documents: docs.count ?? 0,
      notes: notes.count ?? 0,
      hearings: hearingRows.length,
      upcomingHearings: hearingRows.filter((h) => h.status === 'scheduled' && new Date(h.hearing_at) > new Date()).length,
      tasks: taskRows.length,
      openTasks: taskRows.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length,
      invoicesCount: invoiceRows.length,
      invoicesTotal: invoiceRows.reduce((s, i) => s + Number(i.total), 0),
      invoicesOutstanding: invoiceRows.reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0),
      professionalFees: timeRows.reduce((s, t) => s + Math.round((t.minutes / 60) * Number(t.rate) * 100) / 100, 0),
      expensesTotal: expenseRows.reduce((s, e) => s + Number(e.amount), 0),
      amountPaid: invoiceRows.reduce((s, i) => s + Number(i.amount_paid), 0),
      lastInvoiceDate: invoiceDates.length > 0 ? invoiceDates[invoiceDates.length - 1] : null,
      lastPaymentDate,
      unbilledTime,
      unbilledExpenses,
      totalUnbilledWork: unbilledTime + unbilledExpenses,
    }
  },
}
