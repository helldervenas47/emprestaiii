import { Download, FileDown, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loan, Payment, Client, Sale, Expense } from "@/types/loan";
import { exportLoansToCSV, exportClientsToCSV, exportSalesToCSV, downloadCSV } from "@/lib/csv";
import { toast } from "sonner";

interface BackupExportProps {
  loans: Loan[];
  payments: Payment[];
  clients: Client[];
  sales: Sale[];
  expenses: Expense[];
}

function exportExpensesToCSV(expenses: Expense[]): string {
  const headers = ["Descrição", "Valor", "Categoria", "Tipo", "Vencimento", "Pago", "Data Pagamento", "Parcelas", "Parcelas Pagas", "Observações"];
  const rows = expenses.map((e) => [
    e.description,
    e.amount.toFixed(2),
    e.category || "",
    e.type || "",
    e.dueDate || "",
    e.paid ? "Sim" : "Não",
    e.paidDate || "",
    (e.installments || "").toString(),
    (e.paidInstallments || "").toString(),
    e.notes || "",
  ]);
  return [headers, ...rows].map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function exportPaymentsToCSV(payments: Payment[]): string {
  const headers = ["ID Empréstimo", "Valor", "Data", "Nº Parcela", "Data Vencimento Anterior"];
  const rows = payments.map((p) => [
    p.loanId,
    p.amount.toFixed(2),
    p.date,
    p.installmentNumber?.toString() || "",
    p.previousDueDate || "",
  ]);
  return [headers, ...rows].map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function BackupExport({ loans, payments, clients, sales, expenses }: BackupExportProps) {
  const sections = [
    {
      title: "Empréstimos",
      description: `${loans.length} registros`,
      icon: Database,
      count: loans.length,
      onExport: () => {
        if (loans.length === 0) return toast.error("Nenhum empréstimo para exportar");
        downloadCSV(exportLoansToCSV(loans, payments), `emprestimos_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Empréstimos exportados!");
      },
    },
    {
      title: "Pagamentos",
      description: `${payments.length} registros`,
      icon: Database,
      count: payments.length,
      onExport: () => {
        if (payments.length === 0) return toast.error("Nenhum pagamento para exportar");
        downloadCSV(exportPaymentsToCSV(payments), `pagamentos_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Pagamentos exportados!");
      },
    },
    {
      title: "Clientes",
      description: `${clients.length} registros`,
      icon: Database,
      count: clients.length,
      onExport: () => {
        if (clients.length === 0) return toast.error("Nenhum cliente para exportar");
        downloadCSV(exportClientsToCSV(clients), `clientes_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Clientes exportados!");
      },
    },
    {
      title: "Vendas",
      description: `${sales.filter(s => s.businessType !== "aluguel_veiculo").length} registros`,
      icon: Database,
      count: sales.filter(s => s.businessType !== "aluguel_veiculo").length,
      onExport: () => {
        const filtered = sales.filter(s => s.businessType !== "aluguel_veiculo");
        if (filtered.length === 0) return toast.error("Nenhuma venda para exportar");
        downloadCSV(exportSalesToCSV(filtered), `vendas_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Vendas exportadas!");
      },
    },
    {
      title: "Aluguéis de Veículos",
      description: `${sales.filter(s => s.businessType === "aluguel_veiculo").length} registros`,
      icon: Database,
      count: sales.filter(s => s.businessType === "aluguel_veiculo").length,
      onExport: () => {
        const filtered = sales.filter(s => s.businessType === "aluguel_veiculo");
        if (filtered.length === 0) return toast.error("Nenhum aluguel para exportar");
        downloadCSV(exportSalesToCSV(filtered), `veiculos_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Aluguéis exportados!");
      },
    },
    {
      title: "Despesas",
      description: `${expenses.length} registros`,
      icon: Database,
      count: expenses.length,
      onExport: () => {
        if (expenses.length === 0) return toast.error("Nenhuma despesa para exportar");
        downloadCSV(exportExpensesToCSV(expenses), `despesas_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Despesas exportadas!");
      },
    },
  ];

  const handleExportAll = () => {
    let exported = 0;
    const date = new Date().toISOString().split("T")[0];
    if (loans.length > 0) { downloadCSV(exportLoansToCSV(loans, payments), `emprestimos_backup_${date}.csv`); exported++; }
    if (payments.length > 0) { downloadCSV(exportPaymentsToCSV(payments), `pagamentos_backup_${date}.csv`); exported++; }
    if (clients.length > 0) { downloadCSV(exportClientsToCSV(clients), `clientes_backup_${date}.csv`); exported++; }
    const vendasFiltered = sales.filter(s => s.businessType !== "aluguel_veiculo");
    if (vendasFiltered.length > 0) { downloadCSV(exportSalesToCSV(vendasFiltered), `vendas_backup_${date}.csv`); exported++; }
    const veiculosFiltered = sales.filter(s => s.businessType === "aluguel_veiculo");
    if (veiculosFiltered.length > 0) { downloadCSV(exportSalesToCSV(veiculosFiltered), `veiculos_backup_${date}.csv`); exported++; }
    if (expenses.length > 0) { downloadCSV(exportExpensesToCSV(expenses), `despesas_backup_${date}.csv`); exported++; }
    if (exported === 0) {
      toast.error("Nenhum dado para exportar");
    } else {
      toast.success(`${exported} arquivo(s) exportado(s) com sucesso!`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Backup de Dados</h2>
          <p className="text-sm text-muted-foreground">Exporte todos os seus dados cadastrados em formato CSV.</p>
        </div>
        <Button onClick={handleExportAll} className="gap-2">
          <FileDown className="h-4 w-4" />
          Exportar Tudo
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Card key={s.title} className="border-border/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm">{s.title}</CardTitle>
                  <CardDescription className="text-xs">{s.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={s.onExport}
                disabled={s.count === 0}
              >
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
