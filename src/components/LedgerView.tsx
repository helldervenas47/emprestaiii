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
    return entries.filter((e) => {
      if (filterDir !== "all" && e.direction !== filterDir) return false;
      if (filterCat !== "all" && e.category !== filterCat) return false;
      return true;
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
    <div className="space-y-4">
      {/* Header com saldo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card no3d>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo da conta</p>
              <p className={`text-xl font-bold ${balance < 0 ? "text-destructive" : "text-foreground"}`}>{formatBRL(balance)}</p>
            </div>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
              <ArrowUpRight className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Entradas (filtro)</p>
              <p className="text-xl font-bold text-success">{formatBRL(totals.totalIn)}</p>
            </div>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <ArrowDownRight className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saídas (filtro)</p>
              <p className="text-xl font-bold text-destructive">{formatBRL(totals.totalOut)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros + ações */}
      <div className="flex flex-wrap items-center gap-2">
        <ListFilter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterDir} onValueChange={(v: any) => setFilterDir(v)}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="in">Entradas</SelectItem>
            <SelectItem value="out">Saídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCat} onValueChange={(v: any) => setFilterCat(v)}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {Object.entries(categoryLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {!readOnly && (
          <>
            <Button variant="outline" size="sm" onClick={handleRecompute} title="Recalcula o saldo somando todos os lançamentos">
              <RefreshCw className="h-4 w-4 mr-1" /> Recalcular saldo
            </Button>
            <Button size="sm" onClick={() => setAdjustOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Ajustar saldo
            </Button>
          </>
        )}
      </div>

      {/* Tabela */}
      <Card no3d>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum lançamento encontrado.</div>
          ) : (
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
          )}
        </CardContent>
      </Card>

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
