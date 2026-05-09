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
          payment_method_id: string | null
          source: string
          transfer_group_id: string | null
          updated_at: string
          user_id: string
          wallet: string
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
          payment_method_id?: string | null
          source?: string
          transfer_group_id?: string | null
          updated_at?: string
          user_id: string
          wallet?: string
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
          payment_method_id?: string | null
          source?: string
          transfer_group_id?: string | null
          updated_at?: string
          user_id?: string
          wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_ledger_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      account_settings: {
        Row: {
          created_at: string
          id: string
          max_credit_limit: number | null
          owner_id: string
          require_approval: boolean
          simulation_interest_rate: number
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_credit_limit?: number | null
          owner_id: string
          require_approval?: boolean
          simulation_interest_rate?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_credit_limit?: number | null
          owner_id?: string
          require_approval?: boolean
          simulation_interest_rate?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      accountant_audit_logs: {
        Row: {
          confidence_score: number
          corrections: Json
          created_at: string
          executed_at: string
          id: string
          issues: Json
          notes: string | null
          period_end: string | null
          period_start: string | null
          totals: Json
          user_id: string
        }
        Insert: {
          confidence_score?: number
          corrections?: Json
          created_at?: string
          executed_at?: string
          id?: string
          issues?: Json
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          totals?: Json
          user_id: string
        }
        Update: {
          confidence_score?: number
          corrections?: Json
          created_at?: string
          executed_at?: string
          id?: string
          issues?: Json
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          totals?: Json
          user_id?: string
        }
        Relationships: []
      }
      active_capital_snapshots: {
        Row: {
          amount: number
          created_at: string
          finalized: boolean
          id: string
          last_calculated_at: string
          month: string
          owner_id: string
          snapshot_date: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          finalized?: boolean
          id?: string
          last_calculated_at?: string
          month: string
          owner_id: string
          snapshot_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          finalized?: boolean
          id?: string
          last_calculated_at?: string
          month?: string
          owner_id?: string
          snapshot_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_viewing_sessions: {
        Row: {
          admin_id: string
          started_at: string
          viewing_user_id: string
        }
        Insert: {
          admin_id: string
          started_at?: string
          viewing_user_id: string
        }
        Update: {
          admin_id?: string
          started_at?: string
          viewing_user_id?: string
        }
        Relationships: []
      }
      app_branding: {
        Row: {
          brand_name: string
          created_at: string
          id: string
          logo_url: string | null
          singleton: boolean
          sizes: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_name?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          singleton?: boolean
          sizes?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_name?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          singleton?: boolean
          sizes?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      balance: {
        Row: {
          account_amount: number
          amount: number
          cash_amount: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_amount?: number
          amount?: number
          cash_amount?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_amount?: number
          amount?: number
          cash_amount?: number
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
      client_analysis_events: {
        Row: {
          client_id: string
          created_at: string
          event_type: string
          id: string
          message: string | null
          metadata: Json
          owner_id: string
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json
          owner_id: string
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json
          owner_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_analysis_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_credit_reports: {
        Row: {
          client_id: string
          created_at: string
          credit_history_summary: string | null
          delinquency_history: Json
          expires_at: string | null
          fetched_at: string | null
          id: string
          owner_id: string
          provider: string
          raw_summary: Json
          source_status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          credit_history_summary?: string | null
          delinquency_history?: Json
          expires_at?: string | null
          fetched_at?: string | null
          id?: string
          owner_id: string
          provider: string
          raw_summary?: Json
          source_status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          credit_history_summary?: string | null
          delinquency_history?: Json
          expires_at?: string | null
          fetched_at?: string | null
          id?: string
          owner_id?: string
          provider?: string
          raw_summary?: Json
          source_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_credit_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_financial_profiles: {
        Row: {
          analysis_status: string
          banking_relationship: string | null
          client_id: string
          consent_given: boolean
          consented_at: string | null
          consolidated_score: number | null
          created_at: string
          debt_level: number | null
          employment_stability: string | null
          expires_at: string | null
          external_score: number | null
          fetched_at: string | null
          id: string
          industry_sector: string | null
          internal_score: number | null
          last_error: string | null
          monthly_income: number | null
          negative_factors: string[]
          owner_id: string
          positive_factors: string[]
          provider: string | null
          risk_level: string | null
          source_status: string
          updated_at: string
        }
        Insert: {
          analysis_status?: string
          banking_relationship?: string | null
          client_id: string
          consent_given?: boolean
          consented_at?: string | null
          consolidated_score?: number | null
          created_at?: string
          debt_level?: number | null
          employment_stability?: string | null
          expires_at?: string | null
          external_score?: number | null
          fetched_at?: string | null
          id?: string
          industry_sector?: string | null
          internal_score?: number | null
          last_error?: string | null
          monthly_income?: number | null
          negative_factors?: string[]
          owner_id: string
          positive_factors?: string[]
          provider?: string | null
          risk_level?: string | null
          source_status?: string
          updated_at?: string
        }
        Update: {
          analysis_status?: string
          banking_relationship?: string | null
          client_id?: string
          consent_given?: boolean
          consented_at?: string | null
          consolidated_score?: number | null
          created_at?: string
          debt_level?: number | null
          employment_stability?: string | null
          expires_at?: string | null
          external_score?: number | null
          fetched_at?: string | null
          id?: string
          industry_sector?: string | null
          internal_score?: number | null
          last_error?: string | null
          monthly_income?: number | null
          negative_factors?: string[]
          owner_id?: string
          positive_factors?: string[]
          provider?: string | null
          risk_level?: string | null
          source_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_financial_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          address: string
          auto_billing_enabled: boolean
          bairro: string
          city: string
          cnpj: string
          cpf: string
          created_at: string
          default_interest_rate: number | null
          email: string
          estado_civil: string
          id: string
          is_manager: boolean
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
          auto_billing_enabled?: boolean
          bairro?: string
          city?: string
          cnpj?: string
          cpf?: string
          created_at?: string
          default_interest_rate?: number | null
          email?: string
          estado_civil?: string
          id?: string
          is_manager?: boolean
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
          auto_billing_enabled?: boolean
          bairro?: string
          city?: string
          cnpj?: string
          cpf?: string
          created_at?: string
          default_interest_rate?: number | null
          email?: string
          estado_civil?: string
          id?: string
          is_manager?: boolean
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
      credit_card_invoice_openings: {
        Row: {
          card_id: string
          created_at: string
          cycle_key: string
          id: string
          notes: string | null
          opening_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          cycle_key: string
          id?: string
          notes?: string | null
          opening_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          cycle_key?: string
          id?: string
          notes?: string | null
          opening_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_invoice_openings_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          active: boolean
          bank: string
          brand: string
          closing_day: number
          created_at: string
          credit_limit: number
          due_day: number
          id: string
          last_four: string
          nickname: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          bank: string
          brand?: string
          closing_day?: number
          created_at?: string
          credit_limit?: number
          due_day?: number
          id?: string
          last_four?: string
          nickname?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          bank?: string
          brand?: string
          closing_day?: number
          created_at?: string
          credit_limit?: number
          due_day?: number
          id?: string
          last_four?: string
          nickname?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_limit_history: {
        Row: {
          change_type: string
          changed_by: string | null
          client_id: string
          created_at: string
          id: string
          metadata: Json
          new_limit: number
          previous_limit: number
          reason: string | null
          user_id: string
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          client_id: string
          created_at?: string
          id?: string
          metadata?: Json
          new_limit?: number
          previous_limit?: number
          reason?: string | null
          user_id: string
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          client_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          new_limit?: number
          previous_limit?: number
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_limits: {
        Row: {
          client_id: string
          created_at: string
          current_limit: number
          id: string
          last_auto_calculated_at: string | null
          mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          current_limit?: number
          id?: string
          last_auto_calculated_at?: string | null
          mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          current_limit?: number
          id?: string
          last_auto_calculated_at?: string | null
          mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_planning_telegram_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          format: string
          last_sent: Json
          send_target: string
          send_time_1: string | null
          send_time_2: string | null
          send_time_3: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          format?: string
          last_sent?: Json
          send_target?: string
          send_time_1?: string | null
          send_time_2?: string | null
          send_time_3?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          format?: string
          last_sent?: Json
          send_target?: string
          send_time_1?: string | null
          send_time_2?: string | null
          send_time_3?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expense_category_hints: {
        Row: {
          category: string
          created_at: string
          hits: number
          id: string
          keyword: string
          last_used: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          hits?: number
          id?: string
          keyword: string
          last_used?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          hits?: number
          id?: string
          keyword?: string
          last_used?: string
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
          payment_method_id: string | null
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
          payment_method_id?: string | null
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
          payment_method_id?: string | null
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
          {
            foreignKeyName: "expenses_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      income_categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      income_category_hints: {
        Row: {
          category: string
          created_at: string
          hits: number
          id: string
          keyword: string
          last_used: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          hits?: number
          id?: string
          keyword: string
          last_used?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          hits?: number
          id?: string
          keyword?: string
          last_used?: string
          user_id?: string
        }
        Relationships: []
      }
      incomes: {
        Row: {
          amount: number
          category: string | null
          client_id: string | null
          created_at: string
          description: string
          id: string
          ledger_id: string | null
          notes: string | null
          parent_id: string | null
          payment_method_id: string | null
          received_date: string
          recurrence: string
          source: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          description: string
          id?: string
          ledger_id?: string | null
          notes?: string | null
          parent_id?: string | null
          payment_method_id?: string | null
          received_date?: string
          recurrence?: string
          source?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          description?: string
          id?: string
          ledger_id?: string | null
          notes?: string | null
          parent_id?: string | null
          payment_method_id?: string | null
          received_date?: string
          recurrence?: string
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expires_at: string | null
          id: string
          max_uses: number | null
          owner_id: string
          updated_at: string
          uses_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          owner_id: string
          updated_at?: string
          uses_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          owner_id?: string
          updated_at?: string
          uses_count?: number
        }
        Relationships: []
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
      loan_renegotiations: {
        Row: {
          created_at: string
          id: string
          loan_id: string
          new_amount: number
          new_installments: number | null
          notes: string | null
          penalty_amount: number
          penalty_input: number | null
          penalty_mode: string | null
          previous_amount: number
          previous_installments: number | null
          previous_state: Json | null
          renegotiated_at: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          loan_id: string
          new_amount?: number
          new_installments?: number | null
          notes?: string | null
          penalty_amount?: number
          penalty_input?: number | null
          penalty_mode?: string | null
          previous_amount?: number
          previous_installments?: number | null
          previous_state?: Json | null
          renegotiated_at: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          loan_id?: string
          new_amount?: number
          new_installments?: number | null
          notes?: string | null
          penalty_amount?: number
          penalty_input?: number | null
          penalty_mode?: string | null
          previous_amount?: number
          previous_installments?: number | null
          previous_state?: Json | null
          renegotiated_at?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      loan_simulations: {
        Row: {
          chosen_scenario_id: string | null
          client_id: string | null
          created_at: string
          id: string
          name: string | null
          notes: string | null
          owner_id: string
          scenarios: Json
          simulation_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chosen_scenario_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          owner_id: string
          scenarios?: Json
          simulation_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chosen_scenario_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          owner_id?: string
          scenarios?: Json
          simulation_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_simulations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount: number
          auto_billing_enabled: boolean
          borrower_id: string | null
          borrower_name: string
          created_at: string
          custom_installment_value: number | null
          custom_interest_value: number | null
          due_date: string
          has_manager: boolean
          id: string
          installments: number
          interest_rate: number
          interest_rate_mode: string
          interest_type: string
          late_interest_type: string | null
          late_interest_value: number | null
          manager_commission_rate: number
          manager_id: string | null
          notes: string | null
          original_due_date: string | null
          paid_installments: number
          payment_type: string
          penalty_value: number | null
          remaining_amount: number
          renegotiation_penalty_total: number
          start_date: string
          status: string
          tags: string[] | null
          user_id: string
        }
        Insert: {
          amount?: number
          auto_billing_enabled?: boolean
          borrower_id?: string | null
          borrower_name: string
          created_at?: string
          custom_installment_value?: number | null
          custom_interest_value?: number | null
          due_date: string
          has_manager?: boolean
          id?: string
          installments?: number
          interest_rate?: number
          interest_rate_mode?: string
          interest_type?: string
          late_interest_type?: string | null
          late_interest_value?: number | null
          manager_commission_rate?: number
          manager_id?: string | null
          notes?: string | null
          original_due_date?: string | null
          paid_installments?: number
          payment_type?: string
          penalty_value?: number | null
          remaining_amount?: number
          renegotiation_penalty_total?: number
          start_date: string
          status?: string
          tags?: string[] | null
          user_id: string
        }
        Update: {
          amount?: number
          auto_billing_enabled?: boolean
          borrower_id?: string | null
          borrower_name?: string
          created_at?: string
          custom_installment_value?: number | null
          custom_interest_value?: number | null
          due_date?: string
          has_manager?: boolean
          id?: string
          installments?: number
          interest_rate?: number
          interest_rate_mode?: string
          interest_type?: string
          late_interest_type?: string | null
          late_interest_value?: number | null
          manager_commission_rate?: number
          manager_id?: string | null
          notes?: string | null
          original_due_date?: string | null
          paid_installments?: number
          payment_type?: string
          penalty_value?: number | null
          remaining_amount?: number
          renegotiation_penalty_total?: number
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
      manager_commissions: {
        Row: {
          amount: number
          base_amount: number
          commission_type: string
          created_at: string
          generated_at: string
          id: string
          loan_id: string
          manager_id: string
          notes: string | null
          payment_id: string | null
          rate: number
          user_id: string
        }
        Insert: {
          amount?: number
          base_amount?: number
          commission_type?: string
          created_at?: string
          generated_at: string
          id?: string
          loan_id: string
          manager_id: string
          notes?: string | null
          payment_id?: string | null
          rate?: number
          user_id: string
        }
        Update: {
          amount?: number
          base_amount?: number
          commission_type?: string
          created_at?: string
          generated_at?: string
          id?: string
          loan_id?: string
          manager_id?: string
          notes?: string | null
          payment_id?: string | null
          rate?: number
          user_id?: string
        }
        Relationships: []
      }
      monthly_goal_snapshots: {
        Row: {
          attainment_pct: number | null
          created_at: string
          finalized: boolean
          goal_type: string
          id: string
          month: string
          owner_id: string
          realized_value: number
          snapshot_date: string
          target_value: number | null
          updated_at: string
        }
        Insert: {
          attainment_pct?: number | null
          created_at?: string
          finalized?: boolean
          goal_type: string
          id?: string
          month: string
          owner_id: string
          realized_value?: number
          snapshot_date?: string
          target_value?: number | null
          updated_at?: string
        }
        Update: {
          attainment_pct?: number | null
          created_at?: string
          finalized?: boolean
          goal_type?: string
          id?: string
          month?: string
          owner_id?: string
          realized_value?: number
          snapshot_date?: string
          target_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      monthly_goals: {
        Row: {
          created_at: string
          goal_type: string
          id: string
          month: string
          notes: string | null
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_type: string
          id?: string
          month: string
          notes?: string | null
          target_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_type?: string
          id?: string
          month?: string
          notes?: string | null
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      monthly_opening_balances: {
        Row: {
          amount: number
          created_at: string
          id: string
          month: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          month: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          month?: string
          owner_id?: string
          updated_at?: string
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
      payment_methods: {
        Row: {
          active: boolean
          created_at: string
          icon: string | null
          id: string
          kind: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          updated_at?: string
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
          metadata: Json
          payment_method_id: string | null
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
          metadata?: Json
          payment_method_id?: string | null
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
          metadata?: Json
          payment_method_id?: string | null
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
          {
            foreignKeyName: "payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_ai_insights: {
        Row: {
          content: string
          created_at: string
          exceeded_categories: string[]
          generated_at: string
          id: string
          month: string
          summary: string | null
          trends: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          exceeded_categories?: string[]
          generated_at?: string
          id?: string
          month: string
          summary?: string | null
          trends?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          exceeded_categories?: string[]
          generated_at?: string
          id?: string
          month?: string
          summary?: string | null
          trends?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          id?: string
          month?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      personal_expense_categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      personal_insights_telegram_prefs: {
        Row: {
          alert_on_exceed: boolean
          alert_on_trend: boolean
          created_at: string
          enabled: boolean
          format: string
          last_sent: Json
          send_time_1: string | null
          send_time_2: string | null
          send_time_3: string | null
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_on_exceed?: boolean
          alert_on_trend?: boolean
          created_at?: string
          enabled?: boolean
          format?: string
          last_sent?: Json
          send_time_1?: string | null
          send_time_2?: string | null
          send_time_3?: string | null
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_on_exceed?: boolean
          alert_on_trend?: boolean
          created_at?: string
          enabled?: boolean
          format?: string
          last_sent?: Json
          send_time_1?: string | null
          send_time_2?: string | null
          send_time_3?: string | null
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      piggy_bank_deposits: {
        Row: {
          amount: number
          created_at: string
          deposit_date: string
          expense_id: string | null
          id: string
          piggy_bank_id: string
          recurrence_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          deposit_date: string
          expense_id?: string | null
          id?: string
          piggy_bank_id: string
          recurrence_id?: string | null
          source?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          deposit_date?: string
          expense_id?: string | null
          id?: string
          piggy_bank_id?: string
          recurrence_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piggy_bank_deposits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piggy_bank_deposits_piggy_bank_id_fkey"
            columns: ["piggy_bank_id"]
            isOneToOne: false
            referencedRelation: "piggy_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      piggy_bank_rate_history: {
        Row: {
          annual_rate: number
          created_at: string
          effective_from: string
          id: string
          piggy_bank_id: string
          user_id: string
        }
        Insert: {
          annual_rate: number
          created_at?: string
          effective_from: string
          id?: string
          piggy_bank_id: string
          user_id: string
        }
        Update: {
          annual_rate?: number
          created_at?: string
          effective_from?: string
          id?: string
          piggy_bank_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piggy_bank_rate_history_piggy_bank_id_fkey"
            columns: ["piggy_bank_id"]
            isOneToOne: false
            referencedRelation: "piggy_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      piggy_bank_recurrences: {
        Row: {
          active: boolean
          amount: number
          created_at: string
          day_of_month: number
          description: string | null
          end_date: string | null
          id: string
          last_generated_date: string | null
          piggy_bank_id: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount?: number
          created_at?: string
          day_of_month?: number
          description?: string | null
          end_date?: string | null
          id?: string
          last_generated_date?: string | null
          piggy_bank_id: string
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount?: number
          created_at?: string
          day_of_month?: number
          description?: string | null
          end_date?: string | null
          id?: string
          last_generated_date?: string | null
          piggy_bank_id?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piggy_bank_recurrences_piggy_bank_id_fkey"
            columns: ["piggy_bank_id"]
            isOneToOne: false
            referencedRelation: "piggy_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      piggy_banks: {
        Row: {
          annual_rate: number
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          short_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          annual_rate?: number
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          short_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          annual_rate?: number
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          short_id?: number | null
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
          phone: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
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
      simulation_settings: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          retention_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          retention_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          retention_days?: number
          updated_at?: string
        }
        Relationships: []
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
      telegram_accumulated_delinquency_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          format: string
          id: string
          last_sent: Json
          send_time_1: string | null
          send_time_2: string | null
          send_time_3: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          format?: string
          id?: string
          last_sent?: Json
          send_time_1?: string | null
          send_time_2?: string | null
          send_time_3?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          format?: string
          id?: string
          last_sent?: Json
          send_time_1?: string | null
          send_time_2?: string | null
          send_time_3?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_billing_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          format: string
          last_sent: Json
          send_time_1: string | null
          send_time_2: string | null
          send_time_3: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          format?: string
          last_sent?: Json
          send_time_1?: string | null
          send_time_2?: string | null
          send_time_3?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          format?: string
          last_sent?: Json
          send_time_1?: string | null
          send_time_2?: string | null
          send_time_3?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_bot_state: {
        Row: {
          id: number
          last_webhook_recovery_at: string | null
          update_offset: number
          updated_at: string
          webhook_recovery_count: number
        }
        Insert: {
          id: number
          last_webhook_recovery_at?: string | null
          update_offset?: number
          updated_at?: string
          webhook_recovery_count?: number
        }
        Update: {
          id?: number
          last_webhook_recovery_at?: string | null
          update_offset?: number
          updated_at?: string
          webhook_recovery_count?: number
        }
        Relationships: []
      }
      telegram_bots: {
        Row: {
          bot_code: string
          chat_id: number
          created_at: string
          created_by_user_id: string | null
          expires_at: string | null
          id: string
          kind: string
          updated_at: string
        }
        Insert: {
          bot_code: string
          chat_id: number
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          updated_at?: string
        }
        Update: {
          bot_code?: string
          chat_id?: number
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
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
          bot_code: string | null
          chat_id: number
          created_at: string
          id: string
          label: string | null
          user_id: string
        }
        Insert: {
          bot_code?: string | null
          chat_id: number
          created_at?: string
          id?: string
          label?: string | null
          user_id: string
        }
        Update: {
          bot_code?: string | null
          chat_id?: number
          created_at?: string
          id?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_manager_weekly_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          format: string
          id: string
          last_sent_date: string | null
          message_template: string
          send_time: string
          send_weekday: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          format?: string
          id?: string
          last_sent_date?: string | null
          message_template?: string
          send_time?: string
          send_weekday?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          format?: string
          id?: string
          last_sent_date?: string | null
          message_template?: string
          send_time?: string
          send_weekday?: number
          updated_at?: string
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
      telegram_pending_edits: {
        Row: {
          chat_id: number
          created_at: string
          expense_id: string
          expires_at: string
          message_id: number
          user_id: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          expense_id: string
          expires_at?: string
          message_id: number
          user_id: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          expense_id?: string
          expires_at?: string
          message_id?: number
          user_id?: string
        }
        Relationships: []
      }
      telegram_pending_piggy_aporte: {
        Row: {
          chat_id: number
          created_at: string
          expires_at: string
          notes: string | null
          pending_amount: number | null
          piggy_bank_id: string | null
          user_id: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          expires_at?: string
          notes?: string | null
          pending_amount?: number | null
          piggy_bank_id?: string | null
          user_id: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          expires_at?: string
          notes?: string | null
          pending_amount?: number | null
          piggy_bank_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_reports_bot_state: {
        Row: {
          id: number
          last_webhook_recovery_at: string | null
          update_offset: number
          updated_at: string
          webhook_recovery_count: number
        }
        Insert: {
          id: number
          last_webhook_recovery_at?: string | null
          update_offset?: number
          updated_at?: string
          webhook_recovery_count?: number
        }
        Update: {
          id?: number
          last_webhook_recovery_at?: string | null
          update_offset?: number
          updated_at?: string
          webhook_recovery_count?: number
        }
        Relationships: []
      }
      telegram_reports_link_codes: {
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
      telegram_reports_links: {
        Row: {
          bot_code: string | null
          chat_id: number
          created_at: string
          id: string
          label: string | null
          user_id: string
        }
        Insert: {
          bot_code?: string | null
          chat_id: number
          created_at?: string
          id?: string
          label?: string | null
          user_id: string
        }
        Update: {
          bot_code?: string | null
          chat_id?: number
          created_at?: string
          id?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_summary_prefs: {
        Row: {
          created_at: string
          daily_format: string
          enabled: boolean
          last_monthly_sent_month: string | null
          last_sent_date: string | null
          last_weekly_sent_date: string | null
          monthly_enabled: boolean
          monthly_format: string
          monthly_send_day: number
          monthly_send_time: string
          send_time: string
          updated_at: string
          user_id: string
          weekly_enabled: boolean
          weekly_format: string
          weekly_send_time: string
          weekly_send_weekday: number
        }
        Insert: {
          created_at?: string
          daily_format?: string
          enabled?: boolean
          last_monthly_sent_month?: string | null
          last_sent_date?: string | null
          last_weekly_sent_date?: string | null
          monthly_enabled?: boolean
          monthly_format?: string
          monthly_send_day?: number
          monthly_send_time?: string
          send_time?: string
          updated_at?: string
          user_id: string
          weekly_enabled?: boolean
          weekly_format?: string
          weekly_send_time?: string
          weekly_send_weekday?: number
        }
        Update: {
          created_at?: string
          daily_format?: string
          enabled?: boolean
          last_monthly_sent_month?: string | null
          last_sent_date?: string | null
          last_weekly_sent_date?: string | null
          monthly_enabled?: boolean
          monthly_format?: string
          monthly_send_day?: number
          monthly_send_time?: string
          send_time?: string
          updated_at?: string
          user_id?: string
          weekly_enabled?: boolean
          weekly_format?: string
          weekly_send_time?: string
          weekly_send_weekday?: number
        }
        Relationships: []
      }
      tracking_positions: {
        Row: {
          address: string | null
          address_cached_at: string | null
          device_time: string
          ignition: boolean | null
          latitude: number
          longitude: number
          online: boolean
          owner_id: string
          raw: Json | null
          speed_kmh: number | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          address?: string | null
          address_cached_at?: string | null
          device_time: string
          ignition?: boolean | null
          latitude: number
          longitude: number
          online?: boolean
          owner_id: string
          raw?: Json | null
          speed_kmh?: number | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          address?: string | null
          address_cached_at?: string | null
          device_time?: string
          ignition?: boolean | null
          latitude?: number
          longitude?: number
          online?: boolean
          owner_id?: string
          raw?: Json | null
          speed_kmh?: number | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_positions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicle_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_providers: {
        Row: {
          auth_type: string
          base_url: string
          created_at: string
          credential_secret_name: string
          enabled: boolean
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          owner_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          auth_type?: string
          base_url: string
          created_at?: string
          credential_secret_name: string
          enabled?: boolean
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          owner_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          auth_type?: string
          base_url?: string
          created_at?: string
          credential_secret_name?: string
          enabled?: boolean
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          owner_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_approvals: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          invite_code: string | null
          owner_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          invite_code?: string | null
          owner_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          invite_code?: string | null
          owner_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
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
      user_goal_prefs: {
        Row: {
          created_at: string
          id: string
          order_list: string[]
          selected: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_list?: string[]
          selected?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_list?: string[]
          selected?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_telegram_bots: {
        Row: {
          active: boolean
          bot_id: number | null
          bot_username: string | null
          created_at: string
          description: string | null
          id: string
          last_polled_at: string | null
          last_validated_at: string | null
          name: string
          owner_id: string
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
          description?: string | null
          id?: string
          last_polled_at?: string | null
          last_validated_at?: string | null
          name: string
          owner_id: string
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
          description?: string | null
          id?: string
          last_polled_at?: string | null
          last_validated_at?: string | null
          name?: string
          owner_id?: string
          purpose?: string
          token?: string
          update_offset?: number
          updated_at?: string
          validation_status?: string | null
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
          tracker_device_id: string | null
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
          tracker_device_id?: string | null
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
          tracker_device_id?: string | null
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
      whatsapp_assistant_authorized: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string | null
          owner_id: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          owner_id: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          owner_id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_assistant_log: {
        Row: {
          created_at: string
          direction: string
          id: string
          message: string
          metadata: Json
          owner_id: string
          phone: string
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          message: string
          metadata?: Json
          owner_id: string
          phone: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          message?: string
          metadata?: Json
          owner_id?: string
          phone?: string
        }
        Relationships: []
      }
      whatsapp_billing_log: {
        Row: {
          client_id: string | null
          created_at: string
          error_message: string | null
          id: string
          installment_number: number
          loan_id: string
          message: string
          owner_id: string
          phone: string
          sent_date: string
          status_when_sent: string
          success: boolean
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          installment_number?: number
          loan_id: string
          message: string
          owner_id: string
          phone: string
          sent_date: string
          status_when_sent: string
          success?: boolean
        }
        Update: {
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          installment_number?: number
          loan_id?: string
          message?: string
          owner_id?: string
          phone?: string
          sent_date?: string
          status_when_sent?: string
          success?: boolean
        }
        Relationships: []
      }
      whatsapp_billing_messages: {
        Row: {
          created_at: string
          id: string
          message_due_today: string
          message_manager_weekly: string | null
          message_overdue: string
          message_upcoming: string
          message_very_overdue: string | null
          owner_id: string
          pix_link: string | null
          updated_at: string
          very_overdue_days: number
        }
        Insert: {
          created_at?: string
          id?: string
          message_due_today?: string
          message_manager_weekly?: string | null
          message_overdue?: string
          message_upcoming?: string
          message_very_overdue?: string | null
          owner_id: string
          pix_link?: string | null
          updated_at?: string
          very_overdue_days?: number
        }
        Update: {
          created_at?: string
          id?: string
          message_due_today?: string
          message_manager_weekly?: string | null
          message_overdue?: string
          message_upcoming?: string
          message_very_overdue?: string | null
          owner_id?: string
          pix_link?: string | null
          updated_at?: string
          very_overdue_days?: number
        }
        Relationships: []
      }
      whatsapp_billing_schedule: {
        Row: {
          base_url: string
          created_at: string
          days_before_due: number
          enabled: boolean
          id: string
          instance_id: string
          last_run_at: string | null
          manager_last_run_at: string | null
          manager_summary_day_of_week: number
          manager_summary_enabled: boolean
          manager_summary_time: string
          overdue_repeat_days: number
          owner_id: string
          provider: string
          send_on_due_day: boolean
          send_time: string
          send_when_overdue: boolean
          updated_at: string
        }
        Insert: {
          base_url?: string
          created_at?: string
          days_before_due?: number
          enabled?: boolean
          id?: string
          instance_id?: string
          last_run_at?: string | null
          manager_last_run_at?: string | null
          manager_summary_day_of_week?: number
          manager_summary_enabled?: boolean
          manager_summary_time?: string
          overdue_repeat_days?: number
          owner_id: string
          provider?: string
          send_on_due_day?: boolean
          send_time?: string
          send_when_overdue?: boolean
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          days_before_due?: number
          enabled?: boolean
          id?: string
          instance_id?: string
          last_run_at?: string | null
          manager_last_run_at?: string | null
          manager_summary_day_of_week?: number
          manager_summary_enabled?: boolean
          manager_summary_time?: string
          overdue_repeat_days?: number
          owner_id?: string
          provider?: string
          send_on_due_day?: boolean
          send_time?: string
          send_when_overdue?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_manager_billing_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          loans_count: number
          manager_user_id: string | null
          message: string
          owner_id: string
          phone: string
          sent_date: string
          success: boolean
          total_amount: number
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          loans_count?: number
          manager_user_id?: string | null
          message: string
          owner_id: string
          phone: string
          sent_date?: string
          success?: boolean
          total_amount?: number
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          loans_count?: number
          manager_user_id?: string | null
          message?: string
          owner_id?: string
          phone?: string
          sent_date?: string
          success?: boolean
          total_amount?: number
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
      is_user_pending: { Args: { _user_id: string }; Returns: boolean }
      list_my_sessions: {
        Args: never
        Returns: {
          created_at: string
          id: string
          ip: string
          not_after: string
          updated_at: string
          user_agent: string
        }[]
      }
      revoke_my_session: { Args: { _session_id: string }; Returns: boolean }
      seed_default_payment_methods: {
        Args: { _owner_id: string }
        Returns: undefined
      }
      upsert_active_capital_snapshot: {
        Args: {
          _amount: number
          _finalize?: boolean
          _month: string
          _owner_id: string
          _snapshot_date?: string
        }
        Returns: {
          amount: number
          created_at: string
          finalized: boolean
          id: string
          last_calculated_at: string
          month: string
          owner_id: string
          snapshot_date: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "active_capital_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_invite_code: {
        Args: { _code: string }
        Returns: {
          owner_id: string
          reason: string
          require_approval: boolean
          valid: boolean
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "operador" | "visualizador" | "gerente"
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
      app_role: ["admin", "operador", "visualizador", "gerente"],
    },
  },
} as const
