import * as React from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { useRegistrationSettings, useSelectablePlans } from '@/features/onboarding/hooks/use-onboarding'
import type { PlanWithPrices } from '@/features/onboarding/services/onboarding.service'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatNaira } from '@/shared/lib/format'
import { BILLING_CYCLES, CYCLE_LABEL, CYCLE_SUFFIX, cyclePrice, cycleDiscountPercent } from '@/shared/lib/billing-cycle'
import { ENABLED_CURRENCIES, CURRENCY_META, defaultCurrencyForCountry, type SupportedCurrency } from '@/shared/lib/currencies'
import { cn } from '@/shared/lib/utils'
import { APP } from '@/shared/config/env'
import type { BillingCycle } from '@/shared/types/database.types'

const TRIAL = 'trial' as const
type Selection = typeof TRIAL | string

/** Set by the landing page's pricing CTAs (src/features/landing/pages/landing-page.tsx)
 * when someone clicks a specific paid tier there, so registering carries that
 * intent through the account-creation + email-verification gap — a query
 * param wouldn't survive Supabase's verification-link redirect. */
const INTENDED_PLAN_KEY = 'counsel.intended_plan'

/** This plan's pricing in the chosen currency (0161/0162) — falls back to
 * the plan's own legacy single-currency columns when that's genuinely the
 * currency they represent (today, always NGN) and no plan_prices row
 * exists yet, same defensive fallback paystack-init-transaction itself
 * uses server-side. Returns null when the plan simply isn't priced in
 * this currency at all (a real possibility — not every plan has to be,
 * e.g. Enterprise is deliberately "contact sales" in every currency). */
function pricesFor(plan: PlanWithPrices, currency: SupportedCurrency) {
  const row = plan.plan_prices?.find((p) => p.currency === currency)
  if (row) return row
  if (currency === (plan.currency || 'NGN')) {
    return { price_monthly: plan.price_monthly, price_quarterly: plan.price_quarterly, price_semiannual: plan.price_semiannual, price_yearly: plan.price_yearly }
  }
  return null
}

function CardShell({
  selected,
  onSelect,
  badge,
  children,
}: {
  selected: boolean
  onSelect: () => void
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex flex-col rounded-xl border p-5 text-left transition-colors',
        selected ? 'border-primary bg-primary/5 shadow-card' : 'border-border hover:border-primary/40',
      )}
    >
      {badge}
      {children}
      <span
        className={cn(
          'absolute right-4 top-4 flex h-4 w-4 items-center justify-center rounded-full border',
          selected ? 'border-primary bg-primary' : 'border-border',
        )}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
      </span>
    </button>
  )
}

function TrialCard({ selected, onSelect, days }: { selected: boolean; onSelect: () => void; days: number }) {
  return (
    <CardShell
      selected={selected}
      onSelect={onSelect}
      badge={<Badge variant="secondary" className="absolute -top-2.5 right-4">No card required</Badge>}
    >
      <p className="flex items-center gap-1.5 font-display text-base font-semibold">
        <Sparkles className="h-4 w-4 text-primary" /> Trial
      </p>
      <p className="mt-1 font-display text-2xl font-semibold">
        Free<span className="text-sm font-normal text-muted-foreground"> · {days} days</span>
      </p>
      <ul className="mt-4 space-y-1.5">
        {['Full access, no limits', 'No payment required to start', 'Upgrade anytime from inside the app'].map((h) => (
          <li key={h} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {h}
          </li>
        ))}
      </ul>
    </CardShell>
  )
}

/** Monthly/Quarterly/6 Months/Yearly segmented control — irrelevant while Trial is
 * selected (nothing's being charged yet), so the caller only renders this
 * once a paid tier is picked. */
function CycleToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (c: BillingCycle) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
      {BILLING_CYCLES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            cycle === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {CYCLE_LABEL[c]}
        </button>
      ))}
    </div>
  )
}

/** Currency picker — popular African markets first, USD last as the
 * universal fallback for a prospect anywhere Paystack doesn't directly
 * settle locally (still works there via international card payment).
 * Only ever offers ENABLED_CURRENCIES — currently NGN only, since that's
 * all the Paystack merchant account actually supports; the caller hides
 * this whole control rather than rendering a single-option toggle. */
function CurrencyToggle({ currency, onChange }: { currency: SupportedCurrency; onChange: (c: SupportedCurrency) => void }) {
  return (
    <div className="inline-flex flex-wrap justify-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {ENABLED_CURRENCIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={CURRENCY_META[c].label}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            currency === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

function PlanCard({
  plan,
  cycle,
  currency,
  selected,
  onSelect,
}: {
  plan: PlanWithPrices
  cycle: BillingCycle
  currency: SupportedCurrency
  selected: boolean
  onSelect: () => void
}) {
  const recommended = plan.key === 'professional'
  const prices = plan.is_custom ? null : pricesFor(plan, currency)
  const discount = prices ? cycleDiscountPercent(cycle, prices) : null
  return (
    <CardShell
      selected={selected}
      onSelect={onSelect}
      badge={recommended ? <Badge variant="default" className="absolute -top-2.5 right-4">Recommended</Badge> : undefined}
    >
      <p className="font-display text-base font-semibold">{plan.name}</p>
      {plan.is_custom ? (
        <p className="mt-1 font-display text-2xl font-semibold">Custom</p>
      ) : prices ? (
        <>
          <p className="mt-1 font-display text-2xl font-semibold">
            {formatNaira(cyclePrice(cycle, prices), currency)}
            <span className="text-sm font-normal text-muted-foreground">{CYCLE_SUFFIX[cycle]}</span>
          </p>
          {discount != null && (
            <Badge variant="secondary" className="mt-1">Save {discount}%</Badge>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Not priced in {currency} yet — try another currency.</p>
      )}
      {plan.is_custom && <p className="text-xs text-muted-foreground">Tailored pricing — talk to sales</p>}
      <ul className="mt-4 space-y-1.5">
        {plan.highlights.slice(0, 4).map((h) => (
          <li key={h} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {h}
          </li>
        ))}
      </ul>
    </CardShell>
  )
}

/**
 * Onboarding Step 3 — a single list of options (Trial first, then every
 * paid tier) with one Continue button, rather than a plan grid plus a
 * separate trial-vs-subscribe fork. Selecting Trial and continuing skips
 * payment entirely; selecting a paid tier and continuing goes straight to
 * Paystack checkout ("the payment section"). Every price/limit shown comes
 * straight from the plans table, never hardcoded.
 */
export function PlanStep({
  country,
  onStartTrial,
  onSubscribeNow,
  onPayManually,
  trialLoading,
  subscribeLoading,
  manualLoading,
}: {
  /** The country picked one step earlier (firm-setup-step.tsx) — nudges the
   * currency picker's default, previously written (defaultCurrencyForCountry)
   * but never actually wired up, a real reported gap: picking Ghana there
   * did nothing to what currency showed up here. Still just a default —
   * fully overridable in the currency picker itself. Deliberately NOT used
   * to restrict which plans/currencies are offered — country (where the
   * firm is) and billing currency (what they're charged in) are separate
   * concepts; a Sierra Leone firm can still be billed in NGN. */
  country?: string | null
  onStartTrial: (planId: string, currency: string) => void
  onSubscribeNow: (planId: string, billingCycle: BillingCycle, currency: string) => void
  /** "Pay manually / Contact us" — the fallback for a country/card Paystack
   * can't take payment from today. Never a fake success; see
   * request_manual_payment() (migration 0167). */
  onPayManually: (planId: string, billingCycle: BillingCycle, currency: string) => void
  trialLoading: boolean
  subscribeLoading: boolean
  manualLoading: boolean
}) {
  // Defaults to [] on error too (not just while loading) — after retries are
  // exhausted (see useSelectablePlans), falling back to an empty list means
  // the step still renders (Trial only) instead of hanging on the skeleton
  // forever if paid plans genuinely can't be loaded.
  const { data: plans = [], isLoading } = useSelectablePlans()
  const { data: settings } = useRegistrationSettings()
  const [selected, setSelected] = React.useState<Selection | null>(null)
  const [cycle, setCycle] = React.useState<BillingCycle>('monthly')
  // Defaults from the country picked one step earlier when that's one of
  // the four with a real mapping (Nigeria/Ghana/South Africa/Kenya),
  // otherwise USD — still fully overridable right here either way.
  const [currency, setCurrency] = React.useState<SupportedCurrency>(() => defaultCurrencyForCountry(country))

  // Trial is preselected by default — it's the recommended, no-payment path
  // — unless the landing page's pricing section pointed here with a
  // specific paid tier in mind, in which case that's what's preselected.
  React.useEffect(() => {
    if (isLoading || selected) return
    const intendedKey = localStorage.getItem(INTENDED_PLAN_KEY)
    if (intendedKey) {
      localStorage.removeItem(INTENDED_PLAN_KEY)
      const match = plans.find((p) => p.key === intendedKey)
      if (match) {
        setSelected(match.id)
        return
      }
    }
    setSelected(TRIAL)
  }, [plans, selected, isLoading])

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
      </div>
    )
  }

  const selectedPlan = selected && selected !== TRIAL ? plans.find((p) => p.id === selected) ?? null : null
  const trialDays = settings?.trial_duration_days ?? 30
  // What a Trial selection actually registers on — Platform-Console-configurable,
  // falling back to Professional (the recommended tier) if unset.
  const trialPlanId = settings?.trial_plan_id ?? plans.find((p) => p.key === 'professional')?.id ?? plans[0]?.id ?? null

  const handleContinue = () => {
    if (selected === TRIAL) {
      if (trialPlanId) onStartTrial(trialPlanId, currency)
    } else if (selectedPlan) {
      onSubscribeNow(selectedPlan.id, cycle, currency)
    }
  }

  return (
    <div className="space-y-6">
      {ENABLED_CURRENCIES.length > 1 && (
        <div className="flex justify-center">
          <CurrencyToggle currency={currency} onChange={setCurrency} />
        </div>
      )}

      {/* Country (wherever the firm actually is) never determines billing
       * currency — this just says so plainly rather than leaving an
       * international visitor to guess why every price is in Naira. */}
      <p className="text-center text-xs text-muted-foreground">
        International firms are welcome. Prices are currently displayed in NGN. Customers outside
        Nigeria can pay using supported international cards or contact us for alternative payment
        arrangements.
      </p>

      {selected !== TRIAL && selectedPlan && !selectedPlan.is_custom && (
        <div className="flex justify-center">
          <CycleToggle cycle={cycle} onChange={setCycle} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <TrialCard selected={selected === TRIAL} onSelect={() => setSelected(TRIAL)} days={trialDays} />
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cycle={cycle}
            currency={currency}
            selected={plan.id === selected}
            onSelect={() => setSelected(plan.id)}
          />
        ))}
      </div>

      {selectedPlan?.is_custom ? (
        <Card className="p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Enterprise is tailored to your firm — users, storage, features, workflows, integrations and
            support are all custom.
          </p>
          <Button asChild size="lg" className="mt-4 w-full">
            <a href={`mailto:${APP.contactEmail}?subject=The Counsel — Enterprise plan`}>Contact sales</a>
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          <Button
            size="lg"
            className="w-full"
            disabled={!selected || (selected !== TRIAL && !pricesFor(selectedPlan!, currency))}
            loading={selected === TRIAL ? trialLoading : subscribeLoading}
            onClick={handleContinue}
          >
            {selected === TRIAL ? 'Start Free Trial' : 'Continue'}
          </Button>

          {/* Manual-payment fallback — quiet, not alarming, only relevant
           * once a real paid tier (not Trial) is picked. Never pretends to
           * be a real payment; just starts the "we'll verify and activate
           * it" flow (see onboarding-page.tsx's payManually). */}
          {selected !== TRIAL && selectedPlan && (
            <p className="text-center text-xs text-muted-foreground">
              Having trouble paying online?{' '}
              <button
                type="button"
                disabled={manualLoading}
                onClick={() => onPayManually(selectedPlan.id, cycle, currency)}
                className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
              >
                Contact us for alternative payment arrangements
              </button>
              .
            </p>
          )}
        </div>
      )}
    </div>
  )
}
