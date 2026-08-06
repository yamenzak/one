/**
 * THE OUTER WALL — one middleware, six gates, in this order:
 *
 *   1. HOST      is this door allowed to answer this route at all?
 *   1b. MAINTENANCE  is the whole DEPLOYMENT withheld right now?
 *   2. PUBLIC    pass through (the route carries its own auth, or needs none)
 *   3. ADMIN     platform operator, on the operator door only
 *   4. MEMBER    an authenticated member of the HOST's tenant, gated by the
 *                permission the route requires
 *   5. STANDING  is the tenant paid up, or is its whole origin read-only?
 *
 * Row-level checks (this trainer's assigned clients, this user's own record)
 * belong in the handlers. This is the ACTION-level wall, and its value is that it
 * is one place rather than ~200: the alternative is every handler re-deriving the
 * same five questions, which is how one of them ends up not asking.
 *
 * ── What the app supplies ──────────────────────────────────────────────────
 *
 * Every route table is a parameter, because a route table is a description of an
 * app's surface and cannot be shared. What is shared is the ORDER of the gates,
 * the status codes, and the fail-closed defaults — which is exactly the part
 * that is subtle and gets re-derived wrong.
 *
 * The standing gate is a FUNCTION, not a table read, and that is deliberate: an
 * app with no billing passes `() => null` and gets the entire boundary with no
 * dependency on a billing package. Nothing here knows what a subscription is.
 */

import type { Context, MiddlewareHandler } from "hono";
import type { HostGate, HostRole, Maintenance } from "@4dl/tenancy/model";
import { isDevRoot, maintenanceRefuses } from "@4dl/tenancy/model";
import { can, type AuthEnv } from "./context.js";
import type { Grant } from "./grants.js";

export interface GuardConfig<E extends object, A, B> {
  /** Reachable without a tenant session. */
  isPublic: (method: string, path: string) => boolean;
  /** The permission a route requires; `null` = any authenticated member. */
  permissionFor: (method: string, path: string) => Grant | null;
  /** Routes that must keep working on the ROOT door — the dead end. */
  allowedOnRoot: (path: string) => boolean;
  /**
   * The ONLY routes a well-formed hostname owning no tenant may answer.
   *
   * Deliberately separate from — and much narrower than — `allowedOnRoot`. The
   * root is ours and can serve identity and webhooks; an unowned hostname is
   * nobody's and must serve almost nothing. Collapsing the two would re-open the
   * hole described below, because the root's list includes the auth lane.
   */
  allowedWithoutTenant: (path: string) => boolean;
  /** Writes that must survive a read-only tenant. See the note below. */
  allowedWhileReadOnly: (path: string) => boolean;
  /** Prefix under which the operator console answers. */
  adminPrefix?: string;
  /**
   * Prefix under which the sign-in lane answers. Read only by the maintenance
   * gate, which has to spare it at `readonly` and refuse it at `full`.
   */
  authPrefix?: string;
  /** Personal, non-tenant-scoped routes usable before a tenant is chosen. */
  isPersonal?: (path: string) => boolean;
  /** Is this caller a platform operator? */
  isPlatformAdmin: (c: Context<AuthEnv<E, A, B>>) => boolean;
  /**
   * The tenant's host gate, or null for "no gate" — which is what an app with no
   * billing returns, and what makes this whole module independent of it.
   */
  gate: (c: Context<AuthEnv<E, A, B>>) => HostGate | null;
  /** Billing surfaces a lapsed tenant's owner may still write to. */
  isBillingWrite?: (path: string) => boolean;
  /** The permission that identifies someone who can settle the bill. */
  billingPermission?: Grant;
  /**
   * The deployment-wide maintenance switch, or null for "no switch" — which is
   * what an app that never mounts `maintenanceMiddleware` returns, and what
   * keeps this gate free.
   */
  maintenance?: (c: Context<AuthEnv<E, A, B>>) => Maintenance | null | undefined;
  /**
   * Paths that answer even while the deployment is closed.
   *
   * `/health` and the operator door are exempted by the engine itself; this is
   * for the app's own additions, and there is essentially one class of them: SIGNATURE-VERIFIED
   * PROVIDER CALLBACKS. A payment webhook dropped during a maintenance window is
   * not retried forever — the provider gives up and disables the endpoint — so a
   * closed sign that also refuses them turns a planned twenty minutes into
   * silently lost money. The host probe belongs here too, because it is how the
   * app learns to render the notice at all.
   */
  maintenanceExempt?: (path: string) => boolean;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function routeGuard<E extends object, A, B>(cfg: GuardConfig<E, A, B>): MiddlewareHandler<AuthEnv<E, A, B>> {
  const adminPrefix = cfg.adminPrefix ?? "/api/admin/";
  const authPrefix = cfg.authPrefix ?? "/api/auth/";
  return async (c, next) => {
    const path = c.req.path;
    if (!path.startsWith("/api/") && path !== "/health") return next();

    const method = c.req.method;
    if (method === "OPTIONS") return next();

    const host = c.get("host");
    const role: HostRole = host.shape.role;

    // ── 1. The host gate ────────────────────────────────────────────────────
    //
    // A hostname under our root that we do not serve (a reserved label, or nested
    // deeper than the wildcard certificate covers) answers nothing. Fail closed,
    // and do not leak that the platform is here.
    if (role === "invalid") return c.json({ error: "not_found" }, 404);

    // The root is a signpost, not an app.
    if (role === "root" && !cfg.allowedOnRoot(path)) return c.json({ error: "wrong_door" }, 404);

    /**
     * A hostname that resolves NO TENANT serves nothing but the host probe.
     *
     * Two roles land here and both must be closed:
     *
     *  • `tenant` — a well-formed subdomain nobody owns. The host probe still
     *    answers, because that is how the app learns to render "nothing here".
     *  • `custom` — any hostname that reached this worker without an ACTIVE row
     *    in `tenant_domains`. That is a custom domain still provisioning… and it
     *    is also the `*.workers.dev` name Cloudflare publishes for every worker,
     *    which anyone can guess.
     *
     * The `custom` case is the one that mattered. The auth endpoints are a public
     * lane, so on an unowned hostname a stranger could request a sign-in code,
     * verify it, and create an organization — minting a tenant on the platform
     * from an address that appears nowhere and belongs to nobody. Closing it here
     * covers every stray hostname uniformly rather than relying on
     * `workers_dev: false` to hide one.
     *
     * `/health` stays open on purpose: dependency-free, reveals nothing, and it
     * is what uptime checks and `wrangler dev`'s readiness probe use.
     */
    if ((role === "tenant" || role === "custom") && !host.tenant && !cfg.allowedWithoutTenant(path) && path !== "/health") {
      return c.json({ error: "no_tenant" }, 404);
    }

    /**
     * THE DEVICE DOOR resolves no tenant BY DESIGN, and that is not the same
     * absence the check above refuses.
     *
     * A screen's tenancy arrives from its pairing claim, not its hostname —
     * which is why the fleet can share one pinned origin and survive being
     * re-paired (see `DEFAULT_DEVICE_LABEL` in `@4dl/tenancy`). So `device` is
     * deliberately absent from the roles above: it is not a hostname that
     * FAILED to resolve a tenant, it is one that was never going to.
     *
     * What it is NOT is unauthenticated-and-open. The routes it answers carry
     * their own credential (a claim token, a content-addressed manifest id) and
     * must be in the app's `isPublic` list to reach a handler at all. This gate
     * only declines to 404 them for a missing tenant.
     *
     * It also skips the STANDING gate below, and that is a product decision
     * worth stating: a screen in a public waiting room going dark because its
     * owner's card expired is a different act from a dashboard going read-only.
     * The app decides what a lapsed tenant's screens show, in its own copy, by
     * reading the gate where it compiles the manifest — not by having the edge
     * refuse the request.
     */
    const isDevice = role === "device";

    /**
     * ── 1b. MAINTENANCE ─────────────────────────────────────────────────────
     *
     * The deployment-wide switch, and it sits ABOVE the public gate on purpose:
     * `full` means sign-in is disabled, and the auth lane is public. Enforcing it
     * after `isPublic` would leave open the one door that lets people back into
     * an app the operator just closed.
     *
     * 503 with `Retry-After`, not 402 or 403: this is neither a billing state nor
     * an authorization failure. It is "come back shortly", and it is the one
     * status a client, a CDN and an uptime check all already understand.
     *
     * ── The exemptions, and why removing any of them is a trap ───────────────
     *
     *   the OPERATOR DOOR   `admin.<root>` is never closed. It is where the
     *                       switch is turned back OFF, so closing it would
     *                       otherwise be a one-way trip out of the product,
     *                       recoverable only by hand-editing D1.
     *
     *                       Note this does NOT stand down on `isDevRoot`, unlike
     *                       the console gate below. That gate relaxes because dev
     *                       has one root and no separate door to be strict about;
     *                       relaxing HERE would spare every request in dev and in
     *                       the integration suite, so the switch would appear to
     *                       work and withhold nothing. `admin.localhost` is a real
     *                       door locally, and a signed-in dev user is a platform
     *                       admin anyway, so nothing is lost by being strict.
     *   a PLATFORM ADMIN    exempt on every door, so an operator can check the
     *                       thing they are maintaining from a tenant's address
     *                       rather than inferring it from the console.
     *   `/health`           dependency-free, reveals nothing, and it is what the
     *                       uptime check and `wrangler dev`'s readiness probe
     *                       use. A maintenance window should not page anyone.
     *   the app's own list  the host probe and the signature-verified provider
     *                       webhooks — see `maintenanceExempt`.
     *   the AUTH LANE       **at `readonly` only.** Signing in is a POST, so
     *                       without this a "read-only" window would refuse the
     *                       one act that lets someone read anything — which is
     *                       not read-only, it is closed with extra steps. At
     *                       `full` the same lane is deliberately refused: that IS
     *                       what "signing in is disabled" means.
     */
    const maintenance = cfg.maintenance?.(c) ?? null;
    if (maintenance && maintenanceRefuses(maintenance.level, method)) {
      const spared =
        role === "admin" ||
        path === "/health" ||
        Boolean(cfg.maintenanceExempt?.(path)) ||
        (maintenance.level === "readonly" && path.startsWith(authPrefix)) ||
        cfg.isPlatformAdmin(c);
      if (!spared) {
        return c.json(
          { error: "maintenance", level: maintenance.level, message: maintenance.message, since: maintenance.since },
          503,
          { "Retry-After": "300" },
        );
      }
    }

    if (cfg.isPublic(method, path)) return next();

    // ── 2. The operator console ─────────────────────────────────────────────
    //
    // Restricted to the admin door, so a tenant's own subdomain cannot reach
    // platform administration even when the caller genuinely IS an operator with
    // a live cookie. That closes a real path: the session cookie is valid across
    // every host under the root, so without this an operator's session would
    // carry full platform powers onto every tenant subdomain they visited.
    //
    // Dev has one root and therefore no separate door, so the restriction cannot
    // apply there — see `isDevRoot`.
    if (path.startsWith(adminPrefix)) {
      if (role !== "admin" && !isDevRoot(host.shape)) return c.json({ error: "wrong_door" }, 404);
      if (!cfg.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      return next();
    }

    // Personal surfaces work for any signed-in user, even before a tenant is
    // chosen — they are the person's, not a tenant's.
    if (cfg.isPersonal?.(path)) {
      if (!c.get("user")) return c.json({ error: "unauthenticated" }, 401);
      return next();
    }

    if (!c.get("user") || !c.get("tenantId")) return c.json({ error: "unauthenticated" }, 401);

    const perm = cfg.permissionFor(method, path);
    if (perm && !cfg.isPlatformAdmin(c) && !can(c, perm)) {
      return c.json({ error: "forbidden" }, 403);
    }

    // ── 5. The tenant's standing ────────────────────────────────────────────
    //
    // A lapsed tenant is read-only for EVERYONE on its host. This is the one
    // place it is enforced, which is the point.
    //
    // READS ARE NEVER GATED. A person's own data is theirs and is not collateral
    // for someone else's invoice — the same principle that lets an archived
    // member keep reading their record.
    //
    // 402 rather than 403: this is not an authorization failure, it is a billing
    // state, and the app has to tell them apart to know whether to say "you don't
    // have permission" or "this needs renewing".
    const gate = isDevice ? null : cfg.gate(c);
    if (gate?.readOnly && WRITE_METHODS.has(method) && !cfg.allowedWhileReadOnly(path)) {
      const payer =
        gate.billingWritable &&
        Boolean(cfg.isBillingWrite?.(path)) &&
        Boolean(cfg.billingPermission && can(c, cfg.billingPermission));
      if (!payer) {
        return c.json({ error: "tenant_read_only", reason: gate.reason, readOnly: true }, 402);
      }
    }
    return next();
  };
}
