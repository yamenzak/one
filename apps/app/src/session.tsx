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
 * ── The door is the hostname now ────────────────────────────────────────────
 *
 * There used to be a `/t/<slug>` ENTRY path here, plus a remembered "last door"
 * in localStorage, plus an effect that switched tenants after the session
 * resolved — three mechanisms to answer "which studio is this?" on a single
 * shared host, none of which could actually pin a tenancy (only brand it).
 *
 * All of it is gone. `acme.kova.4dl.app` IS Acme: the server resolves the tenant
 * from the Host header before any of this code runs, sign-out returns to `/` on
 * whatever host you are on, and switching studios is a NAVIGATION to the other
 * studio's hostname rather than a state change on this one. That removes the
 * entire class of bug where the brand and the tenancy disagreed.
 *
 * The `?t=<tenantId>` hint on emailed links is kept, but its job has shrunk: a
 * link built by `canonicalHost` already points at the right host, so the hint is
 * now only a redirect safety-net for older mail that pointed somewhere generic.
 */

/**
 * Display preferences that are NOT identifying and carry no account data — the
 * chosen light/dark theme. Sign-out used to wipe every `mossa`-prefixed key, so a
 * light-theme user signed back in to a dark app and had to re-set it every time.
 * Anything that could leak between accounts (session cache, per-plan shopping
 * lists) must stay OUT of here.
 *
 * The remembered door used to be here too. It no longer exists: the hostname is
 * the door, so there is nothing for the device to remember.
 */
const KEEP_ON_SIGN_OUT = new Set(["mossa-theme"]);

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

/** Which door the app is being served on — see `@mossa/domain` `classifyHost`. */
export type HostRole = "root" | "setup" | "admin" | "tenant" | "custom" | "invalid";

/** Which door this is, and whose (SPEC §14.1). Resolved pre-auth from /api/host. */
export interface HostInfo {
  role: HostRole;
  /** True on our own doors (root / setup / admin); false when a studio resolved. */
  platform: boolean;
  /** The apex studios live under, e.g. `kova.4dl.app`. Used to build the URL of
   *  another studio when switching, so the switcher can cross hostnames. */
  rootDomain: string;
  /** Absolute URL of the setup door — the only place a studio is created. */
  setupUrl: string;
  /**
   * The studio this host belongs to. `null` while `role === "tenant"` is
   * meaningful and must not be treated as "platform": it is a well-formed studio
   * address with no studio behind it, and the app renders "no studio here".
   */
  tenant: { tenantId: string; name: string; slug: string; branding: TenantBranding | null; allowSignup: boolean } | null;
  /** The studio's billing gate. `readOnly` means every write on this host refuses,
   *  so the app says so up front rather than on the first failed save. */
  gate?: { readOnly: boolean; reason: "ok" | "grace" | "suspended" | "closing" } | null;
  /** Cloudflare Turnstile — the login renders the widget when a site key is set
   *  and `enabled` (a server secret is configured, so codes are gated on it). */
  turnstile?: { siteKey: string | null; enabled: boolean } | null;
}

/** The URL of a studio, by slug, on the platform root.
 *
 *  Always the SUBDOMAIN, never the studio's custom domain — even when it has one.
 *  The session cookie is issued for the root, so a subdomain hop carries the
 *  session and switches instantly, while a custom domain is a separate origin with
 *  its own cookie jar and would demand a fresh sign-in. The custom domain is for
 *  that studio's own clients arriving cold, not for crossing between studios. */
export function studioUrl(slug: string, rootDomain: string): string {
  return `${location.protocol}//${slug}.${rootDomain}/`;
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

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<SessionContext>("/api/context");
      setCtx(data);
      writeCachedCtx(data);
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
   * Which door is this? One read, before anything renders.
   *
   * No query parameters any more: the Host header carries the answer, so there is
   * nothing for the client to hint at. A failure falls back to the root role —
   * the dead end — which is the safe default: it shows a signpost rather than
   * inventing a login for a studio we could not confirm exists.
   */
  useEffect(() => {
    void api
      .get<HostInfo>("/api/host")
      .then(setHost)
      .catch(() =>
        setHost({ role: "root", platform: true, rootDomain: location.hostname, setupUrl: "/", tenant: null }),
      );
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

  /**
   * Switch studios.
   *
   * On our own doors (setup/admin/root) this is still a session change, because
   * those hosts have no tenancy of their own and `activeOrganizationId` is what
   * decides scope there. On a STUDIO host it cannot be: the server pins the tenant
   * from the hostname and refuses a switch by design, so the only way to reach
   * another studio is to go to its address. `studioUrl` targets the subdomain so
   * the shared cookie carries the session across with no re-authentication.
   */
  const switchTenant = useCallback(
    async (tenantId: string) => {
      const target = ctx?.personas.find((p) => p.tenantId === tenantId);
      const root = host?.rootDomain;
      if (target?.tenantSlug && root && host?.platform === false) {
        location.assign(studioUrl(target.tenantSlug, root));
        return;
      }
      await api.post("/api/context/switch", { tenantId });
      await refresh();
    },
    [ctx, host, refresh],
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
      // `/` on THIS host, which is already the right door.
      //
      // That is the whole payoff of resolving the tenant from the hostname: signing
      // out of `acme.kova.4dl.app` lands on Acme's branded login, with Acme's
      // passkey affordance, because the origin never changed. The old code had to
      // reconstruct a `/t/<slug>` path from localStorage to achieve the same thing,
      // and got it wrong whenever that memory was missing — handing a coach a
      // generic page about the product with no way back into their own studio.
      location.assign("/");
    }
  }, []);

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
