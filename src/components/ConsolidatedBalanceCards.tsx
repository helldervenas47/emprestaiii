import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Settings2, TrendingUp, Wallet, Landmark, Banknote, PiggyBank, Car, ArrowDownCircle, ArrowUpRight, ArrowDownRight, PieChart } from "lucide-react";
import { useLoans } from "@/hooks/useLoans";
import { useProducts } from "@/hooks/useProducts";
import { usePiggyBanks } from "@/hooks/usePiggyBanks";
import { useIncomes } from "@/hooks/useIncomes";
import { useExpenses } from "@/hooks/useExpenses";
import { useUnifiedAccountBalance } from "@/hooks/useUnifiedAccountBalance";
import { getBalances } from "@/lib/balance";
import { supabase } from "@/integrations/supabase/client";
import type { Sale } from "@/types/loan";

type MaosVisibility = {
  account: boolean;
  cash: boolean;
  incomes: boolean;
  piggy: boolean;
  vehicle: boolean;
};
const VIS_STORAGE_KEY = "balanceMaos.visibility.v1";
const DEFAULT_VIS: MaosVisibility = {
  account: true,
  cash: true,
  incomes: true,
  piggy: true,
  vehicle: true,
};

const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });


/** Mesmo cálculo da aba Vendas: total pago considerando installmentAmounts/downPayment/partialPaid. */
function getSalePaidAmount(s: Sale): number {
  const amounts = s.installmentAmounts;
  if (amounts && amounts.length > 0) {
    let paid = s.downPayment || 0;
    for (let i = 0; i < s.paidInstallments && i < amounts.length; i++) {
      paid += amounts[i] || 0;
    }
    return paid + (s.partialPaid || 0);
  }
  const vp = s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : s.total;
  return vp * s.paidInstallments + (s.downPayment || 0) + (s.partialPaid || 0);
}

/** Categoriza igual à aba Vendas, para excluir vendas quitadas do "a receber". */
function isSalePaid(s: Sale): boolean {
  const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
  return isRecorrente ? s.paidInstallments >= s.installments : s.paidInstallments >= 1;
}

export function ConsolidatedBalanceCards() {
  const { loans } = useLoans();
  const { sales } = useProducts(true);
  const { piggyBanks, balances: piggyBalances } = usePiggyBanks();

  // Espelha EXATAMENTE o "Saldo em Conta" da aba Receitas (IncomeBalanceCard)
  // via hook unificado — mantém os dois cards sempre sincronizados.
  const incomesBalance = useUnifiedAccountBalance();
  // Necessário para a projeção de 30 dias abaixo.
  const { incomes } = useIncomes(true);
  const { expenses } = useExpenses(true);

  const [dashboardAccount, setDashboardAccount] = useState(0);
  const [dashboardCash, setDashboardCash] = useState(0);
  const [vehicleBalance, setVehicleBalance] = useState(0);
  const [openRua, setOpenRua] = useState(false);
  const [openMaos, setOpenMaos] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [visibility, setVisibility] = useState<MaosVisibility>(() => {
    if (typeof window === "undefined") return DEFAULT_VIS;
    try {
      const raw = localStorage.getItem(VIS_STORAGE_KEY);
      if (!raw) return DEFAULT_VIS;
      return { ...DEFAULT_VIS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_VIS;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(VIS_STORAGE_KEY, JSON.stringify(visibility)); } catch {}
  }, [visibility]);
  const toggleVis = (key: keyof MaosVisibility) =>
    setVisibility((v) => ({ ...v, [key]: !v[key] }));

  const reloadExternalBalances = useCallback(async () => {
    const [b, { data: { session } }] = await Promise.all([
      getBalances(),
      supabase.auth.getSession(),
    ]);
    setDashboardAccount(b.account);
    setDashboardCash(b.cash);
    const user = session?.user;
    if (user) {
      const { data: ownerRow } = await supabase
        .from("user_owner" as any)
        .select("owner_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const ownerId = (ownerRow as any)?.owner_id || user.id;
      const { data } = await supabase
        .from("vehicle_balance" as any)
        .select("amount")
        .eq("user_id", ownerId)
        .maybeSingle();
      setVehicleBalance(Number((data as any)?.amount ?? 0));
    }
  }, []);

  useEffect(() => { reloadExternalBalances(); }, [reloadExternalBalances]);
  useEffect(() => {
    const onChange = () => { reloadExternalBalances(); };
    window.addEventListener("balance:changed", onChange);
    return () => window.removeEventListener("balance:changed", onChange);
  }, [reloadExternalBalances]);

  const pendingLoans = useMemo(
    () => loans
      .filter((l) => l.status !== "paid")
      .reduce((s, l) => s + (l.remainingAmount ?? 0), 0),
    [loans],
  );
  const pendingSales = useMemo(
    () => sales
      .filter((s) => s.businessType === "venda" && !isSalePaid(s))
      .reduce((s, sale) => s + Math.max(0, sale.total - getSalePaidAmount(sale)), 0),
    [sales],
  );
  const totalNaRua = pendingLoans + pendingSales;

  const piggyTotal = useMemo(() => {
    let sum = 0;
    piggyBanks.forEach((pb) => {
      const b = piggyBalances.get(pb.id);
      if (b) sum += b.balance;
    });
    return sum;
  }, [piggyBanks, piggyBalances]);

  // "Saldo Total em Mãos" = soma dos saldos visíveis no detalhamento
  // (Conta + Dinheiro em mãos + Saldo em Conta (Receitas) + Cofrinhos + Veículos),
  // respeitando os toggles de visibilidade em Configurações.
  const totalEmMaos =
    (visibility.account ? dashboardAccount : 0) +
    (visibility.cash ? dashboardCash : 0) +
    (visibility.incomes ? incomesBalance : 0) +
    (visibility.piggy ? piggyTotal : 0) +
    (visibility.vehicle ? vehicleBalance : 0);

  const Row = ({ label, value }: { label: string; value: number }) => (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${value < 0 ? "text-destructive" : "text-foreground"}`}>
        {formatBRL(value)}
      </span>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card no3d className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setOpenRua(true)}>
          <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
            <div className="flex items-center justify-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-warning" />
              <p className="text-[11px] sm:text-xs text-muted-foreground">Saldo Total na Rua</p>
            </div>
            <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${totalNaRua < 0 ? "text-destructive" : "text-foreground"}`}>
              {formatBRL(totalNaRua)}
            </p>
          </CardContent>
        </Card>
        <Card no3d className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setOpenMaos(true)}>
          <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
            <div className="flex items-center justify-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />
              <p className="text-[11px] sm:text-xs text-muted-foreground">Saldo Total em Mãos</p>
            </div>
            <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${totalEmMaos < 0 ? "text-destructive" : "text-foreground"}`}>
              {formatBRL(totalEmMaos)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={openRua} onOpenChange={setOpenRua}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-warning" /> Saldo Total na Rua
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Row label="Pendente de empréstimos" value={pendingLoans} />
            <Row label="Pendente de vendas" value={pendingSales} />
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
              <span className="text-sm font-semibold">Total consolidado</span>
              <span className={`text-base font-bold tabular-nums ${totalNaRua < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(totalNaRua)}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openMaos} onOpenChange={setOpenMaos}>
        <DialogContent
          className="!p-0 overflow-hidden border-border/60 bg-gradient-to-br from-background via-background to-muted/30 backdrop-blur-xl max-sm:!fixed max-sm:!inset-0 max-sm:!left-0 max-sm:!top-0 max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!max-w-none max-sm:!w-screen max-sm:!h-screen max-sm:!max-h-screen max-sm:!rounded-none max-sm:!flex max-sm:!flex-col max-sm:!gap-0 sm:max-w-md"
        >
          <DialogHeader className="px-5 pt-5 pb-3" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
            <DialogTitle className="flex items-center gap-2 text-base pr-20">
              <Wallet className="h-4 w-4 text-success" /> Saldo Total em Mãos
            </DialogTitle>
            <button
              type="button"
              onClick={() => setOpenSettings(true)}
              aria-label="Configurações do saldo"
              title="Configurações do saldo"
              className="absolute right-12 top-4 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/80 hover:text-foreground hover:bg-accent/60 transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
              style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <div className="mt-3 rounded-2xl border border-border/60 bg-gradient-to-br from-success/10 via-success/5 to-transparent p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total consolidado</p>
              <p className={`text-3xl font-bold tabular-nums leading-tight mt-1 ${totalEmMaos < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(totalEmMaos)}
              </p>
            </div>
          </DialogHeader>
          <ScrollArea
            className="max-h-[60vh] max-sm:max-h-none max-sm:flex-1 max-sm:h-full px-5 pb-5"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          >
            {(() => {
              const baseReceitas = incomesBalance;
              const Item = ({
                icon: Icon,
                label,
                hint,
                value,
                tint,
              }: {
                icon: typeof Wallet;
                label: string;
                hint?: string;
                value: number;
                tint: string;
              }) => (
                <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 shadow-sm hover:bg-card/80 transition-colors">
                  <div className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${tint}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{label}</p>
                    {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${value < 0 ? "text-destructive" : "text-foreground"}`}>
                    {formatBRL(value)}
                  </span>
                </div>
              );

              const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">{title}</p>
                  <div className="space-y-2">{children}</div>
                </div>
              );

              const contasItems = [
                visibility.account && (
                  <Item key="account" icon={Landmark} label="Conta" hint="Saldo bancário (Dashboard)" value={dashboardAccount} tint="bg-primary/15 text-primary" />
                ),
                visibility.cash && (
                  <Item key="cash" icon={Banknote} label="Dinheiro em mãos" hint="Carteira (Dashboard)" value={dashboardCash} tint="bg-success/15 text-success" />
                ),
                visibility.incomes && (
                  <Item key="incomes" icon={ArrowDownCircle} label="Saldo em Conta (Receitas)" hint="Receitas − Despesas pessoais" value={baseReceitas} tint="bg-warning/15 text-warning" />
                ),
              ].filter(Boolean);
              const reservasItems = [
                visibility.piggy && (
                  <Item key="piggy" icon={PiggyBank} label="Total dos Cofrinhos" hint={`${piggyBanks.length} ${piggyBanks.length === 1 ? "cofrinho" : "cofrinhos"}`} value={piggyTotal} tint="bg-pink-500/15 text-pink-500" />
                ),
                visibility.vehicle && (
                  <Item key="vehicle" icon={Car} label="Saldo de Veículos" hint="Reserva vinculada a veículos" value={vehicleBalance} tint="bg-blue-500/15 text-blue-500" />
                ),
              ].filter(Boolean);

              return (
                <div className="space-y-4">
                  {contasItems.length > 0 && <Section title="Contas">{contasItems}</Section>}
                  {reservasItems.length > 0 && <Section title="Reservas">{reservasItems}</Section>}

                  {(() => {
                    const parts = ([
                      visibility.account && { label: "Conta", value: Math.max(0, dashboardAccount), color: "bg-primary" },
                      visibility.cash && { label: "Dinheiro", value: Math.max(0, dashboardCash), color: "bg-success" },
                      visibility.incomes && { label: "Receitas", value: Math.max(0, baseReceitas), color: "bg-warning" },
                      visibility.piggy && { label: "Cofrinhos", value: Math.max(0, piggyTotal), color: "bg-pink-500" },
                      visibility.vehicle && { label: "Veículos", value: Math.max(0, vehicleBalance), color: "bg-blue-500" },
                    ].filter(Boolean)) as { label: string; value: number; color: string }[];
                    const sum = parts.reduce((s, p) => s + p.value, 0);
                    if (sum <= 0) return null;
                    return (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1">
                          <PieChart className="h-3 w-3" /> Composição do saldo
                        </p>
                        <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 space-y-3">
                          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                            {parts.map((p) =>
                              p.value > 0 ? (
                                <div
                                  key={p.label}
                                  className={p.color}
                                  style={{ width: `${(p.value / sum) * 100}%` }}
                                  title={`${p.label}: ${formatBRL(p.value)}`}
                                />
                              ) : null,
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                            {parts.map((p) => {
                              const pct = sum > 0 ? (p.value / sum) * 100 : 0;
                              return (
                                <div key={p.label} className="flex items-center gap-1.5 min-w-0">
                                  <span className={`h-2 w-2 rounded-full shrink-0 ${p.color}`} />
                                  <span className="text-[11px] text-muted-foreground truncate flex-1">{p.label}</span>
                                  <span className="text-[11px] font-semibold tabular-nums">{pct.toFixed(0)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {(() => {
                    const today = new Date();
                    const todayStr = today.toISOString().slice(0, 10);
                    const horizon = new Date(today);
                    horizon.setDate(horizon.getDate() + 30);
                    const horizonStr = horizon.toISOString().slice(0, 10);
                    const inRange = (d?: string | null) => !!d && d >= todayStr && d <= horizonStr;

                    const expectedIn = incomes
                      .filter((i: any) => i.status !== "received" && inRange(i.receivedDate))
                      .reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
                    const expectedOut = expenses
                      .filter((e: any) => !e.paid && (e.scope ?? "business") === "personal" && inRange(e.dueDate))
                      .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
                    const projected = totalEmMaos + expectedIn - expectedOut;
                    const delta = projected - totalEmMaos;
                    return (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> Projeção em 30 dias
                        </p>
                        <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 space-y-2.5">
                          <div className="flex items-end justify-between">
                            <div className="min-w-0">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saldo projetado</p>
                              <p className={`text-xl font-bold tabular-nums leading-tight ${projected < 0 ? "text-destructive" : "text-foreground"}`}>
                                {formatBRL(projected)}
                              </p>
                            </div>
                            <span className={`text-xs font-semibold tabular-nums flex items-center gap-0.5 ${delta < 0 ? "text-destructive" : "text-success"}`}>
                              {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                              {delta >= 0 ? "+" : ""}{formatBRL(delta)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className="rounded-lg bg-success/10 p-2">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Entradas previstas</p>
                              <p className="text-sm font-bold text-success tabular-nums">{formatBRL(expectedIn)}</p>
                            </div>
                            <div className="rounded-lg bg-destructive/10 p-2">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saídas previstas</p>
                              <p className="text-sm font-bold text-destructive tabular-nums">{formatBRL(expectedOut)}</p>
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Considera receitas pendentes e despesas pessoais a vencer nos próximos 30 dias.
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  <p className="text-[10px] text-muted-foreground text-center pt-1">
                    Fonte oficial: aba Receitas e Despesas. Atualizado em tempo real.
                  </p>
                </div>
              );
            })()}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
