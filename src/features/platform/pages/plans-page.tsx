import * as React from 'react'
import { Check, Pencil, Plus, Users2, HardDrive, Headphones } from 'lucide-react'
import { usePlans } from '@/features/platform/hooks/use-platform'
import { PlanEditorDialog } from '@/features/platform/components/plan-editor-dialog'
import { PLAN_FEATURES } from '@/features/platform/types'
import type { Plan } from '@/shared/types/database.types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatNaira } from '@/shared/lib/format'

export function PlansPage() {
  const { data, isLoading } = usePlans()
  const [editing, setEditing] = React.useState<Plan | null>(null)
  const [open, setOpen] = React.useState(false)

  const edit = (plan: Plan | null) => {
    setEditing(plan)
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Plans & Pricing"
        description="Define the subscription tiers offered to law firms."
        actions={
          <Button onClick={() => edit(null)}>
            <Plus /> New custom plan
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {/* Retired plans (e.g. the old single-tier "Early Access" trial,
              0053) stay in the database — any historical org's
              subscriptions.plan_id still points at one, and deleting the
              row would break that reference — they just don't belong in
              this "what we currently offer" management view. */}
          {data?.filter((plan) => plan.is_active).map((plan) => {
            const features = (plan.features as Record<string, boolean>) ?? {}
            return (
              <Card key={plan.id} className="flex flex-col p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
                      {plan.is_custom && <Badge variant="secondary">Custom</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => edit(plan)} aria-label="Edit plan">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-4">
                  <span className="font-display text-3xl font-semibold">{formatNaira(Number(plan.price_monthly))}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                  <p className="text-xs text-muted-foreground">
                    or {plan.price_quarterly != null && `${formatNaira(Number(plan.price_quarterly))}/quarter · `}
                    {plan.price_semiannual != null && `${formatNaira(Number(plan.price_semiannual))}/6 months · `}
                    {formatNaira(Number(plan.price_yearly))}/year
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-muted/60 p-2">
                    <Users2 className="mx-auto h-4 w-4 text-primary" />
                    <p className="mt-1 font-medium">{plan.max_users ?? '∞'}</p>
                    <p className="text-muted-foreground">users</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <HardDrive className="mx-auto h-4 w-4 text-primary" />
                    <p className="mt-1 font-medium">{plan.storage_gb >= 1024 ? `${plan.storage_gb / 1024} TB` : `${plan.storage_gb} GB`}</p>
                    <p className="text-muted-foreground">storage</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <Headphones className="mx-auto h-4 w-4 text-primary" />
                    <p className="mt-1 truncate font-medium" title={plan.support_level}>{plan.support_level}</p>
                    <p className="text-muted-foreground">support</p>
                  </div>
                </div>

                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {PLAN_FEATURES.filter((f) => features[f.key]).map((f) => (
                    <li key={f.key} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-success" /> {f.label}
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      )}

      <PlanEditorDialog plan={editing} open={open} onOpenChange={setOpen} />
    </div>
  )
}
