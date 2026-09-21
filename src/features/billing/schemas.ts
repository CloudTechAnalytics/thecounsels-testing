import { z } from 'zod'

// Billable work must be linked to a matter — invoices find work through
// matters, so a matterless billable entry could never be billed to anyone.
export const timeEntrySchema = z
  .object({
    matterId: z.string().optional(),
    workDate: z.string().min(1, 'Pick a date'),
    hours: z.coerce.number().positive('Enter hours worked'),
    rate: z.coerce.number().min(0, 'Enter a rate'),
    description: z.string().min(2, 'Describe the work'),
    billable: z.boolean(),
    status: z.enum(['draft', 'submitted', 'approved']),
  })
  .refine((v) => !v.billable || Boolean(v.matterId), {
    message: 'Billable time must be linked to a matter',
    path: ['matterId'],
  })
export type TimeEntryFormValues = z.infer<typeof timeEntrySchema>

export const expenseSchema = z
  .object({
    matterId: z.string().optional(),
    expenseDate: z.string().min(1, 'Pick a date'),
    amount: z.coerce.number().min(0, 'Enter an amount'),
    description: z.string().min(2, 'Describe the expense'),
    category: z.string().optional(),
    billable: z.boolean(),
  })
  .refine((v) => !v.billable || Boolean(v.matterId), {
    message: 'Billable expenses must be linked to a matter',
    path: ['matterId'],
  })
export type ExpenseFormValues = z.infer<typeof expenseSchema>

export const manualInvoiceItemSchema = z.object({
  kind: z.enum(['professional_fee', 'retainer', 'other']),
  description: z.string().min(2, 'Describe this charge'),
  quantity: z.coerce.number().positive('Enter a quantity').default(1),
  unit: z.string().optional(),
  rate: z.coerce.number().min(0, 'Enter an amount'),
})
export type ManualInvoiceItemFormValues = z.infer<typeof manualInvoiceItemSchema>

// clientId is the only hard requirement — an invoice can be generated with
// zero swept time/expenses and zero manual lines is allowed by the schema
// (an empty draft, same as today); the RPC's own "at least one item to
// Mark Sent" guard (0045) is still the real, server-side enforcement of
// "an invoice needs SOMETHING on it before it goes out."
export const generateInvoiceSchema = z.object({
  clientId: z.string().min(1, 'Choose a client'),
  matterId: z.string().optional(),
  dueDate: z.string().optional(),
  taxRate: z.coerce.number().min(0).max(100),
  // null = "sweep every unbilled item for this client/matter" (legacy
  // behavior); an array (including empty) = "invoice exactly these."
  timeEntryIds: z.array(z.string()).nullable().default(null),
  expenseIds: z.array(z.string()).nullable().default(null),
  manualItems: z.array(manualInvoiceItemSchema).default([]),
})
export type GenerateInvoiceFormValues = z.infer<typeof generateInvoiceSchema>

export const paymentSchema = z.object({
  amount: z.coerce.number().positive('Enter an amount'),
  method: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  paidAt: z.string().min(1, 'Pick a date'),
})
export type PaymentFormValues = z.infer<typeof paymentSchema>

export const invoiceItemSchema = z.object({
  description: z.string().min(2, 'Describe the line item'),
  quantity: z.coerce.number().positive('Enter a quantity'),
  unit: z.string().optional(),
  rate: z.coerce.number().min(0, 'Enter a rate'),
})
export type InvoiceItemFormValues = z.infer<typeof invoiceItemSchema>

export const updateInvoiceDraftSchema = z.object({
  dueDate: z.string().optional(),
  discount: z.coerce.number().min(0, 'Enter a discount amount'),
  taxRate: z.coerce.number().min(0).max(100),
  notes: z.string().optional(),
})
export type UpdateInvoiceDraftFormValues = z.infer<typeof updateInvoiceDraftSchema>

export const voidInvoiceSchema = z.object({
  reason: z.string().min(3, 'A reason is required to void an invoice'),
})
export type VoidInvoiceFormValues = z.infer<typeof voidInvoiceSchema>
