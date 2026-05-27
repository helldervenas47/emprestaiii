import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link2, Plus, Search, Car, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useMyBoletos, type MyBoleto } from "@/hooks/useMyBoletos";
import { useDataOwner } from "@/hooks/useDataOwner";
import { vehicleExpenseCategories } from "@/components/VehicleExpenseForm";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FINANCEIRO_CATEGORIES = [
  "Moradia", "Energia", "Água", "Internet", "Telefone", "Educação",
  "Saúde", "Imposto", "Cartão", "Financiamento", "Alimentação",
  "Lazer", "Serviços", "Outros",
];

interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  monthlyAmount: number;
  installments: number | null;
  paidInstallments: number | null;
  type: string | null;
  due_date: string;
  category: string;
  scope: string;
  paid: boolean;
  linked: boolean;
}

interface Props {
  boleto: MyBoleto | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function BoletoLinkExpenseDialog({ boleto, open, onOpenChange }: Props) {
  const { linkExpense, createExpenseFromBoleto } = useMyBoletos();
  const ownerId = useDataOwner();
  const [mode, setMode] = useState<"link" | "create">("link");
  const [scope, setScope] = useState<"business" | "personal">("business");
  const [category, setCategory] = useState<string>("Outros");
  const [search, setSearch] = useState("");
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !ownerId) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [exp, linkedRows] = await Promise.all([
        supabase
          .from("expenses")
          .select("id, description, amount, due_date, category, scope, paid")
          .eq("user_id", ownerId)
          .order("due_date", { ascending: false })
          .limit(300),
        supabase.from("my_boletos").select("expense_id").not("expense_id", "is", null),
      ]);
      if (!active) return;
      const linkedSet = new Set((linkedRows.data ?? []).map((r: any) => r.expense_id as string));
      const rows: ExpenseRow[] = (exp.data ?? []).map((e: any) => ({
        id: e.id,
        description: e.description,
        amount: Number(e.amount) || 0,
        due_date: e.due_date,
        category: e.category,
        scope: e.scope ?? "business",
        paid: !!e.paid,
        linked: linkedSet.has(e.id),
      }));
      setExpenses(rows);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [open, ownerId]);

  const boletoMonth = useMemo(() => {
    const d = boleto?.due_date ?? null;
    return d ? d.slice(0, 7) : new Date().toISOString().slice(0, 7);
  }, [boleto]);
  const [month, setMonth] = useState<string>(boletoMonth);

  useEffect(() => {
    if (!open) return;
    setMode("link");
    setSearch("");
    setMonth(boletoMonth);
    // sugere categoria com base no boleto
    if (boleto?.category && FINANCEIRO_CATEGORIES.includes(boleto.category)) {
      setCategory(boleto.category);
      setScope("business");
    } else {
      setCategory("Outros");
    }
  }, [open, boleto, boletoMonth]);

  // Meses disponíveis (ordenado desc), garante presença do mês do boleto
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(boletoMonth);
    expenses.forEach((e) => { if (e.due_date) set.add(e.due_date.slice(0, 7)); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [expenses, boletoMonth]);

  const monthLabel = (m: string) => {
    try {
      return format(parseISO(`${m}-01`), "MMMM 'de' yyyy", { locale: ptBR });
    } catch { return m; }
  };

  const categories = scope === "business" ? FINANCEIRO_CATEGORIES : FINANCEIRO_CATEGORIES;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (e.linked) return false;
      if (month !== "__all__" && (e.due_date ?? "").slice(0, 7) !== month) return false;
      if (!q) return true;
      return (e.description ?? "").toLowerCase().includes(q)
        || (e.category ?? "").toLowerCase().includes(q);
    });
  }, [expenses, search, month]);

  const handleLink = async (expenseId: string) => {
    if (!boleto) return;
    setSaving(true);
    try {
      await linkExpense(boleto.id, expenseId);
      toast.success("Despesa vinculada ao boleto");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao vincular");
    } finally { setSaving(false); }
  };

  const handleCreate = async (vehicle: boolean) => {
    if (!boleto) return;
    setSaving(true);
    try {
      const cat = vehicle ? (category || "Manutenção") : (category || "Outros");
      const sc: "business" | "personal" = vehicle ? "business" : scope;
      await createExpenseFromBoleto(boleto.id, { scope: sc, category: cat });
      toast.success(vehicle ? "Despesa de veículo criada e vinculada" : "Despesa criada e vinculada");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar despesa");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Vincular despesa ao boleto
          </DialogTitle>
        </DialogHeader>
        {boleto && (
          <div className="text-xs text-muted-foreground mb-2">
            <span className="font-medium text-foreground">{boleto.description}</span>
            {boleto.amount ? <> · {BRL(Number(boleto.amount))}</> : null}
            {boleto.due_date && <> · venc. {format(parseISO(boleto.due_date), "dd/MM/yyyy", { locale: ptBR })}</>}
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="link">Vincular existente</TabsTrigger>
            <TabsTrigger value="create">Criar nova</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="mt-3 space-y-2">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por descrição ou categoria" className="pl-9" />
              </div>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={boletoMonth}>
                    {monthLabel(boletoMonth)} (boleto)
                  </SelectItem>
                  {availableMonths.filter((m) => m !== boletoMonth).map((m) => (
                    <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                  ))}
                  <SelectItem value="__all__">Todos os meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Vinculando despesa da competência <span className="font-medium text-foreground">{month === "__all__" ? "todas" : monthLabel(month)}</span>.
            </div>
            <div className="space-y-1 max-h-[40vh] overflow-y-auto">
              {loading ? (
                <div className="text-sm text-muted-foreground text-center py-4">Carregando…</div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                  Nenhuma despesa disponível para vincular.
                </div>
              ) : filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => handleLink(e.id)}
                  disabled={saving}
                  className="w-full text-left rounded-md border p-2 hover:bg-accent/50 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{e.description}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {e.scope === "personal" ? "Pessoal" : "Financeiro"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{e.category}</Badge>
                        {e.paid && (
                          <Badge variant="outline"
                            className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                            Paga
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-sm">{BRL(e.amount)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {format(parseISO(e.due_date), "dd/MM/yy", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="create" className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Escopo</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business">Financeiro</SelectItem>
                    <SelectItem value="personal">Pessoal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={() => handleCreate(false)} disabled={saving}>
              <Wallet className="h-4 w-4" />
              {saving ? "Criando…" : "Criar despesa (Financeiro/Pessoal)"}
            </Button>

            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs">Ou crie como despesa de veículo</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Categoria do veículo" /></SelectTrigger>
                <SelectContent>
                  {vehicleExpenseCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" className="w-full" onClick={() => handleCreate(true)} disabled={saving}>
                <Car className="h-4 w-4" />
                {saving ? "Criando…" : "Criar despesa de veículo"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
