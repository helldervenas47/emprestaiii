import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, History, Filter, X, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { Expense, Sale } from "@/types/loan";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { VehicleInfo } from "@/hooks/useVehicleRegistry";

interface PaymentEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  vehicle: string;
  amount: number;
  paymentMethodId?: string | null;
  paymentMethodName?: string;
  notes?: string;
  kind: "pagamento" | "recebimento";
}

interface Props {
  sales: Sale[];
  allVehicleExpenses: Expense[];
  registeredVehicles: VehicleInfo[];
  formatCurrency: (v: number) => string;
}

const parseDate = (s?: string | null) => (s ? new Date(s + "T00:00:00") : null);
const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

function detectVehicle(text: string, vehicles: VehicleInfo[]) {
  if (!text) return "";
  const t = text.toLowerCase();
  for (const v of vehicles) {
    if (v.placa && t.includes(v.placa.toLowerCase())) return `${v.marcaModelo} (${v.placa})`;
    if (v.marcaModelo && t.includes(v.marcaModelo.toLowerCase())) return `${v.marcaModelo}${v.placa ? ` (${v.placa})` : ""}`;
  }
  return "";
}

type SortKey = "date" | "amount" | "description" | "category" | "vehicle";

export function VehiclePaymentHistoryView({
  sales,
  allVehicleExpenses,
  registeredVehicles,
  formatCurrency,
}: Props) {
  const { methods } = usePaymentMethods();
  const methodName = (id?: string | null) => methods.find((m) => m.id === id)?.name || "—";

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [monthFilter, setMonthFilter] = useState("__all__"); // "YYYY-MM" or "__all__"
  const [vehicleFilter, setVehicleFilter] = useState("__all__");
  const [categoryFilter, setCategoryFilter] = useState("__all__");
  const [methodFilter, setMethodFilter] = useState("__all__");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Build unified list of payments
  const payments = useMemo<PaymentEntry[]>(() => {
    const items: PaymentEntry[] = [];

    // 1) Vehicle expenses — only rows explicitly marked as paid.
    // Recurring parents are skipped: each installment is stored as a child
    // expense row with its own `paid` flag, so relying on `exp.paid` avoids
    // duplicates and prevents unpaid installments from leaking in via a
    // stale `paidInstallments` counter.
    for (const exp of allVehicleExpenses) {
      if (!exp.paid) continue;
      const vehicle = detectVehicle(`${exp.description} ${exp.notes ?? ""}`, registeredVehicles);
      items.push({
        id: exp.id,
        date: exp.paidDate || exp.dueDate,
        description: exp.description,
        category: exp.category,
        vehicle,
        amount: exp.amount,
        paymentMethodId: exp.paymentMethodId,
        paymentMethodName: methodName(exp.paymentMethodId),
        notes: exp.notes,
        kind: "pagamento",
      });
    }

    // 2) Vehicle rental sales — payment history (each entry = actual receipt).
    for (const s of sales) {
      if (s.businessType !== "aluguel_veiculo") continue;
      const vehicle = detectVehicle(`${s.description ?? ""} ${s.productName ?? ""} ${s.notes ?? ""}`, registeredVehicles);
      const history = s.paymentHistory ?? [];
      for (let i = 0; i < history.length; i++) {
        const p = history[i];
        const amt = Number(p.amount) || 0;
        if (amt <= 0) continue;
        items.push({
          id: `${s.id}-pay-${i}`,
          date: p.date,
          description: `${s.productName || s.description || "Aluguel"} — ${s.customerName}`,
          category: s.category || "Aluguel de Veículo",
          vehicle,
          amount: amt,
          paymentMethodId: p.paymentMethodId,
          paymentMethodName: methodName(p.paymentMethodId),
          notes: p.notes ?? undefined,
          kind: "recebimento",
        });
      }
    }

    return items;
  }, [allVehicleExpenses, sales, registeredVehicles, methods]);

  // Filter options
  const vehicleOptions = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => p.vehicle && set.add(p.vehicle));
    return Array.from(set).sort();
  }, [payments]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [payments]);

  const methodOptions = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => p.paymentMethodName && set.add(p.paymentMethodName));
    return Array.from(set).sort();
  }, [payments]);

  const filtered = useMemo(() => {
    const from = dateFrom ? parseDate(dateFrom) : null;
    const to = dateTo ? parseDate(dateTo) : null;
    let list = payments.filter((p) => {
      const d = parseDate(p.date);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (vehicleFilter !== "__all__" && p.vehicle !== vehicleFilter) return false;
      if (categoryFilter !== "__all__" && p.category !== categoryFilter) return false;
      if (methodFilter !== "__all__" && p.paymentMethodName !== methodFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "amount": cmp = a.amount - b.amount; break;
        case "description": cmp = a.description.localeCompare(b.description); break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "vehicle": cmp = a.vehicle.localeCompare(b.vehicle); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [payments, dateFrom, dateTo, vehicleFilter, categoryFilter, methodFilter, sortKey, sortDir]);

  const total = filtered.reduce((s, p) => s + p.amount, 0);
  const count = filtered.length;
  const avg = count > 0 ? total / count : 0;

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "date" ? "desc" : "asc"); }
  };

  const clearFilters = () => {
    setDateFrom(""); setDateTo("");
    setVehicleFilter("__all__"); setCategoryFilter("__all__"); setMethodFilter("__all__");
  };

  const hasFilters = dateFrom || dateTo || vehicleFilter !== "__all__" || categoryFilter !== "__all__" || methodFilter !== "__all__";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <History className="h-5 w-5" />
          Histórico de Pagamentos
        </h3>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 auto-rows-fr">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total pago no período</p>
            <p className="text-lg font-bold text-success mt-1">{formatCurrency(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Quantidade</p>
            <p className="text-lg font-bold mt-1">{count}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Média por pagamento</p>
            <p className="text-lg font-bold text-primary mt-1">{formatCurrency(avg)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Filter className="h-4 w-4" /> Filtros
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                <X className="h-3.5 w-3.5 mr-1" /> Limpar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Veículo</Label>
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {vehicleOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Forma de pagamento</Label>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {methodOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum pagamento encontrado.</p>
        </div>
      ) : (
        <>
          {/* Table for md+ */}
          <div className="hidden md:block rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("date")}>
                      Data <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("description")}>
                      Descrição <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("category")}>
                      Categoria <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("vehicle")}>
                      Veículo <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center gap-1 ml-auto hover:text-foreground" onClick={() => toggleSort("amount")}>
                      Valor <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDate(p.date)}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant={p.kind === "recebimento" ? "default" : "secondary"} className="text-[10px]">
                          {p.kind === "recebimento" ? "Recebimento" : "Pagamento"}
                        </Badge>
                        <span className="truncate max-w-[280px]">{p.description}</span>
                      </div>
                      {p.notes && <p className="text-xs text-muted-foreground truncate max-w-[320px]">{p.notes}</p>}
                    </TableCell>
                    <TableCell className="text-sm">{p.category}</TableCell>
                    <TableCell className="text-sm">{p.vehicle || "—"}</TableCell>
                    <TableCell className="text-sm">{p.paymentMethodName || "—"}</TableCell>
                    <TableCell className={`text-right font-semibold text-sm ${p.kind === "recebimento" ? "text-success" : "text-foreground"}`}>
                      {formatCurrency(p.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Cards for mobile */}
          <div className="md:hidden grid gap-3">
            {filtered.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={p.kind === "recebimento" ? "default" : "secondary"} className="text-[10px]">
                          {p.kind === "recebimento" ? "Recebimento" : "Pagamento"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{fmtDate(p.date)}</span>
                      </div>
                      <p className="font-medium text-sm truncate">{p.description}</p>
                    </div>
                    <p className={`font-bold text-sm shrink-0 ${p.kind === "recebimento" ? "text-success" : "text-foreground"}`}>
                      {formatCurrency(p.amount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-2 border-t border-border/40">
                    <span>{p.category}</span>
                    {p.vehicle && <span>{p.vehicle}</span>}
                    {p.paymentMethodName && p.paymentMethodName !== "—" && <span>{p.paymentMethodName}</span>}
                  </div>
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
