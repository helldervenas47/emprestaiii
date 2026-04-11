import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { Loan, Client } from "@/types/loan";

interface Props {
  onAdd: (loan: Omit<Loan, "id" | "status" | "paidInstallments">) => void;
  onClose: () => void;
  clients: Client[];
}

export function LoanForm({ onAdd, onClose, clients }: Props) {
  const activeClients = clients.filter((c) => c.active);
  const getDefaultDueDate = (start: string, frequency: string) => {
    const d = new Date(start + "T00:00:00");
    if (frequency === "Semanal") d.setDate(d.getDate() + 7);
    else if (frequency === "Quinzenal") d.setDate(d.getDate() + 15);
    else d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0];
  };

  const defaultStart = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    borrowerName: "",
    amount: "",
    interestRate: "30",
    installments: "1",
    startDate: defaultStart,
    dueDate: getDefaultDueDate(defaultStart, "Mensal"),
    notes: "",
    interestType: "Mensal",
  });

  const amount = parseFloat(form.amount) || 0;
  const rate = parseFloat(form.interestRate) || 0;
  const installments = parseInt(form.installments) || 0;

  const calcMonthly = installments > 0 ? calculateInstallment(amount, rate, installments) : 0;
  const calcTotal = installments > 0 ? calculateTotalWithInterest(amount, rate, installments) : 0;
  const calcInterest = calcTotal - amount;

  const [monthlyOverride, setMonthlyOverride] = useState("");
  const [interestOverride, setInterestOverride] = useState("");

  // Reset overrides when inputs change
  useEffect(() => {
    setMonthlyOverride("");
    setInterestOverride("");
  }, [form.amount, form.interestRate, form.installments]);

  const monthlyPayment = monthlyOverride !== "" ? parseFloat(monthlyOverride) || 0 : calcMonthly;
  const totalInterest = interestOverride !== "" ? parseFloat(interestOverride) || 0 : calcInterest;
  const totalAmount = amount + totalInterest;

  const handleMonthlyChange = (val: string) => {
    setMonthlyOverride(val);
    const mp = parseFloat(val) || 0;
    if (mp > 0 && installments > 0) {
      const newTotal = mp * installments;
      setInterestOverride((newTotal - amount).toFixed(2));
    }
  };

  const handleInterestChange = (val: string) => {
    setInterestOverride(val);
    const ti = parseFloat(val) || 0;
    if (installments > 0) {
      setMonthlyOverride(((amount + ti) / installments).toFixed(2));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedClient = activeClients.find((c) => c.id === form.borrowerName);
    if (!selectedClient || !amount || !rate || !installments) return;

    onAdd({
      borrowerName: selectedClient.name,
      borrowerId: selectedClient.id,
      amount,
      interestRate: rate,
      interestType: form.interestType,
      paymentType: "Parcelado",
      installments,
      startDate: form.startDate,
      dueDate: form.dueDate || form.startDate,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  const update = (field: string, value: string) =>
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "startDate" && value) {
        next.dueDate = getDefaultDueDate(value, next.interestType);
      }
      if (field === "interestType" && next.startDate) {
        next.dueDate = getDefaultDueDate(next.startDate, value);
      }
      return next;
    });

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Novo Empréstimo</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Cliente</Label>
              {activeClients.length === 0 ? (
                <p className="text-sm text-destructive mt-1">Nenhum cliente ativo cadastrado. Cadastre um cliente primeiro.</p>
              ) : (
                <Select value={form.borrowerName} onValueChange={(v) => update("borrowerName", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">Valor (R$)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => update("amount", e.target.value)}
                  placeholder="1000.00"
                  required
                />
              </div>
              <div>
                <Label htmlFor="interestRate">Juros Mensal (%)</Label>
                <Input
                  id="interestRate"
                  type="number"
                  step="0.1"
                  value={form.interestRate}
                  onChange={(e) => update("interestRate", e.target.value)}
                  placeholder="5"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="installments">Parcelas</Label>
                <Input
                  id="installments"
                  type="number"
                  value={form.installments}
                  onChange={(e) => update("installments", e.target.value)}
                  placeholder="12"
                  required
                />
              </div>
              <div>
                <Label htmlFor="startDate">Data Início</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => update("startDate", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="dueDate">Data Fim</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => update("dueDate", e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Notas sobre o empréstimo..."
                rows={2}
              />
            </div>

            {amount > 0 && installments > 0 && (
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Simulação (editável)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Parcela (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={monthlyOverride !== "" ? monthlyOverride : calcMonthly.toFixed(2)}
                      onChange={(e) => handleMonthlyChange(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Total (R$)</Label>
                    <p className="h-8 flex items-center text-sm font-medium text-foreground">
                      {formatCurrency(totalAmount)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Juros Total (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={interestOverride !== "" ? interestOverride : calcInterest.toFixed(2)}
                      onChange={(e) => handleInterestChange(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Registrar Empréstimo
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
