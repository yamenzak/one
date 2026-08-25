/**
 * A FIELD ON WHAT THE ROW POINTS AT, FETCHED IN ONE QUERY PER REFERENCE.
 *
 * ⚠️ WITHOUT THIS EVERY DECLARED LIST IS A COLUMN OF IDS. A stock line holds
 * `product` and `location` as references; what a screen wants is the product's
 * name, its unit and the location's name. Measured across OneInventory: twelve
 * reading screens, every one of them joining, which is what a hand-written
 * `linesOf` was doing in each of them.
 *
 * ⚠️ ONE QUERY PER REFERENCE, NEVER ONE PER ROW, AND THAT IS THE WHOLE REASON
 * THIS IS A MODULE RATHER THAN A LOOP. Fifty stock lines resolved a row at a
 * time is fifty subrequests on a warehouse phone — the fan-out this runtime has
 * a guard about (D36). The ids are collected first, deduplicated, and asked for
 * together.
 *
 * ⚠️ AND A ROW WHOSE REFERENCE IS MISSING IS STILL A ROW. It should not happen —
 * a `ref` is checked on write — but a target erased out from under one is
 * possible, and dropping the row silently changes a total nobody can then
 * explain. The joined columns come back `null`, which every formatter already
 * draws as nothing.
 *
 * ⚠️ THE SCOPE IS THE CALLER'S, APPLIED AGAIN ON THE TARGET. A reference is an
 * id, and an id is a string somebody could have written into a row; reading the
 * target without its own scope clause would make a stale or forged reference a
 * way to read one workspace's rows from another's screen.
 */

import type { CollectionSpec, Reach } from "@engine/kernel";
import { eraseBy, hopsIn } from "@engine/kernel";
import { column, table, type Db } from "./sql.js";

/**
 * ⚠️ D1 BINDS PARAMETERS ONE AT A TIME, so an `IN` list is built from the COUNT
 * of ids rather than from their values — the ids themselves are still bound. A
 * ceiling because a statement has one: a view is capped at 200 rows, so 200
 * distinct references is the worst case and this is comfortably above it.
 */
const MOST = 250;

const idsOf = (
  rows: readonly Readonly<Record<string, unknown>>[], through: string,
): readonly string[] => {
  const out = new Set<string>();
  for (const row of rows) {
    const at = row[through];
    if (typeof at === "string" && at) out.add(at);
    if (out.size >= MOST) break;
  }
  return [...out];
};

/**
 * Every path's value, written onto each row under the path itself.
 *
 * ⚠️ THE KEY IS THE PATH — `row["product.name"]`. The renderer then needs no idea
 * a join happened: it reads a key like any other, which is what keeps the
 * browser half of this at zero lines. A nested object would need the reader to
 * know which of its keys are records, in every block, for ever.
 */
export async function joinRows(
  db: Db, rows: readonly Readonly<Record<string, unknown>>[],
  reaches: readonly Reach[], collections: readonly CollectionSpec[], scope: string,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const hops = hopsIn(reaches);
  if (!rows.length || !hops.length) return rows;

  const found = await Promise.all(hops.map(async (hop) => {
    const spec = collections.find((c) => c.id === hop.to);
    const ids = idsOf(rows, hop.through);
    if (!spec || !ids.length) return { hop, held: new Map<string, Record<string, unknown>>() };

    const erase = eraseBy(spec);
    const holes = ids.map(() => "?").join(", ");
    const sql = `SELECT * FROM ${table(spec.id)} WHERE id IN (${holes})`
      + (erase ? ` AND ${column(erase.column)} = ?` : "");
    const got = await db.prepare(sql).bind(...ids, ...(erase ? [scope] : [])).all();
    const held = new Map<string, Record<string, unknown>>();
    for (const r of got.results as Record<string, unknown>[]) held.set(String(r["id"]), r);
    return { hop, held };
  }));

  const by = new Map(found.map((f) => [f.hop.through, f.held]));
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const reach of reaches) {
      if (reach.on !== "ref") continue;
      const at = row[reach.through];
      const target = typeof at === "string" ? by.get(reach.through)?.get(at) : undefined;
      out[`${reach.through}.${reach.field}`] = target?.[reach.field] ?? null;
    }
    return out;
  });
}
