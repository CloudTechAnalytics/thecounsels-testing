import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Search, Plus, Briefcase } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { MatterFormDialog } from '@/features/matters/components/matter-form-dialog'
import { useBranchScope } from '@/features/dashboard/hooks/use-branch-scope'
import { BranchSelector } from '@/features/dashboard/components/branch-selector'
import { MATTER_STATUS_META, MATTER_STATUSES, PRACTICE_AREAS } from '@/features/matters/types'
import type { MatterFilters } from '@/features/matters/services/matters.service'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { initialsOf } from '@/shared/lib/format'

export function MattersPage() {
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<MatterFilters['status']>('all')
  const [practiceArea, setPracticeArea] = React.useState<MatterFilters['practiceArea']>('all')
  const branchScope = useBranchScope()
  const { data, isLoading } = useMatters(activeOrgId, { search, status, practiceArea, branchId: branchScope.selectedBranchId })
  const [formOpen, setFormOpen] = React.useState(false)

  return (
    <div>
      <PageHeader
        title="Matters"
        description="Every case and engagement your firm is handling."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton
              filename="matters"
              disabled={!data?.length}
              sheets={() => [{
                name: 'Matters',
                rows: (data ?? []).map((m) => ({
                  'Matter #': m.matter_number ?? '',
                  'Case #': m.case_number ?? '',
                  Title: m.title,
                  Client: m.client?.display_name ?? '',
                  'Practice area': m.practice_area ?? '',
                  Status: MATTER_STATUS_META[m.status].label,
                  Lead: m.lead_lawyer?.full_name ?? '',
                  Opened: m.opened_on,
                })),
              }]}
            />
            {has('matters.create') && <Button onClick={() => setFormOpen(true)}><Plus /> New matter</Button>}
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or matter number…" className="pl-9" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as MatterFilters['status'])}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {MATTER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>{MATTER_STATUS_META[value].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={practiceArea} onValueChange={(v) => setPracticeArea(v)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All practice areas</SelectItem>
            {PRACTICE_AREAS.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {branchScope.canSelect && (
          <BranchSelector options={branchScope.options} value={branchScope.selectedBranchId} onChange={branchScope.setSelectedBranchId} />
        )}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : data && data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matter</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Practice area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((m) => (
                <TableRow key={m.id} className="cursor-pointer" onClick={() => navigate(`/matters/${m.id}`)}>
                  <TableCell>
                    <p className="text-sm font-medium">{m.title}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {m.matter_number}{m.case_number ? ` · Case ${m.case_number}` : ''}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{m.client?.display_name ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.practice_area ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={MATTER_STATUS_META[m.status].variant}>{MATTER_STATUS_META[m.status].label}</Badge>
                  </TableCell>
                  <TableCell>
                    {m.lead_lawyer ? (
                      <span className="inline-flex items-center gap-2 text-sm">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
                          {initialsOf(m.lead_lawyer.full_name, 'L')}
                        </span>
                        {m.lead_lawyer.full_name}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(m.opened_on), 'MMM d, yyyy')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Briefcase className="h-7 w-7" />
            </span>
            <p className="font-display text-lg font-semibold">
              {search || status !== 'all' || practiceArea !== 'all' ? 'No matters match your filters' : 'No matters yet'}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {search || status !== 'all' || practiceArea !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Open your first matter to start tracking a case.'}
            </p>
            {has('matters.create') && (
              <Button onClick={() => setFormOpen(true)} className="mt-1"><Plus /> New matter</Button>
            )}
          </div>
        )}
      </Card>

      <MatterFormDialog matter={null} open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}
