/**
 * THE BELL AND WHAT IS BEHIND IT.
 *
 * ⚠️ A MECHANISM WITH NO SURFACE IS THE FAILURE THIS PLATFORM WAS STARTED OVER.
 * A shipping product had the schema, the durable object, the routes and sixteen
 * dispatch sites wired for three stages with nothing a person could look at — so
 * a notification was reachable at an endpoint and nowhere anybody would find it.
 * The operations here are not optional and are mounted for every app.
 */

import type { AnyOperation, AppSpec, BindingSpec, Category, SqlHandle } from "@one/kernel";
import { operation, s } from "@one/kernel";
import { listInbox, markRead, preferencesFor, setPreferences } from "./inbox.js";

/** ⚠️ A symbol, so an app cannot reach the store by writing a property name. */
export const INBOX = Symbol.for("one.runtime.inbox");

export interface InboxDeps {
  readonly db: SqlHandle;
  readonly tenantId: string;
  readonly userId: string | null;
}

export interface InboxCarrier { readonly [INBOX]: InboxDeps }

const deps = (ctx: unknown): InboxDeps => (ctx as InboxCarrier)[INBOX];

export function inboxOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const read = operation({
    id: "inbox.list",
    kind: "read",
    summary: "What this product has told you, most recent first.",
    input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 100 })) }),
    output: s.object({ rows: s.json(), unread: s.number({ integer: true }) }),
    /*
      ⚠️ SCOPED TO THE CALLER BY CONSTRUCTION, not by a permission. An inbox is
      not a resource somebody can be granted access to — it is one person's, and
      the id comes from the session rather than from the request. There is no
      parameter to tamper with.
    */
    permission: "inbox:read",
    idempotency: { mode: "none" },
    async handler(ctx, input: { limit?: number }) {
      const d = deps(ctx);
      if (!d.userId) return { rows: [], unread: 0 };
      return listInbox(d.db, app.notifications, d.tenantId, d.userId, Math.min(input.limit ?? 25, 100));
    },
  });

  const mark = operation({
    id: "inbox.read",
    kind: "write",
    summary: "Mark one notification read, or all of them.",
    input: s.object({ id: s.optional(s.text({ max: 60 })) }),
    output: s.object({ ok: s.bool() }),
    permission: "inbox:read",
    idempotency: { mode: "natural", key: "id" },
    async handler(ctx, input: { id?: string }) {
      const d = deps(ctx);
      if (!d.userId) return { ok: false };
      await markRead(d.db, d.tenantId, d.userId, ctx.now(), input.id);
      return { ok: true };
    },
  });

  const prefs = operation({
    id: "inbox.preferences",
    kind: "read",
    summary: "Which interruptions you have asked for.",
    input: s.object({}),
    output: s.object({ muted: s.json(), email: s.bool(), push: s.bool() }),
    permission: "inbox:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.userId) return { muted: [], email: false, push: false };
      return preferencesFor(d.db, d.tenantId, d.userId);
    },
  });

  const setPrefs = operation({
    id: "inbox.preferences.set",
    kind: "write",
    summary: "Choose which interruptions you want.",
    /*
      ⚠️ CATEGORIES, NOT TYPES. A per-type preference screen is a list nobody
      maintains: every notification added later arrives switched to whatever the
      default is, and somebody who carefully turned eleven things off has a
      twelfth they never asked for.
    */
    input: s.object({ muted: s.array(s.enum(["billing", "activity", "action", "service"])), email: s.bool(), push: s.bool() }),
    output: s.object({ ok: s.bool() }),
    permission: "inbox:read",
    idempotency: { mode: "none" },
    outcome: { message: "Saved", tone: "success", invalidates: ["inbox.preferences"] },
    async handler(ctx, input: { muted: Category[]; email: boolean; push: boolean }) {
      const d = deps(ctx);
      if (!d.userId) return { ok: false };
      await setPreferences(d.db, d.tenantId, d.userId, input);
      return { ok: true };
    },
  });

  return [read, mark, prefs, setPrefs] as unknown as readonly AnyOperation[];
}
