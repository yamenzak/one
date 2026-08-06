/**
 * SCENA'S SCHEMA MODULE, against the rules that fail SILENTLY.
 *
 * Every assertion here guards a mistake that produces no error, no failed test
 * and no log line — it produces a database missing a table, or a column that
 * was never added, discovered later by a 500 on one route.
 *
 * The sibling of `apps/api/test/schema-module.test.ts`, and it exists for the
 * same reason: the runner's contract is unenforceable at the type level.
 */

import { describe, expect, it } from "vitest";
import { schemaStatements } from "@4dl/core";
import { SCENA_SCHEMA } from "../src/schema.js";
import { SCHEMA_MODULES } from "../src/db.js";

describe("the Scena schema module", () => {
  it("declares only idempotent DDL", () => {
    for (const s of schemaStatements(SCENA_SCHEMA)) {
      expect(s, `not idempotent: ${s}`).toMatch(/^(CREATE (TABLE|INDEX|UNIQUE INDEX)) IF NOT EXISTS|^DROP INDEX IF EXISTS/);
    }
  });

  it("batches safely into one exec", () => {
    // The runner joins `ddl` with a SPACE. A statement with no terminator
    // concatenates into its neighbour; a `--` comment swallows the rest of the
    // batch; a newline splits it. Ten of Scena's `CREATE INDEX` lines arrived
    // with no `;` because they used to be applied one at a time.
    for (const s of schemaStatements(SCENA_SCHEMA)) {
      expect(s.endsWith(";"), `missing terminator: ${s}`).toBe(true);
      expect(s.includes("--"), `line comment would swallow the batch: ${s}`).toBe(false);
      expect(s.includes("\n"), `embedded newline: ${s}`).toBe(false);
    }
  });

  it("uses ALTER only for tolerated column adds", () => {
    // The runner tolerates exactly "duplicate column" and raises on anything
    // else. An ALTER that is not an ADD COLUMN would therefore fail loudly on
    // the second run — which is right, and is why none may be declared.
    for (const s of SCENA_SCHEMA.alters ?? []) {
      expect(s, `not an ADD COLUMN: ${s}`).toMatch(/^ALTER TABLE .+ ADD COLUMN /);
    }
  });

  it("names every backfill", () => {
    // A backfill only ever surfaces in a log line, so an unnamed one is
    // unattributable when it fails.
    for (const b of SCENA_SCHEMA.backfills ?? []) expect(b.name).toBeTruthy();
  });

  it("still covers the whole database", () => {
    // Pinned counts. They go DOWN as tables move into @4dl/* packages, and each
    // move updates them in the same commit — so a table lost on the way out is
    // a failure here rather than a 500 in production. They go UP when a column
    // or table is added.
    //
    // Stage 2 took EIGHT DDL statements and TWO ALTERs out: Better Auth's seven
    // tables and the `"user"(username)` unique index, plus the ALTERs that added
    // `"user".username` and `"member".permissions_json`. `AUTH_SCHEMA` owns the
    // tables now and `username` did not come back — see schema.ts's header for
    // why, including the ordering bug that made that index unrunnable on a fresh
    // database.
    const ddl = schemaStatements(SCENA_SCHEMA);
    expect(ddl.filter((s) => s.startsWith("CREATE TABLE"))).toHaveLength(34);
    expect(ddl.filter((s) => s.startsWith("CREATE INDEX"))).toHaveLength(10);
    expect(ddl.filter((s) => s.startsWith("CREATE UNIQUE INDEX"))).toHaveLength(0);
    expect(SCENA_SCHEMA.alters ?? []).toHaveLength(52);
    expect(SCENA_SCHEMA.backfills ?? []).toHaveLength(7);
  });
});

describe("erasure is derivable from the declaration", () => {
  /** Table names as the DDL creates them, quoted or not. */
  const created = new Set(
    schemaStatements(SCENA_SCHEMA)
      .filter((s) => s.startsWith("CREATE TABLE"))
      .map((s) => /CREATE TABLE IF NOT EXISTS "?(\w+)"?/.exec(s)?.[1] ?? "")
      .filter(Boolean),
  );

  it("every tenant-scoped table exists and carries the column", () => {
    // A name in `tenantTables` that does not exist is a purge step that deletes
    // nothing, forever, reporting success. `@4dl/purge` has the same check; this
    // one runs without the package so it holds from Stage 1.
    const cols = new Map(
      schemaStatements(SCENA_SCHEMA)
        .filter((s) => s.startsWith("CREATE TABLE"))
        .map((s) => [/CREATE TABLE IF NOT EXISTS "?(\w+)"?/.exec(s)?.[1] ?? "", s]),
    );
    const added = new Set(
      (SCENA_SCHEMA.alters ?? [])
        .map((a) => /ALTER TABLE "?(\w+)"? ADD COLUMN (\w+)/.exec(a))
        .filter((m): m is RegExpExecArray => !!m && m[2] === "tenant_id")
        .map((m) => m[1]!),
    );
    for (const t of SCENA_SCHEMA.scoped?.tenantTables ?? []) {
      expect(created.has(t), `tenantTables names "${t}", which no CREATE TABLE makes`).toBe(true);
      const hasColumn = (cols.get(t) ?? "").includes("tenant_id") || added.has(t);
      expect(hasColumn, `"${t}" is tenant-scoped but has no tenant_id column`).toBe(true);
    }
  });

  it("keeps the PLATFORM catalog out of the tenant cascade", () => {
    // Shared across every tenant. Deleting one tenant must not touch them, and
    // the failure here would be catastrophic and silent: the first erasure
    // takes the plan catalog with it.
    for (const t of ["plans", "credit_packs", "promo_codes", "ai_models", "library_tracks", "app_config"]) {
      expect(SCENA_SCHEMA.scoped?.tenantTables ?? [], `${t} is platform-owned`).not.toContain(t);
    }
  });

  it("keeps caches keyed by something other than a tenant out of it", () => {
    for (const t of ["ai_cache", "weather_cache"]) {
      expect(SCENA_SCHEMA.scoped?.tenantTables ?? []).not.toContain(t);
    }
  });

  it("does not try to cascade the tenant row itself", () => {
    // `tenants` IS the tenant. The caller deletes it last, after the cascade —
    // putting it in the cascade makes the order undefined.
    expect(SCENA_SCHEMA.scoped?.tenantTables ?? []).not.toContain("tenants");
  });

  it("leaves NO tenant-bearing table unscoped", () => {
    // The check that would have caught the original defect: five tables held a
    // tenant's rows and had no way to say whose, so a derived erasure stepped
    // straight over them.
    const scoped = new Set(SCENA_SCHEMA.scoped?.tenantTables ?? []);
    const platform = new Set(["plans", "credit_packs", "promo_codes", "ai_models", "library_tracks", "app_config", "ai_cache", "weather_cache", "tenants"]);
    const authOwned = new Set(["user", "session", "account", "verification", "organization", "member", "invitation"]);
    const missed = [...created].filter((t) => !scoped.has(t) && !platform.has(t) && !authOwned.has(t));
    expect(missed, `these hold tenant data but are not in tenantTables:\n  ${missed.join("\n  ")}`).toEqual([]);
  });
});

describe("the module list", () => {
  it("is what the app actually applies", () => {
    expect(SCHEMA_MODULES).toContain(SCENA_SCHEMA);
  });

  it("claims no table twice", () => {
    const seen = new Map<string, string>();
    for (const m of SCHEMA_MODULES) {
      for (const s of schemaStatements(m).filter((x) => x.startsWith("CREATE TABLE"))) {
        const t = /CREATE TABLE IF NOT EXISTS "?(\w+)"?/.exec(s)?.[1];
        if (!t) continue;
        expect(seen.has(t), `"${t}" is created by both ${seen.get(t)} and ${m.id}`).toBe(false);
        seen.set(t, m.id);
      }
    }
  });
});
