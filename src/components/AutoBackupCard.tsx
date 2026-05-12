import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Cloud, ExternalLink, Key, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RestoreBackupDialog } from "./RestoreBackupDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BackupHistoryItem {
  id: string;
  created_at: string;
  drive_url: string | null;
  drive_file_id: string | null;
  filename: string | null;
  size_bytes: number | null;
  status: string;
  error: string | null;
  triggered_by: string;
}

function formatSize(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function AutoBackupCard() {
  const [enabled, setEnabled] = useState(true);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [savingToggle, setSavingToggle] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: settings } = await supabase
        .from("account_settings")
        .select("auto_backup_enabled, last_auto_backup_at, last_auto_backup_drive_url")
        .maybeSingle();
      if (settings) {
        setEnabled(settings.auto_backup_enabled ?? true);
        setLastAt(settings.last_auto_backup_at);
        setLastUrl(settings.last_auto_backup_drive_url);
      }
      const { data: hist } = await supabase
        .from("backup_history")
        .select("id, created_at, drive_url, drive_file_id, filename, size_bytes, status, error, triggered_by")
        .order("created_at", { ascending: false })
        .limit(20);
      setHistory((hist as BackupHistoryItem[]) || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggle(value: boolean) {
    setSavingToggle(true);
    setEnabled(value);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingToggle(false); return; }
    const { error } = await supabase
      .from("account_settings")
      .update({ auto_backup_enabled: value })
      .eq("owner_id", user.id);
    setSavingToggle(false);
    if (error) {
      toast.error("Não foi possível salvar a preferência");
      setEnabled(!value);
    } else {
      toast.success(value ? "Backup automático ativado" : "Backup automático desativado");
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-backup", { body: {} });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error || "Falha");
      toast.success("Backup gerado e enviado para o Google Drive!");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar backup");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="border-border/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Cloud className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Backup automático no Google Drive</CardTitle>
              <CardDescription>
                Snapshot diário (às 03:00) de todos os seus dados, enviado em JSON para o Google Drive. Mantém os últimos 30 backups.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{enabled ? "Ativo" : "Desativado"}</span>
            <Switch checked={enabled} disabled={savingToggle} onCheckedChange={toggle} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-border/40 bg-muted/30 p-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Último backup</div>
            <div className="font-medium">
              {loading ? "Carregando..." : lastAt ? formatDate(lastAt) : "Nenhum backup gerado ainda"}
            </div>
          </div>
          <div className="flex gap-2">
            {lastUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={lastUrl} target="_blank" rel="noreferrer" className="gap-1">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir no Drive
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setRestoreOpen(true)} className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar
            </Button>
            <Button size="sm" onClick={runNow} disabled={running} className="gap-1">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Gerar agora
            </Button>
          </div>
        </div>

        {history.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2">Histórico recente</div>
            <div className="rounded-md border border-border/40 divide-y divide-border/40 max-h-72 overflow-auto">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {h.filename || (h.status === "error" ? "Falha no backup" : "Backup")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(h.created_at)} · {h.triggered_by === "cron" ? "automático" : "manual"} · {formatSize(h.size_bytes)}
                      {h.status === "error" && <span className="text-destructive"> · {h.error}</span>}
                    </div>
                  </div>
                  {h.drive_url && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={h.drive_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <RestoreBackupDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        history={history}
        onRestored={() => { load(); setTimeout(() => window.location.reload(), 1500); }}
      />
    </Card>
  );
}
