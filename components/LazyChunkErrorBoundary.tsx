import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  diagnostics: string | null;
}

const LAZY_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk \d+ failed/i,
  /error loading dynamically imported module/i,
  /Loading CSS chunk \d+ failed/i,
];

function isLazyChunkError(error: Error): boolean {
  const msg = `${error?.message || ""}\n${error?.stack || ""}`;
  return LAZY_CHUNK_PATTERNS.some((re) => re.test(msg));
}

/**
 * Extract the failing chunk URL from an error message/stack.
 * Vite formats these errors as:
 *   "Failed to fetch dynamically imported module: https://.../assets/IncomeList-abc.js"
 */
function extractChunkUrl(error: Error): string | null {
  const text = `${error?.message || ""}\n${error?.stack || ""}`;
  const match = text.match(/https?:\/\/[^\s'")]+\.(?:js|mjs|css)/i);
  return match ? match[0] : null;
}

async function probeChunk(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return `HTTP ${res.status} ${res.statusText} (content-type: ${res.headers.get("content-type") || "n/a"})`;
  } catch (e: any) {
    return `network error: ${e?.message || e}`;
  }
}

async function clearCachesAndReload() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
}

export class LazyChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null, diagnostics: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, diagnostics: null };
  }

  async componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (!isLazyChunkError(error)) return;

    const chunkUrl = extractChunkUrl(error);
    const probe = chunkUrl ? await probeChunk(chunkUrl) : "no URL found in error";

    // Structured diagnostics (visible in DevTools + on-screen in dev)
    const diag = {
      message: error.message,
      chunkUrl,
      probe,
      stack: error.stack,
      componentStack: info?.componentStack,
      href: window.location.href,
      ua: navigator.userAgent,
      swControlled: !!navigator.serviceWorker?.controller,
      time: new Date().toISOString(),
    };
    // eslint-disable-next-line no-console
    console.error("[LazyChunkErrorBoundary]", diag);
    try {
      (window as any).__LAZY_CHUNK_ERROR__ = diag;
    } catch { /* noop */ }

    this.setState({
      diagnostics: `chunk: ${chunkUrl || "unknown"}\nprobe: ${probe}\nmessage: ${error.message}`,
    });

    // Auto-reload once per 30s to try recovering from stale chunks
    const KEY = "lazy-chunk-auto-reload";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 30_000) {
      sessionStorage.setItem(KEY, Date.now().toString());
      void clearCachesAndReload();
    }
  }

  render() {
    const { error, diagnostics } = this.state;
    if (!error) return this.props.children;
    if (!isLazyChunkError(error)) throw error;

    const isDev = import.meta.env.DEV;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-lg border border-border bg-card p-6 shadow-lg space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Nova versão disponível
            </h2>
            <p className="text-sm text-muted-foreground">
              Uma nova versão do app foi publicada. Recarregue a página para
              carregar os arquivos atualizados.
            </p>
          </div>
          {isDev && diagnostics && (
            <pre className="text-[11px] whitespace-pre-wrap break-all bg-muted p-3 rounded border border-border max-h-64 overflow-auto">
              {diagnostics}
            </pre>
          )}
          <button
            type="button"
            onClick={clearCachesAndReload}
            className="w-full inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
