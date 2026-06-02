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
      account_ledger: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          direction: string
          expense_id: string | null
          id: string
          loan_id: string | null
          metadata: Json
          occurred_on: string
          payment_id: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string
          direction: string
          expense_id?: string | null
          id?: string
          loan_id?: string | null
          metadata?: Json
          occurred_on: string
          payment_id?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          direction?: string
          expense_id?: string | null
          id?: string
          loan_id?: string | null
          metadata?: Json
          occurred_on?: string
          payment_id?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_settings: {
        Row: {
          auto_backup_enabled: boolean | null
          id: string
          last_auto_backup_at: string | null
          last_auto_backup_drive_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_backup_enabled?: boolean | null
          id?: string
          last_auto_backup_at?: string | null
          last_auto_backup_drive_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_backup_enabled?: boolean | null
          id?: string
          last_auto_backup_at?: string | null
          last_auto_backup_drive_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      backup_history: {
        Row: {
          created_at: string
          drive_file_id: string | null
          drive_url: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          drive_url?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          drive_url?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
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
      clients: {
        Row: {
          active: boolean
          address: string
          city: string
          cnpj: string
          cpf: string
          created_at: string
          email: string
          id: string
          name: string
          notes: string | null
          phone: string
          rg: string
          score: string
          state: string
          user_id: string
        }
        Insert: {
          active?: boolean
          address?: string
          city?: string
          cnpj?: string
          cpf?: string
          created_at?: string
          email?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string
          rg?: string
          score?: string
          state?: string
          user_id: string
        }
        Update: {
          active?: boolean
          address?: string
          city?: string
          cnpj?: string
          cpf?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string
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
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      loans: {
        Row: {
          amount: number
          borrower_id: string | null
          borrower_name: string
          created_at: string
          due_date: string
          id: string
          installments: number
          interest_rate: number
          interest_type: string
          notes: string | null
          paid_installments: number
          payment_type: string
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
          due_date: string
          id?: string
          installments?: number
          interest_rate?: number
          interest_type?: string
          notes?: string | null
          paid_installments?: number
          payment_type?: string
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
          due_date?: string
          id?: string
          installments?: number
          interest_rate?: number
          interest_type?: string
          notes?: string | null
          paid_installments?: number
          payment_type?: string
          start_date?: string
          status?: string
          tags?: string[] | null
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
      plans: {
        Row: {
          active: boolean | null
          allowed_tabs: string[] | null
          created_at: string
          features: string[] | null
          highlight: boolean | null
          id: string
          max_loans: number | null
          max_users: number | null
          name: string
          price: number
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          allowed_tabs?: string[] | null
          created_at?: string
          features?: string[] | null
          highlight?: boolean | null
          id?: string
          max_loans?: number | null
          max_users?: number | null
          name: string
          price: number
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          allowed_tabs?: string[] | null
          created_at?: string
          features?: string[] | null
          highlight?: boolean | null
          id?: string
          max_loans?: number | null
          max_users?: number | null
          name?: string
          price?: number
          sort_order?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string | null
          id: string
          paddle_customer_id: string | null
          price_id: string | null
          product_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string | null
          id?: string
          paddle_customer_id?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string | null
          id?: string
          paddle_customer_id?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_telegram_bots: {
        Row: {
          active: boolean
          bot_id: number | null
          bot_username: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_polled_at: string | null
          last_validated_at: string | null
          name: string
          purpose: string
          token: string
          update_offset: number
          updated_at: string
          validation_status: string | null
        }
        Insert: {
          active?: boolean
          bot_id?: number | null
          bot_username?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_polled_at?: string | null
          last_validated_at?: string | null
          name: string
          purpose?: string
          token: string
          update_offset?: number
          updated_at?: string
          validation_status?: string | null
        }
        Update: {
          active?: boolean
          bot_id?: number | null
          bot_username?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_polled_at?: string | null
          last_validated_at?: string | null
          name?: string
          purpose?: string
          token?: string
          update_offset?: number
          updated_at?: string
          validation_status?: string | null
        }
        Relationships: []
      }
      telegram_link_codes: {
        Row: {
          bot_id: string | null
          code: string
          created_at: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          bot_id?: string | null
          code: string
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          bot_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_codes_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "system_telegram_bots"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_links: {
        Row: {
          bot_id: string | null
          chat_id: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          bot_id?: string | null
          chat_id: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          bot_id?: string | null
          chat_id?: number
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_links_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "system_telegram_bots"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_messages: {
        Row: {
          bot_id: string | null
          chat_id: number
          created_at: string
          processed: boolean
          processed_at: string | null
          raw_update: Json
          text: string | null
          update_id: number
        }
        Insert: {
          bot_id?: string | null
          chat_id: number
          created_at?: string
          processed?: boolean
          processed_at?: string | null
          raw_update: Json
          text?: string | null
          update_id: number
        }
        Update: {
          bot_id?: string | null
          chat_id?: number
          created_at?: string
          processed?: boolean
          processed_at?: string | null
          raw_update?: Json
          text?: string | null
          update_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "telegram_messages_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "system_telegram_bots"
            referencedColumns: ["id"]
          },
        ]
      }
      user_goal_prefs: {
        Row: {
          id: string
          order_list: Json | null
          selected: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          order_list?: Json | null
          selected?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          order_list?: Json | null
          selected?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_telegram_bots: {
        Row: {
          active: boolean
          bot_id: number | null
          bot_username: string | null
          created_at: string
          description: string | null
          id: string
          last_validated_at: string | null
          name: string
          owner_id: string
          token: string
          updated_at: string
          validation_status: string | null
        }
        Insert: {
          active?: boolean
          bot_id?: number | null
          bot_username?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_validated_at?: string | null
          name: string
          owner_id: string
          token: string
          updated_at?: string
          validation_status?: string | null
        }
        Update: {
          active?: boolean
          bot_id?: number | null
          bot_username?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_validated_at?: string | null
          name?: string
          owner_id?: string
          token?: string
          updated_at?: string
          validation_status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
