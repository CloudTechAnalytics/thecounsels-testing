import { z } from 'zod'

const strongPassword = z
  .string()
  .min(10, 'Use at least 10 characters')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[0-9]/, 'Add a number')

export const ORG_TYPES = ['customer', 'demo', 'internal'] as const

export const createOrgWithAdminSchema = z.object({
  name: z.string().min(2, 'Enter the firm name'),
  slug: z
    .string()
    .min(2, 'Enter a slug')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  legalName: z.string().optional(),
  orgType: z.enum(ORG_TYPES),
  // 'trial' = 14-day trial; otherwise a plan id for a paid subscription. Ignored for demo/internal.
  plan: z.string().min(1, 'Choose a plan'),
  billingCycle: z.enum(['monthly', 'quarterly', 'semiannual', 'yearly']),
  adminName: z.string().min(2, "Enter the admin's full name"),
  adminEmail: z.string().min(1, 'Email is required').email('Enter a valid email'),
  adminPassword: strongPassword,
})
export type CreateOrgWithAdminValues = z.infer<typeof createOrgWithAdminSchema>

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
}
