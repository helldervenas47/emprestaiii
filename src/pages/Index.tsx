import { useState, useEffect, lazy, Suspense } from "react";
import { Plus, Users, LayoutDashboard, ShoppingBag, BarChart3, AlertTriangle, Receipt, CalendarDays, Sun, Moon, LogOut, Info, X, Eye, EyeOff, Car, Wrench, DatabaseBackup, Menu, User, RefreshCw, Bell, Target, Calculator, Settings as SettingsIcon, CalendarClock } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile, useIsMobileOrTablet } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HideValuesProvider, useHideValues } from "@/contexts/HideValuesContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";

// Lazy load heavy components
const DashboardCards = lazy(() => import("@/components/DashboardCards").then(m => ({ default: m.DashboardCards })));
const LoanForm = lazy(() => import("@/components/LoanForm").then(m => ({ default: m.LoanForm })));
const LoanList = lazy(() => import("@/components/LoanList").then(m => ({ default: m.LoanList })));
const ClientForm = lazy(() => import("@/components/ClientForm").then(m => ({ default: m.ClientForm })));
const ClientList = lazy(() => import("@/components/ClientList").then(m => ({ default: m.ClientList })));
const ProductForm = lazy(() => import("@/components/ProductForm").then(m => ({ default: m.ProductForm })));
const SaleForm = lazy(() => import("@/components/SaleForm").then(m => ({ default: m.SaleForm })));
const ProductSalesView = lazy(() => import("@/components/ProductSalesView").then(m => ({ default: m.ProductSalesView })));
const OverdueLoans = lazy(() => import("@/components/OverdueLoans").then(m => ({ default: m.OverdueLoans })));
const BillingCalendar = lazy(() => import("@/components/BillingCalendar").then(m => ({ default: m.BillingCalendar })));
const ExpenseForm = lazy(() => import("@/components/ExpenseForm").then(m => ({ default: m.ExpenseForm })));
const ExpenseList = lazy(() => import("@/components/ExpenseList").then(m => ({ default: m.ExpenseList })));
const PersonalExpenseForm = lazy(() => import("@/components/PersonalExpenseForm").then(m => ({ default: m.PersonalExpenseForm })));
const PersonalExpenseList = lazy(() => import("@/components/PersonalExpenseList").then(m => ({ default: m.PersonalExpenseList })));
const CreditCardList = lazy(() => import("@/components/CreditCardList").then(m => ({ default: m.CreditCardList })));
const PiggyBankList = lazy(() => import("@/components/PiggyBankList").then(m => ({ default: m.PiggyBankList })));
const UserManagement = lazy(() => import("@/components/UserManagement").then(m => ({ default: m.UserManagement })));
const PlanManagement = lazy(() => import("@/components/PlanManagement").then(m => ({ default: m.PlanManagement })));
const BackupExport = lazy(() => import("@/components/BackupExport").then(m => ({ default: m.BackupExport })));
const WebhookSettings = lazy(() => import("@/components/WebhookSettings").then(m => ({ default: m.WebhookSettings })));
const PlanSubscribers = lazy(() => import("@/components/PlanSubscribers").then(m => ({ default: m.PlanSubscribers })));
const VehicleCardList = lazy(() => import("@/components/VehicleCardList").then(m => ({ default: m.VehicleCardList })));
const LocadorPopoverContent = lazy(() => import("@/components/LocadorPopoverContent").then(m => ({ default: m.LocadorPopoverContent })));
const LocadorList = lazy(() => import("@/components/LocadorList").then(m => ({ default: m.LocadorList })));
const SubscriptionBanner = lazy(() => import("@/components/SubscriptionBanner").then(m => ({ default: m.SubscriptionBanner })));
const SubscriptionGate = lazy(() => import("@/components/SubscriptionGate").then(m => ({ default: m.SubscriptionGate })));
const VehicleExpenseForm = lazy(() => import("@/components/VehicleExpenseForm").then(m => ({ default: m.VehicleExpenseForm })));
const NotificationSettings = lazy(() => import("@/components/NotificationSettings").then(m => ({ default: m.NotificationSettings })));
const MonthlyGoalsManager = lazy(() => import("@/components/MonthlyGoalsManager").then(m => ({ default: m.MonthlyGoalsManager })));
const AccountantReport = lazy(() => import("@/components/AccountantReport").then(m => ({ default: m.AccountantReport })));
const DailyPlanningReport = lazy(() => import("@/components/DailyPlanningReport").then(m => ({ default: m.DailyPlanningReport })));
const AccumulatedDelinquencyReport = lazy(() => import("@/components/AccumulatedDelinquencyReport").then(m => ({ default: m.AccumulatedDelinquencyReport })));
const Settings = lazy(() => import("@/components/Settings").then(m => ({ default: m.Settings })));
// Direct import for the constant used at render time
import { vehicleExpenseCategories } from "@/components/VehicleExpenseForm";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { ApprovalRequestsButton } from "@/components/ApprovalRequestsButton";
import { DashboardOverview } from "@/components/DashboardOverview";

// Prefetch most-used chunks after idle
const prefetchChunks = () => {
  import("@/components/LoanList");
  import("@/components/LoanForm");
  import("@/components/BillingCalendar");
  import("@/components/ClientList");
  import("@/components/DashboardCards");
  import("@/components/SubscriptionBanner");
  import("@/components/SubscriptionGate");
};
if (typeof window !== "undefined") {
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(prefetchChunks);
  } else {
    setTimeout(prefetchChunks, 2000);
  }
}

// Lazy load hooks only when needed
import { useLoans } from "@/hooks/useLoans";
import { useClients } from "@/hooks/useClients";
import { useProducts } from "@/hooks/useProducts";
import { useExpenses } from "@/hooks/useExpenses";
import { useVehicleRegistry } from "@/hooks/useVehicleRegistry";
import { useLocadorInfo } from "@/hooks/useLocadorInfo";

type Tab = "overview" | "dashboard" | "clients" | "products" | "vehicles" | "overdue" | "expenses" | "calendar" | "settings";
type ClientSubTab = "clientes" | "veiculos";
type VehicleSubTab = "veiculos" | "locadores";
type PlanMgmtSubTab = "subscribers" | "plans";
type OverdueSubTab = "cobrancas" | "inadimplencia-acumulada" | "contador" | "metas" | "planejamento";
type ExpenseSubTab = "business" | "personal";
type PersonalSubTab = "expenses" | "cards";

const tabConfig = [
  { id: "overview" as Tab, label: "Dashboard", icon: BarChart3 },
  { id: "dashboard" as Tab, label: "Empréstimos", icon: LayoutDashboard },
  { id: "products" as Tab, label: "Vendas", icon: ShoppingBag },
  { id: "vehicles" as Tab, label: "Veículos", icon: Car },
  { id: "calendar" as Tab, label: "Calendário", icon: CalendarDays },
  { id: "clients" as Tab, label: "Cadastro", icon: Users },
  { id: "expenses" as Tab, label: "Despesas", icon: Receipt },
  { id: "overdue" as Tab, label: "Relatório", icon: AlertTriangle },
  { id: "settings" as Tab, label: "Configurações", icon: SettingsIcon },
];

const tabHelp: Record<Tab, { title: string; items: string[] }> = {
  overview: {
    title: "Dashboard Geral",
    items: [
      "Visão consolidada do seu negócio: receitas, despesas e saldo.",
      "Capital na Rua, Total a Receber e Saúde da Operação são valores globais (não mudam por período).",
      "Use o seletor de período (Dia/Semana/Mês) para filtrar entradas e saídas.",
      "O gráfico mostra o histórico dos últimos 12 meses.",
    ],
  },
  dashboard: {
    title: "Empréstimos",
    items: [
      "Cadastre novos empréstimos clicando em 'Novo Empréstimo'.",
      "Escolha o tipo de contrato: Semanal, Quinzenal ou Mensal.",
      "Registre pagamentos de parcela, juros ou pagamentos parciais.",
      "Clique em 'Mais detalhes' para ver o cronograma completo de parcelas.",
      "Use os filtros e etiquetas para organizar seus contratos.",
      
    ],
  },
  calendar: {
    title: "Calendário de Cobrança",
    items: [
      "Visualize todas as parcelas a vencer no calendário.",
      "Dias com bolinha vermelha = parcelas atrasadas.",
      "Dias com bolinha amarela = parcelas a vencer.",
      "Clique em um dia para ver os detalhes das cobranças.",
    ],
  },
  clients: {
    title: "Cadastro",
    items: [
      "Cadastre seus clientes com nome, CPF/CNPJ, telefone e endereço.",
      "Use o score para classificar a confiabilidade do cliente.",
      "Cadastre e gerencie veículos na sub-aba Veículos.",
      "Clientes inativos não aparecem na lista de novos empréstimos.",
    ],
  },
  products: {
    title: "Vendas",
    items: [
      "Registre vendas avulsas ou streaming.",
      "Escolha entre pagamento fixo (único) ou recorrente (parcelado).",
      "Para vendas recorrentes, defina a frequência: Semanal, Quinzenal ou Mensal.",
    ],
  },
  vehicles: {
    title: "Aluguel de Veículos",
    items: [
      "Registre contratos de aluguel de veículos.",
      "Controle parcelas e pagamentos recorrentes.",
      "Acompanhe vencimentos e inadimplência.",
    ],
  },
  expenses: {
    title: "Despesas",
    items: [
      "Registre despesas fixas ou recorrentes do seu negócio.",
      "Marque despesas como pagas para controlar o fluxo de caixa.",
      "Categorize suas despesas para melhor organização.",
    ],
  },
  overdue: {
    title: "Relatório",
    items: [
      "Lista todos os empréstimos com parcelas em atraso.",
      "Também mostra empréstimos que vencem hoje.",
      "Use para priorizar suas cobranças diárias.",
    ],
  },
  settings: {
    title: "Configurações",
    items: [
      "Centralize preferências de exibição (tema e ocultar valores).",
      "Configure todos os canais de notificação: push, e-mail, Telegram e webhook.",
      "Gerencie locadores, plano de assinatura e usuários (admins).",
      "Faça backup ou exporte seus dados.",
      "Use 'Limpar cache' para forçar atualização do app sem perder dados.",
    ],
  },
};
function HideValuesToggle() {
  const { hidden, toggle } = useHideValues();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} className="h-9 w-9" title={hidden ? "Mostrar valores" : "Ocultar valores"}>
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );
}

const Index = () => {
  const { signOut, role, allowedTabs, linkedClientIds, loading, user } = useAuth();
  const navigate = useNavigate();
  const { subscription, isActive: hasActiveSub } = useSubscription();
  const { branding: appBranding } = useAppBranding();
  const brandName = appBranding.brand_name;

  // Tab state - declared early so hooks can use it for lazy loading
  const [tab, setTabState] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab");
    if (urlTab && tabConfig.some(t => t.id === urlTab)) return urlTab as Tab;
    const saved = sessionStorage.getItem("activeTab");
    return saved && tabConfig.some(t => t.id === saved) ? saved as Tab : "overview";
  });
  const setTab = (t: Tab) => { sessionStorage.setItem("activeTab", t); setTabState(t); };

  // Atualiza apenas a aba (reload simples), preservando cache e localStorage.
  const [refreshing, setRefreshing] = useState(false);
  const handleHardRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    window.location.reload();
  };

  // Listen for in-app navigation requests (e.g. shortcut to Telegram report config)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const { tab: targetTab, subTab, scrollTo } = detail;
      if (targetTab) setTab(targetTab);
      if (subTab && targetTab === "overdue") setOverdueSubTab(subTab);
      if (scrollTo) {
        // Wait for tab content to mount
        setTimeout(() => {
          const el = document.getElementById(scrollTo);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            el.classList.add("ring-2", "ring-primary", "ring-offset-2");
            setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2000);
          }
        }, 250);
      }
    };
    window.addEventListener("app:navigate", handler as EventListener);
    return () => window.removeEventListener("app:navigate", handler as EventListener);
  }, []);

  // Read initial loan filter/view from URL query params (for push notification deep links)
  const urlParams = new URLSearchParams(window.location.search);
  const initialLoanCategory = urlParams.get("filter") as any;
  const initialLoanView = urlParams.get("view") as any;
  const { loans, payments, installmentSchedules, addLoan, addPayment, addPartialPayment, payOffLoan, addInterestOnlyPayment, updateLoan, deleteLoan, deletePayment, saveSchedule } = useLoans();
  const { clients, addClient, deleteClient, updateClient } = useClients();

  // Defer heavy hooks until their tabs are active
  const needsProducts = tab === "overview" || tab === "products" || tab === "vehicles";
  const needsExpenses = tab === "overview" || tab === "expenses" || tab === "vehicles";
  const needsVehicles = tab === "clients" || tab === "vehicles";
  const needsLocadores = tab === "vehicles" || tab === "settings";

  const { products, sales, addProduct, updateProduct, deleteProduct, addSale, updateSale, deleteSale } = useProducts(needsProducts);
  const { expenses, addExpense, payExpense, unpayExpense, deleteExpense, updateExpense } = useExpenses(needsExpenses);
  const { vehicles: registeredVehicles, add: addVehicle, update: updateVehicle, remove: removeVehicle } = useVehicleRegistry(needsVehicles);
  const { locador, locadores, save: saveLocador, remove: removeLocador } = useLocadorInfo(needsLocadores);
  const [clientSubTab, setClientSubTab] = useState<ClientSubTab>("clientes");
  const [vehicleSubTab, setVehicleSubTab] = useState<VehicleSubTab>("veiculos");
  const [planMgmtSubTab, setPlanMgmtSubTab] = useState<PlanMgmtSubTab>("subscribers");
  const [overdueSubTab, setOverdueSubTab] = useState<OverdueSubTab>("cobrancas");
  const [expenseSubTab, setExpenseSubTab] = useState<ExpenseSubTab>("personal");
  const [personalSubTab, setPersonalSubTab] = useState<PersonalSubTab>("expenses");

  // Filter data by linked clients if user has client restrictions
  const hasClientFilter = Array.isArray(linkedClientIds) && linkedClientIds.length > 0;
  const filteredClients = hasClientFilter ? clients.filter(c => linkedClientIds.includes(c.id)) : clients;
  const linkedClientNames = hasClientFilter ? filteredClients.map(c => c.name.toLowerCase()) : [];
  const filteredLoans = hasClientFilter
    ? loans.filter(l =>
        (l.borrowerId && linkedClientIds.includes(l.borrowerId)) ||
        linkedClientNames.includes((l.borrowerName || "").toLowerCase())
      )
    : loans;
  const filteredPayments = hasClientFilter
    ? payments.filter(p => filteredLoans.some(l => l.id === p.loanId))
    : payments;
  const filteredInstallments = hasClientFilter
    ? installmentSchedules.filter(s => filteredLoans.some(l => l.id === s.loanId))
    : installmentSchedules;
  const filteredSales = hasClientFilter
    ? sales.filter(s => {
        const clientNames = filteredClients.map(c => c.name.toLowerCase());
        return clientNames.includes((s.customerName || "").toLowerCase());
      })
    : sales;

  const nonVehicleExpenses = expenses.filter(e => !vehicleExpenseCategories.includes(e.category));
  const businessExpenses = nonVehicleExpenses.filter(e => (e.scope ?? "business") === "business");
  const personalExpenses = expenses.filter(e => e.scope === "personal");
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showPersonalExpenseForm, setShowPersonalExpenseForm] = useState(false);
  const [showVehicleExpenseForm, setShowVehicleExpenseForm] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const isMobileOrTablet = useIsMobileOrTablet();
  const isReadOnly = role === "visualizador";

  // Swipe from left edge to open sidebar on mobile
  useEffect(() => {
    if (!isMobileOrTablet) return;
    let touchStartX = 0;
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = Math.abs(touchEndY - touchStartY);
      if (touchStartX < 30 && deltaX > 50 && deltaY < 100) {
        setSidebarOpen(true);
      }
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobileOrTablet]);

  const visibleTabs = tabConfig.filter((t) => {
    if (loading) return false;
    if (role === "admin") return true;
    // Settings sempre disponível para usuários autenticados
    if (t.id === "settings") return !!user;
    // Any authenticated user sees all other tabs
    if (user) {
      if (Array.isArray(allowedTabs)) return allowedTabs.includes(t.id);
      return true; // No tab restrictions = full access
    }
    return false;
  });

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find((item) => item.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [tab, visibleTabs]);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hvcred-theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });


  // Apply dark class to html element
  useState(() => {
    document.documentElement.classList.toggle("dark", dark);
  });

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("hvcred-theme", next ? "dark" : "light");
  };


  const handlePrimaryAction = () => {
    if (tab === "dashboard") setShowLoanForm(true);
    else if (tab === "clients" && clientSubTab === "clientes") setShowClientForm(true);
    else if (tab === "expenses") {
      if (expenseSubTab === "personal") setShowPersonalExpenseForm(true);
      else setShowExpenseForm(true);
    }
    else if (tab === "products" || tab === "vehicles") setShowSaleForm(true);
  };

  const primaryLabel =
    tab === "dashboard" ? "Novo Empréstimo" :
    tab === "clients" && clientSubTab === "clientes" ? "Novo Cliente" :
    tab === "expenses"
      ? expenseSubTab === "personal"
        ? personalSubTab === "cards" ? "" : "Nova Despesa Pessoal"
        : "Nova Despesa"
      :
    tab === "products" ? "Novo Lançamento" :
    tab === "vehicles" ? "Novo Aluguel" : "";

  return (
    <HideValuesProvider>
    <div className="min-h-screen bg-background" style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${isMobile ? '72px' : '0px'})`, paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
      <SubscriptionBanner />

      <header className="border-b border-border/30 glass sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-8 py-2 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isMobileOrTablet && (
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                  <div className="flex flex-col h-full">
                    <div className="p-4 border-b border-border/30 flex items-center gap-3">
<AppLogo area="header" alt={brandName} className="w-auto" />
                      <div>
                        <h1 className="text-lg font-bold text-foreground tracking-tight">{brandName}</h1>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Controle de empréstimos</p>
                      </div>
                    </div>
                    <nav className="flex-1 overflow-y-auto py-2">
                      {visibleTabs.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { setTab(t.id); setSidebarOpen(false); }}
                          className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium transition-colors ${
                            tab === t.id ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          }`}
                        >
                          <t.icon className="h-4 w-4" />
                          <span>{t.label}</span>
                        </button>
                      ))}
                    </nav>
                    <div className="p-3 border-t border-border/30 flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-foreground truncate">{user?.user_metadata?.display_name || user?.email || "—"}</p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary cursor-pointer hover:bg-primary/10" onClick={() => { setSidebarOpen(false); navigate("/pricing"); }}>
                            {hasActiveSub && subscription ? (
                              subscription.product_id === "basico_plan" ? "Básico" :
                              subscription.product_id === "profissional_plan" ? "Prof." :
                              subscription.product_id === "empresarial_plan" ? "Emp." : "Plano"
                            ) : "Sem Plano"}
                          </Badge>
                        </div>
                        {role && <p className="text-[10px] text-muted-foreground">{role === "admin" ? "Administrador" : role === "operador" ? "Operador" : "Visualizador"}</p>}
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            )}
<AppLogo area="header" alt={brandName} className="w-auto hidden md:block" />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground tracking-tight">{brandName}</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Controle de empréstimos</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1.5 justify-end">
            {!isMobileOrTablet && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-xs text-muted-foreground mr-1">
                <User className="h-3 w-3" />
                <span className="max-w-[120px] truncate">{user?.user_metadata?.display_name || user?.email || "—"}</span>
                {role && <Badge variant={role === "admin" ? "default" : role === "operador" ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">{role === "admin" ? "Admin" : role === "operador" ? "Op." : "Vis."}</Badge>}
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-primary/10 transition-colors border-primary/40 text-primary"
                  onClick={() => navigate("/pricing")}
                >
                  {hasActiveSub && subscription ? (
                    subscription.product_id === "basico_plan" ? "Básico" :
                    subscription.product_id === "profissional_plan" ? "Profissional" :
                    subscription.product_id === "empresarial_plan" ? "Empresarial" : "Plano"
                  ) : "Sem Plano"}
                </Badge>
              </div>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" title="Ajuda">
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 sm:w-80" align="end">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-foreground">{tabHelp[tab].title}</h3>
                  <ul className="space-y-1.5">
                    {tabHelp[tab].items.map((item, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleHardRefresh}
              disabled={refreshing}
              className="h-8 w-8 sm:h-9 sm:w-9"
              title="Atualizar"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <HideValuesToggle />
            {role === "admin" && <ApprovalRequestsButton />}
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 sm:h-9 sm:w-9" title={dark ? "Modo claro" : "Modo escuro"}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8 sm:h-9 sm:w-9" title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
            {!isReadOnly && tab === "vehicles" && (
              <Button variant="outline" size="sm" onClick={() => setShowVehicleExpenseForm(true)} className="h-8 px-2 sm:px-3">
                <Receipt className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Registrar Despesa</span>
              </Button>
            )}
            {!isReadOnly && tab !== "overview" && tab !== "overdue" && tab !== "calendar" && tab !== "settings" && tab !== "dashboard" && !(tab === "clients" && clientSubTab === "veiculos") && (
              <Button onClick={handlePrimaryAction} size="sm" className="h-8 px-2 sm:px-3">
                <Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">{primaryLabel}</span>
              </Button>
            )}
          </div>
        </div>

        {!isMobileOrTablet && (
          <div className="max-w-[1920px] mx-auto px-2 sm:px-4 lg:px-8">
            <nav className="flex gap-0.5 -mb-px overflow-x-auto scrollbar-hide pb-0">
              {visibleTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-xs font-medium border-b-2 transition-all whitespace-nowrap uppercase tracking-wide ${
                    tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" /><span className="hidden xs:inline">{t.label}</span>
                </button>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>}>
        {tab === "overview" && (
          <SubscriptionGate requiredTier={1} featureName="Dashboard">
          <DashboardOverview loans={filteredLoans} sales={filteredSales} payments={filteredPayments} expenses={expenses.filter(e => (e.scope ?? "business") === "business")} installmentSchedules={filteredInstallments} clients={clients} onDeletePayment={deletePayment} onDeleteSale={deleteSale} onDeleteLoan={deleteLoan} />
          </SubscriptionGate>
        )}
        {tab === "dashboard" && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Empréstimos</h2>
              <LoanList loans={filteredLoans} payments={filteredPayments} installmentSchedules={filteredInstallments} onPayment={addPayment} onPartialPayment={addPartialPayment} onFullPayment={payOffLoan} onInterestPayment={addInterestOnlyPayment} onUpdate={updateLoan} onDelete={deleteLoan} onDeletePayment={deletePayment} onSaveSchedule={saveSchedule} readOnly={isReadOnly} initialCategory={initialLoanCategory} initialView={initialLoanView} clients={filteredClients} />
            </div>
          </>
        )}
        {tab === "clients" && (
          <div>
            <div className="flex gap-2 mb-4">
              <Button
                variant={clientSubTab === "clientes" ? "default" : "outline"}
                size="sm"
                onClick={() => setClientSubTab("clientes")}
              >
                <Users className="h-4 w-4 mr-1" /> Clientes
              </Button>
              <Button
                variant={clientSubTab === "veiculos" ? "default" : "outline"}
                size="sm"
                onClick={() => setClientSubTab("veiculos")}
              >
                <Car className="h-4 w-4 mr-1" /> Veículos
              </Button>
            </div>
            {clientSubTab === "clientes" && (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-4">Clientes ({filteredClients.length})</h2>
                <ClientList clients={filteredClients} loans={filteredLoans} payments={filteredPayments} installmentSchedules={filteredInstallments} onDelete={deleteClient} onUpdate={updateClient} readOnly={isReadOnly} />
              </>
            )}
            {clientSubTab === "veiculos" && (
              <>
                <div className="flex gap-2 mb-4">
                  <Button
                    variant={vehicleSubTab === "veiculos" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setVehicleSubTab("veiculos")}
                  >
                    <Car className="h-4 w-4 mr-1" /> Veículos
                  </Button>
                  <Button
                    variant={vehicleSubTab === "locadores" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setVehicleSubTab("locadores")}
                  >
                    <User className="h-4 w-4 mr-1" /> Dados do Locador
                  </Button>
                </div>
                {vehicleSubTab === "veiculos" && (
                  <>
                    <h2 className="text-lg font-semibold text-foreground mb-4">Veículos Cadastrados ({registeredVehicles.length})</h2>
                    <VehicleCardList
                      vehicles={registeredVehicles}
                      onAdd={addVehicle}
                      onUpdate={updateVehicle}
                      onDelete={removeVehicle}
                      readOnly={isReadOnly}
                    />
                  </>
                )}
                {vehicleSubTab === "locadores" && (
                  <>
                    <h2 className="text-lg font-semibold text-foreground mb-4">Locadores ({locadores.length})</h2>
                    <LocadorList
                      locadores={locadores}
                      onSave={saveLocador}
                      onDelete={removeLocador}
                      readOnly={isReadOnly}
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}
        {tab === "expenses" && (
          <SubscriptionGate requiredTier={2} featureName="Despesas">
          <div>
            <div className="w-full bg-muted/50 rounded-xl p-1 flex gap-0.5 mb-4">
              <button
                onClick={() => setExpenseSubTab("business")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  expenseSubTab === "business"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Receipt className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Despesas Empresa</span>
              </button>
              <button
                onClick={() => setExpenseSubTab("personal")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  expenseSubTab === "personal"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Despesas Pessoais</span>
              </button>
            </div>
            {expenseSubTab === "business" ? (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-4">Despesas Empresa ({businessExpenses.length})</h2>
                <ExpenseList expenses={businessExpenses} onPay={payExpense} onUnpay={unpayExpense} onDelete={deleteExpense} onUpdate={updateExpense} readOnly={isReadOnly} />
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-4">Despesas Pessoais ({personalExpenses.length})</h2>
                <PersonalExpenseList
                  expenses={personalExpenses}
                  onPay={payExpense}
                  onUnpay={unpayExpense}
                  onDelete={deleteExpense}
                  onUpdate={updateExpense}
                  readOnly={isReadOnly}
                  afterEvolution={({ selectedMonth }) => (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-4">
                      <section className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)]">
                        <CreditCardList readOnly={isReadOnly} referenceMonth={selectedMonth} />
                      </section>
                      <section className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm p-4 shadow-[0_1px_6px_-4px_hsl(0_0%_0%/0.04)]">
                        <PiggyBankList readOnly={isReadOnly} />
                      </section>
                    </div>
                  )}
                />
              </>
            )}
          </div>
          </SubscriptionGate>
        )}
        {tab === "overdue" && (
          <SubscriptionGate requiredTier={2} featureName="Relatórios">
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              <Button
                variant={overdueSubTab === "cobrancas" ? "default" : "outline"}
                size="sm"
                onClick={() => setOverdueSubTab("cobrancas")}
              >
                <AlertTriangle className="h-4 w-4 mr-1" /> Cobranças
              </Button>
              <Button
                variant={overdueSubTab === "inadimplencia-acumulada" ? "default" : "outline"}
                size="sm"
                onClick={() => setOverdueSubTab("inadimplencia-acumulada")}
              >
                <AlertTriangle className="h-4 w-4 mr-1" /> Inadimplência Acumulada
              </Button>
              <Button
                variant={overdueSubTab === "contador" ? "default" : "outline"}
                size="sm"
                onClick={() => setOverdueSubTab("contador")}
              >
                <Calculator className="h-4 w-4 mr-1" /> Contador
              </Button>
              <Button
                variant={overdueSubTab === "metas" ? "default" : "outline"}
                size="sm"
                onClick={() => setOverdueSubTab("metas")}
              >
                <Target className="h-4 w-4 mr-1" /> Metas
              </Button>
              <Button
                variant={overdueSubTab === "planejamento" ? "default" : "outline"}
                size="sm"
                onClick={() => setOverdueSubTab("planejamento")}
              >
                <CalendarClock className="h-4 w-4 mr-1" /> Planejamento do Dia
              </Button>
            </div>
            {overdueSubTab === "cobrancas" && (
              <OverdueLoans loans={filteredLoans} payments={filteredPayments} clients={filteredClients} installmentSchedules={filteredInstallments} />
            )}
            {overdueSubTab === "inadimplencia-acumulada" && (
              <AccumulatedDelinquencyReport loans={filteredLoans} clients={filteredClients} installmentSchedules={filteredInstallments} />
            )}
            {overdueSubTab === "contador" && (
              <AccountantReport loans={filteredLoans} payments={filteredPayments} sales={sales} expenses={expenses} />
            )}
            {overdueSubTab === "metas" && (
              <MonthlyGoalsManager />
            )}
            {overdueSubTab === "planejamento" && (
              <DailyPlanningReport
                loans={filteredLoans}
                payments={filteredPayments}
                installmentSchedules={filteredInstallments}
                sales={filteredSales}
                expenses={expenses}
              />
            )}
          </div>
          </SubscriptionGate>
        )}
        {tab === "calendar" && (
          <BillingCalendar loans={filteredLoans} payments={filteredPayments} installmentSchedules={filteredInstallments} onPayment={addPayment} onPartialPayment={addPartialPayment} onFullPayment={payOffLoan} onInterestPayment={addInterestOnlyPayment} onUpdate={updateLoan} readOnly={isReadOnly} />
        )}
        {tab === "products" && (
          <SubscriptionGate requiredTier={2} featureName="Vendas">
          <ProductSalesView
            sales={filteredSales.filter(s => s.businessType !== "aluguel_veiculo")}
            onDeleteSale={deleteSale}
            onUpdateSale={updateSale}
            clients={filteredClients}
            readOnly={isReadOnly}
          />
          </SubscriptionGate>
        )}
        {tab === "vehicles" && (
          <SubscriptionGate requiredTier={2} featureName="Veículos">
          <ProductSalesView
            sales={filteredSales.filter(s => s.businessType === "aluguel_veiculo")}
            onDeleteSale={deleteSale}
            onUpdateSale={updateSale}
            clients={filteredClients}
            expenses={expenses}
            onAddExpense={addExpense}
            onPayExpense={payExpense}
            onDeleteExpense={deleteExpense}
            onUpdateExpense={updateExpense}
            readOnly={isReadOnly}
            isVehicleView
            locadores={locadores}
            onSaveLocador={saveLocador}
          />
          </SubscriptionGate>
        )}
        {tab === "settings" && (
          <Settings
            backup={{
              loans,
              payments,
              clients,
              sales,
              expenses,
              onImportLoans: async (imported) => {
                const BATCH = 5;
                for (let i = 0; i < imported.length; i += BATCH) {
                  const batch = imported.slice(i, i + BATCH);
                  await Promise.all(batch.map(async (loan) => {
                    const { totalPaid, ...loanData } = loan;
                    const loanId = await addLoan(loanData);
                    if (loanId && totalPaid && totalPaid > 0) {
                      await addPartialPayment(loanId, totalPaid, loan.startDate);
                    }
                  }));
                }
              },
              onImportClients: async (imported) => {
                await Promise.all(imported.map((client) => addClient(client)));
              },
              onImportSales: async (imported) => {
                await Promise.all(imported.map((sale) => addSale(sale)));
              },
              onImportExpenses: async (imported) => {
                await Promise.all(imported.map((expense) => addExpense(expense)));
              },
            }}
            locadores={locadores}
            onSaveLocador={saveLocador}
            onRemoveLocador={removeLocador}
            isReadOnly={isReadOnly}
            dark={dark}
            onToggleTheme={toggleTheme}
          />
        )}
        </Suspense>
      </main>

      {!isReadOnly && tab === "dashboard" && (
        <button
          type="button"
          onClick={() => setShowLoanForm(true)}
          aria-label="Novo Empréstimo"
          title="Novo Empréstimo"
          className="fixed z-50 bottom-6 right-6 md:bottom-8 md:right-8 h-14 w-14 md:h-16 md:w-16 rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-4px_hsl(var(--primary)/0.55)] hover:shadow-[0_12px_32px_-4px_hsl(var(--primary)/0.7)] hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center animate-fade-in touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Plus className="h-6 w-6 md:h-7 md:w-7" strokeWidth={2.5} />
        </button>
      )}

      {showLoanForm && <LoanForm onAdd={addLoan} onSaveSchedule={saveSchedule} onClose={() => setShowLoanForm(false)} clients={clients} loans={loans} payments={payments} installmentSchedules={installmentSchedules} existingTags={[...new Set(loans.flatMap(l => l.tags || []))]} />}
      {showClientForm && <ClientForm onAdd={addClient} onClose={() => setShowClientForm(false)} />}
      {showProductForm && <ProductForm onAdd={addProduct} onClose={() => setShowProductForm(false)} />}
      {showSaleForm && <SaleForm onAdd={addSale} onClose={() => setShowSaleForm(false)} clients={clients} defaultBusinessType={tab === "vehicles" ? "aluguel_veiculo" : undefined} registeredVehicles={registeredVehicles} locadores={locadores} />}
      {showExpenseForm && <ExpenseForm onAdd={addExpense} onClose={() => setShowExpenseForm(false)} scope="business" />}
      {showPersonalExpenseForm && <PersonalExpenseForm onAdd={addExpense} onClose={() => setShowPersonalExpenseForm(false)} />}
      {showVehicleExpenseForm && <VehicleExpenseForm onAdd={addExpense} onClose={() => setShowVehicleExpenseForm(false)} />}
    </div>
    </HideValuesProvider>
  );
};

export default Index;
