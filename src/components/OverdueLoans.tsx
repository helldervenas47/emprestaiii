import { useMemo, useState, useCallback } from "react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Client, Payment, InstallmentSchedule } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getInstallmentAmount } from "@/lib/loanInstallmentAmount";
import { AlertTriangle, Search, Phone, Calendar, DollarSign, Clock } from "lucide-react";
import { DetailedReport } from "@/components/DetailedReport";
import { TelegramBillingScheduleCard } from "@/components/TelegramBillingScheduleCard";
import { TelegramReportsConnectCard } from "@/components/TelegramReportsConnectCard";
import { todayInAppTz } from "@/lib/timezone";

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
  return todayInAppTz();
}

function getDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}


interface LoanItem {
  loan: Loan;
  client: Client | undefined;
  phone: string;
  installments: { number: number; dueDate: string; amount: number }[];
  daysOverdue: number;
  totalAmount: number;
}

interface LoanItem {
  loan: Loan;
  client: Client | undefined;
  phone: string;
  installments: { number: number; dueDate: string; amount: number }[];
  daysOverdue: number;
  totalAmount: number;
}

function LoanItemCard({ item, isOverdue }: { item: LoanItem; isOverdue: boolean }) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  return (
    <Card no3d className={isOverdue ? "border-destructive/20" : "border-warning/20"}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
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

      {/* Bot de Relatórios (independente) */}
      <div id="telegram-reports-config" className="rounded-lg transition-all duration-500 scroll-mt-24">
        <TelegramReportsConnectCard />
      </div>
      {/* Telegram automatic schedule */}
      <TelegramBillingScheduleCard />

      {/* Detailed report preview */}
      <DetailedReport loans={loans} payments={payments} clients={clients} installmentSchedules={installmentSchedules} />
    </div>
  );
}
