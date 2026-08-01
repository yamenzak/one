/**
 * Reading, writing and administering the maintenance switch.
 *
 * Split from `maintenance.ts` so the model stays importable by a browser: the app
 * needs `MaintenanceLevel` and the message to render the notice, and must not
 * drag D1 and Hono into its bundle to get them. Same split as `model.ts` makes
 * for the rest of this package.
 */

import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { setConfig, type HasDb } from "@4dl/core";
import {
  MAINTENANCE_KEYS,
  MAINTENANCE_MESSAGE_MAX,
  MAINTENANCE_OFF,
  isMaintenanceLevel,
  parseMaintenance,
  type Maintenance,
} from "./maintenance.js";

/**
 * The current state.
 *
 * A three-key point read against a table with a handful of rows. It is NOT
 * cached, and that is the whole design: an operator who flips this during an
 * incident needs the next request to obey, not the next request after a TTL. The
 * per-tenant subscription status in `resolveHost` is uncached for the same
 * reason and is documented there.
 *
 * Fails to `off` on a database error rather than throwing. A deployment whose D1
 * is unreachable has a real problem, but "the maintenance read failed" must not
 * be the thing that decides it — the routes behind this will fail on their own,
 * with their own errors, which are more informative than a blanket 503.
 */
export async function readMaintenance(db: D1Database): Promise<Maintenance> {
  const rows = await db
    .prepare(`SELECT key, value FROM app_config WHERE key IN (?, ?, ?)`)
    .bind(MAINTENANCE_KEYS.level, MAINTENANCE_KEYS.message, MAINTENANCE_KEYS.since)
    .all<{ key: string; value: string }>()
    .catch(() => null);
  if (!rows) return MAINTENANCE_OFF;
  return parseMaintenance(Object.fromEntries((rows.results ?? []).map((r) => [r.key, r.value])));
}

/** Set the switch. `since` is stamped on every change so the notice can say how
 *  long this has been going on, and cleared when it goes back to `off`. */
export async function writeMaintenance(
  db: D1Database,
  level: Maintenance["level"],
  message: string | null,
  now: string,
): Promise<Maintenance> {
  const text = (message ?? "").trim().slice(0, MAINTENANCE_MESSAGE_MAX);
  await setConfig(db, MAINTENANCE_KEYS.level, level);
  await setConfig(db, MAINTENANCE_KEYS.message, text);
  await setConfig(db, MAINTENANCE_KEYS.since, level === "off" ? "" : now);
  return level === "off" ? MAINTENANCE_OFF : { level, message: text || null, since: now };
}

/**
 * Resolve the state once per request and hand it to whoever asks.
 *
 * Both consumers need it — the route guard, to refuse; the host probe, to tell
 * the app what to render — and they run in different packages. Doing the read in
 * one middleware and passing it on the context keeps that to a single query,
 * rather than each of them issuing its own.
 *
 * It reads on `/api/*` and `/health` only. Everything else on this worker is the
 * static SPA, and serving the app shell is not something maintenance withholds:
 * the shell is what RENDERS the maintenance notice.
 */
export type MaintenanceEnv = { Bindings: HasDb; Variables: { maintenance: Maintenance } };

export function maintenanceMiddleware(): MiddlewareHandler<MaintenanceEnv> {
  return async (c, next) => {
    const path = c.req.path;
    if (!path.startsWith("/api/") && path !== "/health") return next();
    c.set("maintenance", await readMaintenance(c.env.DB));
    return next();
  };
}

export type MaintenanceAdminContext = Context<{ Bindings: HasDb }>;

export interface MaintenanceAdminGuards {
  /** Platform operator — an allowlist, a separate axis from tenant RBAC. */
  isPlatformAdmin: (c: MaintenanceAdminContext) => boolean;
}

export interface MaintenanceAdminOptions {
  /**
   * End every session that is not an operator's, and report how many.
   *
   * Injected because the session table belongs to `@4dl/auth` and this package
   * must not reach into it — and because WHO counts as an operator is the app's
   * answer, and getting it wrong here signs the operator out of the console they
   * just used to turn maintenance on.
   *
   * Optional. Without it `full` still refuses every request, which is most of
   * what "logged out" means to the person holding the stale session; supplying it
   * makes their next visit start from the sign-in screen instead of a
   * half-authenticated app.
   */
  signOutEveryone?: (c: MaintenanceAdminContext) => Promise<number>;
  /** Injected so a test can pin it; defaults to now. */
  now?: () => string;
}

/**
 * `GET|POST /admin/maintenance` — the switch itself.
 *
 * Mounted under the app's admin prefix, so the route guard has already confirmed
 * the operator door and the operator; the `isPlatformAdmin` check here is the
 * same belt-and-braces the email panel's routes carry, for the same reason —
 * these routes decide whether anyone can use the product.
 */
export function maintenanceAdminRoutes(guards: MaintenanceAdminGuards, opts: MaintenanceAdminOptions = {}) {
  const now = opts.now ?? (() => new Date().toISOString());

  return new Hono<{ Bindings: HasDb }>()
    .get("/admin/maintenance", async (c) => {
      if (!guards.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      return c.json(await readMaintenance(c.env.DB));
    })
    .post("/admin/maintenance", async (c) => {
      if (!guards.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const body = (await c.req.json().catch(() => null)) as { level?: unknown; message?: unknown } | null;
      if (!body || typeof body !== "object") return c.json({ error: "invalid body" }, 400);
      if (!isMaintenanceLevel(body.level)) return c.json({ error: "invalid body", field: "level" }, 400);
      if (body.message !== undefined && body.message !== null && typeof body.message !== "string") {
        return c.json({ error: "invalid body", field: "message" }, 400);
      }

      const before = await readMaintenance(c.env.DB);
      const state = await writeMaintenance(c.env.DB, body.level, (body.message as string | null) ?? null, now());

      // Only on the TRANSITION into `full`, and only forwards. Re-saving the
      // message while already closed must not sign everyone out a second time,
      // and stepping DOWN to readonly or off is the recovery — ending sessions
      // there would punish the people being let back in.
      let signedOut = 0;
      if (state.level === "full" && before.level !== "full" && opts.signOutEveryone) {
        signedOut = await opts.signOutEveryone(c).catch(() => 0);
      }
      return c.json({ ...state, signedOut });
    });
}
