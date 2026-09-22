import * as React from 'react'
import { format } from 'date-fns'
import { Info, MoreHorizontal, Ban, RotateCcw, Trash2 } from 'lucide-react'
import { useAllMembers, usePlatformSetMembershipStatus, usePlatformRemoveMember } from '@/features/platform/hooks/use-platform'
import type { MemberDirectoryRow } from '@/features/platform/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Badge, type BadgeProps } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'
import { initialsOf } from '@/shared/lib/format'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/components/ui/sonner'

const STATUS: Record<string, BadgeProps['variant']> = {
  active: 'success',
  invited: 'warning',
  suspended: 'destructive',
  disabled: 'muted',
}

/** Platform-only escape hatch for exactly the situation that prompted this:
 * a firm needs a seat freed (e.g. remove one Managing Partner so another can
 * be added) and asking the org's own admin isn't possible/practical. Unlike
 * the firm's own Members panel, this deliberately does NOT hide actions for
 * is_owner — platform admins are the one role who should be able to do this
 * even when the target is the org's owner — but the confirm copy calls that
 * out so it's never done blind. */
function MemberActionsMenu({ member }: { member: MemberDirectoryRow }) {
  const organizationId = member.organization?.id ?? null
  const [confirmSuspend, setConfirmSuspend] = React.useState(false)
  const [confirmRemove, setConfirmRemove] = React.useState(false)
  const setStatus = usePlatformSetMembershipStatus(organizationId)
  const remove = usePlatformRemoveMember(organizationId)
  const name = member.user?.full_name ?? member.user?.email ?? 'this user'
  const suspended = member.status === 'suspended'

  const toggleSuspend = async () => {
    try {
      await setStatus.mutateAsync({ membershipId: member.id, status: suspended ? 'active' : 'suspended', name })
      toast.success(suspended ? `${name} reactivated` : `${name} deactivated`, {
        description: suspended ? 'They can sign in again.' : 'They can no longer sign in, but nothing they created was touched.',
      })
      setConfirmSuspend(false)
    } catch (err) {
      toast.error('Action failed', { description: errorMessage(err) })
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {suspended ? (
            <DropdownMenuItem onClick={toggleSuspend}>
              <RotateCcw className="h-4 w-4" /> Set active
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setConfirmSuspend(true)}>
              <Ban className="h-4 w-4" /> Set inactive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmRemove(true)}>
            <Trash2 className="h-4 w-4" /> Remove from organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmSuspend}
        onOpenChange={setConfirmSuspend}
        title="Set member inactive"
        destructive
        confirmLabel="Set inactive"
        loading={setStatus.isPending}
        description={
          <>
            {name} will immediately lose the ability to sign in to {member.organization?.name ?? 'this organization'}.
            {member.is_owner && <> <strong>This person is the organization's owner</strong> — confirm the firm has another way to manage their account before continuing.</>}
            {' '}Nothing they created (matters, documents, time entries) is affected, and this is fully reversible.
          </>
        }
        onConfirm={toggleSuspend}
      />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove from organization"
        destructive
        confirmPhrase="REMOVE"
        confirmLabel="Remove"
        loading={remove.isPending}
        description={
          <>
            {name} will permanently lose access to {member.organization?.name ?? 'this organization'}'s workspace and their seat is freed immediately.
            {member.is_owner && <> <strong>This person is the organization's owner</strong> — removing them may leave the firm without an admin unless another owner already exists.</>}
            {' '}This does not delete their account or anything they created — only their membership here.
          </>
        }
        onConfirm={async () => {
          try {
            await remove.mutateAsync({ membershipId: member.id, name })
            toast.success(`${name} removed from ${member.organization?.name ?? 'the organization'}`)
            setConfirmRemove(false)
          } catch (err) {
            toast.error('Could not remove', { description: errorMessage(err) })
          }
        }}
      />
    </>
  )
}

export function OrganizationUsersPage() {
  const { data, isLoading } = useAllMembers()
  const [orgFilter, setOrgFilter] = React.useState('all')

  // Every distinct organization actually present in the directory, not a
  // separate query — this page is already a full member list, so deriving
  // the filter options from it keeps them in sync for free and never shows
  // an org with zero users to filter by.
  const organizations = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of data ?? []) {
      if (m.organization?.id) map.set(m.organization.id, m.organization.name)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [data])

  const filtered = orgFilter === 'all' ? (data ?? []) : (data ?? []).filter((m) => m.organization?.id === orgFilter)

  return (
    <div>
      <PageHeader
        title="Organization Users"
        description="Every user across all customer firms."
        actions={
          organizations.length > 1 ? (
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-56"><SelectValue placeholder="All organizations" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All organizations</SelectItem>
                {organizations.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      <div className="mb-5 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          This is a platform oversight directory. <span className="font-medium text-foreground">Firm users are created
          by each organization's own admin</span> inside their workspace (Firm Settings) — the platform doesn't create
          or edit a firm's users directly. Setting a member inactive or removing them here is a support action for when
          a firm can't do it themselves (e.g. freeing a seat) — use Support Mode instead if you need to act inside a firm.
        </p>
      </div>

      {organizations.length > 1 && (
        <p className="mb-4 text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'user' : 'users'}
          {orgFilter !== 'all' && organizations.find(([id]) => id === orgFilter) ? ` in ${organizations.find(([id]) => id === orgFilter)![1]}` : ''}
        </p>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
                        {m.user?.avatar_url ? (
                          <img src={m.user.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initialsOf(m.user?.full_name ?? m.user?.email, 'U')
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.user?.full_name ?? '—'}</p>
                        <p className="truncate text-xs text-muted-foreground">{m.user?.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{m.organization?.name ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline">{m.role?.name ?? '—'}</Badge>
                      {m.is_owner && <Badge variant="secondary">Owner</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS[m.status] ?? 'muted'} className="capitalize">
                      {m.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.user?.last_seen_at ? format(new Date(m.user.last_seen_at), 'MMM d, yyyy') : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <MemberActionsMenu member={m} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            {data && data.length > 0
              ? 'No users match this filter.'
              : 'No users yet. They appear here once organizations start adding their team.'}
          </div>
        )}
      </Card>
    </div>
  )
}
