import { useRef, useState } from "react";
import { Plus, HandCoins, Users, LayoutDashboard, Download, Upload, ShoppingBag, BarChart3, AlertTriangle, Receipt, CalendarDays, Sun, Moon, LogOut, Info, X } from "lucide-react";
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
  exportLoansToCSV, exportClientsToCSV,
  importLoansFromCSV, importClientsFromCSV, downloadCSV,
} from "@/lib/csv";
import { toast } from "sonner";

type Tab = "overview" | "dashboard" | "clients" | "products" | "overdue" | "expenses" | "calendar";

const tabConfig = [
  { id: "overview" as Tab, label: "Dashboard", icon: BarChart3 },
  { id: "dashboard" as Tab, label: "Empréstimos", icon: LayoutDashboard },
  { id: "calendar" as Tab, label: "Cobrança", icon: CalendarDays },
  { id: "clients" as Tab, label: "Clientes", icon: Users },
  { id: "products" as Tab, label: "Vendas", icon: ShoppingBag },
  { id: "expenses" as Tab, label: "Despesas", icon: Receipt },
  { id: "overdue" as Tab, label: "Inadimplentes", icon: AlertTriangle },
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
      "Registre vendas avulsas, streaming ou aluguel de veículos.",
      "Escolha entre pagamento fixo (único) ou recorrente (parcelado).",
      "Para vendas recorrentes, defina a frequência: Semanal, Quinzenal ou Mensal.",
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
};

const Index = () => {
  const { signOut } = useAuth();
  const { loans, payments, addLoan, addPayment, addPartialPayment, addInterestOnlyPayment, updateLoan, deleteLoan, deletePayment } = useLoans();
  const { clients, addClient, deleteClient, updateClient } = useClients();
  const { products, sales, addProduct, updateProduct, deleteProduct, addSale, deleteSale } = useProducts();
  const { expenses, addExpense, payExpense, deleteExpense } = useExpenses();
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
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
    else if (tab === "products") setShowSaleForm(true);
  };

  const primaryLabel =
    tab === "dashboard" ? "Novo Empréstimo" :
    tab === "clients" ? "Novo Cliente" :
    tab === "expenses" ? "Nova Despesa" :
    tab === "products" ? "Novo Lançamento" : "";

  return (
    <div className="min-h-screen bg-background">
      <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleFileChange} />

      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg gradient-primary glow-primary flex items-center justify-center">
              <HandCoins className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">HVCred</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Controle de empréstimos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" title="Ajuda">
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
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
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9" title={dark ? "Modo claro" : "Modo escuro"}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} className="h-9 w-9" title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
            {(tab === "dashboard" || tab === "clients") && (
              <>
                <Button variant="outline" size="sm" onClick={handleImport}><Upload className="h-4 w-4 mr-1" />Importar</Button>
                <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Exportar</Button>
              </>
            )}
            {/* Removed separate Nova Venda button - now handled by primary action */}
            {tab !== "overview" && tab !== "overdue" && tab !== "calendar" && (
              <Button onClick={handlePrimaryAction}>
                <Plus className="h-4 w-4 mr-2" />{primaryLabel}
              </Button>
            )}
          </div>
        </div>

        <div className="container mx-auto px-4">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {tabConfig.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap uppercase tracking-wide ${
                  tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />{t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {tab === "overview" && (
          <DashboardOverview loans={loans} sales={sales} payments={payments} expenses={expenses} onDeletePayment={deletePayment} onDeleteSale={deleteSale} onDeleteLoan={deleteLoan} />
        )}
        {tab === "dashboard" && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Empréstimos</h2>
              <LoanList loans={loans} payments={payments} onPayment={addPayment} onPartialPayment={addPartialPayment} onInterestPayment={addInterestOnlyPayment} onUpdate={updateLoan} onDelete={deleteLoan} />
            </div>
          </>
        )}
        {tab === "clients" && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Clientes ({clients.length})</h2>
            <ClientList clients={clients} loans={loans} payments={payments} onDelete={deleteClient} onUpdate={updateClient} />
          </div>
        )}
        {tab === "expenses" && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Despesas ({expenses.length})</h2>
            <ExpenseList expenses={expenses} onPay={payExpense} onDelete={deleteExpense} />
          </div>
        )}
        {tab === "overdue" && (
          <OverdueLoans loans={loans} clients={clients} />
        )}
        {tab === "calendar" && (
          <BillingCalendar loans={loans} payments={payments} />
        )}
        {tab === "products" && (
          <ProductSalesView
            sales={sales}
            onDeleteSale={deleteSale}
          />
        )}
      </main>

      {showLoanForm && <LoanForm onAdd={addLoan} onClose={() => setShowLoanForm(false)} clients={clients} />}
      {showClientForm && <ClientForm onAdd={addClient} onClose={() => setShowClientForm(false)} />}
      {showProductForm && <ProductForm onAdd={addProduct} onClose={() => setShowProductForm(false)} />}
      {showSaleForm && <SaleForm onAdd={addSale} onClose={() => setShowSaleForm(false)} />}
      {showExpenseForm && <ExpenseForm onAdd={addExpense} onClose={() => setShowExpenseForm(false)} />}
    </div>
  );
};

export default Index;
