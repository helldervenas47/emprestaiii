import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownRight, ArrowUpRight, Plus, Trash2, Wallet, ListFilter, RefreshCw } from "lucide-react";
import { listLedger, recordLedger, deleteLedgerEntry, recomputeBalanceFromLedger, type LedgerEntry, type LedgerCategory, type LedgerDirection } from "@/lib/ledger";
import { getBalance } from "@/lib/balance";
import { todayInAppTz } from "@/lib/timezone";
import { toast } from "sonner";

const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const categoryLabels: Record<LedgerCategory, string> = {
  loan: "Empréstimo",
  payment: "Pagamento",
  expense: "Despesa",
  adjustment: "Ajuste",
  aporte: "Aporte",
  sale: "Venda",
  initial: "Saldo inicial",
  other: "Outro",
};

interface Props {
  readOnly?: boolean;
}

export function LedgerView({ readOnly = false }: Props) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterDir, setFilterDir] = useState<"all" | LedgerDirection>("all");
  const [filterCat, setFilterCat] = useState<"all" | LedgerCategory>("all");
  const [adjustOpen, setAdjustOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [list, bal] = await Promise.all([listLedger(), getBalance()]);
    setEntries(list);
    setBalance(bal);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    return entries
      .filter((e) => {
        if (filterDir !== "all" && e.direction !== filterDir) return false;
        if (filterCat !== "all" && e.category !== filterCat) return false;
        return true;
      })
      .sort((a, b) => {
        // Data desc; empate pelo created_at desc
        if (a.occurred_on !== b.occurred_on) return b.occurred_on.localeCompare(a.occurred_on);
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
  }, [entries, filterDir, filterCat]);

  const totals = useMemo(() => {
    const totalIn = filtered.filter((e) => e.direction === "in").reduce((a, e) => a + Number(e.amount), 0);
    const totalOut = filtered.filter((e) => e.direction === "out").reduce((a, e) => a + Number(e.amount), 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [filtered]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este lançamento? O saldo será ajustado automaticamente.")) return;
    await deleteLedgerEntry(id);
    await reload();
    toast.success("Lançamento removido");
  };

  const handleRecompute = async () => {
    await recomputeBalanceFromLedger();
    await reload();
    toast.success("Saldo recalculado a partir do extrato");
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header com saldo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
        <Card no3d className="col-span-2 md:col-span-1">
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs text-muted-foreground">Saldo da conta</p>
              <p className={`text-base sm:text-xl font-bold truncate ${balance < 0 ? "text-destructive" : "text-foreground"}`}>{formatBRL(balance)}</p>
            </div>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
              <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs text-muted-foreground">Entradas</p>
              <p className="text-sm sm:text-xl font-bold text-success truncate">{formatBRL(totals.totalIn)}</p>
            </div>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs text-muted-foreground">Saídas</p>
              <p className="text-sm sm:text-xl font-bold text-destructive truncate">{formatBRL(totals.totalOut)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros + ações */}
      <div className="flex flex-wrap items-center gap-2">
        <ListFilter className="hidden sm:block h-4 w-4 text-muted-foreground" />
        <Select value={filterDir} onValueChange={(v: any) => setFilterDir(v)}>
          <SelectTrigger className="h-9 flex-1 min-w-[140px] sm:flex-none sm:w-[140px]"><SelectValue /></SelectTrigger>
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
            {Object.entries(categoryLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="hidden sm:block flex-1" />
        {!readOnly && (
          <>
            <Button variant="outline" size="sm" onClick={handleRecompute} className="flex-1 sm:flex-none" title="Recalcula o saldo somando todos os lançamentos">
              <RefreshCw className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Recalcular saldo</span><span className="sm:hidden ml-1">Recalcular</span>
            </Button>
            <Button size="sm" onClick={() => setAdjustOpen(true)} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Ajustar saldo</span><span className="sm:hidden ml-1">Ajustar</span>
            </Button>
          </>
        )}
      </div>

      {/* Lançamentos: tabela no desktop, cards no mobile */}
      {loading ? (
        <Card no3d><CardContent className="p-8 text-center text-muted-foreground">Carregando…</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card no3d><CardContent className="p-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</CardContent></Card>
      ) : (
        <>
          {/* Mobile: lista de cards */}
          <div className="sm:hidden space-y-2">
            {filtered.map((e) => (
              <Card no3d key={e.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground line-clamp-2">{e.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-muted-foreground">{e.occurred_on}</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{categoryLabels[e.category]}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className={`text-sm font-semibold whitespace-nowrap ${e.direction === "in" ? "text-success" : "text-destructive"}`}>
                        {e.direction === "in" ? "+" : "−"} {formatBRL(Number(e.amount))}
                      </span>
                      {!readOnly && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 mt-1" onClick={() => handleDelete(e.id)} title="Excluir lançamento">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: tabela */}
          <Card no3d className="hidden sm:block">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    {!readOnly && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-sm">{e.occurred_on}</TableCell>
                      <TableCell className="text-sm">{e.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{categoryLabels[e.category]}</Badge>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${e.direction === "in" ? "text-success" : "text-destructive"}`}>
                        {e.direction === "in" ? "+" : "−"} {formatBRL(Number(e.amount))}
                      </TableCell>
                      {!readOnly && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(e.id)} title="Excluir lançamento">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Diálogo Ajustar saldo */}
      <AdjustBalanceDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        onSaved={reload}
      />
    </div>
  );
}

function AdjustBalanceDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [direction, setDirection] = useState<LedgerDirection>("in");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Ajuste manual de saldo");
  const [date, setDate] = useState(todayInAppTz());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDirection("in");
      setAmount("");
      setDescription("Ajuste manual de saldo");
      setDate(todayInAppTz());
    }
  }, [open]);

  const handleSave = async () => {
    const v = parseFloat(amount.replace(",", "."));
    if (!v || v <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    setSaving(true);
    try {
      await recordLedger({
        direction,
        category: "adjustment",
        amount: v,
        description: description.trim() || "Ajuste manual de saldo",
        occurred_on: date,
        source: "manual",
      });
      toast.success("Ajuste registrado");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao registrar ajuste");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar saldo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Entrada (somar ao saldo)</SelectItem>
                <SelectItem value="out">Saída (subtrair do saldo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus />
          </div>
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
