import { useState, useCallback, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Expense } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Trash2, CheckCircle, Receipt, Calendar, Tag,
  CircleDollarSign, ChevronLeft, ChevronRight, Undo2, Pencil, Check,
} from "lucide-react";

const categories = [
  "Aluguel", "Energia", "Água", "Internet", "Telefone",
  "Alimentação", "Transporte", "Salários", "Impostos", "Outros",
];

interface Props {
  expenses: Expense[];
  onPay: (id: string) => void;
  onUnpay?: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  readOnly?: boolean;
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

function ExpenseEditDialog({ expense, open, onOpenChange, onSave, formatCurrency }: {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  formatCurrency: (v: number) => string;
}) {
  const isRecorrente = expense.type === "recorrente" && expense.installments && expense.installments > 1;
  const installmentVal = isRecorrente ? expense.amount / expense.installments! : expense.amount;
  const [form, setForm] = useState({
    description: expense.description,
    amount: String(installmentVal),
    type: expense.type as "fixa" | "recorrente",
    category: expense.category,
    installments: String(expense.installments || 1),
    dueDate: expense.dueDate,
    notes: expense.notes || "",
  });

  useEffect(() => {
    if (open) {
      const isRec = expense.type === "recorrente" && expense.installments && expense.installments > 1;
      const instVal = isRec ? expense.amount / expense.installments! : expense.amount;
      setForm({
        description: expense.description,
        amount: String(instVal),
        type: expense.type as "fixa" | "recorrente",
        category: expense.category,
        installments: String(expense.installments || 1),
        dueDate: expense.dueDate,
        notes: expense.notes || "",
      });
    }
  }, [open, expense]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(form.amount) || 0;
    const installments = form.type === "recorrente" ? parseInt(form.installments) || 1 : 1;
    const totalAmount = form.type === "recorrente" ? parsedAmount * installments : parsedAmount;
    onSave({
      description: form.description,
      amount: totalAmount,
      type: form.type,
      category: form.category,
      installments: form.type === "recorrente" ? installments : undefined,
      dueDate: form.dueDate,
      notes: form.notes || undefined,
    });
  };

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Despesa</DialogTitle>
          <DialogDescription>Altere os dados da despesa.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-desc">Descrição</Label>
            <Input id="edit-desc" value={form.description} onChange={e => update("description", e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-amount">{form.type === "recorrente" ? "Valor da Parcela (R$)" : "Valor (R$)"}</Label>
              <Input id="edit-amount" type="number" step="0.01" value={form.amount} onChange={e => update("amount", e.target.value)} required />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => update("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixa">Fixa</SelectItem>
                  <SelectItem value="recorrente">Recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.type === "recorrente" && (
            <div>
              <Label htmlFor="edit-inst">Parcelas</Label>
              <Input id="edit-inst" type="number" min="1" value={form.installments} onChange={e => update("installments", e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => update("category", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-due">Data de Pagamento</Label>
              <DatePickerField id="edit-due" value={form.dueDate} onChange={(v) => update("dueDate", v)} />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-notes">Observações</Label>
            <Textarea id="edit-notes" value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} />
          </div>
          {parseFloat(form.amount) > 0 && form.type === "recorrente" && parseInt(form.installments) > 1 && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                Valor total: <span className="font-semibold text-foreground">
                  {formatCurrency(parseFloat(form.amount) * (parseInt(form.installments) || 1))}
                </span> ({form.installments}x de {formatCurrency(parseFloat(form.amount))})
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseList({ expenses, onPay, onUnpay, onDelete, onUpdate, readOnly = false }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [viewPaymentsExpenseId, setViewPaymentsExpenseId] = useState<string | null>(null);
  const [showClearPayments, setShowClearPayments] = useState(false);

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

  const hasPaidExpenses = expenses.some(e => e.paid || (e.paidInstallments && e.paidInstallments > 0));

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

      {/* Search + filters + clear payments */}
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

      {!readOnly && hasPaidExpenses && onUpdate && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1"
            onClick={() => setShowClearPayments(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpar Pagamentos
          </Button>
        </div>
      )}

      {/* Dialog limpar pagamentos */}
      <Dialog open={showClearPayments} onOpenChange={setShowClearPayments}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Limpar Pagamentos</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja limpar todos os dados de pagamento das despesas? As despesas serão mantidas, mas marcadas como não pagas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearPayments(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => {
              expenses.forEach(exp => {
                if (exp.paid || (exp.paidInstallments && exp.paidInstallments > 0)) {
                  onUpdate!(exp.id, { paid: false, paidDate: undefined, paidInstallments: 0 });
                }
              });
              setShowClearPayments(false);
            }}>
              <Trash2 className="h-4 w-4 mr-1" />
              Limpar Pagamentos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            const hasPaidSomething = expense.paid || (expense.paidInstallments && expense.paidInstallments > 0);
            const isRecorrente = expense.type === "recorrente" && expense.installments && expense.installments > 1;
            const installmentAmount = isRecorrente ? expense.amount / expense.installments! : expense.amount;

            return (
              <div key={expense.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}>
              <Card
                className={`transition-all duration-400 ease-out hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] ${
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
                        {isRecorrente && !expense.paid && (
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
                      {isRecorrente && (
                        <p className="text-xs text-muted-foreground">{formatCurrency(installmentAmount)}/parcela</p>
                      )}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
                        <p className="text-base sm:text-lg font-bold text-foreground">{formatCurrency(expense.amount)}</p>
                        <div className="flex items-center gap-1">
                          {hasPaidSomething && onUpdate && (
                            <Button size="sm" variant="outline" onClick={() => setViewPaymentsExpenseId(expense.id)} className="h-7 text-xs">
                              <Receipt className="h-3.5 w-3.5 mr-1" />
                              Pagamentos
                            </Button>
                          )}
                          {!readOnly && !expense.paid && (
                            <Button size="sm" variant="outline" className="text-success border-success/30 hover:bg-success hover:text-success-foreground h-7 text-xs" onClick={() => onPay(expense.id)}>
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />
                              Pagar
                            </Button>
                          )}
                          {!readOnly && onUpdate && (
                            <Button size="sm" variant="ghost" onClick={() => setEditingExpenseId(expense.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!readOnly && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDelete(expense.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>

                {/* Dialog de pagamentos */}
                <Dialog open={viewPaymentsExpenseId === expense.id} onOpenChange={(open) => { if (!open) setViewPaymentsExpenseId(null); }}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Pagamentos - {expense.description}</DialogTitle>
                      <DialogDescription>Gerencie os pagamentos desta despesa.</DialogDescription>
                    </DialogHeader>
                    <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                      {isRecorrente ? (
                        Array.from({ length: expense.paidInstallments || 0 }, (_, idx) => (
                          <div key={idx} className="flex items-center gap-3 py-3">
                            <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                              {idx + 1}ª
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{formatCurrency(installmentAmount)}</p>
                              <p className="text-xs text-muted-foreground">Parcela {idx + 1} de {expense.installments}</p>
                            </div>
                            <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                            {!readOnly && onUpdate && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => {
                                  const newPaid = idx;
                                  onUpdate(expense.id, { paidInstallments: newPaid, paid: false, paidDate: undefined });
                                  if (newPaid === 0) setViewPaymentsExpenseId(null);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))
                      ) : (
                        expense.paid && (
                          <div className="flex items-center gap-3 py-3">
                            <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                              <Check className="h-4 w-4" />
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{formatCurrency(expense.amount)}</p>
                              {expense.paidDate && <p className="text-xs text-muted-foreground">{new Date(expense.paidDate + "T00:00:00").toLocaleDateString("pt-BR")}</p>}
                            </div>
                            <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                            {!readOnly && onUpdate && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => {
                                  onUpdate(expense.id, { paid: false, paidDate: undefined, paidInstallments: 0 });
                                  setViewPaymentsExpenseId(null);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )
                      )}
                      {(!isRecorrente && !expense.paid && !(expense.paidInstallments && expense.paidInstallments > 0)) && (
                        <div className="py-4 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Dialog de edição */}
                {onUpdate && (
                  <ExpenseEditDialog
                    expense={expense}
                    open={editingExpenseId === expense.id}
                    onOpenChange={(open) => { if (!open) setEditingExpenseId(null); }}
                    onSave={(data) => {
                      onUpdate(expense.id, data);
                      setEditingExpenseId(null);
                    }}
                    formatCurrency={formatCurrency}
                  />
                )}
              </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
