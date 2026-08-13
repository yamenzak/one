/**
 * THE BELL AND WHAT IS BEHIND IT.
 *
 * ⚠️ A MECHANISM WITH NO SURFACE IS THE FAILURE THIS PLATFORM WAS STARTED OVER.
 * A shipping product had the schema, the durable object, the routes and sixteen
 * dispatch sites wired for three stages with nothing a person could look at — so
 * a notification was reachable at an endpoint and nowhere anybody would find it.
 * The operations here are not optional and are mounted for every app.
 */

import type { AnyOperation, AppSpec, BindingSpec, Category, Channel, Policy, SqlHandle, Wording } from "@one/kernel";
import { CHANNELS, MAX_WORDING, channelsFor, operation, s, saying, tokensIn } from "@one/kernel";
import { clearPolicy, listInbox, markRead, policyFor, preferencesFor, setPolicy, setPreferences } from "./inbox.js";
import { devicesOf, forgetDevice, rememberDevice } from "./push.js";
import { SETTINGS_PERMISSION } from "./settings-ops.js";
import { clearWording, setWording, wordingFor } from "./settings.js";

/** ⚠️ A symbol, so an app cannot reach the store by writing a property name. */
export const INBOX = Symbol.for("one.runtime.inbox");

export interface InboxDeps {
  readonly db: SqlHandle;
  readonly tenantId: string;
  readonly userId: string | null;
  /**
   * ⚠️ WHAT THIS PERSON MAY DO, because what they may be TOLD is derived from
   * it. A preferences screen listing every type a product has is one where most
   * rows do nothing for most people — and a switch that does nothing is the
   * failure the push channel was deleted for once already.
   */
  readonly permissions: ReadonlySet<string>;
  readonly role: string;
  /** The roles the MANIFEST declares, so a workspace's own can be told apart. */
  readonly declaredRoles: ReadonlySet<string>;
  /**
   * ⚠️ WHAT THIS DEPLOYMENT CAN ACTUALLY DELIVER. Push with no keys configured
   * is not offered rather than offered and dropped.
   */
  readonly available: readonly Channel[];
  /** The application server key a browser subscribes with. Empty means no push. */
  readonly pushKey: string;
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
    output: s.object({ muted: s.json(), email: s.bool(), push: s.bool(), channels: s.json(), types: s.json() }),
    permission: "inbox:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.userId) return { muted: [], email: false, push: false, channels: [], types: [] };
      const [prefs, policy] = await Promise.all([
        preferencesFor(d.db, d.tenantId, d.userId),
        policyFor(d.db, d.tenantId),
      ]);
      /*
        ⚠️ THE LIST IS DERIVED FROM WHAT THIS PERSON MAY READ AND WHAT THEIR
        WORKSPACE ALLOWS, and it carries the RESOLVED channels per type rather
        than the rules that produced them. A screen re-deriving two levels of
        policy from raw preferences is a second implementation of `channelsFor`,
        and the one people believe is whichever they are looking at.
      */
      const types = Object.entries(app.notifications)
        .filter(([, def]) => (d.declaredRoles.has(d.role) ? def.roles.includes(d.role) : true))
        .filter(([, def]) => d.permissions.has(def.needs))
        .map(([type, def]) => ({
          type, category: def.category, icon: def.icon,
          title: saying(def, undefined).title,
          reaching: channelsFor(def, prefs, policy[type] ?? {}, d.available),
          /* ⚠️ Said out loud, because a row with no switches has a reason and
             "your workspace turned this off" is not the same as "you did". */
          allowed: policy[type]?.off ? [] : (policy[type]?.channels ?? CHANNELS).filter((c) => d.available.includes(c)),
        }));
      return { ...prefs, channels: d.available, types };
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
    input: s.object({
      muted: s.array(s.enum(["billing", "activity", "action", "service"])),
      email: s.bool(),
      push: s.bool(),
    }),
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

  /* --------------------------------------------------------- your devices --- */

  /**
   * ⚠️ THE KEY IS PUBLIC BY CONSTRUCTION — it is the "application server key" a
   * browser is handed to create a subscription with, and it is in every page's
   * network tab by design. What must never leave is the private half, which is
   * in the shared config store and read only by the sender.
   */
  const pushKey = operation({
    id: "inbox.push.key",
    kind: "read",
    summary: "The key this browser subscribes to push notifications with.",
    input: s.object({}),
    output: s.object({ key: s.text() }),
    permission: "inbox:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      /* ⚠️ Empty rather than a refusal: a deployment with no push configured is
         an ordinary deployment, and the screen's answer is to offer no switch. */
      return { key: deps(ctx).pushKey };
    },
  });

  const subscribe = operation({
    id: "inbox.push.subscribe",
    kind: "write",
    summary: "Let this browser receive notifications when the tab is closed.",
    /*
      ⚠️ THE THREE FIELDS ARE THE BROWSER'S OWN, PASSED THROUGH. `endpoint` is
      the push service's URL for this registration and the two keys are what the
      payload is encrypted to — none of them is ours to invent, and a subscribe
      that stored anything else would be one that cannot deliver.
    */
    input: s.object({
      endpoint: s.text({ min: 8, max: 800 }),
      p256dh: s.text({ min: 8, max: 200 }),
      auth: s.text({ min: 4, max: 100 }),
      label: s.optional(s.text({ max: 60 })),
    }),
    output: s.object({ ok: s.bool() }),
    permission: "inbox:read",
    /* ⚠️ The endpoint is the identity: a browser hands back the same one for the
       same registration, so subscribing twice from one device is one row. */
    idempotency: { mode: "natural", key: "endpoint" },
    audit: { why: "a browser registering itself for its own owner's notifications" },
    outcome: { message: "This browser will be notified", tone: "success", invalidates: ["inbox.preferences"] },
    /*
      ⚠️ NOT A TOOL. A model that could register a delivery endpoint would have a
      way to have notifications sent somewhere nobody chose.
    */
    tool: false,
    async handler(ctx, input: { endpoint: string; p256dh: string; auth: string; label?: string }) {
      const d = deps(ctx);
      if (!d.userId) return { ok: false };
      await rememberDevice(
        d.db, d.tenantId, d.userId,
        { endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, label: input.label ?? "" },
        ctx.now(),
      );
      return { ok: true };
    },
  });

  const unsubscribe = operation({
    id: "inbox.push.forget",
    kind: "write",
    summary: "Stop notifying one browser.",
    input: s.object({ endpoint: s.text({ max: 800 }) }),
    output: s.object({ ok: s.bool() }),
    permission: "inbox:read",
    idempotency: { mode: "natural", key: "endpoint" },
    audit: { why: "somebody removing their own browser from their own notifications" },
    outcome: { message: "Stopped", tone: "success", invalidates: ["inbox.preferences"] },
    tool: false,
    async handler(ctx, input: { endpoint: string }) {
      const d = deps(ctx);
      if (!d.userId) return { ok: false };
      /*
        ⚠️ BOUND TO THE OWNER. Without the check this is a stop-notifying-anybody
        endpoint that takes a string — and the string is in the network tab of
        whoever subscribed.
      */
      const mine = (await devicesOf(d.db, d.tenantId, d.userId)).some((x) => x.endpoint === input.endpoint);
      if (!mine) return { ok: false };
      await forgetDevice(d.db, d.tenantId, input.endpoint);
      return { ok: true };
    },
  });

  return [
    read, mark, prefs, setPrefs, pushKey, subscribe, unsubscribe,
    ...wordingOperations(app), ...policyOperations(app),
  ] as unknown as readonly AnyOperation[];
}

/* ------------------------------------------------------- what it may send --- */

/**
 * WHAT A WORKSPACE LETS ITS PRODUCT SAY ON ITS BEHALF.
 *
 * ⚠️ TWO LEVELS, AND THIS IS THE CEILING. A studio that does not want its clients
 * emailed about every published programme is making a decision about its own
 * business, and a person then chooses within what is left. The other order does
 * not work: somebody cannot opt into a channel their workspace has turned off,
 * because the switch would do nothing and say nothing — which is exactly the
 * failure that got the push channel deleted from this platform once already.
 *
 * ⚠️ AND NOTHING HERE NAMES A NOTIFICATION. The list is the registry, so a type
 * a product adds appears on this screen and one it removes stops appearing.
 */
function policyOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const registry = app.notifications;

  const list = operation({
    id: "notify.policy",
    kind: "read",
    summary: "Everything this product can tell people, and what this workspace allows.",
    input: s.object({}),
    output: s.object({ rows: s.json(), channels: s.json() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const book = await policyFor(d.db, d.tenantId);
      const rows = Object.entries(registry).map(([type, def]) => ({
        type,
        category: def.category,
        icon: def.icon,
        title: saying(def, undefined).title,
        roles: def.roles,
        /* ⚠️ The permission is shown because it is the answer to "why does the
           front desk get this" — which is the question a two-level screen
           creates and has to be able to answer. */
        needs: def.needs,
        /*
          ⚠️ AN `action` SAYS SO, so the missing switch has a reason on the
          screen rather than looking like a rendering fault. Nothing may turn one
          off — not the workspace and not the person — because it is the category
          that means the product stops working until somebody acts.
        */
        required: def.category === "action",
        off: book[type]?.off === true,
        channels: book[type]?.channels ?? null,
      }));
      return { rows, channels: d.available };
    },
  });

  const set = operation({
    id: "notify.policy.set",
    kind: "write",
    summary: "Choose whether one of them sends, and on which channels.",
    input: s.object({
      type: s.text({ max: 60 }),
      off: s.optional(s.bool()),
      channels: s.optional(s.json()),
    }),
    output: s.object({ ok: s.bool() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "natural", key: "type" },
    audit: (i: { type: string }) => ({ subject: "notifications", verb: `policy:${i.type}` }),
    outcome: { message: "Saved", tone: "success", invalidates: ["notify.policy", "inbox.preferences"] },
    fails: ["platform.invalid"],
    tool: false,
    async handler(ctx, input: { type: string; off?: boolean; channels?: unknown }) {
      const d = deps(ctx);
      const channels = Array.isArray(input.channels)
        ? input.channels.filter((c): c is Channel => typeof c === "string" && (CHANNELS as readonly string[]).includes(c))
        : undefined;
      const policy: Policy = { ...(input.off ? { off: true } : {}), ...(channels ? { channels } : {}) };
      const refused = await setPolicy(d.db, registry, d.tenantId, input.type, policy, ctx.now());
      /*
        ⚠️ EACH REFUSAL IS ITS OWN SENTENCE. `action_off` is not a validation
        error — it is the platform saying no to something reasonable-looking, and
        it has to say why or it reads as a bug in the switch.
      */
      if (refused === "action_off") {
        ctx.fail("platform.invalid", { field: "off", reason: "this one has to reach people — nothing proceeds until they act on it" });
      }
      if (refused) ctx.fail("platform.invalid", { field: "type", reason: refused });
      return { ok: true };
    },
  });

  const clear = operation({
    id: "notify.policy.clear",
    kind: "write",
    summary: "Go back to how this product sends one of them.",
    input: s.object({ type: s.text({ max: 60 }) }),
    output: s.object({ ok: s.bool() }),
    permission: SETTINGS_PERMISSION,
    idempotency: { mode: "natural", key: "type" },
    audit: (i: { type: string }) => ({ subject: "notifications", verb: `policy:clear:${i.type}` }),
    outcome: { message: "Reset", tone: "success", invalidates: ["notify.policy", "inbox.preferences"] },
    tool: false,
    async handler(ctx, input: { type: string }) {
      const d = deps(ctx);
      await clearPolicy(d.db, d.tenantId, input.type);
      return { ok: true };
    },
  });

  return [list, set, clear] as unknown as readonly AnyOperation[];
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
