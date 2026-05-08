import { useEffect, useMemo, useState } from "react";
import { PiggyBank, Plus, TrendingUp, Trash2, Pencil, Sparkles, Wallet, History, ArrowDownCircle, ArrowUpCircle, Repeat, Receipt, Percent, CalendarClock, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useHideValues } from "@/contexts/HideValuesContext";
import { usePiggyBanks, type PiggyBank as PiggyBankType, type PiggyBankDeposit } from "@/hooks/usePiggyBanks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PALETTE = [
  "210 80% 55%", "150 65% 45%", "280 70% 60%", "30 85% 55%",
  "340 75% 60%", "190 70% 50%", "45 90% 55%", "0 75% 60%",
];

interface Props {
  readOnly?: boolean;
}

export function PiggyBankList({ readOnly = false }: Props) {
  const { mask } = useHideValues();
  const { piggyBanks, deposits, balances, detailed, createPiggyBank, updatePiggyBank, deletePiggyBank, adjustBalance, updateDeposit, deleteDeposit, setPiggyRate } = usePiggyBanks();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PiggyBankType | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", color: PALETTE[0], annualRate: "11.15", shortId: "" });
  const [adjustTarget, setAdjustTarget] = useState<PiggyBankType | null>(null);
  const [adjustValue, setAdjustValue] = useState("");
  const [historyTarget, setHistoryTarget] = useState<PiggyBankType | null>(null);
  const [expensesById, setExpensesById] = useState<Record<string, { description: string; category: string }>>({});
  const [editDeposit, setEditDeposit] = useState<PiggyBankDeposit | null>(null);
  const [editDepositDraft, setEditDepositDraft] = useState({ amount: "", depositDate: "" });
  const [deleteDepositId, setDeleteDepositId] = useState<string | null>(null);
  // Diálogo de escolha quando a taxa muda no editar
  const [rateChangePending, setRateChangePending] = useState<{ pb: PiggyBankType; newRate: number } | null>(null);

  const openEditDeposit = (d: PiggyBankDeposit) => {
    setEditDepositDraft({ amount: d.amount.toFixed(2), depositDate: d.depositDate });
    setEditDeposit(d);
  };
  const confirmEditDeposit = async () => {
    if (!editDeposit) return;
    const v = Number(editDepositDraft.amount.replace(",", "."));
    if (Number.isNaN(v)) return;
    await updateDeposit(editDeposit.id, { amount: v, depositDate: editDepositDraft.depositDate });
    setEditDeposit(null);
  };

  // Returns the smallest unused short_id (1..99) for this account.
  const nextAvailableShortId = (): number | null => {
    const taken = new Set(piggyBanks.map((p) => p.shortId).filter((n): n is number => !!n));
    for (let i = 1; i <= 99; i++) if (!taken.has(i)) return i;
    return null;
  };

  const openCreate = () => {
    const next = nextAvailableShortId();
    setDraft({ name: "", color: PALETTE[0], annualRate: "11.15", shortId: next ? String(next) : "" });
    setEditing(null);
    setCreateOpen(true);
  };
  const openEdit = (pb: PiggyBankType) => {
    setDraft({ name: pb.name, color: pb.color, annualRate: String(pb.annualRate), shortId: pb.shortId ? String(pb.shortId) : "" });
    setEditing(pb);
    setCreateOpen(true);
  };
  const openAdjust = (pb: PiggyBankType) => {
    const current = balances.get(pb.id)?.balance ?? 0;
    setAdjustValue(current.toFixed(2));
    setAdjustTarget(pb);
  };
  const confirmAdjust = async () => {
    if (!adjustTarget) return;
    const v = Number(adjustValue.replace(",", "."));
    if (Number.isNaN(v) || v < 0) return;
    await adjustBalance(adjustTarget.id, v);
    setAdjustTarget(null);
  };

  const historyDeposits = useMemo<PiggyBankDeposit[]>(() => {
    if (!historyTarget) return [];
    return deposits
      .filter((d) => d.piggyBankId === historyTarget.id)
      .slice()
      .sort((a, b) => {
        if (a.depositDate !== b.depositDate) return a.depositDate < b.depositDate ? 1 : -1;
        return a.id < b.id ? 1 : -1;
      });
  }, [historyTarget, deposits]);

  // Fetch linked expenses (description/category) for the history dialog.
  useEffect(() => {
    if (!historyTarget) return;
    const ids = Array.from(
      new Set(historyDeposits.map((d) => d.expenseId).filter((id): id is string => !!id))
    );
    const missing = ids.filter((id) => !(id in expensesById));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("expenses")
        .select("id, description, category")
        .in("id", missing);
      if (data) {
        setExpensesById((prev) => {
          const next = { ...prev };
          for (const row of data as any[]) {
            next[row.id] = { description: row.description, category: row.category };
          }
          return next;
        });
      }
    })();
  }, [historyTarget, historyDeposits, expensesById]);

  const save = async () => {
    if (!draft.name.trim()) return;
    const rate = Number(draft.annualRate.replace(",", ".")) || 11.15;

    // Validate short id (1..99, unique within this account).
    let shortId: number | null = null;
    if (draft.shortId.trim()) {
      const n = Number(draft.shortId.trim());
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        toast.error("O número da caixinha deve ser inteiro entre 1 e 99");
        return;
      }
      const conflict = piggyBanks.find((p) => p.shortId === n && p.id !== editing?.id);
      if (conflict) {
        toast.error(`O número ${n} já está em uso pela caixinha "${conflict.name}"`);
        return;
      }
      shortId = n;
    }

    if (editing) {
      const rateChanged = Math.abs(editing.annualRate - rate) > 0.0001;
      // Salva metadados (nome/cor/nº) imediatamente; taxa é tratada via setPiggyRate
      await updatePiggyBank(editing.id, { name: draft.name.trim(), color: draft.color, shortId });
      if (rateChanged) {
        // Abre diálogo de escolha (não fechamos o modal de edição ainda)
        setRateChangePending({ pb: editing, newRate: rate });
        return;
      }
    } else {
      await createPiggyBank({ name: draft.name.trim(), color: draft.color, annualRate: rate, shortId });
    }
    setCreateOpen(false);
  };

  const totalBalance = piggyBanks.reduce((s, pb) => s + (balances.get(pb.id)?.balance ?? 0), 0);
  const totalYield = piggyBanks.reduce((s, pb) => s + (balances.get(pb.id)?.yield ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <PiggyBank className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-tight">Cofrinhos</h3>
            <p className="text-[10px] text-muted-foreground leading-tight">
              Saldo total: <span className="font-medium text-foreground">{mask(fmt(totalBalance))}</span>
              {totalYield > 0 && (
                <span className="ml-1 text-success">(+{mask(fmt(totalYield))})</span>
              )}
            </p>
          </div>
        </div>
        {!readOnly && (
          <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo
          </Button>
        )}
      </div>

      {piggyBanks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-4 text-center">
          <Sparkles className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1.5" />
          <p className="text-xs text-muted-foreground">
            Crie cofrinhos para reservar dinheiro com rendimento simulado.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {piggyBanks.map((pb) => {
            const b = balances.get(pb.id);
            return (
              <div
                key={pb.id}
                role="button"
                tabIndex={0}
                onClick={() => setHistoryTarget(pb)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setHistoryTarget(pb);
                  }
                }}
                className="rounded-xl border border-border/40 p-3 flex items-center gap-3 cursor-pointer hover:border-border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ background: `hsl(${pb.color} / 0.05)` }}
                title="Ver histórico de aportes"
              >
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `hsl(${pb.color} / 0.18)` }}
                >
                  <PiggyBank className="h-4.5 w-4.5" style={{ color: `hsl(${pb.color})` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {pb.shortId != null && (
                      <span className="text-[10px] font-mono font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                        #{pb.shortId}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-foreground truncate">{pb.name}</p>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">
                      {pb.annualRate.toFixed(2)}% a.a.
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Aportado: {mask(fmt(b?.principal ?? 0))}
                    {b && b.yield > 0 && (
                      <span className="ml-1 text-success inline-flex items-center gap-0.5">
                        <TrendingUp className="h-2.5 w-2.5" />
                        {mask(fmt(b.yield))}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm font-bold text-foreground">{mask(fmt(b?.balance ?? 0))}</p>
                  <div className="flex gap-0.5 justify-end mt-0.5">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setHistoryTarget(pb)} title="Histórico de aportes">
                      <History className="h-3 w-3" />
                    </Button>
                    {!readOnly && (
                      <>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openAdjust(pb)} title="Ajustar saldo">
                          <Wallet className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(pb)} title="Editar">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(pb.id)}
                          title="Excluir"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground italic">
        Para depositar, cadastre uma despesa pessoal e selecione "Destinar a um cofrinho".
        Rendimento aplicado diariamente (juros compostos), referência ~100% CDI.
      </p>

      {/* Create/edit dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cofrinho" : "Novo cofrinho"}</DialogTitle>
            <DialogDescription>
              Defina um nome, cor e a taxa anual de rendimento (default ~100% CDI).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <div>
                <Label htmlFor="pb-name">Nome</Label>
                <Input
                  id="pb-name"
                  placeholder="Ex: Reserva de emergência"
                  value={draft.name}
                  onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pb-shortid">Nº (1-99)</Label>
                <Input
                  id="pb-shortid"
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  inputMode="numeric"
                  placeholder="Ex: 1"
                  value={draft.shortId}
                  onChange={(e) => setDraft((p) => ({ ...p, shortId: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-2">
              O número permite usar atalhos no bot, ex: <code>aporte {draft.shortId || "1"} 200</code>.
            </p>
            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition ${draft.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: `hsl(${c})` }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="pb-rate">Taxa anual (%)</Label>
              <Input
                id="pb-rate"
                type="number"
                step="0.01"
                value={draft.annualRate}
                onChange={(e) => setDraft((p) => ({ ...p, annualRate: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                100% CDI ≈ 11,15% a.a. (referência PicPay).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!draft.name.trim()}>
              {editing ? "Salvar" : "Criar cofrinho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deletePiggyBank(deleteId);
          setDeleteId(null);
        }}
        title="Excluir cofrinho"
        description="Os aportes registrados também serão removidos. As despesas já lançadas permanecem no histórico. Esta ação não pode ser desfeita."
      />

      {/* Manual balance adjustment dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar saldo</DialogTitle>
            <DialogDescription>
              Informe o novo saldo desejado para <strong>{adjustTarget?.name}</strong>. A diferença será
              registrada como ajuste manual e não afeta o "Gasto do mês".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="rounded-lg bg-muted/50 p-2.5 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">Saldo atual:</span>
              <span className="font-semibold">
                {fmt(adjustTarget ? balances.get(adjustTarget.id)?.balance ?? 0 : 0)}
              </span>
            </div>
            <div>
              <Label htmlFor="adjust-value">Novo saldo (R$)</Label>
              <Input
                id="adjust-value"
                type="number"
                step="0.01"
                min="0"
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
                autoFocus
              />
              {adjustTarget && (() => {
                const current = balances.get(adjustTarget.id)?.balance ?? 0;
                const v = Number(adjustValue.replace(",", "."));
                if (Number.isNaN(v)) return null;
                const delta = v - current;
                return (
                  <p className={`text-[11px] mt-1.5 ${delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    Ajuste: {delta > 0 ? "+" : ""}{fmt(delta)}
                  </p>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancelar</Button>
            <Button onClick={confirmAdjust}>Aplicar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyTarget} onOpenChange={(o) => !o && setHistoryTarget(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {historyTarget && (
                <span
                  className="h-7 w-7 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: `hsl(${historyTarget.color} / 0.18)` }}
                >
                  <PiggyBank className="h-3.5 w-3.5" style={{ color: `hsl(${historyTarget.color})` }} />
                </span>
              )}
              Histórico de aportes — {historyTarget?.name}
            </DialogTitle>
            <DialogDescription>
              {historyDeposits.length} {historyDeposits.length === 1 ? "movimentação" : "movimentações"}
              {historyTarget && (
                <> · Saldo atual: <span className="font-medium text-foreground">
                  {fmt(balances.get(historyTarget.id)?.balance ?? 0)}
                </span></>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-2 px-2">
            {historyDeposits.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                <Receipt className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1.5" />
                <p className="text-xs text-muted-foreground">
                  Nenhum aporte registrado ainda. Cadastre uma despesa pessoal e
                  selecione "Destinar a um cofrinho" para criar uma movimentação.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {historyDeposits.map((d) => {
                  const isPositive = d.amount >= 0;
                  const exp = d.expenseId ? expensesById[d.expenseId] : null;
                  const sourceLabel =
                    d.source === "manual"
                      ? "Ajuste manual"
                      : d.source === "recurring"
                      ? "Aporte recorrente"
                      : exp?.description
                      ? "Despesa vinculada"
                      : "Aporte";
                  const SourceIcon =
                    d.source === "recurring" ? Repeat : isPositive ? ArrowUpCircle : ArrowDownCircle;
                  return (
                    <li key={d.id} className="py-2.5 flex items-start gap-3">
                      <span
                        className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        <SourceIcon className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {exp?.description || sourceLabel}
                          </p>
                          <p
                            className={`text-sm font-semibold tabular-nums shrink-0 ${
                              isPositive ? "text-success" : "text-destructive"
                            }`}
                          >
                            {isPositive ? "+" : ""}
                            {fmt(d.amount)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">
                            {d.depositDate.split("-").reverse().join("/")}
                          </span>
                          <span className="text-[11px] text-muted-foreground">·</span>
                          <span className="text-[11px] text-muted-foreground">{sourceLabel}</span>
                          {exp?.category && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                              {exp.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {!readOnly && (
                        <div className="flex gap-0.5 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEditDeposit(d)}
                            title="Editar lançamento"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteDepositId(d.id)}
                            title="Excluir lançamento"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryTarget(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit deposit dialog */}
      <Dialog open={!!editDeposit} onOpenChange={(o) => !o && setEditDeposit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar lançamento</DialogTitle>
            <DialogDescription>
              Ajuste o valor e a data deste lançamento. Valores negativos representam retiradas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label htmlFor="dep-amount">Valor (R$)</Label>
              <Input
                id="dep-amount"
                type="number"
                step="0.01"
                value={editDepositDraft.amount}
                onChange={(e) => setEditDepositDraft((p) => ({ ...p, amount: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="dep-date">Data</Label>
              <Input
                id="dep-date"
                type="date"
                value={editDepositDraft.depositDate}
                onChange={(e) => setEditDepositDraft((p) => ({ ...p, depositDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDeposit(null)}>Cancelar</Button>
            <Button onClick={confirmEditDeposit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteDepositId}
        onOpenChange={(o) => !o && setDeleteDepositId(null)}
        onConfirm={() => {
          if (deleteDepositId) deleteDeposit(deleteDepositId);
          setDeleteDepositId(null);
        }}
        title="Excluir lançamento"
        description="Este aporte será removido do histórico do cofrinho. A despesa vinculada (se houver) permanece. Esta ação não pode ser desfeita."
      />
    </div>
  );
}
