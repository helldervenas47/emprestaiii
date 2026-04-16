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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      balance: {
        Row: {
          amount: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chart_overrides: {
        Row: {
          created_at: string
          emprestado: number | null
          id: string
          juros: number | null
          month_label: string
          recebido: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emprestado?: number | null
          id?: string
          juros?: number | null
          month_label: string
          recebido?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emprestado?: number | null
          id?: string
          juros?: number | null
          month_label?: string
          recebido?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          active: boolean
          address: string
          bairro: string
          city: string
          cnpj: string
          cpf: string
          created_at: string
          email: string
          estado_civil: string
          id: string
          is_vehicle_rental: boolean
          nacionalidade: string
          name: string
          notes: string | null
          phone: string
          profissao: string
          rg: string
          score: string
          state: string
          user_id: string
        }
        Insert: {
          active?: boolean
          address?: string
          bairro?: string
          city?: string
          cnpj?: string
          cpf?: string
          created_at?: string
          email?: string
          estado_civil?: string
          id?: string
          is_vehicle_rental?: boolean
          nacionalidade?: string
          name: string
          notes?: string | null
          phone?: string
          profissao?: string
          rg?: string
          score?: string
          state?: string
          user_id: string
        }
        Update: {
          active?: boolean
          address?: string
          bairro?: string
          city?: string
          cnpj?: string
          cpf?: string
          created_at?: string
          email?: string
          estado_civil?: string
          id?: string
          is_vehicle_rental?: boolean
          nacionalidade?: string
          name?: string
          notes?: string | null
          phone?: string
          profissao?: string
          rg?: string
          score?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          due_date: string
          id: string
          installments: number | null
          notes: string | null
          paid: boolean
          paid_date: string | null
          paid_installments: number | null
          parent_expense_id: string | null
          scope: string
          type: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description: string
          due_date: string
          id?: string
          installments?: number | null
          notes?: string | null
          paid?: boolean
          paid_date?: string | null
          paid_installments?: number | null
          parent_expense_id?: string | null
          scope?: string
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          installments?: number | null
          notes?: string | null
          paid?: boolean
          paid_date?: string | null
          paid_installments?: number | null
          parent_expense_id?: string | null
          scope?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_parent_expense_id_fkey"
            columns: ["parent_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          installment_number: number
          loan_id: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          loan_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          loan_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_installments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount: number
          borrower_id: string | null
          borrower_name: string
          created_at: string
          custom_installment_value: number | null
          custom_interest_value: number | null
          due_date: string
          id: string
          installments: number
          interest_rate: number
          interest_type: string
          late_interest_type: string | null
          late_interest_value: number | null
          notes: string | null
          paid_installments: number
          payment_type: string
          penalty_value: number | null
          remaining_amount: number
          start_date: string
          status: string
          tags: string[] | null
          user_id: string
        }
        Insert: {
          amount?: number
          borrower_id?: string | null
          borrower_name: string
          created_at?: string
          custom_installment_value?: number | null
          custom_interest_value?: number | null
          due_date: string
          id?: string
          installments?: number
          interest_rate?: number
          interest_type?: string
          late_interest_type?: string | null
          late_interest_value?: number | null
          notes?: string | null
          paid_installments?: number
          payment_type?: string
          penalty_value?: number | null
          remaining_amount?: number
          start_date: string
          status?: string
          tags?: string[] | null
          user_id: string
        }
        Update: {
          amount?: number
          borrower_id?: string | null
          borrower_name?: string
          created_at?: string
          custom_installment_value?: number | null
          custom_interest_value?: number | null
          due_date?: string
          id?: string
          installments?: number
          interest_rate?: number
          interest_type?: string
          late_interest_type?: string | null
          late_interest_value?: number | null
          notes?: string | null
          paid_installments?: number
          payment_type?: string
          penalty_value?: number | null
          remaining_amount?: number
          start_date?: string
          status?: string
          tags?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      locador_info: {
        Row: {
          bairro: string
          cidade: string
          cpf: string
          created_at: string
          endereco: string
          estado: string
          id: string
          nacionalidade: string
          nome: string
          profissao: string
          rg: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bairro?: string
          cidade?: string
          cpf?: string
          created_at?: string
          endereco?: string
          estado?: string
          id?: string
          nacionalidade?: string
          nome?: string
          profissao?: string
          rg?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bairro?: string
          cidade?: string
          cpf?: string
          created_at?: string
          endereco?: string
          estado?: string
          id?: string
          nacionalidade?: string
          nome?: string
          profissao?: string
          rg?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          enabled: boolean
          id: string
          notification_type: string
          send_time: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          notification_type: string
          send_time?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          notification_type?: string
          send_time?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          date: string
          id: string
          installment_number: number
          loan_id: string
          previous_due_date: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          date: string
          id?: string
          installment_number?: number
          loan_id: string
          previous_due_date?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          installment_number?: number
          loan_id?: string
          previous_due_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_budget_alerts: {
        Row: {
          alert_type: string
          category: string
          created_at: string
          id: string
          month: string
          user_id: string
        }
        Insert: {
          alert_type?: string
          category: string
          created_at?: string
          id?: string
          month: string
          user_id: string
        }
        Update: {
          alert_type?: string
          category?: string
          created_at?: string
          id?: string
          month?: string
          user_id?: string
        }
        Relationships: []
      }
      personal_budgets: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          active: boolean
          allowed_tabs: string[]
          created_at: string
          features: string[]
          highlight: boolean
          id: string
          max_loans: number | null
          max_users: number | null
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          allowed_tabs?: string[]
          created_at?: string
          features?: string[]
          highlight?: boolean
          id?: string
          max_loans?: number | null
          max_users?: number | null
          name: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          allowed_tabs?: string[]
          created_at?: string
          features?: string[]
          highlight?: boolean
          id?: string
          max_loans?: number | null
          max_users?: number | null
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          cost: number
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          stock: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price?: number
          stock?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          stock?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          send_time: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          send_time?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          send_time?: string
          user_id?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          business_type: string
          created_at: string
          customer_name: string
          description: string
          frequency: string
          id: string
          installment_amounts: Json | null
          installment_dates: Json | null
          installment_value: number | null
          installments: number
          locador_id: string | null
          notes: string | null
          paid_installments: number
          partial_paid: number
          payment_history: Json | null
          payment_mode: string
          product_id: string | null
          quantity: number
          sale_date: string
          total: number
          user_id: string
        }
        Insert: {
          business_type?: string
          created_at?: string
          customer_name?: string
          description?: string
          frequency?: string
          id?: string
          installment_amounts?: Json | null
          installment_dates?: Json | null
          installment_value?: number | null
          installments?: number
          locador_id?: string | null
          notes?: string | null
          paid_installments?: number
          partial_paid?: number
          payment_history?: Json | null
          payment_mode?: string
          product_id?: string | null
          quantity?: number
          sale_date?: string
          total?: number
          user_id: string
        }
        Update: {
          business_type?: string
          created_at?: string
          customer_name?: string
          description?: string
          frequency?: string
          id?: string
          installment_amounts?: Json | null
          installment_dates?: Json | null
          installment_value?: number | null
          installments?: number
          locador_id?: string | null
          notes?: string | null
          paid_installments?: number
          partial_paid?: number
          payment_history?: Json | null
          payment_mode?: string
          product_id?: string | null
          quantity?: number
          sale_date?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_locador_id_fkey"
            columns: ["locador_id"]
            isOneToOne: false
            referencedRelation: "locador_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string
          paddle_subscription_id?: string
          price_id?: string
          product_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_link_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_links: {
        Row: {
          chat_id: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: number
          created_at: string
          processed: boolean
          processed_at: string | null
          raw_update: Json
          text: string | null
          update_id: number
        }
        Insert: {
          chat_id: number
          created_at?: string
          processed?: boolean
          processed_at?: string | null
          raw_update: Json
          text?: string | null
          update_id: number
        }
        Update: {
          chat_id?: number
          created_at?: string
          processed?: boolean
          processed_at?: string | null
          raw_update?: Json
          text?: string | null
          update_id?: number
        }
        Relationships: []
      }
      telegram_summary_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          last_sent_date: string | null
          send_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          last_sent_date?: string | null
          send_time?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          last_sent_date?: string | null
          send_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_client_permissions: {
        Row: {
          client_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_client_permissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_owner: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tab_permissions: {
        Row: {
          allowed_tabs: string[]
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_tabs?: string[]
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_tabs?: string[]
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicle_balance: {
        Row: {
          amount: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicle_registry: {
        Row: {
          ano: string
          cor: string
          created_at: string
          id: string
          marca_modelo: string
          placa: string
          renavam: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ano?: string
          cor?: string
          created_at?: string
          id?: string
          marca_modelo?: string
          placa?: string
          renavam?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ano?: string
          cor?: string
          created_at?: string
          id?: string
          marca_modelo?: string
          placa?: string
          renavam?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          send_time: string
          updated_at: string
          user_id: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          send_time?: string
          updated_at?: string
          user_id: string
          webhook_url?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          send_time?: string
          updated_at?: string
          user_id?: string
          webhook_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write_data: { Args: { _user_id: string }; Returns: boolean }
      get_data_owner_id: { Args: { _user_id: string }; Returns: string }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operador" | "visualizador"
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
      app_role: ["admin", "operador", "visualizador"],
    },
  },
} as const
