import { useState, useMemo } from "react";
import { Loan, Payment } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import {
  CheckCircle, Trash2, DollarSign, User, Calendar as CalendarIcon, LayoutGrid, List,
  Search, Percent, Pencil, Check, X, ChevronDown, ChevronRight, FolderOpen, Folder, HandCoins, Tag,
} from "lucide-react";

interface Props {
  loans: Loan[];
  payments: Payment[];
  onPayment: (loanId: string, paymentDate?: string) => void;
  onPartialPayment: (loanId: string, amount: number, paymentDate?: string) => void;
  onInterestPayment: (loanId: string, paymentDate?: string) => void;
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
  tags: string;
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
    tags: (loan.tags || []).join(", "),
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
  onPayment: (date?: string) => void;
  onPartialPayment: (amount: number, date?: string) => void;
  onInterestPayment: (date?: string) => void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [_expanded, _setExpanded] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<{ type: "installment" | "interest" | "partial"; amount?: number } | null>(null);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());

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

  // Next installment due date = due date (end of contract)
  const nextInstallmentDate = useMemo(() => {
    if (loan.status === "paid") return null;
    if (loan.paidInstallments >= loan.installments) return null;
    const due = new Date(loan.dueDate + "T00:00:00");
    return due.toLocaleDateString("pt-BR");
  }, [loan]);

  const startEdit = () => { setForm(loanToForm(loan)); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    const parsedTags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    onUpdate({
      borrowerName: form.borrowerName,
      amount: parseFloat(form.amount) || loan.amount,
      interestRate: parseFloat(form.interestRate) || loan.interestRate,
      installments: parseInt(form.installments) || loan.installments,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate || loan.startDate,
      dueDate: form.dueDate || loan.dueDate,
      notes: form.notes,
      tags: parsedTags,
    });
    setEditing(false);
  };

  const openPaymentDialog = (type: "installment" | "interest" | "partial", amount?: number) => {
    setPaymentDate(new Date());
    setPaymentDialog({ type, amount });
  };

  const confirmPayment = () => {
    if (!paymentDialog) return;
    const dateStr = paymentDate.toISOString().split("T")[0];
    if (paymentDialog.type === "installment") onPayment(dateStr);
    else if (paymentDialog.type === "interest") onInterestPayment(dateStr);
    else if (paymentDialog.type === "partial" && paymentDialog.amount) onPartialPayment(paymentDialog.amount, dateStr);
    setPaymentDialog(null);
  };

  const handlePartialSubmit = () => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      openPaymentDialog("partial", val);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs">Etiquetas (separar por vírgula)</Label><Input value={form.tags} onChange={(e) => update("tags", e.target.value)} className="h-8 text-sm" placeholder="Ex: VIP, Renovação, Garantia" /></div>
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

  const realizedProfit = Math.max(0, totalPaid - loan.amount);
  const realizedProfitPct = loan.amount > 0 ? Math.round((realizedProfit / loan.amount) * 100) : 0;

  return (
    <>
    <Card className="overflow-hidden hover:shadow-lg transition-all h-full flex flex-col border-border/50">
      {/* Client Name Header */}
      <div className="border-b border-border/50 px-4 py-3 text-center">
        <h3 className="font-bold text-foreground text-lg">{loan.borrowerName}</h3>
      </div>

      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        {/* Avatar + Badges + Actions Row */}
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 ${
            category === "overdue" ? "bg-destructive" :
            category === "due_today" ? "bg-warning" :
            category === "paid" ? "bg-success" :
            "gradient-primary"
          }`}>
            {loan.borrowerName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={`${badge.className} text-xs font-semibold`}>{badge.label}</Badge>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 uppercase">
              {loan.interestType}
            </Badge>
            {daysOverdue > 0 && loan.status !== "paid" && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                {daysOverdue}d atraso
              </Badge>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {loan.tags && loan.tags.length > 0 && loan.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="bg-accent/10 text-accent border-accent/20 text-xs">
                <Tag className="h-2.5 w-2.5 mr-0.5" />{tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Large remaining amount */}
        <div className="text-center py-2">
          <p className={`text-3xl font-bold ${remaining > 0 ? "text-primary" : "text-success"}`}>
            {formatCurrency(remaining)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">restante a receber</p>
        </div>

        {/* Emprestado / Total a Receber */}
        <div className="grid grid-cols-2 gap-3 border border-border/50 rounded-lg p-3">
          <div>
            <p className="text-xs text-muted-foreground">Emprestado</p>
            <p className="text-base font-bold text-foreground">{formatCurrency(loan.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total a Receber</p>
            <p className="text-base font-bold text-foreground">{formatCurrency(total)}</p>
          </div>
        </div>

        {/* Lucro Previsto / Lucro Realizado */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">💰 Lucro Previsto</p>
            <p className="text-sm font-bold text-success">{formatCurrency(totalInterest)}</p>
          </div>
          <div className="bg-muted/30 border border-border/50 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">✅ Lucro Realizado</p>
            <p className="text-sm font-bold text-foreground">
              {formatCurrency(realizedProfit)} <span className="text-xs text-muted-foreground">{realizedProfitPct}%</span>
            </p>
          </div>
        </div>

        {/* Vencimento / Pago */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Venc:</p>
              <p className="text-sm font-semibold text-foreground">{new Date(loan.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <DollarSign className="h-4 w-4 text-success shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Pago:</p>
              <p className="text-sm font-bold text-success">{formatCurrency(totalPaid)}</p>
            </div>
          </div>
        </div>

        {/* Só Juros (por parcela) */}
        <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-3 border border-border/50">
          <span className="text-sm text-muted-foreground">Só Juros (por parcela):</span>
          <span className="text-sm font-bold text-foreground">{formatCurrency(interestOnly)}</span>
        </div>

        {/* Progress */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">{loan.paidInstallments}/{loan.installments} parcelas</span>
            <span className="font-medium text-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2.5" />
        </div>

        {loan.notes && (
          <p className="text-xs text-muted-foreground italic bg-muted/30 rounded-lg px-3 py-2">📝 {loan.notes}</p>
        )}

        {/* Partial payment input */}
        {showPartial && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border/50">
            <Input
              type="number" step="0.01" placeholder="Valor (R$)"
              value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
              className="h-8 text-sm flex-1" autoFocus
              onKeyDown={(e) => e.key === "Enter" && handlePartialSubmit()}
            />
            <Button size="sm" className="h-8" onClick={handlePartialSubmit}><Check className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowPartial(false)}><X className="h-4 w-4" /></Button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50 mt-auto">
          {loan.status !== "paid" && (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-9 text-xs" onClick={() => openPaymentDialog("installment")}>
                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Pagar
              </Button>
              <Button variant="outline" className="flex-1 h-9 text-xs" onClick={() => openPaymentDialog("interest")}>
                <DollarSign className="h-3.5 w-3.5 mr-1" /> Pagar Juros
              </Button>
            </div>
          )}
          <div className="flex items-center justify-center gap-1">
            {loan.status !== "paid" && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowPartial(!showPartial)} title="Pagamento Parcial">
                <HandCoins className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={startEdit} title="Editar">
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onDelete} title="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
      <DialogContent className="sm:max-w-[340px]">
        <DialogHeader>
          <DialogTitle>
            {paymentDialog?.type === "installment" ? "Receber Parcela" : paymentDialog?.type === "interest" ? "Pagar Juros" : "Pagamento Parcial"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2">
          <Label className="text-sm text-muted-foreground">Selecione a data do pagamento</Label>
          <CalendarUI
            mode="single"
            selected={paymentDate}
            onSelect={(d) => d && setPaymentDate(d)}
            className="rounded-md border pointer-events-auto"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPaymentDialog(null)}>Cancelar</Button>
          <Button onClick={confirmPayment}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function LoanRowView({
  loan, payments: allPayments, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete,
}: {
  loan: Loan;
  payments: Payment[];
  onPayment: (date?: string) => void;
  onPartialPayment: (amount: number, date?: string) => void;
  onInterestPayment: (date?: string) => void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<{ type: "installment" | "interest" | "partial"; amount?: number } | null>(null);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());

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
    const parsedTags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    onUpdate({
      borrowerName: form.borrowerName,
      amount: parseFloat(form.amount) || loan.amount,
      interestRate: parseFloat(form.interestRate) || loan.interestRate,
      installments: parseInt(form.installments) || loan.installments,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate || loan.startDate,
      dueDate: form.dueDate || loan.dueDate,
      notes: form.notes,
      tags: parsedTags,
    });
    setEditing(false);
  };

  const openPaymentDialog = (type: "installment" | "interest" | "partial", amount?: number) => {
    setPaymentDate(new Date());
    setPaymentDialog({ type, amount });
  };

  const confirmPayment = () => {
    if (!paymentDialog) return;
    const dateStr = paymentDate.toISOString().split("T")[0];
    if (paymentDialog.type === "installment") onPayment(dateStr);
    else if (paymentDialog.type === "interest") onInterestPayment(dateStr);
    else if (paymentDialog.type === "partial" && paymentDialog.amount) onPartialPayment(paymentDialog.amount, dateStr);
    setPaymentDialog(null);
  };

  const handlePartialSubmit = () => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      openPaymentDialog("partial", val);
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
    <>
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
        {loan.tags && loan.tags.length > 0 && loan.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs shrink-0">
            <Tag className="h-2.5 w-2.5 mr-0.5" />{tag}
          </Badge>
        ))}
        <div className="flex gap-1 ml-auto shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={startEdit} title="Editar">
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
          {loan.status !== "paid" && (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowPartial(!showPartial)} title="Pagamento Parcial">
                <HandCoins className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openPaymentDialog("interest")} title="Pagar apenas juros">
                <Percent className="h-4 w-4 text-warning" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openPaymentDialog("installment")} title="Receber Parcela">
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
    <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
      <DialogContent className="sm:max-w-[340px]">
        <DialogHeader>
          <DialogTitle>
            {paymentDialog?.type === "installment" ? "Receber Parcela" : paymentDialog?.type === "interest" ? "Pagar Juros" : "Pagamento Parcial"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2">
          <Label className="text-sm text-muted-foreground">Selecione a data do pagamento</Label>
          <CalendarUI
            mode="single"
            selected={paymentDate}
            onSelect={(d) => d && setPaymentDate(d)}
            className="rounded-md border pointer-events-auto"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPaymentDialog(null)}>Cancelar</Button>
          <Button onClick={confirmPayment}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
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
  group, payments, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete,
}: {
  group: ClientGroup;
  payments: Payment[];
  onPayment: (id: string, date?: string) => void;
  onPartialPayment: (id: string, amount: number, date?: string) => void;
  onInterestPayment: (id: string, date?: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = group.loans.filter((l) => l.status !== "paid").length;
  const paidCount = group.loans.filter((l) => l.status === "paid").length;

  return (
    <Card className={`overflow-hidden transition-shadow hover:shadow-lg ${open ? "ring-1 ring-primary/20" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-md">
          {group.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground text-sm truncate">{group.name}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px]">{group.loans.length}</Badge>
            {activeCount > 0 && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{activeCount} ativos</Badge>}
            {paidCount > 0 && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">{paidCount} pagos</Badge>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">Emprestado</p>
            <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">Recebido</p>
            <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-3 px-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {group.loans.map((loan) => (
              <LoanCardView key={loan.id} loan={loan} payments={payments}
                onPayment={(date) => onPayment(loan.id, date)} onPartialPayment={(amt, date) => onPartialPayment(loan.id, amt, date)}
                onInterestPayment={(date) => onInterestPayment(loan.id, date)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function LoanList({ loans, payments, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete }: Props) {
  const [view, setView] = useState<"cards" | "rows" | "folders">("cards");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");

  const categorized = useMemo(() => {
    const withSearch = loans.filter((l) => l.borrowerName.toLowerCase().includes(search.toLowerCase()));
    const filtered = category === "all"
      ? withSearch.filter((l) => getLoanCategory(l, payments) !== "paid")
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
      all: cats.filter((c) => c !== "paid").length,
      overdue: cats.filter((c) => c === "overdue").length,
      paid_interest: cats.filter((c) => c === "paid_interest").length,
      paid: cats.filter((c) => c === "paid").length,
      due_today: cats.filter((c) => c === "due_today").length,
      on_track: cats.filter((c) => c === "on_track").length,
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

  const summaryData = useMemo(() => {
    const source = categorized;
    const totalLent = source.reduce((s, l) => s + l.amount, 0);
    const totalToReceive = source
      .filter((l) => l.status !== "paid")
      .reduce((s, l) => s + calculateTotalWithInterest(l.amount, l.interestRate, l.installments), 0);
    const totalInterest = source.reduce(
      (s, l) => s + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount), 0
    );
    const activeCount = source.filter((l) => l.status === "active").length;
    const overdueCount = source.filter((l) => getDaysOverdue(l) > 0 && l.status !== "paid").length;
    return { totalLent, totalToReceive, totalInterest, activeCount, overdueCount };
  }, [categorized]);

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
      {/* Summary cards that react to filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="gradient-primary rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Total Emprestado</span>
            <DollarSign className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(summaryData.totalLent)}</p>
        </div>
        <div className="gradient-success rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Total a Receber</span>
            <DollarSign className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(summaryData.totalToReceive)}</p>
        </div>
        <div className="gradient-warning rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Lucro em Juros</span>
            <DollarSign className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(summaryData.totalInterest)}</p>
        </div>
        <div className="gradient-primary rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Empréstimos Ativos</span>
            <User className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{summaryData.activeCount}</p>
          {summaryData.overdueCount > 0 && (
            <p className="text-xs mt-1 opacity-80">{summaryData.overdueCount} em atraso</p>
          )}
        </div>
      </div>

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
          <button onClick={() => setView("folders")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "folders" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Folder className="h-3.5 w-3.5" />Pastas
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {categorized.map((loan) => (
                <LoanCardView key={loan.id} loan={loan} payments={payments}
                  onPayment={(date) => onPayment(loan.id, date)} onPartialPayment={(amt, date) => onPartialPayment(loan.id, amt, date)}
                  onInterestPayment={(date) => onInterestPayment(loan.id, date)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} />
              ))}
            </div>
          ) : view === "folders" ? (
            <>
            <div className="space-y-4">
              {grouped.map((g) => (
                <ClientFolder key={g.name} group={g} payments={payments}
                  onPayment={onPayment} onPartialPayment={onPartialPayment}
                  onInterestPayment={onInterestPayment} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
              {grouped.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">Nenhum cliente com múltiplos empréstimos</p>
                  </CardContent>
                </Card>
              )}
            </div>
            </>
          ) : (
            categorized.map((loan) => (
              <LoanRowView key={loan.id} loan={loan} payments={payments}
                onPayment={(date) => onPayment(loan.id, date)} onPartialPayment={(amt, date) => onPartialPayment(loan.id, amt, date)}
                onInterestPayment={(date) => onInterestPayment(loan.id, date)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
