import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { Loan } from "@/types/loan";

interface Props {
  onAdd: (loan: Omit<Loan, "id" | "status" | "paidInstallments">) => void;
  onClose: () => void;
}

export function LoanForm({ onAdd, onClose }: Props) {
  const getDefaultDueDate = (start: string) => {
    const d = new Date(start + "T00:00:00");
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0];
  };

  const defaultStart = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    borrowerName: "",
    amount: "",
    interestRate: "",
    installments: "",
    startDate: defaultStart,
    dueDate: getDefaultDueDate(defaultStart),
    notes: "",
  });

  const amount = parseFloat(form.amount) || 0;
  const rate = parseFloat(form.interestRate) || 0;
  const installments = parseInt(form.installments) || 0;

  const monthlyPayment = installments > 0 ? calculateInstallment(amount, rate, installments) : 0;
  const totalAmount = installments > 0 ? calculateTotalWithInterest(amount, rate, installments) : 0;
  const totalInterest = totalAmount - amount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.borrowerName || !amount || !rate || !installments) return;

    onAdd({
      borrowerName: form.borrowerName,
      amount,
      interestRate: rate,
      installments,
      startDate: form.startDate,
      dueDate: form.dueDate || form.startDate,
      notes: form.notes,
    });
    onClose();
  };

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

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
              <Label htmlFor="borrowerName">Nome do Devedor</Label>
              <Input
                id="borrowerName"
                value={form.borrowerName}
                onChange={(e) => update("borrowerName", e.target.value)}
                placeholder="Ex: João Silva"
                required
              />
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
              <div className="rounded-lg bg-muted p-4 space-y-1">
                <p className="text-sm font-medium text-foreground">Simulação</p>
                <div className="grid grid-cols-3 gap-2 text-sm text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground">
                      {formatCurrency(monthlyPayment)}
                    </p>
                    <p className="text-xs">Parcela</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {formatCurrency(totalAmount)}
                    </p>
                    <p className="text-xs">Total</p>
                  </div>
                  <div>
                    <p className="font-medium text-accent">
                      {formatCurrency(totalInterest)}
                    </p>
                    <p className="text-xs">Juros</p>
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
