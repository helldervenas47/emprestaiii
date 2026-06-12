import { lazy, Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreditCard, Users as UsersIcon, Image as ImageIcon, Loader2, ShieldCheck, Palette, Wallet, Activity, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { ThemeSettingsCard } from "@/components/ThemeSettingsCard";
import { TelegramImageDeliveryCard } from "@/components/TelegramImageDeliveryCard";

const UserManagement = lazy(() => import("@/components/UserManagement").then(m => ({ default: m.UserManagement })));
const BrandingSettings = lazy(() => import("@/components/BrandingSettings").then(m => ({ default: m.BrandingSettings })));
const InviteAndApprovalSettings = lazy(() => import("@/components/InviteAndApprovalSettings").then(m => ({ default: m.InviteAndApprovalSettings })));
const SystemHealth = lazy(() => import("@/components/SystemHealth").then(m => ({ default: m.SystemHealth })));
const ApiKeysManager = lazy(() => import("@/components/ApiKeysManager").then(m => ({ default: m.ApiKeysManager })));
const RolePermissionsMatrix = lazy(() => import("@/components/admin/RolePermissionsMatrix").then(m => ({ default: m.RolePermissionsMatrix })));

const SectionLoader = () => (
  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
);

export function SystemSettings() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { subscription, isActive } = useSubscription();
  const isAdmin = role === "admin";
  const [subTab, setSubTab] = useState<string>(isAdmin ? "admin" : "billing");

  const planLabel = isActive && subscription
    ? subscription.product_id === "basico_plan" ? "Básico"
    : subscription.product_id === "profissional_plan" ? "Profissional"
    : subscription.product_id === "empresarial_plan" ? "Empresarial" : "Plano ativo"
    : "Sem plano";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Sistema</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Centralize as funcionalidades administrativas e operacionais da plataforma.
        </p>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab} className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {isAdmin && (
            <TabsTrigger value="admin" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
              <ShieldCheck className="h-3.5 w-3.5" /> Administração
            </TabsTrigger>
          )}
          <TabsTrigger value="billing" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
            <Wallet className="h-3.5 w-3.5" /> Conta
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
            <Palette className="h-3.5 w-3.5" /> Personalização
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="api-keys" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
              <KeyRound className="h-3.5 w-3.5" /> Chaves APIs
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="health" className="flex items-center gap-1.5 flex-1 min-w-[120px]">
              <Activity className="h-3.5 w-3.5" /> Saúde do Sistema
            </TabsTrigger>
          )}
        </TabsList>

        {isAdmin && (
          <TabsContent value="admin" className="space-y-4 mt-4">
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
              <RolePermissionsMatrix />
            </Suspense>

            <Suspense fallback={<SectionLoader />}>
              <InviteAndApprovalSettings />
            </Suspense>

            <TelegramImageDeliveryCard />
          </TabsContent>
        )}

        <TabsContent value="billing" className="space-y-4 mt-4">
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
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4 mt-4">
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
        </TabsContent>

        {isAdmin && (
          <TabsContent value="api-keys" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4 text-primary" /> Chaves APIs
                </CardTitle>
                <CardDescription>
                  Liste, edite, ative/desative e remova as chaves de API utilizadas pelas integrações do aplicativo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<SectionLoader />}>
                  <ApiKeysManager />
                </Suspense>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="health" className="space-y-4 mt-4">
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
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
