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
import { AI_SCHEMA } from "@4dl/ai";
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
    // Stage 4 added `stripe_events` — webhook idempotency, which this app had
    // none of, so every Stripe retry of a credit-pack purchase granted it again.
    //
    // Stage 2 took EIGHT DDL statements and TWO ALTERs out: Better Auth's seven
    // tables and the `"user"(username)` unique index, plus the ALTERs that added
    // `"user".username` and `"member".permissions_json`. `AUTH_SCHEMA` owns the
    // tables now and `username` did not come back — see schema.ts's header for
    // why, including the ordering bug that made that index unrunnable on a fresh
    // database.
    //
    // And THREE more left when Scena adopted `@4dl/ai`'s model catalog:
    // `ai_models`, `ai_cache` and `ai_generations`. All three used to be declared
    // here with different columns from the shared ones, which is precisely why
    // they could not both exist — a `CREATE TABLE IF NOT EXISTS` is won by
    // whichever module runs first and the loser's columns silently never exist.
    const ddl = schemaStatements(SCENA_SCHEMA);
    expect(ddl.filter((s) => s.startsWith("CREATE TABLE"))).toHaveLength(32);
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
    // `ai_models` is the same kind of thing and is `@4dl/ai`'s table now —
    // asserted against ITS module below, not this one.
    for (const t of ["plans", "credit_packs", "promo_codes", "library_tracks", "app_config"]) {
      expect(SCENA_SCHEMA.scoped?.tenantTables ?? [], `${t} is platform-owned`).not.toContain(t);
    }
    expect(AI_SCHEMA.scoped?.tenantTables ?? [], "ai_models is platform-owned").not.toContain("ai_models");
  });

  it("keeps caches keyed by something other than a tenant out of it", () => {
    expect(SCENA_SCHEMA.scoped?.tenantTables ?? []).not.toContain("weather_cache");
    // `ai_cache` is keyed by prompt hash and is `@4dl/ai`'s now.
    expect(AI_SCHEMA.scoped?.tenantTables ?? []).not.toContain("ai_cache");
  });

  /*
    THE THREE AI TABLES MUST NOT COME BACK HERE, and a test is the only thing
    that can say so.

    Re-declaring one is not a conflict anything reports: the runner applies both
    modules, the second `CREATE TABLE IF NOT EXISTS` finds a table already there
    and does nothing at all — including nothing about the columns it names. What
    fails is a query, later, against a column that silently never existed. That
    is the shape of the `app_config.updated_at` regression this schema already
    carries a scar from, and re-adding a local `ai_models` would reproduce it on
    the metering path.
  */
  it("declares none of `@4dl/ai`'s tables", () => {
    const aiTables = schemaStatements(AI_SCHEMA)
      .filter((s) => s.startsWith("CREATE TABLE"))
      .map((s) => /CREATE TABLE IF NOT EXISTS "?(\w+)"?/.exec(s)?.[1] ?? "");
    expect(aiTables).toContain("ai_models");
    expect([...created].filter((t) => aiTables.includes(t))).toEqual([]);
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
    /*
      PLATFORM-WIDE tables: shared across every tenant, so deleting one tenant
      must not touch them, and they carry no tenant column to key a cascade on.

      `stripe_events` is the newest and the least obvious: it holds nothing but
      webhook event IDS and a timestamp, as the idempotency seen-set. There is
      no tenant in it to erase, and clearing a tenant's entries would make
      Stripe's next retry of an already-applied event apply it again.
    */
    const platform = new Set([
      "plans", "credit_packs", "promo_codes", "library_tracks",
      "app_config", "weather_cache", "tenants", "stripe_events",
    ]);
    // Better Auth's tables left in Stage 2 — this module does not create them
    // any more, so nothing here can be one of them.
    const missed = [...created].filter((t) => !scoped.has(t) && !platform.has(t));
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
