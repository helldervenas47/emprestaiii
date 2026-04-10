import { useState, useMemo } from "react";
import { Loan, Payment } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import {
  CheckCircle, Trash2, DollarSign, User, Calendar, LayoutGrid, List,
  Search, Percent, Pencil, Check, X,
} from "lucide-react";

interface Props {
  loans: Loan[];
  payments: Payment[];
  onPayment: (loanId: string) => void;
  onInterestPayment: (loanId: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (loanId: string) => void;
}

type Category = "all" | "overdue" | "paid_interest" | "paid" | "due_today" | "on_track";

const categoryConfig: { id: Category; label: string; color: string; activeColor: string }[] = [
  { id: "all", label: "Todos", color: "border-border text-muted-foreground", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "overdue", label: "Atrasados", color: "border-destructive/30 text-destructive", activeColor: "bg-destructive text-destructive-foreground border-destructive" },
  { id: "paid_interest", label: "Pagou Juros", color: "border-purple/30 text-purple", activeColor: "bg-purple text-purple-foreground border-purple" },
  { id: "paid", label: "Pagou Total", color: "border-success/30 text-success", activeColor: "bg-success text-success-foreground border-success" },
  { id: "due_today", label: "Vence Hoje", color: "border-warning/30 text-warning", activeColor: "bg-warning text-warning-foreground border-warning" },
  { id: "on_track", label: "Em Dia", color: "border-primary/30 text-primary", activeColor: "bg-primary text-primary-foreground border-primary" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getNextDueDate(loan: Loan): Date {
  const start = new Date(loan.startDate + "T00:00:00");
  start.setMonth(start.getMonth() + loan.paidInstallments + 1);
  return start;
}

function getLoanCategory(loan: Loan, payments: Payment[]): "paid" | "paid_interest" | "overdue" | "due_today" | "on_track" {
  if (loan.status === "paid") return "paid";
  
  // Check if the most recent payment was interest-only (installmentNumber === 0)
  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const lastPayment = loanPayments.sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lastPayment && lastPayment.installmentNumber === 0) return "paid_interest";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextDue = getNextDueDate(loan);
  const nextDueDay = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate());
  if (nextDueDay.getTime() === today.getTime()) return "due_today";
  if (nextDueDay < today) return "overdue";
  return "on_track";
}

const statusMap = {
  paid: { label: "Pagou Total", className: "bg-success/10 text-success border-success/20" },
  paid_interest: { label: "Pagou Juros", className: "bg-purple/10 text-purple border-purple/20" },
  overdue: { label: "Atrasado", className: "bg-destructive/10 text-destructive border-destructive/20" },
  due_today: { label: "Vence Hoje", className: "bg-warning/10 text-warning border-warning/20" },
  on_track: { label: "Em Dia", className: "bg-primary/10 text-primary border-primary/20" },
};

interface EditForm {
  borrowerName: string;
  amount: string;
  interestRate: string;
  installments: string;
  paidInstallments: string;
  startDate: string;
  dueDate: string;
  notes: string;
}

function loanToForm(loan: Loan): EditForm {
  return {
    borrowerName: loan.borrowerName,
    amount: String(loan.amount),
    interestRate: String(loan.interestRate),
    installments: String(loan.installments),
    paidInstallments: String(loan.paidInstallments),
    startDate: loan.startDate,
    dueDate: loan.dueDate,
    notes: loan.notes || "",
  };
}

function LoanCardView({
  loan, onPayment, onInterestPayment, onUpdate, onDelete,
}: {
  loan: Loan;
  onPayment: () => void;
  onInterestPayment: () => void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));

  const installment = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const paid = loan.paidInstallments * installment;
  const remaining = total - paid;
  const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
  const interestOnly = loan.amount * (loan.interestRate / 100);
  const category = getLoanCategory(loan);
  const nextDue = getNextDueDate(loan);
  const badge = statusMap[category];

  const startEdit = () => { setForm(loanToForm(loan)); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    onUpdate({
      borrowerName: form.borrowerName,
      amount: parseFloat(form.amount) || loan.amount,
      interestRate: parseFloat(form.interestRate) || loan.interestRate,
      installments: parseInt(form.installments) || loan.installments,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate || loan.startDate,
      dueDate: form.dueDate || loan.dueDate,
      notes: form.notes,
    });
    setEditing(false);
  };

  const update = (field: keyof EditForm, value: string) => setForm((p) => ({ ...p, [field]: value }));

  if (editing) {
    return (
      <Card className="overflow-hidden border-primary/30">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Editar Empréstimo</h3>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEdit}><Check className="h-4 w-4 text-success" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome do Devedor</Label>
              <Input value={form.borrowerName} onChange={(e) => update("borrowerName", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => update("amount", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Juros Mensal (%)</Label>
              <Input type="number" step="0.1" value={form.interestRate} onChange={(e) => update("interestRate", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Parcelas</Label>
              <Input type="number" value={form.installments} onChange={(e) => update("installments", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Parcelas Pagas</Label>
              <Input type="number" value={form.paidInstallments} onChange={(e) => update("paidInstallments", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Data Início</Label>
              <Input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Data Fim</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} className="text-sm" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow ${category === "overdue" ? "border-destructive/30" : category === "due_today" ? "border-warning/30" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center">
              <User className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{loan.borrowerName}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(loan.startDate).toLocaleDateString("pt-BR")}
                {loan.status !== "paid" && (
                  <span>→ Próx. venc.: {nextDue.toLocaleDateString("pt-BR")}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={startEdit} title="Editar">
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Valor</p>
            <p className="font-semibold">{formatCurrency(loan.amount)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Parcela</p>
            <p className="font-semibold">{formatCurrency(installment)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Juros</p>
            <p className="font-semibold text-accent">{loan.interestRate}% a.m.</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Restante</p>
            <p className="font-semibold">{formatCurrency(remaining > 0 ? remaining : 0)}</p>
          </div>
        </div>
        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{loan.paidInstallments}/{loan.installments} parcelas</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        {loan.notes && <p className="text-xs text-muted-foreground mb-3 italic">"{loan.notes}"</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          {loan.status !== "paid" && (
            <>
              <Button size="sm" variant="outline" onClick={onInterestPayment} title={`Pagar apenas juros: ${formatCurrency(interestOnly)}`}>
                <Percent className="h-4 w-4 mr-1" />
                Pagar Juros ({formatCurrency(interestOnly)})
              </Button>
              <Button size="sm" onClick={onPayment}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Receber Parcela
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LoanRowView({
  loan, onPayment, onInterestPayment, onUpdate, onDelete,
}: {
  loan: Loan;
  onPayment: () => void;
  onInterestPayment: () => void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));

  const installment = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const paid = loan.paidInstallments * installment;
  const remaining = total - paid;
  const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
  const category = getLoanCategory(loan);
  const badge = statusMap[category];

  const startEdit = () => { setForm(loanToForm(loan)); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    onUpdate({
      borrowerName: form.borrowerName,
      amount: parseFloat(form.amount) || loan.amount,
      interestRate: parseFloat(form.interestRate) || loan.interestRate,
      installments: parseInt(form.installments) || loan.installments,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate || loan.startDate,
      dueDate: form.dueDate || loan.dueDate,
      notes: form.notes,
    });
    setEditing(false);
  };

  const update = (field: keyof EditForm, value: string) => setForm((p) => ({ ...p, [field]: value }));

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-card rounded-lg border border-primary/30">
        <Input value={form.borrowerName} onChange={(e) => update("borrowerName", e.target.value)} className="h-7 w-28 text-xs" placeholder="Nome" />
        <Input type="number" value={form.amount} onChange={(e) => update("amount", e.target.value)} className="h-7 w-20 text-xs" placeholder="Valor" />
        <Input type="number" value={form.interestRate} onChange={(e) => update("interestRate", e.target.value)} className="h-7 w-16 text-xs" placeholder="Juros%" />
        <Input type="number" value={form.installments} onChange={(e) => update("installments", e.target.value)} className="h-7 w-14 text-xs" placeholder="Parc." />
        <Input type="number" value={form.paidInstallments} onChange={(e) => update("paidInstallments", e.target.value)} className="h-7 w-14 text-xs" placeholder="Pagas" />
        <Input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} className="h-7 w-32 text-xs" />
        <Input type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} className="h-7 w-32 text-xs" />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}><Check className="h-3.5 w-3.5 text-success" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}><X className="h-3.5 w-3.5 text-destructive" /></Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-4 px-4 py-3 bg-card rounded-lg border hover:shadow-sm transition-shadow ${category === "overdue" ? "border-destructive/30" : category === "due_today" ? "border-warning/30" : ""}`}>
      <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center shrink-0">
        <User className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="min-w-[120px]">
        <p className="font-medium text-sm text-foreground truncate">{loan.borrowerName}</p>
        <p className="text-xs text-muted-foreground">{new Date(loan.startDate).toLocaleDateString("pt-BR")}</p>
      </div>
      <div className="hidden sm:block min-w-[90px]">
        <p className="text-xs text-muted-foreground">Valor</p>
        <p className="text-sm font-semibold">{formatCurrency(loan.amount)}</p>
      </div>
      <div className="hidden md:block min-w-[90px]">
        <p className="text-xs text-muted-foreground">Parcela</p>
        <p className="text-sm font-semibold">{formatCurrency(installment)}</p>
      </div>
      <div className="hidden md:block min-w-[70px]">
        <p className="text-xs text-muted-foreground">Juros</p>
        <p className="text-sm font-semibold text-accent">{loan.interestRate}%</p>
      </div>
      <div className="hidden lg:block min-w-[90px]">
        <p className="text-xs text-muted-foreground">Restante</p>
        <p className="text-sm font-semibold">{formatCurrency(remaining > 0 ? remaining : 0)}</p>
      </div>
      <div className="hidden sm:flex flex-col min-w-[100px] gap-1">
        <span className="text-xs text-muted-foreground">{loan.paidInstallments}/{loan.installments}</span>
        <Progress value={progress} className="h-1.5" />
      </div>
      <Badge variant="outline" className={`${badge.className} shrink-0 text-xs`}>{badge.label}</Badge>
      <div className="flex gap-1 ml-auto shrink-0">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={startEdit} title="Editar">
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
        {loan.status !== "paid" && (
          <>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onInterestPayment} title="Pagar apenas juros">
              <Percent className="h-4 w-4 text-warning" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onPayment} title="Receber Parcela">
              <CheckCircle className="h-4 w-4 text-primary" />
            </Button>
          </>
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onDelete} title="Excluir">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function LoanList({ loans, onPayment, onInterestPayment, onUpdate, onDelete }: Props) {
  const [view, setView] = useState<"cards" | "rows">("cards");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");

  const categorized = useMemo(() => {
    const withSearch = loans.filter((l) => l.borrowerName.toLowerCase().includes(search.toLowerCase()));
    if (category === "all") return withSearch;
    if (category === "open") return withSearch.filter((l) => l.status !== "paid");
    const cat = withSearch.map((l) => ({ loan: l, cat: getLoanCategory(l) }));
    if (category === "overdue") return cat.filter((c) => c.cat === "overdue").map((c) => c.loan);
    if (category === "due_today") return cat.filter((c) => c.cat === "due_today").map((c) => c.loan);
    if (category === "on_track") return cat.filter((c) => c.cat === "on_track").map((c) => c.loan);
    return withSearch;
  }, [loans, search, category]);

  const counts = useMemo(() => {
    const active = loans.filter((l) => l.status !== "paid");
    const cats = active.map((l) => getLoanCategory(l));
    return {
      all: loans.length,
      open: active.length,
      overdue: cats.filter((c) => c === "overdue").length,
      due_today: cats.filter((c) => c === "due_today").length,
      on_track: cats.filter((c) => c === "on_track").length,
    };
  }, [loans]);

  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhum empréstimo cadastrado</p>
          <p className="text-sm text-muted-foreground/70">Clique em "Novo Empréstimo" para começar</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {categoryConfig.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              category === cat.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {cat.label} ({counts[cat.id]})
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome do cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setView("cards")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "cards" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />Caixas
          </button>
          <button
            onClick={() => setView("rows")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "rows" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />Linhas
          </button>
        </div>
      </div>

      {categorized.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum empréstimo encontrado nesta categoria</p>
          </CardContent>
        </Card>
      ) : view === "cards" ? (
        <div className="space-y-3">
          {categorized.map((loan) => (
            <LoanCardView key={loan.id} loan={loan} onPayment={() => onPayment(loan.id)} onInterestPayment={() => onInterestPayment(loan.id)} onUpdate={(data) => onUpdate(loan.id, data)} onDelete={() => onDelete(loan.id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {categorized.map((loan) => (
            <LoanRowView key={loan.id} loan={loan} onPayment={() => onPayment(loan.id)} onInterestPayment={() => onInterestPayment(loan.id)} onUpdate={(data) => onUpdate(loan.id, data)} onDelete={() => onDelete(loan.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
