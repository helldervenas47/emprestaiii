import { useMemo, useState, useEffect } from "react";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Pencil,
  Trash2,
  AlertTriangle,
  Wifi,
  CalendarDays,
  CalendarClock,
  Sparkles,
  CheckCircle2,
  Clock,
  CreditCard as CreditCardIcon,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CreditCard } from "@/hooks/useCreditCards";
import { useExpenses } from "@/hooks/useExpenses";
import { useCreditCardOpenings, cycleKeyFromDate } from "@/hooks/useCreditCardOpenings";
import { useHideValues } from "@/contexts/HideValuesContext";
import { getBank, brandLabel } from "@/lib/creditCardBanks";
import { CreditCardOpeningDialog } from "./CreditCardOpeningDialog";
import { ExpenseEditDialog } from "./ExpenseEditDialog";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { Expense } from "@/types/loan";
import { toast } from "sonner";

interface Props {
  card: CreditCard;
  onClose: () => void;
  /** YYYY-MM — when provided, the initial cycle is the one whose due date falls in this month. */
  referenceMonth?: string;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Calculates the closing/due dates of the billing cycle that contains `ref`.
 */
function getCycle(ref: Date, closingDay: number, dueDay: number) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  const closingThis = new Date(y, m, Math.min(closingDay, new Date(y, m + 1, 0).getDate()));
  const closingNext =
    day > closingDay
      ? new Date(y, m + 1, Math.min(closingDay, new Date(y, m + 2, 0).getDate()))
      : closingThis;
  const closingPrev =
    day > closingDay
      ? closingThis
      : new Date(y, m - 1, Math.min(closingDay, new Date(y, m, 0).getDate()));
  const dueMonth = dueDay > closingDay ? closingNext.getMonth() : closingNext.getMonth() + 1;
  const dueYear = closingNext.getFullYear();
  const dueDate = new Date(
    dueYear,
    dueMonth,
    Math.min(dueDay, new Date(dueYear, dueMonth + 1, 0).getDate())
  );
  return { from: closingPrev, to: closingNext, dueDate };
}

export function CreditCardInvoice({ card, onClose, referenceMonth }: Props) {
  const { expenses, updateExpense, deleteExpense } = useExpenses();
  const { getOpening, upsertOpening } = useCreditCardOpenings();
  const { mask } = useHideValues();
  const bank = getBank(card.bank);

  const initialOffset = useMemo(() => {
    if (!referenceMonth) return 0;
    const [ty, tm] = referenceMonth.split("-").map(Number);
    if (!ty || !tm) return 0;
    for (let off = -24; off <= 24; off++) {
      const d = new Date();
      d.setMonth(d.getMonth() + off);
      const c = getCycle(d, card.closingDay, card.dueDay);
      if (c.dueDate.getFullYear() === ty && c.dueDate.getMonth() + 1 === tm) {
        return off;
      }
    }
    return 0;
  }, [referenceMonth, card.closingDay, card.dueDay]);

  const [cycleOffset, setCycleOffset] = useState(initialOffset);
  const [editingOpening, setEditingOpening] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payDate, setPayDate] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setCycleOffset(initialOffset);
  }, [initialOffset]);

  const ref = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + cycleOffset);
    return d;
  }, [cycleOffset]);

  const cycle = useMemo(
    () => getCycle(ref, card.closingDay, card.dueDay),
    [ref, card.closingDay, card.dueDay]
  );

  const cycleKey = useMemo(() => cycleKeyFromDate(cycle.to), [cycle.to]);
  const opening = getOpening(card.id, cycleKey);
  const openingAmount = opening?.openingAmount ?? 0;

  // Previous cycle for comparison
  const prevCycle = useMemo(() => {
    const d = new Date(ref);
    d.setMonth(d.getMonth() - 1);
    return getCycle(d, card.closingDay, card.dueDay);
  }, [ref, card.closingDay, card.dueDay]);
  const prevCycleKey = useMemo(() => cycleKeyFromDate(prevCycle.to), [prevCycle.to]);
  const prevOpening = getOpening(card.id, prevCycleKey);

  const cardTag = (card.nickname || card.lastFour || "").toLowerCase();

  const filterCardExpenses = (from: Date, to: Date) =>
    expenses
      .filter((e) => e.scope === "personal")
      .filter((e) => /\[\s*cr[eé]dito\s*\]/i.test(e.notes ?? ""))
      .filter((e) => {
        if (!cardTag) return true;
        const n = (e.notes ?? "").toLowerCase();
        if (n.includes(cardTag)) return true;
        return !/cart[aã]o[:\s]/i.test(n);
      })
      .filter((e) => {
        const d = new Date(e.dueDate + "T00:00:00");
        return d > from && d <= to;
      });

  const items = useMemo(
    () => filterCardExpenses(cycle.from, cycle.to).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [expenses, cycle, cardTag]
  );

  const prevItems = useMemo(
    () => filterCardExpenses(prevCycle.from, prevCycle.to),
    [expenses, prevCycle, cardTag]
  );

  const sumItems = (list: typeof items) =>
    list.reduce((s, e) => {
      const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
      return s + (isRec ? e.amount / e.installments! : e.amount);
    }, 0);

  const transactionsTotal = sumItems(items);
  const total = transactionsTotal + openingAmount;
  const prevTotal = sumItems(prevItems) + (prevOpening?.openingAmount ?? 0);

  const utilization = card.creditLimit > 0 ? (total / card.creditLimit) * 100 : 0;
  const available = Math.max(0, card.creditLimit - total);

  // "Melhor dia de compra" = dia seguinte ao fechamento
  const bestPurchaseDay = ((card.closingDay % 31) + 1);

  // Status da fatura
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isClosed = today > cycle.to;
  const isOverdue = isClosed && today > cycle.dueDate && total > 0;
  const daysToDue = Math.ceil((cycle.dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const status: { label: string; tone: string; icon: typeof Clock } = isOverdue
    ? { label: "Em atraso", tone: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertTriangle }
    : isClosed
    ? { label: "Fechada — aguardando pagamento", tone: "bg-warning/15 text-warning border-warning/30", icon: Clock }
    : total === 0
    ? { label: "Sem lançamentos", tone: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 }
    : { label: "Em aberto", tone: "bg-primary/15 text-primary border-primary/30", icon: Sparkles };

  const StatusIcon = status.icon;

  return (
    <div
      className="fixed inset-0 bg-background sm:bg-foreground/50 sm:backdrop-blur-md z-[60] flex items-stretch sm:items-center justify-center p-0 sm:p-4 animate-fade-in overscroll-contain"
      onClick={(e) => {
        // Only close on backdrop click on desktop (mobile is fullscreen, no backdrop)
        if (window.innerWidth >= 640) onClose();
      }}
    >
      <Card
        no3d
        className="w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto rounded-none sm:rounded-2xl border-0 sm:border animate-scale-in p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HERO — Cartão visual estilo app real */}
        <div className={`${bank.gradient} ${bank.textClass} relative overflow-hidden`}>
          {/* glows */}
          <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-black/25 blur-3xl" />

          {/* Top bar: bank + close */}
          <div className="relative flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="h-5 w-5 opacity-95" />
              <div>
                <p className="text-[11px] opacity-80 leading-none">Fatura</p>
                <p className="font-bold text-base leading-tight">{bank.name}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className={`${bank.textClass} hover:bg-white/15`}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Card meta */}
          <div className="relative px-5 mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-9 rounded-md bg-gradient-to-br from-[hsl(45,90%,75%)] to-[hsl(40,80%,50%)] shadow-inner border border-[hsl(45,90%,80%)]/40" />
              <Wifi className="h-3.5 w-3.5 rotate-90 opacity-80" />
            </div>
            <div className="text-right">
              <p className="font-mono text-xs opacity-95 tracking-[0.2em]">
                •••• {card.lastFour || "0000"}
              </p>
              <p className="text-[10px] italic font-bold tracking-wider opacity-90">
                {brandLabel(card.brand)}
              </p>
            </div>
          </div>

          {/* Cycle nav */}
          <div className="relative flex items-center justify-between gap-2 px-3 mt-4">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${bank.textClass} hover:bg-white/15`}
              onClick={() => setCycleOffset((o) => o - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider opacity-75">Vencimento</p>
              <p className="text-sm font-semibold capitalize">
                {format(cycle.dueDate, "MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${bank.textClass} hover:bg-white/15`}
              onClick={() => setCycleOffset((o) => o + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Total */}
          <div className="relative px-5 pt-4 pb-5 text-center">
            <p className="text-[11px] uppercase tracking-wider opacity-75">Valor total da fatura</p>
            <p className="text-4xl font-bold mt-1 tracking-tight">{mask(fmt(total))}</p>

            {/* Status pill */}
            <div className="mt-3 flex justify-center">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${status.tone}`}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
                {!isOverdue && !isClosed && daysToDue >= 0 && total > 0 && (
                  <span className="opacity-80">· vence em {daysToDue}d</span>
                )}
              </span>
            </div>

            {/* Limite progress */}
            {card.creditLimit > 0 && (
              <div className="mt-4 mx-auto max-w-sm">
                <div className="flex items-center justify-between text-[11px] opacity-90 mb-1.5">
                  <span>Limite disponível</span>
                  <span className="font-semibold">{mask(fmt(available))}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-white/90 rounded-full transition-all"
                    style={{ width: `${Math.min(100, utilization)}%` }}
                  />
                </div>
                <p className="text-[10px] opacity-75 mt-1">
                  {utilization.toFixed(0)}% de {mask(fmt(card.creditLimit))} utilizado
                </p>
              </div>
            )}
          </div>
        </div>

        <CardContent className="space-y-4 pt-5 px-4 sm:px-6 pb-6">
          {/* Quick stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-card p-3 text-center">
              <CalendarDays className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fechamento</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {format(cycle.to, "dd/MM", { locale: ptBR })}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <CalendarClock className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vencimento</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {format(cycle.dueDate, "dd/MM", { locale: ptBR })}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <Sparkles className="h-4 w-4 mx-auto text-success mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Melhor compra</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">dia {bestPurchaseDay}</p>
            </div>
          </div>

          {/* Pagar fatura */}
          {(items.some((e) => !e.paid) || (opening && openingAmount > 0)) && (
            <Button
              onClick={() => setPayDialogOpen(true)}
              className="w-full h-11 text-sm font-semibold shadow-md"
              size="lg"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Pagar fatura · {mask(fmt(total))}
            </Button>
          )}
          {prevTotal > 0 && (
            <div className="rounded-xl border bg-muted/30 px-3 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">Fatura anterior</p>
                <p className="text-sm font-medium text-foreground">{mask(fmt(prevTotal))}</p>
              </div>
              {(() => {
                const diff = total - prevTotal;
                const pct = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;
                const up = diff > 0;
                return (
                  <Badge
                    variant="secondary"
                    className={up ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}
                  >
                    {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
                  </Badge>
                );
              })()}
            </div>
          )}

          {cycleOffset !== 0 && (
            <div className="flex items-center gap-2 text-[11px] rounded-md bg-warning/10 border border-warning/30 text-warning-foreground px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {cycleOffset < 0
                ? "Você está vendo uma fatura passada. Edições afetam o histórico."
                : "Você está vendo uma fatura futura. Confira os valores antes de salvar."}
            </div>
          )}

          {/* Opening (saldo inicial) */}
          {opening ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-sm font-medium text-foreground truncate">
                    Saldo inicial da fatura
                  </p>
                </div>
                {opening.notes && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {opening.notes}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <p className="text-sm font-semibold text-foreground">{mask(fmt(openingAmount))}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditingOpening(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setEditingOpening(true)}
            >
              <Receipt className="h-4 w-4 mr-1.5" />
              Adicionar fatura do mês (saldo inicial)
            </Button>
          )}

          {/* Histórico recente / Lançamentos */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Transações ({items.length})
              </p>
              <p className="text-[11px] text-muted-foreground">
                {format(cycle.from, "dd/MM", { locale: ptBR })} —{" "}
                {format(cycle.to, "dd/MM", { locale: ptBR })}
              </p>
            </div>

            <div className="space-y-1.5">
              {items.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
                  Nenhum lançamento neste período.
                  <p className="text-xs mt-2 max-w-sm mx-auto px-4">
                    Marque a forma de pagamento como "Crédito" e mencione "
                    {card.nickname || card.lastFour}" nas observações.
                  </p>
                </div>
              ) : (
                items.map((e) => {
                  const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
                  const value = isRec ? e.amount / e.installments! : e.amount;
                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {e.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] py-0 h-4">
                            {e.category}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(e.dueDate + "T00:00:00"), "dd/MM", { locale: ptBR })}
                          </span>
                          {isRec && (
                            <span className="text-[11px] text-muted-foreground">
                              {e.installments}x
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <p className="text-sm font-semibold text-foreground">{mask(fmt(value))}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditingExpense(e)}
                          aria-label="Editar lançamento"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeletingExpense(e)}
                          aria-label="Excluir lançamento"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {editingOpening && (
        <CreditCardOpeningDialog
          open={editingOpening}
          onOpenChange={setEditingOpening}
          cardName={card.nickname || bank.name}
          cycleLabel={format(cycle.dueDate, "MMMM/yy", { locale: ptBR })}
          initialAmount={openingAmount}
          initialNotes={opening?.notes ?? null}
          onSave={async (amount, notes) => {
            await upsertOpening(card.id, cycleKey, amount, notes);
          }}
        />
      )}

      <ExpenseEditDialog
        open={!!editingExpense}
        onOpenChange={(v) => !v && setEditingExpense(null)}
        expense={editingExpense}
        warning={
          cycleOffset !== 0
            ? cycleOffset < 0
              ? "Esta despesa pertence a uma fatura passada."
              : "Esta despesa pertence a uma fatura futura."
            : null
        }
        onSave={async (patch) => {
          if (!editingExpense) return;
          await updateExpense(editingExpense.id, {
            description: patch.description,
            amount: patch.amount,
            dueDate: patch.dueDate,
            category: patch.category,
            notes: patch.notes ?? undefined,
          });
          toast.success("Lançamento atualizado");
        }}
      />

      <ConfirmDeleteDialog
        open={!!deletingExpense}
        onOpenChange={(v) => !v && setDeletingExpense(null)}
        title="Excluir lançamento da fatura?"
        description={
          deletingExpense?.type === "recorrente" &&
          (deletingExpense?.installments ?? 0) > 1
            ? `Este lançamento é parcelado (${deletingExpense.installments}x). A exclusão removerá a despesa inteira de todas as faturas.`
            : "Esta ação não pode ser desfeita."
        }
        onConfirm={async () => {
          if (!deletingExpense) return;
          await deleteExpense(deletingExpense.id);
          toast.success("Lançamento excluído");
          setDeletingExpense(null);
        }}
      />

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Pagar fatura
            </DialogTitle>
            <DialogDescription>
              Marca todos os lançamentos em aberto deste ciclo como pagos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">Valor total</p>
              <p className="text-2xl font-bold text-foreground mt-1">{mask(fmt(total))}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {items.filter((e) => !e.paid).length} lançamento(s) em aberto
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Data do pagamento</Label>
              <Input
                id="pay-date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} disabled={paying}>
              Cancelar
            </Button>
            <Button
              disabled={paying || !payDate}
              onClick={async () => {
                setPaying(true);
                try {
                  const unpaid = items.filter((e) => !e.paid);
                  for (const e of unpaid) {
                    await updateExpense(e.id, { paid: true, paidDate: payDate });
                  }
                  toast.success(
                    unpaid.length > 0
                      ? `Fatura paga · ${unpaid.length} lançamento(s) marcado(s) como pagos`
                      : "Fatura registrada como paga"
                  );
                  setPayDialogOpen(false);
                } catch {
                  toast.error("Erro ao pagar fatura");
                } finally {
                  setPaying(false);
                }
              }}
            >
              {paying ? "Pagando..." : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
