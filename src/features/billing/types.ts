import type { BadgeProps } from '@/shared/components/ui/badge'
import type {
  Client,
  Expense,
  ExpenseReceipt,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Matter,
  Payment,
  Profile,
  TimeEntry,
  TimeEntryStatus,
} from '@/shared/types/database.types'

export interface TimeEntryRow extends TimeEntry {
  matter: Pick<Matter, 'id' | 'title' | 'matter_number'> | null
  user: Pick<Profile, 'id' | 'full_name'> | null
  created_by_profile: Pick<Profile, 'id' | 'full_name'> | null
  updated_by_profile: Pick<Profile, 'id' | 'full_name'> | null
}
export interface ExpenseRow extends Expense {
  matter: Pick<Matter, 'id' | 'title' | 'matter_number'> | null
  user: Pick<Profile, 'id' | 'full_name'> | null
  created_by_profile: Pick<Profile, 'id' | 'full_name'> | null
  updated_by_profile: Pick<Profile, 'id' | 'full_name'> | null
  receipts: ExpenseReceipt[]
  invoice: Pick<Invoice, 'id' | 'invoice_number'> | null
}
export interface InvoiceRow extends Invoice {
  client: Pick<Client, 'id' | 'display_name'> | null
  matter: Pick<Matter, 'id' | 'matter_number'> | null
}
export interface PaymentRow extends Payment {
  created_by_profile: Pick<Profile, 'id' | 'full_name'> | null
  client: Pick<Client, 'id' | 'display_name'> | null
  matter: Pick<Matter, 'id' | 'title' | 'matter_number'> | null
  invoice: Pick<Invoice, 'id' | 'invoice_number' | 'total' | 'amount_paid'> | null
}
export interface InvoiceDetail extends InvoiceRow {
  items: InvoiceItem[]
  payments: PaymentRow[]
}

export interface BillingStats {
  unbilledValue: number
  invoiced: number
  collected: number
  outstanding: number
  billableHoursMTD: number
  revenueMTD: number
  paymentsReceivedMTD: number
  unpaidInvoicesCount: number
  overdueCount: number
}

/** A single member's own numbers — shown to users without `reports.financial`. */
export interface PersonalStats {
  billableHoursMTD: number
  unbilledValue: number
  expensesMTD: number
  openTasks: number
}

export interface ClientFinancialSummary {
  totalInvoiced: number
  totalPaid: number
  outstanding: number
  overdueCount: number
  recentInvoices: InvoiceRow[]
  recentPayments: PaymentRow[]
}

export interface MatterFinancialSummary {
  invoiced: number
  collected: number
  outstanding: number
  expenses: number
  unbilledTime: number
  unbilledExpenses: number
}

/** Professional Fee / Retainer / Time / Expense / Other Charge — invoice_items.kind
 * is a plain text column (0016), never a checked enum, so new kinds like these need
 * no schema change; only labels/ordering for the UI live here. */
export const INVOICE_ITEM_KIND_META: Record<string, { label: string }> = {
  professional_fee: { label: 'Professional Fee' },
  retainer: { label: 'Retainer' },
  time: { label: 'Time' },
  expense: { label: 'Expense' },
  other: { label: 'Other Charge' },
  manual: { label: 'Other Charge' },
}
export const MANUAL_ITEM_KINDS = ['professional_fee', 'retainer', 'other'] as const
export type ManualItemKind = (typeof MANUAL_ITEM_KINDS)[number]

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; variant: BadgeProps['variant'] }> = {
  draft: { label: 'Draft', variant: 'muted' },
  sent: { label: 'Sent', variant: 'warning' },
  partial: { label: 'Partially Paid', variant: 'warning' },
  paid: { label: 'Paid', variant: 'success' },
  void: { label: 'Voided', variant: 'muted' },
}

/** Overdue is a computed badge, not a stored status — sent/partial past due_date. */
export function isInvoiceOverdue(invoice: Pick<Invoice, 'status' | 'due_date'>): boolean {
  if (invoice.status !== 'sent' && invoice.status !== 'partial') return false
  if (!invoice.due_date) return false
  return new Date(invoice.due_date) < new Date(new Date().toDateString())
}

export const INVOICE_EDITABLE_STATUS: InvoiceStatus = 'draft'
export const PAYABLE_INVOICE_STATUSES: InvoiceStatus[] = ['sent', 'partial']

export const EXPENSE_CATEGORIES = ['Filing fees', 'Travel', 'Courier', 'Printing', 'Expert fees', 'Other'] as const

export const TIME_ENTRY_STATUS_META: Record<TimeEntryStatus, { label: string; variant: BadgeProps['variant'] }> = {
  draft: { label: 'Draft', variant: 'muted' },
  submitted: { label: 'Submitted', variant: 'warning' },
  approved: { label: 'Approved', variant: 'default' },
  invoiced: { label: 'Invoiced', variant: 'secondary' },
  paid: { label: 'Paid', variant: 'success' },
}

export const EDITABLE_TIME_ENTRY_STATUSES: TimeEntryStatus[] = ['draft', 'submitted', 'approved']
export const LOCKED_TIME_ENTRY_STATUSES: TimeEntryStatus[] = ['invoiced', 'paid']

export function timeAmount(minutes: number, rate: number): number {
  return Math.round((minutes / 60) * rate * 100) / 100
}
