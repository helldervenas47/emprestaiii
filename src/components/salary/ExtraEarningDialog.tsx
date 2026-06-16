import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployees } from "@/hooks/useEmployees";
import { usePayrolls, buildPayrollFromEmployee } from "@/hooks/usePayrolls";
import { todayInAppTz } from "@/lib/timezone";
import type { PayrollItems, SalaryItem } from "@/types/salary";

const EARNING_TYPES = [
  { value: "13_salario", label: "13º Salário" },
  { value: "ferias", label: "Férias" },
  { value: "1_3_ferias", label: "1/3 de Férias" },
  { value: "adicional", label: "Adicional" },
  { value: "bonificacao", label: "Bonificação" },
  { value: "hora_extra", label: "Hora Extra" },
  { value: "comissao", label: "Comissão" },
  { value: "outros", label: "Outros proventos" },
];

export function ExtraEarningDialog() {
  const { employees } = useEmployees();
  const { payrolls, generatePayroll, updatePayroll } = usePayrolls();

  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [type, setType] = useState<string>("13_salario");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("0");
  const [paymentDate, setPaymentDate] = useState(todayInAppTz());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setType("13_salario");
      setDescription("");
      setAmount("0");
      setPaymentDate(todayInAppTz());
      setNotes("");
      setSubmitting(false);
    }
  }, [open]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === "ativo" || e.status === "ferias"),
    [employees]
  );

  const competenceLabel = useMemo(() => {
    try {
      return format(parseISO(paymentDate + "T00:00:00"), "MMMM 'de' yyyy", { locale: ptBR });
    } catch { return ""; }
  }, [paymentDate]);

  const typeLabel = EARNING_TYPES.find((t) => t.value === type)?.label ?? "Provento";

  const handleSubmit = async () => {
    if (submitting) return;
    const v = Number(amount) || 0;
    if (!employeeId) { toast.error("Selecione um funcionário"); return; }
    if (v <= 0) { toast.error("Informe um valor maior que zero"); return; }
    if (!paymentDate) { toast.error("Informe a data de pagamento"); return; }

    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) { toast.error("Funcionário não encontrado"); return; }

    setSubmitting(true);
    try {
      const competence = paymentDate.slice(0, 7);
      let payroll = payrolls.find((p) => p.employeeId === employeeId && p.competence === competence);
      if (!payroll) {
        payroll = await generatePayroll(employee, competence, paymentDate) ?? undefined;
      }
      if (!payroll) throw new Error("Não foi possível criar/obter a folha do mês");

      const label = description.trim()
        ? `${typeLabel} - ${description.trim()}`
        : typeLabel;
      const newItem: SalaryItem = { label, amount: v, kind: type };

      const baseItems: PayrollItems = payroll.items ?? buildPayrollFromEmployee(employee).items;
      const newItems: PayrollItems = {
        earnings: [...(baseItems.earnings ?? []), newItem],
        deductions: [...(baseItems.deductions ?? [])],
      };

      await updatePayroll(payroll.id, {
        items: newItems,
        notes: notes.trim()
          ? `${payroll.notes ? payroll.notes + "\n" : ""}[${typeLabel}] ${notes.trim()}`
          : payroll.notes,
      });

      toast.success("Provento adicionado", {
        description: `${typeLabel} lançado na folha de ${competenceLabel}`,
      });
      setOpen(false);
    } catch (e: any) {
      toast.error("Falha ao adicionar provento", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) setOpen(o); }}>
      <DialogTrigger asChild>
        <Button size="icon" className="rounded-full" title="Adicionar provento (13º, férias, etc)">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Lançar provento trabalhista</DialogTitle>
          <DialogDescription>
            Adicione 13º, férias ou outros proventos. A folha será atualizada conforme a data de pagamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Funcionário</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {activeEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
                {activeEmployees.length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Nenhum funcionário cadastrado.</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tipo de provento</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EARNING_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Férias 30 dias - jul/2026"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor</Label>
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
            <div>
              <Label>Data de pagamento</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>

          {competenceLabel && (
            <div className="text-xs text-muted-foreground">
              Será lançado na folha de <span className="font-medium capitalize">{competenceLabel}</span>.
            </div>
          )}

          <div>
            <Label>Observações (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Detalhes adicionais"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !employeeId || !Number(amount)}>
            {submitting ? "Salvando..." : "Lançar provento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
