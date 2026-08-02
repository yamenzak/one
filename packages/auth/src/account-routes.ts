/**
 * A PERSON'S OWN ACCOUNT — and the one action that has to exist in every app:
 * erasing it.
 *
 * ── Why this is the platform's and not a product's ──────────────────────────
 *
 * "Leaving is always allowed" is already a documented invariant of the standing
 * model: `@4dl/tenancy`'s ladder exempts the exit paths from every rung
 * *specifically* so that a lapsed tenant can still get out. An invariant that
 * only one app implements is not an invariant — the exemption in the other app's
 * route guard was protecting a route that did not exist.
 *
 * It is also the one route a GDPR/DSGVO request lands on. An app whose users
 * cannot delete their own account has an obligation and no mechanism.
 *
 * ── The ceremony, and why each step ─────────────────────────────────────────
 *
 * `request-otp` → `delete`, with a step-up code in between. `@4dl/auth`'s
 * `action-otp` mints it: purpose-bound, hashed, five attempts, ten minutes, one
 * live code per (subject, purpose). Erasure is irreversible and a session can be
 * borrowed — a laptop left open is the ordinary case, not the exotic one — so a
 * second factor that reaches the account's OWN mailbox is the whole point.
 *
 * ── The block, and why it is a REFUSAL rather than a cascade ────────────────
 *
 * Somebody who runs a tenant cannot delete themselves out from under it: that
 * would leave a tenant nobody can administer, still billing, with data belonging
 * to other people in it. They close the tenant instead, which is a different
 * flow with a grace window and a billing cancellation. `blockedReason` is
 * checked TWICE — before sending the code and again before erasing — because
 * somebody can become an owner in the minutes between.
 */

import { Hono } from "hono";
import type { Context, Env as HonoEnv } from "hono";
import type { HasDb } from "@4dl/core";

export type AccountRouteEnv = { Bindings: HasDb };
// No `Variables` constraint — see `staff-routes.ts` for why requiring one
// rejects every real app.

export interface AccountActor {
  userId: string;
  email: string | null;
}

export interface AccountCopy {
  unauthenticated: string;
  noEmail: string;
  invalidBody: string;
  invalidCode: string;
}

const DEFAULT_COPY: AccountCopy = {
  unauthenticated: "unauthenticated",
  noEmail: "no email on file",
  invalidBody: "invalid body",
  invalidCode: "invalid_code",
};

/** The purpose the step-up code is bound to. Never reused for another action. */
export const ACCOUNT_DELETE_PURPOSE = "account_delete";

export interface AccountRouteDeps<E extends AccountRouteEnv & HonoEnv> {
  actorOf: (c: Context<E>) => AccountActor | null;
  /**
   * Why this person may not delete themselves right now, or null.
   *
   * Returns a CODE the client can branch on, not a sentence — one app answers
   * `owner_must_close_studio` and its UI turns that into a link to the close
   * flow. Checked before the code is sent and again before the erasure.
   */
  blockedReason?: (c: Context<E>, userId: string) => Promise<string | null>;
  /** Mint + deliver the step-up code. The app owns the email and the brand. */
  sendOtp: (c: Context<E>, opts: { subject: string; purpose: string; email: string; actionLabel: string }) => Promise<void>;
  verifyOtp: (c: Context<E>, opts: { subject: string; purpose: string; code: string }) => Promise<boolean>;
  /** Erase them. Irreversible by the time this is called. */
  purgeUser: (c: Context<E>, userId: string) => Promise<void>;
  /** What the confirmation email calls the act. */
  actionLabel?: string;
  copy?: Partial<AccountCopy>;
}

export function accountRoutes<E extends AccountRouteEnv & HonoEnv>(deps: AccountRouteDeps<E>) {
  const copy: AccountCopy = { ...DEFAULT_COPY, ...deps.copy };
  const label = deps.actionLabel ?? "deleting your account";

  return new Hono<E>()
    .post("/me/delete/request-otp", async (c) => {
      const actor = deps.actorOf(c);
      if (!actor) return c.json({ error: copy.unauthenticated }, 401);
      const blocked = await deps.blockedReason?.(c, actor.userId);
      if (blocked) return c.json({ error: blocked }, 409);
      if (!actor.email) return c.json({ error: copy.noEmail }, 400);
      await deps.sendOtp(c, {
        subject: actor.userId,
        purpose: ACCOUNT_DELETE_PURPOSE,
        email: actor.email,
        actionLabel: label,
      });
      return c.json({ ok: true });
    })

    .post("/me/delete", async (c) => {
      const actor = deps.actorOf(c);
      if (!actor) return c.json({ error: copy.unauthenticated }, 401);
      const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
      const code = typeof body?.code === "string" ? body.code : "";
      if (code.length < 4 || code.length > 12) return c.json({ error: copy.invalidBody }, 400);
      // Re-checked: somebody can be made an owner between the two calls, and the
      // first check is minutes old by the time a code arrives by email.
      const blocked = await deps.blockedReason?.(c, actor.userId);
      if (blocked) return c.json({ error: blocked }, 409);
      if (!(await deps.verifyOtp(c, { subject: actor.userId, purpose: ACCOUNT_DELETE_PURPOSE, code }))) {
        return c.json({ error: copy.invalidCode }, 403);
      }
      await deps.purgeUser(c, actor.userId);
      // Their session went with it — the client signs out and reloads.
      return c.json({ ok: true });
    });
}
