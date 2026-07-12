import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Eye } from "lucide-react";
import { InfoPopover } from "@/components/dashboard/InfoPopover";

interface PortfolioLike {
  capitalOnStreet: number;
  pendingReceivable: number;
  estimatedProfit: number;
}

interface Props {
  portfolio: PortfolioLike;
  periodProfitRealized: number;
  periodProfitExpected: number;
  formatCurrency: (value: number) => string;
  onOpenInterestReceived: () => void;
  onOpenInterestExpectedAll: () => void;
  onOpenInterestPending: () => void;
}

export function DashboardPortfolioMetrics({
  portfolio,
  periodProfitRealized,
  periodProfitExpected,
  formatCurrency,
  onOpenInterestReceived,
  onOpenInterestExpectedAll,
  onOpenInterestPending,
}: Props) {
  const interestReceivedInPeriod = periodProfitRealized;
  const interestPendingInPeriod = periodProfitExpected;
  const interestDueInPeriod = interestReceivedInPeriod + interestPendingInPeriod;

  const items: Array<{
    label: string;
    value: string;
    color: string;
    iconBg: string;
    iconColor: string;
    onClick?: () => void;
    tooltip?: string;
  }> = [
    { label: "Capital na Rua", value: formatCurrency(portfolio.capitalOnStreet), color: "text-foreground", iconBg: "bg-primary/10", iconColor: "text-primary", tooltip: "Principal proporcional ainda em aberto: para cada contrato ativo, valor emprestado × (parcelas restantes ÷ total de parcelas). Diminui conforme as parcelas são pagas." },
    { label: "Pendente de Recebimento", value: formatCurrency(portfolio.pendingReceivable), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success", tooltip: "Valor restante a receber de todos os contratos de empréstimos ativos." },
    { label: "Lucro Estimado", value: formatCurrency(portfolio.estimatedProfit), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success", tooltip: "Soma dos 'Juros a Receber' pendentes de todos os contratos ativos, usando a mesma fórmula do Histórico do Cliente (saldo restante × proporção de juros + encargos por atraso). Igual ao valor exibido em 'Juros a Receber' no módulo de histórico do cliente." },
    { label: "Juros a Receber no Mês", value: formatCurrency(interestDueInPeriod), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success", onClick: onOpenInterestExpectedAll, tooltip: "Soma dos 'Juros Recebidos no Mês' + 'Juros Pendentes do Mês'. Representa o total de juros do período: o que já entrou somado ao que ainda falta receber. Clique para ver o detalhamento." },
    { label: "Juros Recebidos", value: formatCurrency(interestReceivedInPeriod), color: "text-warning", iconBg: "bg-warning/10", iconColor: "text-warning", onClick: onOpenInterestReceived, tooltip: "Critério: DATA DE PAGAMENTO + contabilidade JUROS PRIMEIRO. Cada pagamento amortiza antes o juros pendente do contrato; juros avulsos (sem parcela) contam 100% como juros; na quitação, todo o lucro residual (incl. acordos com bônus ou desconto) é alocado ao último pagamento. Clique para ver o detalhamento." },
    { label: "Juros Pendentes do Mês", value: formatCurrency(interestPendingInPeriod), color: "text-warning", iconBg: "bg-warning/10", iconColor: "text-warning", onClick: onOpenInterestPending, tooltip: "Diferença entre 'Juros a Receber no Mês' (vencimento) e 'Juros Recebidos no Mês' (pagamento). Clique para ver o detalhamento do que está pendente de recebimento." },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4 items-stretch">
      {items.map((item) => (
        <Card
          no3d
          key={item.label}
          className={`h-full ${item.onClick ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""}`}
          onClick={item.onClick}
        >
          <CardContent className="h-full p-4 flex flex-col items-center text-center relative gap-2">
            {item.tooltip && <InfoPopover text={item.tooltip} />}
            {item.onClick && <Eye className="h-3.5 w-3.5 text-muted-foreground absolute top-2 right-2" />}
            <div className={`h-9 w-9 rounded-lg ${item.iconBg} flex items-center justify-center shrink-0`}>
              <DollarSign className={`h-4 w-4 ${item.iconColor}`} />
            </div>
            <p className="text-xs font-medium text-muted-foreground leading-tight min-h-[32px] flex items-center justify-center px-1">
              {item.label}
            </p>
            <p className={`text-base md:text-lg font-bold tabular-nums leading-tight ${item.color} mt-auto`}>
              {item.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
