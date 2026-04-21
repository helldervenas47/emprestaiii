import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useMonthlyGoals, GoalType, formatMonthLabel } from "@/hooks/useMonthlyGoals";
import { Loan, Payment, Expense, Client, InstallmentSchedule } from "@/types/loan";
import { todayInAppTz } from "@/lib/timezone";
import {
  Target, Percent, TrendingUp, Banknote, FileText,
  HandCoins, Coins, Wallet, PiggyBank, AlertTriangle, UserPlus,
  Sparkles, CheckCircle2, AlertCircle, TrendingDown, Lightbulb,
  BookOpen, Calculator, Database, FlaskConical,
} from "lucide-react";

// Inline para evitar import circular com useLoans
function calculateTotalWithInterest(principal: number, rate: number, _months: number): number {
  return Math.round(principal * (1 + rate / 100));
}

// Explicações didáticas de como cada meta é calculada
const GOAL_EXPLANATIONS: Record<GoalType, {
  formula: string;
  indicators: string[];
  dataSource: string[];
  example: { setup: string; calc: string; result: string };
  measurement: string;
}> = {
  interest_rate: {
    formula: "Taxa Juros (%) = (Total a Receber − Total Emprestado) ÷ Total Emprestado × 100",
    indicators: [
      "Total Emprestado = soma do valor principal dos contratos do mês",
      "Total a Receber = soma de (principal + juros) de cada contrato do mês",
      "Validação: se Total Emprestado = 0, resultado = 0%",
    ],
    dataSource: ["Tabela de Empréstimos (loans)", "Campos: amount, interest_rate, installments", "Filtro: start_date no mês selecionado"],
    example: {
      setup: "2 empréstimos no mês: R$ 1.000 a 10% e R$ 2.000 a 15%.",
      calc: "Total Emprestado = 3.000. Total a Receber = 1.100 + 2.300 = 3.400. (3.400 − 3.000) ÷ 3.000 × 100",
      result: "Taxa Juros Mensal = 13,33%",
    },
    measurement: "Quanto maior, mais próximo da meta. Atingimento = (Realizado ÷ Meta) × 100. Resultado em % com 2 casas decimais.",
  },
  profit: {
    formula: "Lucro do Período (%) = (Lucro Realizado ÷ (Lucro Realizado + Lucro Previsto)) × 100",
    indicators: [
      "Lucro Realizado: mesma lógica do gráfico 'Lucro por Período' (Realizado)",
      "Lucro Previsto: parcelas com vencimento no mês × proporção de juros do contrato",
      "% Meta no card = (Realizado ÷ (Previsto × Meta/100)) × 100",
    ],
    dataSource: ["Tabela de Pagamentos", "Tabela de Empréstimos (amount, interest_rate, installments)"],
    example: {
      setup: "Lucro Previsto: R$ 2.000. Lucro Realizado: R$ 1.500.",
      calc: "(1.500 ÷ (1.500 + 2.000)) × 100",
      result: "Lucro do Período = 42,86%",
    },
    measurement: "Espelha o campo '% Lucro' do card 'Lucro por Período' no Dashboard. Resultado em % com 2 casas decimais.",
  },
  loan_volume: {
    formula: "Volume = Soma do valor principal de todos os empréstimos com data de início no mês selecionado",
    indicators: ["Valor principal de cada novo empréstimo", "Data de início (start_date)"],
    dataSource: ["Tabela de Empréstimos (loans)", "Campo: amount", "Filtro: start_date no mês selecionado"],
    example: {
      setup: "3 empréstimos criados no mês: R$ 1.000, R$ 2.500 e R$ 1.500.",
      calc: "1.000 + 2.500 + 1.500",
      result: "Volume emprestado = R$ 5.000",
    },
    measurement: "Atingimento = (Volume realizado ÷ Meta) × 100. Quanto maior, melhor.",
  },
  new_loans_count: {
    formula: "Quantidade = Número total de empréstimos criados no mês selecionado",
    indicators: ["Cada novo contrato conta como 1", "Data de início (start_date)"],
    dataSource: ["Tabela de Empréstimos (loans)", "Filtro: start_date no mês selecionado"],
    example: {
      setup: "Você criou 7 novos contratos no mês.",
      calc: "Contagem direta dos registros",
      result: "Novos empréstimos = 7",
    },
    measurement: "Atingimento = (Quantidade realizada ÷ Meta) × 100.",
  },
  received_total: {
    formula: "Total Recebido = Soma do valor de todos os pagamentos com data no mês selecionado",
    indicators: ["Valor de cada pagamento (principal + juros)", "Data do pagamento"],
    dataSource: ["Tabela de Pagamentos (payments)", "Campo: amount", "Filtro: date no mês selecionado"],
    example: {
      setup: "5 parcelas pagas no mês: R$ 300, R$ 450, R$ 200, R$ 500, R$ 350.",
      calc: "300 + 450 + 200 + 500 + 350",
      result: "Recebimentos no mês = R$ 1.800",
    },
    measurement: "Atingimento = (Total recebido ÷ Meta) × 100.",
  },
  interest_received: {
    formula: "Juros Recebidos = mesma lógica do 'Realizado' no gráfico 'Lucro por Período'",
    indicators: [
      "1) Juros avulsos (parcela 0) de contratos não quitados → valor integral",
      "2) Contratos quitados no mês → (Total Pago − Principal)",
      "3) Parcelas regulares de contratos ativos → valor × proporção de juros do contrato",
    ],
    dataSource: ["Tabela de Pagamentos (payments)", "Tabela de Empréstimos (loans)"],
    example: {
      setup: "Empréstimo R$ 1.000 a 30% (Total a Receber R$ 1.300). Parcela paga R$ 130.",
      calc: "Proporção juros = 1 − (1.000 ÷ 1.300) = 23,08%. Juros = 130 × 23,08%",
      result: "Juros desta parcela ≈ R$ 30,00",
    },
    measurement: "Atingimento = (Juros recebidos ÷ Meta) × 100. Resultado em R$.",
  },
  active_capital: {
    formula: "Capital Ativo = Soma do 'restante a receber' de todos os contratos não finalizados (snapshot atual)",
    indicators: ["Saldo devedor (remaining_amount) de cada empréstimo ativo", "Status diferente de 'completed' ou 'paid'"],
    dataSource: ["Tabela de Empréstimos (loans)", "Campo: remaining_amount", "Filtro: status ativo (independe do mês)"],
    example: {
      setup: "3 contratos ativos com restante: R$ 800, R$ 1.500 e R$ 2.200.",
      calc: "800 + 1.500 + 2.200",
      result: "Capital ativo = R$ 4.500",
    },
    measurement: "Esta meta é sempre calculada com a foto atual da carteira, independente do mês selecionado.",
  },
  net_profit: {
    formula: "Lucro Líquido = Juros recebidos no mês − Despesas pagas no mês (escopo empresa)",
    indicators: ["Juros recebidos do mês", "Despesas pagas (paid = true) com escopo diferente de 'pessoal'"],
    dataSource: ["Tabela de Pagamentos", "Tabela de Empréstimos", "Tabela de Despesas (expenses)"],
    example: {
      setup: "Juros recebidos: R$ 2.500. Despesas pagas: R$ 800.",
      calc: "2.500 − 800",
      result: "Lucro líquido = R$ 1.700",
    },
    measurement: "Atingimento = (Lucro líquido ÷ Meta) × 100.",
  },
  max_default_rate: {
    formula: "Inadimplência (%) = (Valor vencido em atraso no mês ÷ Valor total da carteira com vencimento no mês) × 100",
    indicators: [
      "Considera apenas valores com vencimento dentro do mês selecionado",
      "Total do período = soma das parcelas/contratos com vencimento no mês",
      "Em atraso = saldo vencido até a data atual e ainda não quitado",
      "Validação: se não houver carteira com vencimento no período, resultado = 0%",
    ],
    dataSource: ["Tabela de Empréstimos (loans)", "Tabela de Pagamentos (payments)", "Filtro: período do mês selecionado"],
    example: {
      setup: "No mês há R$ 10.000,00 a vencer na carteira e R$ 2.000,00 estão vencidos em atraso.",
      calc: "(2.000 ÷ 10.000) × 100",
      result: "Inadimplência = 20,00%",
    },
    measurement: "Meta INVERSA: quanto menor, melhor. Atingimento = máx(0, 100 − (Realizado ÷ Meta) × 100). Resultado em % com 2 casas decimais.",
  },
  new_clients_count: {
    formula: "Quantidade = Número de clientes cadastrados no mês selecionado",
    indicators: ["Cada cliente conta como 1", "Data de criação (created_at)"],
    dataSource: ["Tabela de Clientes (clients)", "Filtro: created_at no mês selecionado"],
    example: {
      setup: "Você cadastrou 4 novos clientes no mês.",
      calc: "Contagem direta dos registros",
      result: "Novos clientes = 4",
    },
    measurement: "Atingimento = (Quantidade realizada ÷ Meta) × 100.",
  },
};

type Unit = "%" | "R$" | "qtd";

const GOAL_TYPE_META: Record<GoalType, { label: string; icon: any; unit: Unit; color: string; bgColor: string; description: string; inverse?: boolean }> = {
  interest_rate:      { label: "Taxa de Juros Mensal",            icon: Percent,       unit: "%",   color: "text-warning",     bgColor: "bg-warning/15",     description: "Meta da taxa média de juros aplicada nos contratos." },
  profit:             { label: "Lucro do Período",                 icon: TrendingUp,    unit: "%",   color: "text-success",     bgColor: "bg-success/15",     description: "Quanto do lucro previsto foi efetivamente realizado." },
  loan_volume:        { label: "Volume Emprestado",                icon: Banknote,      unit: "R$",  color: "text-primary",     bgColor: "bg-primary/15",     description: "Soma do valor de novos empréstimos criados no mês." },
  new_loans_count:    { label: "Novos Empréstimos",                icon: FileText,      unit: "qtd", color: "text-primary",     bgColor: "bg-primary/15",     description: "Quantidade de novos contratos criados no mês." },
  received_total:     { label: "Recebimentos no Mês",              icon: HandCoins,     unit: "R$",  color: "text-success",     bgColor: "bg-success/15",     description: "Soma de todos os pagamentos recebidos no mês." },
  interest_received:  { label: "Juros Recebidos",                  icon: Coins,         unit: "R$",  color: "text-success",     bgColor: "bg-success/15",     description: "Apenas a parte dos juros dos pagamentos recebidos." },
  active_capital:     { label: "Capital Ativo",                    icon: Wallet,        unit: "R$",  color: "text-primary",     bgColor: "bg-primary/15",     description: "Total ainda a receber em contratos ativos." },
  net_profit:         { label: "Lucro Líquido",                    icon: PiggyBank,     unit: "R$",  color: "text-success",     bgColor: "bg-success/15",     description: "Juros recebidos menos despesas pagas da empresa." },
  max_default_rate:   { label: "Inadimplência Máxima",             icon: AlertTriangle, unit: "%",   color: "text-destructive", bgColor: "bg-destructive/15", description: "Limite máximo de % de parcelas em atraso (meta inversa).", inverse: true },
  new_clients_count:  { label: "Novos Clientes",                   icon: UserPlus,      unit: "qtd", color: "text-primary",     bgColor: "bg-primary/15",     description: "Clientes cadastrados no período." },
};

interface Props {
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules?: InstallmentSchedule[];
  selectedMonth?: string; // YYYY-MM — filtra metas exibidas (exceto active_capital)
  periodLabel?: string;
}

// Metas que NÃO devem ser filtradas pelo mês (sempre visíveis)
const ALWAYS_VISIBLE_GOALS: GoalType[] = ["active_capital"];

function inMonth(dateStr: string | undefined | null, month: string): boolean {
  if (!dateStr) return false;
  return String(dateStr).slice(0, 7) === month;
}

function fmtValue(v: number, unit: Unit, hidden: boolean): string {
  if (hidden && unit === "R$") return "R$ ••••";
  if (unit === "R$") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  if (unit === "%") return `${v.toFixed(2)}%`;
  return String(Math.round(v));
}

// Calcula o "Lucro Realizado" do período usando a mesma lógica do gráfico "Lucro por Período"
// (3 componentes: juros avulsos, contratos quitados no período, parcelas regulares de contratos ativos)
function computeProfitRealized(loans: Loan[], payments: Payment[], m: string): number {
  const inP = (date: string | undefined | null) => inMonth(date, m);
  const paymentsInPeriod = payments.filter((p: any) => inP(p.date));

  const quitadoLoanIds = new Set<string>();
  loans.forEach((l: any) => {
    if (l.status !== "paid") return;
    const loanPays = payments.filter((pp: any) => (pp.loanId || pp.loan_id) === l.id);
    if (loanPays.length === 0) return;
    const lastPayDate = loanPays.reduce((max: string, pp: any) => pp.date > max ? pp.date : max, loanPays[0].date);
    if (inP(lastPayDate)) quitadoLoanIds.add(l.id);
  });

  // 1) Juros avulsos (installmentNumber === 0) de contratos NÃO quitados no período
  const interestOnly = paymentsInPeriod
    .filter((p: any) => (p.installmentNumber ?? p.installment_number) === 0 && !quitadoLoanIds.has(p.loanId || p.loan_id))
    .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);

  // 2) Lucro total dos contratos quitados no período (total pago - principal)
  const quitadoProfit = Array.from(quitadoLoanIds).reduce((s: number, loanId: string) => {
    const loan: any = loans.find((l: any) => l.id === loanId);
    if (!loan) return s;
    const totalPaid = payments
      .filter((p: any) => (p.loanId || p.loan_id) === loanId)
      .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
    return s + Math.max(0, totalPaid - Number(loan.amount || 0));
  }, 0);

  // 3) Parcelas regulares/parciais de contratos em aberto: proporção de juros
  const activeInstallment = paymentsInPeriod
    .filter((p: any) => (p.installmentNumber ?? p.installment_number) !== 0 && !quitadoLoanIds.has(p.loanId || p.loan_id))
    .reduce((s: number, p: any) => {
      const loan: any = loans.find((l: any) => l.id === (p.loanId || p.loan_id));
      if (!loan) return s;
      const principal = Number(loan.amount) || 0;
      const rate = Number(loan.interestRate ?? loan.interest_rate) || 0;
      const inst = Number(loan.installments) || 1;
      const totalWithInterest = calculateTotalWithInterest(principal, rate, inst);
      const interestRatio = totalWithInterest > 0 ? 1 - (principal / totalWithInterest) : 0;
      return s + (Number(p.amount) || 0) * interestRatio;
    }, 0);

  return interestOnly + quitadoProfit + activeInstallment;
}

// Calcula o "Lucro Previsto" do período (parcelas com vencimento no mês × proporção de juros)
function computeProfitExpected(loans: Loan[], m: string): number {
  return loans.reduce((s: number, l: any) => {
    const principal = Number(l.amount) || 0;
    const rate = Number(l.interestRate ?? l.interest_rate) || 0;
    const inst = Number(l.installments) || 1;
    const totalWithInterest = calculateTotalWithInterest(principal, rate, inst);
    const interestRatio = totalWithInterest > 0 ? 1 - (principal / totalWithInterest) : 0;

    const startDate = (l.startDate || l.start_date || "").slice(0, 10);
    if (!startDate) return s;
    const installmentValue = totalWithInterest / Math.max(1, inst);

    // Para empréstimos com 1 parcela, usar dueDate
    if (inst <= 1) {
      const due = (l.dueDate || l.due_date || "").slice(0, 10);
      if (inMonth(due, m)) return s + (totalWithInterest - principal);
      return s;
    }

    // Para parcelados: percorrer cada parcela mensal a partir do startDate
    const [sy, smo, sd] = startDate.split("-").map(Number);
    let monthlyTotal = 0;
    for (let i = 0; i < inst; i++) {
      const dueDt = new Date(sy, (smo - 1) + (i + 1), sd);
      const dueKey = `${dueDt.getFullYear()}-${String(dueDt.getMonth() + 1).padStart(2, "0")}`;
      if (dueKey === m) monthlyTotal += installmentValue * interestRatio;
    }
    return s + monthlyTotal;
  }, 0);
}

function computeExpectedReceivable(loans: Loan[], m: string): number {
  return loans.reduce((s: number, l: any) => {
    const principal = Number(l.amount) || 0;
    const rate = Number(l.interestRate ?? l.interest_rate) || 0;
    const inst = Number(l.installments) || 1;
    const totalWithInterest = calculateTotalWithInterest(principal, rate, inst);

    const startDate = (l.startDate || l.start_date || "").slice(0, 10);
    if (!startDate) return s;

    if (inst <= 1) {
      const due = (l.dueDate || l.due_date || "").slice(0, 10);
      return inMonth(due, m) ? s + totalWithInterest : s;
    }

    const installmentValue = totalWithInterest / Math.max(1, inst);
    const [sy, smo, sd] = startDate.split("-").map(Number);
    let monthlyTotal = 0;

    for (let i = 0; i < inst; i++) {
      const dueDt = new Date(sy, (smo - 1) + (i + 1), sd);
      const dueKey = `${dueDt.getFullYear()}-${String(dueDt.getMonth() + 1).padStart(2, "0")}`;
      if (dueKey === m) monthlyTotal += installmentValue;
    }

    return s + monthlyTotal;
  }, 0);
}

function computeDefaultRate(loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[], m: string): number {
  const today = todayInAppTz();

  const totalPaidByLoan = payments.reduce<Record<string, number>>((acc, payment: any) => {
    const loanId = payment.loanId || payment.loan_id;
    if (!loanId) return acc;
    acc[loanId] = (acc[loanId] || 0) + (Number(payment.amount) || 0);
    return acc;
  }, {});

  let periodPortfolio = 0;
  let overdueAmount = 0;

  loans.forEach((loan: any) => {
    const installments = Math.max(1, Number(loan.installments) || 1);
    const principal = Number(loan.amount) || 0;
    const rate = Number(loan.interestRate ?? loan.interest_rate) || 0;
    const totalWithInterest = calculateTotalWithInterest(principal, rate, installments);
    const installmentValue = totalWithInterest / installments;
    const paidInstallments = Number(loan.paidInstallments ?? loan.paid_installments) || 0;
    const loanSchedules = installmentSchedules
      .filter((schedule) => schedule.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    const dueEntries = loanSchedules.length > 0
      ? loanSchedules.map((schedule) => ({
          installmentNumber: schedule.installmentNumber,
          dueDate: schedule.dueDate,
          amount: Number(schedule.amount) || installmentValue,
        }))
      : installments <= 1
        ? [{ installmentNumber: 1, dueDate: loan.dueDate || loan.due_date, amount: totalWithInterest }]
        : Array.from({ length: installments }, (_, index) => {
            const base = new Date(`${(loan.dueDate || loan.due_date).slice(0, 10)}T00:00:00`);
            const due = new Date(base.getFullYear(), base.getMonth() + index, base.getDate());
            return {
              installmentNumber: index + 1,
              dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
              amount: installmentValue,
            };
          });

    dueEntries.forEach((entry) => {
      if (!inMonth(entry.dueDate, m)) return;
      periodPortfolio += entry.amount;

      const isPaid = String(loan.status || "").toLowerCase() === "paid" || entry.installmentNumber <= paidInstallments;
      if (isPaid || entry.dueDate >= today) return;

      if (installments === 1) {
        const remaining = Number(loan.remainingAmount ?? loan.remaining_amount);
        const fallbackRemaining = Math.max(0, totalWithInterest - (totalPaidByLoan[loan.id] || 0));
        overdueAmount += Math.max(0, remaining || fallbackRemaining);
        return;
      }

      overdueAmount += entry.amount;
    });
  });

  return periodPortfolio > 0 ? (overdueAmount / periodPortfolio) * 100 : 0;
}

function computeActual(
  type: GoalType,
  m: string,
  loans: Loan[],
  payments: Payment[],
  expenses: Expense[],
  clients: Client[],
  installmentSchedules: InstallmentSchedule[]
): number {
  switch (type) {
    case "loan_volume":
      return loans.filter((l: any) => inMonth(l.startDate || l.start_date, m))
        .reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
    case "new_loans_count":
      return loans.filter((l: any) => inMonth(l.startDate || l.start_date, m)).length;
    case "received_total":
      return payments.filter((p: any) => inMonth(p.date, m))
        .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    case "interest_received":
      // Mesma lógica do "Realizado" do gráfico Lucro por Período
      return computeProfitRealized(loans, payments, m);
    case "active_capital":
      return loans.filter((l: any) => l.status !== "completed" && l.status !== "paid")
        .reduce((s: number, l: any) => s + (Number(l.remainingAmount ?? l.remaining_amount) || 0), 0);
    case "net_profit": {
      // Usa o mesmo "Realizado" do Lucro por Período menos despesas pagas da empresa
      const interest = computeProfitRealized(loans, payments, m);
      const exp = expenses.filter((e: any) => e.paid && e.scope !== "personal" && inMonth(e.paid_date || e.paidDate || e.due_date || e.dueDate, m))
        .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
      return interest - exp;
    }
    case "max_default_rate": {
      return computeDefaultRate(loans, payments, installmentSchedules, m);
    }
    case "new_clients_count":
      return clients.filter((c: any) => inMonth(c.created_at || c.createdAt, m)).length;
    case "interest_rate": {
      // Taxa Juros Mensal = (Total a Receber − Total Emprestado) ÷ Total Emprestado × 100
      // Considera empréstimos com data de início no mês selecionado
      const monthLoans = loans.filter((l: any) => inMonth(l.startDate || l.start_date, m));
      const totalLent = monthLoans.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
      const totalToReceive = monthLoans.reduce((s: number, l: any) => {
        const principal = Number(l.amount) || 0;
        const rate = Number(l.interestRate ?? l.interest_rate) || 0;
        const inst = Number(l.installments) || 1;
        return s + calculateTotalWithInterest(principal, rate, inst);
      }, 0);
      // Validação de divisão por zero
      if (totalLent <= 0) return 0;
      return ((totalToReceive - totalLent) / totalLent) * 100;
    }
    case "profit": {
      // Mesma lógica do campo "% Lucro" / "% Meta" do card "Lucro por Período"
      // = (Realizado ÷ (Realizado + Previsto)) × 100
      const realized = computeProfitRealized(loans, payments, m);
      const expected = computeProfitExpected(loans, m);
      const previstoTotal = realized + expected;
      if (previstoTotal <= 0) return 0;
      return (realized / previstoTotal) * 100;
    }
    default:
      return 0;
  }
}

export function GoalsCard({ loans, payments, expenses, clients, installmentSchedules = [], selectedMonth, periodLabel }: Props) {
  const { goals } = useMonthlyGoals();
  const { hidden } = useHideValues();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const enriched = useMemo(() => {
    // Para cada tipo de meta cadastrada, escolhe a melhor meta para o mês selecionado:
    // 1) match exato; 2) mês anterior mais recente; 3) mês posterior mais próximo
    const byType = new Map<GoalType, typeof goals>();
    goals.forEach((g) => {
      const arr = byType.get(g.goalType) || [];
      arr.push(g);
      byType.set(g.goalType, arr);
    });

    const chosen: typeof goals = [];
    byType.forEach((list, type) => {
      if (!selectedMonth) {
        // Sem filtro: mantém todas (comportamento original)
        chosen.push(...list);
        return;
      }
      const exact = list.find((g) => g.month === selectedMonth);
      if (exact) { chosen.push(exact); return; }
      const earlier = list.filter((g) => g.month < selectedMonth).sort((a, b) => b.month.localeCompare(a.month))[0];
      if (earlier) { chosen.push(earlier); return; }
      const later = list.filter((g) => g.month > selectedMonth).sort((a, b) => a.month.localeCompare(b.month))[0];
      if (later) { chosen.push(later); return; }
    });

    return chosen.map((g) => {
      const meta = GOAL_TYPE_META[g.goalType];
      // Para metas sempre visíveis (snapshot atual) e para todas, usar o mês selecionado nos cálculos
      const computeMonth = selectedMonth || g.month;
      const actual = computeActual(g.goalType, computeMonth, loans, payments, expenses, clients, installmentSchedules);
      let pct = 0;
      if (g.targetValue > 0) {
        pct = meta?.inverse
          ? Math.max(0, 100 - (actual / g.targetValue) * 100)
          : Math.min(100, (actual / g.targetValue) * 100);
      }
      const expectedReceivable = g.goalType === "profit" ? computeExpectedReceivable(loans, computeMonth) : null;
      const targetAmount = g.goalType === "profit" && expectedReceivable !== null
        ? expectedReceivable * (g.targetValue / 100)
        : null;
      return { ...g, actual, pct, meta, expectedReceivable, targetAmount };
    }).sort((a, b) => {
      // Ordena por prioridade visual: inverse no fim, demais por % desc
      return b.pct - a.pct;
    });
  }, [goals, loans, payments, expenses, clients, installmentSchedules, selectedMonth]);

  const totalGoals = enriched.length;
  const onTrack = enriched.filter((g) => g.pct >= 80).length;
  const offTrack = enriched.filter((g) => g.pct < 50).length;

  const selected = enriched.find((g) => g.id === selectedGoalId) || null;

  return (
    <Card no3d>
      <CardContent className="p-3 sm:p-6">
        <div className="flex flex-col items-center text-center gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between sm:text-left sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Metas</h3>
              <p className="text-[10px] text-muted-foreground">Acompanhe o progresso das suas metas cadastradas</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:flex sm:gap-6">
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">No Caminho</p>
              <p className="text-xs sm:text-sm font-bold text-success leading-tight">{onTrack}</p>
            </div>
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Atenção</p>
              <p className="text-xs sm:text-sm font-bold text-destructive leading-tight">{offTrack}</p>
            </div>
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Total</p>
              <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">{totalGoals}</p>
            </div>
          </div>
        </div>

        {enriched.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {selectedMonth
              ? `Nenhuma meta cadastrada para ${periodLabel || formatMonthLabel(selectedMonth)}.`
              : "Nenhuma meta cadastrada. Cadastre metas em Configurações → Metas para acompanhar aqui."}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            {enriched.map((g) => {
              const Icon = g.meta?.icon || Target;
              const status = g.pct >= 80 ? "success" : g.pct >= 50 ? "warning" : "destructive";
              const statusColor =
                status === "success" ? "text-success" : status === "warning" ? "text-warning" : "text-destructive";
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGoalId(g.id)}
                  className="rounded-lg border border-border bg-card/50 hover:bg-card hover:border-primary/40 hover:shadow-sm transition-all p-2.5 sm:p-4 flex flex-col items-center text-center gap-2 sm:gap-3 sm:items-stretch sm:text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                    <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-md ${g.meta?.bgColor || "bg-primary/15"} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${g.meta?.color || "text-primary"}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-foreground leading-tight break-words sm:truncate" title={g.meta?.label}>
                        {g.meta?.label || g.goalType}
                      </p>
                      <div className="flex items-center justify-center sm:justify-start gap-1 mt-0.5 flex-wrap">
                        {ALWAYS_VISIBLE_GOALS.includes(g.goalType) ? (
                          <Badge variant="outline" className="text-[8px] sm:text-[9px] px-1 py-0 h-3.5 border-primary/40 text-primary bg-primary/5 uppercase tracking-wide leading-none">
                            Sempre
                          </Badge>
                        ) : selectedMonth && g.month !== selectedMonth ? (
                          <Badge variant="outline" className="text-[8px] sm:text-[9px] px-1 py-0 h-3.5 border-warning/40 text-warning bg-warning/5 uppercase tracking-wide leading-none" title={`Meta herdada de ${formatMonthLabel(g.month)}`}>
                            Herdada · {formatMonthLabel(g.month)}
                          </Badge>
                        ) : (
                          <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">
                            {formatMonthLabel(g.month)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1.5 sm:gap-2 w-full sm:items-stretch">
                    <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Meta</span>
                      <span className="text-xs sm:text-sm font-semibold text-foreground break-all sm:break-normal">
                        {fmtValue(g.targetValue, g.meta?.unit || "qtd", hidden)}
                      </span>
                    </div>
                    <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Realizado</span>
                      <span className={`text-xs sm:text-sm font-semibold ${statusColor} break-all sm:break-normal`}>
                        {fmtValue(g.actual, g.meta?.unit || "qtd", hidden)}
                      </span>
                    </div>
                    <div className="border-t border-border w-full my-0.5 sm:my-1" />
                    <div className="w-full">
                      <Progress value={g.pct} className="h-1.5" />
                      <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between mt-1">
                        <span className="text-[10px] sm:text-xs font-medium text-foreground leading-tight">Progresso</span>
                        <span className={`text-sm sm:text-base font-bold ${statusColor} break-all sm:break-normal`}>
                          {g.pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 italic text-center">
          Toque em uma meta para abrir o relatório inteligente com análise e sugestões.
        </p>
      </CardContent>

      <GoalDetailDialog
        open={!!selected}
        onClose={() => setSelectedGoalId(null)}
        goal={selected}
        viewingMonth={selectedMonth}
      />
    </Card>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  goal: (ReturnType<typeof useMonthlyGoals>["goals"][number] & { actual: number; pct: number; meta: typeof GOAL_TYPE_META[GoalType]; expectedReceivable: number | null; targetAmount: number | null }) | null;
  viewingMonth?: string;
}

function GoalDetailDialog({ open, onClose, goal, viewingMonth }: DialogProps) {
  const { hidden } = useHideValues();
  const { upsertGoal } = useMonthlyGoals();
  const [creating, setCreating] = useState(false);
  const [editingCreate, setEditingCreate] = useState(false);
  const [newTarget, setNewTarget] = useState<string>("");

  // Reset edição ao trocar de meta/mês
  useMemo(() => {
    setEditingCreate(false);
    setNewTarget(goal ? String(goal.targetValue) : "");
  }, [goal?.id, viewingMonth]);

  const handleCreateForMonth = async () => {
    if (!goal || !viewingMonth) return;
    const parsed = Number(String(newTarget).replace(",", "."));
    if (!isFinite(parsed) || parsed < 0) {
      toast.error("Informe um valor válido");
      return;
    }
    setCreating(true);
    try {
      await upsertGoal(goal.goalType, viewingMonth, parsed, goal.notes || undefined);
      setEditingCreate(false);
    } catch (e) {
      toast.error("Erro ao criar meta");
    } finally {
      setCreating(false);
    }
  };

  const analysis = useMemo(() => {
    if (!goal) return null;
    const { meta, actual, targetValue, pct } = goal;
    // Para análise temporal (ritmo, projeção), usa o mês visualizado, não o mês de origem da meta herdada
    const month = viewingMonth || goal.month;
    const unit = meta.unit;
    const inverse = !!meta.inverse;
    const diff = inverse ? targetValue - actual : actual - targetValue;
    const diffPct = targetValue > 0 ? (Math.abs(diff) / targetValue) * 100 : 0;

    // Determinação do status
    let status: "excellent" | "ontrack" | "warning" | "critical";
    if (pct >= 100) status = "excellent";
    else if (pct >= 80) status = "ontrack";
    else if (pct >= 50) status = "warning";
    else status = "critical";

    // Verificação de mês corrente vs passado
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const isCurrentMonth = month === currentMonth;
    const isPastMonth = month < currentMonth;

    // Dias restantes / decorridos no mês
    let dayProgressPct = 100;
    let daysLeft = 0;
    if (isCurrentMonth) {
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const dayOfMonth = today.getDate();
      dayProgressPct = (dayOfMonth / daysInMonth) * 100;
      daysLeft = daysInMonth - dayOfMonth;
    }

    // Análise de "ritmo": estamos atrás, no ritmo, ou à frente do tempo?
    let pace: "ahead" | "ontrack" | "behind" | null = null;
    let projection: number | null = null;
    if (isCurrentMonth && !inverse && targetValue > 0) {
      const expectedPctByNow = dayProgressPct;
      if (pct >= expectedPctByNow + 10) pace = "ahead";
      else if (pct >= expectedPctByNow - 10) pace = "ontrack";
      else pace = "behind";
      projection = dayProgressPct > 0 ? (actual / dayProgressPct) * 100 : actual;
    }

    // Pontos de melhoria & sugestões
    const insights: { icon: any; type: "positive" | "warning" | "negative" | "info"; text: string }[] = [];

    if (status === "excellent") {
      insights.push({ icon: CheckCircle2, type: "positive", text: `Meta superada em ${fmtValue(Math.abs(diff), unit, false)}! Excelente desempenho.` });
    } else if (status === "ontrack") {
      insights.push({ icon: CheckCircle2, type: "positive", text: `Você está no caminho certo (${pct.toFixed(0)}% da meta atingida).` });
    } else if (status === "warning") {
      insights.push({ icon: AlertCircle, type: "warning", text: `Atenção: progresso de ${pct.toFixed(0)}% — precisa acelerar para bater a meta.` });
    } else {
      insights.push({ icon: AlertCircle, type: "negative", text: `Crítico: apenas ${pct.toFixed(0)}% da meta atingida. Revise a estratégia.` });
    }

    if (pace === "ahead") {
      insights.push({ icon: TrendingUp, type: "positive", text: `Ritmo acima do esperado: ${pct.toFixed(0)}% atingido com ${dayProgressPct.toFixed(0)}% do mês decorrido.` });
    } else if (pace === "behind") {
      insights.push({ icon: TrendingDown, type: "warning", text: `Ritmo abaixo do esperado: ${pct.toFixed(0)}% atingido com ${dayProgressPct.toFixed(0)}% do mês decorrido.` });
    } else if (pace === "ontrack") {
      insights.push({ icon: TrendingUp, type: "info", text: `Ritmo alinhado com o tempo decorrido do mês.` });
    }

    if (isCurrentMonth && projection !== null && targetValue > 0) {
      const projPct = (projection / targetValue) * 100;
      if (projPct >= 100) {
        insights.push({ icon: Sparkles, type: "positive", text: `Projeção: ${fmtValue(projection, unit, false)} ao fim do mês (${projPct.toFixed(0)}% da meta).` });
      } else {
        insights.push({ icon: Sparkles, type: "warning", text: `Projeção atual: ${fmtValue(projection, unit, false)} (${projPct.toFixed(0)}% da meta) se mantiver o ritmo.` });
      }
    }

    if (isCurrentMonth && status !== "excellent" && daysLeft > 0 && targetValue > 0) {
      const remaining = Math.max(0, targetValue - actual);
      const perDay = remaining / daysLeft;
      if (unit === "R$") {
        insights.push({ icon: Lightbulb, type: "info", text: `Faltam ${fmtValue(remaining, unit, false)} em ${daysLeft} dias — meta diária de ${fmtValue(perDay, unit, false)}.` });
      } else if (unit === "qtd") {
        insights.push({ icon: Lightbulb, type: "info", text: `Faltam ${Math.ceil(remaining)} em ${daysLeft} dias.` });
      }
    }

    if (isPastMonth) {
      if (status === "excellent" || status === "ontrack") {
        insights.push({ icon: CheckCircle2, type: "positive", text: `Mês encerrado com sucesso. Use essa meta como referência para os próximos.` });
      } else {
        insights.push({ icon: AlertCircle, type: "negative", text: `Mês encerrado abaixo do esperado. Considere ajustar a estratégia ou rever a meta.` });
      }
    }

    // Sugestões específicas por tipo de meta
    const suggestions: string[] = [];
    if (status !== "excellent" && status !== "ontrack") {
      switch (goal.goalType) {
        case "loan_volume":
        case "new_loans_count":
          suggestions.push("Intensifique a prospecção de novos clientes e acompanhamento de leads.");
          suggestions.push("Revise as taxas e condições oferecidas para atrair mais contratos.");
          break;
        case "received_total":
        case "interest_received":
          suggestions.push("Reforce a cobrança de parcelas em atraso na aba Cobranças.");
          suggestions.push("Revise contratos com inadimplência recorrente.");
          break;
        case "net_profit":
          suggestions.push("Reduza despesas operacionais não essenciais.");
          suggestions.push("Aumente a margem de juros nos novos contratos.");
          break;
        case "max_default_rate":
          suggestions.push("Ative notificações de cobrança automáticas.");
          suggestions.push("Revise critérios de aprovação de novos empréstimos.");
          break;
        case "new_clients_count":
          suggestions.push("Invista em divulgação e programas de indicação.");
          break;
        case "interest_rate":
          suggestions.push("Ajuste a política de juros padrão nos novos contratos.");
          break;
        case "active_capital":
          suggestions.push("Reaplique o capital recebido em novos empréstimos.");
          break;
      }
    }

    return { status, diff, diffPct, isCurrentMonth, isPastMonth, dayProgressPct, daysLeft, pace, projection, insights, suggestions };
  }, [goal, viewingMonth]);

  if (!goal || !analysis) return null;

  const Icon = goal.meta.icon;
  const statusBadge = {
    excellent: { label: "Meta superada", className: "bg-success/15 text-success border-success/30" },
    ontrack: { label: "No caminho", className: "bg-success/15 text-success border-success/30" },
    warning: { label: "Atenção", className: "bg-warning/15 text-warning border-warning/30" },
    critical: { label: "Crítico", className: "bg-destructive/15 text-destructive border-destructive/30" },
  }[analysis.status];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${goal.meta.bgColor} flex items-center justify-center shrink-0`}>
              <Icon className={`h-5 w-5 ${goal.meta.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base truncate flex items-center gap-2">
                {goal.meta.label}
                {viewingMonth && goal.month !== viewingMonth && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-warning/40 text-warning bg-warning/5 uppercase tracking-wide leading-none shrink-0">
                    Herdada
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {formatMonthLabel(goal.month)} · {goal.meta.description}
              </DialogDescription>
            </div>
          </div>
          {viewingMonth && goal.month !== viewingMonth && (
            <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-warning">Meta herdada de {formatMonthLabel(goal.month)}</p>
                <p className="text-muted-foreground mt-0.5">
                  Não há meta cadastrada para {formatMonthLabel(viewingMonth)}. Os valores realizados e a análise abaixo
                  consideram <strong>{formatMonthLabel(viewingMonth)}</strong>, comparados ao alvo definido em {formatMonthLabel(goal.month)}.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-[11px] border-warning/40 text-warning hover:bg-warning/10"
                  onClick={() => {
                    setNewTarget(String(goal.targetValue));
                    setEditingCreate((v) => !v);
                  }}
                  disabled={creating}
                >
                  <Target className="h-3 w-3" />
                  {editingCreate ? "Cancelar" : `Criar meta para ${formatMonthLabel(viewingMonth)}`}
                </Button>
                {editingCreate && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        Valor-alvo {goal.meta.unit === "R$" ? "(R$)" : goal.meta.unit === "%" ? "(%)" : "(qtd)"}:
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={newTarget}
                        onChange={(e) => setNewTarget(e.target.value)}
                        autoFocus
                        className="flex-1 h-7 rounded-md border border-warning/40 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-warning"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] border-warning/40 text-warning hover:bg-warning/10"
                      onClick={handleCreateForMonth}
                      disabled={creating}
                    >
                      {creating ? "Salvando..." : "Confirmar"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 -mx-6 px-6 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="space-y-4 pb-2">
            {/* Resumo */}
            <Card no3d className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline" className={statusBadge.className}>
                    {statusBadge.label}
                  </Badge>
                  <span className={`text-2xl font-bold ${goal.pct >= 80 ? "text-success" : goal.pct >= 50 ? "text-warning" : "text-destructive"}`}>
                    {goal.pct.toFixed(0)}%
                  </span>
                </div>
                <Progress value={goal.pct} className="h-2 mb-3" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Meta</p>
                    <p className="text-sm font-bold">{fmtValue(goal.targetValue, goal.meta.unit, hidden)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Realizado</p>
                    <p className={`text-sm font-bold ${goal.pct >= 80 ? "text-success" : goal.pct >= 50 ? "text-warning" : "text-destructive"}`}>
                      {fmtValue(goal.actual, goal.meta.unit, hidden)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">{goal.meta.inverse ? "Folga" : "Diferença"}</p>
                    <p className={`text-sm font-bold ${analysis.diff >= 0 ? "text-success" : "text-destructive"}`}>
                      {analysis.diff >= 0 ? "+" : ""}{fmtValue(analysis.diff, goal.meta.unit, hidden)}
                    </p>
                  </div>
                </div>
                {goal.goalType === "profit" && goal.expectedReceivable !== null && goal.targetAmount !== null && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-md border border-border bg-card/60 p-2">
                      <p className="text-[10px] text-muted-foreground uppercase">Previsto a receber</p>
                      <p className="text-sm font-bold text-foreground">{fmtValue(goal.expectedReceivable, "R$", hidden)}</p>
                    </div>
                    <div className="rounded-md border border-success/30 bg-success/5 p-2">
                      <p className="text-[10px] text-muted-foreground uppercase">Meta em valor</p>
                      <p className="text-sm font-bold text-success">{fmtValue(goal.targetAmount, "R$", hidden)}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Progresso temporal */}
            {analysis.isCurrentMonth && (
              <Card no3d>
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" /> Progresso do Mês
                  </h4>
                  <Progress value={analysis.dayProgressPct} className="h-1.5 mb-2" />
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{analysis.dayProgressPct.toFixed(0)}% do mês decorrido</span>
                    <span>{analysis.daysLeft} dias restantes</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Insights */}
            <Card no3d>
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Análise Inteligente
                </h4>
                <div className="space-y-2">
                  {analysis.insights.map((ins, i) => {
                    const InsIcon = ins.icon;
                    const colorMap = {
                      positive: "text-success bg-success/10 border-success/20",
                      warning: "text-warning bg-warning/10 border-warning/20",
                      negative: "text-destructive bg-destructive/10 border-destructive/20",
                      info: "text-primary bg-primary/10 border-primary/20",
                    };
                    return (
                      <div key={i} className={`flex items-start gap-2 p-2 rounded-md border ${colorMap[ins.type]}`}>
                        <InsIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <p className="text-xs leading-snug">{ins.text}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Sugestões */}
            {analysis.suggestions.length > 0 && (
              <Card no3d className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-primary" /> Sugestões de Ajuste
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.suggestions.map((s, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {goal.notes && (
              <Card no3d>
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-foreground mb-2">Notas</h4>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{goal.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Como esta meta é calculada */}
            {(() => {
              const exp = GOAL_EXPLANATIONS[goal.goalType];
              if (!exp) return null;
              return (
                <Card no3d className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                        <BookOpen className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-foreground leading-tight">Como esta meta é calculada</h4>
                        <p className="text-[10px] text-muted-foreground leading-tight">Entenda a fórmula, os dados e veja um exemplo prático</p>
                      </div>
                    </div>

                    {/* Fórmula */}
                    <div className="rounded-md border border-border bg-card/60 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Calculator className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Fórmula</span>
                      </div>
                      <p className="text-xs text-foreground leading-snug font-mono bg-muted/40 rounded px-2 py-1.5">
                        {exp.formula}
                      </p>
                    </div>

                    {/* Indicadores */}
                    <div className="rounded-md border border-border bg-card/60 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Target className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Indicadores considerados</span>
                      </div>
                      <ul className="space-y-1">
                        {exp.indicators.map((ind, i) => (
                          <li key={i} className="text-xs text-foreground flex items-start gap-2 leading-snug">
                            <span className="text-primary mt-0.5">•</span>
                            <span>{ind}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Origem dos dados */}
                    <div className="rounded-md border border-border bg-card/60 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Database className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Origem dos dados</span>
                      </div>
                      <ul className="space-y-1">
                        {exp.dataSource.map((src, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2 leading-snug">
                            <span className="text-primary mt-0.5">›</span>
                            <span>{src}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Exemplo prático */}
                    <div className="rounded-md border border-success/30 bg-success/5 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <FlaskConical className="h-3.5 w-3.5 text-success" />
                        <span className="text-[11px] font-semibold text-success uppercase tracking-wide">Exemplo prático</span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase">Cenário</span>
                          <p className="text-foreground leading-snug">{exp.example.setup}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase">Cálculo</span>
                          <p className="text-foreground leading-snug font-mono bg-muted/40 rounded px-2 py-1">{exp.example.calc}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase">Resultado</span>
                          <p className="text-success font-semibold leading-snug">{exp.example.result}</p>
                        </div>
                      </div>
                    </div>

                    {/* Como é medido */}
                    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">Como o progresso é medido</span>
                      </div>
                      <p className="text-xs text-foreground leading-snug">{exp.measurement}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
