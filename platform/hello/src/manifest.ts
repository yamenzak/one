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
  cache, collection, defineApp, defineBindings, field,
  objects, sql,
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
    permissions: ["note:read", "note:write", "receipt:read", "receipt:write", "workspace:create"],
    /*
      Anybody signed in may open a workspace — this is a self-serve product, and
      `workspace:create` is checked on a door that has no tenant to be a member
      of, so a role is the only place it could come from.
    */
    roles: { owner: ["note:read", "note:write", "receipt:read", "receipt:write", "workspace:create"], reader: ["note:read"] },
    entitlements: { notes: true },
    customerRail: false,
    seats: { counts: ["owner"] },
  },
  governance: {
    legal: [{ id: "terms", version: "2026-01-01", mustAccept: ["owner"] }],
    impersonation: { maxMinutes: 30, announce: true },
    auditRetentionDays: 365,
  },

  collections: [notes, receipts],
  /*
    ⚠️ EMPTY, AND THAT IS THE POINT. Every surface this app has is derived from
    the two collections above — list, read, create, update, delete, the document
    lifecycle and the activity log. What belongs here is what a collection could
    not imply, and `hello` has none of that.
  */
  operations: [],
  /*
    ⚠️ EMPTY, HONESTLY. Every failure this app can produce is one the platform
    raises on its behalf — a refused shape, a stale version, a missing row. An
    app declares a code when it has a rule of its own to refuse with, and adding
    one here to look complete would be copy nobody ever reads.
  */
  problems: {},
});
