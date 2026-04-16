import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Guard: never register service workers in preview/iframe contexts
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

const isInStandaloneMode =
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

if ((isPreviewHost || isInIframe) && !isInStandaloneMode) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
} else if (!isPreviewHost && !isInIframe) {
  // Auto-update SW: as soon as a new version is available, reload to apply it
  import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // New content available — activate and reload
        updateSW(true);
      },
      onRegisteredSW(_swUrl, registration) {
        // Periodically check for updates (every 60 minutes)
        if (registration) {
          setInterval(() => {
            registration.update().catch(() => {});
          }, 60 * 60 * 1000);
        }
      },
    });
  }).catch(() => {
    // virtual module not available (e.g. dev) — ignore
  });
}

createRoot(document.getElementById("root")!).render(<App />);
