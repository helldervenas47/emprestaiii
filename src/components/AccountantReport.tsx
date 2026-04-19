import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TrendingUp, TrendingDown, Receipt, Wallet, FileBarChart, Sparkles, Download } from "lucide-react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

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
    payments.filter((p) => matchPeriod(p.date)).forEach((p) => {
      const k = period === "month" ? p.date : getMonthKey(p.date);
      const cur = map.get(k) || { in: 0, out: 0 };
      cur.in += Number(p.amount) || 0;
      map.set(k, cur);
    });
    sales.filter((s) => matchPeriod(s.sale_date)).forEach((s) => {
      const k = period === "month" ? s.sale_date : getMonthKey(s.sale_date);
      const cur = map.get(k) || { in: 0, out: 0 };
      cur.in += Number(s.total) || 0;
      map.set(k, cur);
    });
    expenses.filter((e) => e.paid && e.scope !== "personal" && matchPeriod(e.paid_date || e.due_date)).forEach((e) => {
      const d = e.paid_date || e.due_date;
      const k = period === "month" ? d : getMonthKey(d);
      const cur = map.get(k) || { in: 0, out: 0 };
      cur.out += Number(e.amount) || 0;
      map.set(k, cur);
    });
    const rows = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
      key: k,
      in: v.in,
      out: v.out,
      net: v.in - v.out,
    }));
    const totalIn = rows.reduce((s, r) => s + r.in, 0);
    const totalOut = rows.reduce((s, r) => s + r.out, 0);
    return { rows, totalIn, totalOut, net: totalIn - totalOut };
  }, [payments, sales, expenses, period, monthFilter, yearFilter]);

  const formatDate = (k: string) => {
    if (k.length === 10) return new Date(k + "T00:00:00").toLocaleDateString("pt-BR");
    if (k.length === 7) {
      const [y, m] = k.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    }
    return k;
  };

  return (
    <div className="space-y-4">
      {/* Filtro de período */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4 text-primary" /> Relatório Contábil
          </CardTitle>
          <CardDescription>DRE, controle de impostos e fluxo de caixa da empresa.</CardDescription>
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
              <CardTitle className="text-sm">Demonstrativo Detalhado</CardTitle>
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
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Simulador de Impostos
              </CardTitle>
              <CardDescription className="text-xs">
                Estimativa baseada nos juros recebidos no período selecionado ({fmt(taxSim.base, hidden)}).
                Valores aproximados — consulte um contador para precisão fiscal.
              </CardDescription>
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
              <CardTitle className="text-sm">Movimentações {period === "month" ? "diárias" : "mensais"}</CardTitle>
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
