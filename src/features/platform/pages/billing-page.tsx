import { format } from 'date-fns'
import { Banknote, CircleDollarSign, CreditCard, AlertTriangle, Hourglass, Wallet } from 'lucide-react'
import { useSubscriptions, usePlatformStats } from '@/features/platform/hooks/use-platform'
import type { SubscriptionRow } from '@/features/platform/types'
import { KpiCard } from '@/features/platform/components/kpi-card'
import { DistributionBars } from '@/shared/components/bar-chart'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { initialsOf, formatNaira, formatMoneyCompact } from '@/shared/lib/format'
import { CYCLE_LABEL, monthlyEquivalent } from '@/shared/lib/billing-cycle'

function monthly(row: SubscriptionRow): number {
  if (!row.plan) return 0
  return monthlyEquivalent(row.billing_cycle, row.plan)
}

export function BillingPage() {
  const { data, isLoading } = useSubscriptions()
  const stats = usePlatformStats()
  const subs = data ?? []
  const active = subs.filter((s) => s.status === 'active')
  const pastDue = subs.filter((s) => s.status === 'past_due')
  const outstanding = pastDue.reduce((sum, s) => sum + monthly(s), 0)
  const arpa = active.length ? (stats.data?.mrr ?? 0) / active.length : 0

  const revenueByPlan = Object.values(
    active.reduce<Record<string, { label: string; value: number }>>((acc, s) => {
      const name = s.plan?.name ?? 'Unassigned'
      acc[name] ??= { label: name, value: 0 }
      acc[name].value += monthly(s)
      return acc
    }, {}),
  ).sort((a, b) => b.value - a.value)

  const topCustomers = [...active].sort((a, b) => monthly(b) - monthly(a)).slice(0, 6)
  const renewals = [...active]
    .filter((s) => s.current_period_end)
    .sort((a, b) => new Date(a.current_period_end!).getTime() - new Date(b.current_period_end!).getTime())
    .slice(0, 6)

  return (
    <div>
      <PageHeader title="Billing" description="Revenue, active plans and upcoming renewals across the platform." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Monthly Revenue" value={formatMoneyCompact(stats.data?.mrr ?? 0)} hint="MRR" icon={Banknote} loading={stats.isLoading} />
        <KpiCard label="Annual Revenue" value={formatMoneyCompact(stats.data?.arr ?? 0)} hint="ARR" icon={CircleDollarSign} loading={stats.isLoading} />
        <KpiCard label="Active Plans" value={active.length} hint="Billing now" icon={CreditCard} loading={isLoading} />
        <KpiCard label="ARPA" value={formatMoneyCompact(arpa)} hint="Avg / account" icon={Wallet} loading={isLoading} />
        <KpiCard label="Outstanding" value={formatMoneyCompact(outstanding)} hint={`${pastDue.length} past due`} icon={AlertTriangle} loading={isLoading} />
        <KpiCard label="Trials" value={subs.filter((s) => s.status === 'trialing').length} hint="Not yet billing" icon={Hourglass} loading={isLoading} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Revenue by plan</h2>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : revenueByPlan.length ? (
            <DistributionBars data={revenueByPlan} formatValue={(n) => formatNaira(n)} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No active revenue yet.</p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Top paying customers</h2>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : topCustomers.length ? (
            <div className="space-y-3">
              {topCustomers.map((s) => (
                <div key={s.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-[10px] font-semibold text-primary">
                      {initialsOf(s.organization?.name, 'OR')}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{s.organization?.name}</p>
                      <p className="text-xs text-muted-foreground">{s.plan?.name}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{formatNaira(monthly(s))}/mo</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No paying customers yet.</p>
          )}
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming renewals</h2>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : renewals.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Renews</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renewals.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm font-medium">{s.organization?.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{s.plan?.name}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{CYCLE_LABEL[s.billing_cycle]}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(s.current_period_end!), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatNaira(monthly(s))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">No upcoming renewals.</p>
        )}
      </Card>
    </div>
  )
}
