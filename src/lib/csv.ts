import { Loan } from "@/types/loan";
import { Client } from "@/types/loan";

export function exportLoansToCSV(loans: Loan[]): string {
  const headers = ["Nome Devedor", "Valor", "Juros Mensal (%)", "Parcelas", "Parcelas Pagas", "Data Início", "Data Fim", "Status", "Observações"];
  const rows = loans.map((l) => [
    l.borrowerName,
    l.amount.toFixed(2),
    l.interestRate.toString(),
    l.installments.toString(),
    l.paidInstallments.toString(),
    l.startDate,
    l.dueDate,
    l.status,
    l.notes || "",
  ]);
  return [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function exportClientsToCSV(clients: Client[]): string {
  const headers = ["Nome", "CPF", "Telefone", "E-mail", "Endereço", "Observações", "Data Cadastro"];
  const rows = clients.map((c) => [
    c.name,
    c.cpf,
    c.phone,
    c.email,
    c.address,
    c.notes || "",
    c.createdAt,
  ]);
  return [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

export function importLoansFromCSV(csv: string): Omit<Loan, "id">[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    return {
      borrowerName: cols[0] || "",
      amount: parseFloat(cols[1]) || 0,
      interestRate: parseFloat(cols[2]) || 0,
      installments: parseInt(cols[3]) || 1,
      paidInstallments: parseInt(cols[4]) || 0,
      startDate: cols[5] || new Date().toISOString().split("T")[0],
      dueDate: cols[6] || "",
      status: (cols[7] as Loan["status"]) || "active",
      notes: cols[8] || "",
    };
  });
}

export function importClientsFromCSV(csv: string): Omit<Client, "id" | "createdAt">[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    return {
      name: cols[0] || "",
      cpf: cols[1] || "",
      phone: cols[2] || "",
      email: cols[3] || "",
      address: cols[4] || "",
      notes: cols[5] || "",
    };
  });
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
