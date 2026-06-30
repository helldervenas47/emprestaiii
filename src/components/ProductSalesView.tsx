import { useState, useCallback, useEffect, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import * as LucideIcons from "lucide-react";
import { usePaymentCelebration } from "@/hooks/usePaymentCelebration";
import { todayInAppTz } from "@/lib/timezone";
import { getDueStatusBadge } from "@/lib/dueStatus";
import { SalePaymentRecord } from "@/types/loan";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Sale, BusinessType, Client, Expense } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Search, ShoppingCart, Tv, Car, Calendar as CalendarIcon, User, Pencil, ChevronDown, ChevronUp, CheckCircle, CheckCircle2, HandCoins, Check, X as XIcon, DollarSign, AlertTriangle, Clock, CircleCheck, Receipt, Plus, Wallet, ChevronLeft, ChevronRight, LayoutGrid, Folder, List, FileText, BookOpen, Boxes } from "lucide-react";
import { StockManager } from "@/components/StockManager";
import { SalesLedger } from "@/components/SalesLedger";
import { generateContract } from "@/lib/generateContract";
import { addMonths, addWeeks, addDays, format, startOfMonth, endOfMonth, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/userClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIncomeCategories, CustomIncomeCategory } from "@/hooks/useIncomeCategories";
import { personalIconMap } from "@/lib/personalExpenseCategories";
import { Tag } from "lucide-react";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { validateSalePayment } from "@/lib/paymentValidation";
import { toast } from "sonner";

import { useHideValues } from "@/contexts/HideValuesContext";
import { SaleEditForm } from "@/components/SaleEditForm";
import { WarrantyManager } from "@/components/warranty/WarrantyManager";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { parseNotesWithMerchandise } from "@/lib/saleMerchandise";

import { VehicleExpenseForm, isVehicleExpenseForVehicles, vehicleExpenseCategories } from "@/components/VehicleExpenseForm";
import { VehicleLocadorManager } from "@/components/VehicleLocadorManager";
import { useLocadorInfo, LocadorInfo } from "@/hooks/useLocadorInfo";
import { useVehicleRegistry, VehicleInfo } from "@/hooks/useVehicleRegistry";
import { ExpenseBoletoLinkSection } from "@/components/ExpenseBoletoLinkSection";
import { ExpenseBoletoLinkButton } from "@/components/ExpenseBoletoLinkButton";
import { SaleCategory, SaleClientGroup, SummaryBreakdownCard, saleCategoryFilters } from "@/components/product-sales/productSalesTypes";
import { ProductSalesSummaryCards } from "@/components/product-sales/ProductSalesSummaryCards";
import { ProductSalesFilters } from "@/components/product-sales/ProductSalesFilters";
import { ProductSalesHeader } from "@/components/product-sales/ProductSalesHeader";
import {
  addByFrequency,
  businessTabs,
  getNextDueDateHelper,
  getNextInstallmentValueHelper,
  getSaleCategory,
  getSalePaidAmountHelper,
  rawFormatCurrency,
  saleCategoryConfig,
  salesSubTabs,
} from "@/components/product-sales/productSalesUtils";
import { ProductSaleCard } from "@/components/product-sales/ProductSaleCard";
import { ProductSalesTable } from "@/components/product-sales/ProductSalesTable";
import { ProductSalesMobileCards } from "@/components/product-sales/ProductSalesMobileCards";
import { useProductSalesController } from "@/components/product-sales/useProductSalesController";
import { VehicleExpenseEditDialog, VehiclePayExpenseDialog } from "@/components/product-sales/VehicleExpenseDialogs";
import { ProductSalesSubTabsList } from "@/components/product-sales/ProductSalesSubTabs";


interface Props {
  sales: Sale[];
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
  clients?: Client[];
  expenses?: Expense[];
  onAddExpense?: (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => void;
  onPayExpense?: (id: string, skipBalanceAdjust?: boolean, payDate?: string, paidAmount?: number) => void;
  onDeleteExpense?: (id: string, skipBalanceAdjust?: boolean) => void;
  onUpdateExpense?: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  readOnly?: boolean;
  isVehicleView?: boolean;
  locadores?: LocadorInfo[];
  onSaveLocador?: (info: LocadorInfo) => void;
}





// Types/filters moved to ./product-sales/productSalesTypes



function SaleClientFolder({
  group, onDeleteSale, onUpdateSale, formatCurrency, onEdit, readOnly = false, clients = [], locadorInfo, registeredVehicles = [], locadores = [],
}: {
  group: SaleClientGroup;
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
  formatCurrency: (v: number) => string;
  onEdit: (sale: Sale) => void;
  readOnly?: boolean;
  clients?: Client[];
  locadorInfo?: LocadorInfo;
  registeredVehicles?: VehicleInfo[];
  locadores?: LocadorInfo[];
}) {
  const [open, setOpen] = useState(false);
  const activeCount = group.sales.filter((s) => getSaleCategory(s) !== "paid").length;
  const paidCount = group.sales.filter((s) => getSaleCategory(s) === "paid").length;

  return (
    <Card no3d className={`overflow-hidden transition-shadow hover:shadow-lg ${open ? "ring-1 ring-primary/20" : ""} ${group.hasOverdue ? "border-destructive/40" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-md ${group.hasOverdue ? "bg-destructive" : "gradient-primary"}`}>
          {group.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-foreground text-sm truncate">{group.name}</h3>
            {group.hasOverdue && <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Atrasado</Badge>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px]">{group.sales.length}</Badge>
            {activeCount > 0 && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{activeCount} ativos</Badge>}
            {paidCount > 0 && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">{paidCount} pagos</Badge>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">Total</p>
            <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">PAGO</p>
            <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">A Receber</p>
            <p className={`font-bold ${group.hasOverdue ? "text-destructive" : "text-warning"}`}>{formatCurrency(group.totalReceivable)}</p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-3 px-3 space-y-3">
          {/* Mobile summary */}
          <div className="flex sm:hidden items-center justify-between text-xs border-b border-border/30 pb-3">
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">Total</p>
              <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">PAGO</p>
              <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">A Receber</p>
              <p className={`font-bold ${group.hasOverdue ? "text-destructive" : "text-warning"}`}>{formatCurrency(group.totalReceivable)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.sales.map((sale) => (
              <ProductSaleCard
                key={sale.id}
                sale={sale}
                onDelete={() => onDeleteSale(sale.id)}
                onEdit={() => onEdit(sale)}
                onUpdate={(data) => onUpdateSale(sale.id, data)}
                formatCurrency={formatCurrency}
                readOnly={readOnly}
                clients={clients}
                locadorInfo={locadorInfo}
                registeredVehicles={registeredVehicles}
                locadores={locadores}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function SalesList({ sales, onDeleteSale, onUpdateSale, clients = [], hideOnTrackCard = false, renderAfterCards, readOnly = false, locadorInfo, registeredVehicles = [], locadores = [] }: { sales: Sale[]; onDeleteSale: (id: string) => void; onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void; clients?: Client[]; hideOnTrackCard?: boolean; renderAfterCards?: React.ReactNode; readOnly?: boolean; locadorInfo?: LocadorInfo; registeredVehicles?: VehicleInfo[]; locadores?: LocadorInfo[] }) {
  const {
    editingSale, setEditingSale,
    search, setSearch,
    categoryFilter, setCategoryFilter,
    incomeCategoryFilter,
    view, setView,
    breakdownCard, setBreakdownCard,
    formatCurrency,
    incomeCategoryByName,
    counts,
    filtered,
    total,
    folderCount,
    saleGroups,
    listSorted,
    overdueSales,
    onTrackSales,
    dueTodaySales,
    paidContractsCount,
    totalOverdue,
    totalOnTrack,
    totalDueToday,
    totalPaid,
    totalAReceber,
    getSalePaidAmount,
    getRemaining,
    getOverdueInstallmentsValue,
    getFutureInstallmentsValue,
    getDueTodayInstallmentValue,
  } = useProductSalesController(sales);
  // incomeCategoryFilter setter currently unused inside this component (filter UI lives in ProductSalesFilters).
  void incomeCategoryFilter;

  return (
    <div className="space-y-4">
      {/* Dashboard cards */}
      <ProductSalesSummaryCards
        hideOnTrackCard={hideOnTrackCard}
        formatCurrency={formatCurrency}
        totalOverdue={totalOverdue}
        totalOnTrack={totalOnTrack}
        totalDueToday={totalDueToday}
        totalPaid={totalPaid}
        totalAReceber={totalAReceber}
        overdueCount={overdueSales.length}
        onTrackCount={onTrackSales.length}
        dueTodayCount={dueTodaySales.length}
        paidContractsCount={paidContractsCount}
        onSelect={setBreakdownCard}
      />


      {/* Breakdown dialog for clicked summary card */}
      {breakdownCard && (() => {
        const cfg = breakdownCard === "overdue"
          ? { title: "Vencidos", color: "text-destructive", total: totalOverdue,
              items: overdueSales.map((s) => ({ sale: s, value: getOverdueInstallmentsValue(s) })).filter((x) => x.value > 0) }
          : breakdownCard === "paid"
          ? { title: "Pagos", color: "text-success", total: totalPaid,
              items: sales.map((s) => ({ sale: s, value: getSalePaidAmount(s) })).filter((x) => x.value > 0) }
          : breakdownCard === "ontrack"
          ? { title: "No Prazo", color: "text-primary", total: totalOnTrack + totalDueToday,
              items: sales
                .filter((s) => getSaleCategory(s) !== "paid")
                .map((s) => {
                  const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
                  const value = isRecorrente
                    ? getFutureInstallmentsValue(s) + getDueTodayInstallmentValue(s)
                    : (getSaleCategory(s) === "on_track" || getSaleCategory(s) === "due_today" ? getRemaining(s) : 0);
                  return { sale: s, value };
                })
                .filter((x) => x.value > 0) }
          : { title: "Total a Receber", color: "text-warning", total: totalAReceber,
              items: sales.filter((s) => getSaleCategory(s) !== "paid").map((s) => ({ sale: s, value: getRemaining(s) })).filter((x) => x.value > 0) };
        const sorted = [...cfg.items].sort((a, b) => b.value - a.value);
        return (
          <Dialog open={!!breakdownCard} onOpenChange={(o) => !o && setBreakdownCard(null)}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className={cfg.color}>Valores em "{cfg.title}"</DialogTitle>
                <DialogDescription>Detalhamento dos valores considerados neste card ({sorted.length} {sorted.length === 1 ? "item" : "itens"}).</DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {sorted.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum valor considerado.</p>
                )}
                {sorted.map(({ sale, value }) => (
                  <div key={sale.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{sale.customerName || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{sale.productName || sale.description}</p>
                    </div>
                    <p className={`text-sm font-bold tabular-nums ${cfg.color}`}>{formatCurrency(value)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 flex items-center justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className={`text-base font-bold tabular-nums ${cfg.color}`}>{formatCurrency(cfg.total)}</span>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}


      {renderAfterCards}

      <ProductSalesFilters
        view={view}
        setView={setView}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        search={search}
        setSearch={setSearch}
        counts={counts}
        totalSalesCount={sales.length}
        folderCount={folderCount}
        filteredCount={filtered.length}
        totalAmount={total}
        formatCurrency={formatCurrency}
      />


      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhum lançamento encontrado</p>
        </CardContent></Card>
      ) : view === "folders" ? (
        saleGroups.length > 0 ? (
          <div className="space-y-4">
            {saleGroups.map((g) => (
              <SaleClientFolder
                key={g.name}
                group={g}
                onDeleteSale={onDeleteSale}
                onUpdateSale={onUpdateSale}
                formatCurrency={formatCurrency}
                onEdit={setEditingSale}
                readOnly={readOnly}
                clients={clients}
                locadorInfo={locadorInfo}
                registeredVehicles={registeredVehicles}
                locadores={locadores}
              />
            ))}
          </div>
        ) : (
          <Card no3d><CardContent className="py-12 text-center">
            <Folder className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhuma pasta encontrada</p>
          </CardContent></Card>
        )
      ) : view === "list" ? (
        <ProductSalesTable
          sales={listSorted}
          formatCurrency={formatCurrency}
          readOnly={readOnly}
          incomeCategoryByName={incomeCategoryByName}
          onEdit={setEditingSale}
          onDeleteSale={onDeleteSale}
          onUpdateSale={onUpdateSale}
        />
      ) : (
        <ProductSalesMobileCards
          sales={filtered}
          formatCurrency={formatCurrency}
          readOnly={readOnly}
          clients={clients}
          locadorInfo={locadorInfo}
          registeredVehicles={registeredVehicles}
          locadores={locadores}
          onEdit={setEditingSale}
          onDeleteSale={onDeleteSale}
          onUpdateSale={onUpdateSale}
        />
      )}
      {editingSale && (
        <SaleEditForm
          sale={editingSale}
          onSave={(id, data) => {
            onUpdateSale(id, data);
            setEditingSale(null);
          }}
          onClose={() => setEditingSale(null)}
          clients={clients}
          registeredVehicles={registeredVehicles}
          locadores={locadores}
        />
      )}
    </div>
  );
}

// VehicleExpenseEditDialog & VehiclePayExpenseDialog moved to ./product-sales/VehicleExpenseDialogs


export function ProductSalesView({ sales, onDeleteSale, onUpdateSale, clients = [], expenses = [], onAddExpense, onPayExpense, onDeleteExpense, onUpdateExpense, readOnly = false, isVehicleView = false, locadores: locadoresProp, onSaveLocador: onSaveLocadorProp }: Props) {
  const [showVehicleExpenseForm, setShowVehicleExpenseForm] = useState(false);
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);

  // Locador & Vehicle Registry hooks - use props from parent to share state
  const locadorHook = useLocadorInfo();
  const locadores = locadoresProp ?? locadorHook.locadores;
  const saveLocador = onSaveLocadorProp ?? locadorHook.save;
  const locador = locadores[0] || { nome: "", rg: "", cpf: "", nacionalidade: "Brasileiro(a)", profissao: "", endereco: "", bairro: "", cidade: "", estado: "" };
  const { vehicles: registeredVehicles, add: addVehicle, update: updateVehicle, remove: removeVehicle } = useVehicleRegistry();

  // Balance state
  const [balance, setBalanceState] = useState<number>(0);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [showDeleteAllExpenses, setShowDeleteAllExpenses] = useState(false);
  const [viewPaymentsExpenseId, setViewPaymentsExpenseId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [payingExpenseId, setPayingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: ownerData } = await supabase.from("user_owner" as any).select("owner_id").eq("user_id", user.id).maybeSingle();
      const ownerId = (ownerData as any)?.owner_id || user.id;
      const { data } = await supabase.from("vehicle_balance").select("amount").eq("user_id", ownerId).maybeSingle();
      setBalanceState(data?.amount ?? 0);
    })();
  }, []);

  const handleSaveBalance = async () => {
    const val = parseFloat(balanceInput);
    if (isNaN(val)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: ownerData } = await supabase.from("user_owner" as any).select("owner_id").eq("user_id", user.id).maybeSingle();
    const ownerId = (ownerData as any)?.owner_id || user.id;
    const { data: existing } = await supabase.from("vehicle_balance").select("id").eq("user_id", ownerId).maybeSingle();
    if (existing) {
      await supabase.from("vehicle_balance").update({ amount: val, updated_at: new Date().toISOString() }).eq("user_id", ownerId);
    } else {
      await supabase.from("vehicle_balance").insert({ user_id: ownerId, amount: val });
    }
    setBalanceState(val);
    setEditingBalance(false);
  };

  // Month filter for expenses
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // All vehicle-related expenses (used for "Limpar Pagamentos" actions)
  const allVehicleExpenses = expenses.filter(isVehicleExpenseForVehicles);

  // Monthly vehicle expenses - consider installment due dates
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const monthStart = new Date(selYear, selMonthNum - 1, 1);
  const monthEnd = endOfMonth(monthStart);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");

  // Filter expenses that have at least one due date inside the selected month
  // (considers recurring installments). Sum monthly total in the same pass.
  let monthlyTotal = 0;
  const vehicleExpenses = allVehicleExpenses.filter(exp => {
    const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
    if (isRecorrente) {
      const baseDate = new Date(exp.dueDate + "T00:00:00");
      const installmentAmount = exp.amount / exp.installments!;
      let hit = false;
      for (let i = 0; i < exp.installments!; i++) {
        const instDateStr = format(addMonths(baseDate, i), "yyyy-MM-dd");
        if (instDateStr >= monthStartStr && instDateStr <= monthEndStr) {
          monthlyTotal += installmentAmount;
          hit = true;
        }
      }
      return hit;
    }
    if (exp.dueDate >= monthStartStr && exp.dueDate <= monthEndStr) {
      monthlyTotal += exp.amount;
      return true;
    }
    return false;
  });

  // Generate month options (last 12 months + current)
  const monthOptions: { value: string; label: string }[] = [];
  for (let i = -1; i < 12; i++) {
    const d = addMonths(now, -i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = format(d, "MMMM yyyy", { locale: ptBR });
    monthOptions.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }

  const secondaryCards = (
    <ProductSalesHeader
      selectedMonth={selectedMonth}
      setSelectedMonth={setSelectedMonth}
      selYear={selYear}
      selMonthNum={selMonthNum}
      readOnly={readOnly}
      balance={balance}
      editingBalance={editingBalance}
      balanceInput={balanceInput}
      setBalanceInput={setBalanceInput}
      setEditingBalance={setEditingBalance}
      handleSaveBalance={handleSaveBalance}
      formatCurrency={formatCurrency}
      monthlyTotal={monthlyTotal}
    />
  );


  // Check if this is the vehicles-only view
  const hasSalesOrStreaming = !isVehicleView;
  
  const updateVehicleBalance = useCallback(async (delta: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: ownerData } = await supabase.from("user_owner" as any).select("owner_id").eq("user_id", user.id).maybeSingle();
    const ownerId = (ownerData as any)?.owner_id || user.id;
    const { data: existing } = await supabase.from("vehicle_balance").select("amount").eq("user_id", ownerId).maybeSingle();
    const currentBalance = existing?.amount ?? 0;
    const newBalance = currentBalance + delta;
    if (existing) {
      await supabase.from("vehicle_balance").update({ amount: newBalance, updated_at: new Date().toISOString() }).eq("user_id", ownerId);
    } else {
      await supabase.from("vehicle_balance").insert({ user_id: ownerId, amount: newBalance });
    }
    setBalanceState(newBalance);
  }, []);

  // Wrap onUpdateSale to update vehicle balance when installments are paid or deleted
  const handleVehicleUpdateSale = useCallback((id: string, data: Partial<Omit<Sale, "id">>) => {
    const sale = sales.find(s => s.id === id);
    if (!sale) { onUpdateSale(id, data); return; }

    if (data.paidInstallments !== undefined) {
      const amounts = sale.installmentAmounts;
      const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments : sale.total;

      if (data.paidInstallments > sale.paidInstallments) {
        // Payment: add installment value to balance
        const paidIdx = sale.paidInstallments;
        const paidValue = amounts && amounts[paidIdx] != null ? amounts[paidIdx] : defaultVal;
        const actualPaid = Math.max(0, paidValue - (data.partialPaid !== undefined ? 0 : (sale.partialPaid || 0)));
        updateVehicleBalance(actualPaid);
      } else if (data.paidInstallments < sale.paidInstallments) {
        // Undo payment: subtract deleted installments from balance
        let refundTotal = 0;
        for (let i = data.paidInstallments; i < sale.paidInstallments; i++) {
          refundTotal += amounts && amounts[i] != null ? amounts[i] : defaultVal;
        }
        updateVehicleBalance(-refundTotal);
      }
    }

    // Handle partial payments
    if (data.partialPaid !== undefined && data.paidInstallments === undefined) {
      const addedPartial = (data.partialPaid || 0) - (sale.partialPaid || 0);
      if (addedPartial !== 0) {
        updateVehicleBalance(addedPartial);
      }
    }

    onUpdateSale(id, data);
  }, [sales, onUpdateSale, updateVehicleBalance]);

  // Wrap onPayExpense to debit vehicle balance using the actual paid amount.
  // Para despesas parceladas, ajusta o total da despesa (exp.amount) para refletir o
  // valor efetivamente pago nesta parcela, mantendo as parcelas restantes no valor
  // original. O valor original da parcela é guardado em notes como [OrigParcela: X].
  const handleVehiclePayExpense = useCallback((id: string, payDate: string, paidAmount: number) => {
    const exp = expenses.find(e => e.id === id);
    if (!exp || exp.paid) { onPayExpense?.(id, true, payDate, paidAmount); return; }
    updateVehicleBalance(-paidAmount);

    const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
    if (isRecorrente && onUpdateExpense) {
      const origMatch = (exp.notes ?? "").match(/\[OrigParcela:\s*([\d.]+)\]/i);
      const originalInstallment = origMatch ? parseFloat(origMatch[1]) : exp.amount / exp.installments!;
      const diff = paidAmount - originalInstallment;
      const updates: Partial<Omit<Expense, "id" | "createdAt">> = {};
      if (Math.abs(diff) > 0.005) {
        updates.amount = Math.round((exp.amount + diff) * 100) / 100;
      }
      if (!origMatch) {
        const baseNotes = (exp.notes ?? "").trimEnd();
        updates.notes = baseNotes ? `${baseNotes}\n[OrigParcela: ${originalInstallment.toFixed(2)}]` : `[OrigParcela: ${originalInstallment.toFixed(2)}]`;
      }
      if (Object.keys(updates).length > 0) onUpdateExpense(id, updates);
    }

    onPayExpense?.(id, true, payDate, paidAmount);
  }, [expenses, onPayExpense, onUpdateExpense, updateVehicleBalance]);

  // Wrap onDeleteExpense to restore vehicle balance for any amount that was already paid
  const handleVehicleDeleteExpense = useCallback((id: string) => {
    const exp = expenses.find(e => e.id === id);
    if (exp) {
      const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
      let refund = 0;
      if (isRecorrente) {
        const installmentAmount = exp.amount / exp.installments!;
        refund = installmentAmount * (exp.paidInstallments || 0);
      } else if (exp.paid) {
        refund = exp.amount;
      }
      if (refund > 0) updateVehicleBalance(refund);
    }
    onDeleteExpense?.(id, true);
  }, [expenses, onDeleteExpense, updateVehicleBalance]);

  // Wrap onUpdateExpense to restore vehicle balance when payments are removed
  const handleVehicleUpdateExpense = useCallback((id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    const exp = expenses.find(e => e.id === id);
    if (exp) {
      const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
      const installmentAmount = isRecorrente ? exp.amount / exp.installments! : exp.amount;

      if (data.paidInstallments !== undefined && isRecorrente) {
        const diff = (exp.paidInstallments || 0) - data.paidInstallments;
        if (diff > 0) {
          // Payments removed — restore balance and roll back due date
          updateVehicleBalance(installmentAmount * diff);
          const currentDue = new Date(exp.dueDate + "T00:00:00");
          currentDue.setMonth(currentDue.getMonth() - diff);
          data = { ...data, dueDate: currentDue.toISOString().split("T")[0] };
        }
      } else if (data.paid === false && exp.paid) {
        // Single expense payment removed — restore balance
        updateVehicleBalance(exp.amount);
      }
    }
    onUpdateExpense?.(id, data);
  }, [expenses, onUpdateExpense, updateVehicleBalance]);

  // Wrap onDeleteSale for vehicle sales to reverse paid amounts from vehicle balance
  const handleVehicleDeleteSale = useCallback((id: string) => {
    const sale = sales.find(s => s.id === id);
    if (sale && sale.paidInstallments > 0) {
      const amounts = sale.installmentAmounts;
      const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - ((sale as any).downPayment || 0)) / sale.installments : sale.total;
      let paidTotal = 0;
      for (let i = 0; i < sale.paidInstallments; i++) {
        paidTotal += amounts && amounts[i] != null ? amounts[i] : defaultVal;
      }
      paidTotal += sale.partialPaid || 0;
      if (paidTotal > 0) updateVehicleBalance(-paidTotal);
    }
    onDeleteSale(id);
  }, [sales, onDeleteSale, updateVehicleBalance]);

  if (!hasSalesOrStreaming) {
    // Vehicles page - render without sub-tabs + vehicle expenses
    return (
      <div className="space-y-6">
        <SalesList
          sales={sales}
          onDeleteSale={handleVehicleDeleteSale}
          onUpdateSale={handleVehicleUpdateSale}
          clients={clients}
          hideOnTrackCard
          renderAfterCards={secondaryCards}
          readOnly={readOnly}
          locadorInfo={locador}
          registeredVehicles={registeredVehicles}
          locadores={locadores}
        />

        {/* Vehicle Expenses Section */}
        {!readOnly && onAddExpense && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Despesas de Veículos ({vehicleExpenses.length})
              </h3>
            </div>

            {/* Dialog de confirmação para limpar pagamentos */}
            <Dialog open={showDeleteAllExpenses} onOpenChange={setShowDeleteAllExpenses}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Limpar Pagamentos</DialogTitle>
                  <DialogDescription>
                    Tem certeza que deseja limpar todos os dados de pagamento das despesas de veículos? As despesas serão mantidas, mas marcadas como não pagas.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDeleteAllExpenses(false)}>Cancelar</Button>
                  <Button data-mutation variant="destructive" onClick={() => {
                    allVehicleExpenses.forEach(exp => {
                      if (exp.paid || (exp.paidInstallments && exp.paidInstallments > 0)) {
                        handleVehicleUpdateExpense(exp.id, { paid: false, paidDate: undefined, paidInstallments: 0 });
                      }
                    });
                    setShowDeleteAllExpenses(false);
                  }}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Limpar Pagamentos
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {vehicleExpenses.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhuma despesa de veículo registrada.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {vehicleExpenses.map((exp, idx) => {
                  const isOverdue = !exp.paid && exp.dueDate < todayInAppTz();
                  const hasPaidSomething = exp.paid || (exp.paidInstallments && exp.paidInstallments > 0);
                  const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
                  const origMatch = (exp.notes ?? "").match(/\[OrigParcela:\s*([\d.]+)\]/i);
                  const originalInstallment = origMatch ? parseFloat(origMatch[1]) : (isRecorrente ? exp.amount / exp.installments! : exp.amount);
                  const installmentAmount = isRecorrente ? originalInstallment : exp.amount;

                  return (
                    <Card key={exp.id} className={`${exp.paid ? "opacity-60" : ""} hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-400 ease-out animate-fade-in`} style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'backwards' }}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-sm truncate">{exp.description}</p>
                              {(() => {
                                const badge = getDueStatusBadge(exp.dueDate, exp.paid, { paid: "Pago", overdue: "Vencido" });
                                return (
                                  <Badge variant={badge.variant} className={`${badge.className} text-[10px] shrink-0`}>
                                    {badge.label}
                                  </Badge>
                                );
                              })()}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
                              <span>{exp.category}</span>
                              <span>Venc: {new Date(exp.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                              {isRecorrente && (
                                <span>{exp.paidInstallments || 0}/{exp.installments} parcelas</span>
                              )}
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2 pt-2 border-t border-border/40">
                              {isRecorrente ? (
                                <div className="flex flex-col">
                                  <p className="font-bold text-sm leading-tight">
                                    {formatCurrency(installmentAmount)}
                                    <span className="ml-1 text-xs font-normal text-muted-foreground">/parcela</span>
                                  </p>
                                  <p className="text-[11px] text-muted-foreground leading-tight">
                                    Total: {formatCurrency(exp.amount)} ({exp.installments}x)
                                  </p>
                                </div>
                              ) : (
                                <p className="font-bold text-sm">{formatCurrency(exp.amount)}</p>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap justify-end w-full sm:w-auto">
                                {hasPaidSomething && onUpdateExpense && (
                                  <Button size="sm" variant="outline" onClick={() => setViewPaymentsExpenseId(exp.id)} className="h-8 px-2.5 text-xs flex-1 sm:flex-none min-w-0">
                                    <Receipt className="h-3.5 w-3.5 sm:mr-1" />
                                    <span className="hidden xs:inline">Pagamentos</span>
                                  </Button>
                                )}
                                {!readOnly && !exp.paid && onPayExpense && (
                                  <Button data-mutation size="sm" variant="outline" onClick={() => setPayingExpenseId(exp.id)} className="h-8 px-2.5 text-xs flex-1 sm:flex-none min-w-0 text-success border-success/30 hover:bg-success hover:text-success-foreground">
                                    <CheckCircle className="h-3.5 w-3.5 sm:mr-1" />
                                    <span className="hidden xs:inline">Pagar</span>
                                  </Button>
                                )}
                                {!readOnly && onUpdateExpense && (
                                  <Button data-mutation size="sm" variant="ghost" onClick={() => setEditingExpenseId(exp.id)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {!readOnly && (
                                  <ExpenseBoletoLinkButton expenseId={exp.id} />
                                )}
                                {!readOnly && onDeleteExpense && (
                                  <Button size="sm" variant="ghost" onClick={() => setDeleteExpenseId(exp.id)} className="h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>

                      {/* Dialog de pagamentos individuais */}
                      <Dialog open={viewPaymentsExpenseId === exp.id} onOpenChange={(open) => { if (!open) setViewPaymentsExpenseId(null); }}>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Pagamentos - {exp.description}</DialogTitle>
                            <DialogDescription>Gerencie os pagamentos desta despesa.</DialogDescription>
                          </DialogHeader>
                          <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                            {isRecorrente ? (
                              Array.from({ length: exp.paidInstallments || 0 }, (_, i) => (
                                <div key={i} className="flex items-center gap-3 py-3">
                                  <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                                    {i + 1}ª
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground">{formatCurrency(installmentAmount)}</p>
                                    <p className="text-xs text-muted-foreground">Parcela {i + 1} de {exp.installments}</p>
                                  </div>
                                  <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                                  {!readOnly && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                    onClick={() => {
                                      const newPaid = i;
                                      const fullyPaid = false;
                                      handleVehicleUpdateExpense(exp.id, { paidInstallments: newPaid, paid: fullyPaid, paidDate: undefined });
                                      if (newPaid === 0) setViewPaymentsExpenseId(null);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                  )}
                                </div>
                              ))
                            ) : (
                              exp.paid && (
                                <div className="flex items-center gap-3 py-3">
                                  <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                                    <Check className="h-4 w-4" />
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground">{formatCurrency(exp.amount)}</p>
                                    {exp.paidDate && <p className="text-xs text-muted-foreground">{new Date(exp.paidDate + "T00:00:00").toLocaleDateString("pt-BR")}</p>}
                                  </div>
                                  <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                                  {!readOnly && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                    onClick={() => {
                                      handleVehicleUpdateExpense(exp.id, { paid: false, paidDate: undefined, paidInstallments: 0 });
                                      setViewPaymentsExpenseId(null);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                  )}
                                </div>
                              )
                            )}
                            {(!isRecorrente && !exp.paid && !(exp.paidInstallments && exp.paidInstallments > 0)) && (
                              <div className="py-4 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>

                      {/* Dialog de edição */}
                      <VehicleExpenseEditDialog
                        expense={exp}
                        open={editingExpenseId === exp.id}
                        onOpenChange={(open) => { if (!open) setEditingExpenseId(null); }}
                        onSave={(data) => {
                          onUpdateExpense!(exp.id, data);
                          setEditingExpenseId(null);
                        }}
                        formatCurrency={formatCurrency}
                      />

                      {/* Dialog de pagamento (data + valor pago) */}
                      <VehiclePayExpenseDialog
                        expense={exp}
                        open={payingExpenseId === exp.id}
                        onOpenChange={(open) => { if (!open) setPayingExpenseId(null); }}
                        onConfirm={(payDate, paidAmount) => {
                          handleVehiclePayExpense(exp.id, payDate, paidAmount);
                          setPayingExpenseId(null);
                        }}
                        formatCurrency={formatCurrency}
                      />
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <ConfirmDeleteDialog
          open={!!deleteExpenseId}
          onOpenChange={() => setDeleteExpenseId(null)}
          onConfirm={() => {
            if (deleteExpenseId) {
              handleVehicleDeleteExpense(deleteExpenseId);
              setDeleteExpenseId(null);
            }
          }}
          title="Excluir despesa"
          description="Tem certeza que deseja excluir esta despesa? Se ela já estava paga, o valor será devolvido ao saldo da conta."
        />
      </div>
    );
  }

  // Sales page - show sub-tabs for venda/streaming + extrato
  const activeTabs = salesSubTabs;
  const allTabValues = [...activeTabs.map((t) => t.type as string), "extrato"];
  const [currentSubTab, setCurrentSubTab] = useState<string>(allTabValues[0] || "venda");
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("products-subtab-change", { detail: currentSubTab }));
  }, [currentSubTab]);

  return (
    <>
    <Tabs value={currentSubTab} onValueChange={setCurrentSubTab} className="space-y-4">
      <ProductSalesSubTabsList showStock={!isVehicleView} />



      {activeTabs.map((tab) => (
        <TabsContent key={tab.type} value={tab.type}>
          <SalesList
            sales={sales.filter((s) => s.businessType === tab.type)}
            onDeleteSale={onDeleteSale}
            onUpdateSale={onUpdateSale}
            clients={clients}
            readOnly={readOnly}
          />
        </TabsContent>
      ))}

      <TabsContent value="extrato">
        <SalesLedger sales={sales.filter((s) => s.businessType !== "aluguel_veiculo")} />
      </TabsContent>

      {!isVehicleView && (
        <TabsContent value="estoque">
          <StockManager readOnly={readOnly} />
        </TabsContent>
      )}
    </Tabs>
    <ConfirmDeleteDialog
      open={!!deleteExpenseId}
      onOpenChange={() => setDeleteExpenseId(null)}
      onConfirm={() => { if (deleteExpenseId && onDeleteExpense) { onDeleteExpense(deleteExpenseId, true); setDeleteExpenseId(null); } }}
      title="Excluir despesa"
      description="Tem certeza que deseja excluir esta despesa?"
    />
    </>
  );
}
