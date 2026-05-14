import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Eye, EyeOff, Copy, Pencil, Trash2, Plus, MoreVertical, KeyRound, Plug, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "app_api_keys_v1";

interface ApiKeyEntry {
  id: string;
  name: string;
  key: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

function loadKeys(): ApiKeyEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveKeys(keys: ApiKeyEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

function maskKey(key: string): string {
  if (!key) return "—";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

interface AppIntegration {
  name: string;
  envVar: string;
  description: string;
  maskedKey: string;
  configured: boolean;
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<ApiKeyEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", key: "" });
  const [integrations, setIntegrations] = useState<AppIntegration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [integrationsLoaded, setIntegrationsLoaded] = useState(false);

  const loadIntegrations = async () => {
    setLoadingIntegrations(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-app-integrations");
      if (error) throw error;
      setIntegrations((data as any)?.integrations ?? []);
    } catch (e: any) {
      console.error("[ApiKeysManager] loadIntegrations", e);
      setIntegrations([]);
    } finally {
      setLoadingIntegrations(false);
    }
  };

  useEffect(() => {
    setKeys(loadKeys());
    loadIntegrations();
  }, []);

  const persist = (next: ApiKeyEntry[]) => {
    setKeys(next);
    saveKeys(next);
  };

  const openCreate = () => {
    setForm({ name: "", key: "" });
    setCreating(true);
  };

  const openEdit = (k: ApiKeyEntry) => {
    setForm({ name: k.name, key: k.key });
    setEditing(k);
  };

  const handleSave = () => {
    const name = form.name.trim();
    const key = form.key.trim();
    if (!name || !key) {
      toast.error("Preencha nome e chave");
      return;
    }
    if (editing) {
      persist(keys.map((k) => (k.id === editing.id ? { ...k, name, key } : k)));
      toast.success("Chave atualizada");
      setEditing(null);
    } else {
      const entry: ApiKeyEntry = {
        id: crypto.randomUUID(),
        name,
        key,
        active: true,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };
      persist([entry, ...keys]);
      toast.success("Chave adicionada");
      setCreating(false);
    }
  };

  const toggleActive = (id: string, value: boolean) => {
    persist(keys.map((k) => (k.id === id ? { ...k, active: value } : k)));
  };

  const handleDelete = (id: string) => {
    persist(keys.filter((k) => k.id !== id));
    toast.success("Chave removida");
    setDeletingId(null);
  };

  const handleCopy = async (k: ApiKeyEntry) => {
    try {
      await navigator.clipboard.writeText(k.key);
      persist(keys.map((it) => (it.id === k.id ? { ...it, lastUsedAt: new Date().toISOString() } : it)));
      toast.success("Chave copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const toggleReveal = (id: string) => {
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  };

  const dialogOpen = creating || !!editing;
  const closeDialog = () => {
    setCreating(false);
    setEditing(null);
  };

  const empty = useMemo(() => keys.length === 0, [keys]);

  return (
    <div className="space-y-6">
      {/* Conexões existentes do app (configuradas no backend) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Plug className="h-4 w-4 text-primary" /> Conexões existentes do app
            </h3>
            <p className="text-xs text-muted-foreground">
              Integrações já configuradas no backend. Por segurança, os valores não são exibidos.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={loadIntegrations} disabled={loadingIntegrations}>
            {loadingIntegrations ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {loadingIntegrations ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : integrations.length === 0 ? (
          <div className="border border-dashed rounded-lg py-6 text-center text-xs text-muted-foreground">
            Nenhuma conexão encontrada.
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Integração</TableHead>
                  <TableHead className="hidden sm:table-cell">Identificador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Descrição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.map((it) => (
                  <TableRow key={it.envVar}>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <code className="font-mono text-[11px] text-muted-foreground">{it.envVar}</code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={it.configured ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {it.configured ? "Configurada" : "Não configurada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {it.description}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Chaves customizadas (gerenciadas pelo usuário) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-primary" /> Minhas chaves
            </h3>
            <p className="text-xs text-muted-foreground">
              Chaves personalizadas gerenciadas neste dispositivo.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova chave
          </Button>
        </div>

      {empty ? (
        <div className="border border-dashed rounded-lg py-10 flex flex-col items-center text-center gap-2">
          <KeyRound className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhuma chave cadastrada</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Adicione a primeira chave de API para começar a integrar serviços externos.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integração</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Criada em</TableHead>
                <TableHead className="hidden md:table-cell">Última utilização</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs">
                        {revealed[k.id] ? k.key : maskKey(k.key)}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => toggleReveal(k.id)}
                        aria-label={revealed[k.id] ? "Ocultar" : "Visualizar"}
                      >
                        {revealed[k.id] ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={k.active}
                        onCheckedChange={(v) => toggleActive(k.id, v)}
                      />
                      <Badge variant={k.active ? "default" : "secondary"} className="text-[10px]">
                        {k.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {formatDate(k.createdAt)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {formatDate(k.lastUsedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toggleReveal(k.id)}>
                          {revealed[k.id] ? (
                            <><EyeOff className="h-3.5 w-3.5 mr-2" /> Ocultar</>
                          ) : (
                            <><Eye className="h-3.5 w-3.5 mr-2" /> Visualizar</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCopy(k)}>
                          <Copy className="h-3.5 w-3.5 mr-2" /> Copiar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(k)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(k.id, !k.active)}>
                          {k.active ? "Desativar" : "Ativar"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeletingId(k.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </section>


      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar chave de API" : "Nova chave de API"}</DialogTitle>
            <DialogDescription>
              As chaves ficam armazenadas neste dispositivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="api-key-name" className="text-xs">Nome da integração</Label>
              <Input
                id="api-key-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Stripe, OpenAI, WhatsApp"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="api-key-value" className="text-xs">Chave</Label>
              <Input
                id="api-key-value"
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="sk-..."
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover chave de API?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A integração que utiliza esta chave deixará de funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && handleDelete(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
