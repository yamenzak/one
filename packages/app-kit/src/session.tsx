/**
 * THE SESSION, minus the product.
 *
 * Every 4DL app answers the same five questions on boot and answers them in the
 * same order, with the same failure modes:
 *
 *   which DOOR is this      `/api/host`, pre-auth
 *   who is signed in        `/api/context`, per-session
 *   are we ONLINE           and is the context we are showing stale
 *   how do we leave         sign-out, which only the server can really do
 *   how do we cross tenants a navigation, not a state change
 *
 * What differs per app is only the SHAPE of the context payload and what its
 * tenants are called. So this is a factory generic over that payload: the app
 * supplies the type and two tiny readers, and gets a provider and a hook back.
 *
 * The router stays OUT. `useSearchParams` and friends would couple every app to
 * one router, and the one place the app needs it — honouring a `?t=<tenantId>`
 * hint on an emailed deep link — is ten lines that belong beside the app's own
 * routes. `switchTenant` is exposed so the app can wire it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api, isOffline, setUnauthorizedHandler } from "./api.js";
import { resolveHostInfo, tenantUrl, type HostInfo } from "./host.js";
import { CONTEXT_CACHE, type AppStorage } from "./storage.js";

export interface Session<Ctx, B = unknown> {
  loading: boolean;
  ctx: Ctx | null;
  /** Which door, and whose. Resolved pre-auth; null until the probe answers. */
  host: HostInfo<B> | null;
  /** Live connectivity. Drives the offline banner and pauses retry loops. */
  online: boolean;
  /**
   * True when `ctx` came from the cache because the network was unreachable —
   * the app is usable but reads may be stale and writes queue.
   */
  degraded: boolean;
  refresh: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/** The two things this needs to read out of an app's context payload. */
export interface SessionConfig<Ctx> {
  /** Where the app keeps its device state. Supplies the context cache. */
  storage: AppStorage;
  /** The tenants this user belongs to — `switchTenant` needs the slug to
   *  build the target hostname. */
  tenantsOf: (ctx: Ctx) => readonly { tenantId: string; slug?: string | null }[];
  /**
   * Called after sign-out clears local state, before the hard navigation.
   *
   * The navigation goes to `/` on THIS host, which is already the right door —
   * that is the whole payoff of resolving the tenant from the hostname. Signing
   * out of `acme.example.app` lands on Acme's branded login, with Acme's passkey
   * affordance, because the origin never changed.
   */
  onSignOut?: () => void;
}

export function createSession<Ctx, B = unknown>(cfg: SessionConfig<Ctx>) {
  const readCached = (): Ctx | null => cfg.storage.read<Ctx>(CONTEXT_CACHE);
  const writeCached = (data: Ctx | null): void => cfg.storage.write(CONTEXT_CACHE, data);

  const Ctx0 = createContext<Session<Ctx, B> | null>(null);

  function SessionProvider({ children }: { children: ReactNode }) {
    const [ctx, setCtx] = useState<Ctx | null>(null);
    const [host, setHost] = useState<HostInfo<B> | null>(null);
    const [loading, setLoading] = useState(true);
    const [degraded, setDegraded] = useState(false);
    // `navigator.onLine === false` is trustworthy (no interface / airplane
    // mode); `true` only means "there is a link", so a fetch can still fail. A
    // failed context read counts as offline too (below).
    const [online, setOnline] = useState(() => navigator.onLine !== false);

    const refresh = useCallback(async () => {
      try {
        const data = await api.get<Ctx>("/api/context");
        setCtx(data);
        writeCached(data);
        setDegraded(false);
      } catch (e) {
        // A NETWORK failure is not a sign-out. Restore the last known session so
        // a cold start with no signal renders the app (degraded) instead of the
        // sign-in screen — which is exactly where the offline write queue becomes
        // unreachable. A real 401 goes through the handler below, which clears
        // both the state AND the cache, so a signed-out user never looks signed
        // in.
        const cached = isOffline(e) ? readCached() : null;
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

    // Which door is this? One read, before anything renders. The 404-vs-network
    // distinction is `resolveHostInfo`'s and is documented there.
    useEffect(() => {
      void resolveHostInfo<B>(
        (path) => api.get<HostInfo<B>>(path),
        (e) => e instanceof ApiError && e.status === 404,
      ).then(setHost);
    }, []);

    useEffect(() => {
      void refresh();
    }, [refresh]);

    // An expired cookie surfaces as a 401 on any data route. Clear the session so
    // the app drops back to sign-in instead of showing blank screens and silently
    // failing saves. The auth endpoints are excluded in the api layer (no loop).
    // The cached payload goes with it — otherwise the next cold start would
    // restore it and show a signed-out user a signed-in shell.
    useEffect(() => {
      setUnauthorizedHandler(() => {
        writeCached(null);
        setCtx(null);
        setDegraded(false);
        setLoading(false);
      });
      return () => setUnauthorizedHandler(null);
    }, []);

    // Connectivity drives the offline banner, the "will sync" copy, and pausing
    // retry loops — which otherwise hammer a dead radio for an entire session.
    // Reconnecting re-reads the context, clearing `degraded` and picking up
    // whatever changed while we were dark.
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

    /**
     * Cross to another tenant.
     *
     * On the platform's own doors this is still a session change, because those
     * hosts have no tenancy of their own and the active organization is what
     * decides scope there. On a TENANT host it cannot be: the server pins the
     * tenant from the hostname and refuses a switch by design, so the only way
     * to reach another tenant is to go to its address. The target is always the
     * SUBDOMAIN, so the root-scoped cookie carries the session across with no
     * re-authentication.
     */
    const switchTenant = useCallback(
      async (tenantId: string) => {
        const target = ctx ? cfg.tenantsOf(ctx).find((t) => t.tenantId === tenantId) : undefined;
        const root = host?.rootDomain;
        if (target?.slug && root && host?.platform === false) {
          location.assign(tenantUrl(target.slug, root));
          return;
        }
        await api.post("/api/context/switch", { tenantId });
        await refresh();
      },
      [ctx, host, refresh],
    );

    const signOut = useCallback(async () => {
      // The session cookie is HttpOnly — ONLY the server can clear it — so the
      // request must actually reach the server and succeed. Send a well-formed
      // POST (an explicit `{}` body, which Better Auth requires), then hard-
      // navigate so the app re-bootstraps against the cleared cookie.
      //
      // Deliberately NOT swallowed into a fake success: a `.catch(() => undefined)`
      // plus an in-place reload silently re-authenticates whenever the request
      // does not land, which reads as "sign out does nothing". `finally` still
      // resets local state and navigates, so the screen always reflects the true
      // (server) session.
      try {
        await api.post("/api/auth/sign-out", {});
      } finally {
        cfg.storage.clear();
        setCtx(null);
        cfg.onSignOut?.();
        location.assign("/");
      }
    }, []);

    const value = useMemo(
      () => ({ loading, ctx, host, online, degraded, refresh, switchTenant, signOut }),
      [loading, ctx, host, online, degraded, refresh, switchTenant, signOut],
    );
    return <Ctx0.Provider value={value}>{children}</Ctx0.Provider>;
  }

  function useSession(): Session<Ctx, B> {
    const s = useContext(Ctx0);
    if (!s) throw new Error("useSession outside provider");
    return s;
  }

  /** Live connectivity — for anything that should stop retrying while offline. */
  const useOnline = (): boolean => useSession().online;

  return { SessionProvider, useSession, useOnline };
}
