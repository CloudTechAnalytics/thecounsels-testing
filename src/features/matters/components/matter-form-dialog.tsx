import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Users, Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useClients } from '@/features/clients/hooks/use-clients'
import { useCreateMatter, useUpdateMatter, useFirmMembers, useMatterAssignments } from '@/features/matters/hooks/use-matters'
import { mattersService } from '@/features/matters/services/matters.service'
import { matterSchema, type MatterFormValues } from '@/features/matters/schemas'
import { PRACTICE_AREAS, PRIORITIES, MATTER_STATUSES, MATTER_STATUS_META, type MatterRow } from '@/features/matters/types'
import { BranchPicker } from '@/features/branches/components/branch-picker'
import { memberInBranch, memberLabel } from '@/shared/lib/member-picker'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Separator } from '@/shared/components/ui/separator'
import { cn } from '@/shared/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'

const NONE = '__none__'

/** Supabase's PostgrestError puts the actionable info in `hint`, not
 * `message` — a plain `.message` can read as "row-level security policy
 * violated" with no clue which check failed. Surface both, plus the code. */
function describeSaveError(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return err instanceof Error ? err.message : undefined
  const e = err as { message?: string; hint?: string; code?: string }
  const parts = [e.message?.trim(), e.hint?.trim()].filter((s): s is string => Boolean(s))
  const text = Array.from(new Set(parts)).join(' — ')
  return e.code ? `${text || 'Unknown error'} (${e.code})` : text || undefined
}

function toDefaults(matter?: MatterRow | null): MatterFormValues {
  return {
    title: matter?.title ?? '',
    caseNumber: matter?.case_number ?? '',
    clientId: matter?.client_id ?? '',
    practiceArea: matter?.practice_area ?? '',
    status: matter?.status ?? 'open',
    priority: (matter?.priority as MatterFormValues['priority']) ?? 'medium',
    leadLawyerId: matter?.lead_lawyer_id ?? '',
    responsiblePartnerId: matter?.responsible_partner_id ?? '',
    opposingCounsel: matter?.opposing_counsel ?? '',
    court: matter?.court ?? '',
    judge: matter?.judge ?? '',
    description: matter?.description ?? '',
    branchId: matter?.branch_id ?? '',
    openedOn: matter?.opened_on ?? '',
  }
}


export function MatterFormDialog({
  matter,
  open,
  onOpenChange,
}: {
  matter?: MatterRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId, profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: clients } = useClients(activeOrgId, {})
  const { data: members } = useFirmMembers(activeOrgId)
  const create = useCreateMatter(activeOrgId, profile?.id ?? null)
  const update = useUpdateMatter(activeOrgId)

  // Assigned Team — beyond Lead Counsel/Responsible Partner, this is
  // matter_assignments (see matter-team-card.tsx, previously only reachable
  // after a matter already existed). Real reported request: surface it on
  // this form too, branch-filtered like Lead Counsel/Responsible Partner
  // already are, showing each person's role. Applied directly via
  // mattersService below rather than the useAssignMatterMember/
  // useUnassignMatterMember hooks — those close over matter?.id at render
  // time, which doesn't exist yet for a brand-new matter; the real id only
  // exists once create.mutateAsync resolves, inside onSubmit.
  const { data: existingAssignments } = useMatterAssignments(matter?.id)
  const [teamIds, setTeamIds] = React.useState<Set<string>>(new Set())

  const form = useForm<MatterFormValues>({ resolver: zodResolver(matterSchema), defaultValues: toDefaults(matter) })
  const branchIdWatch = form.watch('branchId') ?? ''
  const leadLawyerWatch = form.watch('leadLawyerId') ?? ''
  const responsiblePartnerWatch = form.watch('responsiblePartnerId') ?? ''
  const lawyerOptions = (members ?? []).filter((m) => memberInBranch(m, branchIdWatch))
  const partnerOptions = lawyerOptions.filter((m) => m.role?.key === 'partner' || m.role?.key === 'managing_partner')
  // Already covered by their own dedicated column — listing them again here
  // too would just be a confusing duplicate, not a real "someone else" pick.
  const teamOptions = lawyerOptions.filter((m) => m.user_id !== leadLawyerWatch && m.user_id !== responsiblePartnerWatch)
  const toggleTeamMember = (userId: string) => {
    setTeamIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  React.useEffect(() => {
    if (open) {
      form.reset(toDefaults(matter))
      setTeamIds(new Set((existingAssignments ?? []).map((a) => a.user_id)))
    }
    // existingAssignments intentionally excluded — it only ever needs to
    // seed the checklist once per open, not fight every toggle the user
    // makes afterward while its own query is still in flight/refetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, matter, form])

  const onSubmit = async (values: MatterFormValues) => {
    const clean: MatterFormValues = {
      ...values,
      clientId: values.clientId === NONE ? '' : values.clientId,
      practiceArea: values.practiceArea === NONE ? '' : values.practiceArea,
      leadLawyerId: values.leadLawyerId === NONE ? '' : values.leadLawyerId,
      responsiblePartnerId: values.responsiblePartnerId === NONE ? '' : values.responsiblePartnerId,
    }
    try {
      const saved = matter ? await update.mutateAsync({ id: matter.id, values: clean }) : await create.mutateAsync(clean)

      // Apply the team checklist against whatever was actually there before
      // (empty for a brand-new matter) — only the real differences, not a
      // wholesale clear-and-reinsert, so unrelated assignments' timestamps/
      // notification history aren't disturbed for people who stayed checked.
      const before = new Set((existingAssignments ?? []).map((a) => a.user_id))
      const toAdd = [...teamIds].filter((id) => !before.has(id))
      const toRemove = [...before].filter((id) => !teamIds.has(id))
      const teamErrors: unknown[] = []
      for (const userId of toAdd) {
        await mattersService.assignMember(activeOrgId!, saved.id, userId, profile?.id ?? null).catch((e) => teamErrors.push(e))
      }
      for (const userId of toRemove) {
        await mattersService.unassignMember(saved.id, userId).catch((e) => teamErrors.push(e))
      }
      if (teamErrors.length > 0) {
        toast.error('Matter saved, but the team list couldn’t be fully updated', { description: describeSaveError(teamErrors[0]) })
      }
      queryClient.invalidateQueries({ queryKey: ['matter-assignments', saved.id] })
      queryClient.invalidateQueries({ queryKey: ['matter-assignments-all'] })

      toast.success(matter ? 'Matter updated' : 'Matter opened')
      onOpenChange(false)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Matter save failed:', err)
      toast.error('Could not save matter', { description: describeSaveError(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{matter ? `Edit ${matter.matter_number}` : 'Open a new matter'}</DialogTitle>
          <DialogDescription>A matter is a case or engagement your firm handles for a client.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matter title</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Corp v. Zenith Holdings" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="caseNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Case number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. FHC/L/CS/123/2026" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>No client</SelectItem>
                        {clients?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="practiceArea"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Practice area</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select area" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {PRACTICE_AREAS.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MATTER_STATUSES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {MATTER_STATUS_META[value].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p} className="capitalize">
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="branchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch</FormLabel>
                    <BranchPicker organizationId={activeOrgId} value={field.value ?? ''} onChange={field.onChange} mode="form" restrictToViewer />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="openedOn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date opened</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Filing in an old matter? Set its real opening date.</p>
                  </FormItem>
                )}
              />
            </div>

            {/* Filtered to the branch picked above — pick a branch first
                and these narrow to people who actually work there (plus
                org-wide leadership, always eligible regardless of branch). */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="leadLawyerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Counsel</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Assign" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {lawyerOptions.map((m) => (
                          <SelectItem key={m.id} value={m.user_id}>
                            {memberLabel(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="responsiblePartnerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsible Partner</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Assign" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {partnerOptions.map((m) => (
                          <SelectItem key={m.id} value={m.user_id}>
                            {memberLabel(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            {/* matter_assignments — everyone beyond Lead Counsel/Responsible
                Partner who can access this matter (also manageable one at a
                time from the matter's own Overview tab, MatterTeamCard).
                Same branch filter as the two fields above; each row shows
                the person's role via memberLabel, same as those two. */}
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" /> Assigned team
              </FormLabel>
              {teamOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No one else in this branch to add yet.</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {teamOptions.map((m) => {
                    const checked = teamIds.has(m.user_id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleTeamMember(m.user_id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                          checked ? 'bg-primary/10 text-foreground' : 'hover:bg-accent text-muted-foreground',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                          )}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{memberLabel(m)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Beyond Lead Counsel and Responsible Partner — anyone checked here can also access this matter.
              </p>
            </FormItem>

            <Separator />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="court"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Court</FormLabel>
                    <FormControl>
                      <Input placeholder="Federal High Court" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="judge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Magistrate/Judge</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="opposingCounsel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Defendant Counsel</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Summary of the matter…" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {matter ? 'Save changes' : 'Open matter'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
