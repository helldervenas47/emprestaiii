import { buildScheduledReportHandler } from "../_shared/scheduled-report.ts";

Deno.serve(buildScheduledReportHandler({
  prefsTable: "telegram_due_today_loans_prefs",
  command: "vencimentos_hoje",
}));
