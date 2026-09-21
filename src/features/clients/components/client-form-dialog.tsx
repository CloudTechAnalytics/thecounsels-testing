import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useCreateClient, useUpdateClient, useCheckClientDuplicates } from '@/features/clients/hooks/use-clients'
import { clientSchema, clientDisplayName, type ClientFormValues } from '@/features/clients/schemas'
import type { DuplicateMatch } from '@/features/clients/services/clients.service'
import type { Client } from '@/shared/types/database.types'
import { BranchPicker } from '@/features/branches/components/branch-picker'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Separator } from '@/shared/components/ui/separator'
import { Badge } from '@/shared/components/ui/badge'
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

function toDefaults(client?: Client | null): ClientFormValues {
  return {
    type: client?.type ?? 'individual',
    firstName: client?.first_name ?? '',
    lastName: client?.last_name ?? '',
    companyName: client?.company_name ?? '',
    registrationNumber: client?.registration_number ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    contactName: '',
    contactTitle: '',
    contactEmail: '',
    contactPhone: '',
    website: client?.website ?? '',
    address: client?.address ?? '',
    city: client?.city ?? '',
    country: client?.country ?? '',
    status: client?.status ?? 'active',
    notes: client?.notes ?? '',
    branchId: client?.branch_id ?? '',
    occupation: client?.occupation ?? '',
    dateOfBirth: client?.date_of_birth ?? '',
    gender: client?.gender ?? '',
    identificationNumber: client?.identification_number ?? '',
    clientSince: client?.client_since ?? '',
  }
}

export function ClientFormDialog({
  client,
  open,
  onOpenChange,
  onViewExisting,
  readOnly = false,
}: {
  client?: Client | null
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Called when the user picks "View" on a duplicate match — the dialog
   * closes itself; the caller decides what "viewing" means (e.g. filter the
   * list to it). No Client Detail page exists yet to navigate to directly. */
  onViewExisting?: (displayName: string) => void
  /** For clients.view holders without clients.update — shows every field,
   * nothing editable. Always used with an existing `client`. */
  readOnly?: boolean
}) {
  const { activeOrgId, profile } = useAuth()
  const { has } = usePermissions()
  const canOverrideDuplicate = has('clients.create_duplicate')
  const create = useCreateClient(activeOrgId, profile?.id ?? null)
  const update = useUpdateClient(activeOrgId)
  const checkDuplicates = useCheckClientDuplicates(activeOrgId)

  const form = useForm<ClientFormValues>({ resolver: zodResolver(clientSchema), defaultValues: toDefaults(client) })
  const [dupMatches, setDupMatches] = React.useState<DuplicateMatch[] | null>(null)

  React.useEffect(() => {
    if (open) {
      form.reset(toDefaults(client))
      setDupMatches(null)
    }
  }, [open, client, form])

  const type = form.watch('type')

  const doCreate = async (values: ClientFormValues) => {
    await create.mutateAsync(values)
    toast.success('Client added')
    onOpenChange(false)
  }

  const onSubmit = async (values: ClientFormValues) => {
    if (readOnly) return
    try {
      if (client) {
        await update.mutateAsync({ id: client.id, values })
        toast.success('Client updated')
        onOpenChange(false)
        return
      }

      const matches = await checkDuplicates.mutateAsync({
        name: clientDisplayName(values),
        email: values.email,
        phone: values.phone,
        registrationNumber: values.registrationNumber,
      })
      if (matches.length > 0) {
        setDupMatches(matches)
        return
      }
      await doCreate(values)
    } catch (err) {
      toast.error('Could not save client', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const isExactBlock = dupMatches?.some((m) => m.match_type === 'exact') ?? false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{readOnly ? 'Client details' : client ? 'Edit client' : 'New client'}</DialogTitle>
          <DialogDescription>
            {readOnly ? 'You have view-only access to client records.' : 'Individuals and corporate clients for your firm.'}
          </DialogDescription>
        </DialogHeader>

        {dupMatches && (
          <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {isExactBlock
                    ? 'A client matching this already exists — you can\'t create a duplicate.'
                    : `This looks similar to ${dupMatches.length === 1 ? 'an existing client' : `${dupMatches.length} existing clients`}.`}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {dupMatches.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {m.display_name} <Badge variant="muted" className="ml-1 capitalize">{m.type}</Badge>
                      </span>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto shrink-0 p-0"
                        onClick={() => {
                          onOpenChange(false)
                          onViewExisting?.(m.display_name)
                        }}
                      >
                        View
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDupMatches(null)}>
                Back to editing
              </Button>
              {!isExactBlock && canOverrideDuplicate && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={create.isPending}
                  onClick={async () => {
                    try {
                      await doCreate(form.getValues())
                    } catch (err) {
                      toast.error('Could not save client', { description: err instanceof Error ? err.message : undefined })
                    }
                  }}
                >
                  Create anyway
                </Button>
              )}
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <fieldset disabled={readOnly} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="corporate">Corporate</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="prospect">Prospect</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
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
                name="clientSince"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client since</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} disabled={readOnly} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Filing in an old client? Set the real date they came on.</p>
                  </FormItem>
                )}
              />
            </div>

            {type === 'corporate' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corporation" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="registrationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registration number</FormLabel>
                      <FormControl>
                        <Input placeholder="RC 123456" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {type === 'individual' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="occupation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Occupation</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Business owner" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)} disabled={readOnly}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>Prefer not to say</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="male">Male</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of birth</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="identificationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID number</FormLabel>
                      <FormControl>
                        <Input placeholder="National ID, passport, etc." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{type === 'corporate' ? 'Company email' : 'Email'}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder={type === 'corporate' ? 'info@acme.com' : 'jane@example.com'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{type === 'corporate' ? 'Company phone' : 'Phone'}</FormLabel>
                    <FormControl>
                      <Input placeholder="+234…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {type === 'corporate' && !client && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium">Primary contact</p>
                  <p className="text-xs text-muted-foreground">
                    Who at this company your firm should actually reach out to. More contacts can be added afterward.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Doe" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="General Counsel" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="jane@acme.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+234…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input placeholder="https://" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <Separator />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="sm:col-span-3">
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Street address" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Anything worth remembering…" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </fieldset>

            <DialogFooter className="mt-4">
              {readOnly ? (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              ) : (
                <>
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={create.isPending || update.isPending || checkDuplicates.isPending}>
                    {client ? 'Save changes' : 'Add client'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
