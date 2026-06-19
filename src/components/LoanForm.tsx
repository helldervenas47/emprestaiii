import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, CalendarIcon, ChevronDown, ChevronRight } from "lucide-react";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { Loan, Client } from "@/types/loan";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCreditLimits } from "@/hooks/useCreditLimits";
import { computeAvailableLimit, computeUsedLimit, formatBRL } from "@/lib/creditLimit";
import { Wallet, AlertTriangle as AlertTriangleIcon } from "lucide-react";
import { LoanPaymentSplitEditor, buildSplitFromState, type SplitState } from "@/components/LoanPaymentSplitEditor";

interface Props {
  onAdd: (loan: Omit<Loan, "id" | "status" | "paidInstallments"> & { paymentMethodId?: string | null; paymentSplit?: import("@/types/loan").PaymentSplit | null }) => Promise<string | null>;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  onClose: () => void;
  clients: Client[];
  loans: Loan[];
  payments: { id: string; loanId: string; amount: number; date: string; installmentNumber: number; previousDueDate?: string }[];
  installmentSchedules: { id?: string; loanId: string; installmentNumber: number; dueDate: string; amount: number }[];
  existingTags?: string[];
  /** Optional initial values, e.g. when coming from the loan simulator. */
  prefill?: {
    clientId: string | null;
    clientName: string;
    amount: number;
    interestRate: number;
    installments: number;
    customInstallmentValue?: number | null;
  };
}

function getNextDate(base: Date, frequency: string, periods: number): Date {
  const d = new Date(base);
  if (frequency === "Diário") d.setDate(d.getDate() + periods);
  else if (frequency === "Semanal") d.setDate(d.getDate() + 7 * periods);
  else if (frequency === "Quinzenal") d.setDate(d.getDate() + 15 * periods);
  else d.setMonth(d.getMonth() + periods);
  return d;
}

export function LoanForm({ onAdd, onSaveSchedule, onClose, clients, loans, payments, installmentSchedules, existingTags = [], prefill }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [splitState, setSplitState] = useState<SplitState>({ method1Id: null, method2Id: null, amount1: "", amount2: "", enabled: false });
  const [showFormError, setShowFormError] = useState(false);
  const activeClients = clients.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const defaultStart = todayInAppTz();
  const defaultFirstDue = new Date();
  defaultFirstDue.setMonth(defaultFirstDue.getMonth() + 1);

  const [form, setForm] = useState({
    borrowerName: prefill?.clientId ?? "",
    amount: prefill?.amount ? String(prefill.amount) : "",
    interestRate: prefill?.interestRate != null ? String(prefill.interestRate) : "30",
    installments: prefill?.installments ? String(prefill.installments) : "1",
    startDate: defaultStart,
    notes: "",
    interestType: "Mensal",
  });

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [hasManager, setHasManager] = useState(false);
  const [isSale, setIsSale] = useState(false);
  const [managerId, setManagerId] = useState<string>("");
  const [commissionRate, setCommissionRate] = useState<string>("10");
  const [commissionAmount, setCommissionAmount] = useState<string>("");
  // Tracks which commission field was last edited so we can highlight it and avoid loops
  const [commissionLastEdited, setCommissionLastEdited] = useState<"rate" | "amount">("rate");

  const toggleHasManager = (checked: boolean) => {
    setHasManager(checked);
    setForm((prev) => ({ ...prev, interestRate: checked ? "20" : "30" }));
  };

  const [firstDueDate, setFirstDueDate] = useState<Date>(defaultFirstDue);
  const [showSchedule, setShowSchedule] = useState(false);

  const managerClients = activeClients.filter((c) => c.isManager);
  const selectedClient = useMemo(() => activeClients.find((c) => c.id === form.borrowerName), [activeClients, form.borrowerName]);

  const { getLimitForClient } = useCreditLimits();
  const selectedClientLimit = selectedClient ? getLimitForClient(selectedClient.id) : undefined;
  const selectedClientUsed = useMemo(
    () => (selectedClient ? computeUsedLimit(selectedClient, loans) : 0),
    [selectedClient, loans],
  );
  const selectedClientAvailable = computeAvailableLimit(
    selectedClientLimit?.currentLimit ?? 0,
    selectedClientUsed,
  );
  const requestedAmount = parseFloat(form.amount.replace(",", ".")) || 0;
  const exceedsLimit = !!selectedClient && requestedAmount > selectedClientAvailable && (selectedClientLimit?.currentLimit ?? 0) > 0;

  // Auto-toggle: when selected client is a manager, default hasManager=true
  // Also pre-fill interest rate from client's defaultInterestRate (fallback 30 / 20 with manager)
  useEffect(() => {
    const selected = activeClients.find((c) => c.id === form.borrowerName);
    if (!selected) return;
    if (selected.isManager) {
      setHasManager(true);
      if (!managerId && managerClients.length > 0) {
        setManagerId(selected.id);
      }
    }
    const fallback = (selected.isManager || hasManager) ? 20 : 30;
    const rateToUse = selected.defaultInterestRate != null ? selected.defaultInterestRate : fallback;
    setForm((prev) => ({ ...prev, interestRate: String(rateToUse) }));
  }, [form.borrowerName]);

  const amount = parseFloat(form.amount) || 0;
  const rate = parseFloat(form.interestRate) || 0;
  const installments = parseInt(form.installments) || 0;

  const calcTotal = installments > 0 ? calculateTotalWithInterest(amount, rate, installments) : 0;
  const calcMonthly = installments > 0 ? calcTotal / installments : 0;
  const calcInterest = calcTotal - amount;

  const [monthlyOverride, setMonthlyOverride] = useState("");
  const [monthlyTouched, setMonthlyTouched] = useState(false);
  const [interestOverride, setInterestOverride] = useState("");
  const [interestTouched, setInterestTouched] = useState(false);

  const skipResetRef = (typeof window !== "undefined") ? (window as any) : null;
  // Use a ref to skip the reset effect when overrides are the origin of the rate change
  const skipNextResetRef = useState({ current: false })[0];

  useEffect(() => {
    if (skipNextResetRef.current) {
      skipNextResetRef.current = false;
      return;
    }
    setMonthlyOverride("");
    setMonthlyTouched(false);
    setInterestOverride("");
    setInterestTouched(false);
  }, [form.amount, form.interestRate, form.installments]);

  const monthlyPayment = monthlyOverride !== "" ? parseFloat(monthlyOverride) || 0 : calcMonthly;
  const totalInterest = interestOverride !== "" ? parseFloat(interestOverride) || 0 : calcInterest;
  const totalAmount = amount + totalInterest;

  // Auto-update firstDueDate when startDate or frequency changes
  useEffect(() => {
    if (form.startDate) {
      const start = new Date(form.startDate + "T00:00:00");
      setFirstDueDate(getNextDate(start, form.interestType, 1));
    }
  }, [form.startDate, form.interestType]);

  // Commission sync: base = loan principal (amount). Keeps % and R$ in sync.
  useEffect(() => {
    if (!hasManager || amount <= 0) return;
    if (commissionLastEdited === "rate") {
      const r = parseFloat(commissionRate) || 0;
      const v = (amount * r) / 100;
      const formatted = v > 0 ? v.toFixed(2) : "";
      if (formatted !== commissionAmount) setCommissionAmount(formatted);
    } else {
      const v = parseFloat(commissionAmount) || 0;
      const r = (v / amount) * 100;
      const formatted = r > 0 ? r.toFixed(2) : "";
      if (formatted !== commissionRate) setCommissionRate(formatted);
    }
  }, [hasManager, amount, commissionRate, commissionAmount, commissionLastEdited]);

  const commissionExceedsLoan = hasManager && (parseFloat(commissionAmount) || 0) > amount && amount > 0;

  // Generate schedule rows with editable values
  const [installmentRows, setInstallmentRows] = useState<{ date: Date; value: string }[]>([]);

  // Rebuild rows when installments/firstDueDate/frequency changes
  useEffect(() => {
    if (installments <= 0) {
      setInstallmentRows([]);
      return;
    }
    const baseValue = monthlyPayment > 0 ? monthlyPayment.toFixed(2) : calcMonthly.toFixed(2);
    setInstallmentRows(
      Array.from({ length: installments }, (_, i) => ({
        date: i === 0 ? firstDueDate : getNextDate(firstDueDate, form.interestType, i),
        value: baseValue,
      }))
    );
  }, [installments, firstDueDate, form.interestType]);

  // Sync row values when calcMonthly changes (amount/rate change)
  useEffect(() => {
    if (monthlyOverride !== "" || installmentRows.length === 0) return;
    setInstallmentRows((prev) => prev.map((r) => ({ ...r, value: calcMonthly.toFixed(2) })));
  }, [calcMonthly]);

  const syncRateFromInterest = (ti: number) => {
    if (amount > 0) {
      const newRate = (ti / amount) * 100;
      skipNextResetRef.current = true;
      setForm((prev) => ({ ...prev, interestRate: newRate.toFixed(2) }));
    }
  };

  const handleMonthlyChange = (val: string) => {
    setMonthlyOverride(val);
    setMonthlyTouched(true);
    const mp = parseFloat(val) || 0;
    if (mp > 0 && installments > 0) {
      const newTotal = mp * installments;
      const ti = newTotal - amount;
      setInterestOverride(ti.toFixed(2));
      setInterestTouched(true);
      syncRateFromInterest(ti);
    }
  };

  const handleInterestChange = (val: string) => {
    setInterestOverride(val);
    setInterestTouched(true);
    const ti = parseFloat(val) || 0;
    if (installments > 0) {
      setMonthlyOverride(((amount + ti) / installments).toFixed(2));
      setMonthlyTouched(true);
    }
    syncRateFromInterest(ti);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !amount || !installments || isNaN(rate) || rate < 0) return;
    const effectivePrimaryId = splitState.enabled ? splitState.method1Id : paymentMethodId;
    if (!effectivePrimaryId) {
      setShowFormError(true);
      toast.error("Selecione a forma de pagamento (Conta ou Dinheiro).");
      return;
    }
    const splitResult = buildSplitFromState(splitState, amount);
    if (!splitResult.ok) {
      setShowFormError(true);
      toast.error(splitResult.error);
      return;
    }
    if (hasManager && !managerId) {
      toast.error("Selecione um gerente para o empréstimo com gerente.");
      return;
    }
    if (hasManager && commissionExceedsLoan) {
      toast.error("A comissão não pode ser maior que o valor do empréstimo.");
      return;
    }
    setSubmitting(true);

    const totalWithInterest = calculateTotalWithInterest(amount, rate, installments);

    const firstRowVal = installmentRows.length > 0 ? parseFloat(installmentRows[0].value) || 0 : 0;
    const defaultCalc = calcMonthly;
    const hasCustomValue = firstRowVal > 0 && Math.abs(firstRowVal - defaultCalc) > 0.01;

    const dueDate = installmentRows.length > 0
      ? installmentRows[0].date.toISOString().split("T")[0]
      : firstDueDate.toISOString().split("T")[0];

    const loanId = await onAdd({
      borrowerName: selectedClient.name,
      borrowerId: selectedClient.id,
      amount,
      interestRate: rate,
      interestType: form.interestType,
      paymentType: installments >= 2 ? "Parcelado" : "Juros",
      installments,
      startDate: form.startDate,
      dueDate,
      notes: form.notes,
      remainingAmount: totalWithInterest,
      customInstallmentValue: hasCustomValue ? firstRowVal : null,
      customInterestValue: interestOverride !== "" ? parseFloat(interestOverride) || null : null,
      tags: tags.length > 0 ? tags : undefined,
      hasManager,
      managerId: hasManager && managerId ? managerId : null,
      managerCommissionRate: hasManager ? parseFloat(commissionRate) || 10 : null,
      isSale,
      createdAt: new Date().toISOString(),
      paymentMethodId: effectivePrimaryId,
      paymentSplit: splitResult.split,
    });

    if (loanId && installmentRows.length > 0) {
      await onSaveSchedule(loanId, installmentRows.map((row, idx) => ({
        installmentNumber: idx + 1,
        dueDate: row.date.toISOString().split("T")[0],
        amount: parseFloat(row.value) || 0,
      })));
    }

    setShowSuccess(true);
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 md:items-center md:p-4">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message="Empréstimo registrado!" />
      <Card className="!bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:h-auto md:max-h-[92svh] md:w-full md:max-w-[880px] md:rounded-2xl md:border md:pt-0 md:pb-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2 md:pb-6">
          <CardTitle className="text-xl">Novo Empréstimo</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Cliente — full width */}
              <div className="col-span-2">
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
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.isManager ? " 👔" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Limite de crédito — full width */}
              {selectedClient && (
                <div className={`col-span-2 rounded-lg border p-3 space-y-2 ${exceedsLimit ? "border-warning bg-warning/10" : "border-border bg-muted/20"}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Wallet className={`h-4 w-4 ${exceedsLimit ? "text-warning" : "text-primary"}`} />
                      <p className="text-sm font-medium">Limite de crédito do cliente</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {selectedClientLimit?.mode === "manual" ? "Manual" : "Auto"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md border border-border/60 bg-background px-2.5 py-2">
                      <p className="text-muted-foreground">Total</p>
                      <p className="font-semibold">{formatBRL(selectedClientLimit?.currentLimit ?? 0)}</p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background px-2.5 py-2">
                      <p className="text-muted-foreground">Em uso</p>
                      <p className="font-semibold">{formatBRL(selectedClientUsed)}</p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background px-2.5 py-2">
                      <p className="text-muted-foreground">Disponível</p>
                      <p className={`font-semibold ${selectedClientAvailable < 0 ? "text-destructive" : "text-success"}`}>{formatBRL(selectedClientAvailable)}</p>
                    </div>
                  </div>
                  {exceedsLimit && (
                    <div className="flex items-start gap-2 text-xs text-warning">
                      <AlertTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                      <p>
                        Atenção: este empréstimo de {formatBRL(requestedAmount)} ultrapassa o limite disponível
                        de {formatBRL(selectedClientAvailable)}. Você ainda pode prosseguir.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Valor (R$) */}
              <div>
                <Label htmlFor="amount">Valor (R$)</Label>
                <Input
                  id="amount" type="number" step="0.01"
                  value={form.amount} onChange={(e) => update("amount", e.target.value)}
                  placeholder="1000.00" required
                />
              </div>

              {/* Juros (%) */}
              <div>
                <Label htmlFor="interestRate">Juros (%)</Label>
                <Input
                  id="interestRate" type="number" step="0.1" min="0"
                  value={form.interestRate} onChange={(e) => update("interestRate", e.target.value)}
                  placeholder="0" required
                />
                {installments > 0 && rate > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Juros mensal: {(rate / installments).toFixed(2)}%
                  </p>
                )}
              </div>

              {/* Valor do Juros (R$) */}
              <div>
                <Label htmlFor="interestOverride">Valor do Juros (R$)</Label>
                <Input
                  id="interestOverride"
                  type="number"
                  step="0.01"
                  min="0"
                  value={interestTouched ? interestOverride : (calcInterest > 0 ? calcInterest.toFixed(2) : "")}
                  onChange={(e) => handleInterestChange(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Total de juros do contrato</p>
              </div>

              {/* Valor a Pagar (R$) */}
              <div>
                <Label htmlFor="monthlyOverride">Valor a Pagar (R$)</Label>
                <Input
                  id="monthlyOverride"
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyTouched ? monthlyOverride : (calcMonthly > 0 ? calcMonthly.toFixed(2) : "")}
                  onChange={(e) => handleMonthlyChange(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Valor de cada parcela</p>
              </div>

              {/* Tipo de Contrato */}
              <div>
                <Label>Tipo de Contrato</Label>
                <Select value={form.interestType} onValueChange={(v) => update("interestType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diário">Diário</SelectItem>
                    <SelectItem value="Semanal">Semanal</SelectItem>
                    <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                    <SelectItem value="Mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Parcelas */}
              <div>
                <Label htmlFor="installments">Parcelas</Label>
                <Input
                  id="installments" type="number"
                  value={form.installments} onChange={(e) => update("installments", e.target.value)}
                  placeholder="12" required
                />
              </div>

              {/* Data Início */}
              <div>
                <Label htmlFor="startDate">Data Início</Label>
                <DatePickerField
                  id="startDate"
                  value={form.startDate}
                  onChange={(v) => update("startDate", v)}
                />
              </div>

              {/* Data 1ª Parcela */}
              <div>
                <Label>Data 1ª Parcela</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal h-10", !firstDueDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {firstDueDate ? format(firstDueDate, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={firstDueDate}
                      onSelect={(d) => d && setFirstDueDate(d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Contrato de venda — full width */}
              <div className="border border-border rounded-lg p-3 bg-muted/20 col-span-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isSale"
                    checked={isSale}
                    onChange={(e) => setIsSale(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <Label htmlFor="isSale" className="font-medium cursor-pointer text-sm">
                    Contrato de venda
                  </Label>
                </div>
              </div>

              {/* Empréstimo com gerente — full width */}
              <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20 col-span-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hasManager"
                    checked={hasManager}
                    onChange={(e) => toggleHasManager(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <Label htmlFor="hasManager" className="font-medium cursor-pointer text-sm">
                    Empréstimo com gerente
                  </Label>
                </div>
                {hasManager && (
                  <div className="space-y-3 pt-1 border-t border-border/50">
                    <div>
                      <Label className="text-xs">Gerente</Label>
                      {managerClients.length === 0 ? (
                        <p className="text-xs text-warning mt-1">Nenhum cliente marcado como gerente.</p>
                      ) : (
                        <Select value={managerId} onValueChange={setManagerId}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {managerClients.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Comissão (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={commissionRate}
                          onChange={(e) => {
                            setCommissionLastEdited("rate");
                            setCommissionRate(e.target.value);
                          }}
                          className={cn(
                            "h-9 text-sm",
                            commissionLastEdited === "rate" && "ring-2 ring-primary/40 border-primary/50",
                          )}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Valor da comissão (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={commissionAmount}
                          onChange={(e) => {
                            setCommissionLastEdited("amount");
                            setCommissionAmount(e.target.value);
                          }}
                          placeholder="0,00"
                          className={cn(
                            "h-9 text-sm",
                            commissionLastEdited === "amount" && "ring-2 ring-primary/40 border-primary/50",
                          )}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Base: valor do empréstimo {amount > 0 ? `(${formatCurrency(amount)})` : ""}. Os campos são sincronizados em tempo real.
                    </p>
                    {commissionExceedsLoan && (
                      <p className="text-[11px] text-destructive">
                        A comissão não pode ser maior que o valor do empréstimo.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Etiquetas — full width */}
              <div className="col-span-2">
                <Label>Etiquetas</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 text-xs">
                      {tag}
                      <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagInput.trim()) {
                        e.preventDefault();
                        if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]);
                        setTagInput("");
                      }
                    }}
                    placeholder="Digite e pressione Enter"
                    className="h-9 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={() => {
                      if (tagInput.trim() && !tags.includes(tagInput.trim())) {
                        setTags([...tags, tagInput.trim()]);
                        setTagInput("");
                      }
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  {existingTags.filter(t => !tags.includes(t)).length > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="end">
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                          {existingTags
                            .filter(t => !tags.includes(t))
                            .sort((a, b) => a.localeCompare(b, "pt-BR"))
                            .map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                className="text-left text-sm px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
                                onClick={() => setTags([...tags, tag])}
                              >
                                {tag}
                              </button>
                            ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>

              {/* Forma de pagamento / split — full width */}
              <div className="col-span-2">
                <LoanPaymentSplitEditor
                  total={amount}
                  state={{ ...splitState, method1Id: splitState.enabled ? splitState.method1Id : paymentMethodId }}
                  onChange={(next) => {
                    setShowFormError(false);
                    setPaymentMethodId(next.method1Id);
                    setSplitState(next);
                  }}
                  showError={showFormError}
                />
              </div>

              {/* Observações — full width */}
              <div className="col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes" value={form.notes} onChange={(e) => update("notes", e.target.value)}
                  placeholder="Notas sobre o empréstimo..." rows={2}
                />
              </div>

              {/* Simulação (editável) — full width */}
              {amount > 0 && installments > 0 && (
                <div className="rounded-lg bg-muted p-4 space-y-3 col-span-2">
                  <p className="text-sm font-medium text-foreground">Simulação (editável)</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Parcela (R$)</Label>
                      <Input
                        type="number" step="0.01"
                        value={monthlyTouched ? monthlyOverride : calcMonthly.toFixed(2)}
                        onChange={(e) => handleMonthlyChange(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Total a Receber (R$)</Label>
                      <p className="h-8 flex items-center text-sm font-bold text-primary">
                        {formatCurrency(totalAmount)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Juros Total (R$)</Label>
                      <Input
                        type="number" step="0.01"
                        value={interestOverride !== "" ? interestOverride : calcInterest.toFixed(2)}
                        onChange={(e) => handleInterestChange(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Parcelas editáveis — full width */}
              {installments >= 2 && (
                <div className="rounded-lg border border-border/50 overflow-hidden col-span-2">
                  <button
                    type="button"
                    onClick={() => setShowSchedule(!showSchedule)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                  >
                    {showSchedule ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Parcelas ({installments}x)
                    <Badge variant="outline" className="ml-auto text-xs">
                      {form.interestType}
                    </Badge>
                  </button>
                  {showSchedule && (
                    <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                      {installmentRows.map((row, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2.5">
                          <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-muted/40 text-muted-foreground">
                            {idx + 1}ª
                          </span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 text-xs flex-1 justify-start">
                                <CalendarIcon className="h-3.5 w-3.5 mr-1.5 text-primary" />
                                {format(row.date, "dd/MM/yyyy")}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={row.date}
                                onSelect={(d) => {
                                  if (d) {
                                    setInstallmentRows((prev) => {
                                      const rows = [...prev];
                                      rows[idx] = { ...rows[idx], date: d };
                                      // Cascade subsequent dates from this one
                                      for (let i = idx + 1; i < rows.length; i++) {
                                        rows[i] = { ...rows[i], date: getNextDate(d, form.interestType, i - idx) };
                                      }
                                      // If first row changed, also update firstDueDate
                                      if (idx === 0) setFirstDueDate(d);
                                      return rows;
                                    });
                                  }
                                }}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </PopoverContent>
                          </Popover>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.value}
                            onChange={(e) => {
                              setInstallmentRows((prev) => {
                                const rows = [...prev];
                                const newVal = e.target.value;
                                rows[idx] = { ...rows[idx], value: newVal };
                                // Auto-adjust: first installment redistributes across others
                                if (idx === 0 && rows.length > 1) {
                                  const firstVal = parseFloat(newVal) || 0;
                                  const remaining = Math.max(0, totalAmount - firstVal);
                                  const otherCount = rows.length - 1;
                                  const otherVal = (remaining / otherCount).toFixed(2);
                                  for (let i = 1; i < rows.length; i++) {
                                    rows[i] = { ...rows[i], value: otherVal };
                                  }
                                }
                                return rows;
                              });
                            }}
                            className="h-8 w-24 text-xs text-right"
                          />
                        </div>
                      ))}
                      <div className="px-3 py-2 bg-muted/20">
                        <p className="text-xs text-muted-foreground">
                          Total: <span className="font-bold text-foreground">{formatCurrency(installmentRows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0))}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="relative w-full h-11">
              {submitting ? (
                <div className="flex items-center justify-center h-11">
                  <div className="h-8 w-8 rounded-full border-[3px] border-primary border-t-transparent animate-spin" />
                </div>
              ) : (
                <Button type="submit" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Registrar Empréstimo
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
