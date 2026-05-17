import { jsPDF } from "jspdf";
import type { Employee, Payroll } from "@/types/salary";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function generatePayslipPdf(payroll: Payroll, employee: Employee, opts?: { brandName?: string; logoUrl?: string | null }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  // Header
  doc.setFillColor(20, 30, 60);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(opts?.brandName ?? "Contracheque", margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Competência: ${payroll.competence}`, margin, 19);
  doc.text(`Emissão: ${new Date().toLocaleDateString("pt-BR")}`, margin, 24);

  y = 38;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Dados do Funcionário", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Nome: ${employee.name}`, margin, y); y += 5;
  if (employee.cpf) { doc.text(`CPF: ${employee.cpf}`, margin, y); y += 5; }
  if (employee.role) { doc.text(`Cargo: ${employee.role}`, margin, y); y += 5; }
  if (employee.registration) { doc.text(`Matrícula: ${employee.registration}`, margin, y); y += 5; }
  if (employee.bank) { doc.text(`Banco: ${employee.bank} ${employee.agency ?? ""} ${employee.account ?? ""}`, margin, y); y += 5; }

  y += 4;
  // Table header
  doc.setFillColor(240, 240, 245);
  doc.rect(margin, y, pageW - margin * 2, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.text("Descrição", margin + 2, y + 5.5);
  doc.text("Proventos", pageW - margin - 60, y + 5.5);
  doc.text("Descontos", pageW - margin - 25, y + 5.5);
  y += 11;

  doc.setFont("helvetica", "normal");
  const rows: { label: string; earn?: number; ded?: number }[] = [
    ...payroll.items.earnings.map((e) => ({ label: e.label, earn: e.amount })),
    ...payroll.items.deductions.map((d) => ({ label: d.label, ded: d.amount })),
  ];
  rows.forEach((r) => {
    doc.text(r.label, margin + 2, y);
    if (r.earn != null) doc.text(BRL(r.earn), pageW - margin - 60, y);
    if (r.ded != null) doc.text(BRL(r.ded), pageW - margin - 25, y);
    y += 6;
  });

  y += 4;
  doc.setDrawColor(180);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text(`Salário Bruto: ${BRL(payroll.grossSalary + payroll.totalBenefits)}`, margin, y); y += 6;
  doc.text(`Descontos: ${BRL(payroll.totalDeductions)}`, margin, y); y += 6;
  doc.setFontSize(13);
  doc.setTextColor(16, 120, 60);
  doc.text(`Líquido: ${BRL(payroll.netSalary)}`, margin, y);

  y += 18;
  doc.setTextColor(120);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Documento gerado automaticamente — ${(opts?.brandName ?? "Sistema")} — Autenticador: ${payroll.id.slice(0, 8).toUpperCase()}`, margin, 285);

  doc.save(`contracheque-${employee.name.replace(/\s+/g, "_")}-${payroll.competence}.pdf`);
}
