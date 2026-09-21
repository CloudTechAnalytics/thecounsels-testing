import { z } from 'zod'

export const matterSchema = z.object({
  title: z.string().min(2, 'Enter a matter title'),
  caseNumber: z.string().optional(),
  clientId: z.string().optional(),
  practiceArea: z.string().optional(),
  status: z.enum(['open', 'pending', 'in_court', 'closed', 'won', 'lost', 'appeal', 'under_review', 'resolved']),
  priority: z.enum(['low', 'medium', 'high']),
  leadLawyerId: z.string().optional(),
  responsiblePartnerId: z.string().optional(),
  opposingCounsel: z.string().optional(),
  court: z.string().optional(),
  judge: z.string().optional(),
  description: z.string().optional(),
  branchId: z.string().optional(),
  // Editable so pre-existing matters can be filed in with their real
  // historical opening date instead of always defaulting to today.
  openedOn: z.string().optional(),
})

export type MatterFormValues = z.infer<typeof matterSchema>
