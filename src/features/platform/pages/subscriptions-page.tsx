import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { CreditCard, TrendingUp, CircleDollarSign, Building2, Hourglass, Mail, CheckCircle2, XCircle } from 'lucide-react'
import {
  usePlans,
  useSubscriptions,
  useUpdateSubscription,
  useReviewManualPayment,
  usePlatformStats,
} from '@/features/platform/hooks/use-platform'
import type { SubscriptionRow } from '@/features/platform/types'
import type { SubscriptionStatus } from '@/shared/types/database.types'
import { KpiCard } from '@/features/platform/components/kpi-card'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { initialsOf, formatNaira, formatMoneyCompact, daysUntil } from '@/shared/lib/format'
import { monthlyEquivalent } from '@/shared/lib/billing-cycle'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/components/ui/sonner'

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'trialing', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
]

type FilterKey = 'all' | 'starter' | 'professional' | 'business' | 'enterprise' | 'trialing' | 'expired' | 'cancelled' | 'past_due'
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'starter', label: 'Basic' },
  { key: 'professional', label: 'Professional' },
  { key: 'business', label: 'Business' },
  { key: 'enterprise', label: 'Enterprise' },
  { key: 'trialing', label: 'Trial' },
  { key: 'expired', label: 'Expired trials' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'past_due', label: 'Past-due' },
]
const PLAN_KEYS = new Set(['starter', 'professional', 'business', 'enterprise'])

function monthlyPrice(row: SubscriptionRow): number {
  if (!row.plan) return 0
  return monthlyEquivalent(row.billing_cycle, row.plan)
}

function SubscriptionRowItem({ row }: { row: SubscriptionRow }) {
  const { data: plans } = usePlans()
  const update = useUpdateSubscription()
  const trialLeft = row.status === 'trialing' ? daysUntil(row.trial_ends_at) : null

  const change = async (patch: Parameters<typeof update.mutateAsync>[0]['patch'], action: string, ok: string) => {
    try {
      await update.mutateAsync({ id: row.id, orgId: row.organization_id, action, patch })
      toast.success(ok)
    } catch (err) {
      toast.error('Update failed', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-[10px] font-semibold text-primary">
            {initialsOf(row.organization?.name, 'OR')}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.organization?.name ?? '—'}</p>
            <p className="truncate text-xs text-muted-foreground">/{row.organization?.slug}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Select
          value={row.plan_id ?? undefined}
          onValueChange={(v) => change({ plan_id: v }, 'plan_changed', 'Plan updated')}
        >
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue placeholder="No plan" />
          </SelectTrigger>
          <SelectContent>
            {plans
              ?.filter((p) => p.is_active)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {formatNaira(Number(p.price_monthly))}/mo
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <Select
            value={row.status}
            onValueChange={(v) => change({ status: v as SubscriptionStatus }, `status_${v}`, 'Status updated')}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {trialLeft != null && (
            <p className="pl-1 text-xs text-muted-foreground">{trialLeft < 0 ? 'Expired' : `${trialLeft}d left`}</p>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{row.billing_country ?? '—'}</TableCell>
      <TableCell>
        {row.payment_method === 'manual' ? (
          <Badge variant={row.payment_status === 'verified' ? 'success' : row.payment_status === 'rejected' ? 'destructive' : 'secondary'}>
            Manual · {row.payment_status === 'verified' ? 'Verified' : row.payment_status === 'rejected' ? 'Rejected' : 'Pending'}
          </Badge>
        ) : (
          <Badge variant="outline">Paystack</Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{row.seats}</TableCell>
      <TableCell className="text-right text-sm font-medium">{formatNaira(monthlyPrice(row))}</TableCell>
    </TableRow>
  )
}

/** One pending manual-payment request — its own review queue, separate
 * from the main table, since this is the one thing on this whole page
 * that actually needs an admin's attention today. Both actions require
 * confirmation (§ spec) and neither ever runs without an explicit click —
 * "manual" was chosen by the customer, but nothing here activates itself. */
function ManualPaymentRow({ row }: { row: SubscriptionRow }) {
  const review = useReviewManualPayment()
  const [confirmAction, setConfirmAction] = React.useState<'verify_and_activate' | 'reject' | null>(null)

  const run = async () => {
    if (!confirmAction) return
    try {
      await review.mutateAsync({ subscriptionId: row.id, action: confirmAction })
      toast.success(confirmAction === 'verify_and_activate' ? 'Payment verified — subscription activated' : 'Payment rejected')
      setConfirmAction(null)
    } catch (err) {
      toast.error('Could not update this payment', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-[10px] font-semibold text-primary">
            {initialsOf(row.organization?.name, 'OR')}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.organization?.name ?? '—'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.plan?.name ?? 'No plan'} · {row.billing_country ?? 'Country not set'} · {formatNaira(Number(row.amount ?? 0), row.currency)}
              /{row.billing_cycle === 'yearly' ? 'yr' : row.billing_cycle === 'semiannual' ? '6mo' : row.billing_cycle === 'quarterly' ? 'qtr' : 'mo'} ·{' '}
              {formatDistanceToNow(new Date(row.updated_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirmAction('reject')}>
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setConfirmAction('verify_and_activate')}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark verified &amp; activate
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === 'verify_and_activate'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Activate this subscription?"
        confirmLabel="Verify & activate"
        loading={review.isPending}
        description={
          <>
            Confirms <strong>{row.organization?.name}</strong>'s payment of{' '}
            <strong>{formatNaira(Number(row.amount ?? 0), row.currency)}</strong> was received outside Paystack, and
            activates their <strong>{row.plan?.name}</strong> subscription immediately.
          </>
        }
        onConfirm={run}
      />
      <ConfirmDialog
        open={confirmAction === 'reject'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Reject this payment?"
        destructive
        confirmLabel="Reject"
        loading={review.isPending}
        description={
          <>
            <strong>{row.organization?.name}</strong> stays blocked from the workspace. They can reach out again or
            try paying online instead.
          </>
        }
        onConfirm={run}
      />
    </>
  )
}

export function SubscriptionsPage() {
  const { data, isLoading } = useSubscriptions()
  const stats = usePlatformStats()
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const trials = (data ?? []).filter((s) => s.status === 'trialing').length
  const pendingManual = (data ?? []).filter((s) => s.payment_method === 'manual' && s.payment_status === 'pending')

  const filtered = (data ?? []).filter((row) => {
    if (filter === 'all') return true
    if (PLAN_KEYS.has(filter)) return row.plan?.key === filter
    return row.status === filter
  })

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Assign plans to customer organizations. Revenue is computed from active plans."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="MRR" value={formatMoneyCompact(stats.data?.mrr ?? 0)} hint="Monthly recurring revenue" icon={TrendingUp} loading={stats.isLoading} />
        <KpiCard label="ARR" value={formatMoneyCompact(stats.data?.arr ?? 0)} hint="Annualised" icon={CircleDollarSign} loading={stats.isLoading} />
        <KpiCard label="Customers" value={data?.length ?? 0} hint="Paying + trial tenants" icon={Building2} loading={isLoading} />
        <KpiCard label="Trials" value={trials} hint="Not yet billing (excluded from MRR)" icon={Hourglass} loading={isLoading} />
      </div>

      {pendingManual.length > 0 && (
        <Card className="mt-6 overflow-hidden border-primary/30">
          <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-5 py-3.5">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
              Pending manual payments — {pendingManual.length} awaiting review
            </h2>
          </div>
          {pendingManual.map((row) => (
            <ManualPaymentRow key={row.id} row={row} />
          ))}
        </Card>
      )}

      <div className="mt-6 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <CreditCard className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer plans</h2>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead className="text-right">Monthly</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <SubscriptionRowItem key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            {data && data.length > 0 ? 'No subscriptions match this filter.' : "No subscriptions yet — they're created automatically with each organization."}
          </div>
        )}
      </Card>
    </div>
  )
}
