import { Loan, Payment } from "@/types/loan";
import { Client } from "@/types/loan";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";

export function exportLoansToCSV(loans: Loan[], payments: Payment[]): string {
  const headers = ["Cliente", "Valor Principal", "Taxa de Juros", "Tipo Juros", "Tipo Pagamento", "Parcelas", "Total Pago", "Saldo Restante", "Status", "Data Início", "Vencimento", "Criado em"];
  const rows = loans.map((l) => {
    const totalWithInterest = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
    const loanPayments = payments.filter((p) => p.loanId === l.id);
    const totalPaid = loanPayments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, totalWithInterest - totalPaid);
    return [
      l.borrowerName,
      l.amount.toFixed(2),
      l.interestRate.toString(),
      l.interestType || "Mensal",
      l.paymentType || "Parcelado",
      l.installments.toString(),
      totalPaid.toFixed(2),
      remaining.toFixed(2),
      l.status,
      l.startDate,
      l.dueDate,
      l.createdAt || "",
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

export function importLoansFromCSV(csv: string): Omit<Loan, "id" | "status" | "paidInstallments">[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    return {
      borrowerName: cols[0] || "",
      amount: parseFloat(cols[1]) || 0,
      interestRate: parseFloat(cols[2]) || 0,
      interestType: cols[3] || "Mensal",
      paymentType: cols[4] || "Parcelado",
      installments: parseInt(cols[5]) || 1,
      // cols[6] = Total Pago (computed, skip)
      // cols[7] = Saldo Restante (computed, skip)
      // cols[8] = Status (set by system)
      startDate: cols[9] || new Date().toISOString().split("T")[0],
      dueDate: cols[10] || "",
      createdAt: cols[11] || new Date().toISOString(),
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
