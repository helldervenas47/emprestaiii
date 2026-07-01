import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
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
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (!isLazyChunkError(error)) return;

    // Auto-reload once per session to try recovering from stale chunks
    const KEY = "lazy-chunk-auto-reload";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 30_000) {
      sessionStorage.setItem(KEY, Date.now().toString());
      void clearCachesAndReload();
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!isLazyChunkError(error)) throw error;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 shadow-lg space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Nova versão disponível
            </h2>
            <p className="text-sm text-muted-foreground">
              Uma nova versão do app foi publicada. Recarregue a página para
              carregar os arquivos atualizados.
            </p>
          </div>
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
