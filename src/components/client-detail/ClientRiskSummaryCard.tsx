import { AlertTriangle, CheckCircle2, CircleDot } from "lucide-react";
import { ClientRiskMetrics, RiskProfile } from "@/lib/clientRisk";

interface ClientRiskSummaryCardProps {
  metrics: ClientRiskMetrics;
  riskProfile: RiskProfile;
}

export function ClientRiskSummaryCard({ metrics, riskProfile }: ClientRiskSummaryCardProps) {
  const tone = getRiskTone(riskProfile.currentScore, metrics.maxOverdueDays);
  const status = getStatusLabel(riskProfile.currentScore, metrics.maxOverdueDays);
  const criticalIndicator = getCriticalIndicator(metrics);

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className={`text-5xl font-bold leading-none ${tone.scoreClass}`}>{riskProfile.currentScore}</span>
            <span className={`mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border ${tone.dotClass}`}>
              <CircleDot className="h-4 w-4" />
            </span>
          </div>

          <div className="space-y-1">
            <p className={`text-base font-semibold ${tone.statusClass}`}>{status}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {tone.icon === "alert" ? <AlertTriangle className="h-4 w-4 text-warning" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
              <span>{criticalIndicator}</span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Histórico: <span className="font-medium text-foreground">{riskProfile.historicalScore} / 150</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function getStatusLabel(currentScore: number, maxOverdueDays: number) {
  if (maxOverdueDays > 30 || currentScore < 60) return "Alto risco";
  if (currentScore >= 80) return "Bom pagador";
  return "Atenção";
}

function getCriticalIndicator(metrics: ClientRiskMetrics) {
  if (metrics.maxOverdueDays > 0) {
    return `Atraso de ${metrics.maxOverdueDays} dia${metrics.maxOverdueDays > 1 ? "s" : ""}`;
  }

  if (metrics.overdueLoans > 0) {
    return `${metrics.overdueLoans} contrato${metrics.overdueLoans > 1 ? "s" : ""} em atraso`;
  }

  if (metrics.latePayments > 0) {
    return `${metrics.latePayments} pagamento${metrics.latePayments > 1 ? "s" : ""} com atraso`;
  }

  if (metrics.onTimePayments > 0 || metrics.paidLoans > 0) {
    return "Histórico positivo";
  }

  return "Score neutro inicial";
}

function getRiskTone(currentScore: number, maxOverdueDays: number) {
  if (maxOverdueDays > 30 || currentScore < 60) {
    return {
      scoreClass: "text-destructive",
      statusClass: "text-destructive",
      dotClass: "border-destructive/20 bg-destructive/10 text-destructive",
      icon: "alert" as const,
    };
  }

  if (currentScore >= 80) {
    return {
      scoreClass: "text-success",
      statusClass: "text-success",
      dotClass: "border-success/20 bg-success/10 text-success",
      icon: "positive" as const,
    };
  }

  return {
    scoreClass: "text-warning",
    statusClass: "text-warning",
    dotClass: "border-warning/20 bg-warning/10 text-warning",
    icon: "alert" as const,
  };
}