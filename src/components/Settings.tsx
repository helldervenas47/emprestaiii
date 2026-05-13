import { useState } from "react";
import { lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Bell, Send, Webhook, MessageSquare, CreditCard, Users as UsersIcon, DatabaseBackup, User as UserIcon, Sun, Moon, Eye, EyeOff, Trash2, Loader2, BarChart3, Sparkles, Image as ImageIcon, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { PendingSyncCard } from "@/components/PendingSyncCard";
import { TimezoneSettingsCard } from "@/components/TimezoneSettingsCard";
import { AIVoiceSettingsCard } from "@/components/AIVoiceSettingsCard";
import { ThemeSettingsCard } from "@/components/ThemeSettingsCard";

const NotificationSettings = lazy(() => import("@/components/NotificationSettings").then(m => ({ default: m.NotificationSettings })));
const PaymentFeedbackSettings = lazy(() => import("@/components/PaymentFeedbackSettings").then(m => ({ default: m.PaymentFeedbackSettings })));
const WebhookSettings = lazy(() => import("@/components/WebhookSettings").then(m => ({ default: m.WebhookSettings })));
const TelegramConnectCard = lazy(() => import("@/components/TelegramConnectCard").then(m => ({ default: m.TelegramConnectCard })));
const TelegramReportsConnectCard = lazy(() => import("@/components/TelegramReportsConnectCard").then(m => ({ default: m.TelegramReportsConnectCard })));
const TelegramBillingScheduleCard = lazy(() => import("@/components/TelegramBillingScheduleCard").then(m => ({ default: m.TelegramBillingScheduleCard })));
const TelegramBotsManager = lazy(() => import("@/components/TelegramBotsManager").then(m => ({ default: m.TelegramBotsManager })));
const PushNotificationToggle = lazy(() => import("@/components/PushNotificationToggle").then(m => ({ default: m.PushNotificationToggle })));
const UserManagement = lazy(() => import("@/components/UserManagement").then(m => ({ default: m.UserManagement })));
const BackupExport = lazy(() => import("@/components/BackupExport").then(m => ({ default: m.BackupExport })));
const LocadorList = lazy(() => import("@/components/LocadorList").then(m => ({ default: m.LocadorList })));
const BrandingSettings = lazy(() => import("@/components/BrandingSettings").then(m => ({ default: m.BrandingSettings })));
const ActiveSessionsCard = lazy(() => import("@/components/ActiveSessionsCard").then(m => ({ default: m.ActiveSessionsCard })));
const InviteAndApprovalSettings = lazy(() => import("@/components/InviteAndApprovalSettings").then(m => ({ default: m.InviteAndApprovalSettings })));
const PaymentMethodsManager = lazy(() => import("@/components/PaymentMethodsManager").then(m => ({ default: m.PaymentMethodsManager })));

const SectionLoader = () => (
  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
);

interface SettingsProps {
  // Backup props (passados pelo Index)
  backup: React.ComponentProps<typeof BackupExport>;
  // Locadores
  locadores: any[];
  onSaveLocador: (l: any) => any;
  onRemoveLocador: (id: string) => any;
  isReadOnly: boolean;
  // Tema
  dark: boolean;
  onToggleTheme: () => void;
}

export function Settings({ backup, locadores, onSaveLocador, onRemoveLocador, isReadOnly, dark, onToggleTheme }: SettingsProps) {
  const { role } = useAuth();
  const { hidden, toggle: toggleHidden } = useHideValues();
  const navigate = useNavigate();
  const { subscription, isActive } = useSubscription();
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmGlobalSignOut, setConfirmGlobalSignOut] = useState(false);
  const [signingOutGlobal, setSigningOutGlobal] = useState(false);
  const isAdmin = role === "admin";

  const handleGlobalSignOut = async () => {
    setSigningOutGlobal(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      toast.success("Sessão encerrada em todos os dispositivos.");
      setTimeout(() => navigate("/auth", { replace: true }), 400);
    } catch (e: any) {
      toast.error("Falha ao encerrar sessões: " + (e?.message || "erro desconhecido"));
      setSigningOutGlobal(false);
    }
  };

  const planLabel = isActive && subscription
    ? subscription.product_id === "basico_plan" ? "Básico"
    : subscription.product_id === "profissional_plan" ? "Profissional"
    : subscription.product_id === "empresarial_plan" ? "Empresarial" : "Plano ativo"
    : "Sem plano";

  const handleClearCache = async () => {
    setClearing(true);
    try {
      // Limpa Cache API
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // Desregistra service workers (forçando recarregar assets)
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      toast.success("Cache limpo. Recarregando…");
      setTimeout(() => window.location.reload(), 600);
    } catch (e: any) {
      toast.error("Falha ao limpar cache: " + (e?.message || "erro desconhecido"));
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Configurações</h2>
        <p className="text-sm text-muted-foreground mt-1">Gerencie preferências, notificações, dados e sua conta.</p>
      </div>

      {/* Sincronização offline */}
      <PendingSyncCard />

      {/* Preferências de exibição */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Preferências de exibição
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {hidden ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">Ocultar valores</p>
                <p className="text-xs text-muted-foreground">Esconde os valores monetários na interface</p>
              </div>
            </div>
            <Switch checked={hidden} onCheckedChange={toggleHidden} />
          </div>
        </CardContent>
      </Card>

      {/* Fuso horário */}
      <TimezoneSettingsCard disabled={isReadOnly} />

      {/* Voz dos relatórios por IA */}
      <AIVoiceSettingsCard />

      {/* Notificações e integrações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-primary" /> Notificações e integrações
          </CardTitle>
          <CardDescription>Configure todos os canais de envio de alertas e relatórios.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="push">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2"><Bell className="h-4 w-4" /> Notificações Push</span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SectionLoader />}>
                  <div className="py-2">
                    <PushNotificationToggle />
                  </div>
                </Suspense>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="email">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2"><Bell className="h-4 w-4" /> Preferências de notificação</span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SectionLoader />}>
                  <NotificationSettings />
                  <div className="mt-4">
                    <PaymentFeedbackSettings />
                  </div>
                </Suspense>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="telegram-bots">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2"><Send className="h-4 w-4" /> Bots do Telegram</span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SectionLoader />}>
                  <TelegramBotsManager />
                </Suspense>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="telegram-billing">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2"><Send className="h-4 w-4" /> Telegram — Cobrança</span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SectionLoader />}>
                  <div className="space-y-4">
                    <TelegramConnectCard />
                    <TelegramBillingScheduleCard />
                  </div>
                </Suspense>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="telegram-reports">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Telegram — Relatórios</span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SectionLoader />}>
                  <TelegramReportsConnectCard />
                </Suspense>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="webhook">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhook personalizado</span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SectionLoader />}>
                  <WebhookSettings />
                </Suspense>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Dados do locador */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="h-4 w-4 text-primary" /> Dados do locador
          </CardTitle>
          <CardDescription>Cadastros usados em contratos de aluguel de veículos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<SectionLoader />}>
            <LocadorList locadores={locadores} onSave={onSaveLocador} onDelete={onRemoveLocador} readOnly={isReadOnly} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Formas de pagamento */}
      <Suspense fallback={<SectionLoader />}>
        <PaymentMethodsManager readOnly={isReadOnly} />
      </Suspense>

      {/* Backup e exportação */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseBackup className="h-4 w-4 text-primary" /> Backup e exportação
          </CardTitle>
          <CardDescription>Exporte seus dados em CSV ou importe um backup anterior.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<SectionLoader />}>
            <BackupExport {...backup} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Identidade visual (admin) */}
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

      {/* Gerenciamento de usuários (admin) */}
      {isAdmin && (
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
      )}

      {/* Aprovação e convites (admin) */}
      {isAdmin && (
        <Suspense fallback={<SectionLoader />}>
          <InviteAndApprovalSettings />
        </Suspense>
      )}

      {/* Limpeza de cache */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-destructive" /> Limpar cache do navegador
          </CardTitle>
          <CardDescription>
            Remove o cache de assets e atualizações pendentes do app. Mantém seu login e preferências.
            Útil quando uma nova versão não carregou corretamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirmClear(true)} disabled={clearing} size="sm">
            {clearing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Limpando…</> : <><Trash2 className="h-4 w-4 mr-2" /> Limpar cache e recarregar</>}
          </Button>
        </CardContent>
      </Card>

      {/* Sessões ativas */}
      <Suspense fallback={<SectionLoader />}>
        <ActiveSessionsCard />
      </Suspense>

      {/* Segurança da conta */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LogOut className="h-4 w-4 text-destructive" /> Segurança da conta
          </CardTitle>
          <CardDescription>
            Encerre a sessão em todos os dispositivos onde você está logado. Útil em caso de perda, roubo
            ou suspeita de acesso não autorizado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => setConfirmGlobalSignOut(true)}
            disabled={signingOutGlobal}
            size="sm"
          >
            {signingOutGlobal ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Encerrando…</>
            ) : (
              <><LogOut className="h-4 w-4 mr-2" /> Sair de todos os dispositivos</>
            )}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Limpar cache do navegador"
        description="O app vai recarregar para baixar a versão mais recente. Seus dados e login serão preservados."
        onConfirm={handleClearCache}
      />

      <ConfirmDeleteDialog
        open={confirmGlobalSignOut}
        onOpenChange={setConfirmGlobalSignOut}
        title="Sair de todos os dispositivos"
        description="Você será deslogado em todos os celulares, tablets e computadores onde está logado. Será necessário entrar novamente em cada um."
        onConfirm={handleGlobalSignOut}
      />
    </div>
  );
}
