import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { computeScenario, formatBRL } from "@/lib/loanSimulation";
import type { LoanSimulation } from "@/types/loanSimulation";
import { getPdfBranding } from "@/lib/pdfBranding";

const fmtDateBR = (iso?: string | null) => {
  if (!iso) return "-";
  const s = String(iso).split("T")[0];
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

interface Args {
  simulation: LoanSimulation;
  clientName?: string | null;
  clientPhone?: string | null;
}

export async function generateSimulationPdf({ simulation, clientName, clientPhone }: Args): Promise<void> {
  const branding = await getPdfBranding();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 15;

  // Header
  if (branding?.logoDataUrl) {
    try {
      doc.addImage(branding.logoDataUrl, "PNG", 14, y, 20, 20);
    } catch {}
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(branding?.brandName || "Simulação de Empréstimo", branding?.logoDataUrl ? 38 : 14, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Data: ${fmtDateBR(simulation.simulationDate)}`, branding?.logoDataUrl ? 38 : 14, y + 15);
  y += 28;

  // Client block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Dados do Cliente", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Cliente: ${clientName || "Não informado"}`, 14, y);
  if (clientPhone) {
    y += 5;
    doc.text(`Telefone: ${clientPhone}`, 14, y);
  }
  if (simulation.name) {
    y += 5;
    doc.text(`Simulação: ${simulation.name}`, 14, y);
  }
  y += 8;

  // Scenarios table
  const scenarios = simulation.scenarios.map(computeScenario);
  const chosen = scenarios.find((s) => s.id === simulation.chosenScenarioId);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Cenários Simulados", 14, y);
  y += 3;

  autoTable(doc, {
    startY: y + 2,
    head: [["#", "Valor", "Taxa/mês", "Parcelas", "Parcela", "Juros total", "Total"]],
    body: scenarios.map((s, i) => [
      String(i + 1) + (s.id === simulation.chosenScenarioId ? " ★" : ""),
      formatBRL(s.amount),
      `${s.monthlyRate.toFixed(2)}%`,
      String(s.installments),
      formatBRL(s.installmentValue),
      formatBRL(s.totalInterest),
      formatBRL(s.totalPayable),
    ]),
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    didParseCell: (data) => {
      if (data.section === "body" && scenarios[data.row.index]?.id === simulation.chosenScenarioId) {
        data.cell.styles.fillColor = [220, 252, 231];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Chosen scenario summary
  if (chosen) {
    if (y > pageH - 70) {
      doc.addPage();
      y = 15;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Cenário Escolhido pelo Cliente", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const lines = [
      ["Valor emprestado", formatBRL(chosen.amount)],
      ["Taxa mensal", `${chosen.monthlyRate.toFixed(2)}%`],
      ["Sistema de juros", chosen.interestModel === "simple" ? "Simples" : "Composto (Price)"],
      ["Quantidade de parcelas", String(chosen.installments)],
      ["Valor da parcela", formatBRL(chosen.installmentValue)],
      ["Juros mensal (sobre saldo inicial)", formatBRL(chosen.monthlyInterestValue)],
      ["Total de juros", formatBRL(chosen.totalInterest)],
      ["Total a pagar", formatBRL(chosen.totalPayable)],
    ];
    autoTable(doc, {
      startY: y,
      body: lines,
      theme: "plain",
      bodyStyles: { fontSize: 10 },
      columnStyles: { 0: { cellWidth: 80, fontStyle: "bold" }, 1: { cellWidth: 80 } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (simulation.notes) {
    if (y > pageH - 40) {
      doc.addPage();
      y = 15;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Observações", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const notes = doc.splitTextToSize(simulation.notes, pageW - 28);
    doc.text(notes, 14, y);
    y += notes.length * 5 + 5;
  }

  // Signature area
  if (y > pageH - 40) {
    doc.addPage();
    y = 15;
  }
  y = Math.max(y + 20, pageH - 40);
  doc.setDrawColor(150);
  doc.line(20, y, 90, y);
  doc.line(pageW - 90, y, pageW - 20, y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Cliente", 45, y + 5);
  doc.text(branding?.brandName || "Responsável", pageW - 70, y + 5);

  const fileName = `simulacao-${(clientName || "cliente").replace(/\s+/g, "_")}-${fmtDateBR(simulation.simulationDate).split("/").join("-")}.pdf`;
  doc.save(fileName);
}
