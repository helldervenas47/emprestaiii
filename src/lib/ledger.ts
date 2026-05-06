import { supabase } from "@/integrations/supabase/client";
import { adjustBalance } from "@/lib/balance";
import { todayInAppTz } from "@/lib/timezone";

export type LedgerDirection = "in" | "out";
export type LedgerCategory =
  | "loan"
  | "payment"
  | "expense"
  | "adjustment"
  | "aporte"
  | "sale"
  | "initial"
  | "other";

export interface LedgerEntry {
  id: string;
  user_id: string;
  direction: LedgerDirection;
  category: LedgerCategory;
  amount: number;
  occurred_on: string; // YYYY-MM-DD
  description: string;
  loan_id: string | null;
  expense_id: string | null;
  payment_id: string | null;
  source: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RecordLedgerInput {
  direction: LedgerDirection;
  category: LedgerCategory;
  amount: number;
  description: string;
  occurred_on?: string;
  loan_id?: string | null;
  expense_id?: string | null;
  payment_id?: string | null;
  source?: string;
  metadata?: Record<string, any>;
  /** Atualiza também a tabela balance (default true) */
  syncBalance?: boolean;
}

async function getOwnerId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_owner" as any)
    .select("owner_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as any)?.owner_id || user.id;
}

/**
 * Registra um lançamento no extrato unificado.
 * Por padrão também ajusta a tabela `balance` para manter compatibilidade
 * com o código existente que lê o saldo de lá.
 */
export async function recordLedger(input: RecordLedgerInput): Promise<void> {
  // Permite amount=0 apenas para lançamentos de auditoria (source=loan_edit_audit)
  const isAudit = input.source === "loan_edit_audit";
  if (!isAudit && (!input.amount || input.amount <= 0)) return;
  if (isAudit && (input.amount ?? 0) < 0) return;
  const ownerId = await getOwnerId();
  if (!ownerId) return;

  let occurred = input.occurred_on || todayInAppTz();
  const syncBalance = input.syncBalance !== false;

  // Garantia de consistência: quando o lançamento é vinculado a um pagamento,
  // a data do extrato (occurred_on) deve refletir a data real do pagamento
  // informada pelo usuário — evita divergências causadas por fuso horário.
  if (input.payment_id) {
    try {
      const { data: pay } = await supabase
        .from("payments")
        .select("date")
        .eq("id", input.payment_id)
        .maybeSingle();
      const realDate = (pay as any)?.date as string | undefined;
      if (realDate && realDate !== occurred) occurred = realDate;
    } catch { /* noop */ }
  }

  // Try-by-reference: avoid duplicates when the unique partial indexes apply
  await supabase.from("account_ledger").insert({
    user_id: ownerId,
    direction: input.direction,
    category: input.category,
    amount: Number(input.amount.toFixed(2)),
    occurred_on: occurred,
    description: input.description,
    loan_id: input.loan_id ?? null,
    expense_id: input.expense_id ?? null,
    payment_id: input.payment_id ?? null,
    source: input.source ?? "auto",
    metadata: input.metadata ?? {},
  } as any);

  if (syncBalance) {
    const delta = input.direction === "in" ? input.amount : -input.amount;
    await adjustBalance(delta);
  }
}

/**
 * Remove um lançamento por referência (ex: ao excluir um pagamento).
 * Também desfaz o efeito no saldo se solicitado.
 */
export async function removeLedgerByRef(
  ref: { loan_id?: string; expense_id?: string; payment_id?: string; category?: LedgerCategory },
  options: { syncBalance?: boolean } = {},
): Promise<void> {
  const ownerId = await getOwnerId();
  if (!ownerId) return;

  let query = supabase.from("account_ledger").select("id, direction, amount").eq("user_id", ownerId);
  if (ref.payment_id) query = query.eq("payment_id", ref.payment_id);
  else if (ref.expense_id) query = query.eq("expense_id", ref.expense_id);
  else if (ref.loan_id) query = query.eq("loan_id", ref.loan_id);
  if (ref.category) query = query.eq("category", ref.category);

  const { data } = await query;
  if (!data || data.length === 0) return;

  const ids = data.map((r: any) => r.id);
  await supabase.from("account_ledger").delete().in("id", ids);

  if (options.syncBalance !== false) {
    const totalDelta = data.reduce(
      (acc: number, r: any) => acc + (r.direction === "in" ? -Number(r.amount) : Number(r.amount)),
      0,
    );
    if (totalDelta !== 0) await adjustBalance(totalDelta);
  }
}

/** Recalcula o saldo a partir do ledger e grava em `balance`. */
export async function recomputeBalanceFromLedger(): Promise<number> {
  const ownerId = await getOwnerId();
  if (!ownerId) return 0;

  const { data } = await supabase
    .from("account_ledger")
    .select("direction, amount")
    .eq("user_id", ownerId);

  const total = (data || []).reduce(
    (acc: number, r: any) => acc + (r.direction === "in" ? Number(r.amount) : -Number(r.amount)),
    0,
  );

  const { setBalance } = await import("@/lib/balance");
  await setBalance(Number(total.toFixed(2)));
  return total;
}

export async function listLedger(): Promise<LedgerEntry[]> {
  const ownerId = await getOwnerId();
  if (!ownerId) return [];
  const { data } = await supabase
    .from("account_ledger")
    .select("*")
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .order("occurred_on", { ascending: false })
    .limit(1000);
  return (data || []) as LedgerEntry[];
}

export interface UpdateLedgerInput {
  direction?: LedgerDirection;
  category?: LedgerCategory;
  amount?: number;
  description?: string;
  occurred_on?: string;
}

/**
 * Atualiza um lançamento existente e ajusta o saldo conforme a diferença
 * entre o efeito anterior (direction/amount) e o novo.
 */
export async function updateLedgerEntry(id: string, input: UpdateLedgerInput): Promise<void> {
  const ownerId = await getOwnerId();
  if (!ownerId) return;

  const { data: prev } = await supabase
    .from("account_ledger")
    .select("direction, amount")
    .eq("id", id)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!prev) return;

  const patch: Record<string, any> = {};
  if (input.direction !== undefined) patch.direction = input.direction;
  if (input.category !== undefined) patch.category = input.category;
  if (input.amount !== undefined) patch.amount = Number(input.amount.toFixed(2));
  if (input.description !== undefined) patch.description = input.description;
  if (input.occurred_on !== undefined) patch.occurred_on = input.occurred_on;

  await supabase.from("account_ledger").update(patch as any).eq("id", id).eq("user_id", ownerId);

  const newDirection = (input.direction ?? (prev as any).direction) as LedgerDirection;
  const newAmount = input.amount !== undefined ? Number(input.amount) : Number((prev as any).amount);
  const prevEffect = (prev as any).direction === "in" ? Number((prev as any).amount) : -Number((prev as any).amount);
  const newEffect = newDirection === "in" ? newAmount : -newAmount;
  const delta = newEffect - prevEffect;
  if (delta !== 0) await adjustBalance(delta);
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  const ownerId = await getOwnerId();
  if (!ownerId) return;
  // Recupera para reverter saldo
  const { data } = await supabase
    .from("account_ledger")
    .select("direction, amount")
    .eq("id", id)
    .maybeSingle();
  await supabase.from("account_ledger").delete().eq("id", id).eq("user_id", ownerId);
  if (data) {
    const delta = (data as any).direction === "in" ? -Number((data as any).amount) : Number((data as any).amount);
    if (delta !== 0) await adjustBalance(delta);
  }
}
