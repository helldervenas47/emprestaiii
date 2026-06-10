import { useMemo, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, PiggyBank, Pencil, Trash2, ArrowDownCircle, ArrowUpCircle,
  Calendar, TrendingUp, History, Receipt, Repeat, Info, Wallet, Zap, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { RowActions } from "@/components/ui/row-actions";
import { useHideValues } from "@/contexts/HideValuesContext";
import { usePiggyBanks, type PiggyBank as PiggyBankType, type PiggyBankDeposit } from "@/hooks/usePiggyBanks";
import { useUnifiedAccountBalance } from "@/hooks/useUnifiedAccountBalance";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PALETTE = [
  "210 80% 55%", "150 65% 45%", "280 70% 60%", "30 85% 55%",
  "340 75% 60%", "190 70% 50%", "45 90% 55%", "0 75% 60%",
];

export default function PiggyBankDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mask } = useHideValues();
  const {
    piggyBanks, deposits, balances, detailed, cdiRate,
    updatePiggyBank, deletePiggyBank, adjustBalance,
    updateDeposit, deleteDeposit, setPiggyRate,
    storeMoney, withdrawMoney,
  } = usePiggyBanks();
  const accountBalance = useUnifiedAccountBalance();

  const pb = useMemo(() => piggyBanks.find((p) => p.id === id) ?? null, [piggyBanks, id]);

  // ===== Transfer (deposit/withdraw) =====
  const [transferMode, setTransferMode] = useState<"store" | "withdraw" | null>(null);
  const [transferValue, setTransferValue] = useState("");
  const [transferring, setTransferring] = useState(false);

  const openTransfer = (mode: "store" | "withdraw") => {
    setTransferMode(mode);
    setTransferValue("");
  };
  const confirmTransfer = async () => {
    if (!pb || !transferMode) return;
    const v = Number(transferValue.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return;
    setTransferring(true);
    const ok = transferMode === "store"
      ? await storeMoney(pb.id, v)
      : await withdrawMoney(pb.id, v);
    setTransferring(false);
    if (ok) setTransferMode(null);
  };

  // ===== Edit =====
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "", color: PALETTE[0], cdiPercent: "100",
    shortId: "", goalAmount: "", category: "", targetDate: "",
  });
  const openEdit = () => {
    if (!pb) return;
    setDraft({
      name: pb.name,
      color: pb.color,
      cdiPercent: String(pb.cdiPercent ?? 100),
      shortId: pb.shortId ? String(pb.shortId) : "",
      goalAmount: pb.goalAmount ? String(pb.goalAmount) : "",
      category: pb.category ?? "",
      targetDate: pb.targetDate ?? "",
    });
    setEditOpen(true);
  };
  const saveEdit = async () => {
    if (!pb || !draft.name.trim()) return;
    const pctRaw = Number(draft.cdiPercent.replace(",", "."));
    const pct = Number.isFinite(pctRaw) && pctRaw > 0 ? Math.min(pctRaw, 500) : 100;
    const baseCdi = cdiRate ? cdiRate.annualRate : 11.15;
    const rate = Number((baseCdi * (pct / 100)).toFixed(4));

    const goalAmount = draft.goalAmount.trim() ? Number(draft.goalAmount.replace(",", ".")) : null;
    const category = draft.category.trim() || null;
    const targetDate = draft.targetDate.trim() || null;

    let shortId: number | null = null;
    if (draft.shortId.trim()) {
      const n = Number(draft.shortId.trim());
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        toast.error("O número da caixinha deve ser inteiro entre 1 e 99");
        return;
      }
      const conflict = piggyBanks.find((p) => p.shortId === n && p.id !== pb.id);
      if (conflict) {
        toast.error(`O número ${n} já está em uso pela caixinha "${conflict.name}"`);
        return;
      }
      shortId = n;
    }

    const rateChanged = Math.abs(pb.annualRate - rate) > 0.0001;
    await updatePiggyBank(pb.id, {
      name: draft.name.trim(),
      color: draft.color,
      shortId,
      autoRate: true,
      cdiPercent: pct,
      goalAmount,
      category,
      targetDate,
    });
    if (rateChanged) await setPiggyRate(pb.id, rate, "forward");
    setEditOpen(false);
  };

  // ===== Adjust balance =====
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustValue, setAdjustValue] = useState("");
  const openAdjust = () => {
    if (!pb) return;
    setAdjustValue((balances.get(pb.id)?.balance ?? 0).toFixed(2));
    setAdjustOpen(true);
  };
  const confirmAdjust = async () => {
    if (!pb) return;
    const v = Number(adjustValue.replace(",", "."));
    if (Number.isNaN(v) || v < 0) return;
    await adjustBalance(pb.id, v);
    setAdjustOpen(false);
  };

  // ===== Delete / Close goal =====
  const [closeOpen, setCloseOpen] = useState(false);

  // ===== Deposit row edit/delete =====
  const [editDeposit, setEditDeposit] = useState<PiggyBankDeposit | null>(null);
  const [editDepositDraft, setEditDepositDraft] = useState({ amount: "", depositDate: "" });
  const [deleteDepositId, setDeleteDepositId] = useState<string | null>(null);

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

  // ===== Sorted history + linked expenses =====
  const history = useMemo<PiggyBankDeposit[]>(() => {
    if (!pb) return [];
    return deposits
      .filter((d) => d.piggyBankId === pb.id)
      .slice()
      .sort((a, b) => {
        if (a.depositDate !== b.depositDate) return a.depositDate < b.depositDate ? 1 : -1;
        return a.id < b.id ? 1 : -1;
      });
  }, [pb, deposits]);

  const [expensesById, setExpensesById] = useState<Record<string, { description: string; category: string }>>({});
  useEffect(() => {
    if (!pb) return;
    const ids = Array.from(new Set(history.map((d) => d.expenseId).filter((x): x is string => !!x)));
    const missing = ids.filter((x) => !(x in expensesById));
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
  }, [pb, history, expensesById]);

  if (!pb) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <PiggyBank className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Cofrinho não encontrado.</p>
          <Button variant="outline" onClick={() => navigate("/")}>Voltar</Button>
        </div>
      </div>
    );
  }

  const b = balances.get(pb.id);
  const det = detailed.get(pb.id);
  const currentBalance = b?.balance ?? 0;
  const goal = pb.goalAmount ?? 0;
  const progress = goal > 0 ? Math.min(100, (currentBalance / goal) * 100) : 0;
  const remaining = goal > 0 ? Math.max(0, goal - currentBalance) : 0;
  const isCompleted = goal > 0 && currentBalance >= goal;

  const daysUntilTarget = (() => {
    if (!pb.targetDate) return null;
    const target = new Date(pb.targetDate + "T12:00:00");
    const diff = Math.ceil((target.getTime() - Date.now()) / 86_400_000);
    return diff;
  })();

  const fmtBRDate = (iso: string | null | undefined) =>
    iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—";

  return (
    <div className="min-h-screen bg-background">
      <header
        className="border-b border-border/30 glass sticky top-0 z-40"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 lg:px-8 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
            style={{ backgroundColor: `hsl(${pb.color} / 0.15)` }}
          >
            <PiggyBank className="h-4.5 w-4.5" style={{ color: `hsl(${pb.color})` }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base sm:text-lg font-semibold truncate">{pb.name}</h1>
              {isCompleted && (
                <Badge className="bg-success/15 text-success border-success/20 h-4 px-1 text-[9px] uppercase tracking-tighter">
                  Concluída
                </Badge>
              )}
            </div>
            {pb.category && (
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                {pb.category}
              </p>
            )}
          </div>
          <RowActions
            actions={[
              { label: "Editar", icon: <Pencil className="h-3.5 w-3.5" />, onClick: openEdit },
              { label: "Ajustar saldo", icon: <Wallet className="h-3.5 w-3.5" />, onClick: openAdjust },
              { label: "Encerrar meta", icon: <Trash2 className="h-3.5 w-3.5" />, destructive: true, onClick: () => setCloseOpen(true) },
            ]}
          />
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 space-y-6">
        {/* RESUMO DA META */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Info className="h-3 w-3" /> Resumo da meta
          </h2>
          <div className="rounded-2xl border border-border/40 p-4 sm:p-5 space-y-4" style={{ background: `hsl(${pb.color} / 0.04)` }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Valor atual" value={mask(fmt(currentBalance))} accent={isCompleted ? "success" : "default"} />
              <Stat label="Objetivo" value={goal > 0 ? mask(fmt(goal)) : "—"} />
              <Stat label="Valor restante" value={goal > 0 ? mask(fmt(remaining)) : "—"} />
              <Stat label="Concluído" value={goal > 0 ? `${Math.round(progress)}%` : "—"} accent="primary" />
            </div>

            {goal > 0 && (
              <div className="space-y-1">
                <Progress
                  value={progress}
                  className={`h-2 bg-muted/40 ${isCompleted ? "[&>div]:bg-success" : progress >= 80 ? "[&>div]:bg-warning" : ""}`}
                />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border/30">
              <Stat label="Status" value={isCompleted ? "Concluída" : goal > 0 ? "Em andamento" : "Sem meta"} />
              <Stat label="Categoria" value={pb.category || "—"} />
              <Stat label="Criado em" value={fmtBRDate(pb.createdAt)} />
              <Stat label="Previsão" value={fmtBRDate(pb.targetDate)} />
            </div>
          </div>
        </section>

        {/* AÇÕES */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button onClick={() => openTransfer("store")} className="h-11">
            <ArrowDownCircle className="h-4 w-4 mr-1.5" /> Depositar
          </Button>
          <Button onClick={() => openTransfer("withdraw")} variant="outline" className="h-11">
            <ArrowUpCircle className="h-4 w-4 mr-1.5" /> Resgatar
          </Button>
          <Button onClick={openEdit} variant="outline" className="h-11">
            <Pencil className="h-4 w-4 mr-1.5" /> Editar
          </Button>
          <Button onClick={() => setCloseOpen(true)} variant="outline" className="h-11 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1.5" /> Encerrar
          </Button>
        </section>

        {/* INDICADORES */}
        {goal > 0 && remaining > 0 && pb.targetDate && daysUntilTarget && daysUntilTarget > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Target className="h-3 w-3" /> Indicadores · ritmo necessário
            </h2>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Por dia" value={mask(fmt(remaining / daysUntilTarget))} accent="primary" />
              <Stat label="Por semana" value={mask(fmt(remaining / (daysUntilTarget / 7)))} accent="primary" />
              <Stat label="Por mês" value={mask(fmt(remaining / (daysUntilTarget / 30)))} accent="primary" />
              <Stat label="Previsão" value={fmtBRDate(pb.targetDate)} />
            </div>
          </section>
        )}

        {/* RENDIMENTO */}
        {det && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-3 w-3" /> Rendimento
            </h2>
            <div className="rounded-2xl border border-border/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Rend. líquido total" value={mask(fmt(det.net))} accent="success" />
              <Stat label="CDI aplicado" value={`${pb.cdiPercent ?? 100}%`} />
              <Stat label="Taxa atual" value={`${det.currentRate.toFixed(2)}% a.a.`} />
            </div>
          </section>
        )}

        {/* MOVIMENTAÇÕES */}
        <section className="space-y-3 pb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <History className="h-3 w-3" /> Movimentações
            <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">
              ({history.length} {history.length === 1 ? "registro" : "registros"})
            </span>
          </h2>
          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
              <Receipt className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground max-w-[260px] mx-auto">
                Nenhuma movimentação registrada neste cofrinho.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((d) => {
                const isPositive = d.amount >= 0;
                const exp = d.expenseId ? expensesById[d.expenseId] : null;
                const Icon = d.source === "recurring" ? Repeat : isPositive ? ArrowDownCircle : ArrowUpCircle;
                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-background/50 hover:border-primary/20 transition-colors"
                  >
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-foreground truncate">
                          {exp?.description ||
                            (d.source === "manual"
                              ? "Ajuste de saldo"
                              : d.source === "transfer_in"
                              ? "Depósito"
                              : d.source === "transfer_out"
                              ? "Resgate"
                              : d.source === "recurring"
                              ? "Aporte recorrente"
                              : "Aporte")}
                        </p>
                        <p className={`text-sm font-black tabular-nums ${isPositive ? "text-success" : "text-destructive"}`}>
                          {isPositive ? "+" : ""}{mask(fmt(d.amount))}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-medium uppercase">
                          {d.depositDate.split("-").reverse().join("/")}
                        </span>
                        {exp?.category && (
                          <Badge variant="secondary" className="h-3.5 px-1 text-[8px] uppercase tracking-tighter">
                            {exp.category}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <RowActions
                      actions={[
                        { label: "Editar", icon: <Pencil className="h-3 w-3" />, onClick: () => openEditDeposit(d) },
                        { label: "Excluir", icon: <Trash2 className="h-3 w-3" />, destructive: true, onClick: () => setDeleteDepositId(d.id) },
                      ]}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Transfer dialog */}
      <Dialog open={!!transferMode} onOpenChange={(o) => !o && setTransferMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pb.name}</DialogTitle>
            <DialogDescription>
              Movimente dinheiro entre o saldo em conta e este cofrinho. Não afeta receitas, despesas nem relatórios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={transferMode === "store" ? "default" : "outline"}
                onClick={() => setTransferMode("store")}
                className="h-11"
              >
                <ArrowDownCircle className="h-4 w-4 mr-1.5" /> Depositar
              </Button>
              <Button
                type="button"
                variant={transferMode === "withdraw" ? "default" : "outline"}
                onClick={() => setTransferMode("withdraw")}
                className="h-11"
              >
                <ArrowUpCircle className="h-4 w-4 mr-1.5" /> Resgatar
              </Button>
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Saldo em conta:</span>
                <span className="font-semibold tabular-nums">{fmt(accountBalance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Saldo do cofrinho:</span>
                <span className="font-semibold tabular-nums">{fmt(currentBalance)}</span>
              </div>
            </div>
            <div>
              <Label htmlFor="transfer-value">Valor (R$)</Label>
              <Input
                id="transfer-value"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={transferValue}
                onChange={(e) => setTransferValue(e.target.value)}
                placeholder="0,00"
              />
              {(() => {
                const v = Number(transferValue.replace(",", "."));
                if (!Number.isFinite(v) || v <= 0) return null;
                const max = transferMode === "store" ? accountBalance : currentBalance;
                if (v > max + 0.0001) {
                  return <p className="text-[11px] mt-1.5 text-destructive">Valor maior que o disponível ({fmt(max)})</p>;
                }
                return (
                  <p className="text-[11px] mt-1.5 text-muted-foreground">
                    {transferMode === "store" ? "Conta → Cofrinho" : "Cofrinho → Conta"}: {fmt(v)}
                  </p>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferMode(null)} disabled={transferring}>Cancelar</Button>
            <Button onClick={confirmTransfer} disabled={transferring || !transferValue}>
              {transferMode === "store" ? "Depositar" : "Resgatar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar cofrinho</DialogTitle>
            <DialogDescription>
              Atualize nome, meta, categoria, prazo e rendimento (% do CDI).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <div>
                <Label htmlFor="ed-name">Nome</Label>
                <Input id="ed-name" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="ed-short">Nº (1-99)</Label>
                <Input
                  id="ed-short"
                  inputMode="numeric"
                  value={draft.shortId}
                  onChange={(e) => setDraft((p) => ({ ...p, shortId: e.target.value.replace(/[^\d]/g, "").slice(0, 2) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="ed-cat">Categoria</Label>
                <Input id="ed-cat" value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="ed-date">Data prevista</Label>
                <Input id="ed-date" type="date" value={draft.targetDate} onChange={(e) => setDraft((p) => ({ ...p, targetDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="ed-goal">Valor objetivo</Label>
              <Input
                id="ed-goal"
                inputMode="decimal"
                placeholder="Ex: 5000,00"
                value={draft.goalAmount}
                onChange={(e) => setDraft((p) => ({ ...p, goalAmount: e.target.value.replace(/[^\d.,]/g, "") }))}
              />
            </div>
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
                  />
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="ed-cdi">% do CDI</Label>
              <Input
                id="ed-cdi"
                inputMode="decimal"
                value={draft.cdiPercent}
                onChange={(e) => setDraft((p) => ({ ...p, cdiPercent: e.target.value.replace(/[^\d.,]/g, "") }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={!draft.name.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar saldo</DialogTitle>
            <DialogDescription>
              Informe o novo saldo desejado para <strong>{pb.name}</strong>. A diferença será registrada como ajuste manual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="rounded-lg bg-muted/50 p-2.5 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">Saldo atual:</span>
              <span className="font-semibold">{fmt(currentBalance)}</span>
            </div>
            <div>
              <Label htmlFor="adj-value">Novo saldo (R$)</Label>
              <Input id="adj-value" type="number" step="0.01" min="0" value={adjustValue} onChange={(e) => setAdjustValue(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
            <Button onClick={confirmAdjust}>Aplicar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit deposit dialog */}
      <Dialog open={!!editDeposit} onOpenChange={(o) => !o && setEditDeposit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar lançamento</DialogTitle>
            <DialogDescription>Ajuste o valor e a data. Valores negativos representam retiradas.</DialogDescription>
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

      <ConfirmDeleteDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        onConfirm={async () => {
          await deletePiggyBank(pb.id);
          setCloseOpen(false);
          navigate("/");
        }}
        title="Encerrar meta"
        description="O cofrinho e seus aportes registrados serão removidos. As despesas já lançadas permanecem no histórico. Esta ação não pode ser desfeita."
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: string;
  accent?: "default" | "primary" | "success";
}) {
  const accentClass =
    accent === "primary" ? "text-primary" :
    accent === "success" ? "text-success" :
    "text-foreground";
  return (
    <div className="space-y-1 min-w-0">
      <span className="text-[10px] text-muted-foreground uppercase tracking-tight font-bold block">{label}</span>
      <p className={`text-sm sm:text-base font-bold tabular-nums truncate ${accentClass}`}>{value}</p>
    </div>
  );
}
