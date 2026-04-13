import { useState, useEffect } from "react";
import { Plus, HandCoins, Users, LayoutDashboard, ShoppingBag, BarChart3, AlertTriangle, Receipt, CalendarDays, Sun, Moon, LogOut, Info, X, Eye, EyeOff, Car, Wrench, DatabaseBackup, Menu, User } from "lucide-react";
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
import { BackupExport } from "@/components/BackupExport";
import { Badge } from "@/components/ui/badge";

type Tab = "overview" | "dashboard" | "clients" | "products" | "vehicles" | "overdue" | "expenses" | "calendar" | "users" | "backup";

const tabConfig = [
  { id: "overview" as Tab, label: "Dashboard", icon: BarChart3 },
  { id: "dashboard" as Tab, label: "Empréstimos", icon: LayoutDashboard },
  { id: "calendar" as Tab, label: "Calendário", icon: CalendarDays },
  { id: "clients" as Tab, label: "Clientes", icon: Users },
  { id: "products" as Tab, label: "Vendas", icon: ShoppingBag },
  { id: "vehicles" as Tab, label: "Veículos", icon: Car },
  { id: "expenses" as Tab, label: "Despesas", icon: Receipt },
  { id: "overdue" as Tab, label: "Relatório", icon: AlertTriangle },
  { id: "users" as Tab, label: "Usuários", icon: Users },
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
    title: "Clientes",
    items: [
      "Cadastre seus clientes com nome, CPF/CNPJ, telefone e endereço.",
      "Use o score para classificar a confiabilidade do cliente.",
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
  const { loans, payments, installmentSchedules, addLoan, addPayment, addPartialPayment, addInterestOnlyPayment, updateLoan, deleteLoan, deletePayment, saveSchedule } = useLoans();
  const { clients, addClient, deleteClient, updateClient } = useClients();
  const { products, sales, addProduct, updateProduct, deleteProduct, addSale, updateSale, deleteSale } = useProducts();
  const { expenses, addExpense, payExpense, unpayExpense, deleteExpense, updateExpense } = useExpenses();

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
  const [tab, setTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const isReadOnly = role === "visualizador";

  const visibleTabs = tabConfig.filter((t) => {
    if (loading) return false;
    if (role === "admin") return true;
    if (!role) return false;
    if (t.id === "users" || t.id === "backup") return false;
    return Array.isArray(allowedTabs) ? allowedTabs.includes(t.id) : false;
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
    else if (tab === "clients") setShowClientForm(true);
    else if (tab === "expenses") setShowExpenseForm(true);
    else if (tab === "products" || tab === "vehicles") setShowSaleForm(true);
  };

  const primaryLabel =
    tab === "dashboard" ? "Novo Empréstimo" :
    tab === "clients" ? "Novo Cliente" :
    tab === "expenses" ? "Nova Despesa" :
    tab === "products" ? "Novo Lançamento" :
    tab === "vehicles" ? "Novo Aluguel" : "";

  return (
    <HideValuesProvider>
    <div className="min-h-screen bg-background">
      

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
                      <div className="h-9 w-9 rounded-xl gradient-primary glow-primary flex items-center justify-center">
                        <HandCoins className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <h1 className="text-lg font-bold text-foreground tracking-tight">HVCred</h1>
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
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{user?.user_metadata?.display_name || user?.email || "—"}</p>
                        {role && <p className="text-[10px] text-muted-foreground">{role === "admin" ? "Administrador" : role === "operador" ? "Operador" : "Visualizador"}</p>}
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl gradient-primary glow-primary flex items-center justify-center">
              <HandCoins className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground tracking-tight">HVCred</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Controle de empréstimos</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-xs text-muted-foreground mr-1">
              <User className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{user?.user_metadata?.display_name || user?.email || "—"}</span>
              {role && <Badge variant={role === "admin" ? "default" : role === "operador" ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">{role === "admin" ? "Admin" : role === "operador" ? "Op." : "Vis."}</Badge>}
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
            {!isReadOnly && tab !== "overview" && tab !== "overdue" && tab !== "calendar" && tab !== "users" && (
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
          <DashboardOverview loans={filteredLoans} sales={filteredSales} payments={filteredPayments} expenses={expenses} installmentSchedules={filteredInstallments} onDeletePayment={deletePayment} onDeleteSale={deleteSale} onDeleteLoan={deleteLoan} />
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
            <h2 className="text-lg font-semibold text-foreground mb-4">Clientes ({filteredClients.length})</h2>
            <ClientList clients={filteredClients} loans={filteredLoans} payments={filteredPayments} onDelete={deleteClient} onUpdate={updateClient} />
          </div>
        )}
        {tab === "expenses" && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Despesas ({nonVehicleExpenses.length})</h2>
            <ExpenseList expenses={nonVehicleExpenses} onPay={payExpense} onUnpay={unpayExpense} onDelete={deleteExpense} readOnly={isReadOnly} />
          </div>
        )}
        {tab === "overdue" && (
          <OverdueLoans loans={filteredLoans} payments={filteredPayments} clients={filteredClients} installmentSchedules={filteredInstallments} />
        )}
        {tab === "calendar" && (
          <BillingCalendar loans={filteredLoans} payments={filteredPayments} installmentSchedules={filteredInstallments} onPayment={addPayment} onPartialPayment={addPartialPayment} onInterestPayment={addInterestOnlyPayment} onUpdate={updateLoan} readOnly={isReadOnly} />
        )}
        {tab === "products" && (
          <ProductSalesView
            sales={filteredSales.filter(s => s.businessType !== "aluguel_veiculo")}
            onDeleteSale={deleteSale}
            onUpdateSale={updateSale}
            clients={filteredClients}
          />
        )}
        {tab === "vehicles" && (
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
          />
        )}
        {tab === "users" && <UserManagement />}
        {tab === "backup" && (
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
        )}
      </main>

      {showLoanForm && <LoanForm onAdd={addLoan} onSaveSchedule={saveSchedule} onClose={() => setShowLoanForm(false)} clients={clients} />}
      {showClientForm && <ClientForm onAdd={addClient} onClose={() => setShowClientForm(false)} />}
      {showProductForm && <ProductForm onAdd={addProduct} onClose={() => setShowProductForm(false)} />}
      {showSaleForm && <SaleForm onAdd={addSale} onClose={() => setShowSaleForm(false)} clients={clients} defaultBusinessType={tab === "vehicles" ? "aluguel_veiculo" : undefined} />}
      {showExpenseForm && <ExpenseForm onAdd={addExpense} onClose={() => setShowExpenseForm(false)} />}
      {showVehicleExpenseForm && <VehicleExpenseForm onAdd={addExpense} onClose={() => setShowVehicleExpenseForm(false)} />}
    </div>
    </HideValuesProvider>
  );
};

export default Index;
