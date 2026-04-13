import { useRef } from "react";
import { Download, Upload, FileDown, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loan, Payment, Client, Sale, Expense } from "@/types/loan";
import {
  exportLoansToCSV, exportClientsToCSV, exportSalesToCSV, downloadCSV,
  importLoansFromCSV, importClientsFromCSV, importSalesFromCSV,
} from "@/lib/csv";
import { toast } from "sonner";

interface BackupExportProps {
  loans: Loan[];
  payments: Payment[];
  clients: Client[];
  sales: Sale[];
  expenses: Expense[];
  onImportLoans: (csv: string) => Promise<void>;
  onImportClients: (csv: string) => Promise<void>;
  onImportSales: (csv: string, businessType?: string) => Promise<void>;
  onImportExpenses: (csv: string) => Promise<void>;
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

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { result.push(current.trim()); current = ""; }
      else current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function importExpensesFromCSV(csv: string): Omit<Expense, "id" | "createdAt">[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    return {
      description: cols[0] || "",
      amount: parseFloat(cols[1]) || 0,
      category: cols[2] || "",
      type: cols[3] || "fixa",
      dueDate: cols[4] || new Date().toISOString().split("T")[0],
      paid: (cols[5] || "").toLowerCase() === "sim",
      paidDate: cols[6] || null,
      installments: parseInt(cols[7]) || null,
      paidInstallments: parseInt(cols[8]) || 0,
      notes: cols[9] || "",
    };
  });
}

export function BackupExport({ loans, payments, clients, sales, expenses, onImportLoans, onImportClients, onImportSales, onImportExpenses }: BackupExportProps) {
  const fileInputRefs = {
    emprestimos: useRef<HTMLInputElement>(null),
    clientes: useRef<HTMLInputElement>(null),
    vendas: useRef<HTMLInputElement>(null),
    veiculos: useRef<HTMLInputElement>(null),
    despesas: useRef<HTMLInputElement>(null),
  };

  const handleFileImport = (key: string, ref: React.RefObject<HTMLInputElement | null>) => {
    const file = ref.current?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const csv = evt.target?.result as string;
      try {
        if (key === "emprestimos") {
          await onImportLoans(csv);
        } else if (key === "clientes") {
          await onImportClients(csv);
        } else if (key === "vendas") {
          await onImportSales(csv);
        } else if (key === "veiculos") {
          await onImportSales(csv, "aluguel_veiculo");
        } else if (key === "despesas") {
          await onImportExpenses(csv);
        }
      } catch {
        toast.error("Erro ao importar CSV.");
      }
    };
    reader.readAsText(file);
    if (ref.current) ref.current.value = "";
  };

  const sections = [
    {
      key: "emprestimos",
      title: "Empréstimos",
      description: `${loans.length} registros`,
      icon: Database,
      count: loans.length,
      ref: fileInputRefs.emprestimos,
      onExport: () => {
        if (loans.length === 0) return toast.error("Nenhum empréstimo para exportar");
        downloadCSV(exportLoansToCSV(loans, payments), `emprestimos_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Empréstimos exportados!");
      },
    },
    {
      key: "pagamentos",
      title: "Pagamentos",
      description: `${payments.length} registros`,
      icon: Database,
      count: payments.length,
      ref: null,
      onExport: () => {
        if (payments.length === 0) return toast.error("Nenhum pagamento para exportar");
        downloadCSV(exportPaymentsToCSV(payments), `pagamentos_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Pagamentos exportados!");
      },
    },
    {
      key: "clientes",
      title: "Clientes",
      description: `${clients.length} registros`,
      icon: Database,
      count: clients.length,
      ref: fileInputRefs.clientes,
      onExport: () => {
        if (clients.length === 0) return toast.error("Nenhum cliente para exportar");
        downloadCSV(exportClientsToCSV(clients), `clientes_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Clientes exportados!");
      },
    },
    {
      key: "vendas",
      title: "Vendas",
      description: `${sales.filter(s => s.businessType !== "aluguel_veiculo").length} registros`,
      icon: Database,
      count: sales.filter(s => s.businessType !== "aluguel_veiculo").length,
      ref: fileInputRefs.vendas,
      onExport: () => {
        const filtered = sales.filter(s => s.businessType !== "aluguel_veiculo");
        if (filtered.length === 0) return toast.error("Nenhuma venda para exportar");
        downloadCSV(exportSalesToCSV(filtered), `vendas_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Vendas exportadas!");
      },
    },
    {
      key: "veiculos",
      title: "Aluguéis de Veículos",
      description: `${sales.filter(s => s.businessType === "aluguel_veiculo").length} registros`,
      icon: Database,
      count: sales.filter(s => s.businessType === "aluguel_veiculo").length,
      ref: fileInputRefs.veiculos,
      onExport: () => {
        const filtered = sales.filter(s => s.businessType === "aluguel_veiculo");
        if (filtered.length === 0) return toast.error("Nenhum aluguel para exportar");
        downloadCSV(exportSalesToCSV(filtered), `veiculos_backup_${new Date().toISOString().split("T")[0]}.csv`);
        toast.success("Aluguéis exportados!");
      },
    },
    {
      key: "despesas",
      title: "Despesas",
      description: `${expenses.length} registros`,
      icon: Database,
      count: expenses.length,
      ref: fileInputRefs.despesas,
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
          <p className="text-sm text-muted-foreground">Exporte ou importe seus dados cadastrados em formato CSV.</p>
        </div>
        <Button onClick={handleExportAll} className="gap-2">
          <FileDown className="h-4 w-4" />
          Exportar Tudo
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Card key={s.key} className="border-border/30">
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
            <CardContent className="space-y-2">
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
              {s.ref && (
                <>
                  <input
                    type="file"
                    accept=".csv"
                    ref={s.ref}
                    className="hidden"
                    onChange={() => handleFileImport(s.key, s.ref!)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => s.ref!.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Importar CSV
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
