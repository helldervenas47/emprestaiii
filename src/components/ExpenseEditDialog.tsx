import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Expense } from "@/types/loan";
import { personalCategories } from "@/lib/personalExpenseCategories";
import { usePersonalExpenseCategories } from "@/hooks/usePersonalExpenseCategories";
import { useCreditCards } from "@/hooks/useCreditCards";
import { AlertTriangle } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExpenseBoletoLinkSection } from "@/components/ExpenseBoletoLinkSection";

export type EditScope = "this" | "pending" | "all";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: Expense | null;
  warning?: string | null;
  onSave: (
    patch: {
      description: string;
      amount: number;
      dueDate: string;
      category: string;
      notes: string | null;
    },
    scope: EditScope,
  ) => Promise<void> | void;
}

const PAYMENT_METHODS = ["Dinheiro", "Pix", "Débito", "Crédito", "Boleto", "Débito automático"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

const PAYMENT_TAG_RE = /\[\s*(Dinheiro|Pix|D[ée]bito autom[áa]tico|D[ée]bito|Cr[eé]dito|Boleto)\s*\]/i;
const CARD_LINE_RE = /\[\s*Cr[eé]dito\s*\][^\n]*Cart[ãa]o:\s*([^\n(]+?)(?:\s*\(vence[^)]*\))?\s*(?:\n|$)/i;
const EDITED_RE = /\n?\[\s*Editado em [^\]]+\]\s*$/i;

function detectPaymentMethod(notes: string | null | undefined): PaymentMethod {
  if (!notes) return "Pix";
  const m = notes.match(PAYMENT_TAG_RE);
  if (!m) return "Pix";
  const v = m[1].toLowerCase();
  if (v.startsWith("din")) return "Dinheiro";
  if (v === "pix") return "Pix";
  if (v.startsWith("déb autom") || v.startsWith("deb autom") || v.includes("automá") || v.includes("automa")) return "Débito automático";
  if (v.startsWith("déb") || v.startsWith("deb")) return "Débito";
  if (v.startsWith("cré") || v.startsWith("cre")) return "Crédito";
  if (v.startsWith("bol")) return "Boleto";
  return "Pix";
}

function detectCardTag(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(CARD_LINE_RE);
  return m ? m[1].trim() : null;
}

function extractFreeNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  let n = notes;
  n = n.replace(CARD_LINE_RE, "").trim();
  n = n.replace(PAYMENT_TAG_RE, "").trim();
  n = n.replace(EDITED_RE, "").trim();
  return n;
}

function buildNotes(opts: {
  paymentMethod: PaymentMethod;
  cardTag: string | null;
  freeNotes: string;
}): string {
  const lines: string[] = [];
  if (opts.paymentMethod === "Crédito" && opts.cardTag) {
    lines.push(`[Crédito] Cartão: ${opts.cardTag}`);
  } else {
    lines.push(`[${opts.paymentMethod}]`);
  }
  if (opts.freeNotes.trim()) lines.push(opts.freeNotes.trim());
  lines.push(`[Editado em ${format(new Date(), "dd/MM/yy HH:mm")}]`);
  return lines.join("\n");
}

interface FormState {
  description: string;
  amount: string;
  dueDate: string;
  category: string;
  paymentMethod: PaymentMethod;
  cardId: string;
  freeNotes: string;
}

function hydrateFromExpense(expense: Expense, cards: ReturnType<typeof useCreditCards>["cards"]): FormState {
  const inst = expense.installments ?? 0;
  const isParc = expense.type === "recorrente" && inst > 1;
  const pm = detectPaymentMethod(expense.notes);
  const tag = detectCardTag(expense.notes);
  let cardId = "";
  if (tag && cards.length) {
    const lower = tag.toLowerCase();
    const found = cards.find(
      (c) =>
        c.nickname.toLowerCase() === lower ||
        c.lastFour === tag ||
        c.bank.toLowerCase() === lower,
    );
    cardId = found?.id ?? "";
  } else if (pm === "Crédito" && cards.length) {
    const nubank = cards.find(
      (c) =>
        c.bank?.toLowerCase().includes("nubank") ||
        c.nickname?.toLowerCase().includes("nubank"),
    );
    cardId = (nubank ?? cards[0]).id;
  }
  return {
    description: expense.description,
    amount: String(isParc ? expense.amount / inst : expense.amount),
    dueDate: expense.dueDate,
    category: expense.category ?? "",
    paymentMethod: pm,
    cardId,
    freeNotes: extractFreeNotes(expense.notes),
  };
}

export function ExpenseEditDialog({
  open,
  onOpenChange,
  expense,
  warning,
  onSave,
}: Props) {
  const { cards } = useCreditCards();
  const { categories: customCategories, reload: reloadCategories } = usePersonalExpenseCategories();

  useEffect(() => {
    if (open) reloadCategories();
  }, [open, reloadCategories]);

  const initialRef = useRef<FormState | null>(null);
  const [form, setForm] = useState<FormState>({
    description: "",
    amount: "",
    dueDate: "",
    category: "",
    paymentMethod: "Pix",
    cardId: "",
    freeNotes: "",
  });
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<EditScope>("this");
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const descriptionRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!expense) return;
    const next = hydrateFromExpense(expense, cards);
    initialRef.current = next;
    setForm(next);
    setTouched({});
    setScope("this");
  }, [expense, cards]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => descriptionRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, expense?.id]);

  const wasEdited = useMemo(
    () => !!expense?.notes && EDITED_RE.test(expense.notes),
    [expense],
  );

  const isDirty = useMemo(() => {
    if (!initialRef.current) return false;
    const a = initialRef.current;
    return (
      a.description !== form.description ||
      a.amount !== form.amount ||
      a.dueDate !== form.dueDate ||
      a.category !== form.category ||
      a.paymentMethod !== form.paymentMethod ||
      a.cardId !== form.cardId ||
      a.freeNotes !== form.freeNotes
    );
  }, [form]);

  const categoryOptions = useMemo(() => {
    const customNames = new Set(customCategories.map((c) => c.name.trim().toLowerCase()));
    const names = [
      ...personalCategories
        .filter((c) => !customNames.has(c.name.trim().toLowerCase()))
        .map((c) => c.name),
      ...customCategories.map((c) => c.name),
    ];
    if (form.category && !names.some((name) => name === form.category)) {
      names.push(form.category);
    }
    return names.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [form.category, customCategories]);

  if (!expense) return null;

  const isParcelada = expense.type === "recorrente" && (expense.installments ?? 0) > 1;
  const isChildInstallment = !!expense.parentExpenseId;
  const showScopeSelector = isParcelada || isChildInstallment;
  const selectedCard = cards.find((c) => c.id === form.cardId) ?? null;

  const amountNum = Number(form.amount);
  const errors: Record<string, string | null> = {
    description: !form.description.trim() ? "Informe uma descrição." : null,
    amount: !form.amount ? "Informe o valor." : isNaN(amountNum) || amountNum <= 0 ? "O valor deve ser maior que zero." : null,
    dueDate: !form.dueDate ? "Informe a data de vencimento." : null,
    category: !form.category ? "Selecione uma categoria." : null,
    cardId: form.paymentMethod === "Crédito" && !form.cardId ? "Selecione o cartão." : null,
  };
  const hasErrors = Object.values(errors).some((e) => !!e);

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTouched((t) => ({ ...t, [field as string]: true }));
  };

  const handleTryClose = () => {
    if (isDirty && !saving) {
      setConfirmDiscardOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      // Só dispara se não estiver em um Select aberto etc; botão trata a validação
      if (!hasErrors && !saving) {
        e.preventDefault();
        onSaveClick();
      }
    }
  };

  const onSaveClick = () => {
    setTouched({
      description: true,
      amount: true,
      dueDate: true,
      category: true,
      cardId: true,
    });
    if (hasErrors) return;
    if (showScopeSelector && scope === "all") {
      setConfirmAllOpen(true);
      return;
    }
    void doSave(scope);
  };

  const fieldError = (name: keyof typeof errors) =>
    touched[name as string] && errors[name] ? (
      <p className="text-[11px] text-destructive mt-1">{errors[name]}</p>
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleTryClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        onKeyDown={handleKeyDown}
        onEscapeKeyDown={(e) => {
          if (isDirty) {
            e.preventDefault();
            setConfirmDiscardOpen(true);
          }
        }}
        className="top-0 left-0 translate-x-0 translate-y-0 w-screen h-[100dvh] max-w-none max-h-[100dvh] rounded-none border-0 overflow-y-auto z-[2147483648] sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-full sm:h-auto sm:max-w-md sm:max-h-[90vh] sm:rounded-2xl sm:border"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar lançamento
            {isDirty && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400">
                Alterações não salvas
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {isParcelada
              ? `Esta despesa é parcelada (${expense.installments}x). Informe o valor da parcela — o total e todas as parcelas serão atualizados.`
              : "Altere os dados do lançamento. As alterações refletem em todos os relatórios."}
          </DialogDescription>
        </DialogHeader>

        {wasEdited && (
          <div className="text-[11px] rounded-md bg-muted text-muted-foreground border px-3 py-1.5">
            ✎ Esta despesa já foi editada anteriormente.
          </div>
        )}

        {warning && (
          <div className="text-xs rounded-md bg-warning/10 text-warning-foreground border border-warning/30 px-3 py-2">
            ⚠ {warning}
          </div>
        )}

        <div className="space-y-4">
          {/* 1. Descrição */}
          <div>
            <Label className="text-xs">Descrição *</Label>
            <Input
              ref={descriptionRef}
              className="h-10"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, description: true }))}
              aria-invalid={!!(touched.description && errors.description)}
            />
            {fieldError("description")}
          </div>

          {/* 2. Categoria */}
          <div>
            <Label className="text-xs">Categoria *</Label>
            <select
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, category: true }))}
              aria-invalid={!!(touched.category && errors.category)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive"
            >
              <option value="" disabled>
                Selecione a categoria
              </option>
              {categoryOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {fieldError("category")}
          </div>

          {/* 3. Valor + 4. Data de vencimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">
                {isParcelada ? "Valor da parcela *" : "Valor *"}
              </Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                className="h-10"
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
                aria-invalid={!!(touched.amount && errors.amount)}
              />
              {fieldError("amount")}
            </div>
            <div>
              <Label className="text-xs">Data de vencimento *</Label>
              <DatePickerField
                value={form.dueDate}
                onChange={(v) => update("dueDate", v)}
                placeholder="Selecione a data"
                popoverContentClassName="z-[2147483650]"
              />
              {fieldError("dueDate")}
            </div>
          </div>

          {isParcelada && Number(form.amount) > 0 && (expense.installments ?? 0) > 0 && (
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Valor total:{" "}
              <span className="font-semibold text-foreground">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                  Number(form.amount) * (expense.installments as number),
                )}
              </span>{" "}
              ({expense.installments}x de {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(form.amount))})
            </div>
          )}

          {/* 5. Forma de pagamento + 6. Cartão (condicional) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) => {
                  update("paymentMethod", v as PaymentMethod);
                  if (v !== "Crédito") update("cardId", "");
                }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[2147483650]">
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.paymentMethod === "Crédito" && (
              <div>
                <Label className="text-xs">Cartão *</Label>
                <Select value={form.cardId} onValueChange={(v) => update("cardId", v)}>
                  <SelectTrigger className="h-10" aria-invalid={!!(touched.cardId && errors.cardId)}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="z-[2147483650]">
                    {cards.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhum cartão cadastrado
                      </div>
                    )}
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nickname || c.bank}
                        {c.lastFour ? ` ····${c.lastFour}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError("cardId")}
              </div>
            )}
          </div>

          {/* 7. Observações */}
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={form.freeNotes}
              onChange={(e) => update("freeNotes", e.target.value)}
              rows={2}
              placeholder="Detalhes adicionais (opcional)"
            />
          </div>

          <ExpenseBoletoLinkSection expenseId={expense.id} />

          {showScopeSelector && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
              <Label className="text-xs font-semibold">Aplicar alteração em</Label>
              <RadioGroup
                value={scope}
                onValueChange={(v) => setScope(v as EditScope)}
                className="gap-2"
              >
                <label
                  htmlFor="scope-this"
                  className={`flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors ${
                    scope === "this" ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="this" id="scope-this" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">Apenas esta parcela</div>
                    <div className="text-[11px] text-muted-foreground">Altera somente o lançamento selecionado.</div>
                  </div>
                </label>
                <label
                  htmlFor="scope-pending"
                  className={`flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors ${
                    scope === "pending" ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="pending" id="scope-pending" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">Esta parcela e as próximas</div>
                    <div className="text-[11px] text-muted-foreground">Mantém inalteradas as parcelas anteriores e já pagas.</div>
                  </div>
                </label>
                <label
                  htmlFor="scope-all"
                  className={`flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors ${
                    scope === "all" ? "border-destructive bg-destructive/5" : "border-border/50 hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="all" id="scope-all" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      Todas as parcelas
                    </div>
                    <div className="text-[11px] text-muted-foreground">Reescreve também o histórico de parcelas já quitadas.</div>
                  </div>
                </label>
              </RadioGroup>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-10 w-full sm:w-auto" onClick={handleTryClose}>
            Cancelar
          </Button>
          <Button
            className="h-10 w-full sm:w-auto"
            disabled={saving || hasErrors}
            onClick={onSaveClick}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <AlertDialogContent className="z-[2147483649]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar alteração no histórico
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a alterar <strong>todas as despesas relacionadas, incluindo as parcelas já pagas</strong>.
              Esta ação reescreve registros históricos do seu fluxo financeiro e não pode ser desfeita automaticamente.
              Tem certeza que deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setConfirmAllOpen(false);
                await doSave("all");
              }}
            >
              Sim, alterar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent className="z-[2147483649]">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você fez alterações que ainda não foram salvas. Deseja descartá-las e fechar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );

  async function doSave(effectiveScope: EditScope) {
    setSaving(true);
    try {
      const cardTag = selectedCard
        ? selectedCard.nickname || selectedCard.lastFour || selectedCard.bank
        : null;
      const notes = buildNotes({
        paymentMethod: form.paymentMethod,
        cardTag: form.paymentMethod === "Crédito" ? cardTag : null,
        freeNotes: form.freeNotes,
      });
      const inst = expense.installments ?? 0;
      const totalAmount = isParcelada ? Number(form.amount) * inst : Number(form.amount);
      await onSave(
        {
          description: form.description.trim(),
          amount: totalAmount,
          dueDate: form.dueDate,
          category: form.category,
          notes,
        },
        showScopeSelector ? effectiveScope : "this",
      );
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }
}
