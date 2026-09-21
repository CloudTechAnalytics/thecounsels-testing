import { supabase } from '@/shared/lib/supabase'
import type { Client, ClientCommunication, ClientContact, ClientStatus, ClientType, Database, DocumentRow, Invoice, Payment, Profile } from '@/shared/types/database.types'
import { clientDisplayName, type ClientFormValues, type ContactFormValues } from '@/features/clients/schemas'
import type { TaskRow } from '@/features/tasks/types'
import type { HearingRow } from '@/features/hearings/types'
import type { ExpenseRow } from '@/features/billing/types'
import type { MatterEventRow } from '@/features/matters/types'
import { invokeEdgeFunction } from '@/shared/lib/edge-function'

/** Lightweight rows for the Client Detail page's tabs — deliberately not
 * the heavier billingService/documentsService SELECT shapes (those carry
 * embeds this page doesn't need); documents has no client_id column at
 * all (confirmed via migration history), so it's joined through matters. */
export interface ClientDocumentRow extends DocumentRow {
  matter: { id: string; matter_number: string } | null
}

export interface ClientFilters {
  search?: string
  type?: ClientType | 'all'
  status?: ClientStatus | 'all'
  branchId?: string
}

/** A client row plus how many contacts it has, for the list's badge —
 * one query, no N+1. */
export interface ClientRow extends Client {
  contacts: { count: number }[]
}

export interface ClientActivityRow extends MatterEventRow {
  matter: { id: string; title: string; matter_number: string | null } | null
}

export interface ClientCommunicationRow extends ClientCommunication {
  sent_by_profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  matter: { id: string; title: string; matter_number: string | null } | null
}

export interface DuplicateMatch {
  id: string
  display_name: string
  type: ClientType
  match_type: 'exact' | 'similar'
  score: number
}

function toRow(values: ClientFormValues) {
  return {
    type: values.type,
    display_name: clientDisplayName(values),
    first_name: values.firstName?.trim() || null,
    last_name: values.lastName?.trim() || null,
    company_name: values.companyName?.trim() || null,
    registration_number: values.registrationNumber?.trim() || null,
    email: values.email?.trim() || null,
    phone: values.phone?.trim() || null,
    website: values.website?.trim() || null,
    address: values.address?.trim() || null,
    city: values.city?.trim() || null,
    country: values.country?.trim() || null,
    status: values.status,
    notes: values.notes?.trim() || null,
    branch_id: values.branchId || null,
    occupation: values.occupation?.trim() || null,
    date_of_birth: values.dateOfBirth || null,
    gender: values.gender || null,
    identification_number: values.identificationNumber?.trim() || null,
    client_since: values.clientSince || undefined,
  }
}

export const clientsService = {
  async get(id: string): Promise<Client | null> {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data
  },

  /** Client-level invoices/payments/documents for the Detail page's tabs.
   * invoices/payments reference client_id directly (confirmed — including
   * genuine client-level invoices with no matter attached); documents
   * only has matter_id, so it's joined through matters.client_id. */
  async listInvoices(clientId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async listPayments(clientId: string): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async listDocuments(clientId: string): Promise<ClientDocumentRow[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*, matter:matters!inner(id, matter_number)')
      .eq('matter.client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as ClientDocumentRow[]
  },

  /** Tasks/hearings/expenses/timeline events all live on matter_id, not
   * client_id — same matters!inner join-through as listDocuments above, so
   * the Client Detail page can actually answer "what's happening with this
   * client" without making someone open every one of their matters one by
   * one. */
  async listTasks(clientId: string): Promise<TaskRow[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, matter:matters!inner(id, title, matter_number, status), assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url)')
      .eq('matter.client_id', clientId)
      .order('due_date', { ascending: true, nullsFirst: false })
    if (error) throw error
    return (data ?? []) as unknown as TaskRow[]
  },

  async listHearings(clientId: string): Promise<HearingRow[]> {
    const { data, error } = await supabase
      .from('hearings')
      .select('*, matter:matters!inner(id, title, matter_number, status)')
      .eq('matter.client_id', clientId)
      .order('hearing_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as HearingRow[]
  },

  async listExpenses(clientId: string): Promise<ExpenseRow[]> {
    const { data, error } = await supabase
      .from('expenses')
      .select(
        '*, matter:matters!inner(id, title, matter_number), user:profiles!expenses_user_id_fkey(id, full_name), created_by_profile:profiles!expenses_created_by_fkey(id, full_name), updated_by_profile:profiles!expenses_updated_by_fkey(id, full_name), receipts:expense_receipts(*), invoice:invoices(id, invoice_number)',
      )
      .eq('matter.client_id', clientId)
      .order('expense_date', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as ExpenseRow[]
  },

  /** Read-only aggregated timeline — the same automatic entries
   * MatterTimeline shows per-matter (status changes, documents, hearings,
   * tasks, billing), pulled across every one of this client's matters into
   * one feed. No "log an update" composer here (unlike the per-matter
   * timeline) — that writes a matter-scoped event, and picking which
   * matter it belongs to wouldn't make sense from this page. */
  async listActivity(clientId: string): Promise<ClientActivityRow[]> {
    const { data, error } = await supabase
      .from('matter_events')
      .select('*, actor:profiles(id, full_name, avatar_url), matter:matters!inner(id, title, matter_number)')
      .eq('matter.client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return (data ?? []) as unknown as ClientActivityRow[]
  },

  /** Full outbound correspondence history for a client, across every one
   * of its matters plus any client-level (no matter) messages. */
  async listCommunications(clientId: string): Promise<ClientCommunicationRow[]> {
    const { data, error } = await supabase
      .from('client_communications')
      .select(
        '*, sent_by_profile:profiles!client_communications_sent_by_fkey(id, full_name, avatar_url), matter:matters(id, title, matter_number)',
      )
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as ClientCommunicationRow[]
  },

  /** Same table, scoped strictly to one matter — for the Matter Detail
   * page's Communications tab (mirrors Tasks/Hearings/Documents there). */
  async listMatterCommunications(matterId: string): Promise<ClientCommunicationRow[]> {
    const { data, error } = await supabase
      .from('client_communications')
      .select('*, sent_by_profile:profiles!client_communications_sent_by_fkey(id, full_name, avatar_url), matter:matters(id, title, matter_number)')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as ClientCommunicationRow[]
  },

  /** Hands an already-inserted row to send-client-communication to
   * actually deliver via Resend, then re-reads it for its final SENT/
   * FAILED status. Shared by sendCommunication and resendCommunication —
   * if the invoke itself throws (network/CORS — the actual bug hit in
   * testing: this Edge Function was missing CORS headers and every send
   * failed before ever reaching it), the row is left exactly as it was
   * (PENDING) rather than silently lost; the caller still knows its id
   * and the panel's next refetch will show it, retriable/deletable per
   * migration 0149 rather than a dead end. */
  async _deliver(id: string): Promise<ClientCommunicationRow> {
    await invokeEdgeFunction('send-client-communication', { communicationId: id })
    const { data: sent, error } = await supabase
      .from('client_communications')
      .select('*, sent_by_profile:profiles!client_communications_sent_by_fkey(id, full_name, avatar_url), matter:matters(id, title, matter_number)')
      .eq('id', id)
      .single()
    if (error) throw error
    return sent as unknown as ClientCommunicationRow
  },

  /** Inserts as PENDING (RLS: clients.communicate + client/matter access),
   * then immediately hands off to _deliver. Returns the row with its
   * final status, so the composer can show a real failure inline instead
   * of a false "sent". */
  async sendCommunication(params: {
    organizationId: string
    clientId: string
    matterId?: string | null
    sentBy: string | null
    recipientName?: string | null
    recipientEmail: string
    subject: string
    body: string
  }): Promise<ClientCommunicationRow> {
    const { data, error } = await supabase
      .from('client_communications')
      .insert({
        organization_id: params.organizationId,
        client_id: params.clientId,
        matter_id: params.matterId || null,
        sent_by: params.sentBy,
        recipient_name: params.recipientName?.trim() || null,
        recipient_email: params.recipientEmail.trim(),
        subject: params.subject.trim(),
        body: params.body.trim(),
      })
      .select('id')
      .single()
    if (error) throw error
    return this._deliver(data.id)
  },

  /** Re-attempts delivery for a row that never actually sent (PENDING —
   * stuck because the invoke itself failed, e.g. the CORS bug above — or
   * FAILED — Resend rejected it, e.g. bad address). Optionally edits the
   * content first, so a typo doesn't require deleting and starting over.
   * RLS (migration 0149) refuses this update once status = 'SENT', so a
   * real delivered record can never be silently rewritten this way. */
  async resendCommunication(
    id: string,
    edits?: { recipientName?: string | null; recipientEmail?: string; subject?: string; body?: string },
  ): Promise<ClientCommunicationRow> {
    const patch: Database['public']['Tables']['client_communications']['Update'] = {
      status: 'PENDING',
      failure_reason: null,
      sent_at: null,
    }
    if (edits?.recipientName !== undefined) patch.recipient_name = edits.recipientName?.trim() || null
    if (edits?.recipientEmail !== undefined) patch.recipient_email = edits.recipientEmail.trim()
    if (edits?.subject !== undefined) patch.subject = edits.subject.trim()
    if (edits?.body !== undefined) patch.body = edits.body.trim()

    const { error } = await supabase.from('client_communications').update(patch).eq('id', id)
    if (error) throw error
    return this._deliver(id)
  },

  /** Removes a communication that never actually sent — RLS blocks this
   * once status = 'SENT' (migration 0149), so a real delivered record
   * can't be deleted this way either. */
  async deleteCommunication(id: string): Promise<void> {
    const { error } = await supabase.from('client_communications').delete().eq('id', id)
    if (error) throw error
  },

  async list(organizationId: string, filters: ClientFilters = {}): Promise<ClientRow[]> {
    let q = supabase
      .from('clients')
      .select('*, contacts:client_contacts(count)')
      .eq('organization_id', organizationId)
      .order('display_name', { ascending: true })

    if (filters.type && filters.type !== 'all') q = q.eq('type', filters.type)
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    if (filters.branchId) q = q.eq('branch_id', filters.branchId)
    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`
      // Scoped to client-level fields — per-contact name/email isn't searched here.
      q = q.or(`display_name.ilike.${s},email.ilike.${s},company_name.ilike.${s},registration_number.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as ClientRow[]
  },

  /** Exact/similar matches against existing clients, checked before create. */
  async checkDuplicates(
    organizationId: string,
    params: { name: string; email?: string; phone?: string; registrationNumber?: string; excludeId?: string },
  ): Promise<DuplicateMatch[]> {
    const { data, error } = await supabase.rpc('find_similar_clients', {
      p_org: organizationId,
      p_name: params.name,
      p_email: params.email?.trim() || null,
      p_phone: params.phone?.trim() || null,
      p_registration_number: params.registrationNumber?.trim() || null,
      p_exclude_id: params.excludeId ?? null,
    })
    if (error) throw error
    return (data ?? []) as DuplicateMatch[]
  },

  async create(organizationId: string, values: ClientFormValues, createdBy: string | null): Promise<Client> {
    const { data, error } = await supabase
      .from('clients')
      .insert({ organization_id: organizationId, created_by: createdBy, ...toRow(values) })
      .select('*')
      .single()
    if (error) throw error

    // One inline contact, if provided — same fields the old single-contact
    // form collected, now written to client_contacts instead of flat columns.
    if (values.contactName?.trim()) {
      await supabase.from('client_contacts').insert({
        organization_id: organizationId,
        client_id: data.id,
        name: values.contactName.trim(),
        title: values.contactTitle?.trim() || null,
        email: values.contactEmail?.trim() || null,
        phone: values.contactPhone?.trim() || null,
        is_primary: true,
      })
    }

    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'client.created',
      p_entity_type: 'client',
      p_entity_id: data.id,
      p_summary: `Added client ${data.display_name}`,
    })
    return data
  },

  async update(id: string, organizationId: string, values: ClientFormValues): Promise<Client> {
    const { data, error } = await supabase.from('clients').update(toRow(values)).eq('id', id).select('*').single()
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'client.updated',
      p_entity_type: 'client',
      p_entity_id: id,
      p_summary: `Updated client ${data.display_name}`,
    })
    return data
  },

  /** Matters attached to this client — used to warn before a delete that
   * now cascades (migration 0037). */
  async countMatters(clientId: string): Promise<number> {
    const { count, error } = await supabase
      .from('matters')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
    if (error) throw error
    return count ?? 0
  },

  async remove(id: string, organizationId: string, name: string, matterCount = 0): Promise<void> {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'client.deleted',
      p_entity_type: 'client',
      p_entity_id: id,
      p_summary:
        matterCount > 0
          ? `Deleted client ${name} (cascaded ${matterCount} matter${matterCount === 1 ? '' : 's'})`
          : `Deleted client ${name}`,
    })
  },

  // Contacts -------------------------------------------------------------
  async listContacts(clientId: string): Promise<ClientContact[]> {
    const { data, error } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async addContact(organizationId: string, clientId: string, values: ContactFormValues): Promise<void> {
    const { error } = await supabase.from('client_contacts').insert({
      organization_id: organizationId,
      client_id: clientId,
      name: values.name.trim(),
      title: values.title?.trim() || null,
      email: values.email?.trim() || null,
      phone: values.phone?.trim() || null,
    })
    if (error) throw error
  },

  async setPrimaryContact(clientId: string, contactId: string): Promise<void> {
    // Unique partial index allows only one primary per client — clear the
    // current one first so the swap doesn't collide with it.
    const { error: e1 } = await supabase
      .from('client_contacts')
      .update({ is_primary: false })
      .eq('client_id', clientId)
      .eq('is_primary', true)
    if (e1) throw e1
    const { error: e2 } = await supabase.from('client_contacts').update({ is_primary: true }).eq('id', contactId)
    if (e2) throw e2
  },

  async removeContact(id: string): Promise<void> {
    const { error } = await supabase.from('client_contacts').delete().eq('id', id)
    if (error) throw error
  },
}
