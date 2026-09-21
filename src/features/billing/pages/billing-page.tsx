import * as React from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Banknote,
  Clock,
  Wallet,
  FileText,
  CircleDollarSign,
  AlertTriangle,
  Plus,
  Trash2,
  Pencil,
  Receipt,
  Search,
  MoreHorizontal,
} from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useClients } from '@/features/clients/hooks/use-clients'
import {
  useBillingStats,
  usePersonalStats,
  useExpenses,
  useInvoices,
  useDeleteExpense,
  useDeleteInvoice,
} from '@/features/billing/hooks/use-billing'
import { TimeEntryDialog, ExpenseDialog } from '@/features/billing/components/log-dialogs'
import { TimeEntriesTab } from '@/features/billing/components/time-entries-tab'
import { PaymentsTab } from '@/features/billing/components/payments-tab'
import { GenerateInvoiceDialog, InvoiceDetailDialog } from '@/features/billing/components/invoice-dialogs'
import { LogPaymentDialog } from '@/features/billing/components/log-payment-dialog'
import { EXPENSE_CATEGORIES, INVOICE_STATUS_META, isInvoiceOverdue, type ExpenseRow, type InvoiceRow } from '@/features/billing/types'
import { StatTile } from '@/features/dashboard/components/stat-tile'
import { BranchSelector } from '@/features/dashboard/components/branch-selector'
import { useBranchScope } from '@/features/dashboard/hooks/use-branch-scope'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { formatNaira, formatMoneyCompact } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/components/ui/sonner'

function OverviewTab({
  canFinancials,
  stats,
  personal,
  invoices,
  onOpenInvoice,
}: {
  canFinancials: boolean
  stats: ReturnType<typeof useBillingStats>
  personal: ReturnType<typeof usePersonalStats>
  invoices: InvoiceRow[]
  onOpenInvoice: (id: string) => void
}) {
  const s = stats.data
  const p = personal.data
  // Quick "what needs attention" lists — same data the Invoices tab already
  // has, just the unpaid/overdue subset surfaced here so Overview earns
  // its name instead of only showing totals.
  const unpaid = invoices.filter((i) => i.status === 'sent' || i.status === 'partial').slice(0, 5)

  return (
    <div className="space-y-6">
      {canFinancials ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Revenue (MTD)" value={s ? formatMoneyCompact(s.revenueMTD) : '—'} hint="Actual payments received this month" icon={Banknote} />
          <StatTile label="Billable hours (MTD)" value={s ? `${s.billableHoursMTD}h` : '—'} icon={Clock} />
          <StatTile label="Unbilled (WIP)" value={s ? formatMoneyCompact(s.unbilledValue) : '—'} icon={Wallet} />
          <StatTile label="Invoiced" value={s ? formatMoneyCompact(s.invoiced) : '—'} hint="Issued invoices, drafts excluded" icon={FileText} />
          <StatTile label="Collected" value={s ? formatMoneyCompact(s.collected) : '—'} icon={CircleDollarSign} />
          <StatTile label="Outstanding" value={s ? formatMoneyCompact(s.outstanding) : '—'} icon={AlertTriangle} />
          <StatTile label="Payments received (MTD)" value={s ? formatMoneyCompact(s.paymentsReceivedMTD) : '—'} icon={CircleDollarSign} />
          <StatTile label="Unpaid invoices" value={s ? String(s.unpaidInvoicesCount) : '—'} icon={FileText} />
          <StatTile label="Overdue invoices" value={s ? String(s.overdueCount) : '—'} icon={AlertTriangle} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatTile label="My billable hours (MTD)" value={p ? `${p.billableHoursMTD}h` : '—'} hint="Time you logged this month" icon={Clock} />
          <StatTile label="My unbilled work" value={p ? formatMoneyCompact(p.unbilledValue) : '—'} hint="Your time & expenses awaiting invoicing" icon={Wallet} />
          <StatTile label="My expenses (MTD)" value={p ? formatMoneyCompact(p.expensesMTD) : '—'} hint="Expenses you logged this month" icon={Receipt} />
        </div>
      )}

      {canFinancials && unpaid.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Needs attention — unpaid invoices</p>
          </div>
          <div className="divide-y divide-border/70">
            {unpaid.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => onOpenInvoice(inv.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40"
              >
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</span> · {inv.client?.display_name ?? '—'}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-medium">{formatNaira(Number(inv.total) - Number(inv.amount_paid))}</span>
                  <Badge variant={INVOICE_STATUS_META[inv.status].variant}>{INVOICE_STATUS_META[inv.status].label}</Badge>
                  {isInvoiceOverdue(inv) && <Badge variant="destructive">Overdue</Badge>}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

export function BillingPage() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const canFinancials = has('reports.financial')
  const canInvoice = has('invoices.manage')
  const branchScope = useBranchScope()
  // Firm-wide financials are restricted; everyone else gets their own numbers.
  const stats = useBillingStats(canFinancials ? activeOrgId : null, branchScope.selectedBranchId || null)
  const personal = usePersonalStats(canFinancials ? null : activeOrgId, userId)
  const invoices = useInvoices(activeOrgId)
  const [tab, setTab] = React.useState<'overview' | 'invoices' | 'payments' | 'expenses' | 'time'>('overview')

  const [timeOpen, setTimeOpen] = React.useState(false)
  const [expenseOpen, setExpenseOpen] = React.useState(false)
  const [genOpen, setGenOpen] = React.useState(false)
  const [payOpen, setPayOpen] = React.useState(false)
  const [invoiceId, setInvoiceId] = React.useState<string | null>(null)

  // Invoicing and collections are the core financial workflow now — this
  // just reorders which tabs render first and which action reads as
  // primary; every existing tab/dialog underneath is untouched.
  const tabs = (canInvoice ? (['overview', 'invoices', 'payments', 'expenses', 'time'] as const) : (['overview', 'expenses', 'time'] as const))
  const TAB_LABEL: Record<(typeof tabs)[number], string> = { overview: 'Overview', invoices: 'Invoices', payments: 'Payments', expenses: 'Expenses', time: 'Time entries' }

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Invoicing, payments, time and expenses."
        actions={
          <div className="flex flex-wrap gap-2">
            {canInvoice && <Button onClick={() => setGenOpen(true)}><Receipt className="h-4 w-4" /> Generate invoice</Button>}
            {canInvoice && <Button variant="outline" onClick={() => setPayOpen(true)}><Plus /> Log payment</Button>}
            <Button variant="outline" onClick={() => setExpenseOpen(true)}><Plus /> Log expense</Button>
            <Button variant="outline" onClick={() => setTimeOpen(true)}><Plus /> Log time</Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        {branchScope.canSelect && (
          <div className="pb-2">
            <BranchSelector options={branchScope.options} value={branchScope.selectedBranchId} onChange={branchScope.setSelectedBranchId} />
          </div>
        )}
      </div>

      <div className="mt-6">
        {tab === 'overview' && (
          <OverviewTab
            canFinancials={canFinancials}
            stats={stats}
            personal={personal}
            invoices={invoices.data ?? []}
            onOpenInvoice={setInvoiceId}
          />
        )}
        {tab === 'time' && <TimeEntriesTab />}
        {tab === 'expenses' && <ExpensesTab />}
        {tab === 'invoices' && canInvoice && <InvoicesTab invoices={invoices} onOpen={setInvoiceId} />}
        {tab === 'payments' && canInvoice && <PaymentsTab onViewInvoice={setInvoiceId} />}
      </div>

      <TimeEntryDialog open={timeOpen} onOpenChange={setTimeOpen} />
      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
      <GenerateInvoiceDialog open={genOpen} onOpenChange={setGenOpen} onGenerated={setInvoiceId} />
      <LogPaymentDialog open={payOpen} onOpenChange={setPayOpen} onLogged={setInvoiceId} />
      <InvoiceDetailDialog invoiceId={invoiceId} open={Boolean(invoiceId)} onOpenChange={(o) => !o && setInvoiceId(null)} />
    </div>
  )
}

function ExpensesTab() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const canManage = has('expenses.manage')
  const { data: matters } = useMatters(activeOrgId, {})

  const [status, setStatus] = React.useState<'unbilled' | 'billed' | 'all'>('unbilled')
  const { data, isLoading } = useExpenses(activeOrgId, status)
  const delExp = useDeleteExpense(activeOrgId)

  // Without expenses.manage you see (and can act on) only your own expenses.
  const rows = (data ?? []).filter((e) => canManage || e.user?.id === userId)

  const [search, setSearch] = React.useState('')
  const [matterId, setMatterId] = React.useState('all')
  const [category, setCategory] = React.useState('all')
  const [billable, setBillable] = React.useState<'all' | 'yes' | 'no'>('all')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ExpenseRow | null>(null)
  const [toDelete, setToDelete] = React.useState<ExpenseRow | null>(null)

  const filtered = rows.filter((e) => {
    if (search.trim() && !e.description.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (matterId !== 'all' && e.matter?.id !== matterId) return false
    if (category !== 'all' && e.category !== category) return false
    if (billable === 'yes' && !e.billable) return false
    if (billable === 'no' && e.billable) return false
    if (dateFrom && e.expense_date < dateFrom) return false
    if (dateTo && e.expense_date > dateTo) return false
    return true
  })

  const openEdit = (row: ExpenseRow) => { setEditing(row); setDialogOpen(true) }
  /** Own expense, or expenses.manage — matches the RLS owner clause exactly. */
  const canAct = (e: ExpenseRow) => canManage || e.user?.id === userId

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description…" className="pl-9" />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unbilled">Unbilled</SelectItem>
              <SelectItem value="billed">Billed</SelectItem>
              <SelectItem value="all">All expenses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={matterId} onValueChange={setMatterId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All matters" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All matters</SelectItem>
              {matters?.map((m) => <SelectItem key={m.id} value={m.id}>{m.matter_number} — {m.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={billable} onValueChange={(v) => setBillable(v as typeof billable)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Billable & non</SelectItem>
              <SelectItem value="yes">Billable only</SelectItem>
              <SelectItem value="no">Non-billable only</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" aria-label="From date" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" aria-label="To date" />
        </div>
        <ExportButton
          filename="expenses"
          disabled={filtered.length === 0}
          sheets={() => [{
            name: 'Expenses',
            rows: filtered.map((e) => ({
              Date: e.expense_date,
              Description: e.description,
              Matter: e.matter?.matter_number ?? '',
              Category: e.category ?? '',
              Amount: Number(e.amount),
              Billable: e.billable ? 'Yes' : 'No',
              Status: e.invoiced ? 'Billed' : 'Unbilled',
              Invoice: e.invoice?.invoice_number ?? '',
              'Logged by': e.created_by_profile?.full_name ?? e.user?.full_name ?? '',
              'Logged at': e.created_at,
            })),
          }]}
        />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : filtered.length > 0 ? (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Description</TableHead><TableHead>Matter</TableHead><TableHead>Category</TableHead>
              <TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Logged by</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{e.description}</TableCell>
                  <TableCell className="text-sm">
                    {e.matter ? (
                      <Link to={`/matters/${e.matter.id}`} className="text-primary hover:underline">
                        {e.matter.matter_number}
                      </Link>
                    ) : e.billable ? (
                      <Badge variant="warning">No matter — can't be invoiced</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.category ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(e.expense_date), 'MMM d')}</TableCell>
                  <TableCell>
                    {e.invoiced ? (
                      e.invoice ? (
                        <Badge variant="secondary">Billed · {e.invoice.invoice_number}</Badge>
                      ) : (
                        <Badge variant="secondary">Billed</Badge>
                      )
                    ) : (
                      <Badge variant="muted">Unbilled</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.created_by_profile?.full_name ?? e.user?.full_name ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatNaira(Number(e.amount))}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={e.invoiced || !canAct(e)} onClick={() => openEdit(e)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={e.invoiced || !canAct(e)}
                          onClick={() => setToDelete(e)}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? 'No expenses match this view.' : 'No expenses match your filters.'}
          </p>
        )}
      </Card>

      <ExpenseDialog expense={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete expense"
        destructive
        confirmLabel="Delete"
        loading={delExp.isPending}
        description="This removes the expense permanently."
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await delExp.mutateAsync(toDelete.id)
            toast.success('Expense deleted')
            setToDelete(null)
          } catch (err) {
            toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />
    </div>
  )
}

function InvoicesTab({
  invoices,
  onOpen,
}: {
  invoices: { data?: InvoiceRow[]; isLoading: boolean }
  onOpen: (id: string) => void
}) {
  const { activeOrgId } = useAuth()
  const { data: clients } = useClients(activeOrgId, {})
  const delInv = useDeleteInvoice(activeOrgId)

  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [clientId, setClientId] = React.useState('all')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [toDelete, setToDelete] = React.useState<InvoiceRow | null>(null)

  const rows = invoices.data ?? []
  const filtered = rows.filter((inv) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = `${inv.invoice_number ?? ''} ${inv.client?.display_name ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (status === 'overdue') { if (!isInvoiceOverdue(inv)) return false }
    else if (status !== 'all' && inv.status !== status) return false
    if (clientId !== 'all' && inv.client?.id !== clientId) return false
    if (dateFrom && inv.issue_date < dateFrom) return false
    if (dateTo && inv.issue_date > dateTo) return false
    return true
  })

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await delInv.mutateAsync(toDelete.id)
      toast.success('Invoice deleted')
      setToDelete(null)
    } catch (err) {
      toast.error('Could not delete invoice', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice # or client…" className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(INVOICE_STATUS_META) as (keyof typeof INVOICE_STATUS_META)[]).map((s) => (
                <SelectItem key={s} value={s}>{INVOICE_STATUS_META[s].label}</SelectItem>
              ))}
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" aria-label="From date" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" aria-label="To date" />
        </div>
        <ExportButton
          filename="invoices"
          disabled={filtered.length === 0}
          sheets={() => [{
            name: 'Invoices',
            rows: filtered.map((inv) => ({
              'Invoice #': inv.invoice_number ?? '',
              Client: inv.client?.display_name ?? '',
              Matter: inv.matter?.matter_number ?? '',
              Issued: inv.issue_date,
              Due: inv.due_date ?? '',
              Status: INVOICE_STATUS_META[inv.status].label,
              Total: Number(inv.total),
              Paid: Number(inv.amount_paid),
              Balance: Number(inv.total) - Number(inv.amount_paid),
            })),
          }]}
        />
      </div>

      <Card className="overflow-hidden">
        {invoices.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length > 0 ? (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Invoice</TableHead><TableHead>Client</TableHead><TableHead>Issued</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="cursor-pointer font-mono text-xs" onClick={() => onOpen(inv.id)}>{inv.invoice_number}</TableCell>
                  <TableCell className="cursor-pointer text-sm" onClick={() => onOpen(inv.id)}>{inv.client?.display_name ?? '—'}</TableCell>
                  <TableCell className="cursor-pointer text-sm text-muted-foreground" onClick={() => onOpen(inv.id)}>
                    {format(new Date(inv.issue_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="cursor-pointer text-right text-sm font-medium" onClick={() => onOpen(inv.id)}>{formatNaira(Number(inv.total))}</TableCell>
                  <TableCell className="cursor-pointer text-right text-sm" onClick={() => onOpen(inv.id)}>
                    {formatNaira(Number(inv.total) - Number(inv.amount_paid))}
                  </TableCell>
                  <TableCell className="cursor-pointer" onClick={() => onOpen(inv.id)}>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={INVOICE_STATUS_META[inv.status].variant}>{INVOICE_STATUS_META[inv.status].label}</Badge>
                      {isInvoiceOverdue(inv) && <Badge variant="destructive">Overdue</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpen(inv.id)}>View</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setToDelete(inv)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary"><Receipt className="h-7 w-7" /></span>
            <p className="font-display text-lg font-semibold">{rows.length === 0 ? 'No invoices yet' : 'No invoices match your filters'}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {rows.length === 0
                ? 'Log time and expenses, then generate an invoice from unbilled work.'
                : 'Try adjusting your search or filters.'}
            </p>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={toDelete ? `Delete invoice ${toDelete.invoice_number}?` : 'Delete invoice?'}
        description={
          toDelete && Number(toDelete.amount_paid) > 0
            ? `This invoice has ${formatNaira(Number(toDelete.amount_paid))} in recorded payments — deleting it permanently removes that payment history too. Linked time entries and expenses will return to Unbilled Work/Expenses. This cannot be undone.`
            : 'Linked time entries and expenses will return to Unbilled Work/Expenses. This cannot be undone.'
        }
        destructive
        confirmLabel="Delete invoice"
        loading={delInv.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
