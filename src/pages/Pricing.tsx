import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/userClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Check,
  ArrowRight,
  Shield,
  BarChart3,
  Users,
  Clock,
  Zap,
  Star,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import logoIcon from "@/assets/logo-icon.png";

interface Plan {
  id: string;
  name: string;
  price: number;
  highlight: boolean;
  features: string[];
  sort_order: number;
}

const PLAN_PRICE_MAP: Record<string, string> = {
  "Básico": "basico_monthly",
  "Profissional": "profissional_monthly",
  "Empresarial": "empresarial_monthly",
};

const benefits = [
  {
    icon: Zap,
    title: "Gestão Rápida",
    description: "Cadastre empréstimos, clientes e pagamentos em segundos com nossa interface intuitiva.",
  },
  {
    icon: BarChart3,
    title: "Relatórios Completos",
    description: "Acompanhe lucros, juros e inadimplência com gráficos claros e atualizados em tempo real.",
  },
  {
    icon: Users,
    title: "Multi-usuários",
    description: "Adicione operadores e visualizadores com permissões personalizadas por cliente.",
  },
  {
    icon: Shield,
    title: "Segurança Total",
    description: "Seus dados protegidos com criptografia e backup automático na nuvem.",
  },
  {
    icon: Clock,
    title: "Cobranças Automáticas",
    description: "Receba alertas de parcelas vencidas e relatórios automáticos via Telegram.",
  },
  {
    icon: Shield,
    title: "Controle Financeiro",
    description: "Gerencie despesas, saldo e fluxo de caixa em um só lugar.",
  },
];

const testimonials = [
  {
    name: "Carlos M.",
    role: "Agente de crédito",
    text: "Antes eu controlava tudo em cadernos. Com o EmprestAI, reduzi a inadimplência em 40% e nunca mais perdi uma cobrança.",
    stars: 5,
  },
  {
    name: "Fernanda S.",
    role: "Empresária",
    text: "O sistema é muito fácil de usar. Consigo ver em tempo real quanto tenho a receber e meus lucros mensais. Recomendo demais!",
    stars: 5,
  },
  {
    name: "Roberto L.",
    role: "Financeiro autônomo",
    text: "A função de multi-usuários foi um divisor de águas. Minha equipe toda usa e cada um vê só o que precisa.",
    stars: 5,
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("plans")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setPlans(data);
        setLoading(false);
      });
  }, []);

  const scrollToPlans = () => {
    document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubscribe = (plan: Plan) => {
    navigate(`/cadastro?plan=${encodeURIComponent(plan.name)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />

      {/* Header */}
      <header className="border-b border-border/30 backdrop-blur-sm bg-background/80 sticky top-0 z-50 pt-safe">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2">
            <img src={logoIcon} alt="EmprestAI" className="h-9 w-9 rounded-xl" width={36} height={36} />
            <span className="text-lg font-bold text-foreground">EmprestAI</span>
          </button>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={scrollToPlans} className="hidden sm:inline-flex">
              Planos
            </Button>
            <Button variant="outline" onClick={() => navigate("/auth")}>
              Entrar
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-24 text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Zap className="h-3.5 w-3.5" />
            Gestão de empréstimos simplificada
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Controle seus empréstimos
            <br />
            <span className="text-primary">com inteligência</span>
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10">
            Plataforma completa para gerenciar empréstimos, clientes e finanças.
            Automatize cobranças, acompanhe pagamentos e maximize seus lucros.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={scrollToPlans} className="text-base px-8">
              Começar agora <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth")} className="text-base px-8">
              Já tenho conta
            </Button>
          </div>
          <button
            onClick={scrollToPlans}
            className="mt-16 mx-auto flex flex-col items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="text-xs mb-1">Saiba mais</span>
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </button>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-muted/30 border-y border-border/20">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-2xl md:text-4xl font-bold text-foreground text-center mb-4">
            Tudo que você precisa em um só lugar
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-14">
            Funcionalidades pensadas para quem trabalha com empréstimos e precisa de controle total.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b) => (
              <Card key={b.title} no3d className="bg-card/60 hover:bg-card transition-colors">
                <CardContent className="p-6 flex flex-col gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <b.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg">{b.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{b.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl md:text-4xl font-bold text-foreground text-center mb-4">
          Quem usa, recomenda
        </h2>
        <p className="text-muted-foreground text-center max-w-xl mx-auto mb-14">
          Veja o que nossos clientes dizem sobre o EmprestAI.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <Card key={t.name} no3d className="bg-card/60">
              <CardContent className="p-6 flex flex-col gap-4">
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-foreground text-sm leading-relaxed italic">"{t.text}"</p>
                <div className="mt-auto pt-2 border-t border-border/30">
                  <p className="font-semibold text-foreground text-sm">{t.name}</p>
                  <p className="text-muted-foreground text-xs">{t.role}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="bg-muted/30 border-y border-border/20 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <h2 className="text-2xl md:text-4xl font-bold text-foreground text-center mb-4">
            Escolha o plano ideal para você
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-14">
            Comece hoje mesmo. Sem contratos, cancele quando quiser.
          </p>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando planos...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((plan) => {
                const isLoading = checkoutLoading && checkoutPlan === plan.name;
                return (
                  <Card
                    key={plan.id}
                    no3d
                    className={`flex flex-col ${
                      plan.highlight
                        ? "border-primary/50 shadow-[0_0_30px_-8px_hsl(var(--primary)/0.3)] relative"
                        : ""
                    }`}
                  >
                    {plan.highlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold gradient-primary text-primary-foreground">
                        Mais popular
                      </div>
                    )}
                    <CardHeader className="text-center pb-2">
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <div className="mt-4">
                        <span className="text-4xl font-bold text-foreground">R$ {plan.price}</span>
                        <span className="text-muted-foreground">/mês</span>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col flex-1">
                      <ul className="space-y-3 flex-1">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="w-full rounded-full text-base py-6 font-semibold mt-6"
                        onClick={() => handleSubscribe(plan)}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Abrindo...
                          </>
                        ) : (
                          <>
                            Assinar agora <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CTA Final */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-4">
          Pronto para organizar suas finanças?
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto mb-8">
          Crie sua conta gratuitamente e comece a gerenciar seus empréstimos com mais controle e menos dor de cabeça.
        </p>
        <Button size="lg" onClick={scrollToPlans} className="text-base px-8">
          Criar conta grátis <ArrowRight className="h-4 w-4" />
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 bg-muted/20">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logoIcon} alt="EmprestAI" className="h-4 w-4 rounded" width={16} height={16} />
            <span>EmprestAI © {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap gap-6">
            <button onClick={() => navigate("/auth")} className="hover:text-foreground transition-colors">
              Entrar
            </button>
            <button onClick={scrollToPlans} className="hover:text-foreground transition-colors">
              Planos
            </button>
            <button onClick={() => navigate("/termos")} className="hover:text-foreground transition-colors">
              Termos de Uso
            </button>
            <button onClick={() => navigate("/reembolso")} className="hover:text-foreground transition-colors">
              Reembolso
            </button>
            <button onClick={() => navigate("/privacidade")} className="hover:text-foreground transition-colors">
              Privacidade
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
