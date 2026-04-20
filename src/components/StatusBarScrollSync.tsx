import { useEffect } from "react";

/**
 * Toggles `data-scrolled` on <body> when the user scrolls past the header
 * threshold, so the iOS status-bar overlay (body::before) can deepen its tint
 * for a more native feel.
 */
export function StatusBarScrollSync() {
  useEffect(() => {
    const THRESHOLD = 12;
    const update = () => {
      const scrolled = window.scrollY > THRESHOLD;
      if (document.body.dataset.scrolled === String(scrolled)) return;
      document.body.dataset.scrolled = String(scrolled);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return null;
}
