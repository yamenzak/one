import { describe, expect, it } from "vitest";
import { schemaStatements } from "@4dl/core";
import { formatGaps, impossibleSteps, subjectCascade, tenantCascade, undeclaredScopes } from "@4dl/purge";
import { APP_SCHEMA, SCHEMA_MODULES } from "../src/db.js";

/**
 * THE GUARDRAILS A NEW APP INHERITS ON DAY ONE. Keep them.
 *
 * Every check here catches something that fails SILENTLY at runtime. That is the
 * whole selection criterion: a loud failure needs no test, and these are the ones
 * that have actually shipped — a DDL batch that half-applies, a migration that
 * marks itself done while a column every write needs is missing, an erasure that
 * reports success and leaves the rows behind.
 *
 * They need no database, no fixtures and no Workers pool: they read declarations.
 * So they stay fast enough to run on every commit, from the first commit.
 */

describe("the app's schema module", () => {
  it("declares only idempotent DDL", () => {
    // The module re-applies from scratch on any version bump, so a statement that
    // is not `IF NOT EXISTS` throws on the second run and aborts the batch.
    for (const sql of schemaStatements(APP_SCHEMA)) {
      expect(sql, sql.slice(0, 70)).toMatch(/^(CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS|DROP INDEX IF EXISTS)/);
    }
  });

  it("batches safely into one exec", () => {
    // The runner joins DDL with a SPACE. A `--` comment swallows every statement
    // after it in the batch; an embedded newline splits one statement in half;
    // a missing `;` fuses two statements into a syntax error that takes the
    // whole batch down. None of the three raises anything you would notice —
    // the tables simply never appear.
    for (const sql of schemaStatements(APP_SCHEMA)) {
      expect(sql, sql.slice(0, 70)).not.toMatch(/--/);
      expect(sql, sql.slice(0, 70)).not.toMatch(/\n/);
      expect(sql, sql.slice(0, 70)).toMatch(/;$/);
    }
  });

  it("uses ALTER only for tolerated column adds", () => {
    // The runner swallows exactly one error — "duplicate column" — because that
    // is what a re-applied ADD COLUMN raises. Any other ALTER shape (RENAME,
    // DROP) fails differently and aborts the module every single run.
    for (const sql of APP_SCHEMA.alters ?? []) {
      expect(sql, sql.slice(0, 70)).toMatch(/^ALTER TABLE \w+ ADD COLUMN /);
    }
  });

  it("names every backfill", () => {
    // Backfills are best-effort and surface only in a log line, so an unnamed
    // one is unattributable when it fails.
    for (const b of APP_SCHEMA.backfills ?? []) expect(b.name).toBeTruthy();
  });
});

describe("the composed schema", () => {
  it("gives every table exactly one owner", () => {
    // Two modules creating the same table each apply it under their own marker:
    // harmless while both agree (`IF NOT EXISTS`) and silently divergent the
    // moment one is edited.
    const tableOf = (s: string) => /CREATE TABLE IF NOT EXISTS "?(\w+)"?/.exec(s)?.[1];
    const owned = new Map<string, string>();
    for (const m of SCHEMA_MODULES) {
      for (const sql of schemaStatements(m)) {
        const t = tableOf(sql);
        if (!t) continue;
        expect(owned.get(t), `${t} is claimed by both ${owned.get(t)} and ${m.id}`).toBeUndefined();
        owned.set(t, m.id);
      }
    }
    expect(owned.get("user")).toBe("auth");
    expect(owned.get("tenant_settings")).toBe("tenancy");
    expect(owned.get("records")).toBe("app");
  });

  it("applies tenancy before the modules that extend its table", () => {
    // `tenant_settings` is tenancy's, and email/notify each ADD COLUMN to it. An
    // ADD COLUMN ahead of its CREATE TABLE raises "no such table", which the
    // runner does NOT tolerate — it swallows only "duplicate column".
    const idx = (id: string) => SCHEMA_MODULES.findIndex((m) => m.id === id);
    expect(idx("tenancy")).toBeLessThan(idx("email"));
    expect(idx("tenancy")).toBeLessThan(idx("notify"));
    expect(idx("app")).toBe(SCHEMA_MODULES.length - 1); // the app is always last
  });
});

/**
 * Tables carrying a scope column that no cascade clears, each with the reason.
 *
 * A ratchet: an entry is a decision somebody wrote down. Anything not here and
 * not declared fails the first test below. The list should stay empty until it
 * genuinely cannot.
 */
const EXEMPT: readonly string[] = [];

describe("the erasure cascade", () => {
  it("declares a scope for every table that carries one", () => {
    // The check that makes a forgotten table impossible to ship quietly. In Kova
    // this found `offboard_requests` — added to the schema, added to none of the
    // three hand-written inventories it had at the time, and therefore surviving
    // a subject purge, a tenant purge AND the platform reset.
    const gaps = undeclaredScopes(SCHEMA_MODULES, { exempt: EXEMPT });
    expect(gaps, `\n${formatGaps(gaps)}`).toHaveLength(0);
  });

  it("never names a column the table does not have", () => {
    // The check that catches a RENAME. The resulting DELETE raises "no such
    // column", which a purge swallows along with every other error it must
    // tolerate, so the erasure silently keeps the row and reports success.
    const bad = impossibleSteps(SCHEMA_MODULES);
    expect(bad, `\n${formatGaps(bad)}`).toHaveLength(0);
  });

  it("keeps the exemption list honest", () => {
    // An exemption for a table that no longer carries the column is a stale note
    // that makes the list read as bigger than the decision it records. It can
    // only shrink.
    const all = undeclaredScopes(SCHEMA_MODULES, { exempt: [] }).map((g) => `${g.table}.${g.column}`);
    expect(EXEMPT.filter((e) => !all.includes(e))).toEqual([]);
  });

  it("sweeps the app's own tables, under both scopes", () => {
    expect(tenantCascade(SCHEMA_MODULES).find((s) => s.table === "records")).toMatchObject({ column: "tenant_id" });
    expect(subjectCascade(SCHEMA_MODULES).find((s) => s.table === "records")).toMatchObject({ column: "subject_id" });
  });

  it("carries each module's OWN column, not one assumed for all", () => {
    // Auth keys its rows `organizationId`; everyone else `tenant_id`. A loop that
    // interpolates the table and hard-codes the column is the bug this replaces.
    const steps = tenantCascade(SCHEMA_MODULES);
    expect(steps.find((s) => s.table === "member")).toMatchObject({ column: "organizationId" });
    expect(steps.find((s) => s.table === "subscriptions")).toMatchObject({ column: "tenant_id" });
  });
});
