import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoadCallback?: () => void;
  }
}

// Sitekey de teste pública da Cloudflare (documentada oficialmente, sempre aprova).
const TEST_SITE_KEY = "1x00000000000000000000AA";
// Sitekey real de produção — só é usada se configurada via variável de ambiente pública.
const REAL_SITE_KEY = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as
  | string
  | undefined;

// Este é o ambiente de vibe coding / sandbox de preview — sempre tratado como ambiente de teste
// quando não há uma sitekey de produção real configurada.
const isPreviewEnv = !REAL_SITE_KEY || REAL_SITE_KEY.trim().length === 0;

export const TURNSTILE_SITE_KEY = isPreviewEnv ? TEST_SITE_KEY : REAL_SITE_KEY!;

export const TEST_BYPASS_TOKEN = "test-bypass-token";

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
}

export const TurnstileWidget = ({ onToken, onExpire, theme = "auto" }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Modo de teste: emite o token de bypass automaticamente ao montar,
  // liberando a verificação sem depender de nenhum serviço externo.
  useEffect(() => {
    if (!isPreviewEnv) return;
    const timer = window.setTimeout(() => {
      onToken(TEST_BYPASS_TOKEN);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Comportamento real do Turnstile quando houver sitekey de produção configurada.
  useEffect(() => {
    if (isPreviewEnv) return;

    let cancelled = false;

    function renderWidget() {
      if (cancelled) return;
      if (!containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme,
        callback: (token: string) => {
          onToken(token);
        },
        "expired-callback": () => {
          onExpire?.();
        },
        "error-callback": () => {
          onExpire?.();
        },
      });
    }

    if (window.turnstile) {
      setScriptLoaded(true);
      renderWidget();
    } else {
      const existingScript = document.getElementById("cf-turnstile-script");
      if (!existingScript) {
        const script = document.createElement("script");
        script.id = "cf-turnstile-script";
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoadCallback&render=explicit";
        script.async = true;
        script.defer = true;
        window.onTurnstileLoadCallback = () => {
          setScriptLoaded(true);
          renderWidget();
        };
        document.body.appendChild(script);
      } else {
        window.onTurnstileLoadCallback = () => {
          setScriptLoaded(true);
          renderWidget();
        };
      }
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // no-op
        }
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  if (isPreviewEnv) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">
            Verificação Cloudflare
            <span className="ml-2 inline-flex items-center rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-300">
              teste
            </span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">
            Ambiente de desenvolvimento — verificação aprovada automaticamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={containerRef} />
      {!scriptLoaded && (
        <p className="text-xs text-zinc-500">Carregando verificação de segurança…</p>
      )}
    </div>
  );
};

export default TurnstileWidget;