import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TrendingUp, TrendingDown, Receipt, Wallet, FileBarChart, Sparkles, Download, DollarSign } from "lucide-react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { getPdfBranding } from "@/lib/pdfBranding";

interface AccountantReportProps {
  loans: any[];
  payments: any[];
  sales: any[];
  expenses: any[];
}

const TAX_CATEGORIES = ["impostos", "imposto", "tributos", "tributo", "taxa", "taxas", "iss", "irpf", "irpj", "icms", "das", "mei", "simples"];

function fmt(n: number, hidden: boolean) {
  if (hidden) return "R$ ••••";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getMonthKey(dateStr: string): string {
  return (dateStr || "").slice(0, 7);
}

function getYearKey(dateStr: string): string {
  return (dateStr || "").slice(0, 4);
}

export function AccountantReport({ loans, payments, sales, expenses }: AccountantReportProps) {
  const { hidden } = useHideValues();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentYear = String(now.getFullYear());

  const [period, setPeriod] = useState<"month" | "year">("month");
  const [monthFilter, setMonthFilter] = useState(currentMonth);
  const [yearFilter, setYearFilter] = useState(currentYear);

  // Available months/years from data
  const { months, years } = useMemo(() => {
    const ms = new Set<string>();
    const ys = new Set<string>();
    [...payments.map((p) => p.date), ...sales.map((s) => s.sale_date), ...expenses.map((e) => e.due_date)]
      .filter(Boolean)
      .forEach((d) => {
        ms.add(getMonthKey(d));
        ys.add(getYearKey(d));
      });
    ms.add(currentMonth);
    ys.add(currentYear);
    return {
      months: Array.from(ms).sort().reverse(),
      years: Array.from(ys).sort().reverse(),
    };
  }, [payments, sales, expenses, currentMonth, currentYear]);

  const matchPeriod = (dateStr: string) => {
    if (!dateStr) return false;
    return period === "month" ? getMonthKey(dateStr) === monthFilter : getYearKey(dateStr) === yearFilter;
  };

  // ===== DRE =====
  const dre = useMemo(() => {
    const periodPayments = payments.filter((p) => matchPeriod(p.date));
    const periodSales = sales.filter((s) => matchPeriod(s.sale_date));
    const periodExpenses = expenses.filter((e) => e.paid && matchPeriod(e.paid_date || e.due_date));

    // Receita de juros = pagamentos - principal proporcional
    let totalReceived = 0;
    let interestRevenue = 0;
    periodPayments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      totalReceived += amt;
      const loan = loans.find((l) => l.id === p.loan_id);
      if (loan) {
        const principalPerInstall = Number(loan.amount) / Math.max(1, Number(loan.installments) || 1);
        interestRevenue += Math.max(0, amt - principalPerInstall);
      }
    });

    const salesRevenue = periodSales.reduce((s, x) => s + (Number(x.total) || 0), 0);

    const totalRevenue = interestRevenue + salesRevenue;
    const totalExpenses = periodExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);

    const businessExp = periodExpenses.filter((e) => e.scope !== "personal").reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const personalExp = periodExpenses.filter((e) => e.scope === "personal").reduce((s, x) => s + (Number(x.amount) || 0), 0);

    return {
      interestRevenue,
      salesRevenue,
      totalRevenue,
      businessExp,
      personalExp,
      totalExpenses,
      netProfit: totalRevenue - businessExp,
      principalReceived: totalReceived - interestRevenue,
    };
  }, [payments, sales, expenses, loans, period, monthFilter, yearFilter]);

  // ===== Impostos =====
  const taxes = useMemo(() => {
    const isTax = (cat: string) => {
      const c = (cat || "").toLowerCase();
      return TAX_CATEGORIES.some((t) => c.includes(t));
    };
    const periodTaxes = expenses.filter((e) => isTax(e.category) && matchPeriod(e.due_date));
    const paid = periodTaxes.filter((e) => e.paid).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const pending = periodTaxes.filter((e) => !e.paid).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return { items: periodTaxes, paid, pending, total: paid + pending };
  }, [expenses, period, monthFilter, yearFilter]);

  // ===== Simulação de Impostos =====
  const [taxRegime, setTaxRegime] = useState<"simples" | "presumido" | "irpf">("simples");

  const taxSim = useMemo(() => {
    const base = dre.interestRevenue; // base = juros recebidos no período
    const isYear = period === "year";

    // --- Simples Nacional - Anexo III (Serviços) ---
    // Faixas RBT12 (receita bruta dos últimos 12 meses) - usamos base anualizada como proxy.
    const rbt12 = isYear ? base : base * 12;
    const simplesFaixas = [
      { ate: 180000, aliq: 0.06, ded: 0 },
      { ate: 360000, aliq: 0.112, ded: 9360 },
      { ate: 720000, aliq: 0.135, ded: 17640 },
      { ate: 1800000, aliq: 0.16, ded: 35640 },
      { ate: 3600000, aliq: 0.21, ded: 125640 },
      { ate: 4800000, aliq: 0.33, ded: 648000 },
    ];
    const faixa = simplesFaixas.find((f) => rbt12 <= f.ate) || simplesFaixas[simplesFaixas.length - 1];
    const aliqEfetivaSimples = rbt12 > 0 ? Math.max(0, (rbt12 * faixa.aliq - faixa.ded) / rbt12) : faixa.aliq;
    const simplesTotal = base * aliqEfetivaSimples;

    // --- Lucro Presumido (Serviços - presunção 32%) ---
    const baseIRCSLL = base * 0.32;
    const irpj = baseIRCSLL * 0.15;
    // adicional 10% sobre o que exceder R$ 20.000/mês (R$ 60.000 no trimestre, simplificado mensal)
    const limiteAdicional = isYear ? 240000 : 20000;
    const irpjAdicional = baseIRCSLL > limiteAdicional ? (baseIRCSLL - limiteAdicional) * 0.10 : 0;
    const csll = baseIRCSLL * 0.09;
    const pis = base * 0.0065;
    const cofins = base * 0.03;
    const iss = base * 0.05; // alíquota máxima de ISS para serviços financeiros (varia por município)
    const presumidoTotal = irpj + irpjAdicional + csll + pis + cofins + iss;

    // --- IRPF Pessoa Física (Tabela mensal 2024) ---
    const baseMensal = isYear ? base / 12 : base;
    let aliqIRPF = 0;
    let dedIRPF = 0;
    if (baseMensal <= 2259.20) { aliqIRPF = 0; dedIRPF = 0; }
    else if (baseMensal <= 2826.65) { aliqIRPF = 0.075; dedIRPF = 169.44; }
    else if (baseMensal <= 3751.05) { aliqIRPF = 0.15; dedIRPF = 381.44; }
    else if (baseMensal <= 4664.68) { aliqIRPF = 0.225; dedIRPF = 662.77; }
    else { aliqIRPF = 0.275; dedIRPF = 896.00; }
    const irpfMes = Math.max(0, baseMensal * aliqIRPF - dedIRPF);
    const irpfTotal = isYear ? irpfMes * 12 : irpfMes;

    return {
      base,
      rbt12,
      simples: {
        aliquotaEfetiva: aliqEfetivaSimples,
        faixa: simplesFaixas.indexOf(faixa) + 1,
        total: simplesTotal,
        liquido: base - simplesTotal,
      },
      presumido: {
        baseCalculo: baseIRCSLL,
        irpj,
        irpjAdicional,
        csll,
        pis,
        cofins,
        iss,
        total: presumidoTotal,
        aliquotaEfetiva: base > 0 ? presumidoTotal / base : 0,
        liquido: base - presumidoTotal,
      },
      irpf: {
        baseMensal,
        aliquota: aliqIRPF,
        deducao: dedIRPF,
        total: irpfTotal,
        aliquotaEfetiva: base > 0 ? irpfTotal / base : 0,
        liquido: base - irpfTotal,
      },
    };
  }, [dre.interestRevenue, period]);

  // ===== Fluxo de caixa =====
  const cashflow = useMemo(() => {
    const map = new Map<string, { in: number; out: number }>();
    let paymentCount = 0;
    let saleCount = 0;
    let loanCount = 0;
    let expenseCount = 0;
    let totalLoanOutgoing = 0;
    payments.filter((p) => matchPeriod(p.date)).forEach((p) => {
      const k = period === "month" ? p.date : getMonthKey(p.date);
      const cur = map.get(k) || { in: 0, out: 0 };
      cur.in += Number(p.amount) || 0;
      map.set(k, cur);
      paymentCount += 1;
    });
    sales.filter((s) => matchPeriod(s.sale_date)).forEach((s) => {
      const k = period === "month" ? s.sale_date : getMonthKey(s.sale_date);
      const cur = map.get(k) || { in: 0, out: 0 };
      cur.in += Number(s.total) || 0;
      map.set(k, cur);
      saleCount += 1;
    });
    expenses.filter((e) => e.paid && e.scope !== "personal" && matchPeriod(e.paid_date || e.due_date)).forEach((e) => {
      const d = e.paid_date || e.due_date;
      const k = period === "month" ? d : getMonthKey(d);
      const cur = map.get(k) || { in: 0, out: 0 };
      cur.out += Number(e.amount) || 0;
      map.set(k, cur);
      expenseCount += 1;
    });
    // Empréstimos concedidos no período (saída de caixa do operador)
    loans.filter((l) => matchPeriod(l.start_date || l.startDate)).forEach((l) => {
      totalLoanOutgoing += Number(l.amount) || 0;
      loanCount += 1;
    });
    const rows = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
      key: k,
      in: v.in,
      out: v.out,
      net: v.in - v.out,
    }));
    const totalIn = rows.reduce((s, r) => s + r.in, 0);
    const totalOut = rows.reduce((s, r) => s + r.out, 0);
    return { rows, totalIn, totalOut, net: totalIn - totalOut, paymentCount, saleCount, loanCount, expenseCount, totalLoanOutgoing };
  }, [payments, sales, expenses, loans, period, monthFilter, yearFilter]);

  const formatDate = (k: string) => {
    if (k.length === 10) return new Date(k + "T00:00:00").toLocaleDateString("pt-BR");
    if (k.length === 7) {
      const [y, m] = k.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    }
    return k;
  };

  const exportTaxSimulationPDF = async () => {
    try {
      const branding = await getPdfBranding();
      const doc = new jsPDF();
      const periodLabel = period === "month" ? formatDate(monthFilter) : yearFilter;
      const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

      // Cabeçalho
      drawBrandingLogo(doc, branding);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Simulação de Impostos", 14, 18);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      if (branding.brandName) doc.text(branding.brandName, 14, 13);
      doc.text(`Período: ${periodLabel} (${period === "month" ? "Mensal" : "Anual"})`, 14, 25);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 31);
      doc.setTextColor(0);

      // Base
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Base de Cálculo", 14, 42);
      autoTable(doc, {
        startY: 45,
        theme: "grid",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] },
        head: [["Descrição", "Valor"]],
        body: [
          ["Receita base (juros recebidos)", fmtBRL(taxSim.base)],
          ["RBT12 (anualizada — Simples)", fmtBRL(taxSim.rbt12)],
        ],
      });

      // Simples Nacional
      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Simples Nacional (Anexo III)", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [16, 185, 129] },
        head: [["Item", "Valor"]],
        body: [
          ["Faixa", String(taxSim.simples.faixa)],
          ["Alíquota efetiva", pct(taxSim.simples.aliquotaEfetiva)],
          ["DAS estimado", fmtBRL(taxSim.simples.total)],
          ["Líquido após imposto", fmtBRL(taxSim.simples.liquido)],
        ],
      });

      // Lucro Presumido
      y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Lucro Presumido (Serviços)", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [234, 179, 8] },
        head: [["Tributo", "Valor"]],
        body: [
          ["Base de cálculo (32%)", fmtBRL(taxSim.presumido.baseCalculo)],
          ["IRPJ (15%)", fmtBRL(taxSim.presumido.irpj)],
          ["IRPJ Adicional (10%)", fmtBRL(taxSim.presumido.irpjAdicional)],
          ["CSLL (9%)", fmtBRL(taxSim.presumido.csll)],
          ["PIS (0,65%)", fmtBRL(taxSim.presumido.pis)],
          ["COFINS (3%)", fmtBRL(taxSim.presumido.cofins)],
          ["ISS (5% — máx.)", fmtBRL(taxSim.presumido.iss)],
          ["Total estimado", fmtBRL(taxSim.presumido.total)],
          ["Alíquota efetiva", pct(taxSim.presumido.aliquotaEfetiva)],
          ["Líquido após imposto", fmtBRL(taxSim.presumido.liquido)],
        ],
      });

      // IRPF
      y = (doc as any).lastAutoTable.finalY + 8;
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.text("Pessoa Física (IRPF / Carnê-Leão)", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [168, 85, 247] },
        head: [["Item", "Valor"]],
        body: [
          ["Base mensal", fmtBRL(taxSim.irpf.baseMensal)],
          ["Alíquota nominal", pct(taxSim.irpf.aliquota)],
          ["Parcela a deduzir", fmtBRL(taxSim.irpf.deducao)],
          ["IRPF estimado", fmtBRL(taxSim.irpf.total)],
          ["Alíquota efetiva", pct(taxSim.irpf.aliquotaEfetiva)],
          ["Líquido após imposto", fmtBRL(taxSim.irpf.liquido)],
        ],
      });

      // Comparativo
      y = (doc as any).lastAutoTable.finalY + 8;
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.text("Comparativo entre Regimes", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 41, 59] },
        head: [["Regime", "Imposto", "Alíquota Efetiva", "Líquido"]],
        body: [
          ["Simples Nacional", fmtBRL(taxSim.simples.total), pct(taxSim.simples.aliquotaEfetiva), fmtBRL(taxSim.simples.liquido)],
          ["Lucro Presumido", fmtBRL(taxSim.presumido.total), pct(taxSim.presumido.aliquotaEfetiva), fmtBRL(taxSim.presumido.liquido)],
          ["Pessoa Física", fmtBRL(taxSim.irpf.total), pct(taxSim.irpf.aliquotaEfetiva), fmtBRL(taxSim.irpf.liquido)],
        ],
      });

      // Rodapé
      y = (doc as any).lastAutoTable.finalY + 10;
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120);
      doc.text(
        "Valores aproximados, baseados nos juros recebidos no período. Consulte um contador para precisão fiscal.",
        14, y, { maxWidth: 180 }
      );

      doc.save(`simulacao-impostos-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF da simulação exportado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF");
    }
  };

  const drawBrandingLogo = (
    doc: jsPDF,
    branding: { logoDataUrl: string | null; logoSize: number; brandName: string },
  ) => {
    if (!branding.logoDataUrl) return;
    // Convert configured px (report area) to mm. 1 px ≈ 0.2645 mm.
    const sizeMm = Math.max(12, Math.min(40, branding.logoSize * 0.2645));
    const pageW = doc.internal.pageSize.getWidth();
    try {
      doc.addImage(branding.logoDataUrl, "PNG", pageW - sizeMm - 14, 10, sizeMm, sizeMm, undefined, "FAST");
    } catch {
      // ignore image errors
    }
  };

  const pdfHeader = (
    doc: jsPDF,
    title: string,
    branding?: { logoDataUrl: string | null; logoSize: number; brandName: string },
  ) => {
    const periodLabel = period === "month" ? formatDate(monthFilter) : yearFilter;
    if (branding) drawBrandingLogo(doc, branding);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    if (branding?.brandName) doc.text(branding.brandName, 14, 13);
    doc.text(`Período: ${periodLabel} (${period === "month" ? "Mensal" : "Anual"})`, 14, 25);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 31);
    doc.setTextColor(0);
    return periodLabel;
  };

  const exportDREPDF = async () => {
    try {
      const branding = await getPdfBranding();
      const doc = new jsPDF();
      const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const periodLabel = pdfHeader(doc, "Demonstrativo de Resultado (DRE)", branding);

      autoTable(doc, {
        startY: 40,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [59, 130, 246] },
        head: [["Descrição", "Valor"]],
        body: [
          ["(+) Receita de Juros", fmtBRL(dre.interestRevenue)],
          ["(+) Receita de Vendas", fmtBRL(dre.salesRevenue)],
          [{ content: "(=) Receita Bruta", styles: { fontStyle: "bold", fillColor: [243, 244, 246] } },
           { content: fmtBRL(dre.totalRevenue), styles: { fontStyle: "bold", fillColor: [243, 244, 246] } }],
          ["(−) Despesas Operacionais", fmtBRL(dre.businessExp)],
          [{ content: "(=) Lucro Líquido", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
           { content: fmtBRL(dre.netProfit), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } }],
        ],
      });

      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Informações Complementares", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [100, 116, 139] },
        head: [["Item", "Valor"]],
        body: [
          ["Capital recuperado (principal)", fmtBRL(dre.principalReceived)],
          ["Despesas pessoais (não impacta DRE)", fmtBRL(dre.personalExp)],
          ["Total geral de despesas", fmtBRL(dre.totalExpenses)],
        ],
      });

      doc.save(`dre-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF do DRE exportado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF");
    }
  };

  const exportCashflowPDF = async () => {
    try {
      const branding = await getPdfBranding();
      const doc = new jsPDF();
      const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const periodLabel = pdfHeader(doc, "Fluxo de Caixa", branding);

      autoTable(doc, {
        startY: 40,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [16, 185, 129] },
        head: [["Resumo", "Valor"]],
        body: [
          ["Total de Entradas", fmtBRL(cashflow.totalIn)],
          ["Total de Saídas", fmtBRL(cashflow.totalOut)],
          [{ content: "Saldo Líquido", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
           { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } }],
        ],
      });

      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Movimentações ${period === "month" ? "Diárias" : "Mensais"}`, 14, y);

      if (cashflow.rows.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text("Sem movimentações no período.", 14, y + 8);
      } else {
        autoTable(doc, {
          startY: y + 3,
          theme: "striped",
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] },
          head: [["Data", "Entrada", "Saída", "Saldo"]],
          body: cashflow.rows.map((r) => [
            formatDate(r.key),
            fmtBRL(r.in),
            fmtBRL(r.out),
            fmtBRL(r.net),
          ]),
          foot: [[
            { content: "Total", styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.totalIn), styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.totalOut), styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold" } },
          ]],
        });
      }

      doc.save(`fluxo-caixa-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF do Fluxo de Caixa exportado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF");
    }
  };

  const exportConsolidatedPDF = async () => {
    try {
      const branding = await getPdfBranding();
      const doc = new jsPDF();
      const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
      const periodLabel = period === "month" ? formatDate(monthFilter) : yearFilter;

      // ===== Capa =====
      drawBrandingLogo(doc, branding);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Relatório Contábil Consolidado", 14, 25);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      if (branding.brandName) doc.text(branding.brandName, 14, 15);
      doc.text(`Período: ${periodLabel} (${period === "month" ? "Mensal" : "Anual"})`, 14, 34);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 40);
      doc.setTextColor(0);

      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120);
      doc.text(
        "Este relatório consolida DRE, Controle de Impostos, Simulação Tributária e Fluxo de Caixa do período selecionado.",
        14, 50, { maxWidth: 180 }
      );
      doc.setTextColor(0);

      // ===== Seção 1: DRE =====
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("1. Demonstrativo de Resultado (DRE)", 14, 70);

      autoTable(doc, {
        startY: 75,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [59, 130, 246] },
        head: [["Descrição", "Valor"]],
        body: [
          ["(+) Receita de Juros", fmtBRL(dre.interestRevenue)],
          ["(+) Receita de Vendas", fmtBRL(dre.salesRevenue)],
          [{ content: "(=) Receita Bruta", styles: { fontStyle: "bold", fillColor: [243, 244, 246] } },
           { content: fmtBRL(dre.totalRevenue), styles: { fontStyle: "bold", fillColor: [243, 244, 246] } }],
          ["(−) Despesas Operacionais", fmtBRL(dre.businessExp)],
          [{ content: "(=) Lucro Líquido", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
           { content: fmtBRL(dre.netProfit), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } }],
          ["Capital recuperado (principal)", fmtBRL(dre.principalReceived)],
          ["Despesas pessoais (não impacta DRE)", fmtBRL(dre.personalExp)],
        ],
      });

      // ===== Seção 2: Impostos =====
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("2. Controle de Impostos", 14, 20);

      autoTable(doc, {
        startY: 25,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [234, 88, 12] },
        head: [["Resumo", "Valor"]],
        body: [
          ["Total no período", fmtBRL(taxes.total)],
          ["Pagos", fmtBRL(taxes.paid)],
          ["Pendentes", fmtBRL(taxes.pending)],
        ],
      });

      let y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Lançamentos de Impostos", 14, y);

      if (taxes.items.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text("Nenhum imposto registrado no período.", 14, y + 7);
        doc.setTextColor(0);
      } else {
        autoTable(doc, {
          startY: y + 3,
          theme: "striped",
          styles: { fontSize: 9 },
          headStyles: { fillColor: [100, 116, 139] },
          head: [["Descrição", "Categoria", "Vencimento", "Valor", "Status"]],
          body: taxes.items.map((t: any) => [
            t.description,
            t.category,
            new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR"),
            fmtBRL(Number(t.amount) || 0),
            t.paid ? "Pago" : "Pendente",
          ]),
        });
      }

      // ===== Seção 3: Simulação =====
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("3. Simulação de Impostos", 14, 20);
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120);
      doc.text(`Base de cálculo: juros recebidos no período (${fmtBRL(taxSim.base)})`, 14, 27);
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 32,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [30, 41, 59] },
        head: [["Regime", "Imposto", "Alíq. Efetiva", "Líquido"]],
        body: [
          ["Simples Nacional", fmtBRL(taxSim.simples.total), pct(taxSim.simples.aliquotaEfetiva), fmtBRL(taxSim.simples.liquido)],
          ["Lucro Presumido", fmtBRL(taxSim.presumido.total), pct(taxSim.presumido.aliquotaEfetiva), fmtBRL(taxSim.presumido.liquido)],
          ["Pessoa Física (IRPF)", fmtBRL(taxSim.irpf.total), pct(taxSim.irpf.aliquotaEfetiva), fmtBRL(taxSim.irpf.liquido)],
        ],
      });

      y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Detalhamento - Lucro Presumido", 14, y);
      autoTable(doc, {
        startY: y + 3,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [234, 179, 8] },
        head: [["Tributo", "Valor"]],
        body: [
          ["Base de cálculo (32%)", fmtBRL(taxSim.presumido.baseCalculo)],
          ["IRPJ (15%)", fmtBRL(taxSim.presumido.irpj)],
          ["IRPJ Adicional (10%)", fmtBRL(taxSim.presumido.irpjAdicional)],
          ["CSLL (9%)", fmtBRL(taxSim.presumido.csll)],
          ["PIS (0,65%)", fmtBRL(taxSim.presumido.pis)],
          ["COFINS (3%)", fmtBRL(taxSim.presumido.cofins)],
          ["ISS (5%)", fmtBRL(taxSim.presumido.iss)],
        ],
      });

      // ===== Seção 4: Fluxo de Caixa =====
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("4. Fluxo de Caixa", 14, 20);

      autoTable(doc, {
        startY: 25,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [16, 185, 129] },
        head: [["Resumo", "Valor"]],
        body: [
          ["Total de Entradas", fmtBRL(cashflow.totalIn)],
          ["Total de Saídas", fmtBRL(cashflow.totalOut)],
          [{ content: "Saldo Líquido", styles: { fontStyle: "bold", fillColor: [219, 234, 254] } },
           { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold", fillColor: [219, 234, 254] } }],
        ],
      });

      y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Movimentações ${period === "month" ? "Diárias" : "Mensais"}`, 14, y);

      if (cashflow.rows.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text("Sem movimentações no período.", 14, y + 7);
        doc.setTextColor(0);
      } else {
        autoTable(doc, {
          startY: y + 3,
          theme: "striped",
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] },
          head: [["Data", "Entrada", "Saída", "Saldo"]],
          body: cashflow.rows.map((r) => [
            formatDate(r.key),
            fmtBRL(r.in),
            fmtBRL(r.out),
            fmtBRL(r.net),
          ]),
          foot: [[
            { content: "Total", styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.totalIn), styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.totalOut), styles: { fontStyle: "bold" } },
            { content: fmtBRL(cashflow.net), styles: { fontStyle: "bold" } },
          ]],
        });
      }

      // Numeração de páginas
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 14, 290);
        doc.text("Relatório Contábil Consolidado", 196, 290, { align: "right" });
      }

      doc.save(`relatorio-contabil-consolidado-${periodLabel.replace(/\s+/g, "-")}.pdf`);
      toast.success("PDF consolidado exportado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF consolidado");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtro de período */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-4 w-4 text-primary" /> Relatório Contábil
              </CardTitle>
              <CardDescription>DRE, controle de impostos e fluxo de caixa da empresa.</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={exportConsolidatedPDF}
              className="shrink-0 h-8 gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PDF Consolidado</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={period} onValueChange={(v: "month" | "year") => setPeriod(v)}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mensal</SelectItem>
                <SelectItem value="year">Anual</SelectItem>
              </SelectContent>
            </Select>
            {period === "month" ? (
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>{formatDate(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumo de Fluxo do Período */}
      {(() => {
        const totalOutFull = cashflow.totalOut + cashflow.totalLoanOutgoing;
        const netFull = cashflow.totalIn - totalOutFull;
        const periodLabelTxt = period === "month" ? formatDate(monthFilter) : yearFilter;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-stretch">
            <div className="rounded-2xl p-4 sm:p-5 bg-card border border-success/20 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entradas</span>
                <div className="h-8 w-8 rounded-xl bg-success/15 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-success" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-success">{fmt(cashflow.totalIn, hidden)}</p>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-auto pt-2 text-xs text-muted-foreground">
                <span>{cashflow.paymentCount} parcela(s)</span><span>·</span><span>{cashflow.saleCount} venda(s)</span>
              </div>
            </div>

            <div className="rounded-2xl p-4 sm:p-5 bg-card border border-warning/20 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saídas</span>
                <div className="h-8 w-8 rounded-xl bg-warning/15 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-warning" />
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-warning">{fmt(totalOutFull, hidden)}</p>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-auto pt-2 text-xs text-muted-foreground">
                <span>{cashflow.loanCount} empréstimo(s)</span><span>·</span><span>{cashflow.expenseCount} despesa(s)</span>
              </div>
            </div>

            <div className={`rounded-2xl p-4 sm:p-5 bg-card border flex flex-col ${netFull >= 0 ? "border-primary/20" : "border-destructive/20"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saldo do Período</span>
                <div className={`h-8 w-8 rounded-xl ${netFull >= 0 ? "bg-primary/15" : "bg-destructive/15"} flex items-center justify-center`}>
                  <DollarSign className={`h-4 w-4 ${netFull >= 0 ? "text-primary" : "text-destructive"}`} />
                </div>
              </div>
              <p className={`text-xl sm:text-2xl font-bold ${netFull >= 0 ? "text-primary" : "text-destructive"}`}>{fmt(netFull, hidden)}</p>
              <p className="text-xs mt-auto pt-2 text-muted-foreground capitalize">{periodLabelTxt}</p>
            </div>
          </div>
        );
      })()}

      <Tabs defaultValue="dre" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dre" className="text-xs sm:text-sm"><FileBarChart className="h-4 w-4 mr-1 hidden sm:inline" /> DRE</TabsTrigger>
          <TabsTrigger value="taxes" className="text-xs sm:text-sm"><Receipt className="h-4 w-4 mr-1 hidden sm:inline" /> Impostos</TabsTrigger>
          <TabsTrigger value="simulation" className="text-xs sm:text-sm"><Sparkles className="h-4 w-4 mr-1 hidden sm:inline" /> Simulação</TabsTrigger>
          <TabsTrigger value="cashflow" className="text-xs sm:text-sm"><Wallet className="h-4 w-4 mr-1 hidden sm:inline" /> Fluxo</TabsTrigger>
        </TabsList>

        {/* DRE */}
        <TabsContent value="dre" className="space-y-3 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3 text-success" /> Receita Total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold text-success">{fmt(dre.totalRevenue, hidden)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3 text-destructive" /> Despesas Empresa</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold text-destructive">{fmt(dre.businessExp, hidden)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Lucro Líquido</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-xl font-bold ${dre.netProfit >= 0 ? "text-success" : "text-destructive"}`}>{fmt(dre.netProfit, hidden)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm">Demonstrativo Detalhado</CardTitle>
                <Button size="sm" variant="outline" onClick={exportDREPDF} className="shrink-0 h-8">
                  <Download className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="font-medium">(+) Receita de Juros</span>
                  <span className="text-success">{fmt(dre.interestRevenue, hidden)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="font-medium">(+) Receita de Vendas</span>
                  <span className="text-success">{fmt(dre.salesRevenue, hidden)}</span>
                </div>
                <div className="flex justify-between py-2 border-b font-semibold bg-muted/30 px-2 rounded">
                  <span>(=) Receita Bruta</span>
                  <span>{fmt(dre.totalRevenue, hidden)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="font-medium">(−) Despesas Operacionais</span>
                  <span className="text-destructive">{fmt(dre.businessExp, hidden)}</span>
                </div>
                <div className="flex justify-between py-2 font-bold bg-primary/5 px-2 rounded">
                  <span>(=) Lucro Líquido</span>
                  <span className={dre.netProfit >= 0 ? "text-success" : "text-destructive"}>{fmt(dre.netProfit, hidden)}</span>
                </div>
                <div className="flex justify-between pt-3 text-xs text-muted-foreground">
                  <span>Capital recuperado (principal)</span>
                  <span>{fmt(dre.principalReceived, hidden)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Despesas pessoais (não impacta DRE)</span>
                  <span>{fmt(dre.personalExp, hidden)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Impostos */}
        <TabsContent value="taxes" className="space-y-3 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total no período</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(taxes.total, hidden)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pagos</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-success">{fmt(taxes.paid, hidden)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pendentes</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-destructive">{fmt(taxes.pending, hidden)}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Impostos e Tributos</CardTitle>
              <CardDescription className="text-xs">Despesas com categoria contendo: impostos, tributos, taxa, ISS, IRPF, IRPJ, ICMS, DAS, MEI, Simples.</CardDescription>
            </CardHeader>
            <CardContent>
              {taxes.items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum imposto registrado no período.</p>
              ) : (
                <div className="space-y-2">
                  {taxes.items.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 border-b text-sm">
                      <div>
                        <p className="font-medium">{t.description}</p>
                        <p className="text-xs text-muted-foreground">{t.category} · venc. {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{fmt(Number(t.amount) || 0, hidden)}</p>
                        <p className={`text-xs ${t.paid ? "text-success" : "text-destructive"}`}>{t.paid ? "Pago" : "Pendente"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Simulação de Impostos */}
        <TabsContent value="simulation" className="space-y-3 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Simulador de Impostos
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Estimativa baseada nos juros recebidos no período selecionado ({fmt(taxSim.base, hidden)}).
                    Valores aproximados — consulte um contador para precisão fiscal.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportTaxSimulationPDF}
                  disabled={taxSim.base === 0}
                  className="shrink-0 h-8"
                >
                  <Download className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={taxRegime} onValueChange={(v: "simples" | "presumido" | "irpf") => setTaxRegime(v)}>
                <SelectTrigger className="w-full sm:w-[280px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simples">Simples Nacional (Anexo III)</SelectItem>
                  <SelectItem value="presumido">Lucro Presumido (Serviços)</SelectItem>
                  <SelectItem value="irpf">Pessoa Física (IRPF)</SelectItem>
                </SelectContent>
              </Select>

              {taxSim.base === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum juro recebido no período selecionado para simular.
                </p>
              ) : (
                <>
                  {taxRegime === "simples" && (
                    <div className="space-y-2 text-sm">
                      <div className="bg-primary/5 rounded-lg p-3 mb-2">
                        <p className="text-xs text-muted-foreground">Imposto estimado a pagar</p>
                        <p className="text-2xl font-bold text-destructive">{fmt(taxSim.simples.total, hidden)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Alíquota efetiva: <strong>{(taxSim.simples.aliquotaEfetiva * 100).toFixed(2)}%</strong> · Faixa {taxSim.simples.faixa}
                        </p>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Receita base (juros)</span>
                        <span className="font-medium">{fmt(taxSim.base, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>RBT12 (anualizada)</span>
                        <span className="font-medium">{fmt(taxSim.rbt12, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>(−) DAS estimado</span>
                        <span className="text-destructive font-medium">{fmt(taxSim.simples.total, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold bg-success/5 px-2 rounded">
                        <span>(=) Líquido após imposto</span>
                        <span className="text-success">{fmt(taxSim.simples.liquido, hidden)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pt-2">
                        Anexo III aplica-se a serviços de intermediação financeira. Cálculo: (RBT12 × alíquota − dedução) ÷ RBT12.
                      </p>
                    </div>
                  )}

                  {taxRegime === "presumido" && (
                    <div className="space-y-2 text-sm">
                      <div className="bg-primary/5 rounded-lg p-3 mb-2">
                        <p className="text-xs text-muted-foreground">Imposto estimado a pagar</p>
                        <p className="text-2xl font-bold text-destructive">{fmt(taxSim.presumido.total, hidden)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Alíquota efetiva: <strong>{(taxSim.presumido.aliquotaEfetiva * 100).toFixed(2)}%</strong>
                        </p>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Receita base</span>
                        <span className="font-medium">{fmt(taxSim.base, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Base de cálculo IRPJ/CSLL (32%)</span>
                        <span className="font-medium">{fmt(taxSim.presumido.baseCalculo, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-xs">
                        <span className="text-muted-foreground">IRPJ (15%)</span>
                        <span>{fmt(taxSim.presumido.irpj, hidden)}</span>
                      </div>
                      {taxSim.presumido.irpjAdicional > 0 && (
                        <div className="flex justify-between py-1 text-xs">
                          <span className="text-muted-foreground">IRPJ Adicional (10%)</span>
                          <span>{fmt(taxSim.presumido.irpjAdicional, hidden)}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-1 text-xs">
                        <span className="text-muted-foreground">CSLL (9%)</span>
                        <span>{fmt(taxSim.presumido.csll, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-xs">
                        <span className="text-muted-foreground">PIS (0,65%)</span>
                        <span>{fmt(taxSim.presumido.pis, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-xs">
                        <span className="text-muted-foreground">COFINS (3%)</span>
                        <span>{fmt(taxSim.presumido.cofins, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-xs border-b pb-2">
                        <span className="text-muted-foreground">ISS (5% — máx., varia por município)</span>
                        <span>{fmt(taxSim.presumido.iss, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold bg-success/5 px-2 rounded">
                        <span>(=) Líquido após imposto</span>
                        <span className="text-success">{fmt(taxSim.presumido.liquido, hidden)}</span>
                      </div>
                    </div>
                  )}

                  {taxRegime === "irpf" && (
                    <div className="space-y-2 text-sm">
                      <div className="bg-primary/5 rounded-lg p-3 mb-2">
                        <p className="text-xs text-muted-foreground">Imposto estimado a pagar</p>
                        <p className="text-2xl font-bold text-destructive">{fmt(taxSim.irpf.total, hidden)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Alíquota nominal: <strong>{(taxSim.irpf.aliquota * 100).toFixed(1)}%</strong> · Efetiva: <strong>{(taxSim.irpf.aliquotaEfetiva * 100).toFixed(2)}%</strong>
                        </p>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Receita base (juros)</span>
                        <span className="font-medium">{fmt(taxSim.base, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Base mensal</span>
                        <span className="font-medium">{fmt(taxSim.irpf.baseMensal, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>Parcela a deduzir</span>
                        <span className="font-medium">{fmt(taxSim.irpf.deducao, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span>(−) IRPF / Carnê-Leão</span>
                        <span className="text-destructive font-medium">{fmt(taxSim.irpf.total, hidden)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-bold bg-success/5 px-2 rounded">
                        <span>(=) Líquido após imposto</span>
                        <span className="text-success">{fmt(taxSim.irpf.liquido, hidden)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pt-2">
                        Tabela progressiva mensal vigente. Juros recebidos por PF são tributados via Carnê-Leão.
                      </p>
                    </div>
                  )}

                  {/* Comparativo */}
                  <Card className="mt-4 bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs">Comparativo entre regimes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-xs">
                      <div className="flex justify-between py-1 border-b">
                        <span>Simples Nacional</span>
                        <span className="font-semibold">{fmt(taxSim.simples.total, hidden)} ({(taxSim.simples.aliquotaEfetiva * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="flex justify-between py-1 border-b">
                        <span>Lucro Presumido</span>
                        <span className="font-semibold">{fmt(taxSim.presumido.total, hidden)} ({(taxSim.presumido.aliquotaEfetiva * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Pessoa Física</span>
                        <span className="font-semibold">{fmt(taxSim.irpf.total, hidden)} ({(taxSim.irpf.aliquotaEfetiva * 100).toFixed(1)}%)</span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fluxo de caixa */}
        <TabsContent value="cashflow" className="space-y-3 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Entradas</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-success">{fmt(cashflow.totalIn, hidden)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Saídas</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-destructive">{fmt(cashflow.totalOut, hidden)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Saldo</CardTitle></CardHeader>
              <CardContent><p className={`text-xl font-bold ${cashflow.net >= 0 ? "text-success" : "text-destructive"}`}>{fmt(cashflow.net, hidden)}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm">Movimentações {period === "month" ? "diárias" : "mensais"}</CardTitle>
                <Button size="sm" variant="outline" onClick={exportCashflowPDF} className="shrink-0 h-8">
                  <Download className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {cashflow.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sem movimentações no período.</p>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-muted-foreground border-b pb-2">
                    <span>Data</span>
                    <span className="text-right">Entrada</span>
                    <span className="text-right">Saída</span>
                    <span className="text-right">Saldo</span>
                  </div>
                  {cashflow.rows.map((r) => (
                    <div key={r.key} className="grid grid-cols-4 gap-2 py-1.5 text-sm border-b">
                      <span className="text-xs">{formatDate(r.key)}</span>
                      <span className="text-right text-success">{fmt(r.in, hidden)}</span>
                      <span className="text-right text-destructive">{fmt(r.out, hidden)}</span>
                      <span className={`text-right font-medium ${r.net >= 0 ? "text-success" : "text-destructive"}`}>{fmt(r.net, hidden)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
