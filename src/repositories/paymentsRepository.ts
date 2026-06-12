/**
 * Repository de pagamentos de empréstimos.
 * Mesmo padrão de loansRepository — única superfície para a tabela `payments`.
 */
import { supabase } from "@/integrations/supabase/userClient";

export type PaymentRow = Record<string, any>;

export interface PaymentListOptions {
  limit?: number;
  loanId?: string;
}

const DEFAULT_LIST_LIMIT = 5000;

export const paymentsRepository = {
  async list(opts: PaymentListOptions = {}): Promise<PaymentRow[]> {
    let q = supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? DEFAULT_LIST_LIMIT);
    if (opts.loanId) q = q.eq("loan_id", opts.loanId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PaymentRow[];
  },

  async insert(payload: Record<string, any>): Promise<PaymentRow> {
    const { data, error } = await (supabase.from("payments") as any)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as PaymentRow;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) throw error;
  },

  async removeByLoan(loanId: string): Promise<void> {
    const { error } = await supabase.from("payments").delete().eq("loan_id", loanId);
    if (error) throw error;
  },
};
