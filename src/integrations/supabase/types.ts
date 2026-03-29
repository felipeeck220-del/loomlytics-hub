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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      article_machine_turns: {
        Row: {
          article_id: string
          company_id: string
          created_at: string
          id: string
          machine_id: string
          observations: string | null
          turns_per_roll: number
        }
        Insert: {
          article_id: string
          company_id: string
          created_at?: string
          id?: string
          machine_id: string
          observations?: string | null
          turns_per_roll: number
        }
        Update: {
          article_id?: string
          company_id?: string
          created_at?: string
          id?: string
          machine_id?: string
          observations?: string | null
          turns_per_roll?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_machine_turns_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_machine_turns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_machine_turns_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          client_id: string | null
          client_name: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          observations: string | null
          target_efficiency: number
          turns_per_roll: number
          value_per_kg: number
          weight_per_roll: number
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          observations?: string | null
          target_efficiency?: number
          turns_per_roll?: number
          value_per_kg?: number
          weight_per_roll?: number
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          observations?: string | null
          target_efficiency?: number
          turns_per_roll?: number
          value_per_kg?: number
          weight_per_roll?: number
        }
        Relationships: [
          {
            foreignKeyName: "articles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          details: Json | null
          id: string
          user_code: string | null
          user_id: string | null
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          details?: Json | null
          id?: string
          user_code?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_code?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          company_id: string
          contact: string | null
          created_at: string
          id: string
          name: string
          observations: string | null
        }
        Insert: {
          company_id: string
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          observations?: string | null
        }
        Update: {
          company_id?: string
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          observations?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          admin_email: string
          admin_name: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          whatsapp: string | null
        }
        Insert: {
          admin_email: string
          admin_name: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          whatsapp?: string | null
        }
        Update: {
          admin_email?: string
          admin_name?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      company_backups: {
        Row: {
          backup_date: string
          company_id: string
          created_at: string
          data: Json
          id: string
        }
        Insert: {
          backup_date: string
          company_id: string
          created_at?: string
          data: Json
          id?: string
        }
        Update: {
          backup_date?: string
          company_id?: string
          created_at?: string
          data?: Json
          id?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          company_id: string
          created_at: string
          enabled_nav_items: Json
          grace_period_end: string | null
          id: string
          monthly_plan_value: number
          platform_active: boolean
          shift_manha_end: string
          shift_manha_start: string
          shift_noite_end: string
          shift_noite_start: string
          shift_tarde_end: string
          shift_tarde_start: string
          stripe_customer_id: string | null
          subscription_paid_at: string | null
          subscription_plan: string | null
          subscription_status: string
          trial_end_date: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled_nav_items?: Json
          grace_period_end?: string | null
          id?: string
          monthly_plan_value?: number
          platform_active?: boolean
          shift_manha_end?: string
          shift_manha_start?: string
          shift_noite_end?: string
          shift_noite_start?: string
          shift_tarde_end?: string
          shift_tarde_start?: string
          stripe_customer_id?: string | null
          subscription_paid_at?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          trial_end_date?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled_nav_items?: Json
          grace_period_end?: string | null
          id?: string
          monthly_plan_value?: number
          platform_active?: boolean
          shift_manha_end?: string
          shift_manha_start?: string
          shift_noite_end?: string
          shift_noite_start?: string
          shift_tarde_end?: string
          shift_tarde_start?: string
          stripe_customer_id?: string | null
          subscription_paid_at?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          trial_end_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      defect_records: {
        Row: {
          article_id: string | null
          article_name: string | null
          company_id: string
          created_at: string
          created_by_code: string | null
          created_by_name: string | null
          date: string
          id: string
          machine_id: string | null
          machine_name: string | null
          measure_type: string
          measure_value: number
          observations: string | null
          shift: string
          weaver_id: string | null
          weaver_name: string | null
        }
        Insert: {
          article_id?: string | null
          article_name?: string | null
          company_id: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date: string
          id?: string
          machine_id?: string | null
          machine_name?: string | null
          measure_type?: string
          measure_value?: number
          observations?: string | null
          shift: string
          weaver_id?: string | null
          weaver_name?: string | null
        }
        Update: {
          article_id?: string | null
          article_name?: string | null
          company_id?: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date?: string
          id?: string
          machine_id?: string | null
          machine_name?: string | null
          measure_type?: string
          measure_value?: number
          observations?: string | null
          shift?: string
          weaver_id?: string | null
          weaver_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defect_records_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_records_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_records_weaver_id_fkey"
            columns: ["weaver_id"]
            isOneToOne: false
            referencedRelation: "weavers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_history: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          id: string
          new_email: string
          old_email: string
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          new_email: string
          old_email: string
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          new_email?: string
          old_email?: string
        }
        Relationships: []
      }
      machine_logs: {
        Row: {
          ended_at: string | null
          ended_by_code: string | null
          ended_by_name: string | null
          id: string
          machine_id: string
          started_at: string
          started_by_code: string | null
          started_by_name: string | null
          status: Database["public"]["Enums"]["machine_status"]
        }
        Insert: {
          ended_at?: string | null
          ended_by_code?: string | null
          ended_by_name?: string | null
          id?: string
          machine_id: string
          started_at?: string
          started_by_code?: string | null
          started_by_name?: string | null
          status: Database["public"]["Enums"]["machine_status"]
        }
        Update: {
          ended_at?: string | null
          ended_by_code?: string | null
          ended_by_name?: string | null
          id?: string
          machine_id?: string
          started_at?: string
          started_by_code?: string | null
          started_by_name?: string | null
          status?: Database["public"]["Enums"]["machine_status"]
        }
        Relationships: [
          {
            foreignKeyName: "machine_logs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_maintenance_observations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          machine_id: string
          machine_log_id: string
          observation: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          machine_id: string
          machine_log_id: string
          observation: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          machine_id?: string
          machine_log_id?: string
          observation?: string
        }
        Relationships: []
      }
      machines: {
        Row: {
          article_id: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          number: number
          observations: string | null
          production_mode: string
          rpm: number
          status: Database["public"]["Enums"]["machine_status"]
        }
        Insert: {
          article_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          number: number
          observations?: string | null
          production_mode?: string
          rpm?: number
          status?: Database["public"]["Enums"]["machine_status"]
        }
        Update: {
          article_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          number?: number
          observations?: string | null
          production_mode?: string
          rpm?: number
          status?: Database["public"]["Enums"]["machine_status"]
        }
        Relationships: [
          {
            foreignKeyName: "machines_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      outsource_companies: {
        Row: {
          company_id: string
          contact: string | null
          created_at: string
          id: string
          name: string
          observations: string | null
        }
        Insert: {
          company_id: string
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          observations?: string | null
        }
        Update: {
          company_id?: string
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          observations?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outsource_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      outsource_productions: {
        Row: {
          article_id: string
          article_name: string | null
          client_name: string | null
          client_value_per_kg: number
          company_id: string
          created_at: string
          date: string
          id: string
          observations: string | null
          outsource_company_id: string
          outsource_company_name: string | null
          outsource_value_per_kg: number
          profit_per_kg: number
          rolls: number
          total_cost: number
          total_profit: number
          total_revenue: number
          weight_kg: number
        }
        Insert: {
          article_id: string
          article_name?: string | null
          client_name?: string | null
          client_value_per_kg?: number
          company_id: string
          created_at?: string
          date: string
          id?: string
          observations?: string | null
          outsource_company_id: string
          outsource_company_name?: string | null
          outsource_value_per_kg?: number
          profit_per_kg?: number
          rolls?: number
          total_cost?: number
          total_profit?: number
          total_revenue?: number
          weight_kg?: number
        }
        Update: {
          article_id?: string
          article_name?: string | null
          client_name?: string | null
          client_value_per_kg?: number
          company_id?: string
          created_at?: string
          date?: string
          id?: string
          observations?: string | null
          outsource_company_id?: string
          outsource_company_name?: string | null
          outsource_value_per_kg?: number
          profit_per_kg?: number
          rolls?: number
          total_cost?: number
          total_profit?: number
          total_revenue?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "outsource_productions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_productions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_productions_outsource_company_id_fkey"
            columns: ["outsource_company_id"]
            isOneToOne: false
            referencedRelation: "outsource_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_history: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          next_billing_date: string | null
          paid_at: string | null
          pix_code: string | null
          plan: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          id?: string
          next_billing_date?: string | null
          paid_at?: string | null
          pix_code?: string | null
          plan?: string
          status?: string
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          next_billing_date?: string | null
          paid_at?: string | null
          pix_code?: string | null
          plan?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          email: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      productions: {
        Row: {
          article_id: string | null
          article_name: string | null
          company_id: string
          created_at: string
          created_by_code: string | null
          created_by_name: string | null
          date: string
          efficiency: number
          id: string
          machine_id: string | null
          machine_name: string | null
          revenue: number
          rolls_produced: number
          rpm: number
          shift: string
          weaver_id: string | null
          weaver_name: string | null
          weight_kg: number
        }
        Insert: {
          article_id?: string | null
          article_name?: string | null
          company_id: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date: string
          efficiency?: number
          id?: string
          machine_id?: string | null
          machine_name?: string | null
          revenue?: number
          rolls_produced?: number
          rpm?: number
          shift: string
          weaver_id?: string | null
          weaver_name?: string | null
          weight_kg?: number
        }
        Update: {
          article_id?: string | null
          article_name?: string | null
          company_id?: string
          created_at?: string
          created_by_code?: string | null
          created_by_name?: string | null
          date?: string
          efficiency?: number
          id?: string
          machine_id?: string | null
          machine_name?: string | null
          revenue?: number
          rolls_produced?: number
          rpm?: number
          shift?: string
          weaver_id?: string | null
          weaver_name?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "productions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_weaver_id_fkey"
            columns: ["weaver_id"]
            isOneToOne: false
            referencedRelation: "weavers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          code: string | null
          company_id: string
          created_at: string
          email: string
          id: string
          name: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          code?: string | null
          company_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          code?: string | null
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_active_company: {
        Row: {
          company_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_active_company_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      weavers: {
        Row: {
          code: string
          company_id: string
          created_at: string
          end_time: string | null
          fixed_shift: string | null
          id: string
          name: string
          phone: string | null
          shift_type: string
          start_time: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          end_time?: string | null
          fixed_shift?: string | null
          id?: string
          name: string
          phone?: string | null
          shift_type?: string
          start_time?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          end_time?: string | null
          fixed_shift?: string | null
          id?: string
          name?: string
          phone?: string | null
          shift_type?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weavers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_companies: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          company_slug: string
          role: string
        }[]
      }
      get_user_company_id: { Args: never; Returns: string }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      set_active_company: { Args: { _company_id: string }; Returns: undefined }
    }
    Enums: {
      machine_status:
        | "ativa"
        | "manutencao_preventiva"
        | "manutencao_corretiva"
        | "troca_artigo"
        | "inativa"
        | "troca_agulhas"
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
    Enums: {
      machine_status: [
        "ativa",
        "manutencao_preventiva",
        "manutencao_corretiva",
        "troca_artigo",
        "inativa",
        "troca_agulhas",
      ],
    },
  },
} as const
