import { lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Users as UsersIcon, Image as ImageIcon, Loader2, ShieldCheck, Palette, Wallet, Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { ThemeSettingsCard } from "@/components/ThemeSettingsCard";

const UserManagement = lazy(() => import("@/components/UserManagement").then(m => ({ default: m.UserManagement })));
const BrandingSettings = lazy(() => import("@/components/BrandingSettings").then(m => ({ default: m.BrandingSettings })));
const InviteAndApprovalSettings = lazy(() => import("@/components/InviteAndApprovalSettings").then(m => ({ default: m.InviteAndApprovalSettings })));
const SystemHealth = lazy(() => import("@/components/SystemHealth").then(m => ({ default: m.SystemHealth })));

const SectionLoader = () => (
  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
);

function SectionHeader({ icon: Icon, title, description }: { icon: any; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 px-1">
      <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground tracking-tight">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

export function SystemSettings() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { subscription, isActive } = useSubscription();
  const isAdmin = role === "admin";

  const planLabel = isActive && subscription
    ? subscription.product_id === "basico_plan" ? "Básico"
    : subscription.product_id === "profissional_plan" ? "Profissional"
    : subscription.product_id === "empresarial_plan" ? "Empresarial" : "Plano ativo"
    : "Sem plano";

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Sistema</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Centralize as funcionalidades administrativas e operacionais da plataforma.
        </p>
      </div>

      {/* Administração */}
      {isAdmin && (
        <section className="space-y-4">
          <SectionHeader
            icon={ShieldCheck}
            title="Administração"
            description="Controle de acesso, aprovações e convites de novos usuários."
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersIcon className="h-4 w-4 text-primary" /> Gerenciamento de usuários
              </CardTitle>
              <CardDescription>Crie e gerencie usuários, papéis e permissões.</CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<SectionLoader />}>
                <UserManagement />
              </Suspense>
            </CardContent>
          </Card>

          <Suspense fallback={<SectionLoader />}>
            <InviteAndApprovalSettings />
          </Suspense>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" /> Saúde do sistema
              </CardTitle>
              <CardDescription>
                Painel administrativo com indicadores em tempo real: latência do banco, sessões ativas, contagens e status online.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<SectionLoader />}>
                <SystemHealth />
              </Suspense>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Conta e Assinatura */}
      <section className="space-y-4">
        <SectionHeader
          icon={Wallet}
          title="Conta e Assinatura"
          description="Gerencie seu plano e a assinatura da plataforma."
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-primary" /> Plano e assinatura
            </CardTitle>
            <CardDescription>
              Plano atual: <span className="font-semibold text-foreground">{planLabel}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/planos")} variant="outline" size="sm">
              Gerenciar plano
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Personalização */}
      <section className="space-y-4">
        <SectionHeader
          icon={Palette}
          title="Personalização"
          description="Customize a identidade visual e o tema do sistema."
        />

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="h-4 w-4 text-primary" /> Identidade visual
              </CardTitle>
              <CardDescription>
                Defina a logo oficial do sistema e personalize o tamanho em pixels para cada área e dispositivo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<SectionLoader />}>
                <BrandingSettings />
              </Suspense>
            </CardContent>
          </Card>
        )}

        <ThemeSettingsCard />
      </section>
    </div>
  );
}
