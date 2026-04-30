import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Satellite, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useTrackingProvider } from "@/hooks/useTrackingProvider";
import { toast } from "sonner";

export function VehicleTrackingSettingsCard() {
  const { provider, loading, save, remove, triggerSync } = useTrackingProvider();
  const [form, setForm] = useState({
    provider: "hapolo" as "hapolo" | "traccar" | "custom",
    base_url: "",
    auth_type: "bearer" as "basic" | "bearer",
    credential_secret_name: "",
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (provider) {
      setForm({
        provider: provider.provider,
        base_url: provider.base_url,
        auth_type: provider.auth_type,
        credential_secret_name: provider.credential_secret_name,
        enabled: provider.enabled,
      });
    }
  }, [provider]);

  const handleSave = async () => {
    if (!form.base_url || !form.credential_secret_name) {
      toast.error("Preencha URL base e nome do secret de credencial.");
      return;
    }
    setSaving(true);
    try {
      await save(form);
      toast.success("Configuração de rastreamento salva.");
    } catch (e: any) {
      toast.error("Falha ao salvar: " + (e?.message ?? "erro"));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await triggerSync();
      toast.success("Sincronização disparada.", { description: JSON.stringify(r?.result ?? {}).slice(0, 120) });
    } catch (e: any) {
      toast.error("Falha ao sincronizar: " + (e?.message ?? "erro"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Satellite className="h-4 w-4 text-primary" /> Rastreamento veicular
        </CardTitle>
        <CardDescription>
          Conecte seu provedor de rastreamento (Hapolo, Traccar ou API customizada) para exibir
          a localização ao vivo de cada veículo. Atualizado automaticamente a cada 3 min.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Provedor</Label>
                <Select value={form.provider} onValueChange={(v: any) => setForm((p) => ({ ...p, provider: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hapolo">Hapolo</SelectItem>
                    <SelectItem value="traccar">Traccar</SelectItem>
                    <SelectItem value="custom">API customizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo de autenticação</Label>
                <Select value={form.auth_type} onValueChange={(v: any) => setForm((p) => ({ ...p, auth_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearer">Bearer token</SelectItem>
                    <SelectItem value="basic">Basic (usuário:senha)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">URL base da API</Label>
              <Input value={form.base_url} onChange={(e) => setForm((p) => ({ ...p, base_url: e.target.value }))} placeholder="https://painel.hapolo.com.br" />
            </div>

            <div>
              <Label className="text-xs">Nome do secret com a credencial</Label>
              <Input value={form.credential_secret_name} onChange={(e) => setForm((p) => ({ ...p, credential_secret_name: e.target.value }))} placeholder="HAPOLO_API_TOKEN" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Crie o secret nas configurações do projeto. Para Bearer, contém o token; para Basic, o formato <code>usuario:senha</code>.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Sincronização ativa</p>
                <p className="text-xs text-muted-foreground">Desative para pausar o polling automático.</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
            </div>

            {provider?.last_sync_at && (
              <p className="text-xs text-muted-foreground">
                Última sync: {new Date(provider.last_sync_at).toLocaleString("pt-BR")}
                {provider.last_sync_error && <span className="block text-destructive">⚠ {provider.last_sync_error}</span>}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
              </Button>
              {provider && (
                <>
                  <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sincronizar agora
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Remover configuração?")) remove(); }}>
                    <Trash2 className="h-4 w-4 mr-1" /> Remover
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
