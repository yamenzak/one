/**
 * THE TRASH, AND IT IS THE PLATFORM'S RATHER THAN EACH PRODUCT'S.
 *
 * ⚠️ THREE OPERATIONS FOR THE WHOLE APP, NOT THREE PER COLLECTION. A product
 * with twenty collections would otherwise answer sixty routes about a bin, an
 * agent's tool list would grow by sixty entries, and the screen a person opens
 * would still have to fan out over all twenty to find out what is in there. The
 * bin is one place; asking about it is one question.
 *
 * ⚠️ AND THE COLLECTION IS AN ARGUMENT, WHICH IS WHY THE PERMISSION IS RESOLVED
 * PER CALL. `bin.restore` cannot be gated at the door like an ordinary
 * operation — what it is allowed to bring back depends on which collection the
 * caller names, and every collection has its own grant. Resolved here from the
 * manifest, against the same `permissionFor` the generated verbs use, so there
 * is no second answer to "may they write this" to drift from the first.
 *
 * ⚠️ WHAT IS DELIBERATELY NOT HERE: emptying the whole bin at once. It is a
 * control whose only correct use is the one nobody means — a press that
 * destroys everything thirty days would have given back, with no way to say
 * which of it mattered. The sweep empties it, one record at a time, on a clock.
 */

import type { AppSpec, CollectionSpec } from "@engine/kernel";
import { BIN_DAYS, PUBLIC, eraseBy, permissionFor } from "@engine/kernel";
import type { Resolved } from "./compose.js";
import type { PlatformCtx } from "./member-ops.js";
import { setAside } from "./records.js";
import { column, table, type Db } from "./sql.js";
import { reachingBy, type Reaching } from "./reach.js";

/** One record waiting in the bin. */
export interface Binned {
  readonly id: string;
  readonly collection: string;
  /** ⚠️ The collection's own word for one of them — "Product", never "product". */
  readonly of: string;
  /** ⚠️ What it was called, so the list needs no join per row. */
  readonly name: string;
  readonly at: string;
  readonly by: string | null;
}

/**
 * ⚠️ THE FIRST TEXT FIELD IS WHAT A RECORD IS CALLED, and it is a guess this
 * makes once rather than a `title` every collection would have to declare. Every
 * collection in this product leads with the thing's name because a list has to
 * show something, so the guess is right — and where it is wrong the row still
 * carries its collection and its date, which is enough to decide.
 */
const namesIn = (spec: CollectionSpec): string | null =>
  Object.entries(spec.fields).find(([, f]) => f.kind === "text")?.[0] ?? null;

/**
 * ⚠️ WHAT IS IN THE BIN, ACROSS EVERY COLLECTION — one query per collection,
 * ALL AT ONCE. Awaited in order this is one round trip per collection in a
 * chain, which for a product with twenty of them is twenty hops on one screen
 * (D36). `Db` has no `batch`, so a concurrent fan-out is the shape available.
 *
 * ⚠️ AND IT IS BOUNDED BY THE MANIFEST rather than by anything a caller sends.
 * The number of collections is fixed at build time, so this cannot grow with a
 * workspace's data — which is the difference between a fan-out and a runaway.
 */
export async function binnedIn(
  db: Db, app: AppSpec, scope: (spec: CollectionSpec) => string,
  reaching: (spec: CollectionSpec) => Reaching | null,
): Promise<readonly Binned[]> {
  const found = await Promise.all(app.collections.map(async (spec) => {
    const erase = eraseBy(spec);
    const near = reaching(spec);
    const names = namesIn(spec);
    const where = [
      "aside = 'binned'",
      ...(erase ? [`${column(erase.column)} = ?`] : []),
      ...(near
        ? near.values.length
          ? [`${column(near.column)} IN (${near.values.map(() => "?").join(", ")})`]
          : ["1 = 0"]
        : []),
    ].join(" AND ");
    const rows = await db.prepare(
      `SELECT id, aside_at, edited_by, ${names ? column(names) : "NULL"} AS shown `
      + `FROM ${table(spec.id)} WHERE ${where} ORDER BY aside_at DESC LIMIT 200`)
      .bind(...(erase ? [scope(spec)] : []), ...(near?.values ?? [])).all();
    return rows.results.map((row) => ({
      id: String(row.id),
      collection: spec.id,
      of: spec.label.one,
      /* ⚠️ AND A ROW WITH NOTHING TO SHOW SAYS SO IN ITS OWN WORDS, rather than
         leaving a blank line somebody has to press to find out about. */
      name: String(row.shown ?? "") || `A ${spec.label.one.toLowerCase()}`,
      at: String(row.aside_at ?? ""),
      by: row.edited_by === null || row.edited_by === undefined ? null : String(row.edited_by),
    }));
  }));

  /* ⚠️ NEWEST FIRST ACROSS ALL OF THEM. Sorted per collection and concatenated,
     the screen reads as a list grouped by a table name nobody chose. */
  return found.flat().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function binOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  const byId = new Map(app.collections.map((c) => [c.id, c]));

  const op = (
    id: string, kind: "read" | "write", summary: string,
    run: (ctx: PlatformCtx, input: Record<string, unknown>) => Promise<unknown>,
  ): Resolved => ({
    id, kind,
    method: kind === "read" ? "GET" : "POST",
    path: `/api/${id}`,
    /*
      ⚠️ `PUBLIC` AT THE DOOR AND CHECKED IN THE HANDLER, which is the shape this
      framework otherwise refuses — and the reason is that the grant depends on
      an ARGUMENT. There is no single permission that means "may restore", only
      `product:write` and `location:write` and eighteen others; naming any one of
      them here would either refuse somebody who may or admit somebody who may
      not, on every other collection.
    */
    permission: PUBLIC,
    spec: {
      id, kind, summary,
      input: {}, output: {},
      permission: PUBLIC,
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: (ctx, input) => run(ctx as PlatformCtx, input),
  });

  /**
   * ⚠️ THE COLLECTION'S OWN WRITE GRANT, RESOLVED PER CALL. Bringing a record
   * back is a write to that record, so it is the same grant that would have let
   * somebody create it — anything looser would be a door into a collection
   * through the bin.
   */
  /* ⚠️ THE SAME RESOLUTION THE GENERATED VERBS USE — see `scopeOf` in
     `compose.ts`. A second reading of which id a collection answers to is how a
     bin comes to hold somebody else's records. */
  const scopeOf = (ctx: PlatformCtx, spec: CollectionSpec): string =>
    (eraseBy(spec)?.of === "subject" ? String(ctx.accountId ?? "") : String(ctx.tenantId));

  const mayWrite = async (
    ctx: PlatformCtx, id: string,
  ): Promise<CollectionSpec> => {
    const spec = byId.get(id);
    if (!spec) return ctx.fail("platform.not_found");
    const held = await ctx.permissionsIn(app.id);
    if (!held.has(permissionFor(spec, "update"))) ctx.fail("platform.forbidden");
    return spec;
  };

  return {
    "bin.list": op("bin.list", "read", "What is in the bin", async (ctx) => {
      const items = await binnedIn(
        ctx.db, app,
        (spec) => scopeOf(ctx, spec),
        (spec) => reachingBy(spec.reachBy, ctx.reach ?? null),
      );
      /* ⚠️ THE WINDOW TRAVELS WITH THE LIST. A screen that hard-coded "30 days"
         would be a second copy of a number the sweep owns, and the two would
         disagree the day either moves. */
      return { items, days: BIN_DAYS };
    }),

    /*
      ⚠️ FREEZING IS THE OTHER WAY A RECORD LEAVES THE LISTS, AND IT IS NOT A
      SLOWER DELETE — see `Aside`. A workshop stops buying a solvent: the product
      should not be in the picker somebody uses at a shelf, and every delivery,
      count and label in its history must go on resolving. Binned, it would be
      destroyed in a month and take all of that with it.

      ⚠️ SO IT SHARES THIS FILE AND NOT THE SWEEP. The mechanism is one column
      and one route; what differs is a clock, and the sweep reads `binned` alone.
    */
    "bin.freeze": op("bin.freeze", "write", "Put it out of the way", async (ctx, input) => {
      const spec = await mayWrite(ctx, String(input.collection ?? ""));
      if (!await setAside(
        ctx.db, spec, scopeOf(ctx, spec), String(input.id ?? ""), "frozen", new Date(ctx.now),
        reachingBy(spec.reachBy, ctx.reach ?? null),
      )) {
        ctx.fail("platform.not_found");
      }
      return { id: String(input.id ?? "") };
    }),

    "bin.restore": op("bin.restore", "write", "Put it back", async (ctx, input) => {
      const spec = await mayWrite(ctx, String(input.collection ?? ""));
      if (!await setAside(
        ctx.db, spec, scopeOf(ctx, spec), String(input.id ?? ""), null, new Date(ctx.now),
        reachingBy(spec.reachBy, ctx.reach ?? null),
      )) {
        /*
          ⚠️ NOT FOUND, AND IT IS THE HONEST ANSWER FOR BOTH CASES. The record
          may have been swept, or it may be somebody else's — and saying which
          would turn this into a way to ask whether a given id exists in a
          workspace the caller cannot see.
        */
        ctx.fail("platform.not_found");
      }
      return { id: String(input.id ?? "") };
    }),
  };
}
