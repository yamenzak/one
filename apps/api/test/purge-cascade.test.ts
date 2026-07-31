import { describe, expect, it } from "vitest";
import { formatGaps, impossibleSteps, subjectCascade, tenantCascade, undeclaredScopes } from "@4dl/purge";
import { SCHEMA_MODULES } from "../src/db.js";

/**
 * The erasure cascade, checked against the DDL that creates the tables.
 *
 * Every failure this file catches is one that used to be INVISIBLE at runtime:
 * `purge.ts` swallows every error from a delete (it has to — an old database may
 * legitimately be missing a table), so a wrong column name and a forgotten table
 * both read as a clean purge.
 */

/**
 * Tables carrying a scope column that no cascade clears, each with the reason.
 *
 * A ratchet, like the boundary checker's ALLOW list: an entry here is a decision
 * somebody wrote down. Anything NOT here and not declared fails the first test.
 */
const EXEMPT: readonly string[] = [
  // EMPTY, and that is the finding. The platform's own rows — `plans`,
  // `credit_packs`, `ai_models`, `ai_cache`, `stripe_events`, `auth_logs`,
  // `organization` — need no exemption because none of them carries a scope
  // column at all: they are keyed on their own id, so there was never a cascade
  // to opt out of. The first draft of this list named all seven anyway, and the
  // ratchet below refused them, which is precisely what a ratchet is for.
];

const gapKey = (g: { table: string; column: string }) => `${g.table}.${g.column}`;

describe("the erasure cascade is derived, not maintained", () => {
  it("declares a scope for every table that carries one", () => {
    // The check that makes a forgotten table impossible to ship. `offboard_requests`
    // was added to the schema and to none of the three hand-written inventories,
    // so it survived a client purge, a tenant purge AND the nuclear reset. This
    // test is what that mistake now looks like.
    const gaps = undeclaredScopes(SCHEMA_MODULES, { exempt: EXEMPT });
    expect(gaps, `\n${formatGaps(gaps)}`).toHaveLength(0);
  });

  it("never names a column the table does not have", () => {
    // The check that catches a RENAME. `ai_generations` and `media_assets` were
    // still being deleted `WHERE client_id = ?` long after both had moved to
    // `subject_id` — "no such column", swallowed, and a purged client's AI
    // history and media ledger rows stayed behind with nothing reported.
    const bad = impossibleSteps(SCHEMA_MODULES);
    expect(bad, `\n${formatGaps(bad)}`).toHaveLength(0);
  });

  it("keeps the exemption list honest", () => {
    // An exemption for a table that no longer carries the column is a stale note
    // that makes the list read as bigger than the decision it records. Same
    // ratchet the boundary ALLOW lists use: it can only shrink.
    const all = undeclaredScopes(SCHEMA_MODULES, { exempt: [] }).map(gapKey);
    expect(EXEMPT.filter((e) => !all.includes(e))).toEqual([]);
  });
});

describe("what the two cascades actually clear", () => {
  it("sweeps a tenant's rows across every package, by each package's own column", () => {
    const steps = tenantCascade(SCHEMA_MODULES);
    const by = (t: string) => steps.find((s) => s.table === t);
    // Auth keys its rows `organizationId`, everyone else `tenant_id`. The old
    // loop hard-coded one column for the whole list, which is why `member` and
    // `invitation` had to be deleted by two hand-written lines after it.
    expect(by("member")).toMatchObject({ column: "organizationId", module: "auth" });
    expect(by("invitation")).toMatchObject({ column: "organizationId", module: "auth" });
    expect(by("subscriptions")).toMatchObject({ column: "tenant_id", module: "billing" });
    expect(by("subject_subscriptions")).toMatchObject({ column: "tenant_id", module: "commerce" });
    expect(by("media_assets")).toMatchObject({ column: "tenant_id", module: "storage" });
    expect(by("notifications")).toMatchObject({ column: "tenant_id", module: "notify" });
    expect(by("clients")).toMatchObject({ column: "tenant_id", module: "kova" });
    // Regression: the table that was in none of the three old lists.
    expect(by("offboard_requests")).toMatchObject({ column: "tenant_id", module: "kova" });
  });

  it("sweeps one client's rows under BOTH names an individual goes by", () => {
    const steps = subjectCascade(SCHEMA_MODULES);
    const by = (t: string) => steps.find((s) => s.table === t);
    // Kova's own tables still say `client_id`; the shared packages renamed theirs
    // to `subject_id` when commerce stopped knowing what a client was. A single
    // cascade covers both because each step carries its own column.
    expect(by("check_ins")).toMatchObject({ column: "client_id", module: "kova" });
    expect(by("offboard_requests")).toMatchObject({ column: "client_id", module: "kova" });
    expect(by("subject_subscriptions")).toMatchObject({ column: "subject_id", module: "commerce" });
    expect(by("redemption_uses")).toMatchObject({ column: "subject_id", module: "commerce" });
    // Both regressions from the rename: deleted `WHERE client_id` for months.
    expect(by("ai_generations")).toMatchObject({ column: "subject_id", module: "ai" });
    expect(by("media_assets")).toMatchObject({ column: "subject_id", module: "storage" });
  });

  it("leaves the studio's own assets alone", () => {
    // Tables that reference a client by a DIFFERENT column are tenant-owned
    // property: an offer restricted to a deleted client is unreachable, which
    // reads as "no longer applies" rather than leaking anything. Deleting the
    // row would destroy the studio's asset instead.
    const tables = subjectCascade(SCHEMA_MODULES).map((s) => s.table);
    for (const asset of ["packages", "promo_codes", "redemption_codes", "resources", "notifications"]) {
      expect(tables, asset).not.toContain(asset);
    }
  });
});
