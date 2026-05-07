import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const STALE_CACHE_PATTERNS = [
  /is not defined/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Invalid hook call/i,
  /dispatcher\.useRef/i,
  /must be used within/i,
  /Cannot read propert(y|ies) of undefined/i,
  /Loading chunk \d+ failed/i,
  /Component is not a function/i,
  /'Component' is (undefined|an instance of Object)/i,
];

function isLikelyStaleCacheError(error: Error, componentStack = ""): boolean {
  const msg = error?.message || "";
  const stack = error?.stack || "";
  const details = `${msg}\n${stack}\n${componentStack}`;

  return STALE_CACHE_PATTERNS.some((re) => re.test(details));
}

async function hardRefresh() {
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
    // ignore
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
}

export class DevCacheErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  private componentStack = "";

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.componentStack = info.componentStack;

    if (isLikelyStaleCacheError(error, info.componentStack)) {
      const refreshKey = "emprestai-dev-cache-refresh";
      const lastRefresh = Number(sessionStorage.getItem(refreshKey) || 0);

      if (Date.now() - lastRefresh > 10_000) {
        sessionStorage.setItem(refreshKey, Date.now().toString());
        void hardRefresh();
      }
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[DevCacheErrorBoundary]", error);
    }
  }

  render() {
    if (!import.meta.env.DEV) return this.props.children;

    const { error } = this.state;
    if (!error) return this.props.children;
    if (!isLikelyStaleCacheError(error, this.componentStack)) throw error;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 shadow-lg space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              Cache desatualizado detectado
            </h2>
            <p className="text-sm text-muted-foreground">
              Parece que o preview está usando uma versão antiga em cache do Vite.
              Faça um refresh forçado para carregar a versão mais recente.
            </p>
          </div>
          <pre className="text-xs bg-muted text-muted-foreground rounded p-2 overflow-auto max-h-32">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={hardRefresh}
              className="flex-1 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition"
            >
              Recarregar agora
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center justify-center rounded-md border border-border text-foreground text-sm font-medium px-4 py-2 hover:bg-accent transition"
            >
              Ignorar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Atalho: <kbd className="px-1 py-0.5 rounded bg-muted">Ctrl/Cmd</kbd>{" "}
            + <kbd className="px-1 py-0.5 rounded bg-muted">Shift</kbd> +{" "}
            <kbd className="px-1 py-0.5 rounded bg-muted">R</kbd>
          </p>
        </div>
      </div>
    );
  }
}
