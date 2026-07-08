import { useEffect, useRef } from "react";

// Site Key público (Cloudflare Turnstile)
// Em preview/iframe/dev usamos a chave de teste oficial do Cloudflare
// (sempre passa) porque o hostname de preview e o iframe quebram o widget real.
const REAL_SITE_KEY = "0x4AAAAAADjsm1zbv6Za2tDq";
const TEST_SITE_KEY = "1x00000000000000000000AA";

const isPreviewEnv = (() => {
  if (typeof window === "undefined") return false;

  // Apps nativos (Capacitor) rodam em localhost/capacitor:// mas são PRODUÇÃO.
  const isNative =
    !!(window as any).Capacitor?.isNativePlatform?.() ||
    window.location.protocol === "capacitor:" ||
    window.location.protocol === "ionic:";
  if (isNative) return false;

  // Usa chave de teste apenas em preview do editor Lovable, dev local
  // e deploys .vercel.app. Publicado (.lovable.app / domínio custom) usa a real.
  const host = window.location.hostname;
  return (
    host.includes("id-preview--") ||
    host.includes("preview--") ||
    host.includes("lovableproject.com") ||
    host.endsWith(".vercel.app") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
})();

export const TURNSTILE_SITE_KEY = isPreviewEnv ? TEST_SITE_KEY : REAL_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
}

export const TurnstileWidget = ({ onToken, onExpire, theme = "auto" }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tryRender = () => {
      if (cancelled) return;
      if (!window.turnstile || !ref.current) {
        setTimeout(tryRender, 200);
        return;
      }
      if (widgetId.current) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme,
        callback: (token: string) => onToken(token),
        "expired-callback": () => onExpire?.(),
        "error-callback": () => onExpire?.(),
      });
    };
    tryRender();

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* noop */ }
      }
      widgetId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="flex justify-center" />;
};
