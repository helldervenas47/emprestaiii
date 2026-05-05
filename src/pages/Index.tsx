import { useState, useEffect, useLayoutEffect, useRef, lazy, Suspense } from "react";
import { Plus, Users, LayoutDashboard, ShoppingBag, BarChart3, AlertTriangle, Receipt, CalendarDays, Sun, Moon, LogOut, Info, X, Eye, EyeOff, Car, Wrench, DatabaseBackup, Menu, User, RefreshCw, Bell, Target, Calculator, Settings as SettingsIcon, CalendarClock, Pin, Check, Sliders, Loader2, GripVertical, Activity, Send, MessageCircle, Wallet } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { useAppBranding } from "@/hooks/useAppBranding";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
const LoanSimulator = lazy(() => import("@/components/LoanSimulator").then(m => ({ default: m.LoanSimulator })));
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
const TelegramBotsHub = lazy(() => import("@/components/TelegramBotsHub").then(m => ({ default: m.TelegramBotsHub })));
const WhatsappBillingCard = lazy(() => import("@/components/WhatsappBillingCard").then(m => ({ default: m.WhatsappBillingCard })));
const WhatsappAutoBillingCard = lazy(() => import("@/components/WhatsappAutoBillingCard").then(m => ({ default: m.WhatsappAutoBillingCard })));
const WhatsappAssistantCard = lazy(() => import("@/components/WhatsappAssistantCard").then(m => ({ default: m.WhatsappAssistantCard })));
const Settings = lazy(() => import("@/components/Settings").then(m => ({ default: m.Settings })));
const SystemHealth = lazy(() => import("@/components/SystemHealth").then(m => ({ default: m.SystemHealth })));
// Direct import for the constant used at render time
import { vehicleExpenseCategories } from "@/components/VehicleExpenseForm";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";

import { NotificationsFeedButton } from "@/components/NotificationsFeedButton";
import { DashboardOverview } from "@/components/DashboardOverview";
import { LedgerView } from "@/components/LedgerView";
import { useApprovalRequests } from "@/hooks/useApprovalRequests";
import { usePendingCount } from "@/lib/offline/sync";
import { useApprovalPushAlerts } from "@/hooks/useApprovalPushAlerts";

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
import { useAutoAdjustCreditLimits } from "@/hooks/useAutoAdjustCreditLimits";
import { useProducts } from "@/hooks/useProducts";
import { useExpenses } from "@/hooks/useExpenses";
import { useVehicleRegistry } from "@/hooks/useVehicleRegistry";
import { useLocadorInfo } from "@/hooks/useLocadorInfo";

type Tab = "overview" | "dashboard" | "clients" | "products" | "vehicles" | "overdue" | "expenses" | "accountant" | "calendar" | "settings" | "system-health";
type ClientSubTab = "clientes" | "veiculos";
type VehicleSubTab = "veiculos" | "locadores";
type PlanMgmtSubTab = "subscribers" | "plans";
type OverdueSubTab = "cobrancas" | "inadimplencia-acumulada" | "metas" | "planejamento" | "bot-telegram" | "whatsapp-cobranca";
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
  { id: "accountant" as Tab, label: "Contador", icon: Calculator },
  
  { id: "overdue" as Tab, label: "Relatório", icon: AlertTriangle },
  { id: "settings" as Tab, label: "Configurações", icon: SettingsIcon },
  { id: "system-health" as Tab, label: "Saúde do Sistema", icon: Activity, adminOnly: true },
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
  accountant: {
    title: "Contador",
    items: [
      "Relatório consolidado para fins contábeis.",
      "Inclui receitas, despesas, vendas e empréstimos.",
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
  "system-health": {
    title: "Saúde do Sistema",
    items: [
      "Painel administrativo com indicadores em tempo real.",
      "Métricas reais: latência do banco, sessões ativas, contagens, status online.",
      "Métricas marcadas como 'Estimado' são aproximações calculadas no aparelho.",
      "Use o botão Atualizar ou ative o auto-refresh (30s).",
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
function HideValuesQuickAction() {
  const { hidden, toggle } = useHideValues();
  return (
    <Button variant="outline" size="sm" onClick={toggle} className="justify-start">
      {hidden ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
      {hidden ? "Mostrar valores" : "Ocultar valores"}
    </Button>
  );
}

const Index = () => {
  const { signOut, role, allowedTabs, linkedClientIds, loading, user } = useAuth();
  const navigate = useNavigate();
  const { subscription, isActive: hasActiveSub } = useSubscription();
  const { branding: appBranding } = useAppBranding();
  const brandName = appBranding.brand_name;
  const preserveScrollYRef = useRef<number | null>(null);

  // Tab state - declared early so hooks can use it for lazy loading
  const [tab, setTabState] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab");
    if (urlTab && tabConfig.some(t => t.id === urlTab)) return urlTab as Tab;
    const saved = sessionStorage.getItem("activeTab");
    if (saved && tabConfig.some(t => t.id === saved)) return saved as Tab;
    // Mobile: abrir direto em "Empréstimos" (fluxo principal). Desktop: "overview".
    const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 768;
    return isMobileViewport ? "dashboard" : "overview";
  });
  const setTab = (t: Tab) => {
    sessionStorage.setItem("activeTab", t);
    preserveScrollYRef.current = window.scrollY || document.documentElement.scrollTop || 0;
    setTabState(t);
  };

  useLayoutEffect(() => {
    const y = preserveScrollYRef.current;
    if (y === null) return;
    preserveScrollYRef.current = null;
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }));
  }, [tab]);

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
  const { loans, payments, installmentSchedules, addLoan, addPayment, addPartialPayment, payOffLoan, addInterestOnlyPayment, amortizeLoan, renegotiateLoan, updateLoan, deleteLoan, deletePayment, saveSchedule } = useLoans();
  const { clients, addClient, deleteClient, updateClient } = useClients();

  // Automatic credit-limit adjustment per client (auto mode only)
  useAutoAdjustCreditLimits(clients, loans, payments);

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
  const [showLoanSimulator, setShowLoanSimulator] = useState(false);
  const [loanFormPrefill, setLoanFormPrefill] = useState<{
    clientId: string | null;
    clientName: string;
    amount: number;
    interestRate: number;
    installments: number;
    customInstallmentValue?: number | null;
  } | null>(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showPersonalExpenseForm, setShowPersonalExpenseForm] = useState(false);
  const [showVehicleExpenseForm, setShowVehicleExpenseForm] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNotifOpen, setMobileNotifOpen] = useState(false);
  const [shortcutsEditorOpen, setShortcutsEditorOpen] = useState(false);
  const DEFAULT_PINNED: Tab[] = ["overview", "clients", "dashboard", "expenses"];
  const [pinnedTabs, setPinnedTabs] = useState<Tab[]>(() => {
    try {
      const raw = localStorage.getItem("hvcred-pinned-tabs");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
          return parsed.slice(0, 4) as Tab[];
        }
      }
    } catch { /* noop */ }
    return DEFAULT_PINNED;
  });
  const persistPinned = (next: Tab[]) => {
    setPinnedTabs(next);
    try { localStorage.setItem("hvcred-pinned-tabs", JSON.stringify(next)); } catch { /* noop */ }
  };
  const togglePinned = (id: Tab) => {
    if (pinnedTabs.includes(id)) {
      persistPinned(pinnedTabs.filter((t) => t !== id));
    } else if (pinnedTabs.length < 4) {
      persistPinned([...pinnedTabs, id]);
    }
  };
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const reorderPinned = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= pinnedTabs.length || to >= pinnedTabs.length) return;
    const next = [...pinnedTabs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistPinned(next);
  };
  const { pendingCount: approvalPendingCount } = useApprovalRequests();
  const { count: offlinePendingCount } = usePendingCount();
  const morePendingCount = (role === "admin" ? approvalPendingCount : 0) + offlinePendingCount;
  useApprovalPushAlerts();
  const isMobile = useIsMobile();
  const isMobileOrTablet = useIsMobileOrTablet();
  // Treat unresolved role as read-only to prevent flashing create buttons
  // before the role loads (defensive — viewers should never see write actions).
  const isReadOnly = loading || role === null || role === "visualizador";

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
    // Tabs marcadas como adminOnly são exclusivas para administradores
    if ((t as any).adminOnly && role !== "admin") return false;
    // Visualizador: aba de Configurações é ocultada por completo (apenas leitura
    // não tem nada acionável aqui; backups, telegram, branding, etc. exigem escrita).
    if (t.id === "settings" && role === "visualizador") return false;
    if (role === "admin") return true;
    if (!user) return false;
    // Para todas as abas (incluindo "settings"): se houver lista de
    // permissões definida, exigir presença explícita. Sem lista = acesso total.
    if (Array.isArray(allowedTabs)) return allowedTabs.includes(t.id);
    return true;
  });

  const canAccessTab = (id: Tab) => visibleTabs.some((t) => t.id === id);

  // Itens da barra inferior mobile: prioriza pinnedTabs (ordem do usuário),
  // completa com as demais abas visíveis e limita a 4 (o 5º slot é "Mais").
  const bottomItems = (() => {
    const pinnedVisible = pinnedTabs
      .map((id) => tabConfig.find((t) => t.id === id))
      .filter((t): t is typeof tabConfig[number] => !!t && visibleTabs.some((v) => v.id === t.id));
    const remaining = visibleTabs.filter((v) => !pinnedVisible.some((p) => p.id === v.id));
    return [...pinnedVisible, ...remaining].slice(0, 4);
  })();
  const bottomItemIds = bottomItems.map((i) => i.id);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find((item) => item.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [tab, visibleTabs]);

  // Extrato agora abre como dialog (não é mais aba)
  const [ledgerOpen, setLedgerOpen] = useState(false);
  useEffect(() => {
    const handler = () => setLedgerOpen(true);
    window.addEventListener("open-ledger", handler);
    return () => window.removeEventListener("open-ledger", handler);
  }, []);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hvcred-theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });


  // Apply dark class to html element
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const [themeSwitching, setThemeSwitching] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const toggleTheme = () => {
    if (themeSwitching) return;
    setThemeSwitching(true);
    const next = !dark;
    const root = document.documentElement;
    // Ativa transição suave de cores/sombras apenas durante a troca
    root.classList.add("theme-transitioning");
    setDark(next);
    root.classList.toggle("dark", next);
    localStorage.setItem("hvcred-theme", next ? "dark" : "light");
    window.setTimeout(() => {
      root.classList.remove("theme-transitioning");
      setThemeSwitching(false);
    }, 380);
  };

  const handleQuickNav = (path: string) => {
    if (pendingNav) return;
    setPendingNav(path);
    setMoreOpen(false);
    setTimeout(() => {
      navigate(path);
      setPendingNav(null);
    }, 150);
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
            {isMobileOrTablet && !isMobile && (
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
            {/* Acessos rápidos do topo: visíveis em tablet e desktop; em mobile ficam disponíveis em "Mais" */}
            {!isMobile && (
              <>
                <HideValuesToggle />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleHardRefresh}
                  disabled={refreshing}
                  className="inline-flex h-9 w-9"
                  title="Atualizar"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
                <div className="inline-flex">
                  <NotificationsFeedButton
                    loans={filteredLoans}
                    payments={filteredPayments}
                    installmentSchedules={filteredInstallments}
                    clients={filteredClients}
                    onSelectLoan={(loanId) => {
                      setTab("dashboard");
                      try { sessionStorage.setItem("highlightLoanId", loanId); } catch {}
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  className="inline-flex h-9 w-9"
                  title={dark ? "Modo claro" : "Modo escuro"}
                >
                  {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={signOut}
                  className="inline-flex h-9 w-9"
                  title="Sair"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
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

      <main className="max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-8 py-2 sm:py-6 space-y-4 sm:space-y-6">
        {(() => {
          const current = tabConfig.find((t) => t.id === tab);
          if (!current) return null;
          const Icon = current.icon;
          return (
            <div className="flex items-center gap-2 sm:gap-3 pt-1">
              <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{current.label}</h1>
            </div>
          );
        })()}
        <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>}>
        {tab === "overview" && (
          <SubscriptionGate requiredTier={1} featureName="Dashboard">
          <DashboardOverview loans={filteredLoans} sales={filteredSales} payments={filteredPayments} expenses={expenses.filter(e => (e.scope ?? "business") === "business" && !vehicleExpenseCategories.includes(e.category))} installmentSchedules={filteredInstallments} clients={clients} onDeletePayment={deletePayment} onDeleteSale={deleteSale} onDeleteLoan={deleteLoan} readOnly={isReadOnly} />
          </SubscriptionGate>
        )}
        {tab === "dashboard" && (
          <>
            <div>
              <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <h2 className="text-lg font-semibold text-foreground">Empréstimos</h2>
                {!isReadOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowLoanSimulator(true)}
                    className="gap-1.5"
                  >
                    <Calculator className="h-4 w-4" />
                    Simular Empréstimo
                  </Button>
                )}
              </div>
              <LoanList loans={filteredLoans} payments={filteredPayments} installmentSchedules={filteredInstallments} onPayment={addPayment} onPartialPayment={addPartialPayment} onFullPayment={payOffLoan} onInterestPayment={addInterestOnlyPayment} onAmortize={amortizeLoan} onRenegotiate={renegotiateLoan} onUpdate={updateLoan} onDelete={deleteLoan} onDeletePayment={deletePayment} onSaveSchedule={saveSchedule} readOnly={isReadOnly} initialCategory={initialLoanCategory} initialView={initialLoanView} clients={filteredClients} />
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
              {!isReadOnly && (
                <Button
                  variant={clientSubTab === "veiculos" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setClientSubTab("veiculos")}
                >
                  <Car className="h-4 w-4 mr-1" /> Veículos
                </Button>
              )}
            </div>
            {clientSubTab === "clientes" && (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-4">Clientes ({filteredClients.length})</h2>
                <ClientList clients={filteredClients} loans={filteredLoans} payments={filteredPayments} installmentSchedules={filteredInstallments} onDelete={deleteClient} onUpdate={updateClient} readOnly={isReadOnly} />
              </>
            )}
            {clientSubTab === "veiculos" && !isReadOnly && (
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
        {tab === "accountant" && (
          <SubscriptionGate requiredTier={2} featureName="Contador">
            <AccountantReport loans={loans} payments={payments} sales={sales} expenses={expenses} />
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
              <Button
                variant={overdueSubTab === "bot-telegram" ? "default" : "outline"}
                size="sm"
                onClick={() => setOverdueSubTab("bot-telegram")}
              >
                <Send className="h-4 w-4 mr-1" /> Bot Telegram
              </Button>
              <Button
                variant={overdueSubTab === "whatsapp-cobranca" ? "default" : "outline"}
                size="sm"
                onClick={() => setOverdueSubTab("whatsapp-cobranca")}
              >
                <MessageCircle className="h-4 w-4 mr-1" /> Cobrança WhatsApp
              </Button>
            </div>
            {overdueSubTab === "cobrancas" && (
              <OverdueLoans loans={filteredLoans} payments={filteredPayments} clients={filteredClients} installmentSchedules={filteredInstallments} />
            )}
            {overdueSubTab === "inadimplencia-acumulada" && (
              <AccumulatedDelinquencyReport loans={filteredLoans} clients={filteredClients} installmentSchedules={filteredInstallments} />
            )}
            {overdueSubTab === "metas" && (
              <MonthlyGoalsManager readOnly={isReadOnly} />
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
            {overdueSubTab === "bot-telegram" && (
              <TelegramBotsHub />
            )}
            {overdueSubTab === "whatsapp-cobranca" && (
              <div className="space-y-4">
                <WhatsappBillingCard />
              </div>
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
        {tab === "settings" && canAccessTab("settings") && (
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
        {tab === "system-health" && role === "admin" && (
          <SystemHealth />
        )}
        </Suspense>
      </main>

      {!isReadOnly && primaryLabel && (tab === "dashboard" || tab === "expenses" || tab === "products" || tab === "vehicles" || (tab === "clients" && clientSubTab === "clientes")) && (
        <button
          type="button"
          onClick={handlePrimaryAction}
          aria-label={primaryLabel}
          title={primaryLabel}
          className="group fixed z-50 right-4 md:right-8 h-12 w-12 md:h-14 md:w-14 rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-4px_hsl(var(--primary)/0.55)] hover:shadow-[0_12px_32px_-4px_hsl(var(--primary)/0.7)] hover:scale-[1.03] active:scale-95 transition-all duration-200 flex items-center justify-center animate-fade-in touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ bottom: isMobile ? `calc(env(safe-area-inset-bottom) + 80px)` : `calc(env(safe-area-inset-bottom) + 24px)` }}
        >
          <Plus className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.5} />
        </button>
      )}
      {!isReadOnly && tab === "vehicles" && (
        <button
          type="button"
          onClick={() => setShowVehicleExpenseForm(true)}
          aria-label="Registrar Despesa"
          title="Registrar Despesa"
          className="fixed z-40 right-4 md:right-8 h-11 w-11 md:h-12 md:w-12 rounded-full bg-secondary text-secondary-foreground border border-border/60 shadow-md hover:shadow-lg hover:scale-[1.03] active:scale-95 transition-all duration-200 flex items-center justify-center animate-fade-in touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ bottom: isMobile ? `calc(env(safe-area-inset-bottom) + 80px + 64px)` : `calc(env(safe-area-inset-bottom) + 24px + 72px)` }}
        >
          <Receipt className="h-4 w-4 md:h-5 md:w-5" strokeWidth={2.5} />
        </button>
      )}

      {showLoanForm && <LoanForm onAdd={addLoan} onSaveSchedule={saveSchedule} onClose={() => { setShowLoanForm(false); setLoanFormPrefill(null); }} clients={clients} loans={loans} payments={payments} installmentSchedules={installmentSchedules} existingTags={[...new Set(loans.flatMap(l => l.tags || []))]} prefill={loanFormPrefill ?? undefined} />}
      {showLoanSimulator && (
        <LoanSimulator
          open={showLoanSimulator}
          onOpenChange={setShowLoanSimulator}
          clients={clients}
          onCreateLoanFromScenario={async (p) => {
            let resolvedClientId = p.clientId;
            if (!resolvedClientId && p.autoCreateClient && p.clientName?.trim()) {
              try {
                const newId = await addClient({
                  name: p.clientName.trim(),
                  phone: "",
                  email: "",
                  cpf: "",
                  cnpj: "",
                  rg: "",
                  address: "",
                  city: "",
                  state: "",
                  score: 0,
                  notes: "Cliente criado automaticamente a partir de simulação",
                  active: true,
                  isVehicleRental: false,
                  nacionalidade: "",
                  estadoCivil: "",
                  profissao: "",
                  bairro: "",
                  isManager: false,
                  defaultInterestRate: null,
                  autoBillingEnabled: true,
                } as any);
                if (newId) {
                  resolvedClientId = newId;
                  toast.success(`Cliente "${p.clientName.trim()}" cadastrado automaticamente`);
                }
              } catch (err) {
                console.error("Erro ao criar cliente automaticamente:", err);
                toast.error("Não foi possível cadastrar o cliente automaticamente");
              }
            }
            setLoanFormPrefill({
              clientId: resolvedClientId,
              clientName: p.clientName,
              amount: p.amount,
              interestRate: p.interestRate,
              installments: p.installments,
              customInstallmentValue: p.customInstallmentValue,
            });
            setShowLoanSimulator(false);
            setShowLoanForm(true);
          }}
        />
      )}
      {showClientForm && <ClientForm onAdd={addClient} onClose={() => setShowClientForm(false)} />}
      {showProductForm && <ProductForm onAdd={addProduct} onClose={() => setShowProductForm(false)} />}
      {showSaleForm && <SaleForm onAdd={addSale} onClose={() => setShowSaleForm(false)} clients={clients} defaultBusinessType={tab === "vehicles" ? "aluguel_veiculo" : undefined} registeredVehicles={registeredVehicles} locadores={locadores} />}
      {showExpenseForm && <ExpenseForm onAdd={addExpense} onClose={() => setShowExpenseForm(false)} scope="business" />}
      {showPersonalExpenseForm && <PersonalExpenseForm onAdd={addExpense} onClose={() => setShowPersonalExpenseForm(false)} />}
      {showVehicleExpenseForm && <VehicleExpenseForm onAdd={addExpense} onClose={() => setShowVehicleExpenseForm(false)} />}

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <>
          <nav
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/40 bg-card/90 backdrop-blur-xl backdrop-saturate-150 shadow-[0_-4px_20px_-8px_hsl(0_0%_0%/0.25)] animate-fade-in"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
          >
            <div className="flex items-stretch justify-around h-[60px]">
              {bottomItems.map((item) => {
                const active = tab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-1 transition-all duration-200 touch-manipulation focus-visible:outline-none ${
                      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className={`flex items-center justify-center h-6 transition-transform duration-200 ${active ? "scale-110" : ""}`}>
                      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
                    </div>
                    <span className={`text-[10px] leading-none ${active ? "font-semibold" : "font-medium"}`}>{item.label}</span>
                    <span className={`block h-0.5 w-6 rounded-full mt-0.5 transition-all ${active ? "bg-primary" : "bg-transparent"}`} />
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 px-1 transition-all duration-200 touch-manipulation focus-visible:outline-none ${
                  moreOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`relative flex items-center justify-center h-6 transition-transform duration-200 ${moreOpen ? "scale-110" : ""}`}>
                  <Menu className="h-[22px] w-[22px]" strokeWidth={moreOpen ? 2.4 : 2} />
                  {morePendingCount > 0 && (
                    <span
                      aria-label={`${morePendingCount} pendência${morePendingCount === 1 ? "" : "s"}`}
                      className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none flex items-center justify-center shadow-[0_2px_6px_-1px_hsl(var(--destructive)/0.6)] ring-2 ring-card animate-fade-in"
                    >
                      {morePendingCount > 99 ? "99+" : morePendingCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] leading-none ${moreOpen ? "font-semibold" : "font-medium"}`}>Mais</span>
                <span className={`block h-0.5 w-6 rounded-full mt-0.5 transition-all ${moreOpen ? "bg-primary" : "bg-transparent"}`} />
              </button>
            </div>
          </nav>

          {/* Mais — Bottom Sheet */}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetContent
              side="bottom"
              className="rounded-t-2xl max-h-[88vh] overflow-y-auto p-0"
              style={{ paddingTop: 0 }}
            >
              <div className="mx-auto mt-2 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
              <div className="px-5 pb-6 pt-1 space-y-4">
                {/* Branding */}
                <div className="flex items-center gap-3">
                  <AppLogo area="header" alt={brandName} className="w-auto" />
                  <div>
                    <h2 className="text-base font-bold text-foreground tracking-tight">{brandName}</h2>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Controle de empréstimos</p>
                  </div>
                </div>

                {/* Conta / Usuário */}
                <div className="rounded-xl border border-border/40 bg-muted/30 p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{user?.user_metadata?.display_name || user?.email || "—"}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {role && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                            {role === "admin" ? "Administrador" : role === "operador" ? "Operador" : "Visualizador"}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 border-primary/40 text-primary cursor-pointer"
                          onClick={() => { setMoreOpen(false); navigate("/planos"); }}
                        >
                          {hasActiveSub && subscription ? (
                            subscription.product_id === "basico_plan" ? "Básico" :
                            subscription.product_id === "profissional_plan" ? "Profissional" :
                            subscription.product_id === "empresarial_plan" ? "Empresarial" : "Plano"
                          ) : "Sem Plano"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Navegação adicional */}
                {visibleTabs.filter(t => !bottomItemIds.includes(t.id)).length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Navegação</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-primary hover:text-primary"
                        onClick={() => setShortcutsEditorOpen(true)}
                      >
                        <Sliders className="h-3.5 w-3.5 mr-1" /> Editar atalhos
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {visibleTabs
                        .filter(t => !bottomItemIds.includes(t.id))
                        .map(t => {
                          const active = tab === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => { setTab(t.id); setMoreOpen(false); }}
                              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all touch-manipulation ${
                                active
                                  ? "border-primary/50 bg-primary/10 text-primary"
                                  : "border-border/40 bg-card/50 text-foreground hover:border-primary/30 hover:bg-muted/40"
                              }`}
                            >
                              <t.icon className="h-5 w-5" />
                              <span className="text-[11px] font-medium text-center leading-tight">{t.label}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Notificações */}
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notificações</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setTimeout(() => setMobileNotifOpen(true), 250);
                    }}
                    className="w-full rounded-xl border border-border/40 bg-card/50 p-3 flex items-center justify-between hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <Bell className="h-4 w-4 text-primary" />
                      Feed de notificações
                    </div>
                    <span className="text-[11px] text-muted-foreground">Abrir</span>
                  </button>
                </div>

                {/* Ações rápidas */}
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ações rápidas</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => { handleHardRefresh(); setMoreOpen(false); }} disabled={refreshing || !!pendingNav} className="justify-start">
                      {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      {refreshing ? "Atualizando..." : "Atualizar"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={toggleTheme} disabled={themeSwitching} className="justify-start">
                      {themeSwitching ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : dark ? (
                        <Sun className="h-4 w-4 mr-2" />
                      ) : (
                        <Moon className="h-4 w-4 mr-2" />
                      )}
                      {themeSwitching ? "Aplicando..." : dark ? "Modo claro" : "Modo escuro"}
                    </Button>
                    {role === "admin" && (
                      <Button variant="outline" size="sm" onClick={() => handleQuickNav("/planejamento-do-dia")} disabled={!!pendingNav} className="justify-start">
                        {pendingNav === "/planejamento-do-dia" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarClock className="h-4 w-4 mr-2" />}
                        {pendingNav === "/planejamento-do-dia" ? "Abrindo..." : "Planejamento"}
                      </Button>
                    )}
                    <HideValuesQuickAction />

                  </div>
                </div>

                {/* Sair */}
                <Button variant="destructive" className="w-full" onClick={() => { setMoreOpen(false); signOut(); }}>
                  <LogOut className="h-4 w-4 mr-2" /> Sair
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Feed de notificações controlado para mobile (acionado a partir do "Mais") */}
          {isMobile && (
            <NotificationsFeedButton
              hideTrigger
              open={mobileNotifOpen}
              onOpenChange={setMobileNotifOpen}
              loans={filteredLoans}
              payments={filteredPayments}
              installmentSchedules={filteredInstallments}
              clients={filteredClients}
              onSelectLoan={(loanId) => {
                setTab("dashboard");
                try { sessionStorage.setItem("highlightLoanId", loanId); } catch {}
              }}
            />
          )}

          {/* Editor de atalhos do menu inferior */}
          <Dialog open={shortcutsEditorOpen} onOpenChange={setShortcutsEditorOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pin className="h-4 w-4 text-primary" /> Personalizar menu inferior
                </DialogTitle>
                <DialogDescription>
                  Escolha até 4 atalhos fixos para o menu inferior. Os demais ficam disponíveis em "Mais".
                </DialogDescription>
              </DialogHeader>
              <div className="grid md:grid-cols-[1fr_220px] gap-4 my-2">
              <div className="space-y-3 min-w-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{pinnedTabs.length} de 4 selecionados</span>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => persistPinned(DEFAULT_PINNED)}
                  >
                    Restaurar padrão
                  </button>
                </div>

                {pinnedTabs.length > 1 && (
                  <div className="rounded-lg border border-border/40 bg-muted/20 p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                      Ordem dos fixados (arraste para reordenar)
                    </p>
                    <div className="flex flex-col gap-1">
                      {pinnedTabs.map((id, idx) => {
                        const tab = visibleTabs.find((v) => v.id === id);
                        if (!tab) return null;
                        const isDragging = dragIndex === idx;
                        const isOver = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
                        return (
                          <div
                            key={id}
                            draggable
                            onDragStart={(e) => {
                              setDragIndex(idx);
                              e.dataTransfer.effectAllowed = "move";
                              try { e.dataTransfer.setData("text/plain", String(idx)); } catch { /* noop */ }
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (dragOverIndex !== idx) setDragOverIndex(idx);
                            }}
                            onDragLeave={() => {
                              if (dragOverIndex === idx) setDragOverIndex(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragIndex !== null) reorderPinned(dragIndex, idx);
                              setDragIndex(null);
                              setDragOverIndex(null);
                            }}
                            onDragEnd={() => {
                              setDragIndex(null);
                              setDragOverIndex(null);
                            }}
                            className={`flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 transition-all cursor-grab active:cursor-grabbing select-none ${
                              isDragging ? "opacity-40 scale-[0.98]" : ""
                            } ${isOver ? "border-primary ring-2 ring-primary/30" : "border-border/40"}`}
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-[10px] font-semibold rounded-full bg-primary text-primary-foreground h-5 min-w-5 px-1.5 flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <tab.icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="text-sm font-medium flex-1 truncate">{tab.label}</span>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                aria-label="Mover para cima"
                                disabled={idx === 0}
                                onClick={() => reorderPinned(idx, idx - 1)}
                                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                aria-label="Mover para baixo"
                                disabled={idx === pinnedTabs.length - 1}
                                onClick={() => reorderPinned(idx, idx + 1)}
                                className="h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                              >
                                ▼
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-1.5 max-h-[40vh] overflow-y-auto pr-1">
                  {visibleTabs.map((t) => {
                    const checked = pinnedTabs.includes(t.id);
                    const order = checked ? pinnedTabs.indexOf(t.id) + 1 : null;
                    const disabled = !checked && pinnedTabs.length >= 4;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => !disabled && togglePinned(t.id)}
                        disabled={disabled}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                          checked
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : disabled
                            ? "border-border/30 bg-muted/20 text-muted-foreground opacity-50 cursor-not-allowed"
                            : "border-border/40 bg-card/50 text-foreground hover:border-primary/30 hover:bg-muted/40"
                        }`}
                      >
                        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${checked ? "bg-primary/20 text-primary" : "bg-muted/50 text-muted-foreground"}`}>
                          <t.icon className="h-4 w-4" />
                        </div>
                        <span className="flex-1 text-sm font-medium">{t.label}</span>
                        {checked && order !== null && (
                          <span className="text-[10px] font-semibold rounded-full bg-primary text-primary-foreground h-5 min-w-5 px-1.5 flex items-center justify-center">
                            {order}
                          </span>
                        )}
                        <div className={`h-5 w-5 rounded border flex items-center justify-center ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                          {checked && <Check className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview ao vivo do menu inferior */}
              <aside className="hidden md:flex flex-col items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pré-visualização</p>
                <div className="relative w-[200px] h-[380px] rounded-[28px] border-4 border-border/60 bg-background shadow-xl overflow-hidden flex flex-col">
                  <div className="h-5 bg-card/80 border-b border-border/30 flex items-center justify-center">
                    <div className="w-12 h-1 rounded-full bg-muted-foreground/30" />
                  </div>
                  <div className="flex-1 bg-gradient-to-b from-muted/20 to-card/40 p-2 space-y-1.5 overflow-hidden">
                    <div className="h-2 w-2/3 rounded bg-muted/60" />
                    <div className="h-2 w-1/2 rounded bg-muted/40" />
                    <div className="mt-2 h-12 rounded-md bg-card/70 border border-border/30" />
                    <div className="h-12 rounded-md bg-card/70 border border-border/30" />
                    <div className="h-12 rounded-md bg-card/70 border border-border/30" />
                  </div>
                  <div className="border-t border-border/40 bg-card/95 backdrop-blur">
                    <div className="flex items-stretch justify-around h-[52px]">
                      {pinnedTabs
                        .map((id) => visibleTabs.find((v) => v.id === id))
                        .filter((t): t is typeof visibleTabs[number] => !!t)
                        .map((item, idx) => {
                          const Icon = item.icon;
                          const active = idx === 0;
                          return (
                            <div
                              key={item.id}
                              className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-0.5 ${
                                active ? "text-primary" : "text-muted-foreground"
                              }`}
                            >
                              <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 2} />
                              <span className={`text-[8px] leading-none truncate max-w-full ${active ? "font-semibold" : "font-medium"}`}>
                                {item.label}
                              </span>
                              <span className={`block h-0.5 w-3 rounded-full ${active ? "bg-primary" : "bg-transparent"}`} />
                            </div>
                          );
                        })}
                      <div className="relative flex-1 flex flex-col items-center justify-center gap-0.5 px-0.5 text-muted-foreground">
                        <div className="relative">
                          <Menu className="h-4 w-4" />
                          {morePendingCount > 0 && (
                            <span className="absolute -top-1 -right-1.5 min-w-[12px] h-[12px] px-0.5 rounded-full bg-destructive text-destructive-foreground text-[7px] font-bold leading-none flex items-center justify-center ring-1 ring-card">
                              {morePendingCount > 9 ? "9+" : morePendingCount}
                            </span>
                          )}
                        </div>
                        <span className="text-[8px] leading-none font-medium">Mais</span>
                        <span className="block h-0.5 w-3 rounded-full bg-transparent" />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground text-center max-w-[200px]">
                  Reflete a ordem e os atalhos atualmente selecionados.
                </p>
              </aside>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShortcutsEditorOpen(false)}>Fechar</Button>
                <Button onClick={() => setShortcutsEditorOpen(false)}>Concluído</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Extrato em Dialog (acionado pelo botão "Ver extrato") */}
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className="max-w-5xl w-[calc(100vw-1rem)] sm:w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle>Extrato da Conta</DialogTitle>
            <DialogDescription>Histórico completo de entradas e saídas. Fonte única do saldo.</DialogDescription>
          </DialogHeader>
          <LedgerView readOnly={isReadOnly} />
        </DialogContent>
      </Dialog>
    </div>
    </HideValuesProvider>
  );
};

export default Index;
