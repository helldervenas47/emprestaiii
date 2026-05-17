import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Wallet, FileText, Lock, Unlock, RefreshCw, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useEmployees } from "@/hooks/useEmployees";
import { usePayrolls } from "@/hooks/usePayrolls";
import { useAppBranding } from "@/hooks/useAppBranding";
import { generatePayslipPdf } from "@/lib/payslipPdf";
import type { Payroll } from "@/types/salary";
import { todayInAppTz } from "@/lib/timezone";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props { readOnly?: boolean }

export function PayrollManager({ readOnly }: Props) {
  const { employees } = useEmployees();
  const { payrolls, generateMonthlyBatch, payPayroll, reopenPayroll, closePayroll, deletePayroll } = usePayrolls();
  const branding = useAppBranding();
  const [monthOffset, setMonthOffset] = useState(0);
  const [payingId, setPayingId] = useState<string | null>(null);

  const competence = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return format(d, "yyyy-MM");
  }, [monthOffset]);

  const monthRows = useMemo(() => {
    return payrolls.filter((p) => p.competence === competence);
  }, [payrolls, competence]);

  const totals = useMemo(() => {
    const gross = monthRows.reduce((s, p) => s + p.grossSalary + p.totalBenefits, 0);
    const net = monthRows.reduce((s, p) => s + p.netSalary, 0);
    const paid = monthRows.reduce((s, p) => s + p.paidAmount, 0);
    const pending = net - paid;
    return { gross, net, paid, pending };
  }, [monthRows]);

  const handleGenerate = async () => {
    const created = await generateMonthlyBatch(employees, competence);
    if (created.length === 0) toast.info("Folha já existe para todos os funcionários ativos.");
    else toast.success(`${created.length} folha(s) gerada(s)`);
  };

  const targetPayroll = monthRows.find((p) => p.id === payingId) ?? null;
  const targetEmployee = targetPayroll ? employees.find((e) => e.id === targetPayroll.employeeId) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMonthOffset((m) => m - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="font-semibold text-lg capitalize min-w-[180px] text-center">
            {format(parseISO(competence + "-01"), "MMMM 'de' yyyy", { locale: ptBR })}
          </div>
          <Button variant="outline" size="icon" onClick={() => setMonthOffset((m) => m + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {!readOnly && (
          <Button onClick={handleGenerate} className="sm:ml-auto"><RefreshCw className="h-4 w-4" /> Gerar folha do mês</Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total bruto" value={BRL(totals.gross)} />
        <StatCard label="Total líquido" value={BRL(totals.net)} />
        <StatCard label="Pago" value={BRL(totals.paid)} tone="success" />
        <StatCard label="Pendente" value={BRL(totals.pending)} tone={totals.pending > 0 ? "warn" : "muted"} />
      </div>

      <div className="space-y-2">
        {monthRows.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            Nenhuma folha gerada para esta competência.
          </CardContent></Card>
        )}
        {monthRows.map((p) => {
          const emp = employees.find((e) => e.id === p.employeeId);
          const remaining = Math.max(0, p.netSalary - p.paidAmount);
          return (
            <Card key={p.id}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{emp?.name ?? "Funcionário"}</p>
                    <StatusBadge status={p.status} />
                    {p.closed && <Badge variant="outline" className="text-[10px]"><Lock className="h-3 w-3" /> Fechada</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{emp?.role ?? ""}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-right text-sm">
                  <div><div className="text-[10px] text-muted-foreground uppercase">Bruto</div><div>{BRL(p.grossSalary + p.totalBenefits)}</div></div>
                  <div><div className="text-[10px] text-muted-foreground uppercase">Desc.</div><div className="text-destructive">{BRL(p.totalDeductions)}</div></div>
                  <div><div className="text-[10px] text-muted-foreground uppercase">Líquido</div><div className="font-semibold">{BRL(p.netSalary)}</div></div>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:ml-2">
                  {!readOnly && remaining > 0 && (
                    <Button size="sm" onClick={() => setPayingId(p.id)}><Wallet className="h-3 w-3" /> Pagar</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => emp && generatePayslipPdf(p, emp, { brandName: branding.brandName })}>
                    <FileText className="h-3 w-3" /> Contracheque
                  </Button>
                  {!readOnly && (p.closed
                    ? <Button size="sm" variant="ghost" onClick={() => reopenPayroll(p)}><Unlock className="h-3 w-3" /></Button>
                    : <Button size="sm" variant="ghost" onClick={() => closePayroll(p)}><Lock className="h-3 w-3" /></Button>)}
                  {!readOnly && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      if (confirm("Excluir esta folha?")) { await deletePayroll(p.id); toast.success("Folha excluída"); }
                    }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PayDialog
        open={!!targetPayroll}
        onOpenChange={(o) => !o && setPayingId(null)}
        payroll={targetPayroll}
        onConfirm={async (amount, date) => {
          if (!targetPayroll) return;
          await payPayroll(targetPayroll, targetEmployee ?? undefined, amount, { paidDate: date });
          toast.success("Pagamento registrado", { description: "Despesa criada na categoria Salários." });
          setPayingId(null);
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: Payroll["status"] }) {
  const map = {
    pago: { label: "Pago", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    parcial: { label: "Parcial", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    pendente: { label: "Pendente", className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
    atrasado: { label: "Atrasado", className: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
  } as const;
  const it = map[status];
  return <Badge variant="outline" className={`text-[10px] ${it.className}`}>{it.label}</Badge>;
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "warn" | "muted" }) {
  const color = tone === "success" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <Card><CardContent className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </CardContent></Card>
  );
}

function PayDialog({ open, onOpenChange, payroll, onConfirm }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payroll: Payroll | null;
  onConfirm: (amount: number, date: string) => void | Promise<void>;
}) {
  const remaining = payroll ? Math.max(0, payroll.netSalary - payroll.paidAmount) : 0;
  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(todayInAppTz());

  // sync when payroll changes
  useMemo(() => { setAmount(String(remaining)); }, [remaining]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Pagar salário</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">Restante: <span className="font-semibold">{BRL(remaining)}</span></div>
          <div><Label>Valor</Label><MoneyInput value={amount} onChange={setAmount} /></div>
          <div><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onConfirm(Number(amount) || 0, date)} disabled={!Number(amount)}>
            <CheckCircle2 className="h-4 w-4" /> Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
