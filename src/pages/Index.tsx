import { useState } from "react";
import { Plus, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCards } from "@/components/DashboardCards";
import { LoanForm } from "@/components/LoanForm";
import { LoanList } from "@/components/LoanList";
import { useLoans } from "@/hooks/useLoans";

const Index = () => {
  const { loans, addLoan, addPayment, deleteLoan } = useLoans();
  const [showForm, setShowForm] = useState(false);

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
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Empréstimo
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <DashboardCards loans={loans} />
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Empréstimos</h2>
          <LoanList loans={loans} onPayment={addPayment} onDelete={deleteLoan} />
        </div>
      </main>

      {showForm && <LoanForm onAdd={addLoan} onClose={() => setShowForm(false)} />}
    </div>
  );
};

export default Index;
