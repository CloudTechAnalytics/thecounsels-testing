import { supabase } from '@/shared/lib/supabase'
import type { InvoiceStatus, TimeEntryStatus } from '@/shared/types/database.types'
import { storageQuotaService, storageLimitMessage } from '@/shared/services/storage-quota.service'
import { formatStorage } from '@/shared/lib/format'
import {
  timeAmount,
  type BillingStats,
  type ClientFinancialSummary,
  type ExpenseRow,
  type InvoiceDetail,
  type InvoiceRow,
  type MatterFinancialSummary,
  type PaymentRow,
  type PersonalStats,
  type TimeEntryRow,
} from '@/features/billing/types'
import type {
  ExpenseFormValues,
  GenerateInvoiceFormValues,
  InvoiceItemFormValues,
  PaymentFormValues,
  TimeEntryFormValues,
  UpdateInvoiceDraftFormValues,
} from '@/features/billing/schemas'

const TIME_SELECT =
  '*, matter:matters(id, title, matter_number), user:profiles!time_entries_user_id_fkey(id, full_name), created_by_profile:profiles!time_entries_created_by_fkey(id, full_name), updated_by_profile:profiles!time_entries_updated_by_fkey(id, full_name)'
const EXP_SELECT =
  '*, matter:matters(id, title, matter_number), user:profiles!expenses_user_id_fkey(id, full_name), created_by_profile:profiles!expenses_created_by_fkey(id, full_name), updated_by_profile:profiles!expenses_updated_by_fkey(id, full_name), receipts:expense_receipts(*), invoice:invoices(id, invoice_number)'
const RECEIPTS_BUCKET = 'receipts'
const INV_SELECT = '*, client:clients(id, display_name), matter:matters(id, matter_number)'
const PAYMENT_SELECT =
  '*, created_by_profile:profiles!payments_created_by_fkey(id, full_name), client:clients(id, display_name), matter:matters(id, title, matter_number), invoice:invoices(id, invoice_number, total, amount_paid)'

export interface TimeEntryFilters {
  search?: string
  status?: TimeEntryStatus | 'all'
  matterId?: string | 'all'
  clientId?: string | 'all'
  billable?: 'all' | 'yes' | 'no'
  dateFrom?: string
  dateTo?: string
}
export interface TimeEntryPage {
  rows: TimeEntryRow[]
  total: number
}
export const TIME_ENTRIES_PAGE_SIZE = 25

export const billingService = {
  // Time entries --------------------------------------------------------------
  async listTimeEntries(
    organizationId: string,
    filters: TimeEntryFilters = {},
    pagination?: { page: number; pageSize: number },
  ): Promise<TimeEntryPage> {
    // client isn't a direct column on time_entries — resolve via its matters first.
    let matterIds: string[] | null = null
    if (filters.clientId && filters.clientId !== 'all') {
      const { data, error } = await supabase
        .from('matters')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('client_id', filters.clientId)
      if (error) throw error
      matterIds = (data ?? []).map((m) => m.id)
      if (matterIds.length === 0) return { rows: [], total: 0 }
    }

    let q = supabase
      .from('time_entries')
      .select(TIME_SELECT, { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('work_date', { ascending: false })
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    if (filters.matterId && filters.matterId !== 'all') q = q.eq('matter_id', filters.matterId)
    if (matterIds) q = q.in('matter_id', matterIds)
    if (filters.billable === 'yes') q = q.eq('billable', true)
    else if (filters.billable === 'no') q = q.eq('billable', false)
    if (filters.dateFrom) q = q.gte('work_date', filters.dateFrom)
    if (filters.dateTo) q = q.lte('work_date', filters.dateTo)
    if (filters.search?.trim()) q = q.ilike('description', `%${filters.search.trim()}%`)

    if (pagination) {
      const from = (pagination.page - 1) * pagination.pageSize
      q = q.range(from, from + pagination.pageSize - 1)
    } else {
      // Export path: fetch the full filtered set, capped well above realistic firm volume.
      q = q.range(0, 9999)
    }

    const { data, error, count } = await q
    if (error) throw error
    return { rows: (data ?? []) as unknown as TimeEntryRow[], total: count ?? 0 }
  },
  async addTimeEntry(organizationId: string, v: TimeEntryFormValues, userId: string | null): Promise<void> {
    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        organization_id: organizationId,
        matter_id: v.matterId || null,
        user_id: userId,
        work_date: v.workDate,
        minutes: Math.round(v.hours * 60),
        rate: v.rate,
        description: v.description.trim(),
        billable: v.billable,
        status: v.status,
      })
      .select('id')
      .single()
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'time_entry.created',
      p_entity_type: 'time_entry',
      p_entity_id: data.id,
      p_summary: `Logged time: ${v.description.trim()}`,
    })
  },
  async updateTimeEntry(id: string, organizationId: string, v: TimeEntryFormValues): Promise<void> {
    const { error } = await supabase
      .from('time_entries')
      .update({
        matter_id: v.matterId || null,
        work_date: v.workDate,
        minutes: Math.round(v.hours * 60),
        rate: v.rate,
        description: v.description.trim(),
        billable: v.billable,
        status: v.status,
      })
      .eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'time_entry.updated',
      p_entity_type: 'time_entry',
      p_entity_id: id,
      p_summary: `Updated time entry: ${v.description.trim()}`,
    })
  },
  async reopenTimeEntry(id: string, organizationId: string): Promise<void> {
    const { error } = await supabase.from('time_entries').update({ status: 'approved' }).eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'time_entry.reopened',
      p_entity_type: 'time_entry',
      p_entity_id: id,
      p_summary: 'Reopened a locked time entry',
    })
  },
  async deleteTimeEntry(id: string, organizationId: string): Promise<void> {
    const { error } = await supabase.from('time_entries').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'time_entry.deleted',
      p_entity_type: 'time_entry',
      p_entity_id: id,
      p_summary: 'Deleted a time entry',
    })
  },

  // Expenses ------------------------------------------------------------------
  /** status defaults to 'unbilled' — the Unbilled Expenses list's existing behavior, preserved. */
  async listExpenses(organizationId: string, status: 'unbilled' | 'billed' | 'all' = 'unbilled'): Promise<ExpenseRow[]> {
    let q = supabase.from('expenses').select(EXP_SELECT).eq('organization_id', organizationId)
    if (status === 'unbilled') q = q.eq('invoiced', false)
    else if (status === 'billed') q = q.eq('invoiced', true)
    const { data, error } = await q.order('expense_date', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as ExpenseRow[]
  },
  async addExpense(organizationId: string, v: ExpenseFormValues, userId: string | null): Promise<void> {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        organization_id: organizationId,
        matter_id: v.matterId || null,
        user_id: userId,
        expense_date: v.expenseDate,
        amount: v.amount,
        description: v.description.trim(),
        category: v.category || null,
        billable: v.billable,
      })
      .select('id')
      .single()
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'expense.created',
      p_entity_type: 'expense',
      p_entity_id: data.id,
      p_summary: `Logged expense: ${v.description.trim()}`,
    })
  },
  /** Blocked server-side (RLS) when the expense is invoiced; this client check is just faster/friendlier feedback. */
  async updateExpense(id: string, organizationId: string, v: ExpenseFormValues, invoiced: boolean): Promise<void> {
    if (invoiced) throw new Error('This expense has been invoiced and can no longer be edited.')
    const { error } = await supabase
      .from('expenses')
      .update({
        matter_id: v.matterId || null,
        expense_date: v.expenseDate,
        amount: v.amount,
        description: v.description.trim(),
        category: v.category || null,
        billable: v.billable,
      })
      .eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'expense.updated',
      p_entity_type: 'expense',
      p_entity_id: id,
      p_summary: `Updated expense: ${v.description.trim()}`,
    })
  },
  async deleteExpense(id: string, organizationId: string): Promise<void> {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'expense.deleted',
      p_entity_type: 'expense',
      p_entity_id: id,
      p_summary: 'Deleted an expense',
    })
  },

  // Receipts --------------------------------------------------------------------
  async uploadReceipt(params: {
    organizationId: string
    expenseId: string
    matterId?: string | null
    file: File
    uploadedBy: string | null
  }): Promise<void> {
    const { organizationId, expenseId, matterId, file, uploadedBy } = params

    const availability = await storageQuotaService.checkAvailability(organizationId, file.size)
    if (!availability.allowed) {
      throw new Error(storageLimitMessage(availability.usedBytes, availability.limitBytes, formatStorage))
    }

    const folder = matterId || 'general'
    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-120)
    const path = `${organizationId}/${folder}/${crypto.randomUUID()}-${safeName}`

    const { error: upErr } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (upErr) throw upErr

    const { error } = await supabase.from('expense_receipts').insert({
      organization_id: organizationId,
      expense_id: expenseId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: uploadedBy,
    })
    if (error) {
      await supabase.storage.from(RECEIPTS_BUCKET).remove([path])
      throw error
    }
  },
  /** Replace = remove the old file then upload the new one under the same expense. */
  async replaceReceipt(
    params: { organizationId: string; expenseId: string; matterId?: string | null; file: File; uploadedBy: string | null },
    oldReceipt: { id: string; storage_path: string },
  ): Promise<void> {
    await billingService.uploadReceipt(params)
    await supabase.storage.from(RECEIPTS_BUCKET).remove([oldReceipt.storage_path])
    await supabase.from('expense_receipts').delete().eq('id', oldReceipt.id)
  },
  async removeReceipt(receipt: { id: string; storage_path: string }): Promise<void> {
    await supabase.storage.from(RECEIPTS_BUCKET).remove([receipt.storage_path])
    const { error } = await supabase.from('expense_receipts').delete().eq('id', receipt.id)
    if (error) throw error
  },
  async receiptSignedUrl(path: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, expiresIn)
    if (error) throw error
    return data.signedUrl
  },

  // Invoices ------------------------------------------------------------------
  async listInvoices(organizationId: string): Promise<InvoiceRow[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select(INV_SELECT)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as InvoiceRow[]
  },
  async getInvoice(id: string): Promise<InvoiceDetail> {
    const [{ data: inv, error: e1 }, { data: items, error: e2 }, { data: payments, error: e3 }] = await Promise.all([
      supabase.from('invoices').select(INV_SELECT).eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at', { ascending: true }),
      supabase.from('payments').select(PAYMENT_SELECT).eq('invoice_id', id).order('paid_at', { ascending: false }),
    ])
    if (e1) throw e1
    if (e2) throw e2
    if (e3) throw e3
    return { ...(inv as unknown as InvoiceRow), items: items ?? [], payments: (payments ?? []) as unknown as InvoiceDetail['payments'] }
  },
  async generateInvoice(organizationId: string, v: GenerateInvoiceFormValues): Promise<string> {
    const { data, error } = await supabase.rpc('generate_invoice', {
      p_org: organizationId,
      p_client: v.clientId,
      p_matter: v.matterId || null,
      p_due_date: v.dueDate || null,
      p_tax_rate: v.taxRate,
      // undefined (not passed) would fall back to the RPC's own default of
      // "sweep every unbilled item for this client/matter" — the dialog
      // always sends its own explicit selection instead, even an empty
      // array, so "generate a fixed-fee invoice with nothing swept in" is
      // a real, reachable choice, not just what happens to be true today.
      p_time_entry_ids: v.timeEntryIds,
      p_expense_ids: v.expenseIds,
      p_manual_items: v.manualItems.map((m) => ({
        kind: m.kind,
        description: m.description,
        quantity: m.quantity,
        unit: m.unit || null,
        rate: m.rate,
        amount: m.quantity * m.rate,
      })),
    })
    if (error) throw error
    return (data as { id: string }).id
  },
  /** Unbilled billable time/expenses for a specific client (optionally
   * narrowed to one matter) — the picker Generate Invoice shows so a firm
   * chooses what goes on an invoice instead of everything unbilled being
   * swept in blind. */
  async listUnbilledForClient(organizationId: string, clientId: string, matterId?: string | null): Promise<{ time: TimeEntryRow[]; expenses: ExpenseRow[] }> {
    const { data: matterRows, error: mErr } = matterId
      ? { data: [{ id: matterId }], error: null }
      : await supabase.from('matters').select('id').eq('organization_id', organizationId).eq('client_id', clientId)
    if (mErr) throw mErr
    const matterIds = (matterRows ?? []).map((m) => m.id)
    if (matterIds.length === 0) return { time: [], expenses: [] }

    const [time, exp] = await Promise.all([
      supabase.from('time_entries').select(TIME_SELECT).eq('organization_id', organizationId).eq('billable', true).eq('invoiced', false).in('matter_id', matterIds).order('work_date', { ascending: false }),
      supabase.from('expenses').select(EXP_SELECT).eq('organization_id', organizationId).eq('billable', true).eq('invoiced', false).in('matter_id', matterIds).order('expense_date', { ascending: false }),
    ])
    if (time.error) throw time.error
    if (exp.error) throw exp.error
    return { time: (time.data ?? []) as unknown as TimeEntryRow[], expenses: (exp.data ?? []) as unknown as ExpenseRow[] }
  },
  async setInvoiceStatus(id: string, status: InvoiceStatus, organizationId: string, voidReason?: string): Promise<void> {
    const { error } = await supabase
      .from('invoices')
      .update(status === 'void' ? { status, void_reason: voidReason ?? null } : { status })
      .eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: `invoice.${status}`,
      p_entity_type: 'invoice',
      p_entity_id: id,
      p_summary: status === 'void' ? `Voided invoice — reason: ${voidReason ?? ''}` : `Invoice marked ${status}`,
    })
  },
  /** Deletes an invoice of any status (Managing Partner only, via invoices.manage). */
  async deleteInvoice(id: string, organizationId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_invoice', { p_invoice: id })
    if (error) throw error
    // delete_invoice() already logs its own audit entry server-side.
    void organizationId
  },

  // Draft line items ------------------------------------------------------------
  async addInvoiceItem(organizationId: string, invoiceId: string, v: InvoiceItemFormValues): Promise<void> {
    const { error } = await supabase.from('invoice_items').insert({
      organization_id: organizationId,
      invoice_id: invoiceId,
      kind: 'manual',
      description: v.description.trim(),
      quantity: v.quantity,
      unit: v.unit || null,
      rate: v.rate,
      amount: Math.round(v.quantity * v.rate * 100) / 100,
    })
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'invoice.item_added',
      p_entity_type: 'invoice',
      p_entity_id: invoiceId,
      p_summary: `Added line item: ${v.description.trim()}`,
    })
  },
  async updateInvoiceItem(itemId: string, invoiceId: string, organizationId: string, v: InvoiceItemFormValues): Promise<void> {
    const { error } = await supabase
      .from('invoice_items')
      .update({
        description: v.description.trim(),
        quantity: v.quantity,
        unit: v.unit || null,
        rate: v.rate,
        amount: Math.round(v.quantity * v.rate * 100) / 100,
      })
      .eq('id', itemId)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'invoice.item_updated',
      p_entity_type: 'invoice',
      p_entity_id: invoiceId,
      p_summary: `Updated line item: ${v.description.trim()}`,
    })
  },
  async removeInvoiceItem(itemId: string, invoiceId: string, organizationId: string, description: string): Promise<void> {
    const { error } = await supabase.from('invoice_items').delete().eq('id', itemId)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'invoice.item_removed',
      p_entity_type: 'invoice',
      p_entity_id: invoiceId,
      p_summary: `Removed line item: ${description}`,
    })
  },
  async updateInvoiceDraft(id: string, organizationId: string, v: UpdateInvoiceDraftFormValues): Promise<void> {
    const { error } = await supabase
      .from('invoices')
      .update({
        due_date: v.dueDate || null,
        discount: v.discount,
        tax_rate: v.taxRate,
        notes: v.notes || null,
      })
      .eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'invoice.updated',
      p_entity_type: 'invoice',
      p_entity_id: id,
      p_summary: 'Updated invoice details',
    })
  },

  // Payments ------------------------------------------------------------------
  async addPayment(organizationId: string, invoiceId: string, v: PaymentFormValues, userId: string | null): Promise<void> {
    // Friendly pre-check ahead of the DB's own unique index (uq_payments_
    // invoice_reference, 0169) — that index is the real, race-safe
    // guarantee; this just turns a raw 23505 constraint violation into a
    // clear message before the round-trip even happens, for the common case.
    if (v.reference?.trim()) {
      const { data: existing, error: checkErr } = await supabase
        .from('payments')
        .select('id, payment_number')
        .eq('invoice_id', invoiceId)
        .eq('reference', v.reference.trim())
        .maybeSingle()
      if (checkErr) throw checkErr
      if (existing) {
        throw new Error(`Reference "${v.reference.trim()}" was already used for payment ${existing.payment_number} on this invoice.`)
      }
    }
    const { data, error } = await supabase
      .from('payments')
      .insert({
        organization_id: organizationId,
        invoice_id: invoiceId,
        amount: v.amount,
        method: v.method || null,
        reference: v.reference?.trim() || null,
        notes: v.notes || null,
        paid_at: v.paidAt,
        created_by: userId,
      })
      .select('id, payment_number, receipt_number')
      .single()
    if (error) {
      // Race-condition backstop — two people submitting the same reference
      // at the same instant would both pass the pre-check above.
      if (error.code === '23505' && error.message.includes('reference')) {
        throw new Error('This payment reference has already been used for this invoice.')
      }
      throw error
    }
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'payment.recorded',
      p_entity_type: 'invoice',
      p_entity_id: invoiceId,
      p_summary: `Recorded payment ${data.payment_number} (Receipt ${data.receipt_number}) of ${v.amount}`,
      p_metadata: { payment_id: data.id, method: v.method ?? null, reference: v.reference ?? null },
    })
  },
  async listPayments(organizationId: string): Promise<PaymentRow[]> {
    const { data, error } = await supabase
      .from('payments')
      .select(PAYMENT_SELECT)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as PaymentRow[]
  },
  async getPayment(id: string): Promise<PaymentRow> {
    const { data, error } = await supabase.from('payments').select(PAYMENT_SELECT).eq('id', id).single()
    if (error) throw error
    return data as unknown as PaymentRow
  },
  /** Managing Partner only (payments.void) — RLS enforces this too; this is the faster/friendlier client-side check. */
  async updatePayment(id: string, organizationId: string, v: PaymentFormValues): Promise<void> {
    const { data, error } = await supabase
      .from('payments')
      .update({
        amount: v.amount,
        method: v.method || null,
        reference: v.reference || null,
        notes: v.notes || null,
        paid_at: v.paidAt,
      })
      .eq('id', id)
      .select('payment_number')
      .single()
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'payment.updated',
      p_entity_type: 'invoice',
      p_entity_id: id,
      p_summary: `Edited payment ${data.payment_number}`,
    })
  },
  async voidPayment(id: string, organizationId: string, paymentNumber: string): Promise<void> {
    const { error } = await supabase.from('payments').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'payment.deleted',
      p_entity_type: 'invoice',
      p_entity_id: id,
      p_summary: `Deleted payment ${paymentNumber}`,
    })
  },

  // Dashboard -----------------------------------------------------------------
  /** branchId, when given, scopes every figure to matters in that branch —
   * time entries/expenses/invoices/payments all reach their branch only
   * through matter_id, so a matter-less record (no matter attached at all)
   * is necessarily excluded from a specific-branch view; it still counts
   * under "All branches" (branchId omitted). Resolving matterIds first,
   * then filtering each query by it, mirrors the existing clientId-scoping
   * pattern in listTimeEntries above — no new SQL function needed for this. */
  async getStats(organizationId: string, branchId?: string | null): Promise<BillingStats> {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const monthStartStr = monthStart.toISOString().slice(0, 10)

    let branchMatterIds: string[] | null = null
    if (branchId) {
      const { data, error } = await supabase.from('matters').select('id').eq('organization_id', organizationId).eq('branch_id', branchId)
      if (error) throw error
      branchMatterIds = (data ?? []).map((m) => m.id)
      if (branchMatterIds.length === 0) {
        return {
          unbilledValue: 0, invoiced: 0, collected: 0, outstanding: 0, billableHoursMTD: 0,
          revenueMTD: 0, paymentsReceivedMTD: 0, unpaidInvoicesCount: 0, overdueCount: 0,
        }
      }
    }

    let timeQ = supabase.from('time_entries').select('minutes, rate, billable, invoiced, work_date').eq('organization_id', organizationId)
    let expQ = supabase.from('expenses').select('amount, billable, invoiced').eq('organization_id', organizationId)
    let invQ = supabase.from('invoices').select('id, total, amount_paid, status, issue_date, due_date').eq('organization_id', organizationId)
    if (branchMatterIds) {
      timeQ = timeQ.in('matter_id', branchMatterIds)
      expQ = expQ.in('matter_id', branchMatterIds)
      invQ = invQ.in('matter_id', branchMatterIds)
    }

    const [time, exp, inv] = await Promise.all([timeQ, expQ, invQ])

    const timeRows = time.data ?? []
    const expRows = exp.data ?? []
    const invRows = inv.data ?? []
    const todayStr = new Date().toISOString().slice(0, 10)

    // Payments are scoped by invoice, not matter directly — filter by the
    // same branch-scoped invoice set above rather than a second matter join.
    let payQ = supabase.from('payments').select('amount, paid_at, invoice_id').eq('organization_id', organizationId).gte('paid_at', monthStartStr)
    if (branchMatterIds) payQ = payQ.in('invoice_id', invRows.map((i) => i.id))
    const { data: payData, error: payErr } = await payQ
    if (payErr) throw payErr
    const payRows = payData ?? []

    const unbilledTime = timeRows.filter((t) => t.billable && !t.invoiced).reduce((s, t) => s + timeAmount(t.minutes, Number(t.rate)), 0)
    const unbilledExp = expRows.filter((e) => e.billable && !e.invoiced).reduce((s, e) => s + Number(e.amount), 0)
    const nonVoid = invRows.filter((i) => i.status !== 'void' && i.status !== 'draft')
    const invoiced = nonVoid.reduce((s, i) => s + Number(i.total), 0)
    const collected = nonVoid.reduce((s, i) => s + Number(i.amount_paid), 0)
    const billableMinutesMTD = timeRows.filter((t) => t.billable && t.work_date >= monthStartStr).reduce((s, t) => s + t.minutes, 0)
    // Revenue = actual money received, not invoice totals — must reconcile
    // with Payments Received MTD by construction (same source query), not
    // just by coincidence. This was the real bug: the old version summed
    // invoice.total for anything issued this month, INCLUDING drafts
    // (status !== 'void' let drafts through), which is how two ₦500,000
    // draft invoices turned into a ₦1M "Revenue" with zero actual payments.
    const paymentsReceivedMTD = payRows.reduce((s, p) => s + Number(p.amount), 0)
    const revenueMTD = paymentsReceivedMTD
    const unpaid = invRows.filter((i) => i.status === 'sent' || i.status === 'partial')

    return {
      unbilledValue: unbilledTime + unbilledExp,
      invoiced,
      collected,
      outstanding: invoiced - collected,
      billableHoursMTD: Math.round((billableMinutesMTD / 60) * 10) / 10,
      revenueMTD,
      paymentsReceivedMTD,
      unpaidInvoicesCount: unpaid.length,
      overdueCount: unpaid.filter((i) => i.due_date && i.due_date < todayStr).length,
    }
  },

  /** One member's own numbers — the non-financial alternative to getStats. */
  async getPersonalStats(organizationId: string, userId: string): Promise<PersonalStats> {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const monthStartStr = monthStart.toISOString().slice(0, 10)

    const [time, exp, tasks] = await Promise.all([
      supabase
        .from('time_entries')
        .select('minutes, rate, billable, invoiced, work_date')
        .eq('organization_id', organizationId)
        .eq('user_id', userId),
      supabase
        .from('expenses')
        .select('amount, billable, invoiced, expense_date')
        .eq('organization_id', organizationId)
        .eq('user_id', userId),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('assignee_id', userId)
        .not('status', 'in', '(done,cancelled)'),
    ])
    if (time.error) throw time.error
    if (exp.error) throw exp.error
    if (tasks.error) throw tasks.error

    const timeRows = time.data ?? []
    const expRows = exp.data ?? []
    const billableMinutesMTD = timeRows.filter((t) => t.billable && t.work_date >= monthStartStr).reduce((s, t) => s + t.minutes, 0)
    const unbilledTime = timeRows.filter((t) => t.billable && !t.invoiced).reduce((s, t) => s + timeAmount(t.minutes, Number(t.rate)), 0)
    const unbilledExp = expRows.filter((e) => e.billable && !e.invoiced).reduce((s, e) => s + Number(e.amount), 0)
    const expensesMTD = expRows.filter((e) => e.expense_date >= monthStartStr).reduce((s, e) => s + Number(e.amount), 0)

    return {
      billableHoursMTD: Math.round((billableMinutesMTD / 60) * 10) / 10,
      unbilledValue: unbilledTime + unbilledExp,
      expensesMTD,
      openTasks: tasks.count ?? 0,
    }
  },

  // Financial summaries ---------------------------------------------------------
  /** §19 — Total Invoiced/Paid/Outstanding/Overdue for one client, reconciled
   * from the same invoice rows the numbers are derived from (never a
   * separately-maintained total that could drift). Draft/void invoices are
   * excluded from Invoiced, same "issued only" rule getStats() uses. */
  async getClientFinancialSummary(organizationId: string, clientId: string): Promise<ClientFinancialSummary> {
    const { data: invRows, error: invErr } = await supabase
      .from('invoices')
      .select(INV_SELECT)
      .eq('organization_id', organizationId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (invErr) throw invErr
    const invoices = (invRows ?? []) as unknown as InvoiceRow[]
    const nonVoid = invoices.filter((i) => i.status !== 'void' && i.status !== 'draft')
    const todayStr = new Date().toISOString().slice(0, 10)

    const { data: payRows, error: payErr } = await supabase
      .from('payments')
      .select(PAYMENT_SELECT)
      .eq('organization_id', organizationId)
      .eq('client_id', clientId)
      .order('paid_at', { ascending: false })
      .limit(10)
    if (payErr) throw payErr

    const totalInvoiced = nonVoid.reduce((s, i) => s + Number(i.total), 0)
    const totalPaid = nonVoid.reduce((s, i) => s + Number(i.amount_paid), 0)

    return {
      totalInvoiced,
      totalPaid,
      outstanding: totalInvoiced - totalPaid,
      overdueCount: nonVoid.filter((i) => (i.status === 'sent' || i.status === 'partial') && i.due_date && i.due_date < todayStr).length,
      recentInvoices: invoices.slice(0, 10),
      recentPayments: (payRows ?? []) as unknown as PaymentRow[],
    }
  },

  /** §20 — same reconciliation, scoped to one matter instead of a whole client. */
  async getMatterFinancialSummary(organizationId: string, matterId: string): Promise<MatterFinancialSummary> {
    const [invRes, expRes, timeRes] = await Promise.all([
      supabase.from('invoices').select('total, amount_paid, status').eq('organization_id', organizationId).eq('matter_id', matterId),
      supabase.from('expenses').select('amount, billable, invoiced').eq('organization_id', organizationId).eq('matter_id', matterId),
      supabase.from('time_entries').select('minutes, rate, billable, invoiced').eq('organization_id', organizationId).eq('matter_id', matterId),
    ])
    if (invRes.error) throw invRes.error
    if (expRes.error) throw expRes.error
    if (timeRes.error) throw timeRes.error

    const nonVoid = (invRes.data ?? []).filter((i) => i.status !== 'void' && i.status !== 'draft')
    const invoiced = nonVoid.reduce((s, i) => s + Number(i.total), 0)
    const collected = nonVoid.reduce((s, i) => s + Number(i.amount_paid), 0)
    const expenses = (expRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0)
    const unbilledExpenses = (expRes.data ?? []).filter((e) => e.billable && !e.invoiced).reduce((s, e) => s + Number(e.amount), 0)
    const unbilledTime = (timeRes.data ?? [])
      .filter((t) => t.billable && !t.invoiced)
      .reduce((s, t) => s + timeAmount(t.minutes, Number(t.rate)), 0)

    return { invoiced, collected, outstanding: invoiced - collected, expenses, unbilledTime, unbilledExpenses }
  },
}
