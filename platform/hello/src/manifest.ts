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
  cache, collection, declareProblems, defineApp, defineBindings, field,
  objects, operation, sql,
  type Currency, type Locale, type RegionId, type TimeZone,
} from "@one/kernel";
import type { Ctx } from "@one/kernel";

/* -------------------------------------------------------------- bindings --- */

export const bindings = defineBindings({
  db: sql(),
  media: objects({ jurisdictional: true }),
  cache: cache(),
  /*
    DEFER(one-012) stage:3 — a durable actor binding, which arrives with the
    ledger. Declaring one before there is a class to bind makes every request
    fail resolution, which is the resolver working correctly and the app being
    wrong about what it has.
  */
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
    title: field.text({ required: true }),
    body: field.text({ multiline: true }),
    pinned: field.bool(),
  },
});

/* -------------------------------------------------------------- problems --- */

export const problems = declareProblems({
  "notes.title_required": { status: 400, title: "A note needs a title", retryable: false },
});

/* ------------------------------------------------------------ operations --- */

const nowId = (ctx: Ctx<Bindings>) => `n_${ctx.now().replace(/\D/g, "")}`;

export const listNotes = operation({
  id: "notes.list",
  kind: "read",
  summary: "List the notes in this workspace.",
  input: {} as { _t?: Record<string, never> },
  output: {} as { _t?: { notes: unknown[] } },
  permission: "note:read",
  idempotency: { mode: "none" },
  async handler(ctx: Ctx<Bindings>) {
    const rows = await ctx.bind.db.all<{ id: string; title: string }>(
      `SELECT id, title FROM notes WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      ctx.tenantId,
    );
    return { notes: rows };
  },
});

export const createNote = operation({
  id: "notes.create",
  kind: "write",
  summary: "Write a note in this workspace.",
  input: {} as { _t?: { title: string; body?: string } },
  output: {} as { _t?: { id: string } },
  permission: "note:write",
  idempotency: { mode: "natural", key: "title" },
  audit: (i: { title: string }) => ({ subject: i.title, verb: "create" }),
  outcome: { message: "Note saved", tone: "success", invalidates: ["notes"] },
  emits: ["note.created"],
  fails: ["notes.title_required"],
  async handler(ctx: Ctx<Bindings>, input: { title: string; body?: string }) {
    if (!input.title) ctx.fail("notes.title_required");
    const id = nowId(ctx);
    await ctx.bind.db.run(
      `INSERT INTO notes (id, version, created_at, updated_at, tenant_id, deleted_at, title, body, pinned)
       VALUES (?, 1, ?, ?, ?, NULL, ?, ?, 0)`,
      id, ctx.now(), ctx.now(), ctx.tenantId, input.title, input.body ?? "",
    );
    return { id };
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
    permissions: ["note:read", "note:write", "workspace:create"],
    roles: { owner: ["note:read", "note:write"], reader: ["note:read"] },
    entitlements: { notes: true },
    customerRail: false,
    seats: { counts: ["owner"] },
  },
  governance: {
    legal: [{ id: "terms", version: "2026-01-01", mustAccept: ["owner"] }],
    impersonation: { maxMinutes: 30, announce: true },
    auditRetentionDays: 365,
  },

  collections: [notes],
  operations: [listNotes, createNote],
  problems,
});
