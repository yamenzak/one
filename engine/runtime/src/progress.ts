/**
 * WHAT A WORKSPACE HAS ACTUALLY DONE — and the guide that is ticked from it.
 *
 * ⚠️ A CHECKLIST IS DERIVED FROM WHAT HAPPENED, NEVER TICKED BY A SCREEN. That
 * rule is `guide.ts`'s and it has been true of the pure half since the
 * declaration existed; what was missing is the other side of it — nothing
 * counted the events, so every step was permanently unticked and the person who
 * had done all three was told to go and do them.
 *
 * ⚠️ THE COUNT IS A TALLY, NOT A SCAN OF THE AUDIT. The audit answers "what
 * happened, to what, by whom" and is retained on its own schedule; the guide
 * asks "has this workspace ever, and how many times", which is one row per event
 * and an O(1) read. Deriving it from the audit would put a table scan behind a
 * checklist that is drawn on arrival.
 *
 * ⚠️ AND A RAISE IS RECORDED WHETHER OR NOT ANYBODY IS TOLD. The notification
 * path returns early when an event has no audience, which is the correct answer
 * for an inbox and the wrong one for a tally — the step is done either way.
 */

import type { AppSpec, MilestoneDef, TenantId } from "@engine/kernel";
import { PUBLIC, progressOf, reached, remaining } from "@engine/kernel";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const PROGRESS_SCHEMA: SchemaModule = {
  id: "progress",
  statements: [
    /* ⚠️ KEYED BY (workspace, app, event) BECAUSE TWO PRODUCTS MAY RAISE THE
       SAME NAME. `note.created` in one app and in another are two different
       things that would otherwise share a counter, and the guide of each would
       tick from the other's work. */
    `CREATE TABLE IF NOT EXISTS tenant_event (tenant_id TEXT NOT NULL, app TEXT NOT NULL, event TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, first_at TEXT NOT NULL, last_at TEXT NOT NULL, PRIMARY KEY (tenant_id, app, event));`,
    /* ⚠️ AND A MILESTONE IS RECORDED AS SAID, WHICH IS WHAT STOPS IT REPEATING.
       A congratulation on every load is not recognition, it is noise. */
    `CREATE TABLE IF NOT EXISTS tenant_milestone (tenant_id TEXT NOT NULL, app TEXT NOT NULL, milestone TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, app, milestone));`,
  ],
};

/* ------------------------------------------------------------------ store --- */

/**
 * ⚠️ ONE STATEMENT PER EVENT, AND IT IS AN UPSERT. A read-then-write would race
 * two requests raising the same event into one increment — and the two requests
 * that most often arrive together are exactly a person doing the same thing
 * twice, which is what a count is for.
 */
export async function noteEvents(
  db: Db, tenantId: TenantId, app: string, events: readonly string[], now: Date,
): Promise<void> {
  if (!events.length) return;
  const at = now.toISOString();
  await Promise.all(events.map((event) => db.prepare(
    `INSERT INTO tenant_event (tenant_id, app, event, n, first_at, last_at)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT (tenant_id, app, event)
     DO UPDATE SET n = n + 1, last_at = excluded.last_at`,
  ).bind(tenantId, app, event, at, at).run()));
}

export async function eventCounts(
  db: Db, tenantId: TenantId, app: string,
): Promise<Readonly<Record<string, number>>> {
  const rows = await db.prepare(
    `SELECT event, n FROM tenant_event WHERE tenant_id = ? AND app = ?`)
    .bind(tenantId, app).all<{ event: string; n: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.event, r.n]));
}

export async function saidAlready(
  db: Db, tenantId: TenantId, app: string,
): Promise<readonly string[]> {
  const rows = await db.prepare(
    `SELECT milestone FROM tenant_milestone WHERE tenant_id = ? AND app = ?`)
    .bind(tenantId, app).all<{ milestone: string }>();
  return rows.results.map((r) => r.milestone);
}

/** ⚠️ `OR IGNORE`: saying it twice is the thing this table exists to prevent. */
export async function noteSaid(
  db: Db, tenantId: TenantId, app: string, ids: readonly string[], now: Date,
): Promise<void> {
  if (!ids.length) return;
  const at = now.toISOString();
  await Promise.all(ids.map((id) => db.prepare(
    `INSERT OR IGNORE INTO tenant_milestone (tenant_id, app, milestone, at) VALUES (?, ?, ?, ?)`,
  ).bind(tenantId, app, id, at).run()));
}

/* -------------------------------------------------------------- operations --- */

/**
 * ⚠️ THE DECLARATIONS TRAVEL AND THE COUNTS ARE ASKED FOR. `centre.view` already
 * carries the guide and the milestone book with every other declarative slice;
 * this is the one read that says how far along THIS workspace is, so a page can
 * be drawn from data it holds rather than from a second copy of the rules.
 *
 * ⚠️ AND IT IS A READ THAT DOES NOT WRITE. Marking a milestone said inside the
 * read would mean a page that loaded and was closed has used up its one
 * congratulation. `guide.seen` is the write, and the screen calls it after it
 * has actually shown the thing.
 */
export function progressOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  const guide = app.guide ?? {};
  const book = app.milestones ?? {};

  const view: Resolved = {
    id: "guide.view",
    kind: "read",
    method: "GET",
    path: "/api/guide.view",
    permission: PUBLIC,
    spec: {
      id: "guide.view", kind: "read",
      summary: "How far this workspace has got, and what is left.",
      input: {}, output: {},
      permission: PUBLIC,
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: async (bare) => {
      const ctx = bare as PlatformCtx;
      if (!ctx.accountId) return (ctx.fail as (c: string) => never)("platform.unauthorized");
      const tenantId = ctx.tenantId as TenantId;
      /*
        ⚠️ BOTH READS AT ONCE. They do not depend on one another, and a checklist
        is drawn on arrival — where two serial round trips is the difference
        somebody feels (D36).
      */
      const [counts, said] = await Promise.all([
        eventCounts(ctx.db, tenantId, app.id),
        saidAlready(ctx.db, tenantId, app.id),
      ]);
      const raised = Object.keys(counts);
      /* ⚠️ WHAT THIS PERSON COULD ACTUALLY DO. A checklist permanently at 3/5
         because two steps need a permission they do not hold is a checklist they
         learn to ignore — see `remaining`. */
      const held = await ctx.permissionsIn(app.id);
      const fresh: readonly MilestoneDef[] = reached(book, counts, said);
      return {
        steps: remaining(guide, raised, held),
        ...progressOf(guide, raised, held),
        /* ⚠️ REACHED AND NOT YET SAID. The screen congratulates, then calls
           `guide.seen` — so a milestone reached while nobody was looking is
           still waiting the next time somebody is. */
        fresh,
        counts,
        /* ⚠️ AND WHAT HAS ALREADY BEEN SAID, so a page drawing the book itself
           can tell "nothing reached" from "reached and acknowledged". Without it
           a screen that renders the whole milestone book has to treat an empty
           `fresh` as both. */
        said,
      };
    },
  };

  const seen: Resolved = {
    id: "guide.seen",
    kind: "write",
    method: "POST",
    path: "/api/guide.seen",
    permission: PUBLIC,
    spec: {
      id: "guide.seen", kind: "write",
      summary: "Records that a milestone has been shown, so it is not shown again.",
      input: {}, output: {},
      permission: PUBLIC,
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: async (bare, input) => {
      const ctx = bare as PlatformCtx;
      if (!ctx.accountId) return (ctx.fail as (c: string) => never)("platform.unauthorized");
      const asked = (input as { milestone?: unknown }).milestone;
      /* ⚠️ ONLY A MILESTONE THIS APP DECLARES. Writing whatever arrives would
         make the table a list of strings a caller chose, and one typo would
         suppress nothing while looking exactly like a row that works. */
      const id = typeof asked === "string" && asked in book ? asked : null;
      if (!id) return (ctx.fail as (c: string) => never)("platform.not_found");
      await noteSaid(ctx.db, ctx.tenantId as TenantId, app.id, [id], new Date(ctx.now));
      return { id };
    },
  };

  return { "guide.view": view, "guide.seen": seen };
}
