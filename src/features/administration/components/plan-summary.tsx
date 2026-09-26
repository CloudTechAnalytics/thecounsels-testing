import * as React from 'react'
import { format } from 'date-fns'
import { Check, Crown } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useSubscription, useMembers, useCancelSubscription, useCancelScheduledDowngrade } from '@/features/administration/hooks/use-administration'
import { PlanChangeDialog } from '@/features/subscription-billing/components/plan-change-dialog'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { formatNaira, daysUntil } from '@/shared/lib/format'
import { cyclePrice, CYCLE_LABEL, CYCLE_SUFFIX } from '@/shared/lib/billing-cycle'
import { toast } from '@/shared/components/ui/sonner'
import type { BadgeProps } from '@/shared/components/ui/badge'

const STATUS_META: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  trialing: { label: 'Trial', variant: 'warning' },
  active: { label: 'Active', variant: 'success' },
  past_due: { label: 'Payment required', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
  expired: { label: 'Expired', variant: 'destructive' },
  suspended: { label: 'Suspended', variant: 'destructive' },
  paused: { label: 'Paused', variant: 'muted' },
}

/** Firm Settings -> Plan & Billing. Actions are organization.manage-gated — Senior Associates see view-only. */
export function PlanSummary() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const canManage = has('organization.manage')
  const { data: sub, isLoading } = useSubscription(activeOrgId)
  const { data: members } = useMembers(activeOrgId)
  const cancelSub = useCancelSubscription(activeOrgId)
  const cancelDowngrade = useCancelScheduledDowngrade(activeOrgId)

  const [changeOpen, setChangeOpen] = React.useState(false)
  const [confirmCancel, setConfirmCancel] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />
  if (!sub) return <Card className="p-6 text-sm text-muted-foreground">No subscription on file. Contact CloudTech.</Card>

  const plan = sub.plan
  const trialLeft = sub.status === 'trialing' ? daysUntil(sub.trial_ends_at) : null
  const highlights = (plan?.highlights ?? []) as string[]
  const statusMeta = STATUS_META[sub.status] ?? { label: sub.status, variant: 'muted' as const }
  const activeSeats = members?.filter((m) => m.status === 'active').length ?? 0

  const doCancel = async () => {
    try {
      await cancelSub.mutateAsync(cancelReason.trim() || undefined)
      toast.success('Subscription cancelled')
      setConfirmCancel(false)
      setCancelReason('')
    } catch (err) {
      toast.error('Could not cancel', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <h3 className="font-display text-xl font-semibold">{plan?.name ?? 'Custom'}</h3>
            <Badge variant={statusMeta.variant}>
              {sub.status === 'trialing' && trialLeft != null
                ? `Trial · ${trialLeft < 0 ? 'expired' : `${trialLeft} day${trialLeft === 1 ? '' : 's'} remaining`}`
                : statusMeta.label}
            </Badge>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-semibold">
              {plan?.is_custom ? 'Custom' : plan ? formatNaira(cyclePrice(sub.billing_cycle, plan)) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">{plan?.is_custom ? '' : CYCLE_SUFFIX[sub.billing_cycle].replace('/', 'per ')}</p>
          </div>
        </div>

        {sub.status === 'trialing' && sub.trial_ends_at && (
          <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            Trial ends {format(new Date(sub.trial_ends_at), 'PP')}. No payment required to start — subscribe any time.
          </p>
        )}
        {sub.status === 'past_due' && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Your last payment didn't go through. Update billing to keep your subscription active.
          </p>
        )}
        {sub.scheduled_plan_id && sub.scheduled_change_at && (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Your plan will change on {format(new Date(sub.scheduled_change_at), 'PP')}.
            {canManage && (
              <button
                className="ml-2 font-medium text-primary hover:underline"
                onClick={() => cancelDowngrade.mutate()}
                disabled={cancelDowngrade.isPending}
              >
                Undo
              </button>
            )}
          </p>
        )}

        {highlights.length > 0 && (
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {highlights.map((h) => (
              <li key={h} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-success" /> {h}</li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
            <Button onClick={() => setChangeOpen(true)}>
              {sub.status === 'trialing' ? 'Choose paid plan' : 'Upgrade plan'}
            </Button>
            <Button variant="outline" onClick={() => setChangeOpen(true)}>Change plan</Button>
            {sub.status !== 'cancelled' && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmCancel(true)}>
                Cancel subscription
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-6 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Billing cycle</span><span className="font-medium">{CYCLE_LABEL[sub.billing_cycle]}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Seats</span><span className="font-medium">{activeSeats} of {sub.seats} used</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Payment status</span><span className="font-medium">{statusMeta.label}</span></div>
        {sub.status !== 'trialing' && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last payment</span>
            <span className="font-medium">{sub.last_payment_at ? format(new Date(sub.last_payment_at), 'PP') : '—'}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">{sub.status === 'trialing' ? 'Trial ends' : 'Next billing date'}</span>
          <span className="font-medium">
            {sub.status === 'trialing'
              ? sub.trial_ends_at ? format(new Date(sub.trial_ends_at), 'PP') : '—'
              : sub.next_billing_date ?? sub.current_period_end
                ? format(new Date((sub.next_billing_date ?? sub.current_period_end)!), 'PP')
                : '—'}
          </span>
        </div>
        {!canManage && (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            Only your Managing Partner can change plans or manage billing.
          </p>
        )}
      </Card>

      {canManage && (
        <>
          <PlanChangeDialog
            open={changeOpen}
            onOpenChange={setChangeOpen}
            organizationId={activeOrgId!}
            currentPlan={plan}
            currentCycle={sub.billing_cycle}
          />
          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title="Cancel subscription"
            destructive
            confirmLabel="Cancel subscription"
            loading={cancelSub.isPending}
            description="Your firm will lose access to paid features. This can be undone by subscribing again at any time."
            onConfirm={doCancel}
          >
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Switching tools" />
            </div>
          </ConfirmDialog>
        </>
      )}
    </div>
  )
}
