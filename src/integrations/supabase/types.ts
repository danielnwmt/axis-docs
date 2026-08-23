export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          action_type: string
          created_at: string
          details: string | null
          id: string
          org_id: string | null
          target: string
          user_email: string
          user_id: string
        }
        Insert: {
          action: string
          action_type?: string
          created_at?: string
          details?: string | null
          id?: string
          org_id?: string | null
          target?: string
          user_email?: string
          user_id: string
        }
        Update: {
          action?: string
          action_type?: string
          created_at?: string
          details?: string | null
          id?: string
          org_id?: string | null
          target?: string
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_files: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          drive_file_id: string
          drive_link: string | null
          encrypted: boolean
          encryption_algo: string | null
          expires_at: string
          file_name: string
          file_size: number | null
          id: string
          org_id: string | null
          retention_days: number
          sha256: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          drive_file_id: string
          drive_link?: string | null
          encrypted?: boolean
          encryption_algo?: string | null
          expires_at: string
          file_name: string
          file_size?: number | null
          id?: string
          org_id?: string | null
          retention_days?: number
          sha256?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          drive_file_id?: string
          drive_link?: string | null
          encrypted?: boolean
          encryption_algo?: string | null
          expires_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          org_id?: string | null
          retention_days?: number
          sha256?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_files_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_settings: {
        Row: {
          auto_cleanup: boolean
          drive_folder_id: string | null
          id: string
          last_scheduled_run: string | null
          org_id: string | null
          retention_days: number
          schedule_enabled: boolean
          schedule_time: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_cleanup?: boolean
          drive_folder_id?: string | null
          id?: string
          last_scheduled_run?: string | null
          org_id?: string | null
          retention_days?: number
          schedule_enabled?: boolean
          schedule_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_cleanup?: boolean
          drive_folder_id?: string | null
          id?: string
          last_scheduled_run?: string | null
          org_id?: string | null
          retention_days?: number
          schedule_enabled?: boolean
          schedule_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_default: boolean
          name: string
          org_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          org_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          accepted_at: string
          document_type: string
          id: string
          ip: string | null
          org_id: string | null
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          document_type: string
          id?: string
          ip?: string | null
          org_id?: string | null
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          document_type?: string
          id?: string
          ip?: string | null
          org_id?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_requests: {
        Row: {
          id: string
          notes: string | null
          org_id: string | null
          payload: Json | null
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          status: string
          type: string
          user_email: string
          user_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          org_id?: string | null
          payload?: Json | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          type: string
          user_email?: string
          user_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          org_id?: string | null
          payload?: Json | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          type?: string
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          created_at: string
          drive_file_id: string | null
          drive_link: string | null
          file_hash_original: string | null
          file_hash_signed: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          keywords: string | null
          notes: string | null
          ocr_status: string
          ocr_text: string | null
          org_id: string
          sign_certificate_info: Json | null
          sign_status: string
          sign_timestamp: string | null
          sign_token: string | null
          subject: string | null
          title: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          drive_file_id?: string | null
          drive_link?: string | null
          file_hash_original?: string | null
          file_hash_signed?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          keywords?: string | null
          notes?: string | null
          ocr_status?: string
          ocr_text?: string | null
          org_id?: string
          sign_certificate_info?: Json | null
          sign_status?: string
          sign_timestamp?: string | null
          sign_token?: string | null
          subject?: string | null
          title: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          drive_file_id?: string | null
          drive_link?: string | null
          file_hash_original?: string | null
          file_hash_signed?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          keywords?: string | null
          notes?: string | null
          ocr_status?: string
          ocr_text?: string | null
          org_id?: string
          sign_certificate_info?: Json | null
          sign_status?: string
          sign_timestamp?: string | null
          sign_token?: string | null
          subject?: string | null
          title?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dpo_config: {
        Row: {
          email: string
          id: string
          name: string
          org_id: string | null
          phone: string
          privacy_policy_version: string
          terms_version: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          email?: string
          id?: string
          name?: string
          org_id?: string | null
          phone?: string
          privacy_policy_version?: string
          terms_version?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          email?: string
          id?: string
          name?: string
          org_id?: string | null
          phone?: string
          privacy_policy_version?: string
          terms_version?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dpo_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          due_date: string | null
          id: string
          kind: string
          notes: string | null
          org_id: string
          paid_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          org_id: string
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      license_config: {
        Row: {
          customer_name: string | null
          expires_at: string | null
          hardware_id: string
          id: string
          last_check: string | null
          last_temp_unlock_at: string | null
          license_key: string
          message: string | null
          server_url: string
          status: string
          storage_limit_gb: number
          storage_used_bytes: number
          temp_unlock_until: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          customer_name?: string | null
          expires_at?: string | null
          hardware_id?: string
          id?: string
          last_check?: string | null
          last_temp_unlock_at?: string | null
          license_key?: string
          message?: string | null
          server_url?: string
          status?: string
          storage_limit_gb?: number
          storage_used_bytes?: number
          temp_unlock_until?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          customer_name?: string | null
          expires_at?: string | null
          hardware_id?: string
          id?: string
          last_check?: string | null
          last_temp_unlock_at?: string | null
          license_key?: string
          message?: string | null
          server_url?: string
          status?: string
          storage_limit_gb?: number
          storage_used_bytes?: number
          temp_unlock_until?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      organization_drive_config: {
        Row: {
          configured: boolean
          created_at: string
          org_id: string
          root_folder_id: string | null
          service_account_json: string | null
          updated_at: string
        }
        Insert: {
          configured?: boolean
          created_at?: string
          org_id: string
          root_folder_id?: string | null
          service_account_json?: string | null
          updated_at?: string
        }
        Update: {
          configured?: boolean
          created_at?: string
          org_id?: string
          root_folder_id?: string | null
          service_account_json?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_drive_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          token: string
          unit: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          token?: string
          unit?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          token?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          doc_type: string
          document: string | null
          id: string
          max_users: number
          name: string
          notes: string | null
          plan: string
          slug: string
          state: string | null
          status: string
          storage_limit_gb: number
          storage_used_bytes: number
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          doc_type?: string
          document?: string | null
          id?: string
          max_users?: number
          name: string
          notes?: string | null
          plan?: string
          slug: string
          state?: string | null
          status?: string
          storage_limit_gb?: number
          storage_used_bytes?: number
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          doc_type?: string
          document?: string | null
          id?: string
          max_users?: number
          name?: string
          notes?: string | null
          plan?: string
          slug?: string
          state?: string | null
          status?: string
          storage_limit_gb?: number
          storage_used_bytes?: number
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          max_users: number
          name: string
          price_cents: number
          slug: string
          storage_gb: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          max_users?: number
          name: string
          price_cents?: number
          slug: string
          storage_gb?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          max_users?: number
          name?: string
          price_cents?: number
          slug?: string
          storage_gb?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_owners: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          id: boolean
          storage_price_cents_per_gb: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          storage_price_cents_per_gb?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          storage_price_cents_per_gb?: number
          updated_at?: string
        }
        Relationships: []
      }
      privacy_incidents: {
        Row: {
          affected_users_count: number
          anpd_protocol: string | null
          created_at: string
          created_by: string
          data_subjects_notified_at: string | null
          description: string
          id: string
          org_id: string | null
          reported_to_anpd_at: string | null
          resolution: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_users_count?: number
          anpd_protocol?: string | null
          created_at?: string
          created_by: string
          data_subjects_notified_at?: string | null
          description: string
          id?: string
          org_id?: string | null
          reported_to_anpd_at?: string | null
          resolution?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_users_count?: number
          anpd_protocol?: string | null
          created_at?: string
          created_by?: string
          data_subjects_notified_at?: string | null
          description?: string
          id?: string
          org_id?: string | null
          reported_to_anpd_at?: string | null
          resolution?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string
          cpf: string
          created_at: string
          email: string
          full_name: string
          id: string
          language: string
          must_change_password: boolean
          org_id: string
          role: string
          unit: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string
          cpf?: string
          created_at?: string
          email?: string
          full_name?: string
          id: string
          language?: string
          must_change_password?: boolean
          org_id: string
          role?: string
          unit?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string
          cpf?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          language?: string
          must_change_password?: boolean
          org_id?: string
          role?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          action: string
          active: boolean
          category: string
          id: string
          org_id: string | null
          retention_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action?: string
          active?: boolean
          category: string
          id?: string
          org_id?: string | null
          retention_days: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action?: string
          active?: boolean
          category?: string
          id?: string
          org_id?: string | null
          retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_updates: {
        Row: {
          created_at: string
          id: string
          message: string | null
          requested_by: string | null
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_default: boolean
          name: string
          org_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          org_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_certificates: {
        Row: {
          cpf: string
          fingerprint_sha256: string
          id: string
          issuer: string
          org_id: string | null
          pfx_auth_tag: string
          pfx_encrypted: string
          pfx_iv: string
          signature_logo: string | null
          signature_logo_size_pct: number
          subject_cn: string
          updated_at: string
          uploaded_at: string
          user_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          cpf?: string
          fingerprint_sha256?: string
          id?: string
          issuer?: string
          org_id?: string | null
          pfx_auth_tag: string
          pfx_encrypted: string
          pfx_iv: string
          signature_logo?: string | null
          signature_logo_size_pct?: number
          subject_cn?: string
          updated_at?: string
          uploaded_at?: string
          user_id: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          cpf?: string
          fingerprint_sha256?: string
          id?: string
          issuer?: string
          org_id?: string | null
          pfx_auth_tag?: string
          pfx_encrypted?: string
          pfx_iv?: string
          signature_logo?: string | null
          signature_logo_size_pct?: number
          subject_cn?: string
          updated_at?: string
          uploaded_at?: string
          user_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_certificates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      anonymize_user: { Args: { _target: string }; Returns: undefined }
      current_org_id: { Args: never; Returns: string }
      get_license_status_public: {
        Args: never
        Returns: {
          customer_name: string
          expires_at: string
          id: string
          last_check: string
          message: string
          status: string
          storage_limit_gb: number
          storage_used_bytes: number
          temp_unlock_until: string
          updated_at: string
        }[]
      }
      get_my_data_export: { Args: never; Returns: Json }
      get_my_org: {
        Args: never
        Returns: {
          drive_configured: boolean
          id: string
          max_users: number
          name: string
          plan: string
          slug: string
          status: string
          storage_limit_gb: number
          storage_used_bytes: number
          trial_ends_at: string
        }[]
      }
      get_user_unit: { Args: { _user_id: string }; Returns: string }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      insert_audit_log: {
        Args: {
          _action: string
          _action_type?: string
          _details?: string
          _target?: string
        }
        Returns: undefined
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_org_admin: { Args: { _user_id: string }; Returns: boolean }
      is_platform_owner: { Args: { _user_id: string }; Returns: boolean }
      log_pii_access: {
        Args: {
          _reason?: string
          _resource_id: string
          _resource_type: string
          _target_user_id?: string
        }
        Returns: undefined
      }
      notify_incident_subjects: {
        Args: { _incident_id: string }
        Returns: undefined
      }
      record_consent: {
        Args: {
          _document_type: string
          _ip?: string
          _user_agent?: string
          _version: string
        }
        Returns: string
      }
      report_incident_anpd: {
        Args: { _incident_id: string; _protocol: string }
        Returns: undefined
      }
      request_data_action: {
        Args: { _notes?: string; _type: string }
        Returns: string
      }
      resolve_incident: {
        Args: { _incident_id: string; _resolution: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
