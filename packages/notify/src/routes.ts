/**
 * THE INBOX'S ENDPOINTS — read it, mark it read, and keep it live.
 *
 * Four routes over tables and a Durable Object this package already owns, and
 * they lived in one app's `context-routes.ts` for no reason beyond that being
 * where they were first written. The cost was the usual one: Tessa mounted
 * `InboxDO`, applied the schema, and had nothing to call.
 *
 * ── `/inbox/ws` is USER-scoped, not tenant-scoped ───────────────────────────
 *
 * The bell is personal and follows someone across every tenancy they belong to,
 * so the socket is keyed on the user id alone. Keying it per tenant would give
 * someone in two tenants two sockets and half a bell in each.
 *
 * The DO's push payload is deliberately just "refetch" — no notification body
 * crosses the socket, so a stale or mis-addressed connection cannot leak one.
 *
 * ── "Mark all read" respects the surface you are in ─────────────────────────
 *
 * An app whose users hold two roles at once — a coach who trains themselves —
 * shows a per-surface bell, and clearing it must clear only what is visible. A
 * `read-all` that ignored the surface would silently mark the OTHER surface's
 * unread notifications read, which is indistinguishable from losing them.
 */

import { Hono } from "hono";
import type { Context, Env as HonoEnv } from "hono";
import type { HasDb } from "@4dl/core";
import { notifVisibleInSurface, notifyRegistry, type NotifSurface } from "./model.js";

/**
 * The slice of an app's Hono env these routes read.
 *
 * The namespace is described STRUCTURALLY — the two members the upgrade needs —
 * for the same reason `inbox-do.ts` describes the push side that way:
 * `DurableObjectNamespace<T>` is invariant in `T`, so an app whose binding is
 * typed `DurableObjectNamespace<InboxDO>` is not assignable to one typed with
 * the default parameter, and every app subclasses or re-exports the DO.
 */
export type NotifyRouteEnv = {
  Bindings: HasDb & {
    INBOX: {
      idFromName(name: string): DurableObjectId;
      get(id: DurableObjectId): { fetch(req: Request): Promise<Response> };
    };
  };
  // Deliberately NO `Variables` constraint. Requiring one — even the seemingly
  // harmless `Record<string, unknown>` — rejects every real app, because a
  // context typed by Better Auth's inferred session has no index signature and
  // so is not assignable to it. These routes read the user through the injected
  // `currentUserId`, which is the whole point of injecting it.
};

export interface NotifyRouteDeps<E extends NotifyRouteEnv & HonoEnv> {
  /** The signed-in user, or null. The inbox is personal, so this is all it needs. */
  currentUserId: (c: Context<E>) => string | null;
}

export function notifyRoutes<E extends NotifyRouteEnv & HonoEnv>(deps: NotifyRouteDeps<E>) {
  const unauthorised = (c: Context<E>) => c.json({ error: "unauthenticated" }, 401);

  return new Hono<E>()
    .get("/notifications", async (c) => {
      const userId = deps.currentUserId(c);
      if (!userId) return unauthorised(c);
      const rows = await c.env.DB.prepare(
        "SELECT * FROM notifications WHERE recipient_user_id = ? ORDER BY created_at DESC LIMIT 50",
      )
        .bind(userId)
        .all();
      return c.json({ notifications: rows.results ?? [] });
    })

    /** Real-time push: one hibernating WebSocket per user, via InboxDO. */
    .get("/inbox/ws", (c) => {
      const userId = deps.currentUserId(c);
      if (!userId) return unauthorised(c);
      if (c.req.header("Upgrade") !== "websocket") return c.json({ error: "expected websocket" }, 426);
      const stub = c.env.INBOX.get(c.env.INBOX.idFromName(userId));
      return stub.fetch(c.req.raw);
    })

    .post("/notifications/:id/read", async (c) => {
      const userId = deps.currentUserId(c);
      if (!userId) return unauthorised(c);
      // Scoped to the recipient, so an id belonging to somebody else is a no-op
      // rather than a cross-user write.
      await c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND recipient_user_id = ?")
        .bind(c.req.param("id"), userId)
        .run();
      return c.json({ ok: true });
    })

    .post("/notifications/read-all", async (c) => {
      const userId = deps.currentUserId(c);
      if (!userId) return unauthorised(c);
      const body = (await c.req.json().catch(() => ({}))) as { surface?: string };
      // Only a surface the registry actually names is honoured. An unrecognised
      // one falls through to "clear everything", which is what an app with a
      // single surface sends anyway (nothing).
      const known = notifyRegistry().audiences;
      const surface: NotifSurface | null =
        body.surface && known && (body.surface === known.customer || body.surface === known.member) ? body.surface : null;

      if (surface) {
        const types = Object.keys(notifyRegistry().types).filter((t) => notifVisibleInSurface(t, surface));
        // No types in this surface means nothing to clear — and an empty `IN ()`
        // is a SQL error, not a no-op.
        if (types.length === 0) return c.json({ ok: true });
        const ph = types.map(() => "?").join(",");
        await c.env.DB
          .prepare(`UPDATE notifications SET read = 1 WHERE recipient_user_id = ? AND read = 0 AND type IN (${ph})`)
          .bind(userId, ...types)
          .run();
      } else {
        await c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE recipient_user_id = ? AND read = 0")
          .bind(userId)
          .run();
      }
      return c.json({ ok: true });
    });
}
