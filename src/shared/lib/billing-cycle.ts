import type { BillingCycle, Plan } from '@/shared/types/database.types'

export const BILLING_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'semiannual', 'yearly']

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannual: '6 Months',
  yearly: 'Yearly',
}

/** How the cycle reads next to a price, e.g. "₦50,000/quarter". */
export const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  monthly: '/month',
  quarterly: '/quarter',
  semiannual: '/6 months',
  yearly: '/year',
}

type PlanPrices = Pick<Plan, 'price_monthly' | 'price_quarterly' | 'price_semiannual' | 'price_yearly'>

const CYCLE_PRICE_KEY: Record<BillingCycle, keyof PlanPrices> = {
  monthly: 'price_monthly',
  quarterly: 'price_quarterly',
  semiannual: 'price_semiannual',
  yearly: 'price_yearly',
}

/** The sticker price for one full billing period at the given cycle — what checkout actually charges. */
export function cyclePrice(cycle: BillingCycle, plan: PlanPrices): number {
  const raw = plan[CYCLE_PRICE_KEY[cycle]]
  // An unset cycle price falls back to straight monthly × months (no discount),
  // same fallback request_manual_payment() uses server-side.
  return raw != null ? Number(raw) : Number(plan.price_monthly) * CYCLE_MONTHS[cycle]
}

/** Normalizes any cycle's price down to a monthly-equivalent, for MRR/comparison purposes. */
export function monthlyEquivalent(cycle: BillingCycle, plan: PlanPrices): number {
  return cyclePrice(cycle, plan) / CYCLE_MONTHS[cycle]
}

/** e.g. 17 for "17% off vs paying monthly" — null when there's nothing to compare (no monthly price, or this *is* monthly). */
export function cycleDiscountPercent(cycle: BillingCycle, plan: PlanPrices): number | null {
  if (cycle === 'monthly') return null
  const monthly = Number(plan.price_monthly)
  if (!monthly) return null
  const equivalentMonthly = monthlyEquivalent(cycle, plan)
  if (!equivalentMonthly) return null
  const pct = Math.round((1 - equivalentMonthly / monthly) * 100)
  return pct > 0 ? pct : null
}
