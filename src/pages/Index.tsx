import { useRef, useState, useEffect } from "react";
import { Plus, HandCoins, Users, LayoutDashboard, Download, Upload, ShoppingBag, BarChart3, AlertTriangle, Receipt, CalendarDays, Sun, Moon, LogOut, Info, X, Eye, EyeOff, Car, Menu } from "lucide-react";
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
import { ExpenseList } from "@/components/ExpenseList";
import { useLoans } from "@/hooks/useLoans";
import { useClients } from "@/hooks/useClients";
import { useProducts } from "@/hooks/useProducts";
import { useExpenses } from "@/hooks/useExpenses";
import {
  exportLoansToCSV, exportClientsToCSV, exportSalesToCSV,
  importLoansFromCSV, importClientsFromCSV, importSalesFromCSV, downloadCSV,
} from "@/lib/csv";
import { toast } from "sonner";
import { HideValuesProvider, useHideValues } from "@/contexts/HideValuesContext";
import { UserManagement } from "@/components/UserManagement";

type Tab = "overview" | "dashboard" | "clients" | "products" | "vehicles" | "overdue" | "expenses" | "calendar" | "users";

const tabConfig = [
  { id: "overview" as Tab, label: "Dashboard", icon: BarChart3 },
  { id: "dashboard" as Tab, label: "Empréstimos", icon: LayoutDashboard },
  { id: "calendar" as Tab, label: "Calendário", icon: CalendarDays },
  { id: "clients" as Tab, label: "Clientes", icon: Users },
  { id: "products" as Tab, label: "Vendas", icon: ShoppingBag },
  { id: "vehicles" as Tab, label: "Veículos", icon: Car },
  { id: "expenses" as Tab, label: "Despesas", icon: Receipt },
  { id: "overdue" as Tab, label: "Inadimplentes", icon: AlertTriangle },
  { id: "users" as Tab, label: "Usuários", icon: Users },
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
      "Importe/Exporte dados via CSV.",
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
      "Importe/Exporte clientes via CSV.",
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
    title: "Inadimplentes",
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
  const { signOut, role } = useAuth();
  const { loans, payments, installmentSchedules, addLoan, addPayment, addPartialPayment, addInterestOnlyPayment, updateLoan, deleteLoan, deletePayment, saveSchedule } = useLoans();
  const { clients, addClient, deleteClient, updateClient } = useClients();
  const { products, sales, addProduct, updateProduct, deleteProduct, addSale, updateSale, deleteSale } = useProducts();
  const { expenses, addExpense, payExpense, deleteExpense } = useExpenses();
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  const isReadOnly = role === "visualizador";

  // Filter tabs based on role
  const visibleTabs = tabConfig.filter((t) => {
    if (role === "admin" || !role) return true;
    if (role === "operador") return ["overview", "dashboard", "calendar", "clients", "overdue"].includes(t.id);
    if (role === "visualizador") return ["dashboard"].includes(t.id);
    return false;
  });

  // Reset tab if not visible for current role
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find(t => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [role]);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hvcred-theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleExport = () => {
    if (tab === "dashboard") {
      if (loans.length === 0) return toast.error("Nenhum empréstimo para exportar");
      downloadCSV(exportLoansToCSV(loans, payments), "emprestimos.csv");
      toast.success("Empréstimos exportados com sucesso!");
    } else if (tab === "clients") {
      if (clients.length === 0) return toast.error("Nenhum cliente para exportar");
      downloadCSV(exportClientsToCSV(clients), "clientes.csv");
      toast.success("Clientes exportados com sucesso!");
    } else if (tab === "products") {
      const filtered = sales.filter(s => s.businessType !== "aluguel_veiculo");
      if (filtered.length === 0) return toast.error("Nenhuma venda para exportar");
      downloadCSV(exportSalesToCSV(filtered), "vendas.csv");
      toast.success("Vendas exportadas com sucesso!");
    } else if (tab === "vehicles") {
      const filtered = sales.filter(s => s.businessType === "aluguel_veiculo");
      if (filtered.length === 0) return toast.error("Nenhum aluguel para exportar");
      downloadCSV(exportSalesToCSV(filtered), "alugueis_veiculos.csv");
      toast.success("Aluguéis exportados com sucesso!");
    }
  };

  const handleImport = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const csv = evt.target?.result as string;
      try {
        if (tab === "dashboard") {
          const imported = importLoansFromCSV(csv);
          if (imported.length === 0) throw new Error();
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
          toast.success(`${imported.length} empréstimo(s) importado(s)!`);
        } else if (tab === "clients") {
          const imported = importClientsFromCSV(csv);
          if (imported.length === 0) throw new Error();
          await Promise.all(imported.map((client) => addClient(client)));
          toast.success(`${imported.length} cliente(s) importado(s)!`);
        } else if (tab === "products") {
          const imported = importSalesFromCSV(csv);
          if (imported.length === 0) throw new Error();
          await Promise.all(imported.map((sale) => addSale(sale)));
          toast.success(`${imported.length} venda(s) importada(s)!`);
        }
      } catch {
        toast.error("Erro ao importar CSV.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
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

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <HideValuesProvider>
    <div className="min-h-screen bg-background flex">
      <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleFileChange} />

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 z-50 h-full w-56 bg-background border-r border-border/50 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Logo */}
        <div className="p-4 border-b border-border/50 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg gradient-primary glow-primary flex items-center justify-center shrink-0">
            <HandCoins className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground tracking-tight">HVCred</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest truncate">Controle de empréstimos</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto lg:hidden shrink-0" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
              }`}
            >
              <t.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="p-3 border-t border-border/50 space-y-1">
          <div className="flex items-center justify-between">
            <HideValuesToggle />
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9" title={dark ? "Modo claro" : "Modo escuro"}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" title="Ajuda">
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="start" side="right">
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
            <Button variant="ghost" size="icon" onClick={signOut} className="h-9 w-9" title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-30">
          <div className="px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <h2 className="text-lg font-semibold text-foreground">{tabConfig.find(t => t.id === tab)?.label}</h2>
            </div>
            <div className="flex items-center gap-2">
              {!isReadOnly && (tab === "dashboard" || tab === "clients" || tab === "products" || tab === "vehicles") && (
                <>
                  <Button variant="outline" size="sm" onClick={handleImport}><Upload className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Importar</span></Button>
                  <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Exportar</span></Button>
                </>
              )}
              {!isReadOnly && tab !== "overview" && tab !== "overdue" && tab !== "calendar" && tab !== "users" && (
                <Button onClick={handlePrimaryAction}>
                  <Plus className="h-4 w-4 mr-2" />{primaryLabel}
                </Button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
          {tab === "overview" && (
            <DashboardOverview loans={loans} sales={sales} payments={payments} expenses={expenses} onDeletePayment={deletePayment} onDeleteSale={deleteSale} onDeleteLoan={deleteLoan} />
          )}
          {tab === "dashboard" && (
            <LoanList loans={loans} payments={payments} installmentSchedules={installmentSchedules} onPayment={addPayment} onPartialPayment={addPartialPayment} onInterestPayment={addInterestOnlyPayment} onUpdate={updateLoan} onDelete={deleteLoan} onDeletePayment={deletePayment} onSaveSchedule={saveSchedule} readOnly={isReadOnly} />
          )}
          {tab === "clients" && (
            <ClientList clients={clients} loans={loans} payments={payments} onDelete={deleteClient} onUpdate={updateClient} />
          )}
          {tab === "expenses" && (
            <ExpenseList expenses={expenses} onPay={payExpense} onDelete={deleteExpense} />
          )}
          {tab === "overdue" && (
            <OverdueLoans loans={loans} clients={clients} installmentSchedules={installmentSchedules} />
          )}
          {tab === "calendar" && (
            <BillingCalendar loans={loans} payments={payments} installmentSchedules={installmentSchedules} />
          )}
          {tab === "products" && (
            <ProductSalesView
              sales={sales.filter(s => s.businessType !== "aluguel_veiculo")}
              onDeleteSale={deleteSale}
              onUpdateSale={updateSale}
              clients={clients}
            />
          )}
          {tab === "vehicles" && (
            <ProductSalesView
              sales={sales.filter(s => s.businessType === "aluguel_veiculo")}
              onDeleteSale={deleteSale}
              onUpdateSale={updateSale}
              clients={clients}
            />
          )}
          {tab === "users" && <UserManagement />}
        </main>
      </div>

      {showLoanForm && <LoanForm onAdd={addLoan} onSaveSchedule={saveSchedule} onClose={() => setShowLoanForm(false)} clients={clients} />}
      {showClientForm && <ClientForm onAdd={addClient} onClose={() => setShowClientForm(false)} />}
      {showProductForm && <ProductForm onAdd={addProduct} onClose={() => setShowProductForm(false)} />}
      {showSaleForm && <SaleForm onAdd={addSale} onClose={() => setShowSaleForm(false)} clients={clients} defaultBusinessType={tab === "vehicles" ? "aluguel_veiculo" : undefined} />}
      {showExpenseForm && <ExpenseForm onAdd={addExpense} onClose={() => setShowExpenseForm(false)} />}
    </div>
    </HideValuesProvider>
  );
};

export default Index;
