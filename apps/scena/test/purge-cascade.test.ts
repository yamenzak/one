import { describe, expect, it } from "vitest";
import { formatGaps, impossibleSteps, tenantCascade, undeclaredScopes } from "@4dl/purge";
import { SCHEMA_MODULES } from "../src/db.js";

/**
 * THE ERASURE CASCADE, CHECKED AGAINST THE DDL THAT CREATES THE TABLES.
 *
 * Every failure here is one that is INVISIBLE at runtime. A purge swallows every
 * delete error — it has to, since an old database may legitimately be missing a
 * table — so a forgotten table and a wrong column both read as a clean erasure.
 *
 * Scena had the first kind, at scale. `deleteTenantData` named SEVEN tables by
 * hand (`screens`, `channels`, `boards`, `feeds`, `alert_rules`, `alerts`,
 * `playout_events`) plus three parent-keyed joins, while `SCENA_SCHEMA.scoped`
 * declared twenty-five. So a workspace deleted at the end of the dunning ladder
 * kept its media library, its playlists, its widget profiles, its ad rotations,
 * its tracks, its manifest history, its weather sources, its board users, its
 * device→channel assignments, its schedule rules, its promo redemptions and its
 * AI generation history — indefinitely, with the sweep reporting success and an
 * email telling the owner their content had been deleted.
 */

/**
 * Tables carrying a scope column that no cascade clears, each with the reason.
 *
 * A ratchet, like the boundary checker's ALLOW list: an entry is a decision
 * somebody wrote down, and the last test below makes it impossible for the list
 * to grow past the columns that actually exist.
 */
const EXEMPT: readonly string[] = [
  // EMPTY. Scena's platform-wide rows — `plans`, `credit_packs`, `promo_codes`,
  // `library_tracks`, `weather_cache`, `stripe_events` (and `@4dl/ai`'s `ai_models`
  // + `ai_cache`),
  // `rail_parked_events` — need no exemption, because none of them carries a
  // scope column at all. They are keyed on their own id, so there was never a
  // cascade to opt out of.
];

const gapKey = (g: { table: string; column: string }) => `${g.table}.${g.column}`;

describe("the erasure cascade is derived, not maintained", () => {
  it("declares a scope for every table that carries one", () => {
    const gaps = undeclaredScopes(SCHEMA_MODULES, { exempt: EXEMPT });
    expect(gaps, `\n${formatGaps(gaps)}`).toHaveLength(0);
  });

  it("never names a column the table does not have", () => {
    const bad = impossibleSteps(SCHEMA_MODULES);
    expect(bad, `\n${formatGaps(bad)}`).toHaveLength(0);
  });

  it("keeps the exemption list honest", () => {
    // An exemption for a table that no longer carries the column is a stale note
    // that makes the list read as bigger than the decision it records.
    const all = undeclaredScopes(SCHEMA_MODULES, { exempt: [] }).map(gapKey);
    expect(EXEMPT.filter((e) => !all.includes(e))).toEqual([]);
  });

  it("sweeps every module, not just Scena's own", () => {
    // The regression this catches: a package joins SCHEMA_MODULES for its
    // TABLES and nobody re-derives the cascade, so its rows outlive the
    // workspace. `media_assets` (@4dl/storage, Stage 5) is the live example —
    // it arrived with a `scoped` declaration and would have been swept by
    // nothing at all under the hand-written list.
    const modules = new Set(tenantCascade(SCHEMA_MODULES).map((s) => s.module));
    for (const m of ["auth", "tenancy", "storage", "scena"]) {
      expect(modules.has(m), `no tenant cascade step from the "${m}" module`).toBe(true);
    }
  });
});
