// Generated database types — hand-written to match the live schema in
// project rork-relationship-management-system-199 after migrations 0001-0009.
//
// This file is the bridge between Supabase's row shape and our TypeScript.
// When new migrations land, regenerate this file with `supabase gen types`
// or hand-patch the changed tables.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          name_ar: string;
          slug: string;
          org_type: string;
          country: string;
          is_active: boolean;
          external_id: string | null;
          source_system: string | null;
          source_metadata: Json | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          name_ar: string;
          slug: string;
          org_type?: string;
          country?: string;
          is_active?: boolean;
          external_id?: string | null;
          source_system?: string | null;
          source_metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
      };

      users: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          name_ar: string;
          email: string;
          role: 'super_admin' | 'admin' | 'rm' | 'arm' | 'investor';
          avatar: string | null;
          is_active: boolean;
          force_password_change: boolean;
          last_login_at: string | null;
          permissions: string[];
          admin_id: string | null;
          external_id: string | null;
          source_system: string | null;
          source_metadata: Json | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          name: string;
          name_ar: string;
          email: string;
          role: 'super_admin' | 'admin' | 'rm' | 'arm' | 'investor';
          avatar?: string | null;
          is_active?: boolean;
          force_password_change?: boolean;
          last_login_at?: string | null;
          permissions?: string[];
          admin_id?: string | null;
          external_id?: string | null;
          source_system?: string | null;
          source_metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };

      investors: {
        Row: {
          id: string;
          organization_id: string;
          company_name: string;
          company_name_ar: string;
          domain_type: string;
          nationality: string;
          country: string;
          city: string;
          website: string | null;
          cr_number: string | null;
          portfolio_size_usd: number | null;
          preferred_investment_region: string | null;
          representative_name: string;
          representative_name_ar: string;
          position: string;
          position_ar: string;
          email: string;
          mobile_number: string;
          mobile_country_code: string;
          fixed_number: string | null;
          fixed_country_code: string | null;
          created_by_id: string | null;
          external_id: string | null;
          source_system: string | null;
          source_metadata: Json | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          company_name: string;
          company_name_ar: string;
          domain_type: string;
          nationality: string;
          country: string;
          city: string;
          website?: string | null;
          cr_number?: string | null;
          portfolio_size_usd?: number | null;
          preferred_investment_region?: string | null;
          representative_name: string;
          representative_name_ar: string;
          position: string;
          position_ar: string;
          email: string;
          mobile_number: string;
          mobile_country_code: string;
          fixed_number?: string | null;
          fixed_country_code?: string | null;
          created_by_id?: string | null;
          external_id?: string | null;
          source_system?: string | null;
          source_metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['investors']['Insert']>;
      };

      password_reset_requests: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          status: 'pending' | 'approved' | 'rejected';
          requested_at: string;
          resolved_at: string | null;
          resolved_by_id: string | null;
          external_id: string | null;
          source_system: string | null;
          source_metadata: Json | null;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          user_id: string;
          status?: 'pending' | 'approved' | 'rejected';
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by_id?: string | null;
          external_id?: string | null;
          source_system?: string | null;
          source_metadata?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['password_reset_requests']['Insert']>;
      };

      sessions: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          title_ar: string;
          meeting_date: string;
          meeting_location: string | null;
          meeting_location_ar: string | null;
          moh_attendees: Json;
          visitor_attendees: Json;
          mom_content: string;
          mom_content_ar: string;
          meeting_notes: string;
          meeting_notes_ar: string;
          decisions: string;
          decisions_ar: string;
          action_items: string;
          action_items_ar: string;
          status: 'draft' | 'locked';
          locked_at: string | null;
          lock_version: number;
          export_version: number | null;
          last_edited_at: string | null;
          last_edited_by_id: string | null;
          can_be_edited_after_lock: boolean;
          generated_tasks: Json;
          participant_ids: string[];
          pending_ai_tasks: Json;
          created_by_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          external_id: string | null;
          source_system: string | null;
          source_metadata: Json | null;
          meeting_type: 'main' | 'followup';
          parent_session_id: string | null;
          meeting_number: string;
        };
        Insert: {
          id?: string;
          organization_id?: string;
          title: string;
          title_ar: string;
          meeting_date: string;
          meeting_location?: string | null;
          meeting_location_ar?: string | null;
          moh_attendees?: Json;
          visitor_attendees?: Json;
          mom_content?: string;
          mom_content_ar?: string;
          meeting_notes?: string;
          meeting_notes_ar?: string;
          decisions?: string;
          decisions_ar?: string;
          action_items?: string;
          action_items_ar?: string;
          status?: 'draft' | 'locked';
          locked_at?: string | null;
          lock_version?: number;
          export_version?: number | null;
          last_edited_at?: string | null;
          last_edited_by_id?: string | null;
          can_be_edited_after_lock?: boolean;
          generated_tasks?: Json;
          participant_ids?: string[];
          pending_ai_tasks?: Json;
          created_by_id: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          external_id?: string | null;
          source_system?: string | null;
          source_metadata?: Json | null;
          meeting_type?: 'main' | 'followup';
          parent_session_id?: string | null;
          meeting_number?: string;
        };
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>;
      };

      session_edit_history: {
        Row: {
          id: string;
          session_id: string;
          edited_by_id: string;
          edited_at: string;
          change_description: string;
          change_description_ar: string;
          previous_content: string | null;
          new_content: string | null;
        };
        Insert: {
          id?: string;
          session_id: string;
          edited_by_id: string;
          edited_at?: string;
          change_description: string;
          change_description_ar: string;
          previous_content?: string | null;
          new_content?: string | null;
        };
        Update: Partial<Database['public']['Tables']['session_edit_history']['Insert']>;
      };

      session_links: {
        Row: {
          id: string;
          session_id: string;
          link_type: string;
          task_id: string | null;
          challenge_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          link_type: string;
          task_id?: string | null;
          challenge_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['session_links']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: 'super_admin' | 'admin' | 'rm' | 'arm' | 'investor';
      session_status: 'draft' | 'locked';
    };
    CompositeTypes: Record<string, never>;
  };
};

// =============================================================================
// Convenience aliases — exported from the old hand-written database.ts.
// Keep them so consumers (types/index.ts, etc.) don't break.
// =============================================================================

export type UserRole = 'super_admin' | 'admin' | 'rm' | 'arm' | 'investor';
export type UserPermission =
  | 'approvals'
  | 'generate_reports'
  | 'ai_insights'
  | 'manage_users'
  | 'manage_investors'
  | 'create_tasks'
  | 'create_challenges'
  | 'create_sessions'
  | 'export_data'
  | 'export_vacations'
  | 'send_investor_email'
  | 'manage_surveys';

export type DbUser = Database['public']['Tables']['users']['Row'];
export type DbInvestor = Database['public']['Tables']['investors']['Row'];
export type DbPasswordResetRequest =
  Database['public']['Tables']['password_reset_requests']['Row'];
export type DbSession = Database['public']['Tables']['sessions']['Row'];
export type DbSessionEditHistory =
  Database['public']['Tables']['session_edit_history']['Row'];