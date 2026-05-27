import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { format, parseISO, isBefore, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Search, Upload, Paperclip, ExternalLink, CheckCircle2,
  Clock, AlertTriangle, Wallet, Pencil, Trash2, FileText,
  ChevronDown, ChevronRight, History, Folder, Link2, Link2Off, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  parseLinhaDigitavel, formatLinhaDigitavel, type ParsedBoleto,
} from "@/lib/boleto/parseLinhaDigitavel";
import { parsePixBrCode } from "@/lib/boleto/pixBrCode";
import { useMyBoletos, type MyBoleto, type MyBoletoStatus } from "@/hooks/useMyBoletos";
import { BoletoPaymentDialog } from "./BoletoPaymentDialog";
import { BoletoHistoryDialog } from "./BoletoHistoryDialog";
import { cn } from "@/lib/utils";


const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CATEGORIES = [
  "Moradia", "Energia", "Água", "Internet", "Telefone", "Educação",
  "Saúde", "Transporte", "Imposto", "Cartão", "Financiamento", "Outros",
];

interface DraftForm {
  digits: string;
  description: string;
  beneficiary: string;
  category: string;
  amount: string;
  dueDate: string;
  notes: string;
  parsed: ParsedBoleto | null;
  attachmentFile: File | null;
  attachmentPath: string | null;
  pix_brcode: string;
}

const emptyDraft: DraftForm = {
  digits: "", description: "", beneficiary: "", category: "Outros",
  amount: "", dueDate: "", notes: "", parsed: null,
  attachmentFile: null, attachmentPath: null, pix_brcode: "",
};

function autoDescription(p: ParsedBoleto | null, pixName?: string): string {
  if (!p) return "";
  if (pixName) return pixName;
  if (p.kind === "bancario") return `Boleto ${p.bankName ?? "bancário"}`.trim();
  return `Conta — ${p.segmentLabel ?? "Arrecadação"}`;
}
function autoCategory(p: ParsedBoleto | null): string {
  if (!p) return "Outros";
  if (p.kind === "arrecadacao") {
    switch (p.segment) {
      case "1": return "Imposto";
      case "2": return "Água";
      case "3": return "Energia";
      case "4": return "Internet";
      case "7": return "Transporte";
      default: return "Outros";
    }
  }
  return "Outros";
}
function autoBeneficiary(p: ParsedBoleto | null, pixName?: string): string {
  if (pixName) return pixName;
  if (!p) return "";
  if (p.kind === "bancario") return p.bankName ?? "";
  return p.segmentLabel ?? "";
}
function computedStatus(b: MyBoleto): MyBoletoStatus {
  if (b.status === "pago") return "pago";
  if (b.due_date && isBefore(parseISO(b.due_date), startOfToday())) return "vencido";
  return "pendente";
}
function normalizeName(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type Sortable = MyBoleto & { status: MyBoletoStatus };

interface Group {
  key: string;
  name: string;
  items: Sortable[];
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  nextDue: string | null;
}

interface Props { readOnly?: boolean }

export function MyBoletosSection({ readOnly }: Props) {
  const {
    items, add, update, remove, recordPayment, unlinkExpense,
    uploadAttachment, getAttachmentUrl,
  } = useMyBoletos();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | MyBoletoStatus>("todos");
  const [categoryFilter, setCategoryFilter] = useState<string>("todas");
  const [sortBy, setSortBy] = useState<"due" | "amount" | "status">("due");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftForm>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<MyBoleto | null>(null);
  const [historyTarget, setHistoryTarget] = useState<MyBoleto | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expenseMap, setExpenseMap] = useState<Record<string, string>>({});


  const computed = useMemo<Sortable[]>(
    () => items.map((b) => ({ ...b, status: computedStatus(b) })),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = computed;
    if (statusFilter !== "todos") list = list.filter((b) => b.status === statusFilter);
    if (categoryFilter !== "todas") list = list.filter((b) => (b.category ?? "") === categoryFilter);
    if (q) {
      const digits = q.replace(/\D/g, "");
      list = list.filter((b) =>
        (b.description ?? "").toLowerCase().includes(q) ||
        (b.beneficiary ?? "").toLowerCase().includes(q) ||
        (digits && ((b.digits ?? "").includes(digits) || (b.barcode ?? "").includes(digits)))
      );
    }
    const cmp = (a: Sortable, b: Sortable) => {
      if (sortBy === "due") return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
      if (sortBy === "amount") return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      const order = { vencido: 0, pendente: 1, pago: 2 } as const;
      return order[a.status] - order[b.status];
    };
    return [...list].sort(cmp);
  }, [computed, query, statusFilter, categoryFilter, sortBy]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const b of filtered) {
      const name = (b.description || "Sem descrição").trim();
      const key = normalizeName(name);
      let g = map.get(key);
      if (!g) {
        g = {
          key, name, items: [],
          total: 0, paid: 0, pending: 0, overdue: 0,
          totalAmount: 0, paidAmount: 0, pendingAmount: 0,
          nextDue: null,
        };
        map.set(key, g);
      }
      g.items.push(b);
      g.total += 1;
      const amt = Number(b.amount) || 0;
      g.totalAmount += amt;
      if (b.status === "pago") { g.paid += 1; g.paidAmount += amt; }
      else {
        if (b.status === "vencido") g.overdue += 1;
        else g.pending += 1;
        g.pendingAmount += amt;
      }
      if (b.due_date && b.status !== "pago") {
        if (!g.nextDue || b.due_date < g.nextDue) g.nextDue = b.due_date;
      }
    }
    const arr = Array.from(map.values());
    const cmpG = (a: Group, b: Group) => {
      if (sortBy === "amount") return b.totalAmount - a.totalAmount;
      if (sortBy === "status") {
        const sa = a.overdue > 0 ? 0 : a.pending > 0 ? 1 : 2;
        const sb = b.overdue > 0 ? 0 : b.pending > 0 ? 1 : 2;
        return sa - sb;
      }
      return (a.nextDue ?? "9999").localeCompare(b.nextDue ?? "9999");
    };
    return arr.sort(cmpG);
  }, [filtered, sortBy]);

  const summary = useMemo(() => {
    let pending = 0, overdue = 0, paid = 0;
    let totalPending = 0, totalPaid = 0, totalOverdue = 0;
    for (const b of computed) {
      const amt = Number(b.amount) || 0;
      if (b.status === "pago") { paid++; totalPaid += amt; continue; }
      if (b.status === "vencido") { overdue++; totalOverdue += amt; }
      else pending++;
      totalPending += amt;
    }
    return {
      pending, overdue, paid,
      totalPending, totalPaid, totalOverdue,
      total: computed.length,
    };
  }, [computed]);

  const resetDraft = () => { setDraft(emptyDraft); setEditingId(null); };
  const openNew = () => { resetDraft(); setOpen(true); };
  const openEdit = (b: MyBoleto) => {
    setEditingId(b.id);
    setDraft({
      digits: b.digits ?? "",
      description: b.description,
      beneficiary: b.beneficiary ?? "",
      category: b.category ?? "Outros",
      amount: b.amount ? String(b.amount) : "",
      dueDate: b.due_date ?? "",
      notes: b.notes ?? "",
      parsed: null,
      attachmentFile: null,
      attachmentPath: b.attachment_path,
      pix_brcode: b.pix_brcode ?? "",
    });
    setOpen(true);
  };

  const handleParseDigits = (text: string) => {
    const out = parseLinhaDigitavel(text);
    if ("error" in out) { setDraft((d) => ({ ...d, digits: text, parsed: null })); return; }
    const pix = draft.pix_brcode ? parsePixBrCode(draft.pix_brcode) : null;
    const pixName = pix?.valid ? pix.merchantName : undefined;
    setDraft((d) => ({
      ...d,
      digits: text, parsed: out,
      description: d.description.trim() ? d.description : autoDescription(out, pixName),
      beneficiary: d.beneficiary.trim() ? d.beneficiary : autoBeneficiary(out, pixName),
      category: d.category && d.category !== "Outros" ? d.category : autoCategory(out),
      amount: d.amount || (out.amount > 0 ? String(out.amount) : ""),
      dueDate: d.dueDate || (out.dueDate ?? ""),
      notes: d.notes,
    }));
  };

  const applySuggestion = () => {
    if (!draft.parsed) return;
    const pix = draft.pix_brcode ? parsePixBrCode(draft.pix_brcode) : null;
    const pixName = pix?.valid ? pix.merchantName : undefined;
    setDraft((d) => ({
      ...d,
      description: autoDescription(d.parsed, pixName),
      beneficiary: autoBeneficiary(d.parsed, pixName),
      category: autoCategory(d.parsed),
    }));
    toast.success("Descrição preenchida com base no boleto");
  };

  const onFileSelected = async (file: File) => {
    setDraft((d) => ({ ...d, attachmentFile: file }));
    const m = file.name.replace(/\D+/g, "");
    if (m.length === 47 || m.length === 48 || m.length === 44) {
      handleParseDigits(m);
      toast.success("Linha digitável detectada no arquivo");
    }
  };

  const handleSave = async () => {
    if (!draft.description.trim()) { toast.error("Informe uma descrição"); return; }
    setSaving(true);
    try {
      let attachment_path = draft.attachmentPath;
      if (draft.attachmentFile) attachment_path = await uploadAttachment(draft.attachmentFile);
      const digits = draft.digits.replace(/\D+/g, "") || null;
      const parsed = digits ? parseLinhaDigitavel(digits) : null;
      const valid = parsed && !("error" in parsed) ? parsed : null;
      const payload = {
        description: draft.description.trim(),
        beneficiary: draft.beneficiary.trim() || null,
        category: draft.category || null,
        amount: Number(draft.amount.replace(",", ".")) || 0,
        due_date: draft.dueDate || null,
        paid_at: null,
        digits,
        barcode: valid?.barcode ?? null,
        bank_code: valid?.bankCode ?? null,
        bank_name: valid?.bankName ?? null,
        segment: valid?.segment ?? null,
        segment_label: valid?.segmentLabel ?? null,
        kind: valid?.kind ?? null,
        notes: draft.notes.trim() || null,
        attachment_path,
        pix_brcode: draft.pix_brcode.trim() || null,
      };
      if (editingId) { await update(editingId, payload); toast.success("Boleto atualizado"); }
      else { await add(payload); toast.success("Boleto cadastrado"); }
      setOpen(false); resetDraft();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar boleto");
    } finally { setSaving(false); }
  };

  const openAttachment = async (path: string) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, "_blank");
    else toast.error("Não foi possível abrir o anexo");
  };

  const toggleGroup = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <SummaryTile icon={<FileText className="h-4 w-4" />} label="Total"
          value={BRL(summary.totalPending + summary.totalPaid + summary.totalOverdue)} sub={`${summary.total} boletos`} tone="primary" delay={0} />
        <SummaryTile icon={<CheckCircle2 className="h-4 w-4" />} label="Pagos"
          value={BRL(summary.totalPaid)} sub={`${summary.paid} boletos`} tone="emerald" delay={80} />
        <SummaryTile icon={<Clock className="h-4 w-4" />} label="Pendentes"
          value={BRL(summary.totalPending)} sub={`${summary.pending} boletos`} tone="amber" delay={160} />
        <SummaryTile icon={<AlertTriangle className="h-4 w-4" />} label="Vencidos"
          value={BRL(summary.totalOverdue)} sub={`${summary.overdue} boletos`} tone="rose" delay={240} />
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, beneficiário ou código" className="pl-9" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
                <SelectItem value="pago">Pagos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas categorias</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ordenar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="due">Por vencimento</SelectItem>
                <SelectItem value="amount">Por valor</SelectItem>
                <SelectItem value="status">Por status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista agrupada */}
      {groups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground space-y-2">
            <FileText className="h-8 w-8 mx-auto opacity-50" />
            <p>Nenhum boleto encontrado.</p>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={openNew}>
                <Plus className="h-4 w-4" /> Cadastrar primeiro boleto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const single = g.items.length === 1;
            const groupTone = g.overdue > 0
              ? "border-l-rose-500"
              : g.pending > 0
              ? "border-l-amber-500"
              : "border-l-emerald-500";
            const isOpen = expanded[g.key] ?? single;

            if (single) {
              return <BoletoCard key={g.key} b={g.items[0]} readOnly={readOnly}
                onPay={() => setPayTarget(g.items[0])}
                onEdit={() => openEdit(g.items[0])}
                onDelete={() => setDeleteId(g.items[0].id)}
                onHistory={() => setHistoryTarget(g.items[0])}
                onUnlink={async () => { await unlinkExpense(g.items[0].id); toast.success("Despesa desvinculada"); }}
                linkedExpenseDescription={g.items[0].expense_id ? expenseMap[g.items[0].expense_id] : undefined}
                onAttach={openAttachment} />;

            }

            return (
              <Card key={g.key} className={cn("border-l-4", groupTone)}>
                <Collapsible open={isOpen} onOpenChange={() => toggleGroup(g.key)}>
                  <CollapsibleTrigger className="w-full text-left">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <Folder className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{g.name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className="text-[10px]">{g.total} boletos</Badge>
                            {g.paid > 0 && (
                              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                                {g.paid} pagos
                              </Badge>
                            )}
                            {g.pending > 0 && (
                              <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]">
                                {g.pending} pendentes
                              </Badge>
                            )}
                            {g.overdue > 0 && (
                              <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[10px]">
                                {g.overdue} vencidos
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-sm">{BRL(g.totalAmount)}</div>
                          {g.nextDue && (
                            <div className="text-[10px] text-muted-foreground">
                              próx. {format(parseISO(g.nextDue), "dd/MM/yy", { locale: ptBR })}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-2 border-t pt-2">
                      {g.items.map((b) => (
                        <BoletoCard key={b.id} b={b} readOnly={readOnly} compact
                          onPay={() => setPayTarget(b)}
                          onEdit={() => openEdit(b)}
                          onDelete={() => setDeleteId(b.id)}
                          onHistory={() => setHistoryTarget(b)}
                          onUnlink={async () => { await unlinkExpense(b.id); toast.success("Despesa desvinculada"); }}
                          linkedExpenseDescription={b.expense_id ? expenseMap[b.expense_id] : undefined}
                          onAttach={openAttachment} />

                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={openNew}
          aria-label="Novo boleto"
          title="Novo boleto"
          className="group fixed z-50 h-11 w-11 md:h-12 md:w-12 rounded-full flex items-center justify-center animate-fade-in touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200 hover:scale-105 active:scale-95 gradient-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)] hover:shadow-[0_12px_32px_-8px_hsl(var(--primary)/0.8)]"
          style={{ right: `calc(env(safe-area-inset-right) + 16px)`, bottom: `calc(env(safe-area-inset-bottom) + 76px)` }}
        >
          <Plus className="h-5 w-5 relative drop-shadow-[0_1px_2px_hsl(var(--primary)/0.5)]" strokeWidth={2.75} />
        </button>
      )}

      {/* Dialog cadastro/edição */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDraft(); }}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="w-[calc(100vw-1rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar boleto" : "Novo boleto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Linha digitável ou código de barras (opcional)</Label>
              <Textarea value={draft.digits}
                onChange={(e) => setDraft((d) => ({ ...d, digits: e.target.value }))}
                onBlur={(e) => handleParseDigits(e.target.value)}
                placeholder="47 ou 48 dígitos — preenche descrição, valor e vencimento automaticamente"
                className="font-mono text-xs min-h-[60px]" />
              {draft.parsed && (
                <div className="flex items-center justify-between gap-2 rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
                  <div className="text-[11px] text-muted-foreground truncate">
                    Detectado: <span className="text-foreground font-medium">{autoDescription(draft.parsed)}</span>
                    {draft.parsed.amount > 0 && ` · ${BRL(draft.parsed.amount)}`}
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={applySuggestion}>
                    Usar sugestão
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição *</Label>
              <Input value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Ex.: Aluguel novembro" />
              <p className="text-[10px] text-muted-foreground">
                Boletos com o mesmo nome ficam agrupados na pasta automaticamente.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Beneficiário</Label>
                <Input value={draft.beneficiary}
                  onChange={(e) => setDraft((d) => ({ ...d, beneficiary: e.target.value }))}
                  placeholder="Empresa / pessoa" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Categoria</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft((d) => ({ ...d, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$)</Label>
                <Input type="number" step="0.01" inputMode="decimal" value={draft.amount}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vencimento</Label>
                <Input type="date" value={draft.dueDate}
                  onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                className="min-h-[60px]" placeholder="Notas internas, número do contrato, etc." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Anexo (PDF ou imagem do boleto)</Label>
              <div className="flex items-center gap-2 min-w-0">
                <Input type="file" accept="application/pdf,image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); }}
                  className="text-xs min-w-0 flex-1" />
                {draft.attachmentFile && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    <Upload className="h-3 w-3" /> {draft.attachmentFile.name.slice(0, 20)}
                  </Badge>
                )}
                {!draft.attachmentFile && draft.attachmentPath && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    <Paperclip className="h-3 w-3" /> Anexo atual
                  </Badge>
                )}
              </div>
            </div>
            {draft.parsed && (
              <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground font-mono break-all">
                {formatLinhaDigitavel(draft.parsed.digits)}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BoletoPaymentDialog
        boleto={payTarget}
        open={!!payTarget}
        onOpenChange={(v) => !v && setPayTarget(null)}
        onConfirm={async (payload) => {
          if (!payTarget) return;
          await recordPayment(payTarget.id, payload);
          toast.success("Pagamento registrado");
        }}
      />

      <BoletoHistoryDialog
        boleto={historyTarget}
        open={!!historyTarget}
        onOpenChange={(v) => !v && setHistoryTarget(null)}
        readOnly={readOnly}
      />




      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir boleto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O boleto, o anexo e seu histórico de pagamentos serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try { await remove(deleteId); toast.success("Boleto excluído"); }
                catch (e: any) { toast.error(e?.message ?? "Falha ao excluir"); }
                setDeleteId(null);
              }}
            >Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface BoletoCardProps {
  b: MyBoleto & { status: MyBoletoStatus };
  readOnly?: boolean;
  compact?: boolean;
  onPay: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onUnlink: () => void | Promise<void>;
  onAttach: (path: string) => void;
  linkedExpenseDescription?: string;
}

function BoletoCard({ b, readOnly, compact, onPay, onEdit, onDelete, onHistory, onUnlink, onAttach, linkedExpenseDescription }: BoletoCardProps) {

  const tone = b.status === "pago"
    ? "border-l-emerald-500 bg-emerald-500/[0.03]"
    : b.status === "vencido"
    ? "border-l-rose-500 bg-rose-500/[0.04]"
    : "border-l-amber-500 bg-amber-500/[0.03]";

  const content = (
    <CardContent className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onHistory}
              className="font-semibold text-sm truncate hover:underline text-left"
              title="Ver histórico"
            >
              {b.description}
            </button>
            <StatusBadge status={b.status} />
            {b.category && <Badge variant="outline" className="text-[10px]">{b.category}</Badge>}
            {b.expense_id && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                <Link2 className="h-3 w-3" /> Despesa vinculada
              </Badge>
            )}
          </div>
          {b.beneficiary && (
            <div className="text-xs text-muted-foreground truncate">{b.beneficiary}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="font-semibold text-sm">{BRL(Number(b.amount) || 0)}</div>
          {b.due_date && (
            <div className="text-[10px] text-muted-foreground">
              Venc. {format(parseISO(b.due_date), "dd/MM/yyyy", { locale: ptBR })}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-nowrap items-center gap-0.5 sm:gap-1 pt-2 border-t border-border/50 overflow-hidden">
        <Button size="sm" variant="ghost" className="h-8 px-1.5 sm:px-2 text-xs gap-1 shrink-0" onClick={onHistory} title="Histórico" aria-label="Histórico">
          <History className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Histórico</span>
        </Button>
        {(b.digits || b.barcode) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-1.5 sm:px-2 text-xs gap-1 shrink-0"
            onClick={async () => {
              const code = (b.digits || b.barcode || "").replace(/\s/g, "");
              try {
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(code);
                } else {
                  const ta = document.createElement("textarea");
                  ta.value = code; document.body.appendChild(ta);
                  ta.select(); document.execCommand("copy"); ta.remove();
                }
                toast.success("Código de barras copiado");
              } catch { toast.error("Não foi possível copiar"); }
            }}
            title="Copiar código de barras"
            aria-label="Copiar código de barras"
          >
            <Copy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Copiar</span>
          </Button>
        )}
        {b.attachment_path && (
          <Button size="sm" variant="ghost" className="h-8 px-1.5 sm:px-2 text-xs gap-1 shrink-0"
            onClick={() => onAttach(b.attachment_path!)} title="Anexo" aria-label="Anexo">
            <Paperclip className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Anexo</span>
          </Button>
        )}
        {!readOnly && b.status !== "pago" && (
          <Button size="sm" variant="ghost" className="h-8 px-1.5 sm:px-2 text-xs gap-1 text-emerald-600 hover:text-emerald-700 shrink-0" onClick={onPay} title="Pagar" aria-label="Pagar">
            <CheckCircle2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Pagar</span>
          </Button>
        )}
        {!readOnly && !b.expense_id && (
          <Button size="sm" variant="ghost" className="h-8 px-1.5 sm:px-2 text-xs gap-1 text-primary shrink-0" onClick={onLink} title="Vincular" aria-label="Vincular">
            <Link2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Vincular</span>
          </Button>
        )}
        {!readOnly && b.expense_id && (
          <Button size="sm" variant="ghost" className="h-8 px-1.5 sm:px-2 text-xs gap-1 shrink-0" onClick={() => onUnlink()} title="Desvincular" aria-label="Desvincular">
            <Link2Off className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Desvincular</span>
          </Button>
        )}
        {!readOnly && (
          <div className="flex items-center gap-0.5 sm:gap-1 ml-auto shrink-0">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onEdit} title="Editar" aria-label="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={onDelete} title="Excluir" aria-label="Excluir">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>


    </CardContent>
  );

  if (compact) {
    return <div className={cn("border-l-4 rounded-md border bg-card", tone)}>{content}</div>;
  }
  return <Card className={cn("border-l-4", tone)}>{content}</Card>;
}

function StatusBadge({ status }: { status: MyBoletoStatus }) {
  if (status === "pago") {
    return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]" variant="outline">
      <CheckCircle2 className="h-3 w-3" /> Pago
    </Badge>;
  }
  if (status === "vencido") {
    return <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[10px]" variant="outline">
      <AlertTriangle className="h-3 w-3" /> Vencido
    </Badge>;
  }
  return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]" variant="outline">
    <Clock className="h-3 w-3" /> Pendente
  </Badge>;
}

function SummaryTile({ icon, label, value, sub, tone, delay = 0 }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  tone: "amber" | "rose" | "emerald" | "primary";
  delay?: number;
}) {
  const toneMap = {
    amber: { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
    rose: { text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10" },
    emerald: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    primary: { text: "text-primary", bg: "bg-primary/10" },
  }[tone];
  return (
    <div
      className="rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] backdrop-blur-sm animate-fade-in flex flex-col items-center text-center"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}
    >
      <div className={`h-8 w-8 rounded-lg ${toneMap.bg} flex items-center justify-center mb-2`}>
        <span className={toneMap.text}>{icon}</span>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm sm:text-xl font-bold mt-0.5 ${toneMap.text}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1 truncate max-w-full">{sub}</p>}
    </div>
  );
}
