import { useState, useCallback } from "react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Expense } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, Trash2, CheckCircle, Receipt, Calendar, Tag,
  CircleDollarSign,
} from "lucide-react";

interface Props {
  expenses: Expense[];
  onPay: (id: string) => void;
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

export function ExpenseList({ expenses, onPay, onDelete }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = expenses
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

  const totalPending = expenses.filter((e) => !e.paid).reduce((s, e) => s + e.amount, 0);
  const totalPaid = expenses.filter((e) => e.paid).reduce((s, e) => s + e.amount, 0);
  const totalOverdue = expenses.filter((e) => isOverdue(e)).reduce((s, e) => s + e.amount, 0);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: expenses.length },
    { id: "pending", label: "Pendentes", count: expenses.filter((e) => !e.paid && !isOverdue(e)).length },
    { id: "overdue", label: "Atrasadas", count: expenses.filter((e) => isOverdue(e)).length },
    { id: "paid", label: "Pagas", count: expenses.filter((e) => e.paid).length },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="animate-fade-in" style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
              <CircleDollarSign className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendente</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalPending)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <CircleDollarSign className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Atrasado</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency(totalOverdue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pago</p>
              <p className="text-lg font-bold text-success">{formatCurrency(totalPaid)}</p>
            </div>
          </CardContent>
        </Card>
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
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                    expense.paid ? "bg-success/10" : overdue ? "bg-destructive/10" : "bg-warning/10"
                  }`}>
                    <Receipt className={`h-5 w-5 ${
                      expense.paid ? "text-success" : overdue ? "text-destructive" : "text-warning"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">{expense.description}</h3>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {expense.type === "fixa" ? "Fixa" : "Recorrente"}
                      </Badge>
                      {expense.type === "recorrente" && expense.installments && expense.installments > 1 && !expense.paid && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {expense.paidInstallments || 0}/{expense.installments} parcelas
                        </Badge>
                      )}
                      {expense.paid && (
                        <Badge className="bg-success/10 text-success border-success/20 text-xs shrink-0">Paga</Badge>
                      )}
                      {overdue && (
                        <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-xs shrink-0">Atrasada</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{expense.category}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Vence: {new Date(expense.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}
                      </span>
                      {expense.paidDate && (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Pago: {new Date(expense.paidDate + "T00:00:00").toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                    {expense.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{expense.notes}"</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-foreground">{formatCurrency(expense.amount)}</p>
                    {expense.type === "recorrente" && expense.installments && expense.installments > 1 && (
                      <p className="text-xs text-muted-foreground">{formatCurrency(expense.amount / expense.installments)}/parcela</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!expense.paid && (
                      <Button size="sm" variant="outline" className="text-success border-success/30 hover:bg-success hover:text-success-foreground" onClick={() => onPay(expense.id)}>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {expense.type === "recorrente" && expense.installments && expense.installments > 1 ? "Pagar Parcela" : "Pagar"}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDelete(expense.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
