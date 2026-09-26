/**
 * Database types for the Supabase schema.
 *
 * These are hand-authored to match supabase/migrations. Once the Supabase CLI
 * is linked you can regenerate them from the live schema with:
 *   npm run db:types
 * which runs `supabase gen types typescript --local`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type OrgStatus = 'trial' | 'active' | 'suspended' | 'cancelled'
export type OrganizationType = 'customer' | 'demo' | 'internal'
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'disabled'
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'
export type AccessScope = 'organization' | 'branch' | 'multiple_branches' | 'personal'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired' | 'suspended' | 'awaiting_payment'
export type BillingCycle = 'monthly' | 'quarterly' | 'semiannual' | 'yearly'
export type ClientType = 'individual' | 'corporate'
export type ClientStatus = 'active' | 'inactive' | 'prospect'
export type MatterStatus = 'open' | 'pending' | 'in_court' | 'closed' | 'won' | 'lost' | 'appeal' | 'under_review' | 'resolved'
export type HearingType = 'mention' | 'hearing' | 'trial' | 'ruling' | 'motion' | 'conference' | 'other'
export type HearingStatus = 'scheduled' | 'adjourned' | 'held' | 'cancelled'
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type NotificationLogChannel = 'IN_APP' | 'EMAIL' | 'WHATSAPP'
export type NotificationLogStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED'
export type ClientCommunicationStatus = 'PENDING' | 'SENT' | 'FAILED'
/** Per-event-type channel opt-in, keyed to match notification_preferences.task_channel_prefs (migration 0057). */
export type TaskChannelEvent =
  | 'assigned'
  | 'due_soon'
  | 'overdue'
  | 'completed'
  | 'reassigned'
  | 'hearing_reminder'
  | 'appointment_assigned'
  | 'appointment_reminder'
export type TaskChannelPrefs = Record<TaskChannelEvent, { email: boolean; whatsapp: boolean }>
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'void'
export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'invoiced' | 'paid'
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'
export type NotificationPriority = 'info' | 'reminder' | 'warning' | 'urgent'
export type NotificationCategory = 'matters' | 'clients' | 'hearings' | 'billing' | 'tasks' | 'documents' | 'notes' | 'messaging' | 'hr' | 'appointments' | 'support'
export type SupportSessionStatus = 'pending' | 'active' | 'denied' | 'ended'
export type DataExportStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type RoleKey =
  | 'platform_owner'
  | 'platform_admin'
  | 'managing_partner'
  | 'partner'
  | 'senior_associate'
  | 'associate'
  | 'junior_associate'
  | 'paralegal'
  | 'finance'
  | 'hr'
  | 'secretary'
  | 'receptionist'
  | 'litigation_clerk'
  | 'hr_administrator'
  | 'hr_manager'
  | 'hr_officer'
  | 'it_administrator'

type Timestamps = {
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          legal_name: string | null
          logo_url: string | null
          primary_color: string
          status: OrgStatus
          plan: string
          billing_email: string | null
          phone: string | null
          website: string | null
          timezone: string
          settings: Json
          industry: string | null
          storage_used_bytes: number
          last_login_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          organization_type: OrganizationType
        } & Timestamps
        Insert: {
          id?: string
          name: string
          slug: string
          legal_name?: string | null
          logo_url?: string | null
          primary_color?: string
          status?: OrgStatus
          plan?: string
          billing_email?: string | null
          phone?: string | null
          website?: string | null
          timezone?: string
          settings?: Json
          industry?: string | null
          storage_used_bytes?: number
          last_login_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          organization_type?: OrganizationType
        }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          phone: string | null
          title: string | null
          is_platform_admin: boolean
          platform_role: string | null
          default_organization_id: string | null
          last_seen_at: string | null
          must_change_password: boolean
        } & Timestamps
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          phone?: string | null
          title?: string | null
          is_platform_admin?: boolean
          platform_role?: string | null
          default_organization_id?: string | null
          last_seen_at?: string | null
          must_change_password?: boolean
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      permissions: {
        Row: {
          id: string
          key: string
          resource: string
          action: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          key: string
          resource: string
          action: string
          description?: string | null
        }
        Update: Partial<Database['public']['Tables']['permissions']['Insert']>
        Relationships: []
      }
      roles: {
        Row: {
          id: string
          organization_id: string | null
          key: RoleKey | null
          name: string
          description: string | null
          rank: number
          is_system: boolean
        } & Timestamps
        Insert: {
          id?: string
          organization_id?: string | null
          key?: RoleKey | null
          name: string
          description?: string | null
          rank?: number
          is_system?: boolean
        }
        Update: Partial<Database['public']['Tables']['roles']['Insert']>
        Relationships: []
      }
      role_permissions: {
        Row: { role_id: string; permission_id: string }
        Insert: { role_id: string; permission_id: string }
        Update: Partial<{ role_id: string; permission_id: string }>
        Relationships: [
          {
            foreignKeyName: 'role_permissions_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'role_permissions_permission_id_fkey'
            columns: ['permission_id']
            isOneToOne: false
            referencedRelation: 'permissions'
            referencedColumns: ['id']
          },
        ]
      }
      branches: {
        Row: {
          id: string
          organization_id: string
          name: string
          code: string | null
          address: string | null
          city: string | null
          state: string | null
          country: string | null
          phone: string | null
          email: string | null
          is_head_office: boolean
          is_active: boolean
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          name: string
          code?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          country?: string | null
          phone?: string | null
          email?: string | null
          is_head_office?: boolean
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['branches']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'branches_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      member_branches: {
        Row: {
          id: string
          organization_id: string
          membership_id: string
          branch_id: string
          assigned_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          membership_id: string
          branch_id: string
          assigned_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['member_branches']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'member_branches_membership_id_fkey'
            columns: ['membership_id']
            isOneToOne: false
            referencedRelation: 'memberships'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'member_branches_branch_id_fkey'
            columns: ['branch_id']
            isOneToOne: false
            referencedRelation: 'branches'
            referencedColumns: ['id']
          },
        ]
      }
      invitation_branches: {
        Row: { id: string; invitation_id: string; branch_id: string }
        Insert: { id?: string; invitation_id: string; branch_id: string }
        Update: Partial<Database['public']['Tables']['invitation_branches']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'invitation_branches_invitation_id_fkey'
            columns: ['invitation_id']
            isOneToOne: false
            referencedRelation: 'invitations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invitation_branches_branch_id_fkey'
            columns: ['branch_id']
            isOneToOne: false
            referencedRelation: 'branches'
            referencedColumns: ['id']
          },
        ]
      }
      memberships: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role_id: string
          status: MembershipStatus
          is_owner: boolean
          title: string | null
          invited_by: string | null
          invited_at: string | null
          joined_at: string | null
          access_scope: AccessScope
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role_id: string
          status?: MembershipStatus
          is_owner?: boolean
          title?: string | null
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
          access_scope?: AccessScope
        }
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'memberships_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'roles'
            referencedColumns: ['id']
          },
        ]
      }
      invitations: {
        Row: {
          id: string
          organization_id: string
          email: string
          role_id: string
          token: string
          status: InvitationStatus
          invited_by: string | null
          message: string | null
          expires_at: string
          accepted_at: string | null
          access_scope: AccessScope
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          email: string
          role_id: string
          token?: string
          status?: InvitationStatus
          invited_by?: string | null
          message?: string | null
          expires_at?: string
          accepted_at?: string | null
          access_scope?: AccessScope
        }
        Update: Partial<Database['public']['Tables']['invitations']['Insert']>
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          organization_id: string | null
          actor_id: string | null
          action: string
          entity_type: string | null
          entity_id: string | null
          summary: string | null
          metadata: Json
          ip_address: string | null
          created_at: string
          is_platform_action: boolean
          branch_id: string | null
        }
        Insert: {
          id?: string
          organization_id?: string | null
          actor_id?: string | null
          action: string
          entity_type?: string | null
          entity_id?: string | null
          summary?: string | null
          metadata?: Json
          ip_address?: string | null
          is_platform_action?: boolean
          branch_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          key: string | null
          name: string
          description: string | null
          currency: string
          price_monthly: number
          price_quarterly: number | null
          price_semiannual: number | null
          price_yearly: number
          max_users: number | null
          storage_gb: number
          support_level: string
          features: Json
          highlights: string[]
          is_custom: boolean
          is_active: boolean
          sort_order: number
          trial_duration_days: number | null
          paystack_plan_code: string | null
        } & Timestamps
        Insert: {
          id?: string
          key?: string | null
          name: string
          description?: string | null
          currency?: string
          price_monthly?: number
          price_quarterly?: number | null
          price_semiannual?: number | null
          price_yearly?: number
          max_users?: number | null
          storage_gb?: number
          support_level?: string
          features?: Json
          highlights?: string[]
          is_custom?: boolean
          is_active?: boolean
          sort_order?: number
          trial_duration_days?: number | null
          paystack_plan_code?: string | null
        }
        Update: Partial<Database['public']['Tables']['plans']['Insert']>
        Relationships: []
      }
      plan_prices: {
        Row: {
          id: string
          plan_id: string
          currency: string
          price_monthly: number
          price_quarterly: number | null
          price_semiannual: number | null
          price_yearly: number
        } & Timestamps
        Insert: {
          id?: string
          plan_id: string
          currency: string
          price_monthly?: number
          price_quarterly?: number | null
          price_semiannual?: number | null
          price_yearly?: number
        }
        Update: Partial<Database['public']['Tables']['plan_prices']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'plan_prices_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          },
        ]
      }
      registration_settings: {
        Row: {
          id: boolean
          trial_enabled: boolean
          trial_duration_days: number
          trial_plan_id: string | null
          trial_future_price: number | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          trial_enabled?: boolean
          trial_duration_days?: number
          trial_plan_id?: string | null
          trial_future_price?: number | null
        }
        Update: Partial<Database['public']['Tables']['registration_settings']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'registration_settings_trial_plan_id_fkey'
            columns: ['trial_plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          },
        ]
      }
      clients: {
        Row: {
          id: string
          organization_id: string
          type: ClientType
          display_name: string
          first_name: string | null
          last_name: string | null
          company_name: string | null
          email: string | null
          phone: string | null
          website: string | null
          address: string | null
          city: string | null
          country: string | null
          status: ClientStatus
          notes: string | null
          created_by: string | null
          registration_number: string | null
          branch_id: string | null
          occupation: string | null
          date_of_birth: string | null
          gender: string | null
          identification_number: string | null
          client_since: string
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          type?: ClientType
          display_name: string
          first_name?: string | null
          last_name?: string | null
          company_name?: string | null
          email?: string | null
          phone?: string | null
          website?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          status?: ClientStatus
          notes?: string | null
          created_by?: string | null
          registration_number?: string | null
          branch_id?: string | null
          occupation?: string | null
          date_of_birth?: string | null
          gender?: string | null
          identification_number?: string | null
          client_since?: string
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'clients_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'clients_branch_id_fkey'
            columns: ['branch_id']
            isOneToOne: false
            referencedRelation: 'branches'
            referencedColumns: ['id']
          },
        ]
      }
      client_contacts: {
        Row: {
          id: string
          organization_id: string
          client_id: string
          name: string
          title: string | null
          email: string | null
          phone: string | null
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          client_id: string
          name: string
          title?: string | null
          email?: string | null
          phone?: string | null
          is_primary?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['client_contacts']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'client_contacts_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
        ]
      }
      matters: {
        Row: {
          id: string
          organization_id: string
          matter_number: string | null
          title: string
          description: string | null
          client_id: string | null
          practice_area: string | null
          status: MatterStatus
          lead_lawyer_id: string | null
          responsible_partner_id: string | null
          opposing_counsel: string | null
          court: string | null
          judge: string | null
          priority: string
          opened_on: string
          closed_on: string | null
          created_by: string | null
          ai_summary: string | null
          ai_summary_generated_at: string | null
          branch_id: string | null
          case_number: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          matter_number?: string | null
          title: string
          description?: string | null
          client_id?: string | null
          practice_area?: string | null
          status?: MatterStatus
          lead_lawyer_id?: string | null
          responsible_partner_id?: string | null
          opposing_counsel?: string | null
          court?: string | null
          judge?: string | null
          priority?: string
          opened_on?: string
          closed_on?: string | null
          created_by?: string | null
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          branch_id?: string | null
          case_number?: string | null
        }
        Update: Partial<Database['public']['Tables']['matters']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'matters_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'matters_lead_lawyer_id_fkey'
            columns: ['lead_lawyer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'matters_branch_id_fkey'
            columns: ['branch_id']
            isOneToOne: false
            referencedRelation: 'branches'
            referencedColumns: ['id']
          },
        ]
      }
      matter_assignments: {
        Row: {
          id: string
          organization_id: string
          matter_id: string
          user_id: string
          assigned_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          matter_id: string
          user_id: string
          assigned_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['matter_assignments']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'matter_assignments_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      matter_branch_shares: {
        Row: {
          id: string
          organization_id: string
          matter_id: string
          branch_id: string
          shared_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          matter_id: string
          branch_id: string
          shared_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['matter_branch_shares']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'matter_branch_shares_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'matter_branch_shares_branch_id_fkey'
            columns: ['branch_id']
            isOneToOne: false
            referencedRelation: 'branches'
            referencedColumns: ['id']
          },
        ]
      }
      matter_notes: {
        Row: {
          id: string
          organization_id: string
          matter_id: string
          author_id: string | null
          body: string
          created_at: string
          updated_at: string | null
          edited_by: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          matter_id: string
          author_id?: string | null
          body: string
          created_at?: string
          updated_at?: string | null
          edited_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['matter_notes']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'matter_notes_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'matter_notes_edited_by_fkey'
            columns: ['edited_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      tasks: {
        Row: {
          id: string
          organization_id: string
          matter_id: string | null
          title: string
          description: string | null
          status: TaskStatus
          priority: TaskPriority
          assignee_id: string | null
          due_date: string | null
          completed_at: string | null
          completed_by: string | null
          is_overdue: boolean
          reminder_24h_sent_at: string | null
          reminder_1h_sent_at: string | null
          overdue_last_notified_at: string | null
          created_by: string | null
          branch_id: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          matter_id?: string | null
          title: string
          description?: string | null
          status?: TaskStatus
          priority?: TaskPriority
          assignee_id?: string | null
          due_date?: string | null
          completed_at?: string | null
          completed_by?: string | null
          is_overdue?: boolean
          reminder_24h_sent_at?: string | null
          reminder_1h_sent_at?: string | null
          overdue_last_notified_at?: string | null
          created_by?: string | null
          branch_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'tasks_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_assignee_id_fkey'
            columns: ['assignee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      platform_settings: {
        Row: {
          id: boolean
          product_name: string
          support_email: string | null
          primary_color: string
          allow_org_creation: boolean
          default_trial_days: number
          maintenance_mode: boolean
          maintenance_message: string | null
          global_notice: string | null
          feature_flags: Json
          smtp: Json
          updated_at: string
        }
        Insert: {
          id?: boolean
          product_name?: string
          support_email?: string | null
          primary_color?: string
          allow_org_creation?: boolean
          default_trial_days?: number
          maintenance_mode?: boolean
          maintenance_message?: string | null
          global_notice?: string | null
          feature_flags?: Json
          smtp?: Json
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['platform_settings']['Insert']>
        Relationships: []
      }
      support_sessions: {
        Row: {
          id: string
          organization_id: string
          admin_id: string | null
          reason: string | null
          status: SupportSessionStatus
          granted_by: string | null
          granted_at: string | null
          denied_at: string | null
          started_at: string
          expires_at: string
          ended_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          admin_id?: string | null
          reason?: string | null
          status?: SupportSessionStatus
          granted_by?: string | null
          granted_at?: string | null
          denied_at?: string | null
          started_at?: string
          expires_at: string
          ended_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['support_sessions']['Insert']>
        Relationships: []
      }
      data_export_requests: {
        Row: {
          id: string
          organization_id: string
          requested_by: string | null
          status: DataExportStatus
          file_path: string | null
          error: string | null
          requested_at: string
          completed_at: string | null
          expires_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          requested_by?: string | null
          status?: DataExportStatus
          file_path?: string | null
          error?: string | null
          requested_at?: string
          completed_at?: string | null
          expires_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['data_export_requests']['Insert']>
        Relationships: []
      }
      support_tickets: {
        Row: {
          id: string
          organization_id: string
          ticket_number: string | null
          subject: string
          status: TicketStatus
          priority: TicketPriority
          created_by: string | null
          assignee_id: string | null
          support_session_id: string | null
          resolved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          ticket_number?: string | null
          subject: string
          status?: TicketStatus
          priority?: TicketPriority
          created_by?: string | null
          assignee_id?: string | null
          support_session_id?: string | null
          resolved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['support_tickets']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'support_tickets_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_tickets_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_tickets_assignee_id_fkey'
            columns: ['assignee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_tickets_support_session_id_fkey'
            columns: ['support_session_id']
            isOneToOne: false
            referencedRelation: 'support_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          id: string
          ticket_id: string
          author_id: string | null
          from_platform: boolean
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          author_id?: string | null
          from_platform?: boolean
          body: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['support_ticket_messages']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'support_ticket_messages_ticket_id_fkey'
            columns: ['ticket_id']
            isOneToOne: false
            referencedRelation: 'support_tickets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'support_ticket_messages_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      staff_profiles: {
        Row: {
          organization_id: string
          user_id: string
          bar_number: string | null
          year_admitted: number | null
          qualifications: string[]
          specializations: string[]
          hourly_rate: number | null
          bio: string | null
          availability: string
          phone: string | null
          updated_at: string
          employee_code: string | null
          department_id: string | null
          job_title_id: string | null
          manager_id: string | null
          employment_type: string
          employment_status: string
          start_date: string | null
          end_date: string | null
          office_branch: string | null
          address: string | null
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          work_email: string | null
          branch_id: string | null
        }
        Insert: {
          organization_id: string
          user_id: string
          bar_number?: string | null
          year_admitted?: number | null
          qualifications?: string[]
          specializations?: string[]
          hourly_rate?: number | null
          bio?: string | null
          availability?: string
          phone?: string | null
          updated_at?: string
          employee_code?: string | null
          department_id?: string | null
          job_title_id?: string | null
          manager_id?: string | null
          employment_type?: string
          employment_status?: string
          start_date?: string | null
          end_date?: string | null
          office_branch?: string | null
          address?: string | null
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          work_email?: string | null
          branch_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['staff_profiles']['Insert']>
        Relationships: []
      }
      departments: {
        Row: { id: string; organization_id: string; name: string; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['departments']['Insert']>
        Relationships: []
      }
      job_titles: {
        Row: { id: string; organization_id: string; name: string; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['job_titles']['Insert']>
        Relationships: []
      }
      leave_types: {
        Row: {
          id: string
          organization_id: string
          name: string
          default_entitlement_days: number
          requires_approval: boolean
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          default_entitlement_days?: number
          requires_approval?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['leave_types']['Insert']>
        Relationships: []
      }
      leave_balances: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          leave_type_id: string
          year: number
          entitlement_days: number
          used_days: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          leave_type_id: string
          year: number
          entitlement_days?: number
          used_days?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leave_balances']['Insert']>
        Relationships: []
      }
      leave_requests: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          leave_type_id: string
          start_date: string
          end_date: string
          days: number
          reason: string | null
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          review_comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          leave_type_id: string
          start_date: string
          end_date: string
          days: number
          reason?: string | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_comment?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['leave_requests']['Insert']>
        Relationships: []
      }
      hr_requests: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          request_type: string
          subject: string
          details: string | null
          status: string
          handled_by: string | null
          handled_at: string | null
          resolution_note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          request_type: string
          subject: string
          details?: string | null
          status?: string
          handled_by?: string | null
          handled_at?: string | null
          resolution_note?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['hr_requests']['Insert']>
        Relationships: []
      }
      onboarding_templates: {
        Row: { id: string; organization_id: string; name: string; items: Json; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; items?: Json; created_at?: string }
        Update: Partial<Database['public']['Tables']['onboarding_templates']['Insert']>
        Relationships: []
      }
      employee_onboarding: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          template_id: string
          assigned_by: string | null
          assigned_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          template_id: string
          assigned_by?: string | null
          assigned_at?: string
        }
        Update: Partial<Database['public']['Tables']['employee_onboarding']['Insert']>
        Relationships: []
      }
      onboarding_task_links: {
        Row: { id: string; organization_id: string; employee_onboarding_id: string; task_id: string }
        Insert: { id?: string; organization_id: string; employee_onboarding_id: string; task_id: string }
        Update: Partial<Database['public']['Tables']['onboarding_task_links']['Insert']>
        Relationships: []
      }
      matter_ai_chat_messages: {
        Row: {
          id: string
          organization_id: string
          matter_id: string
          user_id: string
          role: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          matter_id: string
          user_id: string
          role: string
          content: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['matter_ai_chat_messages']['Insert']>
        Relationships: []
      }
      assistant_messages: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          conversation_id: string
          role: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          conversation_id: string
          role: string
          content: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['assistant_messages']['Insert']>
        Relationships: []
      }
      assistant_conversations: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          title: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          title?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['assistant_conversations']['Insert']>
        Relationships: []
      }
      task_comments: {
        Row: {
          id: string
          organization_id: string
          task_id: string
          user_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          task_id: string
          user_id: string
          body: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['task_comments']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'task_comments_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_comments_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      }
      hr_announcements: {
        Row: {
          id: string
          organization_id: string
          title: string
          body: string
          audience_type: string
          audience_department_id: string | null
          audience_user_ids: string[]
          audience_branch: string | null
          audience_role_key: RoleKey | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          title: string
          body: string
          audience_type?: string
          audience_department_id?: string | null
          audience_user_ids?: string[]
          audience_role_key?: RoleKey | null
          audience_branch?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['hr_announcements']['Insert']>
        Relationships: []
      }
      hr_employee_documents: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          category: string
          display_name: string
          storage_path: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          category: string
          display_name: string
          storage_path: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['hr_employee_documents']['Insert']>
        Relationships: []
      }
      hearings: {
        Row: {
          id: string
          organization_id: string
          matter_id: string | null
          title: string
          hearing_at: string
          duration_minutes: number | null
          location: string | null
          court: string | null
          judge: string | null
          type: HearingType
          status: HearingStatus
          outcome: string | null
          notes: string | null
          created_by: string | null
          branch_id: string | null
          assigned_lawyer_id: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          matter_id?: string | null
          title: string
          hearing_at: string
          duration_minutes?: number | null
          location?: string | null
          court?: string | null
          judge?: string | null
          type?: HearingType
          status?: HearingStatus
          outcome?: string | null
          notes?: string | null
          created_by?: string | null
          branch_id?: string | null
          assigned_lawyer_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['hearings']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'hearings_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
        ]
      }
      hearing_supporting_lawyers: {
        Row: {
          id: string
          organization_id: string
          hearing_id: string
          user_id: string
          assigned_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          hearing_id: string
          user_id: string
          assigned_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['hearing_supporting_lawyers']['Insert']>
        Relationships: []
      }
      appointments: {
        Row: {
          id: string
          organization_id: string
          client_id: string | null
          matter_id: string | null
          title: string
          appointment_at: string
          duration_minutes: number | null
          location: string | null
          assigned_to_id: string | null
          status: AppointmentStatus
          notes: string | null
          created_by: string | null
          branch_id: string | null
          reminder_24h_sent_at: string | null
          reminder_1h_sent_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          client_id?: string | null
          matter_id?: string | null
          title: string
          appointment_at: string
          duration_minutes?: number | null
          location?: string | null
          assigned_to_id?: string | null
          status?: AppointmentStatus
          notes?: string | null
          created_by?: string | null
          branch_id?: string | null
          reminder_24h_sent_at?: string | null
          reminder_1h_sent_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['appointments']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'appointments_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_assigned_to_id_fkey'
            columns: ['assigned_to_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      matter_events: {
        Row: {
          id: string
          organization_id: string
          matter_id: string
          actor_id: string | null
          kind: string
          summary: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          matter_id: string
          actor_id?: string | null
          kind: string
          summary: string
          metadata?: Json
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['matter_events']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'matter_events_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      documents: {
        Row: {
          id: string
          organization_id: string
          matter_id: string | null
          name: string
          display_name: string
          storage_path: string
          mime_type: string | null
          size_bytes: number | null
          category: string | null
          uploaded_by: string | null
          created_at: string
          branch_id: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          matter_id?: string | null
          name: string
          display_name: string
          storage_path: string
          mime_type?: string | null
          size_bytes?: number | null
          category?: string | null
          uploaded_by?: string | null
          created_at?: string
          branch_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['documents']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'documents_uploaded_by_fkey'
            columns: ['uploaded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      time_entries: {
        Row: {
          id: string
          organization_id: string
          matter_id: string | null
          user_id: string | null
          work_date: string
          minutes: number
          rate: number
          description: string
          billable: boolean
          invoiced: boolean
          invoice_id: string | null
          status: TimeEntryStatus
          created_by: string | null
          updated_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          matter_id?: string | null
          user_id?: string | null
          work_date?: string
          minutes: number
          rate?: number
          description: string
          billable?: boolean
          invoiced?: boolean
          invoice_id?: string | null
          status?: TimeEntryStatus
          created_by?: string | null
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['time_entries']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'time_entries_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'time_entries_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'time_entries_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      expenses: {
        Row: {
          id: string
          organization_id: string
          matter_id: string | null
          user_id: string | null
          expense_date: string
          amount: number
          description: string
          category: string | null
          billable: boolean
          invoiced: boolean
          invoice_id: string | null
          created_by: string | null
          updated_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          matter_id?: string | null
          user_id?: string | null
          expense_date?: string
          amount: number
          description: string
          category?: string | null
          billable?: boolean
          invoiced?: boolean
          invoice_id?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'expenses_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
        ]
      }
      expense_receipts: {
        Row: {
          id: string
          organization_id: string
          expense_id: string
          storage_path: string
          file_name: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          expense_id: string
          storage_path: string
          file_name: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['expense_receipts']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'expense_receipts_expense_id_fkey'
            columns: ['expense_id']
            isOneToOne: false
            referencedRelation: 'expenses'
            referencedColumns: ['id']
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          organization_id: string
          invoice_number: string | null
          client_id: string | null
          matter_id: string | null
          status: InvoiceStatus
          issue_date: string
          due_date: string | null
          subtotal: number
          tax: number
          total: number
          amount_paid: number
          discount: number
          tax_rate: number
          void_reason: string | null
          notes: string | null
          created_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          invoice_number?: string | null
          client_id?: string | null
          matter_id?: string | null
          status?: InvoiceStatus
          issue_date?: string
          due_date?: string | null
          subtotal?: number
          tax?: number
          total?: number
          amount_paid?: number
          discount?: number
          tax_rate?: number
          void_reason?: string | null
          notes?: string | null
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'invoices_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoices_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
        ]
      }
      invoice_items: {
        Row: {
          id: string
          organization_id: string
          invoice_id: string
          kind: string
          description: string
          quantity: number
          unit: string | null
          rate: number
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          invoice_id: string
          kind?: string
          description: string
          quantity?: number
          unit?: string | null
          rate?: number
          amount?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['invoice_items']['Insert']>
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          organization_id: string
          invoice_id: string
          client_id: string | null
          matter_id: string | null
          payment_number: string | null
          receipt_number: string | null
          amount: number
          method: string | null
          reference: string | null
          notes: string | null
          paid_at: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          invoice_id: string
          client_id?: string | null
          matter_id?: string | null
          payment_number?: string | null
          receipt_number?: string | null
          amount: number
          method?: string | null
          reference?: string | null
          notes?: string | null
          paid_at?: string
          created_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          organization_id: string
          plan_id: string | null
          status: SubscriptionStatus
          billing_cycle: BillingCycle
          seats: number
          auto_renew: boolean
          trial_ends_at: string | null
          current_period_end: string | null
          cancelled_at: string | null
          paystack_customer_code: string | null
          paystack_subscription_code: string | null
          paystack_transaction_reference: string | null
          amount: number | null
          currency: string
          cancellation_reason: string | null
          next_billing_date: string | null
          scheduled_plan_id: string | null
          scheduled_billing_cycle: BillingCycle | null
          scheduled_change_at: string | null
          last_trial_reminder_days: number | null
          last_payment_at: string | null
          additional_storage_gb: number
          billing_country: string | null
          payment_method: string
          payment_status: string
          provider: string
        } & Timestamps
        Insert: {
          id?: string
          organization_id: string
          plan_id?: string | null
          status?: SubscriptionStatus
          billing_cycle?: BillingCycle
          seats?: number
          auto_renew?: boolean
          trial_ends_at?: string | null
          current_period_end?: string | null
          cancelled_at?: string | null
          paystack_customer_code?: string | null
          paystack_subscription_code?: string | null
          paystack_transaction_reference?: string | null
          amount?: number | null
          currency?: string
          cancellation_reason?: string | null
          next_billing_date?: string | null
          scheduled_plan_id?: string | null
          scheduled_billing_cycle?: BillingCycle | null
          scheduled_change_at?: string | null
          last_trial_reminder_days?: number | null
          last_payment_at?: string | null
          additional_storage_gb?: number
          billing_country?: string | null
          payment_method?: string
          payment_status?: string
          provider?: string
        }
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'subscriptions_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: true
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subscriptions_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          },
        ]
      }
      client_error_logs: {
        Row: {
          id: string
          organization_id: string | null
          user_id: string | null
          message: string
          stack: string | null
          component_stack: string | null
          url: string | null
          user_agent: string | null
          environment: string | null
          context: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          user_id?: string | null
          message: string
          stack?: string | null
          component_stack?: string | null
          url?: string | null
          user_agent?: string | null
          environment?: string | null
          context?: Json | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['client_error_logs']['Insert']>
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          actor_id: string | null
          category: NotificationCategory
          action: string
          entity_type: string | null
          entity_id: string | null
          title: string
          priority: NotificationPriority
          is_read: boolean
          read_at: string | null
          is_archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          actor_id?: string | null
          category: NotificationCategory
          action: string
          entity_type?: string | null
          entity_id?: string | null
          title: string
          priority?: NotificationPriority
          is_read?: boolean
          read_at?: string | null
          is_archived?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'notifications_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      notification_preferences: {
        Row: {
          user_id: string
          in_app_enabled: boolean
          browser_enabled: boolean
          email_enabled: boolean
          sms_enabled: boolean
          whatsapp_enabled: boolean
          whatsapp_number: string | null
          task_channel_prefs: TaskChannelPrefs
          updated_at: string
        }
        Insert: {
          user_id: string
          in_app_enabled?: boolean
          browser_enabled?: boolean
          email_enabled?: boolean
          sms_enabled?: boolean
          whatsapp_enabled?: boolean
          whatsapp_number?: string | null
          task_channel_prefs?: TaskChannelPrefs
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['notification_preferences']['Insert']>
        Relationships: []
      }
      notification_log: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          actor_id: string | null
          task_id: string | null
          notification_type: string
          channel: NotificationLogChannel
          status: NotificationLogStatus
          created_at: string
          sent_at: string | null
          failure_reason: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          actor_id?: string | null
          task_id?: string | null
          notification_type: string
          channel: NotificationLogChannel
          status?: NotificationLogStatus
          created_at?: string
          sent_at?: string | null
          failure_reason?: string | null
        }
        Update: Partial<Database['public']['Tables']['notification_log']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'notification_log_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      }
      client_communications: {
        Row: {
          id: string
          organization_id: string
          client_id: string
          matter_id: string | null
          sent_by: string | null
          recipient_name: string | null
          recipient_email: string
          subject: string
          body: string
          status: ClientCommunicationStatus
          failure_reason: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          client_id: string
          matter_id?: string | null
          sent_by?: string | null
          recipient_name?: string | null
          recipient_email: string
          subject: string
          body: string
          status?: ClientCommunicationStatus
          failure_reason?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['client_communications']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'client_communications_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'client_communications_matter_id_fkey'
            columns: ['matter_id']
            isOneToOne: false
            referencedRelation: 'matters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'client_communications_sent_by_fkey'
            columns: ['sent_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      channels: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          created_by: string | null
          last_message_at: string | null
          archived_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          created_by?: string | null
          last_message_at?: string | null
          archived_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['channels']['Insert']>
        Relationships: []
      }
      channel_messages: {
        Row: {
          id: string
          organization_id: string
          channel_id: string
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          channel_id: string
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['channel_messages']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'channel_messages_channel_id_fkey'
            columns: ['channel_id']
            isOneToOne: false
            referencedRelation: 'channels'
            referencedColumns: ['id']
          },
        ]
      }
      channel_reads: {
        Row: { channel_id: string; user_id: string; last_read_at: string }
        Insert: { channel_id: string; user_id: string; last_read_at?: string }
        Update: Partial<Database['public']['Tables']['channel_reads']['Insert']>
        Relationships: []
      }
      direct_conversations: {
        Row: {
          id: string
          organization_id: string
          user_a: string
          user_b: string
          user_a_last_read_at: string | null
          user_b_last_read_at: string | null
          user_a_hidden_at: string | null
          user_b_hidden_at: string | null
          last_message_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_a: string
          user_b: string
          user_a_last_read_at?: string | null
          user_b_last_read_at?: string | null
          user_a_hidden_at?: string | null
          user_b_hidden_at?: string | null
          last_message_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['direct_conversations']['Insert']>
        Relationships: []
      }
      direct_messages: {
        Row: {
          id: string
          organization_id: string
          conversation_id: string
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          conversation_id: string
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['direct_messages']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'direct_messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'direct_conversations'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_platform_admin: { Args: Record<string, never>; Returns: boolean }
      platform_resource_usage: {
        Args: Record<string, never>
        Returns: {
          db_bytes: number
          storage_bytes: number
          db_cap_bytes: number
          storage_cap_bytes: number
          db_pct: number
          storage_pct: number
        }[]
      }
      is_org_member: { Args: { org: string }; Returns: boolean }
      is_org_admin: { Args: { org: string }; Returns: boolean }
      has_permission: { Args: { org: string; perm: string }; Returns: boolean }
      has_financial_access: { Args: { p_org: string; p_perm: string }; Returns: boolean }
      get_or_create_dm_conversation: {
        Args: { p_org: string; p_other: string }
        Returns: Database['public']['Tables']['direct_conversations']['Row']
      }
      mark_channel_read: { Args: { p_channel: string }; Returns: undefined }
      delete_channel: { Args: { p_channel: string }; Returns: undefined }
      mark_dm_read: { Args: { p_conversation: string }; Returns: undefined }
      hide_dm_conversation: { Args: { p_conversation: string }; Returns: undefined }
      get_unread_message_count: { Args: { p_org: string }; Returns: number }
      clear_audit_log: { Args: Record<string, never>; Returns: undefined }
      create_organization: {
        Args: {
          p_name: string
          p_slug: string
          p_legal_name?: string | null
          p_plan_id?: string | null
          p_trial?: boolean
          p_billing_cycle?: BillingCycle
          p_owner_user_id?: string | null
          p_org_type?: string
        }
        Returns: Database['public']['Tables']['organizations']['Row']
      }
      reset_demo_organization: {
        Args: { p_org: string }
        Returns: undefined
      }
      accept_invitation: {
        Args: { p_token: string }
        Returns: Database['public']['Tables']['memberships']['Row']
      }
      log_audit: {
        Args: {
          p_org: string
          p_action: string
          p_entity_type?: string | null
          p_entity_id?: string | null
          p_summary?: string | null
          p_metadata?: Json
          p_platform?: boolean
          p_actor_id?: string | null
          p_branch_id?: string | null
        }
        Returns: Database['public']['Tables']['audit_logs']['Row']
      }
      set_avatar: { Args: { p_user: string; p_url: string }; Returns: undefined }
      generate_invoice: {
        Args: {
          p_org: string
          p_client: string
          p_matter?: string | null
          p_due_date?: string | null
          p_tax_rate?: number
          p_time_entry_ids?: string[] | null
          p_expense_ids?: string[] | null
          p_manual_items?: Json
          p_issue_date?: string | null
        }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      delete_invoice: { Args: { p_invoice: string }; Returns: undefined }
      soft_delete_organization: { Args: { p_org: string }; Returns: undefined }
      restore_organization: { Args: { p_org: string }; Returns: undefined }
      hard_delete_organization: { Args: { p_org: string }; Returns: undefined }
      request_support_session: {
        Args: { p_org: string; p_reason: string }
        Returns: Database['public']['Tables']['support_sessions']['Row']
      }
      grant_support_session: {
        Args: { p_id: string }
        Returns: Database['public']['Tables']['support_sessions']['Row']
      }
      deny_support_session: { Args: { p_id: string }; Returns: undefined }
      end_support_session: { Args: { p_id: string }; Returns: undefined }
      list_visible_membership_ids: { Args: { p_org: string }; Returns: string[] }
      set_platform_access: { Args: { p_user: string; p_role: string; p_is_admin: boolean }; Returns: undefined }
      notify_user: {
        Args: {
          p_org: string
          p_user: string
          p_actor: string | null
          p_category: NotificationCategory
          p_action: string
          p_entity_type?: string | null
          p_entity_id?: string | null
          p_title: string
          p_priority?: NotificationPriority
        }
        Returns: Database['public']['Tables']['notifications']['Row']
      }
      mark_all_notifications_read: { Args: { p_org: string }; Returns: undefined }
      reopen_matter: {
        Args: { p_matter: string; p_reason?: string | null }
        Returns: Database['public']['Tables']['matters']['Row']
      }
      set_head_office: {
        Args: { p_org: string; p_branch: string }
        Returns: undefined
      }
      user_has_branch_access: {
        Args: { p_org: string; p_branch_id: string | null }
        Returns: boolean
      }
      register_organization: {
        Args: {
          p_name: string
          p_slug: string
          p_plan_id: string
          p_legal_name?: string | null
          p_country?: string | null
          p_timezone?: string | null
          p_website?: string | null
          p_industry?: string | null
          p_user_count?: string | null
          p_practice_areas?: string[] | null
          p_registrant_role?: string
          p_currency?: string
        }
        Returns: Database['public']['Tables']['organizations']['Row']
      }
      get_organization_by_slug: {
        Args: { p_slug: string }
        Returns: { id: string; name: string; slug: string; logo_url: string | null }[]
      }
      request_manual_payment: {
        Args: {
          p_org: string
          p_plan_id: string
          p_currency?: string
          p_billing_cycle?: BillingCycle
          p_country?: string | null
        }
        Returns: Database['public']['Tables']['subscriptions']['Row']
      }
      platform_review_manual_payment: {
        Args: { p_subscription_id: string; p_action: string }
        Returns: Database['public']['Tables']['subscriptions']['Row']
      }
      email_is_registered: {
        Args: { p_email: string }
        Returns: boolean
      }
      request_leave: {
        Args: { p_org: string; p_leave_type: string; p_start: string; p_end: string; p_reason?: string | null }
        Returns: Database['public']['Tables']['leave_requests']['Row']
      }
      review_leave_request: {
        Args: { p_request: string; p_approve: boolean; p_comment?: string | null }
        Returns: Database['public']['Tables']['leave_requests']['Row']
      }
      cancel_leave_request: {
        Args: { p_request: string }
        Returns: undefined
      }
      update_hr_request_status: {
        Args: { p_request: string; p_status: string; p_note?: string | null }
        Returns: Database['public']['Tables']['hr_requests']['Row']
      }
      assign_onboarding: {
        Args: { p_org: string; p_user: string; p_template: string }
        Returns: Database['public']['Tables']['employee_onboarding']['Row']
      }
      unassign_onboarding: {
        Args: { p_onboarding_id: string }
        Returns: undefined
      }
      send_hr_announcement: {
        Args: {
          p_org: string
          p_title: string
          p_body: string
          p_audience_type: string
          p_department_id?: string | null
          p_user_ids?: string[] | null
          p_branch?: string | null
          p_role_key?: RoleKey | null
        }
        Returns: Database['public']['Tables']['hr_announcements']['Row']
      }
      platform_storage_usage: {
        Args: Record<PropertyKey, never>
        Returns: { organization_id: string; total_bytes: number }[]
      }
      org_storage_usage: {
        Args: { p_org: string }
        Returns: number
      }
      org_storage_limit_bytes: {
        Args: { p_org: string }
        Returns: number
      }
      org_storage_breakdown: {
        Args: { p_org: string }
        Returns: { category: string; bytes: number }[]
      }
      org_largest_files: {
        Args: { p_org: string; p_limit?: number }
        Returns: {
          source: string
          id: string
          name: string
          size_bytes: number
          uploaded_by_name: string | null
          created_at: string
          matter_id: string | null
          employee_user_id: string | null
        }[]
      }
      update_organization_slug: {
        Args: { p_org: string; p_slug: string }
        Returns: Database['public']['Tables']['organizations']['Row']
      }
      can_add_member: {
        Args: { p_org: string }
        Returns: boolean
      }
      schedule_plan_downgrade: {
        Args: { p_org: string; p_plan_id: string; p_billing_cycle?: BillingCycle | null }
        Returns: Database['public']['Tables']['subscriptions']['Row']
      }
      cancel_scheduled_downgrade: {
        Args: { p_org: string }
        Returns: Database['public']['Tables']['subscriptions']['Row']
      }
      cancel_subscription: {
        Args: { p_org: string; p_reason?: string | null }
        Returns: Database['public']['Tables']['subscriptions']['Row']
      }
      find_similar_clients: {
        Args: {
          p_org: string
          p_name: string
          p_email?: string | null
          p_phone?: string | null
          p_registration_number?: string | null
          p_exclude_id?: string | null
        }
        Returns: {
          id: string
          display_name: string
          type: ClientType
          match_type: string
          score: number
        }[]
      }
    }
    Enums: {
      org_status: OrgStatus
      membership_status: MembershipStatus
      invitation_status: InvitationStatus
      role_key: RoleKey
      subscription_status: SubscriptionStatus
      billing_cycle: BillingCycle
    }
    CompositeTypes: { [_ in never]: never }
  }
}

// Convenience row aliases
export type Organization = Database['public']['Tables']['organizations']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Role = Database['public']['Tables']['roles']['Row']
export type Permission = Database['public']['Tables']['permissions']['Row']
export type Membership = Database['public']['Tables']['memberships']['Row']
export type Invitation = Database['public']['Tables']['invitations']['Row']
export type AuditLog = Database['public']['Tables']['audit_logs']['Row']
export type Branch = Database['public']['Tables']['branches']['Row']
export type MemberBranch = Database['public']['Tables']['member_branches']['Row']
export type MatterBranchShare = Database['public']['Tables']['matter_branch_shares']['Row']
export type Plan = Database['public']['Tables']['plans']['Row']
export type PlanPrice = Database['public']['Tables']['plan_prices']['Row']
export type Subscription = Database['public']['Tables']['subscriptions']['Row']
export type PlatformSettings = Database['public']['Tables']['platform_settings']['Row']
export type Client = Database['public']['Tables']['clients']['Row']
export type ClientContact = Database['public']['Tables']['client_contacts']['Row']
export type ClientInsert = Database['public']['Tables']['clients']['Insert']
export type ClientCommunication = Database['public']['Tables']['client_communications']['Row']
export type Matter = Database['public']['Tables']['matters']['Row']
export type MatterNote = Database['public']['Tables']['matter_notes']['Row']
export type MatterAssignment = Database['public']['Tables']['matter_assignments']['Row']
export type MatterEvent = Database['public']['Tables']['matter_events']['Row']
export type Hearing = Database['public']['Tables']['hearings']['Row']
export type Appointment = Database['public']['Tables']['appointments']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type StaffProfile = Database['public']['Tables']['staff_profiles']['Row']
export type TimeEntry = Database['public']['Tables']['time_entries']['Row']
export type Expense = Database['public']['Tables']['expenses']['Row']
export type ExpenseReceipt = Database['public']['Tables']['expense_receipts']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type InvoiceItem = Database['public']['Tables']['invoice_items']['Row']
export type Payment = Database['public']['Tables']['payments']['Row']
export type DocumentRow = Database['public']['Tables']['documents']['Row']
export type NotificationRow = Database['public']['Tables']['notifications']['Row']
export type NotificationPreferences = Database['public']['Tables']['notification_preferences']['Row']
export type NotificationLog = Database['public']['Tables']['notification_log']['Row']
export type Channel = Database['public']['Tables']['channels']['Row']
export type ChannelMessage = Database['public']['Tables']['channel_messages']['Row']
export type ChannelRead = Database['public']['Tables']['channel_reads']['Row']
export type DirectConversation = Database['public']['Tables']['direct_conversations']['Row']
export type DirectMessage = Database['public']['Tables']['direct_messages']['Row']
