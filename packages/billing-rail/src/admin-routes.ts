/**
 * THE DEAD LETTER, ON A SCREEN.
 *
 * `rail_parked_events` had a table, an index, a writer and two reader functions
 * with ZERO callers anywhere in the repo — and a comment in the app's webhook
 * handler asserting that "an unattributable event parks in `rail_parked_events`
 * with its payload, and the operator console counts it." It did not. Nothing
 * did.
 *
 * That is the failure mode this package was built to remove, reintroduced one
 * level up. The old handler answered an unroutable Stripe event `200 {received:
 * true}` with its id already claimed, so Stripe never retried: money captured,
 * nothing granted, no signal. Parking the event fixed the "no signal" half only
 * if somebody can read the park — and a dead letter nobody can read is the same
 * silent success with an extra table.
 *
 * ── Why this is the rail's and not an app's ─────────────────────────────────
 *
 * One Stripe account serves every 4DL app, so an event that could not be
 * attributed is by definition not any single product's problem — it is the
 * platform's, and it lands in whichever worker Stripe happened to deliver to.
 * An app-owned screen would mean N screens, each showing the events that reached
 * that app, with no way to know the others exist.
 *
 * ── What this deliberately does NOT do: replay ──────────────────────────────
 *
 * The obvious next button is "retry this event", and it is not here. Replaying
 * means re-running a handler against an object whose world has moved on, on a
 * rail whose whole purpose is exactly-once attribution — and the failure mode of
 * getting it wrong is granting twice for one payment, which is strictly worse
 * than the under-granting this screen exists to reveal. The operator has the
 * payload, the customer id and the amount; the correct action is taken in
 * Stripe or in the app that should have owned it, and recorded here.
 *
 * That is why closing one REQUIRES a note. "Resolved" alone is the least useful
 * state this table could hold: it says somebody looked, not whether the customer
 * ever got what they paid for.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { HasDb } from "@4dl/core";
import { countParked, getParked, listParked, resolveParked } from "./dispatch.js";

export type RailAdminEnv = { Bindings: HasDb };
export type RailAdminContext = Context<RailAdminEnv>;

export interface RailAdminGuards {
  /** Platform operator — an allowlist, a separate axis from tenant RBAC. */
  isPlatformAdmin: (c: RailAdminContext) => boolean;
  /**
   * Who is closing this, for the audit line. An email or a user id — whatever
   * the app can name a person by.
   *
   * Injected rather than read from a session, because how an app identifies its
   * operator is the app's business and this package has never seen its auth.
   */
  operatorRef: (c: RailAdminContext) => string;
}

/** Long enough to say what was done, short enough not to be a document. */
const NOTE_MAX = 500;

export function railAdminRoutes(guards: RailAdminGuards) {
  return new Hono<RailAdminEnv>()
    /**
     * The queue. `?open=false` includes the closed ones — see `listParked` for
     * why they stay readable.
     */
    .get("/admin/rail/parked", async (c) => {
      if (!guards.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const open = c.req.query("open") !== "false";
      const [events, openCount] = await Promise.all([
        listParked(c.env.DB, { open, limit: 100 }),
        countParked(c.env.DB),
      ]);
      return c.json({ open: openCount, events });
    })

    /** One event, WITH the stored payload — the customer id and the amount. */
    .get("/admin/rail/parked/:id", async (c) => {
      if (!guards.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const row = await getParked(c.env.DB, c.req.param("id"));
      return row ? c.json(row) : c.json({ error: "not found" }, 404);
    })

    /**
     * Close one, with an account of what was actually done about the money.
     *
     * A blank note is a 400. The whole reason this row exists is that a payment
     * landed and nothing was granted, so "resolved" with no explanation
     * converts a known problem into an unknown one — which is worse than
     * leaving it open.
     */
    .post("/admin/rail/parked/:id/resolve", async (c) => {
      if (!guards.isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
      const body = (await c.req.json().catch(() => null)) as { note?: unknown } | null;
      const note = typeof body?.note === "string" ? body.note.trim() : "";
      if (!note) return c.json({ error: "Say what was done about it — a resolved event with no note is not a record." }, 400);
      if (note.length > NOTE_MAX) return c.json({ error: `Keep the note under ${NOTE_MAX} characters.` }, 400);

      const ok = await resolveParked(c.env.DB, c.req.param("id"), guards.operatorRef(c), note);
      // 409, not 404: the row is there, somebody else already closed it. Saying
      // "not found" would send an operator looking for a record that exists and
      // now disagrees with what they were about to write.
      return ok ? c.json({ ok: true }) : c.json({ error: "Already resolved, or no such event." }, 409);
    });
}
