import { buildScheduledReportHandler } from "../_shared/scheduled-report.ts";

Deno.serve(buildScheduledReportHandler({
  prefsTable: "telegram_overdue_loans_prefs",
  command: "emprestimos_atrasados",
  trackSendTimeInLastSent: true,
}));
