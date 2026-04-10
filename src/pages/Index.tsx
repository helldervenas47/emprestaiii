import { useState } from "react";
import { Plus, HandCoins, Users, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCards } from "@/components/DashboardCards";
import { LoanForm } from "@/components/LoanForm";
import { LoanList } from "@/components/LoanList";
import { ClientForm } from "@/components/ClientForm";
import { ClientList } from "@/components/ClientList";
import { useLoans } from "@/hooks/useLoans";
import { useClients } from "@/hooks/useClients";

type Tab = "dashboard" | "clients";

const Index = () => {
  const { loans, addLoan, addPayment, deleteLoan } = useLoans();
  const { clients, addClient, deleteClient } = useClients();
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center">
              <HandCoins className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">EmprestimoFácil</h1>
              <p className="text-xs text-muted-foreground">Controle de empréstimos</p>
            </div>
          </div>
          <Button onClick={() => (tab === "clients" ? setShowClientForm(true) : setShowLoanForm(true))}>
            <Plus className="h-4 w-4 mr-2" />
            {tab === "clients" ? "Novo Cliente" : "Novo Empréstimo"}
          </Button>
        </div>

        <div className="container mx-auto px-4">
          <nav className="flex gap-1 -mb-px">
            <button
              onClick={() => setTab("dashboard")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "dashboard"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              Empréstimos
            </button>
            <button
              onClick={() => setTab("clients")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "clients"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-4 w-4" />
              Clientes
            </button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {tab === "dashboard" ? (
          <>
            <DashboardCards loans={loans} />
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Empréstimos</h2>
              <LoanList loans={loans} onPayment={addPayment} onDelete={deleteLoan} />
            </div>
          </>
        ) : (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Clientes ({clients.length})
            </h2>
            <ClientList clients={clients} onDelete={deleteClient} />
          </div>
        )}
      </main>

      {showLoanForm && <LoanForm onAdd={addLoan} onClose={() => setShowLoanForm(false)} />}
      {showClientForm && <ClientForm onAdd={addClient} onClose={() => setShowClientForm(false)} />}
    </div>
  );
};

export default Index;
