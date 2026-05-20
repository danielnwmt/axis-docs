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
          target?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      backup_files: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          drive_file_id: string
          drive_link: string | null
          expires_at: string
          file_name: string
          file_size: number | null
          id: string
          retention_days: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          drive_file_id: string
          drive_link?: string | null
          expires_at: string
          file_name: string
          file_size?: number | null
          id?: string
          retention_days?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          drive_file_id?: string
          drive_link?: string | null
          expires_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          retention_days?: number
        }
        Relationships: []
      }
      backup_settings: {
        Row: {
          auto_cleanup: boolean
          drive_folder_id: string | null
          id: string
          last_scheduled_run: string | null
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
          retention_days?: number
          schedule_enabled?: boolean
          schedule_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          accepted_at: string
          document_type: string
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          document_type: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          document_type?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      data_requests: {
        Row: {
          id: string
          notes: string | null
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
          payload?: Json | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          type?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
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
        Relationships: []
      }
      dpo_config: {
        Row: {
          email: string
          id: string
          name: string
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
          phone?: string
          privacy_policy_version?: string
          terms_version?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      privacy_incidents: {
        Row: {
          affected_users_count: number
          anpd_protocol: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          reported_to_anpd_at: string | null
          severity: string
          title: string
        }
        Insert: {
          affected_users_count?: number
          anpd_protocol?: string | null
          created_at?: string
          created_by: string
          description: string
          id?: string
          reported_to_anpd_at?: string | null
          severity?: string
          title: string
        }
        Update: {
          affected_users_count?: number
          anpd_protocol?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          reported_to_anpd_at?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          cpf: string
          created_at: string
          email: string
          full_name: string
          id: string
          language: string
          must_change_password: boolean
          role: string
          unit: string
        }
        Insert: {
          active?: boolean
          cpf?: string
          created_at?: string
          email?: string
          full_name?: string
          id: string
          language?: string
          must_change_password?: boolean
          role?: string
          unit?: string
        }
        Update: {
          active?: boolean
          cpf?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          language?: string
          must_change_password?: boolean
          role?: string
          unit?: string
        }
        Relationships: []
      }
      retention_policies: {
        Row: {
          action: string
          active: boolean
          category: string
          id: string
          retention_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action?: string
          active?: boolean
          category: string
          id?: string
          retention_days: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action?: string
          active?: boolean
          category?: string
          id?: string
          retention_days?: number
          updated_at?: string
          updated_by?: string | null
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
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      user_certificates: {
        Row: {
          cpf: string
          fingerprint_sha256: string
          id: string
          issuer: string
          pfx_auth_tag: string
          pfx_encrypted: string
          pfx_iv: string
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
          pfx_auth_tag: string
          pfx_encrypted: string
          pfx_iv: string
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
          pfx_auth_tag?: string
          pfx_encrypted?: string
          pfx_iv?: string
          subject_cn?: string
          updated_at?: string
          uploaded_at?: string
          user_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      anonymize_user: { Args: { _target: string }; Returns: undefined }
      get_my_data_export: { Args: never; Returns: Json }
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
      record_consent: {
        Args: {
          _document_type: string
          _ip?: string
          _user_agent?: string
          _version: string
        }
        Returns: string
      }
      request_data_action: {
        Args: { _notes?: string; _type: string }
        Returns: string
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
