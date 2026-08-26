/**
 * HOW MANY OF EACH THING THERE ARE — one operation, every collection.
 *
 * ⚠️ A HOME SCREEN LEADS WITH NUMBERS AND HAD NOWHERE TO ASK FOR THEM (D57).
 * What it did instead was list each collection with `limit: 1` and read the
 * total off the answer, once per number — three requests for three integers,
 * each carrying the platform's whole preamble (identity, workspace, membership,
 * standing) to run a `SELECT COUNT(*)`. That is not a screen written badly; it
 * was the only thing the surface offered.
 *
 * ⚠️ AND IT IS DERIVED, WHICH IS WHY IT CANNOT DRIFT FROM WHAT IT COUNTS. The
 * collections are the app's own declarations and the filters are `list`'s own
 * (`countAll`), so a hero saying four hundred and the screen behind it showing
 * twelve is not a thing that can happen — there is one definition of which rows
 * are this caller's.
 *
 * ⚠️ ITS PERMISSION IS `PUBLIC` BECAUSE NO FIXED KEY COULD BE RIGHT. The answer
 * is different per caller: somebody who may read products and not stock must get
 * the products count rather than a refusal, and a single declared key would
 * either refuse them everything or tell them something they may not know. So the
 * gate admits any member and the KEYS decide the contents, per collection, below.
 */

import type { AppSpec, CollectionSpec } from "@engine/kernel";
import { PUBLIC, permissionFor } from "@engine/kernel";
import type { Resolved } from "./compose.js";
import type { PlatformCtx } from "./member-ops.js";
import { countAll } from "./records.js";
import { reachingBy } from "./reach.js";

/**
 * ⚠️ THE NAME HAD TO SURVIVE THE PRODUCTS, AND TWO OBVIOUS ONES DID NOT. `read`
 * is a CRUD verb, so this id is only free while no collection is called the
 * noun in front of it — and OneInventory owns BOTH `count` (a stocktake) and
 * `tally` (what one found), each already generating a `read` of its own. The
 * platform's would have replaced a product's at the same address, so `put`
 * refuses it rather than resolving it, which is how both were found.
 */
export const TOTALS = "totals.read";

export function totalsOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  /* ⚠️ NOTHING TO COUNT IS NO OPERATION. An app with no collections would answer
     `{}` for ever, which reads on a screen as a workspace holding nothing rather
     than as a question that does not apply here. */
  if (!app.collections.length) return {};

  const spec = {
    id: TOTALS, kind: "read" as const,
    summary: "How many of each thing there are.",
    input: {}, output: {},
    permission: PUBLIC,
    idempotency: { mode: "none" as const },
    async handler() { return {} as never; },
  };

  return {
    [TOTALS]: {
      id: TOTALS,
      kind: "read",
      method: "GET",
      path: `/api/${TOTALS}`,
      permission: PUBLIC,
      spec: spec as unknown as Resolved["spec"],
      run: async (bare) => {
        const ctx = bare as PlatformCtx;
        /* ⚠️ THE COLLECTION'S OWN READ KEY, ASKED THE WAY THE GATE ASKS IT. A
           second spelling of "may they read this" is how a count comes to
           include rows the list refuses. */
        const mine = app.collections.filter(
          (c: CollectionSpec) => ctx.permissions.has(permissionFor(c, "read")),
        );
        const counts = await countAll(
          ctx.db, mine,
          /* ⚠️ WHOSE ROWS THESE ARE, PER COLLECTION — the workspace's, or the
             person's. See `countAll`. */
          (c) => (c.scope.of === "subject" ? (ctx.accountId ?? "") : ctx.tenantId),
          (c) => reachingBy(c.reachBy, ctx.reach),
        );
        /*
          ⚠️ AND THE SAME NUMBERS AS A LIST OF ONE, WHICH IS WHAT A DECLARED
          SCREEN CAN BIND. An asked view takes a field holding ROWS (`AskedSpec`)
          — a record of counts is not one, so a home screen drawn from a
          declaration could not read this at all and went back to asking three
          lists for one row each, which is the thing this operation exists to
          replace. One row whose columns are the collection ids costs nothing and
          closes that.
        */
        return { counts, all: [counts] };
      },
    },
  };
}
