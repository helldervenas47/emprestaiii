import { useRef } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { Download, Upload, FileDown, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loan, Payment, Client, Sale, Expense } from "@/types/loan";
import { exportLoansToCSV, exportClientsToCSV, exportSalesToCSV, importLoansFromCSV, importClientsFromCSV, importSalesFromCSV, downloadCSV } from "@/lib/csv";
import { toast } from "sonner";
import { AutoBackupCard } from "./AutoBackupCard";

interface BackupExportProps {
  loans: Loan[];
  payments: Payment[];
  clients: Client[];
  sales: Sale[];
  expenses: Expense[];
  onImportLoans: (loans: (Omit<Loan, "id"> & { totalPaid?: number })[]) => Promise<void>;
  onImportClients: (clients: Omit<Client, "id" | "createdAt">[]) => Promise<void>;
  onImportSales: (sales: Omit<Sale, "id">[]) => Promise<void>;
  onImportExpenses: (expenses: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">[]) => Promise<void>;
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

function importExpensesFromCSV(csv: string): Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    return {
      description: cols[0] || "",
      amount: parseFloat(cols[1]) || 0,
      category: cols[2] || "",
      type: (cols[3] || "fixa") as "fixa" | "recorrente",
      dueDate: cols[4] || todayInAppTz(),
      installments: parseInt(cols[7]) || undefined,
      paidInstallments: parseInt(cols[8]) || 0,
      notes: cols[9] || "",
    };
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current.trim());
  return result;
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

export function BackupExport({ loans, payments, clients, sales, expenses, onImportLoans, onImportClients, onImportSales, onImportExpenses }: BackupExportProps) {
  const loanFileRef = useRef<HTMLInputElement>(null);
  const clientFileRef = useRef<HTMLInputElement>(null);
  const saleFileRef = useRef<HTMLInputElement>(null);
  const vehicleFileRef = useRef<HTMLInputElement>(null);
  const expenseFileRef = useRef<HTMLInputElement>(null);

  const handleFileImport = (ref: React.RefObject<HTMLInputElement>) => ref.current?.click();

  const processFile = (e: React.ChangeEvent<HTMLInputElement>, handler: (csv: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const csv = evt.target?.result as string;
      try { handler(csv); } catch { toast.error("Erro ao importar CSV."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const sections = [
    {
      title: "Empréstimos",
      description: `${loans.length} registros`,
      icon: Database,
      count: loans.length,
      fileRef: loanFileRef,
      onExport: () => {
        if (loans.length === 0) return toast.error("Nenhum empréstimo para exportar");
        downloadCSV(exportLoansToCSV(loans, payments), `emprestimos_backup_${todayInAppTz()}.csv`);
        toast.success("Empréstimos exportados!");
      },
      onImportFile: (csv: string) => {
        const imported = importLoansFromCSV(csv);
        if (imported.length === 0) { toast.error("Nenhum dado encontrado no CSV."); return; }
        onImportLoans(imported).then(() => toast.success(`${imported.length} empréstimo(s) importado(s)!`));
      },
    },
    {
      title: "Clientes",
      description: `${clients.length} registros`,
      icon: Database,
      count: clients.length,
      fileRef: clientFileRef,
      onExport: () => {
        if (clients.length === 0) return toast.error("Nenhum cliente para exportar");
        downloadCSV(exportClientsToCSV(clients), `clientes_backup_${todayInAppTz()}.csv`);
        toast.success("Clientes exportados!");
      },
      onImportFile: (csv: string) => {
        const imported = importClientsFromCSV(csv);
        if (imported.length === 0) { toast.error("Nenhum dado encontrado no CSV."); return; }
        onImportClients(imported).then(() => toast.success(`${imported.length} cliente(s) importado(s)!`));
      },
    },
    {
      title: "Vendas",
      description: `${sales.filter(s => s.businessType !== "aluguel_veiculo").length} registros`,
      icon: Database,
      count: sales.filter(s => s.businessType !== "aluguel_veiculo").length,
      fileRef: saleFileRef,
      onExport: () => {
        const filtered = sales.filter(s => s.businessType !== "aluguel_veiculo");
        if (filtered.length === 0) return toast.error("Nenhuma venda para exportar");
        downloadCSV(exportSalesToCSV(filtered), `vendas_backup_${todayInAppTz()}.csv`);
        toast.success("Vendas exportadas!");
      },
      onImportFile: (csv: string) => {
        const imported = importSalesFromCSV(csv);
        if (imported.length === 0) { toast.error("Nenhum dado encontrado no CSV."); return; }
        onImportSales(imported.map(s => ({ ...s, businessType: "venda" as Sale["businessType"] }))).then(() => toast.success(`${imported.length} venda(s) importada(s)!`));
      },
    },
    {
      title: "Aluguéis de Veículos",
      description: `${sales.filter(s => s.businessType === "aluguel_veiculo").length} registros`,
      icon: Database,
      count: sales.filter(s => s.businessType === "aluguel_veiculo").length,
      fileRef: vehicleFileRef,
      onExport: () => {
        const filtered = sales.filter(s => s.businessType === "aluguel_veiculo");
        if (filtered.length === 0) return toast.error("Nenhum aluguel para exportar");
        downloadCSV(exportSalesToCSV(filtered), `veiculos_backup_${todayInAppTz()}.csv`);
        toast.success("Aluguéis exportados!");
      },
      onImportFile: (csv: string) => {
        const imported = importSalesFromCSV(csv);
        if (imported.length === 0) { toast.error("Nenhum dado encontrado no CSV."); return; }
        onImportSales(imported.map(s => ({ ...s, businessType: "aluguel_veiculo" as Sale["businessType"] }))).then(() => toast.success(`${imported.length} aluguel(éis) importado(s)!`));
      },
    },
    {
      title: "Despesas",
      description: `${expenses.length} registros`,
      icon: Database,
      count: expenses.length,
      fileRef: expenseFileRef,
      onExport: () => {
        if (expenses.length === 0) return toast.error("Nenhuma despesa para exportar");
        downloadCSV(exportExpensesToCSV(expenses), `despesas_backup_${todayInAppTz()}.csv`);
        toast.success("Despesas exportadas!");
      },
      onImportFile: (csv: string) => {
        const imported = importExpensesFromCSV(csv);
        if (imported.length === 0) { toast.error("Nenhum dado encontrado no CSV."); return; }
        onImportExpenses(imported).then(() => toast.success(`${imported.length} despesa(s) importada(s)!`));
      },
    },
    {
      title: "Pagamentos",
      description: `${payments.length} registros`,
      icon: Database,
      count: payments.length,
      fileRef: null,
      onExport: () => {
        if (payments.length === 0) return toast.error("Nenhum pagamento para exportar");
        downloadCSV(exportPaymentsToCSV(payments), `pagamentos_backup_${todayInAppTz()}.csv`);
        toast.success("Pagamentos exportados!");
      },
      onImportFile: null,
    },
  ];

  const handleExportAll = () => {
    let exported = 0;
    const date = todayInAppTz();
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
      <AutoBackupCard />

      {/* Hidden file inputs */}
      {sections.map((s) => s.fileRef && (
        <input
          key={s.title}
          type="file"
          ref={s.fileRef}
          accept=".csv"
          className="hidden"
          onChange={(e) => processFile(e, s.onImportFile!)}
        />
      ))}

      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Backup de Dados</h2>
          <p className="text-sm text-muted-foreground">Exporte ou importe seus dados cadastrados em formato CSV.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={handleExportAll} className="gap-2 flex-1 sm:flex-none">
            <FileDown className="h-4 w-4" />
            Exportar Tudo
          </Button>
        </div>
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
            <CardContent className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={s.onExport}
                disabled={s.count === 0}
              >
                <Download className="h-3.5 w-3.5" />
                Exportar
              </Button>
              {s.fileRef && s.onImportFile && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => handleFileImport(s.fileRef!)}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Importar
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
