import { useRef, useState } from "react";
import { Plus, HandCoins, Users, LayoutDashboard, Download, Upload, ShoppingBag, BarChart3, AlertTriangle } from "lucide-react";
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
import { useLoans } from "@/hooks/useLoans";
import { useClients } from "@/hooks/useClients";
import { useProducts } from "@/hooks/useProducts";
import {
  exportLoansToCSV, exportClientsToCSV,
  importLoansFromCSV, importClientsFromCSV, downloadCSV,
} from "@/lib/csv";
import { toast } from "sonner";

type Tab = "overview" | "dashboard" | "clients" | "products" | "overdue";

const tabConfig = [
  { id: "overview" as Tab, label: "Dashboard", icon: BarChart3 },
  { id: "dashboard" as Tab, label: "Empréstimos", icon: LayoutDashboard },
  { id: "clients" as Tab, label: "Clientes", icon: Users },
  { id: "products" as Tab, label: "Vendas", icon: ShoppingBag },
  { id: "overdue" as Tab, label: "Inadimplentes", icon: AlertTriangle },
];

const Index = () => {
  const { loans, payments, addLoan, addPayment, addInterestOnlyPayment, updateLoan, deleteLoan, deletePayment } = useLoans();
  const { clients, addClient, deleteClient, updateClient } = useClients();
  const { products, sales, addProduct, updateProduct, deleteProduct, addSale, deleteSale } = useProducts();
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (tab === "dashboard") {
      if (loans.length === 0) return toast.error("Nenhum empréstimo para exportar");
      downloadCSV(exportLoansToCSV(loans), "emprestimos.csv");
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
    reader.onload = (evt) => {
      const csv = evt.target?.result as string;
      try {
        if (tab === "dashboard") {
          const imported = importLoansFromCSV(csv);
          if (imported.length === 0) throw new Error();
          imported.forEach((loan) => addLoan(loan));
          toast.success(`${imported.length} empréstimo(s) importado(s)!`);
        } else if (tab === "clients") {
          const imported = importClientsFromCSV(csv);
          if (imported.length === 0) throw new Error();
          imported.forEach((client) => addClient(client));
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
    else setShowProductForm(true);
  };

  const primaryLabel = tab === "dashboard" ? "Novo Empréstimo" : tab === "clients" ? "Novo Cliente" : "Novo Produto";

  return (
    <div className="min-h-screen bg-background">
      <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleFileChange} />

      <header className="border-b bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center">
              <HandCoins className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">HVCred</h1>
              <p className="text-xs text-muted-foreground">Controle de empréstimos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tab !== "products" && (
              <>
                <Button variant="outline" size="sm" onClick={handleImport}><Upload className="h-4 w-4 mr-1" />Importar</Button>
                <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Exportar</Button>
              </>
            )}
            {tab === "products" && (
              <Button variant="outline" onClick={() => setShowSaleForm(true)}>
                <ShoppingBag className="h-4 w-4 mr-1" /> Nova Venda
              </Button>
            )}
            <Button onClick={handlePrimaryAction}>
              <Plus className="h-4 w-4 mr-2" />{primaryLabel}
            </Button>
          </div>
        </div>

        <div className="container mx-auto px-4">
          <nav className="flex gap-1 -mb-px">
            {tabConfig.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" />{t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {tab === "overview" && (
          <DashboardOverview loans={loans} sales={sales} payments={payments} onDeletePayment={deletePayment} onDeleteSale={deleteSale} onDeleteLoan={deleteLoan} />
        )}
        {tab === "dashboard" && (
          <>
            <DashboardCards loans={loans} />
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Empréstimos</h2>
              <LoanList loans={loans} onPayment={addPayment} onInterestPayment={addInterestOnlyPayment} onUpdate={updateLoan} onDelete={deleteLoan} />
            </div>
          </>
        )}
        {tab === "clients" && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Clientes ({clients.length})</h2>
            <ClientList clients={clients} onDelete={deleteClient} onUpdate={updateClient} />
          </div>
        )}
        {tab === "overdue" && (
          <OverdueLoans loans={loans} clients={clients} />
        )}
        {tab === "products" && (
          <ProductSalesView
            products={products}
            sales={sales}
            onDeleteProduct={deleteProduct}
            onUpdateProduct={updateProduct}
            onDeleteSale={deleteSale}
          />
        )}
      </main>

      {showLoanForm && <LoanForm onAdd={addLoan} onClose={() => setShowLoanForm(false)} />}
      {showClientForm && <ClientForm onAdd={addClient} onClose={() => setShowClientForm(false)} />}
      {showProductForm && <ProductForm onAdd={addProduct} onClose={() => setShowProductForm(false)} />}
      {showSaleForm && <SaleForm products={products} onAdd={addSale} onClose={() => setShowSaleForm(false)} />}
    </div>
  );
};

export default Index;
