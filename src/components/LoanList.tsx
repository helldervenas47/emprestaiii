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
  Search, Percent, Pencil, Check, X, ChevronDown, ChevronRight, FolderOpen, Folder, HandCoins,
} from "lucide-react";

interface Props {
  loans: Loan[];
  payments: Payment[];
  onPayment: (loanId: string) => void;
  onPartialPayment: (loanId: string, amount: number) => void;
  onInterestPayment: (loanId: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (loanId: string) => void;
}

type Category = "all" | "overdue" | "paid_interest" | "paid" | "due_today" | "on_track" | "folders";

const categoryConfig: { id: Category; label: string; color: string; activeColor: string }[] = [
  { id: "all", label: "Todos", color: "border-border text-muted-foreground", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "overdue", label: "Atrasados", color: "border-destructive/30 text-destructive", activeColor: "bg-destructive text-destructive-foreground border-destructive" },
  { id: "paid_interest", label: "Pagou Juros", color: "border-purple/30 text-purple", activeColor: "bg-purple text-purple-foreground border-purple" },
  { id: "paid", label: "Pagou Total", color: "border-success/30 text-success", activeColor: "bg-success text-success-foreground border-success" },
  { id: "due_today", label: "Vence Hoje", color: "border-warning/30 text-warning", activeColor: "bg-warning text-warning-foreground border-warning" },
  { id: "on_track", label: "Em Dia", color: "border-primary/30 text-primary", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "folders", label: "Pastas", color: "border-border text-muted-foreground", activeColor: "bg-primary text-primary-foreground border-primary" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getDaysOverdue(loan: Loan): number {
  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(loan.dueDate + "T00:00:00");
  const diff = Math.floor((todayNorm.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function getLoanCategory(loan: Loan, payments: Payment[]): "paid" | "paid_interest" | "overdue" | "due_today" | "on_track" {
  if (loan.status === "paid") return "paid";
  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const lastPayment = loanPayments.sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lastPayment && lastPayment.installmentNumber === 0) return "paid_interest";
  const days = getDaysOverdue(loan);
  if (days === 0) return "due_today";
  if (days > 0) return "overdue";
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

function getTotalPaid(loan: Loan, payments: Payment[]): number {
  return payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
}

function LoanCardView({
  loan, payments: allPayments, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete,
}: {
  loan: Loan;
  payments: Payment[];
  onPayment: () => void;
  onPartialPayment: (amount: number) => void;
  onInterestPayment: () => void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [expanded, setExpanded] = useState(false);

  const installment = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, allPayments);
  const remaining = Math.max(0, total - totalPaid);
  const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
  const interestOnly = loan.amount * (loan.interestRate / 100);
  const totalInterest = total - loan.amount;
  const profit = totalPaid - loan.amount;
  const category = getLoanCategory(loan, allPayments);
  const daysOverdue = getDaysOverdue(loan);
  const badge = statusMap[category];

  // Next installment due date
  const nextInstallmentDate = useMemo(() => {
    if (loan.status === "paid") return null;
    const start = new Date(loan.startDate + "T00:00:00");
    const nextNum = loan.paidInstallments + 1;
    if (nextNum > loan.installments) return null;
    const next = new Date(start.getFullYear(), start.getMonth() + nextNum, start.getDate());
    return next.toLocaleDateString("pt-BR");
  }, [loan]);

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

  const handlePartialSubmit = () => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      onPartialPayment(val);
      setPartialAmount("");
      setShowPartial(false);
    }
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
            <div><Label className="text-xs">Nome do Devedor</Label><Input value={form.borrowerName} onChange={(e) => update("borrowerName", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Valor (R$)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => update("amount", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Juros Mensal (%)</Label><Input type="number" step="0.1" value={form.interestRate} onChange={(e) => update("interestRate", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Parcelas</Label><Input type="number" value={form.installments} onChange={(e) => update("installments", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Parcelas Pagas</Label><Input type="number" value={form.paidInstallments} onChange={(e) => update("paidInstallments", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Data Início</Label><Input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Data Fim</Label><Input type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} className="h-8 text-sm" /></div>
          </div>
          <div><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} className="text-sm" /></div>
        </CardContent>
      </Card>
    );
  }

  const borderColor =
    category === "overdue" ? "border-l-destructive" :
    category === "due_today" ? "border-l-warning" :
    category === "paid" ? "border-l-success" :
    category === "paid_interest" ? "border-l-purple" :
    "border-l-primary";

  return (
    <Card className={`overflow-hidden hover:shadow-lg transition-all border-l-4 ${borderColor} h-full flex flex-col`}>
      {/* Header */}
      <div className="p-3 pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0 ${
              category === "overdue" ? "bg-destructive" :
              category === "due_today" ? "bg-warning" :
              category === "paid" ? "bg-success" :
              "gradient-primary"
            }`}>
              {loan.borrowerName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-foreground text-sm truncate">{loan.borrowerName}</h3>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                <Calendar className="h-2.5 w-2.5 shrink-0" />
                <span>{new Date(loan.startDate + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                <span>→</span>
                <span>{new Date(loan.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className={`${badge.className} text-[10px]`}>{badge.label}</Badge>
            {daysOverdue > 0 && loan.status !== "paid" && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                {daysOverdue}d
              </Badge>
            )}
          </div>
        </div>
      </div>

      <CardContent className="p-3 pt-2 flex-1 flex flex-col">
        {/* Main financial info */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          <div className="bg-muted/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Capital</p>
            <p className="text-xs font-bold text-foreground">{formatCurrency(loan.amount)}</p>
          </div>
          <div className="bg-muted/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Parcela</p>
            <p className="text-xs font-bold text-foreground">{formatCurrency(installment)}</p>
          </div>
          <div className="bg-muted/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Juros</p>
            <p className="text-xs font-bold text-accent">{loan.interestRate}%</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-2">
          <div className="flex justify-between text-[10px] mb-0.5">
            <span className="text-muted-foreground">{loan.paidInstallments}/{loan.installments} parcelas</span>
            <span className="font-medium text-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Received / Remaining */}
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <div className="flex items-center justify-between bg-success/5 rounded-md px-2 py-1.5">
            <span className="text-[10px] text-muted-foreground">Recebido</span>
            <span className="text-xs font-bold text-success">{formatCurrency(totalPaid)}</span>
          </div>
          <div className="flex items-center justify-between bg-destructive/5 rounded-md px-2 py-1.5">
            <span className="text-[10px] text-muted-foreground">Restante</span>
            <span className="text-xs font-bold text-destructive">{formatCurrency(remaining)}</span>
          </div>
        </div>

        {/* Next due + total */}
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {nextInstallmentDate && (
            <div className="bg-muted/30 rounded-md px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Próx. Parcela</p>
              <p className="text-xs font-semibold text-foreground">{nextInstallmentDate}</p>
            </div>
          )}
          <div className="bg-muted/30 rounded-md px-2 py-1.5">
            <p className="text-[9px] text-muted-foreground">Total c/ Juros</p>
            <p className="text-xs font-semibold text-foreground">{formatCurrency(total)}</p>
          </div>
        </div>

        {/* Expandable details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Mais detalhes
        </button>

        {expanded && (
          <div className="grid grid-cols-2 gap-1.5 mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="bg-muted/30 rounded-md px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Total Juros</p>
              <p className="text-xs font-semibold text-accent">{formatCurrency(totalInterest)}</p>
            </div>
            <div className="bg-muted/30 rounded-md px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Juros/Mês</p>
              <p className="text-xs font-semibold text-warning">{formatCurrency(interestOnly)}</p>
            </div>
            <div className="bg-muted/30 rounded-md px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Lucro Atual</p>
              <p className={`text-xs font-semibold ${profit >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(profit)}</p>
            </div>
            <div className="bg-muted/30 rounded-md px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground">Tipo</p>
              <p className="text-xs font-semibold text-foreground">{loan.paymentType}</p>
            </div>
          </div>
        )}

        {loan.notes && <p className="text-[10px] text-muted-foreground mb-2 italic bg-muted/30 rounded-md px-2 py-1.5">📝 {loan.notes}</p>}

        {/* Partial payment input */}
        {showPartial && (
          <div className="flex items-center gap-1.5 mb-2 p-2 rounded-md bg-muted">
            <Input
              type="number" step="0.01" placeholder="R$"
              value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
              className="h-7 text-xs flex-1" autoFocus
              onKeyDown={(e) => e.key === "Enter" && handlePartialSubmit()}
            />
            <Button size="sm" className="h-7 text-xs px-2" onClick={handlePartialSubmit}><Check className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setShowPartial(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        )}

        {/* Actions - pushed to bottom */}
        <div className="flex flex-wrap gap-1.5 justify-end pt-2 border-t mt-auto">
          {loan.status !== "paid" && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => setShowPartial(!showPartial)}>
                <HandCoins className="h-3 w-3 mr-0.5" /> Parcial
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={onInterestPayment}>
                <Percent className="h-3 w-3 mr-0.5" /> Juros
              </Button>
              <Button size="sm" className="h-7 text-[10px] px-2" onClick={onPayment}>
                <CheckCircle className="h-3 w-3 mr-0.5" /> Receber
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={startEdit} title="Editar">
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onDelete} title="Excluir">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LoanRowView({
  loan, payments: allPayments, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete,
}: {
  loan: Loan;
  payments: Payment[];
  onPayment: () => void;
  onPartialPayment: (amount: number) => void;
  onInterestPayment: () => void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");

  const installment = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, allPayments);
  const remaining = Math.max(0, total - totalPaid);
  const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
  const category = getLoanCategory(loan, allPayments);
  const daysOverdue = getDaysOverdue(loan);
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

  const handlePartialSubmit = () => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      onPartialPayment(val);
      setPartialAmount("");
      setShowPartial(false);
    }
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
    <div className="space-y-0">
      <div className={`flex items-center gap-4 px-4 py-3 bg-card rounded-lg border hover:shadow-sm transition-shadow ${category === "overdue" ? "border-destructive/30" : category === "due_today" ? "border-warning/30" : ""}`}>
        <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-[120px]">
          <p className="font-medium text-sm text-foreground truncate">{loan.borrowerName}</p>
          <p className="text-xs text-muted-foreground">
            Venc.: {new Date(loan.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}
            {daysOverdue > 0 && loan.status !== "paid" && (
              <span className="text-destructive ml-1">({daysOverdue}d atraso)</span>
            )}
          </p>
        </div>
        <div className="hidden sm:block min-w-[90px]">
          <p className="text-xs text-muted-foreground">Valor</p>
          <p className="text-sm font-semibold">{formatCurrency(loan.amount)}</p>
        </div>
        <div className="hidden md:block min-w-[90px]">
          <p className="text-xs text-muted-foreground">Total Pago</p>
          <p className="text-sm font-semibold text-success">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="hidden md:block min-w-[70px]">
          <p className="text-xs text-muted-foreground">Juros</p>
          <p className="text-sm font-semibold text-accent">{loan.interestRate}%</p>
        </div>
        <div className="hidden lg:block min-w-[90px]">
          <p className="text-xs text-muted-foreground">Restante</p>
          <p className="text-sm font-semibold">{formatCurrency(remaining)}</p>
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
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowPartial(!showPartial)} title="Pagamento Parcial">
                <HandCoins className="h-4 w-4 text-muted-foreground" />
              </Button>
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
      {showPartial && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-b-lg border border-t-0">
          <Input
            type="number" step="0.01" placeholder="Valor parcial (R$)"
            value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
            className="h-7 text-xs w-40" autoFocus
            onKeyDown={(e) => e.key === "Enter" && handlePartialSubmit()}
          />
          <Button size="sm" className="h-7 text-xs" onClick={handlePartialSubmit}><Check className="h-3.5 w-3.5 mr-1" />Confirmar</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowPartial(false)}><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );
}

// Client folder grouping
interface ClientGroup {
  name: string;
  loans: Loan[];
  totalAmount: number;
  totalPaid: number;
}

function ClientFolder({
  group, payments, view, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete,
}: {
  group: ClientGroup;
  payments: Payment[];
  view: "cards" | "rows";
  onPayment: (id: string) => void;
  onPartialPayment: (id: string, amount: number) => void;
  onInterestPayment: (id: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        {open ? <FolderOpen className="h-5 w-5 text-primary shrink-0" /> : <Folder className="h-5 w-5 text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{group.name}</h3>
            <Badge variant="outline" className="text-xs">{group.loans.length} contratos</Badge>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm shrink-0">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Emprestado</p>
            <p className="font-semibold">{formatCurrency(group.totalAmount)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Pago</p>
            <p className="font-semibold text-success">{formatCurrency(group.totalPaid)}</p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className={`p-3 space-y-${view === "cards" ? "3" : "2"}`}>
          {group.loans.map((loan) =>
            view === "cards" ? (
              <LoanCardView key={loan.id} loan={loan} payments={payments}
                onPayment={() => onPayment(loan.id)} onPartialPayment={(amt) => onPartialPayment(loan.id, amt)}
                onInterestPayment={() => onInterestPayment(loan.id)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} />
            ) : (
              <LoanRowView key={loan.id} loan={loan} payments={payments}
                onPayment={() => onPayment(loan.id)} onPartialPayment={(amt) => onPartialPayment(loan.id, amt)}
                onInterestPayment={() => onInterestPayment(loan.id)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} />
            )
          )}
        </div>
      )}
    </div>
  );
}

export function LoanList({ loans, payments, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete }: Props) {
  const [view, setView] = useState<"cards" | "rows">("cards");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");

  const categorized = useMemo(() => {
    const withSearch = loans.filter((l) => l.borrowerName.toLowerCase().includes(search.toLowerCase()));
    const filtered = category === "all" || category === "folders"
      ? withSearch
      : withSearch.filter((l) => getLoanCategory(l, payments) === category);
    // Sort by dueDate ascending (most urgent first)
    return [...filtered].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [loans, payments, search, category]);

  const folderCount = useMemo(() => {
    const byName: Record<string, number> = {};
    loans.forEach((l) => { byName[l.borrowerName] = (byName[l.borrowerName] || 0) + 1; });
    return Object.values(byName).filter((c) => c > 1).length;
  }, [loans]);

  const counts = useMemo(() => {
    const cats = loans.map((l) => getLoanCategory(l, payments));
    return {
      all: loans.length,
      overdue: cats.filter((c) => c === "overdue").length,
      paid_interest: cats.filter((c) => c === "paid_interest").length,
      paid: cats.filter((c) => c === "paid").length,
      due_today: cats.filter((c) => c === "due_today").length,
      on_track: cats.filter((c) => c === "on_track").length,
      folders: folderCount,
    };
  }, [loans, payments, folderCount]);

  // Group by borrower name
  const { grouped, singles } = useMemo(() => {
    const byName: Record<string, Loan[]> = {};
    categorized.forEach((l) => {
      (byName[l.borrowerName] ??= []).push(l);
    });
    const grouped: ClientGroup[] = [];
    const singles: Loan[] = [];
    Object.entries(byName).forEach(([name, loans]) => {
      if (loans.length > 1) {
        const totalPaid = loans.reduce((s, l) => s + getTotalPaid(l, payments), 0);
        grouped.push({ name, loans, totalAmount: loans.reduce((s, l) => s + l.amount, 0), totalPaid });
      } else {
        singles.push(loans[0]);
      }
    });
    grouped.sort((a, b) => a.name.localeCompare(b.name));
    return { grouped, singles };
  }, [categorized, payments]);

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
          <button key={cat.id} onClick={() => setCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              category === cat.id ? cat.activeColor : `bg-card ${cat.color} hover:opacity-80`
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
          <button onClick={() => setView("cards")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "cards" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />Cards
          </button>
          <button onClick={() => setView("rows")}
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
      ) : (
        <div>
          {view === "cards" ? (
            <>
              {/* Grouped folders (only in cards view) */}
              {grouped.length > 0 && (
                <div className="space-y-3 mb-4">
                  {grouped.map((g) => (
                    <ClientFolder key={g.name} group={g} payments={payments} view={view}
                      onPayment={onPayment} onPartialPayment={onPartialPayment}
                      onInterestPayment={onInterestPayment} onUpdate={onUpdate} onDelete={onDelete} />
                  ))}
                </div>
              )}
              {/* Single loans in 3-column grid */}
              {category !== "folders" && singles.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {singles.map((loan) => (
                    <LoanCardView key={loan.id} loan={loan} payments={payments}
                      onPayment={() => onPayment(loan.id)} onPartialPayment={(amt) => onPartialPayment(loan.id, amt)}
                      onInterestPayment={() => onInterestPayment(loan.id)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} />
                  ))}
                </div>
              )}
              {category === "folders" && grouped.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">Nenhum cliente com múltiplos empréstimos</p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            /* Rows view: all loans flat, no folders */
            categorized.map((loan) => (
              <LoanRowView key={loan.id} loan={loan} payments={payments}
                onPayment={() => onPayment(loan.id)} onPartialPayment={(amt) => onPartialPayment(loan.id, amt)}
                onInterestPayment={() => onInterestPayment(loan.id)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
