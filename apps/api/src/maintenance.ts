/**
 * Kova's binding for `@4dl/tenancy`'s maintenance switch.
 *
 * The package owns the state, the level→method rule and the operator routes. Two
 * things it cannot know are supplied here: which of Kova's paths must answer
 * even while the deployment is closed, and how to end everyone's session without
 * ending the operator's.
 */

import { maintenanceAdminRoutes } from "@4dl/tenancy";
import { isPlatformAdminFor } from "@4dl/auth";
import { isPlatformAdmin } from "./auth-context.js";
import type { Env } from "./env.js";

/**
 * The paths that answer during `full` maintenance, on top of `/health` and the
 * operator door (which the guard exempts itself).
 *
 * Three groups, and each is here for a concrete failure:
 *
 *   the HOST PROBE      `/api/host` carries the maintenance state. Refusing it
 *                       leaves the app unable to distinguish "closed for
 *                       maintenance" from "this server is broken", so the
 *                       operator's carefully-written message never reaches the
 *                       person it was written for.
 *   the STRIPE WEBHOOKS the same exemption they hold against the read-only host
 *                       gate, for a sharper reason: Stripe retries a failing
 *                       endpoint a handful of times and then DISABLES it. A
 *                       twenty-minute window that refuses them can end with
 *                       customers who paid and studios that were never
 *                       activated, and nothing on our side reports it.
 *   READINESS           `/ready` is registered ahead of the guard entirely, so
 *                       it is not listed — noted here because its absence looks
 *                       like an omission.
 */
export function maintenanceExempt(path: string): boolean {
  return (
    path === "/api/host" ||
    path === "/api/stripe/webhook" ||
    // The TENANT rail's provider callback. Same reasoning as the platform
    // webhook and, if anything, sharper: this one carries a payment a studio's
    // customer already made on the studio's own account. Refusing it during a
    // maintenance window means money left the customer, the notification was
    // dropped, and the access was never granted — with the studio's provider
    // eventually disabling the endpoint for repeated failures.
    /^\/api\/pay\/webhook\/[^/]+$/.test(path)
  );
}

/**
 * End every session that is not a platform operator's.
 *
 * The exclusion is the whole point. Deleting the operator's own session at the
 * moment they close the deployment would sign them out of the console they are
 * standing in — and on `full` the sign-in lane is disabled everywhere except the
 * operator door, so they would be relying on that one door to let them back in
 * with no session and no margin. Keeping their session is the cheaper guarantee.
 *
 * Better Auth's `session` table is deleted from directly rather than through its
 * API: there is no bulk revoke, and iterating every user to call a per-session
 * endpoint would be a few thousand round-trips to do one DELETE.
 */
export async function signOutEveryone(env: Env, db: D1Database): Promise<number> {
  const admins = await db
    .prepare('SELECT id, email FROM "user"')
    .all<{ id: string; email: string | null }>()
    .catch(() => null);
  const keep = (admins?.results ?? []).filter((u) => isPlatformAdminFor(env, u.email)).map((u) => u.id);

  // Reading the whole `user` table is deliberate, and cheap enough: this runs
  // once, when an operator closes the deployment. The alternative — an `email IN
  // (…)` subquery — cannot express `isPlatformAdminFor`'s dev fail-open, and
  // getting that wrong is how the switch signs the operator out along with
  // everyone else. In DEVELOPMENT that fail-open makes every user an operator,
  // so `keep` covers all of them and this deletes nothing, which is right: there
  // is nobody to protect a dev database from.
  const placeholders = keep.map(() => "?").join(",");
  const sql = keep.length
    ? `DELETE FROM "session" WHERE userId NOT IN (${placeholders})`
    : 'DELETE FROM "session"';
  const res = await db.prepare(sql).bind(...keep).run().catch(() => null);
  return res?.meta?.changes ?? 0;
}

/** The operator routes, bound to Kova's operator check and session table. */
export const maintenanceRoutes = maintenanceAdminRoutes(
  { isPlatformAdmin: (c) => isPlatformAdmin(c as never) },
  { signOutEveryone: (c) => signOutEveryone(c.env as Env, c.env.DB) },
);
