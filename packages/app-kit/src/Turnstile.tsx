/**
 * Cloudflare Turnstile widget — the human check on the login screen. Loads the
 * Turnstile script once (explicit-render mode) and mounts a widget that hands a
 * token up via `onToken`. The token is short-lived, so we clear it on expiry /
 * error and let Turnstile re-issue. Rendered only when the platform has
 * configured a site key (see `/api/host`).
 */

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
}
declare global {
  interface Window { turnstile?: TurnstileApi; onloadTurnstile?: () => void }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({ siteKey, onToken, theme = "auto" }: { siteKey: string; onToken: (token: string | null) => void; theme?: "auto" | "light" | "dark" }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme,
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    }).catch(() => onToken(null));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) { try { window.turnstile.remove(widgetId.current); } catch { /* already gone */ } }
      widgetId.current = null;
    };
  }, [siteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} className="flex justify-center" />;
}
