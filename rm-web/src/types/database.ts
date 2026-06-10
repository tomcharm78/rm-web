// This file mirrors what `supabase gen types typescript` would produce
// against the schema deployed in 0001_schema.sql + 0005_login_helpers.sql.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '12' };
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          name: string;
          name_ar: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          avatar: string | null;
          is_active: boolean;
          force_password_change: boolean;
          last_login_at: string | null;
          permissions: Database['public']['Enums']['user_permission'][];
          admin_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          name: string;
          name_ar: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          avatar?: string | null;
          is_active?: boolean;
          force_password_change?: boolean;
          last_login_at?: string | null;
          permissions?: Database['public']['Enums']['user_permission'][];
          admin_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          name_ar?: string;
          email?: string;
          role?: Database['public']['Enums']['user_role'];
          avatar?: string | null;
          is_active?: boolean;
          force_password_change?: boolean;
          last_login_at?: string | null;
          permissions?: Database['public']['Enums']['user_permission'][];
          admin_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      password_reset_requests: {
        Row: {
          id: string;
          user_id: string;
          status: Database['public']['Enums']['password_reset_status'];
          requested_at: string;
          resolved_at: string | null;
          resolved_by_id: string | null;
          rejection_reason: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: Database['public']['Enums']['password_reset_status'];
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by_id?: string | null;
          rejection_reason?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: Database['public']['Enums']['password_reset_status'];
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by_id?: string | null;
          rejection_reason?: string | null;
        };
        Relationships: [];
      };
      domains: {
        Row: {
          id: string;
          slug: string;
          name: string;
          name_ar: string;
          icon: string;
          is_active: boolean;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          slug: string;
          name: string;
          name_ar: string;
          icon: string;
          is_active?: boolean;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          name_ar?: string;
          icon?: string;
          is_active?: boolean;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: 'super_admin' | 'admin' | 'rm' | 'arm' | 'investor';
      user_permission:
        | 'approvals'
        | 'generate_reports'
        | 'ai_insights'
        | 'manage_users'
        | 'manage_investors'
        | 'create_tasks'
        | 'create_challenges'
        | 'create_sessions'
        | 'export_data'
        | 'export_vacations';
      password_reset_status: 'pending' | 'approved' | 'rejected';
    };
    CompositeTypes: Record<string, never>;
  };
};

export type DbUser = Database['public']['Tables']['users']['Row'];
export type DbUserInsert = Database['public']['Tables']['users']['Insert'];
export type DbUserUpdate = Database['public']['Tables']['users']['Update'];
export type UserRole = Database['public']['Enums']['user_role'];
export type UserPermission = Database['public']['Enums']['user_permission'];
export type DbPasswordResetRequest =
  Database['public']['Tables']['password_reset_requests']['Row'];
