import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2 } from 'lucide-react'
import { useCreateOrganizationWithAdmin, usePlans } from '@/features/platform/hooks/use-platform'
import { createOrgWithAdminSchema, slugify, ORG_TYPES, type CreateOrgWithAdminValues } from '@/features/platform/schemas'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Separator } from '@/shared/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { formatNaira } from '@/shared/lib/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'

export function CreateOrganizationDialog() {
  const [open, setOpen] = React.useState(false)
  const createOrg = useCreateOrganizationWithAdmin()
  const { data: plans } = usePlans()
  const slugEdited = React.useRef(false)

  const form = useForm<CreateOrgWithAdminValues>({
    resolver: zodResolver(createOrgWithAdminSchema),
    defaultValues: {
      name: '',
      slug: '',
      legalName: '',
      orgType: 'customer',
      plan: 'trial',
      billingCycle: 'monthly',
      adminName: '',
      adminEmail: '',
      adminPassword: '',
    },
  })
  const selectedPlan = form.watch('plan')
  const orgType = form.watch('orgType')
  const isCustomer = orgType === 'customer'

  const onNameChange = (value: string) => {
    form.setValue('name', value)
    if (!slugEdited.current) form.setValue('slug', slugify(value), { shouldValidate: true })
  }

  const onSubmit = async (values: CreateOrgWithAdminValues) => {
    try {
      const trial = values.plan === 'trial'
      const org = await createOrg.mutateAsync({
        name: values.name,
        slug: values.slug,
        legalName: values.legalName || null,
        orgType: values.orgType,
        planId: trial ? null : values.plan,
        trial,
        billingCycle: values.billingCycle,
        adminName: values.adminName,
        adminEmail: values.adminEmail,
        adminPassword: values.adminPassword,
      })
      toast.success('Organization created', {
        description:
          values.orgType === 'customer'
            ? `${org.name} is live${trial ? ' on a 30-day trial' : ''} and its admin can sign in now.`
            : `${org.name} is live as a ${values.orgType} organization (no billing) and its admin can sign in now.`,
      })
      form.reset()
      slugEdited.current = false
      setOpen(false)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'message' in err && typeof err.message === 'string'
            ? err.message
            : 'Please try again.'
      toast.error('Could not create organization', { description: message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Building2 /> Create Organization Manually
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create an organization manually</DialogTitle>
          <DialogDescription>
            For migrations, enterprise onboarding, complimentary accounts, or internal/demo use. Normal
            customers self-register from the landing page — this doesn't replace that.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Firm name</FormLabel>
                  <FormControl>
                    <Input placeholder="Meridian Legal" value={field.value} onChange={(e) => onNameChange(e.target.value)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="meridian"
                        {...field}
                        onChange={(e) => {
                          slugEdited.current = true
                          field.onChange(e)
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="legalName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Legal name (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Meridian Legal LLP" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="orgType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ORG_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {isCustomer
                      ? 'A normal paying customer — billed per the plan below.'
                      : 'Not billed, no trial countdown. Skips subscription setup entirely.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isCustomer && (
              <>
                <Separator />
                <p className="text-sm font-semibold">Plan</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="plan"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subscription</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a plan" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="trial">Free trial — 30 days</SelectItem>
                            {plans
                              ?.filter((p) => p.is_active)
                              .map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} — {formatNaira(Number(p.price_monthly))}/mo
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billingCycle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing cycle</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={selectedPlan === 'trial'}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="semiannual">6 Months</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {selectedPlan === 'trial' ? 'Trials are billed after conversion.' : 'Applied on first renewal.'}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            <Separator />
            <div>
              <p className="text-sm font-semibold">Organization administrator</p>
              <p className="text-xs text-muted-foreground">
                This person manages the firm and creates its own users (lawyers, staff) from Firm Settings.
              </p>
            </div>

            <FormField
              control={form.control}
              name="adminName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input placeholder="Marcus Thorne" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="adminEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="admin@meridian.legal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="adminPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Temporary password</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="At least 10 characters" {...field} />
                  </FormControl>
                  <FormDescription>Share this securely; the admin can change it after signing in.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Create organization
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
