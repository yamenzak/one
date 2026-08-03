/**
 * Kova's session — `@4dl/app-kit`'s provider, plus the two things that are ours.
 *
 * The kit owns the whole boot sequence and its failure modes: the host probe,
 * `/api/context`, the offline-degraded fallback, the 401 handler, connectivity,
 * sign-out, and crossing to another studio. None of that is coaching-specific.
 *
 * Two things ARE Kova's and neither could live in a package:
 *
 *   MODE            coach ⇄ train. One person is both a coach and a client of
 *                   their own studio, and the toggle decides which surface they
 *                   see. Persisted per device.
 *   the ACTIVE      which client record a screen scopes to — the signed-in
 *   CLIENT          client's own, or the coach's own record while in train mode.
 *                   This is the read half of the row-level scope the API
 *                   enforces, and it is the most Kova-shaped idea in the app.
 *
 * ── The door is the hostname ────────────────────────────────────────────────
 *
 * There used to be a `/t/<slug>` ENTRY path here, plus a remembered "last door"
 * in localStorage, plus an effect that switched tenants after the session
 * resolved — three mechanisms answering "which studio is this?" on a single
 * shared host, none of which could actually pin a tenancy (only brand it).
 *
 * All of it is gone. `acme.kova.4dl.app` IS Acme: the server resolves the tenant
 * from the Host header before any of this code runs, sign-out returns to `/` on
 * whatever host you are on, and switching studios is a NAVIGATION to the other
 * studio's hostname rather than a state change on this one. That removes the
 * entire class of bug where the brand and the tenancy disagreed.
 *
 * The `?t=<tenantId>` hint on emailed links is kept, and it stays HERE rather
 * than in the kit: it needs the router, and a runtime package that picked one
 * would force it on every other 4DL app. Its job has shrunk anyway — a link
 * built by `canonicalHost` already points at the right host, so the hint is only
 * a redirect safety-net for older mail that pointed somewhere generic.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { adminUrl, appStorage, BRAND_CACHE, createSession, tenantUrl, type HostInfo as KitHostInfo, type HostRole } from "@4dl/app-kit";
import type { SessionContext, TenantBranding } from "@kova/protocol";

export { adminUrl };
export type { HostRole };

/** Kova's host info — the kit's, with the branding type filled in. */
export type HostInfo = KitHostInfo<TenantBranding>;

/** A studio's URL, by slug, on the platform root. Kova's word for a tenant. */
export const studioUrl = tenantUrl;

/**
 * Display preferences that are NOT identifying and carry no account data — the
 * chosen light/dark theme. Sign-out used to wipe every `kova`-prefixed key, so a
 * light-theme user signed back in to a dark app and had to re-set it every time.
 * Anything that could leak between accounts (session cache, per-plan shopping
 * lists) must stay OUT of the keep-list.
 *
 * The remembered door used to be here too. It no longer exists: the hostname is
 * the door, so there is nothing for the device to remember.
 *
 * The BOOT BRAND is kept for the same reason as the theme, one step further out:
 * it is this hostname's public identity — the name and colours anyone who loads
 * the address is shown before signing in — so it is not one account's data, and
 * dropping it on sign-out would put the platform's mark back on the first frame
 * of the next visit, which is the exact flash it exists to remove.
 */
export const store = appStorage("kova", ["kova-theme", `kova:${BRAND_CACHE}`]);

const kit = createSession<SessionContext, TenantBranding>({
  storage: store,
  tenantsOf: (ctx) => ctx.personas.map((p) => ({ tenantId: p.tenantId, slug: p.tenantSlug })),
});

type Mode = "coach" | "train";

interface ModeCtx {
  mode: Mode;
  setMode: (m: Mode) => void;
}
const ModeContext = createContext<ModeCtx | null>(null);
const MODE_KEY = "kova-mode";

/**
 * Kova's session — the kit's provider, wrapped in the two things that are ours.
 *
 * Composed by NESTING rather than by threading extra state through the factory:
 * a generic "and also carry this" parameter would be a worse API than a small
 * provider that happens to know what a coach is.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <kit.SessionProvider>
      <ModeProvider>{children}</ModeProvider>
    </kit.SessionProvider>
  );
}

function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() =>
    localStorage.getItem(MODE_KEY) === "train" ? "train" : "coach",
  );
  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    localStorage.setItem(MODE_KEY, m);
  }, []);
  // Inside the kit's provider, so it can read the resolved session.
  useTenantHint();
  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

/**
 * The tenant hint on an emailed deep link.
 *
 * A link opened in a fresh browser has no session context, so it cannot know
 * which studio to land in for a user who belongs to several. Once the session
 * resolves, if the hint names a DIFFERENT tenant, switch to it (the server
 * validates membership) — then strip the param so it does not re-fire or linger.
 * Runs once; the deep-link path and its item param (e.g. `?lab=`) are preserved
 * for the target screen.
 */
function useTenantHint(): void {
  const { loading, ctx, switchTenant } = kit.useSession();
  const [params, setParams] = useSearchParams();
  const done = useRef(false);
  useEffect(() => {
    if (loading || !ctx?.active || done.current) return;
    const t = params.get("t");
    done.current = true;
    if (!t) return;
    setParams((prev) => { prev.delete("t"); return prev; }, { replace: true });
    if (t !== ctx.active.tenantId) void switchTenant(t).catch(() => undefined);
  }, [loading, ctx, params, setParams, switchTenant]);
}

/** The kit's session, widened with Kova's mode. */
export function useSession() {
  const base = kit.useSession();
  const m = useContext(ModeContext);
  if (!m) throw new Error("useSession outside provider");
  return useMemo(() => ({ ...base, mode: m.mode, setMode: m.setMode }), [base, m.mode, m.setMode]);
}

export const useOnline = kit.useOnline;

/** The client record the current surface should scope to (train mode / client role). */
export function useActiveClientId(): string | null {
  const { ctx, mode } = useSession();
  if (!ctx?.active) return null;
  if (ctx.active.role === "client") return ctx.active.clientId;
  return mode === "train" ? ctx.active.clientId : null;
}
