import { useState, useEffect, useMemo } from "react";
import { Plus, Users, LayoutDashboard, ShoppingBag, BarChart3, AlertTriangle, Receipt, CalendarDays, Sun, Moon, LogOut, Info, X, Eye, EyeOff, Car, Wrench, DatabaseBackup, Menu, User, RefreshCw } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DashboardCards } from "@/components/DashboardCards";
import { LoanForm } from "@/components/LoanForm";
import { LoanList } from "@/components/LoanList";
import { ClientForm } from "@/components/ClientForm";
import { ClientList } from "@/components/ClientList";
import { ProductForm } from "@/components/ProductForm";
import { SaleForm } from "@/components/SaleForm";
import { ProductSalesView } from "@/components/ProductSalesView";
import { DashboardOverview } from "@/components/DashboardOverview";
import { OverdueLoans } from "@/components/OverdueLoans";
import { BillingCalendar } from "@/components/BillingCalendar";
import { ExpenseForm } from "@/components/ExpenseForm";
import { VehicleExpenseForm, vehicleExpenseCategories } from "@/components/VehicleExpenseForm";
import { ExpenseList } from "@/components/ExpenseList";
import { useLoans } from "@/hooks/useLoans";
import { useClients } from "@/hooks/useClients";
import { useProducts } from "@/hooks/useProducts";
import { useExpenses } from "@/hooks/useExpenses";
import { toast } from "sonner";
import { HideValuesProvider, useHideValues } from "@/contexts/HideValuesContext";
import { UserManagement } from "@/components/UserManagement";
import { PlanManagement } from "@/components/PlanManagement";
import { BackupExport } from "@/components/BackupExport";
import { WebhookSettings } from "@/components/WebhookSettings";
import { Badge } from "@/components/ui/badge";
import { PlanSubscribers } from "@/components/PlanSubscribers";
import { useVehicleRegistry } from "@/hooks/useVehicleRegistry";
import { useLocadorInfo } from "@/hooks/useLocadorInfo";
import { VehicleCardList } from "@/components/VehicleCardList";
import { LocadorPopoverContent } from "@/components/LocadorPopoverContent";
import { LocadorList } from "@/components/LocadorList";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";

type Tab = "overview" | "dashboard" | "clients" | "products" | "vehicles" | "overdue" | "expenses" | "calendar" | "users" | "plan_mgmt" | "backup";
type ClientSubTab = "clientes" | "veiculos";
type VehicleSubTab = "veiculos" | "locadores";
type PlanMgmtSubTab = "subscribers" | "plans";

const tabConfig = [
  { id: "overview" as Tab, label: "Dashboard", icon: BarChart3 },
  { id: "dashboard" as Tab, label: "Empréstimos", icon: LayoutDashboard },
  { id: "products" as Tab, label: "Vendas", icon: ShoppingBag },
  { id: "vehicles" as Tab, label: "Veículos", icon: Car },
  { id: "calendar" as Tab, label: "Calendário", icon: CalendarDays },
  { id: "clients" as Tab, label: "Cadastro", icon: Users },
  { id: "expenses" as Tab, label: "Despesas", icon: Receipt },
  { id: "overdue" as Tab, label: "Relatório", icon: AlertTriangle },
  { id: "users" as Tab, label: "Usuários", icon: Users },
  { id: "plan_mgmt" as Tab, label: "Gestão de Planos", icon: Wrench },
  { id: "backup" as Tab, label: "Backup", icon: DatabaseBackup },
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
  users: {
    title: "Gerenciamento de Usuários",
    items: [
      "Crie novos usuários com email, nome de usuário e senha.",
      "Defina papéis: Admin, Operador ou Visualizador.",
      "Apenas administradores podem acessar esta aba.",
      "Gerencie permissões de acesso dos usuários.",
    ],
  },
  plan_mgmt: {
    title: "Gestão de Planos",
    items: [
      "Visualize todos os assinantes na sub-aba Usuários.",
      "Crie e edite planos na sub-aba Planos.",
      "As alterações são refletidas na página de compra.",
      "Apenas administradores podem acessar esta aba.",
    ],
  },
  backup: {
    title: "Backup de Dados",
    items: [
      "Exporte todos os seus dados cadastrados em formato CSV.",
      "Faça backup de empréstimos, clientes, vendas, despesas e pagamentos.",
      "Use 'Exportar Tudo' para baixar todos os dados de uma vez.",
      "Os arquivos são nomeados com a data do backup.",
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
  const { loans, payments, installmentSchedules, addLoan, addPayment, addPartialPayment, addInterestOnlyPayment, updateLoan, deleteLoan, deletePayment, saveSchedule } = useLoans();
  const { clients, addClient, deleteClient, updateClient } = useClients();
  const { products, sales, addProduct, updateProduct, deleteProduct, addSale, updateSale, deleteSale } = useProducts();
  const { expenses, addExpense, payExpense, unpayExpense, deleteExpense, updateExpense } = useExpenses();
  const { vehicles: registeredVehicles, add: addVehicle, update: updateVehicle, remove: removeVehicle } = useVehicleRegistry();
  const { locador, locadores, save: saveLocador, remove: removeLocador } = useLocadorInfo();
  const [clientSubTab, setClientSubTab] = useState<ClientSubTab>("clientes");
  const [vehicleSubTab, setVehicleSubTab] = useState<VehicleSubTab>("veiculos");
  const [planMgmtSubTab, setPlanMgmtSubTab] = useState<PlanMgmtSubTab>("subscribers");

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
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showVehicleExpenseForm, setShowVehicleExpenseForm] = useState(false);
  const [tab, setTabState] = useState<Tab>(() => {
    const saved = sessionStorage.getItem("activeTab");
    return saved && tabConfig.some(t => t.id === saved) ? saved as Tab : "overview";
  });
  const setTab = (t: Tab) => { sessionStorage.setItem("activeTab", t); setTabState(t); };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const isReadOnly = role === "visualizador";

  // Swipe from left edge to open sidebar on mobile
  useEffect(() => {
    if (!isMobile) return;
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
  }, [isMobile]);

  const visibleTabs = tabConfig.filter((t) => {
    if (loading) return false;
    if (role === "admin") return true;
    // Admin-only tabs
    if (t.id === "users" || t.id === "backup" || t.id === "plan_mgmt") return false;
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
    else if (tab === "expenses") setShowExpenseForm(true);
    else if (tab === "products" || tab === "vehicles") setShowSaleForm(true);
  };

  const primaryLabel =
    tab === "dashboard" ? "Novo Empréstimo" :
    tab === "clients" && clientSubTab === "clientes" ? "Novo Cliente" :
    tab === "expenses" ? "Nova Despesa" :
    tab === "products" ? "Novo Lançamento" :
    tab === "vehicles" ? "Novo Aluguel" : "";

  return (
    <HideValuesProvider>
    <div className="min-h-screen bg-background">
      <SubscriptionBanner />

      <header className="border-b border-border/30 glass sticky top-0 z-40">
        <div className="max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-8 py-2 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isMobile && (
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                  <div className="flex flex-col h-full">
                    <div className="p-4 border-b border-border/30 flex items-center gap-3">
                      <img src={logoIcon} alt="EmprestAI" className="h-11 w-11 rounded-xl" width={44} height={44} />
                      <div>
                        <h1 className="text-lg font-bold text-foreground tracking-tight">EmprestAI</h1>
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
            <img src={logoIcon} alt="EmprestAI" className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl" width={44} height={44} />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground tracking-tight">EmprestAI</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Controle de empréstimos</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-xs text-muted-foreground mr-1">
              <User className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{user?.user_metadata?.display_name || user?.email || "—"}</span>
              {role && <Badge variant={role === "admin" ? "default" : role === "operador" ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">{role === "admin" ? "Admin" : role === "operador" ? "Op." : "Vis."}</Badge>}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="ml-0.5">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-primary/10 transition-colors border-primary/40 text-primary">
                      {hasActiveSub && subscription ? (
                        subscription.product_id === "basico_plan" ? "Básico" :
                        subscription.product_id === "profissional_plan" ? "Profissional" :
                        subscription.product_id === "empresarial_plan" ? "Empresarial" : "Plano"
                      ) : "Sem Plano"}
                    </Badge>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56" align="end">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">Plano atual: {hasActiveSub && subscription ? (
                      subscription.product_id === "basico_plan" ? "Básico" :
                      subscription.product_id === "profissional_plan" ? "Profissional" :
                      subscription.product_id === "empresarial_plan" ? "Empresarial" : "—"
                    ) : "Nenhum"}</p>
                    <Button size="sm" className="w-full text-xs" onClick={() => navigate("/pricing")}>
                      {hasActiveSub ? "Upgrade / Trocar Plano" : "Contratar Plano"}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
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
            <Button variant="ghost" size="icon" onClick={() => window.location.reload()} className="h-8 w-8 sm:h-9 sm:w-9" title="Atualizar página">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HideValuesToggle />
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
            {!isReadOnly && tab !== "overview" && tab !== "overdue" && tab !== "calendar" && tab !== "users" && !(tab === "clients" && clientSubTab === "veiculos") && tab !== "backup" && (
              <Button onClick={handlePrimaryAction} size="sm" className="h-8 px-2 sm:px-3">
                <Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">{primaryLabel}</span>
              </Button>
            )}
          </div>
        </div>

        {!isMobile && (
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
        {tab === "overview" && (
          <SubscriptionGate requiredTier={1} featureName="Dashboard">
          <DashboardOverview loans={filteredLoans} sales={filteredSales} payments={filteredPayments} expenses={expenses} installmentSchedules={filteredInstallments} onDeletePayment={deletePayment} onDeleteSale={deleteSale} onDeleteLoan={deleteLoan} />
          </SubscriptionGate>
        )}
        {tab === "dashboard" && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Empréstimos</h2>
              <LoanList loans={filteredLoans} payments={filteredPayments} installmentSchedules={filteredInstallments} onPayment={addPayment} onPartialPayment={addPartialPayment} onInterestPayment={addInterestOnlyPayment} onUpdate={updateLoan} onDelete={deleteLoan} onDeletePayment={deletePayment} onSaveSchedule={saveSchedule} readOnly={isReadOnly} />
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
                <ClientList clients={filteredClients} loans={filteredLoans} payments={filteredPayments} onDelete={deleteClient} onUpdate={updateClient} readOnly={isReadOnly} />
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
            <h2 className="text-lg font-semibold text-foreground mb-4">Despesas ({nonVehicleExpenses.length})</h2>
            <ExpenseList expenses={nonVehicleExpenses} onPay={payExpense} onUnpay={unpayExpense} onDelete={deleteExpense} onUpdate={updateExpense} readOnly={isReadOnly} />
          </div>
          </SubscriptionGate>
        )}
        {tab === "overdue" && (
          <SubscriptionGate requiredTier={2} featureName="Relatórios">
          <OverdueLoans loans={filteredLoans} payments={filteredPayments} clients={filteredClients} installmentSchedules={filteredInstallments} />
          </SubscriptionGate>
        )}
        {tab === "calendar" && (
          <BillingCalendar loans={filteredLoans} payments={filteredPayments} installmentSchedules={filteredInstallments} onPayment={addPayment} onPartialPayment={addPartialPayment} onInterestPayment={addInterestOnlyPayment} onUpdate={updateLoan} readOnly={isReadOnly} />
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
        {tab === "users" && (
          <UserManagement />
        )}
        {tab === "plan_mgmt" && (
          <div>
            <div className="flex gap-2 mb-4">
              <Button
                variant={planMgmtSubTab === "subscribers" ? "default" : "outline"}
                size="sm"
                onClick={() => setPlanMgmtSubTab("subscribers")}
              >
                <Users className="h-4 w-4 mr-1" /> Assinantes
              </Button>
              <Button
                variant={planMgmtSubTab === "plans" ? "default" : "outline"}
                size="sm"
                onClick={() => setPlanMgmtSubTab("plans")}
              >
                <Wrench className="h-4 w-4 mr-1" /> Planos
              </Button>
            </div>
            {planMgmtSubTab === "subscribers" && (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-4">Assinantes</h2>
                <PlanSubscribers />
              </>
            )}
            {planMgmtSubTab === "plans" && <PlanManagement />}
          </div>
        )}
        {tab === "backup" && (
          <div className="space-y-6">
            <BackupExport
              loans={loans}
              payments={payments}
              clients={clients}
              sales={sales}
              expenses={expenses}
              onImportLoans={async (imported) => {
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
              }}
              onImportClients={async (imported) => {
                await Promise.all(imported.map((client) => addClient(client)));
              }}
              onImportSales={async (imported) => {
                await Promise.all(imported.map((sale) => addSale(sale)));
              }}
              onImportExpenses={async (imported) => {
                await Promise.all(imported.map((expense) => addExpense(expense)));
              }}
            />
            <WebhookSettings />
          </div>
        )}
      </main>

      {showLoanForm && <LoanForm onAdd={addLoan} onSaveSchedule={saveSchedule} onClose={() => setShowLoanForm(false)} clients={clients} existingTags={[...new Set(loans.flatMap(l => l.tags || []))]} />}
      {showClientForm && <ClientForm onAdd={addClient} onClose={() => setShowClientForm(false)} />}
      {showProductForm && <ProductForm onAdd={addProduct} onClose={() => setShowProductForm(false)} />}
      {showSaleForm && <SaleForm onAdd={addSale} onClose={() => setShowSaleForm(false)} clients={clients} defaultBusinessType={tab === "vehicles" ? "aluguel_veiculo" : undefined} registeredVehicles={registeredVehicles} locadores={locadores} />}
      {showExpenseForm && <ExpenseForm onAdd={addExpense} onClose={() => setShowExpenseForm(false)} />}
      {showVehicleExpenseForm && <VehicleExpenseForm onAdd={addExpense} onClose={() => setShowVehicleExpenseForm(false)} />}
    </div>
    </HideValuesProvider>
  );
};

export default Index;
