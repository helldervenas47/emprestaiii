import { useMemo, useState } from "react";
import { format, parseISO, isBefore, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Search, Upload, Paperclip, ExternalLink, CheckCircle2,
  Clock, AlertTriangle, Wallet, Pencil, Trash2, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  if (p.kind === "bancario") {
    return `Boleto ${p.bankName ?? "bancário"}`.trim();
  }
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

interface Props { readOnly?: boolean }

export function MyBoletosSection({ readOnly }: Props) {
  const { items, add, update, remove, markPaid, uploadAttachment, getAttachmentUrl } = useMyBoletos();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | MyBoletoStatus>("todos");
  const [categoryFilter, setCategoryFilter] = useState<string>("todas");
  const [sortBy, setSortBy] = useState<"due" | "category" | "status">("due");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftForm>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.map((b) => ({ ...b, status: computedStatus(b) }));
    if (statusFilter !== "todos") list = list.filter((b) => b.status === statusFilter);
    if (categoryFilter !== "todas") list = list.filter((b) => (b.category ?? "") === categoryFilter);
    if (q) {
      list = list.filter((b) =>
        (b.description ?? "").toLowerCase().includes(q) ||
        (b.beneficiary ?? "").toLowerCase().includes(q) ||
        (b.digits ?? "").includes(q.replace(/\D/g, "")) ||
        (b.barcode ?? "").includes(q.replace(/\D/g, ""))
      );
    }
    if (sortBy === "due") {
      list.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    } else if (sortBy === "category") {
      list.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? ""));
    } else {
      const order = { vencido: 0, pendente: 1, pago: 2 } as const;
      list.sort((a, b) => order[a.status] - order[b.status]);
    }
    return list;
  }, [items, query, statusFilter, categoryFilter, sortBy]);

  const summary = useMemo(() => {
    const today = startOfToday();
    let pending = 0, overdue = 0, paid = 0, totalPending = 0;
    for (const b of items) {
      const s = computedStatus(b);
      if (s === "pago") { paid++; continue; }
      if (s === "vencido") overdue++;
      else pending++;
      totalPending += Number(b.amount) || 0;
    }
    return { pending, overdue, paid, totalPending, today };
  }, [items]);

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
    if ("error" in out) {
      setDraft((d) => ({ ...d, digits: text, parsed: null }));
      return;
    }
    const pix = draft.pix_brcode ? parsePixBrCode(draft.pix_brcode) : null;
    const pixName = pix?.valid ? pix.merchantName : undefined;
    setDraft((d) => ({
      ...d,
      digits: text,
      parsed: out,
      // Só auto-preenche se o usuário ainda não escreveu / quando criando novo
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
    // Tenta detectar linha digitável no nome do arquivo
    const m = file.name.replace(/\D+/g, "");
    if (m.length === 47 || m.length === 48 || m.length === 44) {
      handleParseDigits(m);
      toast.success("Linha digitável detectada no arquivo");
    }
  };

  const handleSave = async () => {
    if (!draft.description.trim()) {
      toast.error("Informe uma descrição");
      return;
    }
    setSaving(true);
    try {
      let attachment_path = draft.attachmentPath;
      if (draft.attachmentFile) {
        attachment_path = await uploadAttachment(draft.attachmentFile);
      }
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
      if (editingId) {
        await update(editingId, payload);
        toast.success("Boleto atualizado");
      } else {
        await add(payload);
        toast.success("Boleto cadastrado");
      }
      setOpen(false);
      resetDraft();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar boleto");
    } finally {
      setSaving(false);
    }
  };

  const openAttachment = async (path: string) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, "_blank");
    else toast.error("Não foi possível abrir o anexo");
  };

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryTile icon={<Clock className="h-4 w-4" />} label="Pendentes" value={String(summary.pending)} tone="amber" />
        <SummaryTile icon={<AlertTriangle className="h-4 w-4" />} label="Vencidos" value={String(summary.overdue)} tone="rose" />
        <SummaryTile icon={<CheckCircle2 className="h-4 w-4" />} label="Pagos" value={String(summary.paid)} tone="emerald" />
        <SummaryTile icon={<Wallet className="h-4 w-4" />} label="A pagar" value={BRL(summary.totalPending)} tone="primary" />
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por descrição, beneficiário ou código"
                className="pl-9"
              />
            </div>
            {!readOnly && (
              <Button onClick={openNew} size="sm" className="shrink-0">
                <Plus className="h-4 w-4" /> Novo
              </Button>
            )}
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
                <SelectItem value="category">Por categoria</SelectItem>
                <SelectItem value="status">Por status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground space-y-2">
            <FileText className="h-8 w-8 mx-auto opacity-50" />
            <p>Nenhum boleto cadastrado ainda.</p>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={openNew}>
                <Plus className="h-4 w-4" /> Cadastrar primeiro boleto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <Card key={b.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{b.description}</span>
                      <StatusBadge status={b.status} />
                      {b.category && (
                        <Badge variant="outline" className="text-[10px]">{b.category}</Badge>
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
                <div className="flex flex-wrap items-center gap-1">
                  {b.attachment_path && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => openAttachment(b.attachment_path!)}>
                      <Paperclip className="h-3 w-3" /> Anexo
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  {!readOnly && b.status !== "pago" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-600"
                      onClick={() => markPaid(b.id).then(() => toast.success("Boleto marcado como pago"))}>
                      <CheckCircle2 className="h-3 w-3" /> Pago
                    </Button>
                  )}
                  {!readOnly && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                        onClick={() => openEdit(b)}>
                        <Pencil className="h-3 w-3" /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive"
                        onClick={() => setDeleteId(b.id)}>
                        <Trash2 className="h-3 w-3" /> Excluir
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog cadastro/edição */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDraft(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar boleto" : "Novo boleto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Linha digitável ou código de barras (opcional)</Label>
              <Textarea
                value={draft.digits}
                onChange={(e) => setDraft((d) => ({ ...d, digits: e.target.value }))}
                onBlur={(e) => handleParseDigits(e.target.value)}
                placeholder="47 ou 48 dígitos — preenche descrição, valor e vencimento automaticamente"
                className="font-mono text-xs min-h-[60px]"
              />
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
              <Input
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Ex.: Aluguel novembro"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Beneficiário</Label>
                <Input
                  value={draft.beneficiary}
                  onChange={(e) => setDraft((d) => ({ ...d, beneficiary: e.target.value }))}
                  placeholder="Empresa / pessoa"
                />
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
                <Input
                  type="number" step="0.01" inputMode="decimal"
                  value={draft.amount}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vencimento</Label>
                <Input
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                className="min-h-[60px]"
                placeholder="Notas internas, número do contrato, etc."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Anexo (PDF ou imagem do boleto)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFileSelected(f);
                  }}
                  className="text-xs"
                />
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
              <p className="text-[10px] text-muted-foreground">
                Dica: se o nome do arquivo contiver os dígitos do boleto, eles são detectados automaticamente.
              </p>
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

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir boleto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O boleto e o anexo serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try {
                  await remove(deleteId);
                  toast.success("Boleto excluído");
                } catch (e: any) {
                  toast.error(e?.message ?? "Falha ao excluir");
                }
                setDeleteId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
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

function SummaryTile({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: string;
  tone: "amber" | "rose" | "emerald" | "primary";
}) {
  const toneCls = {
    amber: "text-amber-600",
    rose: "text-rose-600",
    emerald: "text-emerald-600",
    primary: "text-primary",
  }[tone];
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide ${toneCls}`}>
        {icon}<span>{label}</span>
      </div>
      <div className="mt-0.5 font-semibold text-sm truncate">{value}</div>
    </div>
  );
}
