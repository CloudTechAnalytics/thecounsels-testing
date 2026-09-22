import * as React from 'react'
import { useDepartments, useJobTitles, useUpdateEmployeeProfile } from '@/features/hr/hooks/use-hr'
import { EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_META, EMPLOYMENT_TYPES, type Employee } from '@/features/hr/types'
import { useAuth } from '@/features/auth/context/auth-provider'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const NONE = '__none__'

/** Full HR profile editor — employment fields (department, title, manager,
 * status, dates) are protect_employment_fields()-gated server-side to
 * staff.manage holders regardless of what this form submits, so this
 * dialog itself is only ever opened for someone who already has that
 * permission (see employees-page.tsx). */
export function EmployeeProfileDialog({ employee, open, onOpenChange }: { employee: Employee | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeOrgId } = useAuth()
  const { data: departments } = useDepartments(activeOrgId)
  const { data: jobTitles } = useJobTitles(activeOrgId)
  const update = useUpdateEmployeeProfile(activeOrgId)

  const [form, setForm] = React.useState({
    employee_code: '', department_id: NONE, job_title_id: NONE, employment_type: 'full_time',
    employment_status: 'active', start_date: '', office_branch: '', work_email: '', bio: '',
  })

  React.useEffect(() => {
    if (!employee) return
    const p = employee.profile
    setForm({
      employee_code: p?.employee_code ?? '',
      department_id: p?.department_id ?? NONE,
      job_title_id: p?.job_title_id ?? NONE,
      employment_type: p?.employment_type ?? 'full_time',
      employment_status: p?.employment_status ?? 'active',
      start_date: p?.start_date ?? '',
      office_branch: p?.office_branch ?? '',
      work_email: p?.work_email ?? '',
      bio: p?.bio ?? '',
    })
  }, [employee])

  if (!employee) return null

  const submit = async () => {
    try {
      const { accessChange } = await update.mutateAsync({
        userId: employee.userId,
        patch: {
          employee_code: form.employee_code.trim() || null,
          department_id: form.department_id === NONE ? null : form.department_id,
          job_title_id: form.job_title_id === NONE ? null : form.job_title_id,
          employment_type: form.employment_type,
          employment_status: form.employment_status,
          start_date: form.start_date || null,
          office_branch: form.office_branch.trim() || null,
          work_email: form.work_email.trim() || null,
          bio: form.bio.trim() || null,
        },
      })
      if (accessChange === 'suspended') {
        toast.success('Employee profile updated', { description: 'Their workspace access was suspended to match — they can no longer sign in.' })
      } else if (accessChange === 'active') {
        toast.success('Employee profile updated', { description: 'Their workspace access was reactivated to match — they can sign in again.' })
      } else {
        toast.success('Employee profile updated')
      }
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not update profile', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee.fullName ?? employee.email}</DialogTitle>
          <DialogDescription>{employee.roleName} · {employee.email}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Employee ID</Label>
            <Input value={form.employee_code} onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))} placeholder="e.g. EMP-0042" />
          </div>
          <div className="space-y-1.5">
            <Label>Work email</Label>
            <Input value={form.work_email} onChange={(e) => setForm((f) => ({ ...f, work_email: e.target.value }))} type="email" />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={form.department_id} onValueChange={(v) => setForm((f) => ({ ...f, department_id: v }))}>
              <SelectTrigger><SelectValue placeholder="No department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No department</SelectItem>
                {departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Job title</Label>
            <Select value={form.job_title_id} onValueChange={(v) => setForm((f) => ({ ...f, job_title_id: v }))}>
              <SelectTrigger><SelectValue placeholder="No job title" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No job title</SelectItem>
                {jobTitles?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Employment type</Label>
            <Select value={form.employment_type} onValueChange={(v) => setForm((f) => ({ ...f, employment_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Employment status</Label>
            <Select value={form.employment_status} onValueChange={(v) => setForm((f) => ({ ...f, employment_status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{EMPLOYMENT_STATUS_META[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Office/branch</Label>
            <Input value={form.office_branch} onChange={(e) => setForm((f) => ({ ...f, office_branch: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={update.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
