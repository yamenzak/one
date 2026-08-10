/**
 * EVERY TABLE THE PLATFORM CREATES IS IN A SCOPE, OR IS EXEMPT IN WRITING.
 *
 * ⚠️ A FORGOTTEN TABLE IS NOT AN ERROR ANYWHERE, and that is the entire reason
 * this file exists. Erasure is DERIVED from what each module declares, so a
 * table nobody placed in a scope is simply never deleted — the sweep runs, every
 * statement it was given succeeds, and it reports that a workspace was erased
 * while its rows are still sitting there.
 *
 * It found five on the day it was written. `customer_purchase`, `customer_lapse`,
 * `access_code` and `discount_code` were all created by the commerce module and
 * named in no scope; so was `tenant_payments`, which holds the secret a
 * workspace's own payment provider signs with. A shipping product made the same
 * mistake at a larger scale — seven tables declared against twenty-five — and
 * the sweep emailed the owner to say their data was gone.
 *
 * ⚠️ THE EXEMPTIONS ARE A LIST WITH A REASON EACH, not a threshold. "Unscoped"
 * is sometimes right — a shared catalogue deleted on the first erasure would be
 * deleted for everybody — so the question is never "how many" but "which, and
 * why", answered once, in the open.
 */

import { describe, expect, it } from "vitest";
import { unscopedTables } from "@one/kernel";
import { PLATFORM_REGIONAL, PLATFORM_GLOBAL } from "../src/modules.js";

/**
 * ⚠️ ONE ENTRY, AND IT IS NOT A TENANT'S TABLE AT ALL. A session belongs to an
 * ACCOUNT and carries no tenant column — one person's sign-in survives the
 * closing of one of the workspaces they belonged to, which is the correct
 * behaviour and the reason it cannot be in a tenant cascade.
 */
const EXEMPT_REGIONAL: Readonly<Record<string, string>> = {
  sessions: "belongs to an account, not a workspace — it has no tenant column to cascade on",
  /*
    ⚠️ A COUNTER, NOT A RECORD. Its key is a composite of operation, window and
    whoever was asking — which may be an address rather than anybody — so there
    is no tenant column to cascade on, and the rows stop being matched the moment
    their window rolls over whether anything deletes them or not.
  */
  request_counts: "a fixed-window counter keyed by a composite, with no tenant column and no lifetime past its window",
};

describe("the platform's own regional tables", () => {
  it("are all in a tenant scope, or exempt with a reason", () => {
    const unscoped = unscopedTables(PLATFORM_REGIONAL);
    expect(unscoped.filter((t) => !(t in EXEMPT_REGIONAL))).toEqual([]);
  });

  /*
    ⚠️ AND THE EXEMPTION LIST MAY ONLY SHRINK. An entry for a table that has
    since been scoped is a stale excuse, and a list nobody prunes is one nobody
    reads — which is how an exemption written for one good reason comes to cover
    an oversight added underneath it.
  */
  it("has no exemption for a table that is now scoped, or gone", () => {
    const unscoped = new Set(unscopedTables(PLATFORM_REGIONAL));
    for (const table of Object.keys(EXEMPT_REGIONAL)) {
      expect(unscoped.has(table), `${table} is exempt and does not need to be`).toBe(true);
    }
  });
});

/*
  ⚠️ THE GLOBAL STORE IS THE OPPOSITE CASE and is asserted so nobody assumes the
  rule above applies to it. It holds the directory, identities and the
  deployment's own configuration — things that OUTLIVE a workspace by design, and
  a tenant cascade over them would erase the account of somebody who happens to
  have closed one of their workspaces.
*/
describe("the platform's own global tables", () => {
  it("are outside a tenant's cascade on purpose", () => {
    expect(unscopedTables(PLATFORM_GLOBAL).length).toBeGreaterThan(0);
  });
});
