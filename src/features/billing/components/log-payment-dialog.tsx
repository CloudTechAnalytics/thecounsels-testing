import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useInvoices, useAddPayment } from '@/features/billing/hooks/use-billing'
import { PAYABLE_INVOICE_STATUSES } from '@/features/billing/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { formatNaira } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

const NONE = '__none__'
const PAYMENT_METHODS = ['Bank transfer', 'Card', 'Cash', 'Cheque']

/** Top-level "Log Payment" — previously the only way to record a payment
 * was to already be inside a specific invoice's detail view. Same
 * fields/guards as that flow (InvoiceDetailDialog), just with an invoice
 * picker in front of it instead of assuming you're already looking at one. */
export function LogPaymentDialog({ open, onOpenChange, onLogged }: { open: boolean; onOpenChange: (o: boolean) => void; onLogged?: (invoiceId: string) => void }) {
  const { activeOrgId, profile } = useAuth()
  const invoices = useInvoices(activeOrgId)
  const addPayment = useAddPayment(activeOrgId, profile?.id ?? null)

  const [invoiceId, setInvoiceId] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [method, setMethod] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [paidAt, setPaidAt] = React.useState('')
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  React.useEffect(() => {
    if (open) { setInvoiceId(''); setAmount(''); setMethod(''); setReference(''); setNotes(''); setPaidAt(new Date().toISOString().slice(0, 10)) }
  }, [open])

  const payable = (invoices.data ?? []).filter((i) => PAYABLE_INVOICE_STATUSES.includes(i.status))
  const invoice = payable.find((i) => i.id === invoiceId)
  const balance = invoice ? Number(invoice.total) - Number(invoice.amount_paid) : 0

  const openConfirm = () => {
    if (!invoiceId) { toast.error('Choose an invoice'); return }
    if (!Number(amount)) { toast.error('Enter a payment amount'); return }
    // The DB guard (guard_payment_invoice_status, 0049) rejects this too —
    // this is just faster, friendlier feedback before the round trip.
    if (Number(amount) > balance) {
      toast.error('Payment exceeds the outstanding balance', { description: `Balance due is ${formatNaira(balance)}.` })
      return
    }
    setConfirmOpen(true)
  }

  const submit = async () => {
    if (!invoiceId) return
    try {
      await addPayment.mutateAsync({
        invoiceId,
        values: { amount: Number(amount), method, reference: reference || undefined, notes: notes || undefined, paidAt: paidAt || new Date().toISOString().slice(0, 10) },
      })
      toast.success('Payment recorded')
      setConfirmOpen(false)
      onOpenChange(false)
      onLogged?.(invoiceId)
    } catch (err) {
      toast.error('Could not record payment', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log payment</DialogTitle>
            <DialogDescription>Record a payment received against a Sent or Partially Paid invoice.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Invoice<span className="text-destructive"> *</span></Label>
              <Select value={invoiceId || NONE} onValueChange={(v) => setInvoiceId(v === NONE ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Choose an invoice" /></SelectTrigger>
                <SelectContent>
                  {payable.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No Sent or Partially Paid invoices.</p>}
                  {payable.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.invoice_number} — {i.client?.display_name ?? '—'} — balance {formatNaira(Number(i.total) - Number(i.amount_paid))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {invoice && (
              <div className="flex justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Outstanding balance</span>
                <span className="font-medium">{formatNaira(balance)}</span>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Amount (₦)<span className="text-destructive"> *</span></Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={invoice ? String(balance) : undefined} />
              </div>
              <div className="space-y-1.5">
                <Label>Date paid</Label>
                <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={method || NONE} onValueChange={(v) => setMethod(v === NONE ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reference (optional)</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. bank transaction ID" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={openConfirm} disabled={!invoiceId}>Log payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Record payment"
        description={
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span>{invoice?.invoice_number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{formatNaira(Number(amount) || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{method || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>{reference || '—'}</span></div>
            <p className="pt-2">Proceed?</p>
          </div>
        }
        confirmLabel="Proceed"
        loading={addPayment.isPending}
        onConfirm={submit}
      />
    </>
  )
}
