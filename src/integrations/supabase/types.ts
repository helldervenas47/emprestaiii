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
          owner_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_backup_enabled?: boolean | null
          id?: string
          last_auto_backup_at?: string | null
          last_auto_backup_drive_url?: string | null
          owner_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_backup_enabled?: boolean | null
          id?: string
          last_auto_backup_at?: string | null
          last_auto_backup_drive_url?: string | null
          owner_id?: string | null
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
          error: string | null
          filename: string | null
          id: string
          size_bytes: number | null
          status: string | null
          triggered_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          drive_url?: string | null
          error?: string | null
          filename?: string | null
          id?: string
          size_bytes?: number | null
          status?: string | null
          triggered_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          drive_url?: string | null
          error?: string | null
          filename?: string | null
          id?: string
          size_bytes?: number | null
          status?: string | null
          triggered_by?: string | null
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
      balance_adjustments: {
        Row: {
          adjusted_by: string | null
          adjustment_date: string
          amount: number
          created_at: string
          id: string
          notes: string | null
          owner_id: string | null
          previous_amount: number | null
          user_id: string
        }
        Insert: {
          adjusted_by?: string | null
          adjustment_date?: string
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string | null
          previous_amount?: number | null
          user_id: string
        }
        Update: {
          adjusted_by?: string | null
          adjustment_date?: string
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string | null
          previous_amount?: number | null
          user_id?: string
        }
        Relationships: []
      }
      boleto_lookups: {
        Row: {
          amount: number | null
          bank_code: string | null
          bank_name: string | null
          barcode: string | null
          beneficiary: string | null
          created_at: string
          digitable_line: string | null
          digits: string | null
          due_date: string | null
          id: string
          kind: string | null
          label: string | null
          notes: string | null
          owner_id: string | null
          parsed_at: string | null
          payer: string | null
          pix_brcode: string | null
          segment: string | null
          segment_label: string | null
          status: string | null
          type: string | null
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          amount?: number | null
          bank_code?: string | null
          bank_name?: string | null
          barcode?: string | null
          beneficiary?: string | null
          created_at?: string
          digitable_line?: string | null
          digits?: string | null
          due_date?: string | null
          id?: string
          kind?: string | null
          label?: string | null
          notes?: string | null
          owner_id?: string | null
          parsed_at?: string | null
          payer?: string | null
          pix_brcode?: string | null
          segment?: string | null
          segment_label?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          amount?: number | null
          bank_code?: string | null
          bank_name?: string | null
          barcode?: string | null
          beneficiary?: string | null
          created_at?: string
          digitable_line?: string | null
          digits?: string | null
          due_date?: string | null
          id?: string
          kind?: string | null
          label?: string | null
          notes?: string | null
          owner_id?: string | null
          parsed_at?: string | null
          payer?: string | null
          pix_brcode?: string | null
          segment?: string | null
          segment_label?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: []
      }
      chart_overrides: {
        Row: {
          created_at: string
          emprestado: number | null
          id: string
          juros: number | null
          juros_manual: boolean | null
          month_label: string
          recebido: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          emprestado?: number | null
          id?: string
          juros?: number | null
          juros_manual?: boolean | null
          month_label: string
          recebido?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          emprestado?: number | null
          id?: string
          juros?: number | null
          juros_manual?: boolean | null
          month_label?: string
          recebido?: number | null
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
      credit_card_invoice_openings: {
        Row: {
          card_id: string | null
          created_at: string
          credit_card_id: string
          cycle_key: string | null
          id: string
          month_label: string
          notes: string | null
          opening_amount: number | null
          opening_balance: number
          status: string | null
          user_id: string
        }
        Insert: {
          card_id?: string | null
          created_at?: string
          credit_card_id: string
          cycle_key?: string | null
          id?: string
          month_label: string
          notes?: string | null
          opening_amount?: number | null
          opening_balance?: number
          status?: string | null
          user_id: string
        }
        Update: {
          card_id?: string | null
          created_at?: string
          credit_card_id?: string
          cycle_key?: string | null
          id?: string
          month_label?: string
          notes?: string | null
          opening_amount?: number | null
          opening_balance?: number
          status?: string | null
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
          {
            foreignKeyName: "credit_card_invoice_openings_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_card_invoices: {
        Row: {
          created_at: string
          credit_card_id: string
          due_date: string | null
          id: string
          month_label: string
          paid_amount: number | null
          status: string | null
          total_amount: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          credit_card_id: string
          due_date?: string | null
          id?: string
          month_label: string
          paid_amount?: number | null
          status?: string | null
          total_amount?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          credit_card_id?: string
          due_date?: string | null
          id?: string
          month_label?: string
          paid_amount?: number | null
          status?: string | null
          total_amount?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_invoices_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          active: boolean | null
          available_limit: number
          bank: string | null
          brand: string | null
          closing_day: number
          created_at: string
          credit_limit: number
          current_invoice_amount: number
          due_day: number
          id: string
          last_digits: string | null
          last_four: string | null
          name: string
          nickname: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          available_limit?: number
          bank?: string | null
          brand?: string | null
          closing_day: number
          created_at?: string
          credit_limit?: number
          current_invoice_amount?: number
          due_day: number
          id?: string
          last_digits?: string | null
          last_four?: string | null
          name?: string
          nickname?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          available_limit?: number
          bank?: string | null
          brand?: string | null
          closing_day?: number
          created_at?: string
          credit_limit?: number
          current_invoice_amount?: number
          due_day?: number
          id?: string
          last_digits?: string | null
          last_four?: string | null
          name?: string
          nickname?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_limit_history: {
        Row: {
          change_type: string | null
          changed_by: string | null
          client_id: string
          created_at: string
          id: string
          metadata: Json | null
          new_limit: number | null
          notes: string | null
          old_limit: number | null
          previous_limit: number | null
          reason: string | null
          user_id: string
        }
        Insert: {
          change_type?: string | null
          changed_by?: string | null
          client_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_limit?: number | null
          notes?: string | null
          old_limit?: number | null
          previous_limit?: number | null
          reason?: string | null
          user_id: string
        }
        Update: {
          change_type?: string | null
          changed_by?: string | null
          client_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_limit?: number | null
          notes?: string | null
          old_limit?: number | null
          previous_limit?: number | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_limit_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_limits: {
        Row: {
          client_id: string
          created_at: string
          current_limit: number
          id: string
          last_auto_calculated_at: string | null
          mode: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          current_limit?: number
          id?: string
          last_auto_calculated_at?: string | null
          mode?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          current_limit?: number
          id?: string
          last_auto_calculated_at?: string | null
          mode?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_limits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          due_date: string
          generate_income_on_pay: boolean | null
          generated_income_id: string | null
          id: string
          installments: number | null
          notes: string | null
          paid: boolean
          paid_date: string | null
          paid_installments: number | null
          parent_expense_id: string | null
          payment_method_id: string | null
          scope: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description: string
          due_date: string
          generate_income_on_pay?: boolean | null
          generated_income_id?: string | null
          id?: string
          installments?: number | null
          notes?: string | null
          paid?: boolean
          paid_date?: string | null
          paid_installments?: number | null
          parent_expense_id?: string | null
          payment_method_id?: string | null
          scope?: string | null
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          due_date?: string
          generate_income_on_pay?: boolean | null
          generated_income_id?: string | null
          id?: string
          installments?: number | null
          notes?: string | null
          paid?: boolean
          paid_date?: string | null
          paid_installments?: number | null
          parent_expense_id?: string | null
          payment_method_id?: string | null
          scope?: string | null
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
          paid: boolean | null
          paid_at: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          loan_id: string
          paid?: boolean | null
          paid_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          loan_id?: string
          paid?: boolean | null
          paid_at?: string | null
          user_id?: string | null
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
          due_date: string
          id: string
          installments: number
          interest_rate: number
          interest_type: string
          notes: string | null
          paid_installments: number
          payment_type: string
          remaining_amount: number | null
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
          due_date: string
          id?: string
          installments?: number
          interest_rate?: number
          interest_type?: string
          notes?: string | null
          paid_installments?: number
          payment_type?: string
          remaining_amount?: number | null
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
          due_date?: string
          id?: string
          installments?: number
          interest_rate?: number
          interest_type?: string
          notes?: string | null
          paid_installments?: number
          payment_type?: string
          remaining_amount?: number | null
          start_date?: string
          status?: string
          tags?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      locador_info: {
        Row: {
          bairro: string | null
          cidade: string | null
          cpf: string | null
          created_at: string
          endereco: string | null
          estado: string | null
          id: string
          nacionalidade: string | null
          nome: string | null
          profissao: string | null
          rg: string | null
          user_id: string
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          endereco?: string | null
          estado?: string | null
          id?: string
          nacionalidade?: string | null
          nome?: string | null
          profissao?: string | null
          rg?: string | null
          user_id: string
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          endereco?: string | null
          estado?: string | null
          id?: string
          nacionalidade?: string | null
          nome?: string | null
          profissao?: string | null
          rg?: string | null
          user_id?: string
        }
        Relationships: []
      }
      manager_commissions: {
        Row: {
          amount: number
          base_amount: number | null
          commission_type: string | null
          created_at: string
          generated_at: string | null
          id: string
          loan_id: string
          manager_id: string | null
          payment_id: string | null
          rate: number | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          base_amount?: number | null
          commission_type?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          loan_id: string
          manager_id?: string | null
          payment_id?: string | null
          rate?: number | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          base_amount?: number | null
          commission_type?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          loan_id?: string
          manager_id?: string | null
          payment_id?: string | null
          rate?: number | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_commissions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_goal_snapshots: {
        Row: {
          attainment_pct: number | null
          category: string | null
          created_at: string
          current_value: number | null
          finalized: boolean | null
          goal_type: string | null
          id: string
          month: string
          owner_id: string | null
          reached: boolean | null
          realized_value: number | null
          snapshot_date: string | null
          target_value: number | null
          user_id: string
        }
        Insert: {
          attainment_pct?: number | null
          category?: string | null
          created_at?: string
          current_value?: number | null
          finalized?: boolean | null
          goal_type?: string | null
          id?: string
          month: string
          owner_id?: string | null
          reached?: boolean | null
          realized_value?: number | null
          snapshot_date?: string | null
          target_value?: number | null
          user_id: string
        }
        Update: {
          attainment_pct?: number | null
          category?: string | null
          created_at?: string
          current_value?: number | null
          finalized?: boolean | null
          goal_type?: string | null
          id?: string
          month?: string
          owner_id?: string | null
          reached?: boolean | null
          realized_value?: number | null
          snapshot_date?: string | null
          target_value?: number | null
          user_id?: string
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
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_type: string
          id?: string
          month: string
          notes?: string | null
          target_value?: number
          user_id: string
        }
        Update: {
          created_at?: string
          goal_type?: string
          id?: string
          month?: string
          notes?: string | null
          target_value?: number
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
          owner_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          month: string
          owner_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          month?: string
          owner_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      my_boleto_payments: {
        Row: {
          amount: number | null
          boleto_id: string | null
          created_at: string
          id: string
          notes: string | null
          owner_id: string | null
          paid_at: string | null
          payment_date: string | null
          payment_method: string | null
          status: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          amount?: number | null
          boleto_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string | null
          paid_at?: string | null
          payment_date?: string | null
          payment_method?: string | null
          status?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          amount?: number | null
          boleto_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string | null
          paid_at?: string | null
          payment_date?: string | null
          payment_method?: string | null
          status?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "my_boleto_payments_boleto_id_fkey"
            columns: ["boleto_id"]
            isOneToOne: false
            referencedRelation: "my_boletos"
            referencedColumns: ["id"]
          },
        ]
      }
      my_boletos: {
        Row: {
          amount: number | null
          barcode: string | null
          created_at: string
          description: string | null
          due_date: string | null
          expense_id: string | null
          external_id: string | null
          id: string
          owner_id: string | null
          paid_at: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          barcode?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          expense_id?: string | null
          external_id?: string | null
          id?: string
          owner_id?: string | null
          paid_at?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          barcode?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          expense_id?: string | null
          external_id?: string | null
          id?: string
          owner_id?: string | null
          paid_at?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "my_boletos_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
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
      personal_budgets: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          month: string
          user_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          id?: string
          month: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          month?: string
          user_id?: string
        }
        Relationships: []
      }
      personal_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
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
      products: {
        Row: {
          active: boolean | null
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
          active?: boolean | null
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
          active?: boolean | null
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
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: string | null
          notes: string | null
          owner_id: string
          product_id: string
          product_name: string | null
          quantity: number
          sale_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type?: string | null
          notes?: string | null
          owner_id: string
          product_id: string
          product_name?: string | null
          quantity: number
          sale_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string | null
          notes?: string | null
          owner_id?: string
          product_id?: string
          product_name?: string | null
          quantity?: number
          sale_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
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
          cancel_at_period_end?: boolean | null
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
          cancel_at_period_end?: boolean | null
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
      telegram_image_delivery_prefs: {
        Row: {
          allowed_user_ids: string[] | null
          id: string
          include_text: boolean | null
          reports: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_user_ids?: string[] | null
          id?: string
          include_text?: boolean | null
          reports?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_user_ids?: string[] | null
          id?: string
          include_text?: boolean | null
          reports?: Json | null
          updated_at?: string
          user_id?: string
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
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          is_current_session: boolean | null
          last_active_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          is_current_session?: boolean | null
          last_active_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          is_current_session?: boolean | null
          last_active_at?: string | null
          user_agent?: string | null
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
      vehicle_balance: {
        Row: {
          amount: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_settings: {
        Row: {
          enabled: boolean | null
          id: string
          send_time: string | null
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          enabled?: boolean | null
          id?: string
          send_time?: string | null
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          enabled?: boolean | null
          id?: string
          send_time?: string | null
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_data_owner_id: { Args: { _user_id: string }; Returns: string }
      list_my_sessions: {
        Args: never
        Returns: {
          id: string
          ip_address: string
          is_current_session: boolean
          last_active_at: string
          user_agent: string
          user_id: string
        }[]
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
