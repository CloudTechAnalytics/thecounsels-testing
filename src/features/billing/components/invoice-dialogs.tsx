import * as React from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Printer, Loader2, Plus, Pencil, Receipt as ReceiptIcon, Trash2, X, Check } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useClients } from '@/features/clients/hooks/use-clients'
import { useMatters } from '@/features/matters/hooks/use-matters'
import {
  useGenerateInvoice,
  useUnbilledForClient,
  useInvoice,
  useSetInvoiceStatus,
  useAddPayment,
  useAddInvoiceItem,
  useUpdateInvoiceItem,
  useRemoveInvoiceItem,
  useUpdateInvoiceDraft,
  useDeleteInvoice,
} from '@/features/billing/hooks/use-billing'
import type { ManualInvoiceItemFormValues } from '@/features/billing/schemas'
import { INVOICE_STATUS_META, MANUAL_ITEM_KINDS, INVOICE_ITEM_KIND_META, isInvoiceOverdue, timeAmount } from '@/features/billing/types'
import { printInvoice } from '@/features/billing/lib/print-invoice'
import { PaymentDetailDialog } from '@/features/billing/components/payment-detail-dialog'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Badge } from '@/shared/components/ui/badge'
import { Separator } from '@/shared/components/ui/separator'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { formatNaira } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

const NONE = '__none__'
const PAYMENT_METHODS = ['Bank transfer', 'Card', 'Cash', 'Cheque']

/** One row in the "add a Professional Fee / Retainer / Other Charge" list
 * — local state only until Generate is clicked, same pattern the Assigned
 * Team checklist on matter-form-dialog.tsx uses for "apply on submit,
 * nothing exists server-side yet." */
function ManualItemForm({ onAdd }: { onAdd: (item: ManualInvoiceItemFormValues) => void }) {
  const [kind, setKind] = React.useState<ManualInvoiceItemFormValues['kind']>('professional_fee')
  const [description, setDescription] = React.useState('')
  const [amount, setAmount] = React.useState('')

  const submit = () => {
    if (!description.trim() || !Number(amount)) {
      toast.error('Describe the charge and enter an amount')
      return
    }
    onAdd({ kind, description: description.trim(), quantity: 1, rate: Number(amount) })
    setDescription(''); setAmount('')
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
      <div className="space-y-1"><Label className="text-xs">Type</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as ManualInvoiceItemFormValues['kind'])}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MANUAL_ITEM_KINDS.map((k) => <SelectItem key={k} value={k}>{INVOICE_ITEM_KIND_META[k].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[160px] flex-1 space-y-1"><Label className="text-xs">Description</Label>
        <Input className="h-9" placeholder="e.g. Professional legal fee for…" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-1"><Label className="text-xs">Amount (₦)</Label>
        <Input className="h-9 w-32" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={submit}><Plus className="h-3.5 w-3.5" /> Add</Button>
    </div>
  )
}

export function GenerateInvoiceDialog({
  open,
  onOpenChange,
  onGenerated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onGenerated: (invoiceId: string) => void
}) {
  const { activeOrgId } = useAuth()
  const { data: clients } = useClients(activeOrgId, {})
  const { data: matters } = useMatters(activeOrgId, {})
  const gen = useGenerateInvoice(activeOrgId)

  const [clientId, setClientId] = React.useState('')
  const [matterId, setMatterId] = React.useState('')
  const [issueDate, setIssueDate] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [taxRate, setTaxRate] = React.useState('0')
  const [selectedTimeIds, setSelectedTimeIds] = React.useState<Set<string>>(new Set())
  const [selectedExpenseIds, setSelectedExpenseIds] = React.useState<Set<string>>(new Set())
  const [manualItems, setManualItems] = React.useState<ManualInvoiceItemFormValues[]>([])

  const { data: unbilled, isLoading: unbilledLoading } = useUnbilledForClient(activeOrgId, clientId || null, matterId === NONE ? null : matterId || null)

  React.useEffect(() => {
    if (open) {
      setClientId(''); setMatterId(''); setIssueDate(''); setDueDate(''); setTaxRate('0')
      setSelectedTimeIds(new Set()); setSelectedExpenseIds(new Set()); setManualItems([])
    }
  }, [open])

  // Every unbilled item pre-checked by default the moment it loads — matches
  // the previous "sweep everything unbilled" behavior unless the firm
  // deliberately unchecks something, so nothing that used to happen
  // automatically now silently stops happening.
  React.useEffect(() => {
    if (unbilled) {
      setSelectedTimeIds(new Set(unbilled.time.map((t) => t.id)))
      setSelectedExpenseIds(new Set(unbilled.expenses.map((e) => e.id)))
    }
  }, [unbilled])

  const toggleTime = (id: string) => setSelectedTimeIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleExpense = (id: string) => setSelectedExpenseIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const manualTotal = manualItems.reduce((s, m) => s + m.quantity * m.rate, 0)
  const timeTotal = (unbilled?.time ?? []).filter((t) => selectedTimeIds.has(t.id)).reduce((s, t) => s + timeAmount(t.minutes, Number(t.rate)), 0)
  const expenseTotal = (unbilled?.expenses ?? []).filter((e) => selectedExpenseIds.has(e.id)).reduce((s, e) => s + Number(e.amount), 0)
  const runningTotal = manualTotal + timeTotal + expenseTotal

  const submit = async () => {
    if (!clientId) {
      toast.error('Choose a client')
      return
    }
    if (runningTotal <= 0) {
      toast.error('Add at least one charge, or select some unbilled work, before generating')
      return
    }
    try {
      const id = await gen.mutateAsync({
        clientId,
        matterId: matterId === NONE ? '' : matterId,
        issueDate,
        dueDate,
        taxRate: Number(taxRate) || 0,
        timeEntryIds: Array.from(selectedTimeIds),
        expenseIds: Array.from(selectedExpenseIds),
        manualItems,
      })
      toast.success('Invoice generated')
      onOpenChange(false)
      onGenerated(id)
    } catch (err) {
      toast.error('Could not generate invoice', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const clientMatters = matters?.filter((m) => !clientId || m.client?.id === clientId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate invoice</DialogTitle>
          <DialogDescription>
            A fixed fee, retainer or other charge — with or without any time/expenses. Nothing here requires logged time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client<span className="text-destructive"> *</span></Label>
              <Select value={clientId || NONE} onValueChange={(v) => { setClientId(v === NONE ? '' : v); setMatterId('') }}>
                <SelectTrigger><SelectValue placeholder="Choose a client" /></SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Matter (optional)</Label>
              <Select value={matterId || NONE} onValueChange={setMatterId} disabled={!clientId}>
                <SelectTrigger><SelectValue placeholder="All of this client's matters" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All of this client's matters</SelectItem>
                  {clientMatters?.map((m) => <SelectItem key={m.id} value={m.id}>{m.matter_number} — {m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Professional Fee / Retainer / Other Charge</Label>
            <ManualItemForm onAdd={(item) => setManualItems((s) => [...s, item])} />
            {manualItems.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-border p-2">
                {manualItems.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="text-xs text-muted-foreground">{INVOICE_ITEM_KIND_META[m.kind].label} · </span>
                      {m.description}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-medium">{formatNaira(m.quantity * m.rate)}</span>
                      <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setManualItems((s) => s.filter((_, idx) => idx !== i))} aria-label="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {clientId && (
            <div className="space-y-2">
              <Label>Unbilled work {unbilled ? `(${(unbilled.time.length + unbilled.expenses.length)} available)` : ''}</Label>
              {unbilledLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : unbilled && (unbilled.time.length > 0 || unbilled.expenses.length > 0) ? (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {unbilled.time.map((t) => (
                    <label key={t.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50">
                      <span className="flex min-w-0 items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={selectedTimeIds.has(t.id)} onChange={() => toggleTime(t.id)} />
                        <span className="min-w-0 truncate">
                          <span className="text-xs text-muted-foreground">Time · </span>{t.description}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">{formatNaira(timeAmount(t.minutes, Number(t.rate)))}</span>
                    </label>
                  ))}
                  {unbilled.expenses.map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50">
                      <span className="flex min-w-0 items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={selectedExpenseIds.has(e.id)} onChange={() => toggleExpense(e.id)} />
                        <span className="min-w-0 truncate">
                          <span className="text-xs text-muted-foreground">Expense · </span>{e.description}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">{formatNaira(Number(e.amount))}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No unbilled time or expenses for this client/matter.</p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Issue date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} placeholder="Today" />
              <p className="text-xs text-muted-foreground">Filing in old records? Set the real date this was issued.</p>
            </div>
            <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tax rate (%)</Label><Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></div>
          </div>

          <div className="flex justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm font-medium">
            <span>Invoice total (before tax)</span>
            <span>{formatNaira(runningTotal)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={gen.isPending}>Generate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LineItemRow({
  invoiceId,
  item,
  onSaved,
}: {
  invoiceId: string
  item: { id: string; description: string; quantity: number; unit: string | null; rate: number; amount: number }
  onSaved: () => void
}) {
  const { activeOrgId } = useAuth()
  const update = useUpdateInvoiceItem(activeOrgId)
  const remove = useRemoveInvoiceItem(activeOrgId)
  const [editing, setEditing] = React.useState(false)
  const [description, setDescription] = React.useState(item.description)
  const [quantity, setQuantity] = React.useState(String(item.quantity))
  const [unit, setUnit] = React.useState(item.unit ?? '')
  const [rate, setRate] = React.useState(String(item.rate))

  const save = async () => {
    if (!description.trim() || !Number(quantity)) {
      toast.error('Enter a description and quantity')
      return
    }
    try {
      await update.mutateAsync({
        itemId: item.id,
        invoiceId,
        values: { description: description.trim(), quantity: Number(quantity), unit: unit || undefined, rate: Number(rate) || 0 },
      })
      setEditing(false)
      onSaved()
    } catch (err) {
      toast.error('Could not update line item', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const del = async () => {
    try {
      await remove.mutateAsync({ itemId: item.id, invoiceId, description: item.description })
      onSaved()
    } catch (err) {
      toast.error('Could not remove line item', { description: err instanceof Error ? err.message : undefined })
    }
  }

  if (editing) {
    return (
      <tr className="border-b border-border/60 last:border-0 bg-muted/30">
        <td className="p-1.5"><Input className="h-8" value={description} onChange={(e) => setDescription(e.target.value)} /></td>
        <td className="p-1.5">
          <div className="flex gap-1">
            <Input className="h-8 w-16 text-right" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <Input className="h-8 w-14" placeholder="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
        </td>
        <td className="p-1.5"><Input className="h-8 w-28 text-right" type="number" value={rate} onChange={(e) => setRate(e.target.value)} /></td>
        <td className="p-1.5 text-right">
          <div className="flex items-center justify-end gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} loading={update.isPending}><Check className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="group border-b border-border/60 last:border-0">
      <td className="p-2.5">{item.description}</td>
      <td className="p-2.5 text-right text-muted-foreground">{Number(item.quantity)}{item.unit ? ` ${item.unit}` : ''}</td>
      <td className="p-2.5 text-right text-muted-foreground">{formatNaira(Number(item.rate))}</td>
      <td className="p-2.5 text-right font-medium">
        <div className="flex items-center justify-end gap-2">
          {formatNaira(Number(item.amount))}
          <span className="flex opacity-0 group-hover:opacity-100">
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)} aria-label="Edit line item">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button className="ml-1 text-muted-foreground hover:text-destructive" onClick={del} aria-label="Remove line item">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      </td>
    </tr>
  )
}

function AddLineItemRow({ invoiceId, onAdded }: { invoiceId: string; onAdded: () => void }) {
  const { activeOrgId } = useAuth()
  const add = useAddInvoiceItem(activeOrgId)
  const [description, setDescription] = React.useState('')
  const [quantity, setQuantity] = React.useState('1')
  const [rate, setRate] = React.useState('0')

  const submit = async () => {
    if (!description.trim()) {
      toast.error('Describe the line item')
      return
    }
    try {
      await add.mutateAsync({ invoiceId, values: { description: description.trim(), quantity: Number(quantity) || 1, rate: Number(rate) || 0 } })
      setDescription(''); setQuantity('1'); setRate('0')
      onAdded()
    } catch (err) {
      toast.error('Could not add line item', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <tr className="border-b border-border/60 bg-muted/20 last:border-0">
      <td className="p-1.5"><Input className="h-8" placeholder="Add a line item…" value={description} onChange={(e) => setDescription(e.target.value)} /></td>
      <td className="p-1.5"><Input className="h-8 w-20 text-right" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></td>
      <td className="p-1.5"><Input className="h-8 w-28 text-right" type="number" value={rate} onChange={(e) => setRate(e.target.value)} /></td>
      <td className="p-1.5 text-right">
        <Button size="sm" variant="outline" onClick={submit} loading={add.isPending}><Plus className="h-3.5 w-3.5" /> Add</Button>
      </td>
    </tr>
  )
}

export function InvoiceDetailDialog({
  invoiceId,
  open,
  onOpenChange,
}: {
  invoiceId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId, activeMembership, profile } = useAuth()
  const { data: inv, isLoading, refetch } = useInvoice(invoiceId ?? undefined)
  const setStatus = useSetInvoiceStatus(activeOrgId)
  const addPayment = useAddPayment(activeOrgId, profile?.id ?? null)
  const updateDraft = useUpdateInvoiceDraft(activeOrgId)
  const deleteInvoice = useDeleteInvoice(activeOrgId)

  const [payAmount, setPayAmount] = React.useState('')
  const [payMethod, setPayMethod] = React.useState('')
  const [payReference, setPayReference] = React.useState('')
  const [payNotes, setPayNotes] = React.useState('')
  const [confirmPayOpen, setConfirmPayOpen] = React.useState(false)
  const [voidOpen, setVoidOpen] = React.useState(false)
  const [voidReason, setVoidReason] = React.useState('')
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [openPaymentId, setOpenPaymentId] = React.useState<string | null>(null)
  const [issueDate, setIssueDate] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [discount, setDiscount] = React.useState('0')
  const [taxRate, setTaxRate] = React.useState('0')
  const [notes, setNotes] = React.useState('')
  const [payPaidAt, setPayPaidAt] = React.useState('')

  const balance = inv ? Number(inv.total) - Number(inv.amount_paid) : 0
  const isDraft = inv?.status === 'draft'
  const canPay = inv?.status === 'sent' || inv?.status === 'partial'

  React.useEffect(() => {
    if (inv && isDraft) {
      setIssueDate(inv.issue_date ?? '')
      setDueDate(inv.due_date ?? '')
      setDiscount(String(inv.discount ?? 0))
      setTaxRate(String(inv.tax_rate ?? 0))
      setNotes(inv.notes ?? '')
    }
  }, [inv, isDraft])

  React.useEffect(() => {
    if (open) setPayPaidAt(new Date().toISOString().slice(0, 10))
  }, [open])

  const saveDraftDetails = async () => {
    if (!inv) return
    try {
      await updateDraft.mutateAsync({
        id: inv.id,
        values: { issueDate: issueDate || undefined, dueDate: dueDate || undefined, discount: Number(discount) || 0, taxRate: Number(taxRate) || 0, notes: notes || undefined },
      })
      toast.success('Invoice updated')
    } catch (err) {
      toast.error('Could not update invoice', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const openPaymentConfirm = () => {
    if (!Number(payAmount)) {
      toast.error('Enter a payment amount')
      return
    }
    // The DB guard rejects this too — this is just faster, friendlier feedback.
    if (Number(payAmount) > balance) {
      toast.error('Payment exceeds the outstanding balance', { description: `Balance due is ${formatNaira(balance)}.` })
      return
    }
    setConfirmPayOpen(true)
  }

  const recordPayment = async () => {
    if (!invoiceId) return
    try {
      await addPayment.mutateAsync({
        invoiceId,
        values: {
          amount: Number(payAmount),
          method: payMethod,
          reference: payReference || undefined,
          notes: payNotes || undefined,
          paidAt: payPaidAt || new Date().toISOString().slice(0, 10),
        },
      })
      setPayAmount(''); setPayMethod(''); setPayReference(''); setPayNotes(''); setPayPaidAt(new Date().toISOString().slice(0, 10))
      setConfirmPayOpen(false)
      toast.success('Payment recorded')
    } catch (err) {
      toast.error('Could not record payment', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const markSent = () => {
    if (!inv) return
    setStatus.mutate(
      { id: inv.id, status: 'sent' },
      {
        onError: (err) => toast.error('Could not send invoice', { description: err instanceof Error ? err.message : undefined }),
        onSuccess: () => toast.success('Invoice sent'),
      },
    )
  }

  const voidInvoice = async () => {
    if (!inv || !voidReason.trim()) return
    try {
      await setStatus.mutateAsync({ id: inv.id, status: 'void', voidReason: voidReason.trim() })
      setVoidOpen(false); setVoidReason('')
      toast.success('Invoice voided')
    } catch (err) {
      toast.error('Could not void invoice', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const confirmDelete = async () => {
    if (!inv) return
    try {
      await deleteInvoice.mutateAsync(inv.id)
      setDeleteOpen(false)
      toast.success('Invoice deleted — linked time and expenses returned to Unbilled')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not delete invoice', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const downloadPdf = () => {
    if (!inv || !activeOrgId) return
    printInvoice(inv, activeMembership?.organization.name ?? 'Your firm')
    void supabase.rpc('log_audit', {
      p_org: activeOrgId,
      p_action: 'invoice.pdf_downloaded',
      p_entity_type: 'invoice',
      p_entity_id: inv.id,
      p_summary: `Downloaded PDF for invoice ${inv.invoice_number}`,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        {isLoading || !inv ? (
          <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {inv.invoice_number}
                <Badge variant={INVOICE_STATUS_META[inv.status].variant}>{INVOICE_STATUS_META[inv.status].label}</Badge>
                {isInvoiceOverdue(inv) && <Badge variant="destructive">Overdue</Badge>}
              </DialogTitle>
              <DialogDescription>
                {inv.client?.display_name}
                {inv.matter && <> · <Link to={`/matters/${inv.matter.id}`} className="text-primary hover:underline">{inv.matter.matter_number}</Link></>}
                {' · '}Issued {format(new Date(inv.issue_date), 'PP')}
                {inv.due_date && <> · Due {format(new Date(inv.due_date), 'PP')}</>}
              </DialogDescription>
            </DialogHeader>

            {inv.status === 'void' && inv.void_reason && (
              <p className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">Reason for voiding: {inv.void_reason}</p>
            )}

            <div className="rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="p-2.5 text-left">Description</th>
                    <th className="p-2.5 text-right">Qty</th>
                    <th className="p-2.5 text-right">Rate</th>
                    <th className="p-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.length > 0 ? inv.items.map((i) => (
                    isDraft ? (
                      <LineItemRow key={i.id} invoiceId={inv.id} item={i} onSaved={() => refetch()} />
                    ) : (
                      <tr key={i.id} className="border-b border-border/60 last:border-0">
                        <td className="p-2.5">{i.description}</td>
                        <td className="p-2.5 text-right text-muted-foreground">{Number(i.quantity)}{i.unit ? ` ${i.unit}` : ''}</td>
                        <td className="p-2.5 text-right text-muted-foreground">{formatNaira(Number(i.rate))}</td>
                        <td className="p-2.5 text-right font-medium">{formatNaira(Number(i.amount))}</td>
                      </tr>
                    )
                  )) : (
                    <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No line items</td></tr>
                  )}
                  {isDraft && <AddLineItemRow invoiceId={inv.id} onAdded={() => refetch()} />}
                </tbody>
              </table>
            </div>

            {isDraft && (
              <div className="grid gap-4 rounded-lg border border-border p-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs">Issue date</Label><Input className="h-9" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} onBlur={saveDraftDetails} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Due date</Label><Input className="h-9" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} onBlur={saveDraftDetails} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Discount (₦)</Label><Input className="h-9" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} onBlur={saveDraftDetails} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Tax / VAT (%)</Label><Input className="h-9" type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} onBlur={saveDraftDetails} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveDraftDetails} /></div>
              </div>
            )}

            <div className="ml-auto w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatNaira(Number(inv.subtotal))}</span></div>
              {Number(inv.discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>−{formatNaira(Number(inv.discount))}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatNaira(Number(inv.tax))}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span>{formatNaira(Number(inv.total))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{formatNaira(Number(inv.amount_paid))}</span></div>
              <div className="flex justify-between font-medium"><span>Balance</span><span>{formatNaira(balance)}</span></div>
            </div>

            {inv.payments.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Payment history</p>
                <div className="space-y-2">
                  {inv.payments.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setOpenPaymentId(p.id)}
                      className="w-full rounded-md border border-border/60 p-2 text-left text-sm hover:border-primary/40"
                    >
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1.5">
                          <ReceiptIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {format(new Date(p.paid_at), 'PP')}{p.method ? ` · ${p.method}` : ''}
                        </span>
                        <span className="font-medium">{formatNaira(Number(p.amount))}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span>{p.payment_number}</span>
                        {p.reference && <span>Ref: {p.reference}</span>}
                        {p.created_by_profile?.full_name && <span>Recorded by {p.created_by_profile.full_name}</span>}
                        <span>{format(new Date(p.created_at), 'PPp')}</span>
                      </div>
                      {p.notes && <p className="mt-0.5 text-xs text-muted-foreground">{p.notes}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canPay && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1"><Label className="text-xs">Payment (₦)</Label><Input className="h-9 w-32" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={String(balance)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Method</Label>
                      <Select value={payMethod || NONE} onValueChange={(v) => setPayMethod(v === NONE ? '' : v)}>
                        <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Method" /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Reference (optional)</Label><Input className="h-9 w-36" value={payReference} onChange={(e) => setPayReference(e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Date paid</Label><Input className="h-9 w-36" type="date" value={payPaidAt} onChange={(e) => setPayPaidAt(e.target.value)} /></div>
                    <Button onClick={openPaymentConfirm}>Record payment</Button>
                  </div>
                  <Textarea rows={1} placeholder="Notes (optional)" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
                </div>
              </>
            )}

            <DialogFooter className="sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {isDraft && (
                  <Button
                    variant="outline"
                    onClick={markSent}
                    disabled={inv.items.length === 0}
                    title={inv.items.length === 0 ? 'An invoice cannot be sent until it contains at least one billable item.' : undefined}
                  >
                    Mark sent
                  </Button>
                )}
                {inv.status !== 'void' && inv.status !== 'paid' && !isDraft && (
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setVoidOpen(true)}>Void</Button>
                )}
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                  Delete invoice
                </Button>
              </div>
              {!isDraft && (
                <Button onClick={downloadPdf}>
                  {addPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Download PDF
                </Button>
              )}
            </DialogFooter>

            {isDraft && inv.items.length === 0 && (
              <p className="text-right text-xs text-muted-foreground">An invoice cannot be sent until it contains at least one billable item.</p>
            )}

            <ConfirmDialog
              open={confirmPayOpen}
              onOpenChange={setConfirmPayOpen}
              title="Record payment"
              description={
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span>{inv.invoice_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{formatNaira(Number(payAmount) || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{payMethod || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>{payReference || '—'}</span></div>
                  <p className="pt-2">Proceed?</p>
                </div>
              }
              confirmLabel="Proceed"
              loading={addPayment.isPending}
              onConfirm={recordPayment}
            />

            <ConfirmDialog
              open={voidOpen}
              onOpenChange={setVoidOpen}
              title={`Void Invoice ${inv.invoice_number}`}
              description="Voiding an invoice cannot be undone. A reason is required."
              destructive
              confirmLabel="Void invoice"
              loading={setStatus.isPending}
              disableConfirm={!voidReason.trim()}
              onConfirm={voidInvoice}
            >
              <div className="space-y-1.5">
                <Label className="text-xs">Reason for voiding</Label>
                <Textarea rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} autoFocus placeholder="e.g. Duplicate invoice" />
              </div>
            </ConfirmDialog>

            <ConfirmDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              title={`Delete invoice ${inv.invoice_number}?`}
              description={
                Number(inv.amount_paid) > 0
                  ? `This invoice has ${formatNaira(Number(inv.amount_paid))} in recorded payments — deleting it permanently removes that payment history too. Linked time entries and expenses will return to Unbilled Work/Expenses. This cannot be undone.`
                  : 'Linked time entries and expenses will return to Unbilled Work/Expenses. This cannot be undone.'
              }
              destructive
              confirmLabel="Delete invoice"
              loading={deleteInvoice.isPending}
              onConfirm={confirmDelete}
            />

            <PaymentDetailDialog
              paymentId={openPaymentId}
              open={Boolean(openPaymentId)}
              onOpenChange={(o) => !o && setOpenPaymentId(null)}
              onViewInvoice={() => setOpenPaymentId(null)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
