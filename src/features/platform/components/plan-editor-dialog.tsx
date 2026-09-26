import * as React from 'react'
import { Check } from 'lucide-react'
import { useSavePlan, usePlanPrices, useSavePlanPrices } from '@/features/platform/hooks/use-platform'
import { PLAN_FEATURES } from '@/features/platform/types'
import { SUPPORTED_CURRENCIES, CURRENCY_META, type SupportedCurrency } from '@/shared/lib/currencies'
import type { Plan } from '@/shared/types/database.types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Separator } from '@/shared/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/components/ui/sonner'

type Draft = {
  name: string
  description: string
  max_users: string
  storage_gb: string
  support_level: string
  highlights: string
  features: Record<string, boolean>
}

type PriceDraft = { monthly: string; quarterly: string; semiannual: string; yearly: string }
const emptyPrice: PriceDraft = { monthly: '', quarterly: '', semiannual: '', yearly: '' }

/** Auto-fill multipliers off monthly: 10% off quarterly, 14% off 6 months, 2 months free yearly. */
const QUARTERLY_FACTOR = 2.7
const SEMIANNUAL_FACTOR = 5.16
const YEARLY_FACTOR = 10

function toDraft(plan?: Plan | null): Draft {
  return {
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    max_users: plan?.max_users != null ? String(plan.max_users) : '',
    storage_gb: plan ? String(plan.storage_gb) : '',
    support_level: plan?.support_level ?? 'Community',
    highlights: (plan?.highlights ?? []).join('\n'),
    features: (plan?.features as Record<string, boolean>) ?? {},
  }
}

export function PlanEditorDialog({
  plan,
  open,
  onOpenChange,
}: {
  plan?: Plan | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const save = useSavePlan()
  const savePrices = useSavePlanPrices()
  const { data: existingPrices } = usePlanPrices(plan?.id)
  const [draft, setDraft] = React.useState<Draft>(toDraft(plan))
  const [prices, setPrices] = React.useState<Record<SupportedCurrency, PriceDraft>>(
    () => Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c, emptyPrice])) as Record<SupportedCurrency, PriceDraft>,
  )
  const [activeCurrency, setActiveCurrency] = React.useState<SupportedCurrency>('NGN')

  // Quarterly/6-month/yearly auto-follow monthly (see the *_FACTOR constants)
  // per currency independently, same "auto-follow until manually
  // touched" convention as the rest of this dialog — an existing plan's
  // already-stored prices for a currency count as already-edited, so
  // opening this dialog never silently overwrites real numbers.
  const editedRef = React.useRef<Record<SupportedCurrency, { q: boolean; s: boolean; y: boolean }>>(
    Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c, { q: false, s: false, y: false }])) as Record<
      SupportedCurrency,
      { q: boolean; s: boolean; y: boolean }
    >,
  )

  React.useEffect(() => {
    if (!open) return
    setDraft(toDraft(plan))
    setActiveCurrency('NGN')
    const next = Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c, emptyPrice])) as Record<SupportedCurrency, PriceDraft>
    // Legacy plans.price_* columns are always the NGN baseline (0161) — seed
    // that first so an existing plan with no plan_prices rows yet (or one
    // mid-migration) still shows its real current NGN price.
    if (plan) {
      next.NGN = {
        monthly: String(plan.price_monthly),
        quarterly: plan.price_quarterly != null ? String(plan.price_quarterly) : '',
        semiannual: plan.price_semiannual != null ? String(plan.price_semiannual) : '',
        yearly: String(plan.price_yearly),
      }
    }
    for (const row of existingPrices ?? []) {
      if ((SUPPORTED_CURRENCIES as readonly string[]).includes(row.currency)) {
        next[row.currency as SupportedCurrency] = {
          monthly: String(row.price_monthly),
          quarterly: row.price_quarterly != null ? String(row.price_quarterly) : '',
          semiannual: row.price_semiannual != null ? String(row.price_semiannual) : '',
          yearly: String(row.price_yearly),
        }
      }
    }
    setPrices(next)
    editedRef.current = Object.fromEntries(
      SUPPORTED_CURRENCIES.map((c) => [
        c,
        { q: Boolean(next[c].quarterly), s: Boolean(next[c].semiannual), y: Boolean(next[c].yearly) },
      ]),
    ) as Record<SupportedCurrency, { q: boolean; s: boolean; y: boolean }>
    // existingPrices intentionally excluded — only needs to seed once per
    // open, same reasoning as the Assigned Team checklist elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const toggleFeature = (key: string) =>
    setDraft((d) => ({ ...d, features: { ...d.features, [key]: !d.features[key] } }))

  const onMonthlyChange = (currency: SupportedCurrency, value: string) => {
    const n = Number(value)
    const edited = editedRef.current[currency]
    setPrices((p) => ({
      ...p,
      [currency]: {
        monthly: value,
        quarterly: !edited.q && value && n ? String(Math.round(n * QUARTERLY_FACTOR)) : p[currency].quarterly,
        semiannual: !edited.s && value && n ? String(Math.round(n * SEMIANNUAL_FACTOR)) : p[currency].semiannual,
        yearly: !edited.y && value && n ? String(n * YEARLY_FACTOR) : p[currency].yearly,
      },
    }))
  }

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error('Plan name is required')
      return
    }
    const ngn = prices.NGN
    try {
      const saved = await save.mutateAsync({
        id: plan?.id,
        name: draft.name.trim(),
        description: draft.description || null,
        // NGN stays mirrored onto the legacy plans columns — every part of
        // the app not yet updated to read plan_prices directly (there
        // shouldn't be much left, but this costs nothing) still sees the
        // right NGN price.
        price_monthly: Number(ngn.monthly) || 0,
        price_quarterly: ngn.quarterly === '' ? undefined : Number(ngn.quarterly) || 0,
        price_semiannual: ngn.semiannual === '' ? undefined : Number(ngn.semiannual) || 0,
        price_yearly: Number(ngn.yearly) || 0,
        max_users: draft.max_users === '' ? null : Number(draft.max_users),
        storage_gb: Number(draft.storage_gb) || 0,
        support_level: draft.support_level,
        highlights: draft.highlights.split('\n').map((s) => s.trim()).filter(Boolean),
        features: draft.features,
      })
      await savePrices.mutateAsync({
        planId: saved.id,
        prices: SUPPORTED_CURRENCIES.map((c) => ({
          currency: c,
          price_monthly: Number(prices[c].monthly) || 0,
          price_quarterly: prices[c].quarterly === '' ? null : Number(prices[c].quarterly) || 0,
          price_semiannual: prices[c].semiannual === '' ? null : Number(prices[c].semiannual) || 0,
          price_yearly: Number(prices[c].yearly) || 0,
        })),
      })
      toast.success(plan ? 'Plan updated' : 'Plan created')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save plan', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const p = prices[activeCurrency]
  const symbol = CURRENCY_META[activeCurrency].symbol

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : 'Create a custom plan'}</DialogTitle>
          <DialogDescription>Define pricing, limits and included features.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Plan name</Label>
              <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Professional" />
            </div>
            <div className="space-y-1.5">
              <Label>Support level</Label>
              <Input value={draft.support_level} onChange={(e) => set('support_level', e.target.value)} placeholder="Priority Email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="For growing firms" />
          </div>

          <div className="space-y-2">
            <Label>Pricing by currency</Label>
            <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {SUPPORTED_CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCurrency(c)}
                  title={CURRENCY_META[c].label}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    activeCurrency === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Monthly ({symbol})</Label>
                <Input type="number" value={p.monthly} onChange={(e) => onMonthlyChange(activeCurrency, e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Quarterly ({symbol})</Label>
                <Input
                  type="number"
                  value={p.quarterly}
                  onChange={(e) => {
                    editedRef.current[activeCurrency].q = true
                    setPrices((prev) => ({ ...prev, [activeCurrency]: { ...prev[activeCurrency], quarterly: e.target.value } }))
                  }}
                  placeholder={p.monthly ? String(Math.round(Number(p.monthly) * QUARTERLY_FACTOR)) : ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label>6 Months ({symbol})</Label>
                <Input
                  type="number"
                  value={p.semiannual}
                  onChange={(e) => {
                    editedRef.current[activeCurrency].s = true
                    setPrices((prev) => ({ ...prev, [activeCurrency]: { ...prev[activeCurrency], semiannual: e.target.value } }))
                  }}
                  placeholder={p.monthly ? String(Math.round(Number(p.monthly) * SEMIANNUAL_FACTOR)) : ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Yearly ({symbol})</Label>
                <Input
                  type="number"
                  value={p.yearly}
                  onChange={(e) => {
                    editedRef.current[activeCurrency].y = true
                    setPrices((prev) => ({ ...prev, [activeCurrency]: { ...prev[activeCurrency], yearly: e.target.value } }))
                  }}
                  placeholder={p.monthly ? String(Number(p.monthly) * YEARLY_FACTOR) : ''}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Quarterly, 6 months and yearly auto-fill from monthly (10% off quarterly, 14% off 6 months, 2 months free yearly) until you edit one
              directly — per currency, independently. Leaving a currency at 0 means this plan isn't offered in it yet.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Max users</Label>
              <Input type="number" value={draft.max_users} onChange={(e) => set('max_users', e.target.value)} placeholder="∞" />
            </div>
            <div className="space-y-1.5">
              <Label>Storage (GB)</Label>
              <Input type="number" value={draft.storage_gb} onChange={(e) => set('storage_gb', e.target.value)} />
            </div>
          </div>

          <Separator />
          <div>
            <Label>Included features</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PLAN_FEATURES.map((f) => {
                const on = draft.features[f.key]
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleFeature(f.key)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                      on ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {f.label}
                    <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', on ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Highlights (one per line)</Label>
            <Textarea
              rows={4}
              value={draft.highlights}
              onChange={(e) => set('highlights', e.target.value)}
              placeholder={'Up to 15 users\n100 GB storage\nPriority support'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending || savePrices.isPending}>
            {plan ? 'Save changes' : 'Create plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
