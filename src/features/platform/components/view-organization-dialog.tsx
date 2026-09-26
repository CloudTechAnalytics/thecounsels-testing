import type { ReactNode } from 'react'
import { format } from 'date-fns'
import type { OrgRow } from '@/features/platform/types'
import { Badge } from '@/shared/components/ui/badge'
import { Separator } from '@/shared/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { initialsOf, formatStorage, formatNaira, titleCase } from '@/shared/lib/format'
import { CYCLE_LABEL, monthlyEquivalent } from '@/shared/lib/billing-cycle'

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || '—'}</span>
    </div>
  )
}

export function ViewOrganizationDialog({
  org,
  open,
  onOpenChange,
}: {
  org: OrgRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const sub = org?.subscription
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-primary/12 text-sm font-semibold text-primary">
              {org?.logo_url ? <img src={org.logo_url} alt="" className="h-full w-full object-cover" /> : initialsOf(org?.name, 'OR')}
            </span>
            <div>
              <p>{org?.name}</p>
              <p className="text-xs font-normal text-muted-foreground">/{org?.slug}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {org && (
          <div className="space-y-1">
            <Row label="Status" value={<Badge variant="outline" className="capitalize">{org.status}</Badge>} />
            <Row label="Industry" value={org.industry} />
            <Row label="Legal name" value={org.legal_name} />
            <Row label="Website" value={org.website} />
            <Row label="Phone" value={org.phone} />
            <Row label="Billing email" value={org.billing_email} />
            <Separator className="my-2" />
            <Row label="Plan" value={sub?.plan?.name ?? titleCase(org.plan)} />
            <Row label="Subscription" value={sub ? <span className="capitalize">{sub.status}</span> : '—'} />
            <Row label="Billing cycle" value={sub ? CYCLE_LABEL[sub.billing_cycle] : '—'} />
            <Row
              label="Monthly value"
              value={sub?.plan ? formatNaira(monthlyEquivalent(sub.billing_cycle, sub.plan)) : '—'}
            />
            <Row label="Seats" value={sub?.seats} />
            <Row label="Renewal" value={sub?.current_period_end ? format(new Date(sub.current_period_end), 'PP') : '—'} />
            <Separator className="my-2" />
            <Row label="Users" value={org.member_count} />
            <Row label="Storage used" value={formatStorage(org.storage_used_bytes)} />
            <Row label="Storage limit" value={org.storage_limit_bytes ? formatStorage(org.storage_limit_bytes) : 'Not configured'} />
            <Row label="Created" value={format(new Date(org.created_at), 'PP')} />
            <Row label="Last login" value={org.last_login_at ? format(new Date(org.last_login_at), 'PPp') : 'Never'} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
