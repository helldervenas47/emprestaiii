import { useState, useMemo } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { Checkbox } from "@/components/ui/checkbox";
import { Client, Loan, Payment } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Trash2, User, Phone, Mail, MapPin, Search, Users, Pencil, X, Check, ToggleLeft, ToggleRight, ArrowUpDown, ArrowDownAZ, ArrowUpAZ, Clock, CalendarDays, TrendingUp, AlertTriangle, ShieldCheck, Wallet, Sparkles, Shield, SlidersHorizontal, FileText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { RowActions } from "@/components/ui/row-actions";
import { ClientDetailDialog } from "@/components/ClientDetailDialog";
import { CreditLimitDialog } from "@/components/CreditLimitDialog";
import { RecentLimitAdjustmentsDialog } from "@/components/RecentLimitAdjustmentsDialog";
import { MaxCreditLimitDialog } from "@/components/MaxCreditLimitDialog";
import { useCreditLimits } from "@/hooks/useCreditLimits";
import { computeAvailableLimit, computeUsedLimit, formatBRL } from "@/lib/creditLimit";
import { ClientDocuments } from "@/components/ClientDocuments";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useClientDocuments } from "@/hooks/useClientDocuments";

function DocumentsTabTrigger({ clientId }: { clientId: string }) {
  const { documents } = useClientDocuments(clientId);
  return (
    <TabsTrigger value="docs" className="flex-1">
      Documentos{documents.length > 0 ? ` (${documents.length})` : ""}
    </TabsTrigger>
  );
}

function DocsQuickButton({ clientId, onOpen }: { clientId: string; onOpen: () => void }) {
  const { documents } = useClientDocuments(clientId);
  const count = documents.length;
  const hasDocs = count > 0;

  const button = (
    <button
      type="button"
      onClick={hasDocs ? onOpen : undefined}
      disabled={!hasDocs}
      aria-label={hasDocs ? `Abrir documentos (${count})` : "Nenhum documento anexado"}
      className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
        hasDocs
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
          : "border-border/50 bg-muted/30 text-muted-foreground/50 opacity-60 cursor-not-allowed"
      }`}
    >
      <FileText className="h-3.5 w-3.5" />
      {hasDocs && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top">
          {hasDocs ? `${count} documento${count > 1 ? "s" : ""} anexado${count > 1 ? "s" : ""}` : "Nenhum documento anexado"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}



interface Props {
  clients: Client[];
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: import("@/types/loan").InstallmentSchedule[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Client, "id" | "createdAt">>) => void;
}

type StatusFilter = "all" | "active" | "inactive" | "over-limit";
type SortOption = "name-asc" | "name-desc" | "newest" | "oldest" | "score-desc" | "score-asc";

const sortLabels: Record<SortOption, string> = {
  "name-asc": "A → Z",
  "name-desc": "Z → A",
  "newest": "Mais recentes",
  "oldest": "Mais antigos",
  "score-desc": "Melhor score",
  "score-asc": "Pior score",
};

interface CreditScore {
  score: number;
  label: string;
  color: string;
  bgColor: string;
  totalLoans: number;
  paidLoans: number;
  activeLoans: number;
  overdueLoans: number;
  onTimePayments: number;
  latePayments: number;
  totalPayments: number;
}

function calculateCreditScore(clientId: string, loans: Loan[], payments: Payment[]): CreditScore {
  const clientLoans = loans.filter((l) => l.borrowerId === clientId);
  const totalLoans = clientLoans.length;
  const paidLoans = clientLoans.filter((l) => l.status === "paid").length;
  const activeLoans = clientLoans.filter((l) => l.status === "active").length;
  const overdueLoans = clientLoans.filter((l) => l.status === "overdue").length;

  // Check overdue by dueDate for active loans
  const todayStr = todayInAppTz();
  const actualOverdue = clientLoans.filter((l) => l.status !== "paid" && l.dueDate < todayStr).length;
  const totalOverdue = Math.max(overdueLoans, actualOverdue);

  // Analyze payments timing
  let onTimePayments = 0;
  let latePayments = 0;

  clientLoans.forEach((loan) => {
    const loanPayments = payments.filter((p) => p.loanId === loan.id && p.installmentNumber > 0);
    loanPayments.forEach((p) => {
      // Calculate expected due date for this installment
      const start = new Date(loan.startDate + "T00:00:00");
      const expectedDue = new Date(start.getFullYear(), start.getMonth() + p.installmentNumber, start.getDate());
      const paymentDate = new Date(p.date + "T00:00:00");

      if (paymentDate <= expectedDue) {
        onTimePayments++;
      } else {
        latePayments++;
      }
    });
  });

  const totalPayments = onTimePayments + latePayments;

  // Calculate score (0-150, starts at 100)
  if (totalLoans === 0) {
    return { score: 100, label: "Sem Histórico", color: "text-muted-foreground", bgColor: "bg-muted", totalLoans, paidLoans, activeLoans, overdueLoans: totalOverdue, onTimePayments, latePayments, totalPayments };
  }

  let score = 100; // Base

  // Each on-time payment adds points
  score += onTimePayments * 3;

  // Each late payment subtracts points
  score -= latePayments * 5;

  // Each paid (completed) loan adds points
  score += paidLoans * 5;

  // Each currently overdue loan subtracts points
  score -= totalOverdue * 10;

  // Clamp 0-150
  score = Math.max(0, Math.min(150, score));

  let label: string;
  let color: string;
  let bgColor: string;

  if (score >= 130) { label = "Excelente"; color = "text-success"; bgColor = "bg-success"; }
  else if (score >= 110) { label = "Bom"; color = "text-primary"; bgColor = "bg-primary"; }
  else if (score >= 90) { label = "Regular"; color = "text-warning"; bgColor = "bg-warning"; }
  else if (score >= 60) { label = "Ruim"; color = "text-orange-500"; bgColor = "bg-orange-500"; }
  else { label = "Crítico"; color = "text-destructive"; bgColor = "bg-destructive"; }

  return { score, label, color, bgColor, totalLoans, paidLoans, activeLoans, overdueLoans: totalOverdue, onTimePayments, latePayments, totalPayments };
}

export function ClientList({ clients, loans, payments, installmentSchedules, onDelete, onUpdate, readOnly = false }: Props & { readOnly?: boolean }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTab, setEditingTab] = useState<"data" | "docs">("data");
  const [editForm, setEditForm] = useState<Record<string, any>>({ name: "", phone: "", email: "", cpf: "", cnpj: "", rg: "", address: "", city: "", state: "", score: "", notes: "", isVehicleRental: false, nacionalidade: "", estadoCivil: "", profissao: "", bairro: "", isManager: false, defaultInterestRate: "", creditLimit: "", autoBillingEnabled: true });
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [limitClient, setLimitClient] = useState<Client | null>(null);
  const [recentAdjustOpen, setRecentAdjustOpen] = useState(false);
  const [maxLimitOpen, setMaxLimitOpen] = useState(false);
  const { getLimitForClient, updateLimit, ensureLimit } = useCreditLimits();

  const creditScores = useMemo(() => {
    const map: Record<string, CreditScore> = {};
    clients.forEach((c) => {
      map[c.id] = calculateCreditScore(c.id, loans, payments);
    });
    return map;
  }, [clients, loans, payments]);

  const overLimitClientIds = useMemo(() => {
    const ids = new Set<string>();
    clients.forEach((c) => {
      const lim = getLimitForClient(c.id);
      if (!lim) return;
      const used = computeUsedLimit(c, loans);
      if (used > lim.currentLimit && lim.currentLimit >= 0) ids.add(c.id);
    });
    return ids;
  }, [clients, loans, getLimitForClient]);

  const filtered = clients
    .filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.cpf.includes(search) ||
        c.phone.includes(search);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && c.active !== false) ||
        (statusFilter === "inactive" && c.active === false) ||
        (statusFilter === "over-limit" && overLimitClientIds.has(c.id));
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortOption) {
        case "name-asc": return a.name.localeCompare(b.name, "pt-BR");
        case "name-desc": return b.name.localeCompare(a.name, "pt-BR");
        case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "score-desc": return (creditScores[b.id]?.score || 0) - (creditScores[a.id]?.score || 0);
        case "score-asc": return (creditScores[a.id]?.score || 0) - (creditScores[b.id]?.score || 0);
        default: return 0;
      }
    });

  const activeCount = clients.filter((c) => c.active !== false).length;
  const inactiveCount = clients.filter((c) => c.active === false).length;
  const overLimitCount = overLimitClientIds.size;

  const startEdit = (client: Client) => {
    setEditingId(client.id);
    const cl = getLimitForClient(client.id);
    setEditForm({ name: client.name, phone: client.phone, email: client.email, cpf: client.cpf, cnpj: client.cnpj || "", rg: client.rg || "", address: client.address, city: client.city || "", state: client.state || "", score: client.score || "", notes: client.notes || "", isVehicleRental: client.isVehicleRental || false, nacionalidade: client.nacionalidade || "", estadoCivil: client.estadoCivil || "", profissao: client.profissao || "", bairro: client.bairro || "", isManager: client.isManager || false, defaultInterestRate: client.defaultInterestRate != null ? String(client.defaultInterestRate) : "", creditLimit: cl?.currentLimit != null ? String(cl.currentLimit) : "", autoBillingEnabled: client.autoBillingEnabled ?? true });
  };

  const saveEdit = async (id: string) => {
    const { defaultInterestRate, creditLimit, ...rest } = editForm;
    const parsedRate = (defaultInterestRate ?? "").toString().trim() === "" ? null : parseFloat(defaultInterestRate);
    onUpdate(id, { ...rest, defaultInterestRate: parsedRate !== null && !isNaN(parsedRate) ? parsedRate : null });
    // Update credit limit if changed
    const parsedLimit = (creditLimit ?? "").toString().trim() === "" ? null : parseFloat(String(creditLimit).replace(",", "."));
    if (parsedLimit !== null && !isNaN(parsedLimit) && parsedLimit >= 0) {
      const existing = getLimitForClient(id);
      if (!existing) await ensureLimit(id);
      const current = getLimitForClient(id)?.currentLimit ?? 0;
      if (Math.abs(current - parsedLimit) > 0.001) {
        await updateLimit(id, parsedLimit, {
          mode: "manual",
          changeType: "manual",
          reason: "Ajuste manual via edição do cliente",
        });
      }
    }
    setEditingId(null);
  };

  const handleToggleActive = async (client: Client) => {
    const becomingInactive = client.active !== false;
    onUpdate(client.id, { active: !client.active });
    if (becomingInactive) {
      const existing = getLimitForClient(client.id);
      if (existing && existing.currentLimit > 0) {
        await updateLimit(client.id, 0, {
          mode: "manual",
          changeType: "manual",
          reason: "Cliente inativado — limite zerado automaticamente",
        });
      }
    }
  };

  const updateField = (field: string, value: string | boolean) => setEditForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-4">
      <div className="hidden sm:flex flex-wrap gap-2">
        {([
          { id: "all" as StatusFilter, label: "Todos", count: clients.length },
          { id: "active" as StatusFilter, label: "Ativos", count: activeCount },
          { id: "inactive" as StatusFilter, label: "Inativos", count: inactiveCount },
        ]).map((opt) => (
          <button
            key={opt.id}
            onClick={() => setStatusFilter(opt.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border ${
              statusFilter === opt.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:opacity-80"
            }`}
          >
            {opt.label} ({opt.count})
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRecentAdjustOpen(true)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border bg-card border-border text-muted-foreground hover:opacity-80 inline-flex items-center gap-1.5"
          title="Ver clientes com limite ajustado recentemente"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Limites ajustados
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("over-limit")}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border inline-flex items-center gap-1.5 ${
            statusFilter === "over-limit"
              ? "bg-destructive text-destructive-foreground border-destructive"
              : "bg-card border-border text-muted-foreground hover:opacity-80"
          }`}
          title="Clientes com empréstimos acima do limite definido"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Acima do limite ({overLimitCount})
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setMaxLimitOpen(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border bg-card border-border text-muted-foreground hover:opacity-80 inline-flex items-center gap-1.5"
            title="Definir limite máximo global"
          >
            <Shield className="h-3.5 w-3.5" />
            Limite máximo
          </button>
        )}
      </div>

      {/* Mobile: single filter dropdown */}
      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 w-full justify-between">
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />
                {statusFilter === "all" && `Todos (${clients.length})`}
                {statusFilter === "active" && `Ativos (${activeCount})`}
                {statusFilter === "inactive" && `Inativos (${inactiveCount})`}
                {statusFilter === "over-limit" && `Acima do limite (${overLimitCount})`}
              </span>
              <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)] max-w-sm">
            <DropdownMenuItem onClick={() => setStatusFilter("all")}>
              <Users className="h-4 w-4 mr-2" /> Todos ({clients.length})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("active")}>
              <ToggleRight className="h-4 w-4 mr-2" /> Ativos ({activeCount})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("inactive")}>
              <ToggleLeft className="h-4 w-4 mr-2" /> Inativos ({inactiveCount})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("over-limit")}>
              <AlertTriangle className="h-4 w-4 mr-2" /> Acima do limite ({overLimitCount})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRecentAdjustOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" /> Limites ajustados
            </DropdownMenuItem>
            {!readOnly && (
              <DropdownMenuItem onClick={() => setMaxLimitOpen(true)}>
                <Shield className="h-4 w-4 mr-2" /> Limite máximo
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input placeholder="Buscar por nome, CPF ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 gap-1.5 whitespace-nowrap">
              <ArrowUpDown className="h-4 w-4" />
              <span className="hidden sm:inline">{sortLabels[sortOption]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortOption("name-asc")} className="gap-2">
              <ArrowDownAZ className="h-4 w-4" /> A → Z
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("name-desc")} className="gap-2">
              <ArrowUpAZ className="h-4 w-4" /> Z → A
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("score-desc")} className="gap-2">
              <TrendingUp className="h-4 w-4" /> Melhor score
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("score-asc")} className="gap-2">
              <AlertTriangle className="h-4 w-4" /> Pior score
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("newest")} className="gap-2">
              <Clock className="h-4 w-4" /> Mais recentes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOption("oldest")} className="gap-2">
              <CalendarDays className="h-4 w-4" /> Mais antigos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{clients.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum resultado encontrado"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((client, i) => {
            const cs = creditScores[client.id];
            return (
            <div key={client.id} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}>
            <Card className={`hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-400 ease-out overflow-hidden ${!client.active ? "opacity-60" : ""}`}>
              <CardContent className="p-3 sm:p-5">
                {editingId === client.id ? (
                  <div className="space-y-3">
                    <Tabs defaultValue="data" className="w-full">
                      <TabsList className="w-full">
                        <TabsTrigger value="data" className="flex-1">Dados do Cliente</TabsTrigger>
                        <DocumentsTabTrigger clientId={client.id} />
                      </TabsList>
                      <TabsContent value="data" className="space-y-3 mt-3">
                    <div>
                      <Label className="text-xs">Nome</Label>
                      <Input value={editForm.name} onChange={(e) => updateField("name", e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">CPF</Label>
                        <Input value={editForm.cpf} onChange={(e) => updateField("cpf", e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Telefone</Label>
                        <Input value={editForm.phone} onChange={(e) => updateField("phone", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">E-mail</Label>
                      <Input value={editForm.email} onChange={(e) => updateField("email", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Endereço</Label>
                      <Input value={editForm.address} onChange={(e) => updateField("address", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Taxa de juros padrão (% ao mês)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editForm.defaultInterestRate}
                        onChange={(e) => updateField("defaultInterestRate", e.target.value)}
                        placeholder="30"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Se vazio, será usado 30% em novos empréstimos.
                      </p>
                    </div>
                    {/* Credit Limit edit */}
                    {(() => {
                      const used = computeUsedLimit(client, loans);
                      const totalNum = parseFloat(String(editForm.creditLimit).replace(",", ".")) || 0;
                      const available = computeAvailableLimit(totalNum, used);
                      return (
                        <div className="border border-border rounded-lg p-3 space-y-2">
                          <Label className="text-xs flex items-center gap-1.5">
                            <Wallet className="h-3.5 w-3.5 text-primary" /> Limite de Crédito
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editForm.creditLimit}
                            onChange={(e) => updateField("creditLimit", e.target.value)}
                            placeholder="0,00"
                            disabled={client.active === false}
                          />
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div>
                              <p className="text-muted-foreground">Utilizado</p>
                              <p className="font-semibold text-warning">{formatBRL(used)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Disponível</p>
                              <p className={`font-semibold ${available < 0 ? "text-destructive" : "text-success"}`}>{formatBRL(available)}</p>
                            </div>
                          </div>
                          {client.active === false && (
                            <p className="text-[10px] text-destructive">
                              Cliente inativo — limite zerado e bloqueado para novas operações.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    <div>
                      <Label className="text-xs">Observações</Label>
                      <Textarea value={editForm.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2} />
                    </div>
                    <div className="border border-border rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-manager-${client.id}`}
                          checked={editForm.isManager}
                          onCheckedChange={(checked) => updateField("isManager", !!checked)}
                        />
                        <Label htmlFor={`edit-manager-${client.id}`} className="text-xs font-medium cursor-pointer">
                          Cliente é Gerente
                        </Label>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 ml-6">
                        Habilita receber comissão sobre empréstimos atrelados.
                      </p>
                    </div>
                    <div className="border border-border rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-autobilling-${client.id}`}
                          checked={editForm.autoBillingEnabled}
                          onCheckedChange={(checked) => updateField("autoBillingEnabled", !!checked)}
                        />
                        <Label htmlFor={`edit-autobilling-${client.id}`} className="text-xs font-medium cursor-pointer">
                          Receber cobrança automática por WhatsApp
                        </Label>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 ml-6">
                        Se desmarcado, nenhum contrato deste cliente será cobrado automaticamente.
                      </p>
                    </div>
                    <div className="border border-border rounded-lg p-3 space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-vehicle-${client.id}`}
                          checked={editForm.isVehicleRental}
                          onCheckedChange={(checked) => updateField("isVehicleRental", !!checked)}
                        />
                        <Label htmlFor={`edit-vehicle-${client.id}`} className="text-xs font-medium cursor-pointer">
                          Aluguel de Veículos
                        </Label>
                      </div>
                      {editForm.isVehicleRental && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">RG</Label>
                              <Input value={editForm.rg} onChange={(e) => updateField("rg", e.target.value)} placeholder="00.000.000-0" />
                            </div>
                            <div>
                              <Label className="text-xs">Cidade</Label>
                              <Input value={editForm.city} onChange={(e) => updateField("city", e.target.value)} placeholder="São Paulo" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Nacionalidade</Label>
                              <Input value={editForm.nacionalidade} onChange={(e) => updateField("nacionalidade", e.target.value)} placeholder="Brasileiro(a)" />
                            </div>
                            <div>
                              <Label className="text-xs">Estado Civil</Label>
                              <Input value={editForm.estadoCivil} onChange={(e) => updateField("estadoCivil", e.target.value)} placeholder="Solteiro(a)" />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Profissão</Label>
                            <Input value={editForm.profissao} onChange={(e) => updateField("profissao", e.target.value)} placeholder="Motorista" />
                          </div>
                          <div>
                            <Label className="text-xs">Bairro</Label>
                            <Input value={editForm.bairro} onChange={(e) => updateField("bairro", e.target.value)} placeholder="Centro" />
                          </div>
                        </div>
                      )}
                    </div>
                      </TabsContent>
                      <TabsContent value="docs" className="mt-3">
                        <ClientDocuments clientId={client.id} />
                      </TabsContent>
                    </Tabs>

                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="w-[25px] h-[25px] mr-1" /> Cancelar
                      </Button>
                      <Button data-mutation size="sm" onClick={() => saveEdit(client.id)}>
                        <Check className="w-[25px] h-[25px] mr-1" /> Salvar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-10 w-10 shrink-0 rounded-full gradient-primary flex items-center justify-center">
                            <User className="h-5 w-5 text-primary-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-foreground break-words">{client.name}</h3>
                              <Badge variant="outline" className={client.active ? "bg-success/10 text-success border-success/20 text-xs" : "bg-muted text-muted-foreground border-border text-xs"}>
                                {client.active ? "Ativo" : "Inativo"}
                              </Badge>
                            </div>
                            {client.cpf && <p className="text-xs text-muted-foreground break-words">CPF: {client.cpf}</p>}
                            {client.phone && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                                <Phone className="h-3.5 w-3.5" />
                                <span>{client.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {!readOnly && (
                          <div className="flex gap-0.5 shrink-0">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setLimitClient(client)} title="Limite de crédito">
                              <Wallet className="h-4 w-4 text-primary" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelectedClient(client)} title="Análise financeira">
                              <ShieldCheck className="h-4 w-4 text-primary" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Score + action buttons row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 rounded-xl border border-border/30 px-3 py-1.5">
                          <span className={`h-2 w-2 rounded-full ${cs.bgColor}`} />
                          <span className="text-xs text-muted-foreground">Score</span>
                          <span className={`text-sm font-bold ${cs.color}`}>{cs.score}</span>
                        </div>
                        {!readOnly && (
                          <div className="flex gap-0.5 sm:gap-1 items-center">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => handleToggleActive(client)}
                              title={client.active ? "Desativar" : "Ativar"}
                            >
                              {client.active ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                            <RowActions
                              size="md"
                              actions={[
                                { label: "Editar", icon: <Pencil className="h-4 w-4" />, onClick: () => startEdit(client) },
                                { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => setDeleteClientId(client.id) },
                              ]}
                            />
                          </div>

                        )}
                      </div>
                    </div>

                    {/* Credit Limit — Total / Utilizado / Disponível */}
                    {(() => {
                      const cl = getLimitForClient(client.id);
                      const total = cl?.currentLimit ?? 0;
                      const used = computeUsedLimit(client, loans);
                      const available = computeAvailableLimit(total, used);
                      return (
                        <button
                          type="button"
                          onClick={() => setLimitClient(client)}
                          className="w-full rounded-xl border border-border/30 p-3 mb-3 text-left hover:bg-accent/30 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Wallet className="h-4 w-4 text-primary" />
                              <span className="text-xs font-medium text-muted-foreground">Limite de Crédito</span>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {cl?.mode === "manual" ? "Manual" : "Auto"}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <p className="text-[10px] text-muted-foreground">Total</p>
                              <p className="font-semibold">{formatBRL(total)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">Utilizado</p>
                              <p className="font-semibold text-warning">{formatBRL(used)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">Disponível</p>
                              <p className={`font-semibold ${available < 0 ? "text-destructive" : "text-success"}`}>{formatBRL(available)}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })()}

                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      {client.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /><span>{client.email}</span></div>}
                      {client.address && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /><span>{client.address}</span></div>}
                    </div>
                    {client.notes && <p className="text-xs text-muted-foreground mt-2 italic">"{client.notes}"</p>}
                  </>
                )}
              </CardContent>
            </Card>
            </div>
            );
          })}
        </div>
      )}
      <ConfirmDeleteDialog
        open={!!deleteClientId}
        onOpenChange={() => setDeleteClientId(null)}
        onConfirm={() => { if (deleteClientId) { onDelete(deleteClientId); setDeleteClientId(null); } }}
        title="Excluir cliente"
        description="Tem certeza que deseja excluir este cliente?"
      />
      <ClientDetailDialog
        open={!!selectedClient}
        onOpenChange={(open) => !open && setSelectedClient(null)}
        client={selectedClient}
        loans={loans}
        payments={payments}
        installmentSchedules={installmentSchedules}
      />
      {limitClient && (
        <CreditLimitDialog
          open={!!limitClient}
          onOpenChange={(open) => !open && setLimitClient(null)}
          client={limitClient}
          loans={loans}
          payments={payments}
        />
      )}
      <RecentLimitAdjustmentsDialog
        open={recentAdjustOpen}
        onOpenChange={setRecentAdjustOpen}
        clients={clients}
      />
      <MaxCreditLimitDialog
        open={maxLimitOpen}
        onOpenChange={setMaxLimitOpen}
      />
    </div>
  );
}
