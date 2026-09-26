// ============================================================================
// Edge Function: paystack-webhook
// Public endpoint Paystack calls directly (no user session) — this is the
// ONLY place a subscription is ever marked 'active'/'past_due'/'cancelled'.
// The frontend's checkout callback page only ever reflects what this
// function has already written; it never marks anything itself.
//
// Deploy:  supabase functions deploy paystack-webhook --no-verify-jwt
// Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_...
// Register this function's URL as the webhook URL in the Paystack dashboard.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex === signature
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')
  if (!PAYSTACK_SECRET_KEY) return json({ error: 'Payment integration is not configured.' }, 400)

  // Must verify against the exact raw bytes Paystack signed — read as text
  // before any parsing, never re-serialize and compare against that instead.
  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature')
  if (!(await verifySignature(rawBody, signature, PAYSTACK_SECRET_KEY))) {
    return json({ error: 'Invalid signature' }, 401)
  }

  let event: { event: string; data: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  const data = event.data as {
    reference?: string
    amount?: number
    customer?: { customer_code?: string }
    plan?: { plan_code?: string }
    subscription_code?: string
    metadata?: { organization_id?: string; plan_id?: string; billing_cycle?: string }
    next_payment_date?: string
  }

  const organizationId = data.metadata?.organization_id
  const reference = data.reference

  // Match by whichever identifier is present — metadata survives on the
  // original charge; later subscription lifecycle events carry the
  // subscription_code but usually still echo the same reference.
  const matchOrg = async () => {
    if (organizationId) return organizationId
    if (!reference) return null
    const { data: sub } = await admin
      .from('subscriptions')
      .select('organization_id')
      .eq('paystack_transaction_reference', reference)
      .maybeSingle()
    return sub?.organization_id ?? null
  }

  switch (event.event) {
    case 'charge.success':
    case 'subscription.create': {
      const orgId = await matchOrg()
      if (!orgId) break

      // Seats must move together with plan_id — the seat limit shown/
      // enforced elsewhere (members-panel.tsx, can_add_member() RLS,
      // admin-create-user) reads subscriptions.seats directly, so an
      // upgrade that only changed plan_id would leave the org capped at
      // its old plan's seat count. subscriptions.seats is NOT NULL, so a
      // custom/Enterprise plan's max_users = null coalesces to 5 — the
      // same fallback register_organization() already uses, not a new one.
      let seats: number | undefined
      if (data.metadata?.plan_id) {
        const { data: plan } = await admin
          .from('plans')
          .select('max_users')
          .eq('id', data.metadata.plan_id)
          .maybeSingle()
        seats = plan?.max_users ?? 5
      }

      // Paystack only includes next_payment_date on transactions tied to
      // a Paystack-managed recurring Subscription (paystackBody.plan in
      // paystack-init-transaction) — plans.paystack_plan_code has never
      // actually been populated, so every checkout so far has been a
      // one-time transaction and this field has always been absent.
      // Trusting it left next_billing_date/current_period_end null on
      // every real payment. Compute it ourselves from the org's own
      // billing_cycle instead — still preferring Paystack's own value
      // when it IS present, for whenever recurring subscriptions are
      // wired up for real.
      // paystack-init-transaction already wrote the cycle just checked out
      // for onto this row before redirecting — metadata.billing_cycle (also
      // set there) is only a fallback for the unlikely case that write
      // didn't stick. Resolved once, used both for the date math below and
      // written back explicitly so this row is never left on a stale cycle
      // from before this checkout.
      const { data: existingSub } = await admin
        .from('subscriptions')
        .select('billing_cycle')
        .eq('organization_id', orgId)
        .maybeSingle()
      const billingCycle = data.metadata?.billing_cycle ?? existingSub?.billing_cycle ?? 'monthly'

      let nextBilling = data.next_payment_date ? new Date(data.next_payment_date).toISOString() : null
      if (!nextBilling) {
        const next = new Date()
        if (billingCycle === 'yearly') next.setFullYear(next.getFullYear() + 1)
        else if (billingCycle === 'semiannual') next.setMonth(next.getMonth() + 6)
        else if (billingCycle === 'quarterly') next.setMonth(next.getMonth() + 3)
        else next.setMonth(next.getMonth() + 1)
        nextBilling = next.toISOString()
      }

      await admin
        .from('subscriptions')
        .update({
          status: 'active',
          // metadata.plan_id is always the plan being paid for — this is what
          // makes an upgrade (re-checkout at the new plan's price) actually
          // switch the org onto that plan once payment is confirmed here,
          // not just re-activate whatever plan_id it already had.
          plan_id: data.metadata?.plan_id ?? undefined,
          billing_cycle: billingCycle,
          seats,
          paystack_customer_code: data.customer?.customer_code ?? undefined,
          paystack_subscription_code: data.subscription_code ?? data.plan?.plan_code ?? undefined,
          amount: data.amount != null ? data.amount / 100 : undefined,
          next_billing_date: nextBilling,
          current_period_end: nextBilling,
          last_payment_at: new Date().toISOString(),
        })
        .eq('organization_id', orgId)
      // organizations.status is a separate column from subscriptions.status
      // (only set once, at creation, to 'trial') — without this, the org
      // stayed frozen showing 'trial' in the Platform Console forever, even
      // with an active paid subscription and the correct plan already
      // showing. See migration 0071 for the one-time backfill of orgs
      // already stuck in this state.
      await admin.from('organizations').update({ status: 'active' }).eq('id', orgId)
      await admin.rpc('log_audit', {
        p_org: orgId, p_action: 'subscription.activated', p_entity_type: 'subscription',
        p_summary: 'Subscription activated via Paystack', p_platform: false,
      })
      break
    }
    case 'invoice.payment_failed': {
      const orgId = await matchOrg()
      if (!orgId) break
      // organizations.status deliberately NOT touched here — org_status has
      // no 'past_due' equivalent, and other code (RLS, access checks) may
      // treat organizations.status = 'suspended' as an actual access block.
      // One failed payment attempt shouldn't unilaterally lock a firm out;
      // that's a real grace-period/dunning policy decision, not something
      // to silently decide here.
      await admin.from('subscriptions').update({ status: 'past_due' }).eq('organization_id', orgId)
      await admin.rpc('log_audit', {
        p_org: orgId, p_action: 'subscription.payment_failed', p_entity_type: 'subscription',
        p_summary: 'A Paystack payment attempt failed', p_platform: false,
      })
      break
    }
    case 'subscription.disable': {
      const orgId = await matchOrg()
      if (!orgId) break
      await admin
        .from('subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('organization_id', orgId)
      await admin.from('organizations').update({ status: 'cancelled' }).eq('id', orgId)
      await admin.rpc('log_audit', {
        p_org: orgId, p_action: 'subscription.cancelled', p_entity_type: 'subscription',
        p_summary: 'Subscription cancelled via Paystack', p_platform: false,
      })
      break
    }
    default:
      // Every other event type is acknowledged but ignored.
      break
  }

  return json({ received: true })
})
