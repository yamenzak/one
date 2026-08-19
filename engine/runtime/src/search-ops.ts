/**
 * THE OPERATION A `searchable` COLLECTION GETS, AND NOBODY WRITES IT.
 *
 * ⚠️ IT IS DERIVED LIKE THE FIVE VERBS BESIDE IT, for the reason the whole
 * composer exists: a retrieval endpoint written per app is a retrieval endpoint
 * whose scope filter is written per app, and one of them will be written wrong.
 * Here the folder filter is the platform's, the permission is the collection's
 * own read key, and the gate, the audit and the tool catalogue see an ordinary
 * operation.
 *
 * ⚠️ AND IT ANSWERS WITH RECORDS, NOT WITH PASSAGES. The index holds a copy that
 * can be a job pass behind — so what it is asked is WHICH records match, and the
 * rows come back out of the database. Answering from the index would serve text
 * that was edited an hour ago, with no way for a reader to tell.
 */

import type { AppSpec, CollectionSpec } from "@engine/kernel";
import { isSearchable, searchPermissionFor } from "@engine/kernel";
import type { Resolved, Ctx } from "./compose.js";
import type { PlatformCtx } from "./member-ops.js";
import { readOne } from "./records.js";
import { MAX_RESULTS } from "./search.js";

/**
 * ⚠️ THE SAME SCOPE RULE THE GENERATED VERBS USE. A subject-scoped collection is
 * the caller's own records — and the index was written under that same scope, so
 * asking for anything else would find nothing rather than find too much.
 */
const scopeOf = (spec: CollectionSpec, ctx: Ctx): string =>
  spec.scope.of === "subject" ? (ctx.accountId ?? "") : ctx.tenantId;

export function searchOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  const out: Record<string, Resolved> = {};

  for (const spec of app.collections) {
    if (!isSearchable(spec)) continue;
    const id = `${spec.id}.search`;
    const permission = searchPermissionFor(spec);

    const resolved: Resolved = {
      id,
      kind: "read",
      method: "GET",
      path: `/api/${id}`,
      permission,
      spec: {
        id, kind: "read",
        summary: `Find a ${spec.label.one.toLowerCase()} by what it says.`,
        input: {}, output: {},
        permission,
        idempotency: { mode: "none" },
        async handler() { return {} as never; },
      } as Resolved["spec"],
      run: async (bare, input) => {
        const ctx = bare as PlatformCtx;
        const query = String(input.q ?? "").trim();
        /*
          ⚠️ NO INDEX IS AN ANSWER, NOT A FAILURE. A deployment that has not bound
          one still serves every other operation this collection has, and a
          screen that can say "search is not on here" is better than a 500 that
          says nothing.
        */
        if (!ctx.find) return { items: [], searched: false, why: "unavailable" };
        if (!query) return { items: [], searched: true };

        const limit = Math.min(Math.max(Number(input.limit ?? MAX_RESULTS) || MAX_RESULTS, 1),
          MAX_RESULTS);
        const scope = scopeOf(spec, ctx);
        const found = await ctx.find(spec, scope, query, limit);
        if (found === "no_index") return { items: [], searched: false, why: "unavailable" };
        if (found === "failed") return { items: [], searched: false, why: "failed" };

        /*
          ⚠️ READ BACK IN THE CALLER'S OWN SCOPE, WHICH IS THE SECOND BOUND. The
          folder filter is the first; this is what makes a result that somehow
          escaped it disappear anyway, because the row simply does not answer to
          this scope. Two bounds rather than one, because the outer one lives in
          a service we do not run.
        */
        const items: Record<string, unknown>[] = [];
        for (const hit of found) {
          const row = await readOne(ctx.db, spec, scope, hit.recordId);
          /* ⚠️ A MISS IS SILENT AND ORDINARY. The index is a pass behind, so a
             record deleted since the last flush is expected here — reporting it
             would be reporting our own schedule as an error. */
          if (row) items.push({ ...row, score: hit.score });
        }
        return { items, searched: true };
      },
    };
    out[id] = resolved;
  }

  return out;
}
