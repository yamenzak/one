/**
 * A TENANT CLOSING ITSELF — the other half of "leaving is always allowed".
 *
 * ── The invariant this exists to make true ──────────────────────────────────
 *
 * `standing.ts`'s ladder withholds a delinquent tenant's product, and every rung
 * exempts the exit path *specifically* so that paying is A way out and not the
 * ONLY way out. That exemption is written into both live apps' route guards.
 * In one of them the route it exempts did not exist, so the exemption protected
 * nothing and a suspended tenant was in a trap: every write refused, the copy
 * saying "pay to restore", and no way to shut the thing down instead.
 *
 * An invariant only one app implements is not an invariant.
 *
 * ── Close is SCHEDULED, not immediate, and that is the feature ──────────────
 *
 * Confirming stops the billing NOW — nobody should be charged for a product
 * they have ended — but the data is held for a grace window and only then
 * purged. Two reasons, and the second is the one people discover late:
 * somebody has to be able to undo a decision made at 2am, and an accountant
 * frequently needs one last export after the owner has pressed the button.
 *
 * `cancel` therefore has NO step-up code. Undoing a destructive act is not
 * itself destructive, and putting a second factor in front of the undo is how a
 * mistake becomes permanent because the confirmation email was slow.
 *
 * ── What is injected, and why it has to be ──────────────────────────────────
 *
 * The state transition is the APP's. Closing cancels subscriptions on rails this
 * package knows nothing about — a platform rail, and in one app a second rail
 * where the tenant bills its own customers, which must also stop, immediately,
 * because billing somebody for coaching that has already ended is not something
 * a grace window should cover. The ROUTES, the guards and the ceremony are what
 * is the same everywhere.
 */

import { Hono } from "hono";
import type { Context, Env as HonoEnv } from "hono";
import type { HasDb } from "@4dl/core";

export type CloseRouteEnv = { Bindings: HasDb };
// No `Variables` constraint — see `@4dl/auth`'s `staff-routes.ts`.

export interface CloseActor {
  tenantId: string;
  userId: string;
  role: string;
  email: string | null;
}

export interface CloseStatus {
  closing: boolean;
  /** When the purge runs, if one is scheduled. */
  deleteAt: string | null;
}

export interface CloseCopy {
  unauthenticated: string;
  forbidden: string;
  noEmail: string;
  invalidBody: string;
  invalidCode: string;
}

const DEFAULT_COPY: CloseCopy = {
  unauthenticated: "unauthenticated",
  forbidden: "forbidden",
  noEmail: "no email on file",
  invalidBody: "invalid body",
  invalidCode: "invalid_code",
};

/** The purpose the step-up code is bound to. Never reused for another action. */
export const TENANT_CLOSE_PURPOSE = "tenant_close";

export interface CloseRouteDeps<E extends CloseRouteEnv & HonoEnv> {
  actorOf: (c: Context<E>) => CloseActor | null;
  /** Only this role may end the tenant. Everyone else gets a 403. */
  creatorRole: string;
  /** Is a close already pending? Drives the danger-zone UI. */
  statusOf: (c: Context<E>, tenantId: string) => Promise<CloseStatus>;
  /** Stop the billing now, hold the data, return the purge date. */
  schedule: (c: Context<E>, tenantId: string) => Promise<{ deleteAt: string }>;
  /** Undo, within the window. No step-up — see the header. */
  cancel: (c: Context<E>, tenantId: string) => Promise<void>;
  sendOtp: (c: Context<E>, opts: { subject: string; purpose: string; email: string; actionLabel: string }) => Promise<void>;
  verifyOtp: (c: Context<E>, opts: { subject: string; purpose: string; code: string }) => Promise<boolean>;
  /**
   * What the confirmation email calls the act — "closing Hale Studio". Takes the
   * tenant so the app can use its BRAND name rather than its slug: a code that
   * says "confirm closing tenant_01H…" is not a confirmation of anything.
   */
  actionLabel: (c: Context<E>, tenantId: string) => Promise<string>;
  copy?: Partial<CloseCopy>;
}

export function tenantCloseRoutes<E extends CloseRouteEnv & HonoEnv>(deps: CloseRouteDeps<E>) {
  const copy: CloseCopy = { ...DEFAULT_COPY, ...deps.copy };

  /** Owner-only. Returns the actor, or the refusal to send. */
  function owner(c: Context<E>): { actor: CloseActor } | { refusal: Response } {
    const actor = deps.actorOf(c);
    if (!actor) return { refusal: c.json({ error: copy.unauthenticated }, 401) };
    if (actor.role !== deps.creatorRole) return { refusal: c.json({ error: copy.forbidden }, 403) };
    return { actor };
  }

  /** The step-up subject is per TENANT, so a code minted to close one cannot
   *  close another the same person happens to own. */
  const subjectOf = (tenantId: string) => `${TENANT_CLOSE_PURPOSE}:${tenantId}`;

  return new Hono<E>()
    .get("/tenant/close/status", async (c) => {
      const o = owner(c);
      if ("refusal" in o) return o.refusal;
      return c.json(await deps.statusOf(c, o.actor.tenantId));
    })

    .post("/tenant/close/request-otp", async (c) => {
      const o = owner(c);
      if ("refusal" in o) return o.refusal;
      const { actor } = o;
      if (!actor.email) return c.json({ error: copy.noEmail }, 400);
      await deps.sendOtp(c, {
        subject: subjectOf(actor.tenantId),
        purpose: TENANT_CLOSE_PURPOSE,
        email: actor.email,
        actionLabel: await deps.actionLabel(c, actor.tenantId),
      });
      return c.json({ ok: true });
    })

    .post("/tenant/close", async (c) => {
      const o = owner(c);
      if ("refusal" in o) return o.refusal;
      const { actor } = o;
      const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
      const code = typeof body?.code === "string" ? body.code : "";
      if (code.length < 4 || code.length > 12) return c.json({ error: copy.invalidBody }, 400);
      if (!(await deps.verifyOtp(c, { subject: subjectOf(actor.tenantId), purpose: TENANT_CLOSE_PURPOSE, code }))) {
        return c.json({ error: copy.invalidCode }, 403);
      }
      const { deleteAt } = await deps.schedule(c, actor.tenantId);
      return c.json({ ok: true, deleteAt });
    })

    .post("/tenant/close/cancel", async (c) => {
      const o = owner(c);
      if ("refusal" in o) return o.refusal;
      await deps.cancel(c, o.actor.tenantId);
      return c.json({ ok: true });
    });
}
