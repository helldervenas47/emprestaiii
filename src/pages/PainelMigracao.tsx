import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Eye, EyeOff, Copy, Check, ShieldAlert, Key, Download,
  Loader2, Code2, Database, AlertTriangle, Info,
} from "lucide-react";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/painel-migracao`;

type TableInfo = {
  tablename: string;
  row_count: number;
  column_count: number;
  encrypted_columns: number;
  has_user_id: boolean;
};

type PanelData = {
  project_url: string;
  anon_key: string;
  service_role_key: string;
  secrets: Record<string, string>;
  edge_functions: string[];
  edge_functions_count: number;
  database_tables: TableInfo[];
};

function mask(v: string) {
  if (!v) return "";
  if (v.length <= 24) return v;
  return `${v.slice(0, 12)}•••••${v.slice(-8)}`;
}

function classifyTable(t: TableInfo): "Essencial" | "Histórico" | "Ignorar" {
  const n = t.tablename.toLowerCase();
  if (/(log|audit|history|backup|snapshot|cache)/.test(n)) return "Histórico";
  if (/(temp|tmp|debug|test)/.test(n)) return "Ignorar";
  return "Essencial";
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success(`${label ?? "Copiado"}!`);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {label && <span className="ml-2">{label}</span>}
    </Button>
  );
}

function RevealRow({ label, value }: { label: string; value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-2 border rounded-md p-2 bg-muted/40">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <code className="text-xs break-all">{shown ? value : mask(value)}</code>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setShown((s) => !s)}>
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <CopyButton value={value} />
    </div>
  );
}

export default function PainelMigracao() {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(false);

  async function revelarTudo() {
    setLoading(true);
    try {
      const r = await fetch(FUNCTIONS_URL, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as PanelData;
      setData(json);
      toast.success("Dados revelados!");
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function downloadEdgeFunctions() {
    const modules = import.meta.glob("/supabase/functions/*/index.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    let out = "";
    let count = 0;
    for (const [path, code] of Object.entries(modules)) {
      const name = path.split("/").slice(-2)[0];
      out += `// ═══ ${name} ═══\n${code}\n\n`;
      count++;
    }
    const blob = new Blob([out], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edge-functions.ts";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${count} funções exportadas`);
  }

  function downloadSecrets() {
    if (!data) return;
    const entries = Object.entries(data.secrets)
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join("\n");
    const content = `export const SECRETS = {\n${entries}\n} as const;\n\nexport type SecretKey = keyof typeof SECRETS;\n`;
    const blob = new Blob([content], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "secrets.ts";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("secrets.ts baixado");
  }

  function copiarTudo() {
    if (!data) return;
    const sep = "\n═══════════════════════════════════════\n";
    const parts = [
      `${sep}CREDENCIAIS${sep}`,
      `Project URL: ${data.project_url}`,
      `Anon Key: ${data.anon_key}`,
      `Service Role Key: ${data.service_role_key}`,
      `${sep}EDGE FUNCTIONS (${data.edge_functions_count})${sep}`,
      data.edge_functions.join("\n"),
      `${sep}SECRETS${sep}`,
      Object.entries(data.secrets).map(([k, v]) => `${k}=${v}`).join("\n"),
      `${sep}TABELAS (${data.database_tables.length})${sep}`,
      data.database_tables.map((t) => `${t.tablename} (${t.row_count} linhas)`).join("\n"),
    ];
    navigator.clipboard.writeText(parts.join("\n"));
    toast.success("Tudo copiado!");
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold">Painel de Migração</h1>
          <p className="text-muted-foreground">
            Copie os itens abaixo na ordem e cole na extensão CloneSupa.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={revelarTudo} disabled={loading}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Eye className="h-5 w-5 mr-2" />}
            Revelar Tudo
          </Button>
          {data && (
            <Button size="lg" variant="secondary" onClick={copiarTudo}>
              <Copy className="h-5 w-5 mr-2" /> Copiar Tudo
            </Button>
          )}
        </div>

        {/* Passo 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Passo 1 — Credenciais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data ? (
              <>
                <RevealRow label="Project URL" value={data.project_url} />
                <RevealRow label="Anon Key" value={data.anon_key} />
                <RevealRow label="Service Role Key" value={data.service_role_key} />
                <div className="flex flex-wrap gap-2 pt-2">
                  <CopyButton value={data.project_url} label="Copiar Project URL" />
                  <CopyButton value={data.service_role_key} label="Copiar Service Role Key" />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Clique em "Revelar Tudo" para carregar.</p>
            )}
          </CardContent>
        </Card>

        {/* Passo 2 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-primary" />
              Passo 2 — Edge Functions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data ? (
              <>
                <div className="flex flex-wrap gap-1">
                  {data.edge_functions.map((f) => (
                    <Badge key={f} variant="secondary">{f}</Badge>
                  ))}
                </div>
                <Button onClick={downloadEdgeFunctions}>
                  <Download className="h-4 w-4 mr-2" /> Baixar edge-functions.ts
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Aguardando dados…</p>
            )}
          </CardContent>
        </Card>

        {/* Passo 3 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-500" />
              Passo 3 — Secrets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data ? (
              <>
                <div className="space-y-2">
                  {Object.entries(data.secrets).map(([k, v]) => (
                    <RevealRow key={k} label={k} value={v} />
                  ))}
                </div>
                <Button onClick={downloadSecrets}>
                  <Download className="h-4 w-4 mr-2" /> Baixar secrets.ts
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Aguardando dados…</p>
            )}
          </CardContent>
        </Card>

        {/* Passo 4 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-500" />
              Passo 4 — Conferência
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data ? (
              <>
                <p className="text-sm">
                  <Info className="inline h-4 w-4 mr-1" />
                  {data.database_tables.length} tabelas detectadas no schema public.
                </p>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2">Tabela</th>
                        <th className="text-right p-2">Linhas</th>
                        <th className="text-right p-2">Colunas</th>
                        <th className="text-left p-2">Classe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.database_tables.map((t) => {
                        const cls = classifyTable(t);
                        return (
                          <tr key={t.tablename} className="border-t">
                            <td className="p-2 font-mono">{t.tablename}</td>
                            <td className="p-2 text-right">{t.row_count}</td>
                            <td className="p-2 text-right">{t.column_count}</td>
                            <td className="p-2">
                              <Badge variant={cls === "Essencial" ? "default" : cls === "Histórico" ? "secondary" : "outline"}>
                                {cls}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-start gap-2 p-3 border rounded-md bg-amber-500/10 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                  <p>
                    Senhas são copiadas como hash bcrypt. Se o JWT secret do destino for diferente,
                    sessões antigas serão invalidadas, mas as senhas continuam válidas para novo login.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Aguardando dados…</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
