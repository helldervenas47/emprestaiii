import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HandCoins, Check, ArrowRight } from "lucide-react";

const plans = [
  {
    name: "Básico",
    price: "29",
    highlight: false,
    features: [
      "Até 50 empréstimos ativos",
      "1 usuário",
      "Controle de parcelas",
      "Relatório WhatsApp",
      "Suporte por email",
    ],
  },
  {
    name: "Profissional",
    price: "59",
    highlight: true,
    features: [
      "Empréstimos ilimitados",
      "Até 3 usuários",
      "Relatórios completos",
      "Controle de despesas",
      "Gestão de clientes",
      "Suporte prioritário",
    ],
  },
  {
    name: "Empresarial",
    price: "99",
    highlight: false,
    features: [
      "Tudo do Profissional",
      "Usuários ilimitados",
      "Locação de veículos",
      "Controle de produtos e vendas",
      "Webhooks e integrações",
      "Suporte dedicado",
    ],
  },
];

const Pricing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center">
              <HandCoins className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">EmprestAI</span>
          </button>
          <Button variant="outline" onClick={() => navigate("/auth")}>
            Entrar
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-12 text-center">
        <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
          Escolha o plano ideal para você
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Gerencie empréstimos, clientes e finanças com facilidade. Comece hoje mesmo.
        </p>
      </section>

      {/* Plans */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              no3d
              className={
                plan.highlight
                  ? "border-primary/50 shadow-[0_0_30px_-8px_hsl(var(--primary)/0.3)] relative"
                  : ""
              }
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
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.highlight ? "default" : "outline"}
                  onClick={() => navigate("/auth")}
                >
                  Criar conta <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Pricing;
