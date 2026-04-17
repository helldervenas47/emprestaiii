import { useMemo, useState, useCallback } from "react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Client, Payment, InstallmentSchedule } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { calculateInstallment } from "@/hooks/useLoans";
import { AlertTriangle, MessageCircle, Search, Phone, Calendar, DollarSign, Clock } from "lucide-react";
import { WhatsAppReport } from "@/components/WhatsAppReport";
import { TelegramBillingScheduleCard } from "@/components/TelegramBillingScheduleCard";

interface Props {
  loans: Loan[];
  payments: Payment[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
}

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function getInstallmentAmount(loan: Loan, schedules: InstallmentSchedule[]): number {
  // Para parcela única, usar remaining_amount diretamente
  if (loan.installments === 1 && loan.remainingAmount && loan.remainingAmount > 0) {
    return loan.remainingAmount;
  }
  // Para parcelado, tentar schedule primeiro
  const schedule = schedules.find(s => s.loanId === loan.id && s.installmentNumber === loan.paidInstallments + 1);
  if (schedule) return schedule.amount;
  // Fallback: remainingAmount ou cálculo original
  if (loan.remainingAmount && loan.remainingAmount > 0) {
    return loan.remainingAmount;
  }
  return loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments);
}

function buildWhatsAppMessage(loan: Loan, installments: { number: number; dueDate: string; amount: number }[], isOverdue: boolean): string {
  const total = installments.reduce((s, i) => s + i.amount, 0);
  const lines = [
    `Olá ${loan.borrowerName}, tudo bem?`,
    ``,
    isOverdue
      ? `Gostaria de informar que você possui *${installments.length} parcela(s) em atraso* referente ao seu empréstimo.`
      : `Gostaria de lembrar que você possui *${installments.length} parcela(s) vencendo hoje* referente ao seu empréstimo.`,
    ``,
    ...installments.map(
      (inst) => `• Parcela ${inst.number} — Vencimento: ${new Date(inst.dueDate).toLocaleDateString("pt-BR")} — Valor: ${rawFormatCurrency(inst.amount)}`
    ),
    ``,
    isOverdue
      ? `*Total em atraso: ${rawFormatCurrency(total)}*`
      : `*Total a pagar: ${rawFormatCurrency(total)}*`,
    ``,
    isOverdue
      ? `Por favor, entre em contato para regularizar sua situação.`
      : `Não se esqueça de efetuar o pagamento hoje.`,
    `Obrigado!`,
  ];
  return lines.join("\n");
}

function formatPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

interface LoanItem {
  loan: Loan;
  client: Client | undefined;
  phone: string;
  installments: { number: number; dueDate: string; amount: number }[];
  daysOverdue: number;
  totalAmount: number;
}

function LoanItemCard({ item, isOverdue, onSendWhatsApp }: { item: LoanItem; isOverdue: boolean; onSendWhatsApp: () => void }) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  return (
    <Card no3d className={isOverdue ? "border-destructive/20" : "border-warning/20"}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold text-foreground">{item.loan.borrowerName}</p>
              {isOverdue ? (
                <Badge variant="destructive" className="text-xs">
                  {item.daysOverdue} dia(s) atraso
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-warning border-warning bg-warning/10">
                  Vence hoje
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                {formatCurrency(item.totalAmount)} {isOverdue ? "em atraso" : "a pagar"}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {item.installments.length} parcela(s)
              </span>
              {item.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {item.phone}
                </span>
              )}
            </div>
            <div className="mt-2 space-y-1">
              {item.installments.map((inst) => (
                <p key={inst.number} className="text-xs text-muted-foreground">
                  Parcela {inst.number} — Venc. {new Date(inst.dueDate).toLocaleDateString("pt-BR")} — {formatCurrency(inst.amount)}
                </p>
              ))}
            </div>
          </div>
          <Button
            onClick={onSendWhatsApp}
            disabled={!formatPhone(item.phone)}
            className="bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,38%)] text-white shrink-0"
          >
            <MessageCircle className="h-4 w-4 mr-1" />
            WhatsApp
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function OverdueLoans({ loans, payments, clients, installmentSchedules }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [search, setSearch] = useState("");
  const todayStr = getTodayStr();

  const activeLoans = useMemo(() =>
    loans.filter((l) => l.status !== "paid" && l.borrowerName.toLowerCase().includes(search.toLowerCase())),
    [loans, search]
  );

  const overdueData = useMemo<LoanItem[]>(() => {
    return activeLoans
      .map((loan) => {
        if (loan.dueDate >= todayStr) return null;
        const amount = getInstallmentAmount(loan, installmentSchedules);
        const nextInst = loan.paidInstallments + 1;
        const installments = [{
          number: nextInst,
          dueDate: loan.dueDate,
          amount,
        }];
        const client = clients.find((c) => c.id === loan.borrowerId);
        return {
          loan, client, phone: client?.phone || "",
          installments,
          daysOverdue: getDaysOverdue(loan.dueDate),
          totalAmount: amount,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.daysOverdue - a!.daysOverdue) as LoanItem[];
  }, [activeLoans, clients, installmentSchedules, todayStr]);

  const dueTodayData = useMemo<LoanItem[]>(() => {
    return activeLoans
      .map((loan) => {
        if (loan.dueDate !== todayStr) return null;
        const amount = getInstallmentAmount(loan, installmentSchedules);
        const nextInst = loan.paidInstallments + 1;
        const installments = [{
          number: nextInst,
          dueDate: loan.dueDate,
          amount,
        }];
        const client = clients.find((c) => c.id === loan.borrowerId);
        return {
          loan, client, phone: client?.phone || "",
          installments,
          daysOverdue: 0,
          totalAmount: amount,
        };
      })
      .filter(Boolean) as LoanItem[];
  }, [activeLoans, clients, installmentSchedules, todayStr]);

  const totalOverdueAmount = overdueData.reduce((s, d) => s + d.totalAmount, 0);
  const totalDueTodayAmount = dueTodayData.reduce((s, d) => s + d.totalAmount, 0);

  const handleSendWhatsApp = (item: LoanItem, isOverdue: boolean) => {
    const message = buildWhatsAppMessage(item.loan, item.installments, isOverdue);
    const phone = formatPhone(item.phone);
    if (!phone) {
      alert("Este cliente não possui telefone cadastrado.");
      return;
    }
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const handleSendAll = (items: LoanItem[], isOverdue: boolean) => {
    const withPhone = items.filter((d) => formatPhone(d.phone));
    if (withPhone.length === 0) {
      alert("Nenhum cliente com telefone cadastrado encontrado.");
      return;
    }
    withPhone.forEach((item, index) => {
      setTimeout(() => handleSendWhatsApp(item, isOverdue), index * 1000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card no3d className="border-destructive/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Atrasados</p>
              <p className="text-xl font-bold text-destructive">{overdueData.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card no3d className="border-warning/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
              <Clock className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vencendo Hoje</p>
              <p className="text-xl font-bold text-warning">{dueTodayData.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Telegram automatic schedule */}
      <TelegramBillingScheduleCard />

      {/* WhatsApp Report */}
      <WhatsAppReport loans={loans} payments={payments} clients={clients} installmentSchedules={installmentSchedules} />

      {/* Info */}
      <Card no3d>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            💡 Os botões abrem o WhatsApp Web com uma mensagem pré-formatada. Certifique-se de que os empréstimos estejam vinculados a clientes com telefone cadastrado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
