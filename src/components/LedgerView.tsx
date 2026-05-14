import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownRight, ArrowUpRight, Plus, Trash2, Wallet, ListFilter, RefreshCw, Pencil, Banknote, Building2, ArrowLeftRight } from "lucide-react";
import {
  listLedger, recordLedger, deleteLedgerEntry, updateLedgerEntry,
  recomputeBalanceFromLedger, recordTransfer,
  type LedgerEntry, type LedgerCategory, type LedgerDirection,
} from "@/lib/ledger";
import { getBalances, type Wallet as WalletType } from "@/lib/balance";
import { todayInAppTz, getAppTimezone } from "@/lib/timezone";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Format the exact time portion (HH:mm:ss) of a timestamptz in the app timezone. */
const formatTimeInAppTz = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: getAppTimezone(),
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString().slice(11, 19);
  }
};

const categoryLabels: Record<LedgerCategory, string> = {
  loan: "Empréstimo",
  payment: "Pagamento",
  expense: "Despesa",
  adjustment: "Ajuste",
  aporte: "Aporte",
  sale: "Venda",
  initial: "Saldo inicial",
  other: "Outro",
  transfer: "Transferência",
};

const walletLabel = (w: WalletType) => (w === "cash" ? "Dinheiro" : "Conta");

interface Props {
  readOnly?: boolean;
}

export function LedgerView({ readOnly = false }: Props) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [balances, setBalances] = useState({ account: 0, cash: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filterDir, setFilterDir] = useState<"all" | LedgerDirection>("all");
  const [filterCat, setFilterCat] = useState<"all" | LedgerCategory>("all");
  const [filterWallet, setFilterWallet] = useState<"all" | WalletType>("all");
  const [filterMonth, setFilterMonth] = useState<string>(() => todayInAppTz().slice(0, 7));
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<LedgerEntry | null>(null);
  const { methods: paymentMethods } = usePaymentMethods();
  const [paymentMethodByPaymentId, setPaymentMethodByPaymentId] = useState<Record<string, string | null>>({});
  const methodNameById = useMemo(() => {
    const m = new Map<string, string>();
    paymentMethods.forEach((pm) => m.set(pm.id, pm.name));
    return m;
  }, [paymentMethods]);

  const getMethodName = useCallback((e: LedgerEntry): string | null => {
    const id = e.payment_method_id
      ?? (e.metadata as any)?.payment_method_id
      ?? (e.payment_id ? paymentMethodByPaymentId[e.payment_id] : null);
    if (!id) return null;
    return methodNameById.get(id) ?? null;
  }, [methodNameById, paymentMethodByPaymentId]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [list, bal] = await Promise.all([listLedger(), getBalances()]);
    setEntries(list);
    setBalances(bal);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const onChange = () => { reload(); };
    window.addEventListener("balance:changed", onChange);
    return () => window.removeEventListener("balance:changed", onChange);
  }, [reload]);

  // Backfill: payment_method_id da tabela `payments` para ledger antigos
  useEffect(() => {
    const missing = entries
      .filter((e) => e.payment_id && !e.payment_method_id && !(e.metadata as any)?.payment_method_id && !(e.payment_id! in paymentMethodByPaymentId))
      .map((e) => e.payment_id as string);
    if (missing.length === 0) return;
    const unique = Array.from(new Set(missing));
    (async () => {
      const { data } = await supabase.from("payments").select("id, payment_method_id").in("id", unique);
      setPaymentMethodByPaymentId((prev) => {
        const next = { ...prev };
        unique.forEach((id) => { if (!(id in next)) next[id] = null; });
        (data as any[] | null)?.forEach((r) => { next[r.id] = r.payment_method_id ?? null; });
        return next;
      });
    })();
  }, [entries, paymentMethodByPaymentId]);

  const filtered = useMemo(() => {
    return entries
      .filter((e) => {
        // Transferências internas entre carteiras não são receita/despesa real
        if (e.category === "transfer") return false;
        if (filterDir !== "all" && e.direction !== filterDir) return false;
        if (filterCat !== "all" && e.category !== filterCat) return false;
        if (filterWallet !== "all" && (e.wallet ?? "account") !== filterWallet) return false;
        if (filterMonth !== "all" && (e.occurred_on || "").slice(0, 7) !== filterMonth) return false;
        return true;
      })
      .sort((a, b) => {
        const cmp = (b.occurred_on ?? "").localeCompare(a.occurred_on ?? "");
        if (cmp !== 0) return cmp;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
  }, [entries, filterDir, filterCat, filterWallet, filterMonth]);

  const filteredList = useMemo(
    () => filtered.filter((e) => e.category !== "adjustment"),
    [filtered],
  );

  const totals = useMemo(() => {
    const totalIn = filtered.filter((e) => e.direction === "in").reduce((a, e) => a + Number(e.amount), 0);
    const totalOut = filtered.filter((e) => e.direction === "out").reduce((a, e) => a + Number(e.amount), 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [filtered]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => { if (e.occurred_on) set.add(e.occurred_on.slice(0, 7)); });
    set.add(todayInAppTz().slice(0, 7));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [entries]);

  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, (m || 1) - 1, 1);
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este lançamento? O saldo será ajustado automaticamente.")) return;
    await deleteLedgerEntry(id);
    await reload();
    toast.success("Lançamento removido");
  };

  const handleRecompute = async () => {
    await recomputeBalanceFromLedger();
    await reload();
    toast.success("Saldos recalculados a partir do extrato");
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Saldos por carteira */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card no3d>
          <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
            <div className="flex items-center justify-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
              <p className="text-[11px] sm:text-xs text-muted-foreground">Conta</p>
            </div>
            <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${balances.account < 0 ? "text-destructive" : "text-foreground"}`}>
              {formatBRL(balances.account)}
            </p>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
            <div className="flex items-center justify-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />
              <p className="text-[11px] sm:text-xs text-muted-foreground">Dinheiro</p>
            </div>
            <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${balances.cash < 0 ? "text-destructive" : "text-foreground"}`}>
              {formatBRL(balances.cash)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Entradas/Saídas do período filtrado */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card no3d>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center shrink-0">
              <ArrowUpRight className="h-4 w-4 text-success" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground truncate">
                Entradas {filterMonth !== "all" ? `· ${formatMonthLabel(filterMonth)}` : "· Todo período"}
              </p>
              <p className="text-sm sm:text-lg font-bold text-success truncate">{formatBRL(totals.totalIn)}</p>
            </div>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <ArrowDownRight className="h-4 w-4 text-destructive" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground truncate">
                Saídas {filterMonth !== "all" ? `· ${formatMonthLabel(filterMonth)}` : "· Todo período"}
              </p>
              <p className="text-sm sm:text-lg font-bold text-destructive truncate">{formatBRL(totals.totalOut)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros + ações */}
      <div className="flex flex-wrap items-center gap-2">
        <ListFilter className="hidden sm:block h-4 w-4 text-muted-foreground" />
        <Select value={filterWallet} onValueChange={(v: any) => setFilterWallet(v)}>
          <SelectTrigger className="h-9 flex-1 min-w-[120px] sm:flex-none sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as carteiras</SelectItem>
            <SelectItem value="account">Conta</SelectItem>
            <SelectItem value="cash">Dinheiro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDir} onValueChange={(v: any) => setFilterDir(v)}>
          <SelectTrigger className="h-9 flex-1 min-w-[120px] sm:flex-none sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="in">Entradas</SelectItem>
            <SelectItem value="out">Saídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCat} onValueChange={(v: any) => setFilterCat(v)}>
          <SelectTrigger className="h-9 flex-1 min-w-[140px] sm:flex-none sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {Object.entries(categoryLabels)
              .filter(([k]) => k !== "transfer")
              .map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={(v) => setFilterMonth(v)}>
          <SelectTrigger className="h-9 flex-1 min-w-[140px] sm:flex-none sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo período</SelectItem>
            {availableMonths.map((ym) => (
              <SelectItem key={ym} value={ym}>{formatMonthLabel(ym)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="hidden sm:block flex-1" />
        {!readOnly && (
          <>
            <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)} className="flex-1 sm:flex-none">
              <ArrowLeftRight className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Transferir</span>
            </Button>
            <Button size="sm" onClick={() => setAdjustOpen(true)} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Ajustar</span>
            </Button>
          </>
        )}
      </div>

      {/* Lançamentos */}
      {loading ? (
        <Card no3d><CardContent className="p-8 text-center text-muted-foreground">Carregando…</CardContent></Card>
      ) : filteredList.length === 0 ? (
        <Card no3d><CardContent className="p-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</CardContent></Card>
      ) : (
        <>
          {/* Mobile */}
          <div className="sm:hidden space-y-2">
            {filteredList.map((e) => {
              const w = (e.wallet ?? "account") as WalletType;
              const methodName = getMethodName(e);
              return (
                <Card no3d key={e.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground line-clamp-2">{e.description}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {e.occurred_on}
                            {formatTimeInAppTz(e.created_at) && (
                              <span className="ml-1 opacity-80">· {formatTimeInAppTz(e.created_at)}</span>
                            )}
                          </span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {categoryLabels[e.category]}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 inline-flex items-center gap-1">
                            {w === "cash" ? <Banknote className="h-2.5 w-2.5" /> : <Building2 className="h-2.5 w-2.5" />}
                            {walletLabel(w)}
                          </Badge>
                          {methodName && (
                            <span className="text-[10px] text-muted-foreground">· {methodName}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className={`text-sm font-semibold whitespace-nowrap ${e.direction === "in" ? "text-success" : "text-destructive"}`}>
                          {e.direction === "in" ? "+" : "−"} {formatBRL(Number(e.amount))}
                        </span>
                        {!readOnly && (
                          <div className="flex items-center gap-0.5 mt-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditEntry(e)} title="Editar">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(e.id)} title="Excluir">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop */}
          <Card no3d className="hidden sm:block">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Carteira</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    {!readOnly && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredList.map((e) => {
                    const w = (e.wallet ?? "account") as WalletType;
                    const methodName = getMethodName(e);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums">
                          <div className="flex flex-col leading-tight">
                            <span>{e.occurred_on}</span>
                            {formatTimeInAppTz(e.created_at) && (
                              <span className="text-[11px] text-muted-foreground">{formatTimeInAppTz(e.created_at)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{e.description}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {categoryLabels[e.category]}{methodName ? ` · ${methodName}` : ""}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] inline-flex items-center gap-1">
                            {w === "cash" ? <Banknote className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                            {walletLabel(w)}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${e.direction === "in" ? "text-success" : "text-destructive"}`}>
                          {e.direction === "in" ? "+" : "−"} {formatBRL(Number(e.amount))}
                        </TableCell>
                        {!readOnly && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditEntry(e)}>
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(e.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <AdjustBalanceDialog open={adjustOpen} onOpenChange={setAdjustOpen} balances={balances} onSaved={reload} />
      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} balances={balances} onSaved={reload} />
      <EditLedgerDialog entry={editEntry} onOpenChange={(v) => { if (!v) setEditEntry(null); }} onSaved={reload} />
    </div>
  );
}

function AdjustBalanceDialog({ open, onOpenChange, balances, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; balances: { account: number; cash: number }; onSaved: () => void }) {
  const [wallet, setWallet] = useState<WalletType>("account");
  const [targetBalance, setTargetBalance] = useState("");
  const [description, setDescription] = useState("Ajuste manual de saldo");
  const [date, setDate] = useState(todayInAppTz());
  const [saving, setSaving] = useState(false);

  const currentBalance = wallet === "cash" ? balances.cash : balances.account;

  useEffect(() => {
    if (open) {
      setWallet("account");
      setTargetBalance(balances.account.toFixed(2));
      setDescription("Ajuste manual de saldo");
      setDate(todayInAppTz());
    }
  }, [open, balances.account]);

  useEffect(() => {
    if (open) setTargetBalance(currentBalance.toFixed(2));
  }, [wallet, open, currentBalance]);

  const target = parseFloat(targetBalance.replace(",", "."));
  const validTarget = !isNaN(target);
  const delta = validTarget ? +(target - currentBalance).toFixed(2) : 0;
  const direction: LedgerDirection = delta >= 0 ? "in" : "out";
  const absDelta = Math.abs(delta);

  const handleSave = async () => {
    if (!validTarget) { toast.error("Informe um saldo válido"); return; }
    if (absDelta < 0.005) { toast.error("O saldo informado é igual ao atual"); return; }
    setSaving(true);
    try {
      await recordLedger({
        direction, category: "adjustment", amount: absDelta,
        description: description.trim() || "Ajuste manual de saldo",
        occurred_on: date, source: "manual", wallet,
      });
      toast.success("Ajuste registrado");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao registrar ajuste");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Ajustar saldo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Carteira</Label>
            <Select value={wallet} onValueChange={(v: any) => setWallet(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Conta</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <p className="text-muted-foreground">Saldo atual ({walletLabel(wallet)})</p>
            <p className="font-semibold">{formatBRL(currentBalance)}</p>
          </div>
          <div>
            <Label>Novo saldo (R$)</Label>
            <Input type="number" inputMode="decimal" step="0.01" value={targetBalance} onChange={(e) => setTargetBalance(e.target.value)} placeholder="0,00" autoFocus />
          </div>
          {validTarget && absDelta >= 0.005 && (
            <div className={`rounded-md px-3 py-2 text-sm ${direction === "in" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {direction === "in" ? "Entrada" : "Saída"} de {formatBRL(absDelta)} em {walletLabel(wallet)}
            </div>
          )}
          <div>
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ open, onOpenChange, balances, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; balances: { account: number; cash: number }; onSaved: () => void }) {
  const [from, setFrom] = useState<WalletType>("account");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInAppTz());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const to: WalletType = from === "account" ? "cash" : "account";
  const fromBalance = from === "cash" ? balances.cash : balances.account;
  const v = parseFloat(amount.replace(",", "."));

  useEffect(() => {
    if (open) {
      setFrom("account");
      setAmount("");
      setDate(todayInAppTz());
      setNote("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!v || v <= 0) { toast.error("Informe um valor válido"); return; }
    setSaving(true);
    try {
      await recordTransfer({ from, to, amount: v, occurred_on: date, description: note });
      toast.success("Transferência registrada");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao registrar transferência");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Transferir entre saldos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>De</Label>
            <Select value={from} onValueChange={(v: any) => setFrom(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Conta ({formatBRL(balances.account)})</SelectItem>
                <SelectItem value="cash">Dinheiro ({formatBRL(balances.cash)})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm flex items-center justify-center gap-2">
            <span className="font-medium">{walletLabel(from)}</span>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{walletLabel(to)}</span>
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus />
            {v > fromBalance && v > 0 && (
              <p className="text-xs text-warning mt-1">⚠ Valor maior que o saldo disponível em {walletLabel(from)} ({formatBRL(fromBalance)}). A transferência ficará negativa.</p>
            )}
          </div>
          <div>
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Observação (opcional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Transferência ${walletLabel(from)} → ${walletLabel(to)}`} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Transferir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditLedgerDialog({ entry, onOpenChange, onSaved }: { entry: LedgerEntry | null; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [direction, setDirection] = useState<LedgerDirection>("in");
  const [category, setCategory] = useState<LedgerCategory>("adjustment");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayInAppTz());
  const [wallet, setWallet] = useState<WalletType>("account");
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { methods } = usePaymentMethods();

  useEffect(() => {
    if (entry) {
      setDirection(entry.direction);
      setCategory(entry.category);
      setAmount(String(entry.amount));
      setDescription(entry.description ?? "");
      setDate(entry.occurred_on);
      setWallet((entry.wallet ?? "account") as WalletType);
      setPaymentMethodId(entry.payment_method_id ?? null);
    }
  }, [entry]);

  // Quando muda forma de pagamento, sincroniza carteira
  useEffect(() => {
    if (paymentMethodId) {
      const m = methods.find((x) => x.id === paymentMethodId);
      if (m) setWallet(m.kind);
    }
  }, [paymentMethodId, methods]);

  const handleSave = async () => {
    if (!entry) return;
    const v = parseFloat(amount.replace(",", "."));
    if (!v || v <= 0) { toast.error("Informe um valor válido"); return; }
    setSaving(true);
    try {
      await updateLedgerEntry(entry.id, {
        direction, category, amount: v,
        description: description.trim() || entry.description,
        occurred_on: date, wallet, payment_method_id: paymentMethodId,
      });
      toast.success("Lançamento atualizado");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao atualizar");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar lançamento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Entrada</SelectItem>
                <SelectItem value="out">Saída</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v: any) => setCategory(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Carteira</Label>
            <Select value={wallet} onValueChange={(v: any) => setWallet(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Conta</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <PaymentMethodPicker value={paymentMethodId} onChange={setPaymentMethodId} label="Forma de pagamento" />
          <div>
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
