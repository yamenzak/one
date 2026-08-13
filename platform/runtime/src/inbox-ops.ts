/**
 * THE BELL AND WHAT IS BEHIND IT.
 *
 * ⚠️ A MECHANISM WITH NO SURFACE IS THE FAILURE THIS PLATFORM WAS STARTED OVER.
 * A shipping product had the schema, the durable object, the routes and sixteen
 * dispatch sites wired for three stages with nothing a person could look at — so
 * a notification was reachable at an endpoint and nowhere anybody would find it.
 * The operations here are not optional and are mounted for every app.
 */

import type { AnyOperation, AppSpec, BindingSpec, Category, SqlHandle, Wording } from "@one/kernel";
import { MAX_WORDING, operation, s, saying, tokensIn } from "@one/kernel";
import { listInbox, markRead, preferencesFor, setPreferences } from "./inbox.js";
import { SETTINGS_PERMISSION } from "./settings-ops.js";
import { clearWording, setWording, wordingFor } from "./settings.js";

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
      return listInbox(
        d.db, app.notifications, d.tenantId, d.userId, Math.min(input.limit ?? 25, 100),
        await wordingFor(d.db, d.tenantId),
      );
    },
  });

  const mark = operation({
    id: "inbox.read",
    kind: "write",
    /* ⚠️ Its own record, not this one — see `auditFor`. */
    audit: { why: "marking one's own notification read. An entry per read is volume with no reader" },
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
    output: s.object({ muted: s.json(), email: s.bool() }),
    permission: "inbox:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.userId) return { muted: [], email: false };
      return preferencesFor(d.db, d.tenantId, d.userId);
    },
  });

  const setPrefs = operation({
    id: "inbox.preferences.set",
    kind: "write",
    /* ⚠️ Its own record, not this one — see `auditFor`. */
    audit: { why: "somebody's own notification choices, changed by nobody but them" },
    summary: "Choose which interruptions you want.",
    /*
      ⚠️ CATEGORIES, NOT TYPES. A per-type preference screen is a list nobody
      maintains: every notification added later arrives switched to whatever the
      default is, and somebody who carefully turned eleven things off has a
      twelfth they never asked for.
    */
    input: s.object({ muted: s.array(s.enum(["billing", "activity", "action", "service"])), email: s.bool() }),
    output: s.object({ ok: s.bool() }),
    permission: "inbox:read",
    idempotency: { mode: "none" },
    outcome: { message: "Saved", tone: "success", invalidates: ["inbox.preferences"] },
    async handler(ctx, input: { muted: Category[]; email: boolean }) {
      const d = deps(ctx);
      if (!d.userId) return { ok: false };
      await setPreferences(d.db, d.tenantId, d.userId, input);
      return { ok: true };
    },
  });

  return [read, mark, prefs, setPrefs, ...wordingOperations(app)] as unknown as readonly AnyOperation[];
}

/* ----------------------------------------------------------- their words --- */

/**
 * ⚠️ A TENANT IS A BUSINESS WRITING TO ITS OWN CUSTOMERS, and the sentences it
 * sends them are its voice rather than the product's.
 *
 * What makes this safe to offer is that only the COPY moves. The category, the
 * tone, the audience and the link stay declared, so a reworded notification is
 * still triageable, still goes to the right people and still opens the right
 * record — and the types a workspace may not touch are the ones the platform
 * sends to it, about it.
 */
function wordingOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const registry = app.notifications;

  const list = operation({
    id: "wording.list",
    kind: "read",
    summary: "Every message this workspace sends, in its words and in ours.",
    input: s.object({}),
    /*
      ⚠️ BOTH VERSIONS TRAVEL. A screen showing only what was typed cannot tell
      somebody what they are replacing, and a screen showing only the current
      answer cannot tell them whether they have replaced anything — which is how
      an editable field comes to look like a broken one.
    */
    output: s.object({ rows: s.json() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const book = await wordingFor(d.db, d.tenantId);
      const rows = Object.entries(registry)
        .filter(([, def]) => def.theirs)
        .map(([type, def]) => {
          const said = saying(def, book[type]);
          return {
            type,
            category: def.category,
            ours: { title: def.title, ...(def.body ? { body: def.body } : {}) },
            theirs: book[type] ?? null,
            saying: said,
            /*
              ⚠️ THE SAME FUNCTION THE WRITE REFUSES WITH. A screen listing
              tokens from its own second regex is one that eventually offers a
              value the store rejects, and the person typing has no way to tell
              which of the two is lying.
            */
            values: [...new Set([...tokensIn(def.title), ...tokensIn(def.body ?? "")])],
          };
        });
      return { rows };
    },
  });

  const set = operation({
    id: "wording.set",
    kind: "write",
    summary: "Put one of them in your own words.",
    input: s.object({
      type: s.text({ max: 60 }),
      title: s.optional(s.text({ max: MAX_WORDING })),
      body: s.optional(s.text({ max: MAX_WORDING })),
    }),
    output: s.object({ ok: s.bool() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "natural", key: "type" },
    audit: (i: { type: string }) => ({ subject: "wording", verb: `set:${i.type}` }),
    outcome: { message: "Saved", tone: "success", invalidates: ["wording.list", "inbox.list"] },
    fails: ["platform.invalid"],
    /*
      ⚠️ NOT A TOOL, for the same reason `settings.write` is not one. A model that
      can change the words a business sends its customers is one sentence in
      something it was asked to summarise away from sending them anything.
    */
    tool: false,
    async handler(ctx, input: Wording & { type: string }) {
      const d = deps(ctx);
      const refused = await setWording(d.db, registry, d.tenantId, input.type, input, ctx.now());
      if (refused) ctx.fail("platform.invalid", { field: "type", reason: refused });
      return { ok: true };
    },
  });

  const clear = operation({
    id: "wording.clear",
    kind: "write",
    summary: "Go back to our words for one of them.",
    input: s.object({ type: s.text({ max: 60 }) }),
    output: s.object({ ok: s.bool() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "natural", key: "type" },
    audit: (i: { type: string }) => ({ subject: "wording", verb: `clear:${i.type}` }),
    outcome: { message: "Reset", tone: "success", invalidates: ["wording.list", "inbox.list"] },
    tool: false,
    async handler(ctx, input: { type: string }) {
      const d = deps(ctx);
      await clearWording(d.db, d.tenantId, input.type);
      return { ok: true };
    },
  });

  return [list, set, clear] as unknown as readonly AnyOperation[];
}
