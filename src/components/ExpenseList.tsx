import { useState, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Expense } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, Trash2, CheckCircle, Receipt, Calendar, Tag,
  CircleDollarSign, ChevronLeft, ChevronRight, Undo2,
} from "lucide-react";

interface Props {
  expenses: Expense[];
  onPay: (id: string) => void;
  onUnpay?: (id: string) => void;
  onDelete: (id: string) => void;
}

type Filter = "all" | "pending" | "paid" | "overdue";

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function isOverdue(expense: Expense): boolean {
  if (expense.paid) return false;
  const today = new Date().toISOString().split("T")[0];
  return expense.dueDate < today;
}

export function ExpenseList({ expenses, onPay, onUnpay, onDelete }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const monthFiltered = useMemo(() => {
    if (!selectedMonth) return expenses;
    return expenses.filter((e) => e.dueDate.startsWith(selectedMonth));
  }, [expenses, selectedMonth]);

  const filtered = monthFiltered
    .filter((e) => e.description.toLowerCase().includes(search.toLowerCase()) || e.category.toLowerCase().includes(search.toLowerCase()))
    .filter((e) => {
      if (filter === "pending") return !e.paid && !isOverdue(e);
      if (filter === "paid") return e.paid;
      if (filter === "overdue") return isOverdue(e);
      return true;
    })
    .sort((a, b) => {
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      return b.dueDate.localeCompare(a.dueDate);
    });

  const totalPending = monthFiltered.filter((e) => !e.paid).reduce((s, e) => s + e.amount, 0);
  const totalPaid = monthFiltered.filter((e) => e.paid).reduce((s, e) => s + e.amount, 0);
  const totalOverdue = monthFiltered.filter((e) => isOverdue(e)).reduce((s, e) => s + e.amount, 0);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: monthFiltered.length },
    { id: "pending", label: "Pendentes", count: monthFiltered.filter((e) => !e.paid && !isOverdue(e)).length },
    { id: "overdue", label: "Atrasadas", count: monthFiltered.filter((e) => isOverdue(e)).length },
    { id: "paid", label: "Pagas", count: monthFiltered.filter((e) => e.paid).length },
  ];

  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const prevMonth = () => {
    const d = new Date(selYear, selMonthNum - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(selYear, selMonthNum, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="animate-fade-in" style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}>
          <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center">
            <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center mb-2">
              <CircleDollarSign className="h-4 w-4 text-warning" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Pendente</p>
            <p className="text-sm sm:text-lg font-bold text-foreground mt-0.5">{formatCurrency(totalPending)}</p>
          </CardContent>
        </Card>
        <Card className="animate-fade-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
          <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center mb-2">
              <CircleDollarSign className="h-4 w-4 text-destructive" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Atrasado</p>
            <p className="text-sm sm:text-lg font-bold text-destructive mt-0.5">{formatCurrency(totalOverdue)}</p>
          </CardContent>
        </Card>
        <Card className="animate-fade-in" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }}>
          <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center">
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center mb-2">
              <CheckCircle className="h-4 w-4 text-success" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Pago</p>
            <p className="text-sm sm:text-lg font-bold text-success mt-0.5">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Month filter */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          className="text-sm font-medium text-foreground min-w-[140px] text-center capitalize hover:text-primary transition-colors"
          onClick={() => {
            const n = new Date();
            setSelectedMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          {format(new Date(selYear, selMonthNum - 1, 1), "MMMM yyyy", { locale: ptBR })}
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar despesa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="grid grid-cols-2 sm:flex gap-1">
          {filters.map((f) => (
            <Button
              key={f.id}
              variant="outline"
              size="sm"
              onClick={() => setFilter(f.id)}
              className={`rounded-xl transition-all duration-200 ${filter === f.id ? "bg-primary text-primary-foreground border-primary" : ""}`}
            >
              {f.label} ({f.count})
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">
              {expenses.length === 0 ? "Nenhuma despesa cadastrada" : "Nenhuma despesa encontrada"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((expense, i) => {
            const overdue = isOverdue(expense);
            return (
              <div key={expense.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}>
              <Card
                className={`transition-all duration-300 hover:shadow-[0_8px_24px_-6px_hsl(0_0%_0%/0.15)] hover:-translate-y-0.5 ${
                  expense.paid ? "opacity-60" : overdue ? "border-destructive/30" : ""
                }`}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                    <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center shrink-0 ${
                      expense.paid ? "bg-success/10" : overdue ? "bg-destructive/10" : "bg-warning/10"
                    }`}>
                      <Receipt className={`h-4 w-4 sm:h-5 sm:w-5 ${
                        expense.paid ? "text-success" : overdue ? "text-destructive" : "text-warning"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-sm truncate">{expense.description}</h3>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                          {expense.type === "fixa" ? "Fixa" : "Recorrente"}
                        </Badge>
                        {expense.type === "recorrente" && expense.installments && expense.installments > 1 && !expense.paid && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                            {expense.paidInstallments || 0}/{expense.installments} parcelas
                          </Badge>
                        )}
                        {expense.paid && (
                          <Badge className="bg-success/10 text-success border-success/20 text-[10px] px-1.5 py-0 shrink-0">Paga</Badge>
                        )}
                        {overdue && (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] px-1.5 py-0 shrink-0">Atrasada</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{expense.category}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(expense.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}
                        </span>
                        {expense.paidDate && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Pago: {new Date(expense.paidDate + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                      {expense.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{expense.notes}"</p>}
                      {expense.type === "recorrente" && expense.installments && expense.installments > 1 && (
                        <p className="text-xs text-muted-foreground">{formatCurrency(expense.amount / expense.installments)}/parcela</p>
                      )}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
                        <p className="text-base sm:text-lg font-bold text-foreground">{formatCurrency(expense.amount)}</p>
                        <div className="flex items-center gap-1">
                          {!expense.paid && (
                            <Button size="sm" variant="outline" className="text-success border-success/30 hover:bg-success hover:text-success-foreground h-7 text-xs" onClick={() => onPay(expense.id)}>
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />
                              {expense.type === "recorrente" && expense.installments && expense.installments > 1 ? "Pagar Parcela" : "Pagar"}
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDelete(expense.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
