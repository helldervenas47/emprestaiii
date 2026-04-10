import { Loan, Payment } from "@/types/loan";
import { Client } from "@/types/loan";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return dateStr;
}

export function exportLoansToCSV(loans: Loan[], payments: Payment[]): string {
  const headers = ["Cliente", "Valor Principal", "Taxa de Juros", "Tipo Juros", "Tipo Pagamento", "Parcelas", "Total Pago", "Saldo Restante", "Status", "Data Início", "Vencimento", "Criado em"];
  const rows = loans.map((l) => {
    const totalWithInterest = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
    const loanPayments = payments.filter((p) => p.loanId === l.id);
    const totalPaid = loanPayments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, totalWithInterest - totalPaid);
    const statusLabel = l.status === "paid" ? "Pago" : "Pendente";
    return [
      l.borrowerName,
      l.amount.toFixed(2),
      l.interestRate.toString(),
      l.interestType || "Mensal",
      l.paymentType || "Parcelado",
      l.installments.toString(),
      totalPaid.toFixed(2),
      remaining.toFixed(2),
      statusLabel,
      formatDateBR(l.startDate),
      formatDateBR(l.dueDate),
      formatDateBR(l.createdAt || ""),
    ];
  });
  return [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function exportClientsToCSV(clients: Client[]): string {
  const headers = ["Nome", "Telefone", "Email", "CPF", "CNPJ", "RG", "Endereço", "Cidade", "Estado", "Score", "Ativo", "Cadastrado em"];
  const rows = clients.map((c) => [
    c.name,
    c.phone,
    c.email,
    c.cpf,
    c.cnpj || "",
    c.rg || "",
    c.address,
    c.city || "",
    c.state || "",
    c.score || "",
    c.active ? "Sim" : "Não",
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

function parseDateBR(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  // Handle DD/MM/YYYY
  const brMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return new Date().toISOString().split("T")[0];
}

export function importLoansFromCSV(csv: string): Omit<Loan, "id">[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const statusRaw = (cols[8] || "").toLowerCase();
    const isPaid = statusRaw === "pago" || statusRaw === "paid";
    const installments = parseInt(cols[5]) || 1;
    // Add 1 day to the due date from CSV
    const parsedDueDate = parseDateBR(cols[10]);
    const dueDateObj = new Date(parsedDueDate + "T00:00:00");
    dueDateObj.setDate(dueDateObj.getDate() + 1);
    const adjustedDueDate = dueDateObj.toISOString().split("T")[0];

    return {
      borrowerName: cols[0] || "",
      amount: parseFloat(cols[1]) || 0,
      interestRate: parseFloat(cols[2]) || 0,
      interestType: cols[3] || "Mensal",
      paymentType: cols[4] || "Parcelado",
      installments,
      status: isPaid ? "paid" as const : "active" as const,
      paidInstallments: isPaid ? installments : 0,
      startDate: parseDateBR(cols[9]),
      dueDate: adjustedDueDate,
      createdAt: cols[11] ? parseDateBR(cols[11]) : new Date().toISOString(),
      notes: "",
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
      phone: cols[1] || "",
      email: cols[2] || "",
      cpf: cols[3] || "",
      cnpj: cols[4] || "",
      rg: cols[5] || "",
      address: cols[6] || "",
      city: cols[7] || "",
      state: cols[8] || "",
      score: cols[9] || "",
      active: (cols[10] || "Sim").toLowerCase() !== "não",
      notes: "",
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
