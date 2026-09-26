-- ============================================================================
-- Migration 0172 — Add 'semiannual' (every 6 months) to the billing_cycle enum.
--
-- Split into its own migration on purpose, same as 0121 was for quarterly:
-- Postgres won't let a freshly-added enum value be used in the same
-- transaction that added it. 0173 depends on this having committed first —
-- run them in order, never combined.
-- ============================================================================

alter type public.billing_cycle add value if not exists 'semiannual' after 'quarterly';
