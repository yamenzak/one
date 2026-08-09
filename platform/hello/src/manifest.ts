/**
 * THE SMALLEST REAL APP — one collection, three operations, and nothing else.
 *
 * ⚠️ IT EXISTS TO BOOT. Every stage's exit criterion in PLAN.md §8 is asserted
 * against this app, which is what stops the platform from being a set of types
 * that have never met a request. A stage that cannot make `hello` do the thing
 * has not finished, whatever the unit tests say.
 *
 * It carries no product vocabulary on purpose: a `note` is the least meaningful
 * collection that still has a field, an owner and a lifecycle.
 */

import {
  UNLIMITED,
  cache, collection, defineApp, defineBindings, field,
  objects, operation, s, sql,
  type Currency, type Locale, type RegionId, type TimeZone,
} from "@one/kernel";

/* -------------------------------------------------------------- bindings --- */

export const bindings = defineBindings({
  db: sql(),
  media: objects({ jurisdictional: true }),
  cache: cache(),
});

export type Bindings = typeof bindings;

/* ------------------------------------------------------------ collection --- */

export const notes = collection({
  id: "note",
  label: { one: "Note", many: "Notes" },
  scope: { of: "tenant" },
  entitlement: "notes",
  version: true,
  retention: { days: null, onTenantClose: "purge" },
  onDelete: { on: "archive" },
  activity: true,
  search: ["title"],
  fields: {
    title: field.text({ required: true, min: 1, max: 200 }),
    body: field.text({ multiline: true }),
    pinned: field.bool(),
  },
});

/* ------------------------------------------------------------ collection --- */

/**
 * A DOCUMENT, so the lifecycle is exercised rather than described.
 *
 * ⚠️ Opt-in per collection, and this is the shape it is right for: a record that
 * ASSERTS something happened, whose value is that it cannot quietly change
 * afterwards. It is exactly wrong for the notes beside it, which is why one has
 * it and the other does not.
 */
export const receipts = collection({
  id: "receipt",
  label: { one: "Receipt", many: "Receipts" },
  scope: { of: "tenant" },
  // ⚠️ A CEILING ON CREATE, NOT ON READ. Refusing to show what a workspace
  // already stored because it has since downgraded holds their own records
  // hostage; refusing the next one does not.
  quota: "receiptsStored",
  version: true,
  retention: { days: 2555, onTenantClose: "export-then-purge" },
  onDelete: { on: "archive" },
  naming: { series: "RC-.YYYY.-.####" },
  docStatus: { amendable: true, immutableAfterSubmit: ["total", "issuedOn"] },
  activity: true,
  fields: {
    total: field.money({ required: true }),
    issuedOn: field.plainDate({ required: true }),
    memo: field.text({ multiline: true }),
  },
});

/* ------------------------------------------------------------ operation --- */

/**
 * ⚠️ THE ONE THING A COLLECTION COULD NOT IMPLY: a capability sold to somebody
 * who is not the workspace.
 *
 * Everything else `hello` has is derived. This exists because the customer rail
 * needs a capability that is genuinely WITHHELD by a route — hiding a tab is not
 * withholding anything, and a product that only hides it ships a report every
 * customer can fetch by asking for it directly.
 */
export const digest = operation<Bindings, Record<string, never>, { count: number }>({
  id: "notes.digest",
  kind: "read",
  summary: "A rolled-up view of this workspace's notes.",
  input: s.object({}),
  output: s.object({ count: s.number({ integer: true }) }),
  permission: "note:read",
  customerFlag: "digest",
  idempotency: { mode: "none" },
  async handler(ctx) {
    const row = await ctx.bind.db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM notes WHERE tenant_id = ?`, ctx.tenantId);
    return { count: row?.n ?? 0 };
  },
});

/* ------------------------------------------------------------------- app --- */

export const hello = defineApp({
  id: "hello",
  name: "Hello",
  stripeMetadataPrefix: "hello",
  manifestVersion: "0.1.0",
  bindings,

  identity: {
    rootRelyingParty: "4dl.app",
    sessionScope: "origin",
    directoryRegion: "eu" as RegionId,
  },
  tenancy: {
    appRoot: "hello.4dl.app",
    doors: ["root", "setup", "admin", "slug", "custom"],
    regions: ["auto", "eu"] as RegionId[],
    defaultRegion: "auto" as RegionId,
    reservedSlugs: ["hello"],
  },
  format: {
    currency: "EUR" as Currency,
    timeZone: "Europe/Berlin" as TimeZone,
    locale: "en" as Locale,
    units: "metric",
    weekStart: 1,
  },
  access: {
    permissions: ["note:read", "note:write", "receipt:read", "receipt:write", "workspace:create", "billing:manage", "commerce:read", "commerce:manage", "billing:operate", "inbox:read", "workspace:close", "file:read", "file:write"],
    /*
      Anybody signed in may open a workspace — this is a self-serve product, and
      `workspace:create` is checked on a door that has no tenant to be a member
      of, so a role is the only place it could come from.
    */
    roles: { owner: ["note:read", "note:write", "receipt:read", "receipt:write", "workspace:create", "billing:manage", "commerce:read", "commerce:manage", "billing:operate", "inbox:read", "workspace:close", "file:read", "file:write"], reader: ["note:read"] },
    /*
      ⚠️ EVERY ENTRY NAMES HOW IT IS WITHHELD, and `defineApp` refuses one whose
      mechanism does not exist. `notes` is gated on the collection rather than on
      each derived operation — a collection derives seven of them, and repeating
      a gate seven times is how six get it.
    */
    entitlements: {
      notes: { parked: true, enforcement: "gate" },
      receiptsStored: { parked: 5, enforcement: "quota" },
      /* ⚠️ BYTES, not files. A ceiling counted in rows is one a single large
         upload walks straight past. */
      storedBytes: { parked: 2_000_000, enforcement: "quota" },
    },
    plans: [
      {
        id: "free",
        name: "Free",
        price: { minor: 0, currency: "EUR" as Currency },
        period: "month",
        trialDays: 0,
        entitlements: { notes: true, receiptsStored: 5, storedBytes: 2_000_000 },
      },
      {
        id: "keeper",
        name: "Keeper",
        price: { minor: 500, currency: "EUR" as Currency },
        period: "month",
        trialDays: 14,
        entitlements: { notes: true, receiptsStored: UNLIMITED, storedBytes: 50_000_000 },
      },
    ],
    /*
      ⚠️ THE SECOND RAIL, AND IT IS NOT THE FIRST ONE AGAIN. `notes` is what the
      PLATFORM sells this workspace; `digest` is what the workspace sells the
      people it serves. They resolve separately and a real capability is the
      intersection — which is what stops a workspace selling something it did
      not itself buy.
    */
    customerRail: true,
    customerFlags: {
      digest: { parked: false, enforcement: "gate", scope: "reading", requires: "notes" },
    },
    seats: { counts: ["owner"] },
  },
  governance: {
    legal: [{ id: "terms", version: "2026-01-01", mustAccept: ["owner"] }],
    impersonation: { maxMinutes: 30, announce: true },
    auditRetentionDays: 365,
  },

  collections: [notes, receipts],

  /*
    ⚠️ EVERY EVENT THE PLATFORM'S OWN OPERATIONS RAISE IS DECLARED HERE, and an
    app that omits one does not boot. That is deliberate: a workspace created, a
    plan chosen, a package granted and a payment settled are all things somebody
    should be told about, and "the platform emits it so the platform will handle
    it" is how a product ships an event nobody ever sees.
  */
  notifications: {
    "workspace.created": {
      category: "service", tone: "success", icon: "sparkle",
      title: "{slug} is ready",
      link: { to: "inbox" },
      roles: ["owner"],
    },
    "plan.chosen": {
      category: "billing", tone: "info", icon: "card",
      title: "You chose {planId}",
      link: { to: "inbox" },
      roles: ["owner"],
    },
    "package.granted": {
      category: "billing", tone: "success", icon: "gift",
      title: "{days} days added",
      link: { to: "inbox" },
      roles: ["owner"],
    },
  },
  /*
    ⚠️ EMPTY, AND THAT IS THE POINT. Every surface this app has is derived from
    the two collections above — list, read, create, update, delete, the document
    lifecycle and the activity log. What belongs here is what a collection could
    not imply, and `hello` has none of that.
  */
  operations: [digest],

  /*
    ⚠️ HELP IS PART OF THE MANIFEST, so an article about a screen this app does
    not have, and a cross-link to an article that does not exist, are both
    refusals rather than something somebody discovers while stuck.
  */
  help: {
    notes: {
      title: "Keeping notes",
      body: "A note is a short piece of text you want to find again. Everyone in this workspace can see them.",
      steps: ["Open Notes", "Write it", "Save"],
      surfaces: ["note"],
    },
    receipts: {
      title: "Recording what you spent",
      body: "A receipt records an amount and the day it happened. Once you submit one it stops being editable, which is the point of it.",
      surfaces: ["receipt"],
    },
  },

  /* ⚠️ A closed set: what may be uploaded, which types, how large. */
  filePurposes: {
    attachment: { label: "Attachment", accept: ["image/jpeg", "image/png", "text/plain"], maxBytes: 4_000_000 },
  },

  releases: [
    { version: "0.1.0", at: "2026-02-01", notes: ["Notes and receipts.", "You can now choose a plan."] },
  ],

  retired: {},
  /*
    ⚠️ EMPTY, HONESTLY. Every failure this app can produce is one the platform
    raises on its behalf — a refused shape, a stale version, a missing row. An
    app declares a code when it has a rule of its own to refuse with, and adding
    one here to look complete would be copy nobody ever reads.
  */
  problems: {},
});
