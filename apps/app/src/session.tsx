/**
 * Session provider — loads /api/context once (and on demand), exposes the
 * active persona + coach/train mode (DESIGN.md §5: role changes scope +
 * powers + nav, never screens).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { SessionContext, TenantBranding } from "@mossa/protocol";
import { api, isOffline, setUnauthorizedHandler } from "./api.js";

/**
 * The door you came in through: the slug of the last studio this device had an
 * active session in. NOT identifying (a public slug, no account data) and the
 * one thing sign-out must NOT forget, because it is what sign-out navigates to.
 */
/**
 * The door in the URL THE APP WAS OPENED WITH, captured once at module load.
 *
 * This has to be read before React renders anything, because `/t/<slug>` is an
 * ENTRY path, not a route: nothing in the Shell matches it, so the catch-all
 * `<Route path="*" element={<Navigate to="/today" replace />} />` rewrites the
 * URL the instant a session resolves. And `Navigate` is a descendant of this
 * provider, so its effect runs BEFORE ours — an effect here that read
 * `location.pathname` would find `/today` and conclude there was no door.
 *
 * (That rewrite is the right behaviour and answers the obvious question: the
 * `/t/<slug>` prefix is not sticky. Once you are in, the app runs on clean paths
 * — /today, /train, /clients/… — on whichever hostname served it.)
 */
const ENTRY = {
  slug: /^\/t\/([^/?#]+)/.exec(window.location.pathname)?.[1] ?? null,
  tenantHint: new URLSearchParams(window.location.search).get("t"),
};

export const LAST_DOOR_KEY = "mossa:last-door";

export function rememberDoor(slug: string | null | undefined): void {
  if (!slug) return;
  try { localStorage.setItem(LAST_DOOR_KEY, slug); } catch { /* private mode */ }
}

/** The studio door to return to when signed out, if this device knows one. */
export function lastDoor(): string | null {
  try { return localStorage.getItem(LAST_DOOR_KEY) || null; } catch { return null; }
}

/**
 * Display preferences that are NOT identifying and carry no account data — the
 * chosen light/dark theme, and the studio door to come back to. Sign-out used to
 * wipe every `mossa`-prefixed key, so a light-theme user signed back in to a dark
 * app and had to re-set it every time. Anything that could leak between accounts
 * (session cache, per-plan shopping lists) must stay OUT of here.
 *
 * The tinted nav and ambient wash used to be listed here too. They now live in
 * the tenant's branding rather than on the device, so there is nothing local to
 * preserve — and leaving the dead keys behind would have quietly restored one
 * studio's chrome after signing into another.
 */
const KEEP_ON_SIGN_OUT = new Set(["mossa-theme", LAST_DOOR_KEY]);

/** Remove the app's own localStorage keys (mode, cached session, per-plan
 *  shopping lists) — all `mossa`-prefixed — so nothing leaks across accounts. */
function clearAppStorage(): void {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("mossa") && !KEEP_ON_SIGN_OUT.has(k)) localStorage.removeItem(k);
    }
  } catch { /* private mode */ }
}

/**
 * Last successful /api/context payload. The PWA precaches the app shell so it
 * opens with no signal, but /api/context is never cached (and can't be: it's
 * per-session) — so a cold offline start used to throw, null the session, and
 * render the OTP login screen. That made the entire offline-first capability
 * unreachable in its primary use case: install the app, lock the phone, walk
 * into a basement gym, tap the icon. Persisting the payload lets a cold start
 * with no network render the real app (degraded) instead of logging the user out.
 *
 * This is a UI convenience only — never an authorization decision. The session
 * cookie is HttpOnly and every read/write is still authorized server-side, so a
 * restored payload cannot grant access to anything. A real 401 clears it.
 */
const CTX_CACHE_KEY = "mossa:ctx-cache";
function readCachedCtx(): SessionContext | null {
  try {
    const raw = localStorage.getItem(CTX_CACHE_KEY);
    return raw ? (JSON.parse(raw) as SessionContext) : null;
  } catch { return null; }
}
function writeCachedCtx(data: SessionContext | null): void {
  try {
    if (data) localStorage.setItem(CTX_CACHE_KEY, JSON.stringify(data));
    else localStorage.removeItem(CTX_CACHE_KEY);
  } catch { /* private mode / quota */ }
}

type Mode = "coach" | "train";

/** Which tenant (if any) owns the domain the app is served on (SPEC §14.1). */
export interface HostInfo {
  platform: boolean;
  tenant: { tenantId: string; name: string; slug: string; branding: TenantBranding | null; allowSignup: boolean } | null;
  /** Cloudflare Turnstile — the login renders the widget when a site key is set
   *  and `enabled` (a server secret is configured, so codes are gated on it). */
  turnstile?: { siteKey: string | null; enabled: boolean } | null;
}

interface Session {
  loading: boolean;
  ctx: SessionContext | null;
  /** Custom-domain tenant, resolved pre-auth. Null on the platform host. */
  host: HostInfo | null;
  /** Live connectivity. Drives the offline banner and pauses retry loops. */
  online: boolean;
  /** True when `ctx` came from the localStorage cache because the network was
   *  unreachable — the app is usable but reads may be stale and writes queue. */
  degraded: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  refresh: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [host, setHost] = useState<HostInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  // `navigator.onLine === false` is trustworthy (no interface / airplane mode);
  // `true` only means "there is a link", so a fetch can still fail. We treat a
  // failed context read as offline too (below).
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [mode, setModeState] = useState<Mode>(() =>
    localStorage.getItem("mossa-mode") === "train" ? "train" : "coach",
  );

  // Is this the neutral platform host, or a tenant's own domain? Decides whether
  // sign-out needs an explicit `/t/<slug>` to reach the studio door, or whether
  // `/` already is it. Unresolved (null) counts as platform: a `/t/<slug>` on a
  // custom domain still resolves that tenant, so the fallback is never wrong.
  const hostIsPlatform = host?.platform !== false;

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<SessionContext>("/api/context");
      setCtx(data);
      writeCachedCtx(data);
      // Remember which studio door this device belongs to, for sign-out and for
      // `/` on the platform host. Written on every context read, so switching
      // studios moves the door with you.
      rememberDoor(data.active?.tenantSlug);
      setDegraded(false);
    } catch (e) {
      // A NETWORK failure is not a sign-out. Restore the last known session so a
      // cold start in a no-signal gym renders the app (degraded) instead of the
      // OTP login screen — which is where the write queue becomes unreachable.
      // An actual 401 goes through setUnauthorizedHandler below, which clears
      // both the state and the cache so a signed-out user never looks signed in.
      const cached = isOffline(e) ? readCachedCtx() : null;
      if (cached) {
        setCtx(cached);
        setDegraded(true);
      } else {
        setCtx(null);
        setDegraded(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Resolve which tenant brands this login, once, in parallel.
   *
   * Three ways to know the door, most explicit first — a custom domain pins it
   * via the Host header, so this only matters on the platform host:
   *
   *  1. `/t/<slug>` — the branded entry a studio hands out before it buys a domain.
   *  2. `?t=<tenantId>` — the hint every emailed CTA already carries. This used
   *     to be read ONLY after the session resolved, so a signed-out recipient
   *     clicked a link that named their studio and still got a studio-less login.
   *  3. The remembered door — this device had a session in that studio, so that
   *     is whose login it should show, not Mossa's.
   *
   * All three brand WITHOUT pinning: cross-tenant switching after sign-in is
   * unaffected, and the origin never changes, so a passkey registered here keeps
   * working whichever door is showing.
   */
  useEffect(() => {
    const slug = /^\/t\/([^/?#]+)/.exec(location.pathname)?.[1];
    const hinted = new URLSearchParams(location.search).get("t");
    const q = slug
      ? `?slug=${encodeURIComponent(decodeURIComponent(slug))}`
      : hinted
        ? `?t=${encodeURIComponent(hinted)}`
        : lastDoor()
          ? `?slug=${encodeURIComponent(lastDoor()!)}`
          : "";
    void api.get<HostInfo>(`/api/host${q}`).then(setHost).catch(() => setHost({ platform: true, tenant: null }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // An expired cookie surfaces as a 401 on any data route. Clear the session so
  // the app drops back to Login instead of showing blank screens / failing
  // saves silently. Auth endpoints are excluded in the api layer (no loop).
  // The cached context payload goes with it — otherwise the next cold start would
  // restore it and show a signed-out user a signed-in shell.
  useEffect(() => {
    setUnauthorizedHandler(() => { writeCachedCtx(null); setCtx(null); setDegraded(false); setLoading(false); });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Connectivity: drives the offline banner, the "will sync" copy, and pausing
  // the notification WS/poll retry loops (which otherwise hammer a dead radio
  // for a whole gym session). Reconnecting re-reads the context, which clears
  // the degraded flag and picks up anything that changed while we were dark.
  useEffect(() => {
    const goOnline = () => { setOnline(true); void refresh(); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refresh]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    localStorage.setItem("mossa-mode", m);
  }, []);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      await api.post("/api/context/switch", { tenantId });
      await refresh();
    },
    [refresh],
  );

  // Tenant hint from an email deep-link (`?t=<tenantId>`): a link opened in a
  // fresh browser has no session context, so it can't know which studio to land
  // in for a user who belongs to several. Once the session resolves, if the hint
  // names a DIFFERENT tenant, switch to it (the server validates membership) —
  // then strip the param so it doesn't re-fire or linger. Runs once; the deep-
  // link path + its item param (e.g. ?lab=) are preserved for the target screen.
  const [params, setParams] = useSearchParams();
  const tenantHintDone = useRef(false);
  useEffect(() => {
    if (loading || !ctx?.active || tenantHintDone.current) return;
    const t = params.get("t");
    tenantHintDone.current = true;
    if (!t) return;
    setParams((prev) => { prev.delete("t"); return prev; }, { replace: true });
    if (t !== ctx.active.tenantId) void switchTenant(t).catch(() => undefined);
  }, [loading, ctx, params, setParams, switchTenant]);

  /**
   * A `/t/<slug>` door must also LAND you in that studio, not just brand itself.
   *
   * On the platform host nothing pins the tenant — `activeOrganizationId` decides
   * every API call, and it is stamped once at session CREATE to the user's OLDEST
   * membership (`ORDER BY createdAt ASC LIMIT 1`). So a user who belongs to two
   * studios and signed in through `/t/studio-b` landed in studio-a: right brand
   * on the login, wrong tenancy behind it, every subsequent API call scoped to
   * the wrong studio. The `?t=` email hint already handled this; the door did not.
   *
   * A custom domain is unaffected — there `hostTenant` pins the tenant server-side
   * (`auth-context.ts`), which is exactly why domains are the stronger mechanism.
   * The server validates membership on switch, so an unknown slug or a studio the
   * user has no persona in is a no-op rather than an escalation.
   */
  const doorSwitchDone = useRef(false);
  useEffect(() => {
    if (loading || !ctx?.active || doorSwitchDone.current) return;
    const slug = /^\/t\/([^/?#]+)/.exec(location.pathname)?.[1];
    if (!slug) return;
    doorSwitchDone.current = true;
    const want = decodeURIComponent(slug).toLowerCase();
    if (ctx.active.tenantSlug?.toLowerCase() === want) return;
    const persona = ctx.personas.find((p) => p.tenantSlug?.toLowerCase() === want);
    if (persona) void switchTenant(persona.tenantId).catch(() => undefined);
  }, [loading, ctx, switchTenant]);

  const signOut = useCallback(async () => {
    // The session cookie is HttpOnly — ONLY the server can clear it — so the
    // sign-out request must actually reach the server and succeed. Send a
    // well-formed POST (an explicit {} body so Better Auth accepts it), then
    // hard-navigate so the app re-bootstraps against the now-cleared cookie.
    // We deliberately do NOT swallow the result into a fake success: the old
    // `.catch(()=>undefined)` + in-place reload silently re-authenticated
    // whenever the request didn't land (e.g. swallowed by the tour interceptor),
    // which read as "sign out does nothing". `finally` still resets local state
    // and navigates so the screen always reflects the true (server) session.
    try {
      await api.post("/api/auth/sign-out", {});
    } finally {
      clearAppStorage();
      setCtx(null);
      // Back to the STUDIO door, not Mossa's.
      //
      // This used to be a flat `/`, which on a tenant's custom domain is the
      // branded login (fine) but on the platform host is the Mossa gate — so a
      // coach signing out of their own studio was handed a page about what Mossa
      // is, with no way back in and no passkey affordance. Worse for passkeys
      // specifically: the credential is registered against this ORIGIN, and the
      // gate is the one screen on it that never offers to use it.
      //
      // `/t/<slug>` keeps the origin identical, so the passkey still resolves; it
      // only changes which brand the login wears. On a custom domain `/` already
      // IS that studio's door, so nothing changes there.
      const door = lastDoor();
      location.assign(door && hostIsPlatform ? `/t/${encodeURIComponent(door)}` : "/");
    }
  }, [hostIsPlatform]);

  const value = useMemo(
    () => ({ loading, ctx, host, online, degraded, mode, setMode, refresh, switchTenant, signOut }),
    [loading, ctx, host, online, degraded, mode, setMode, refresh, switchTenant, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside provider");
  return s;
}

/** Live connectivity — for anything that should stop retrying while offline. */
export function useOnline(): boolean {
  return useSession().online;
}

/** The client record the current surface should scope to (train mode / client role). */
export function useActiveClientId(): string | null {
  const { ctx, mode } = useSession();
  if (!ctx?.active) return null;
  if (ctx.active.role === "client") return ctx.active.clientId;
  return mode === "train" ? ctx.active.clientId : null;
}
