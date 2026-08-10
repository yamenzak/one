/**
 * CONFIG AND SCHEMA COMPOSITION.
 *
 * Both carry a scar from the previous generation, and both are designed out
 * here rather than documented. The tests below are mostly about the designing
 * out — a computed version cannot be forgotten, a declared dependency cannot be
 * silently reordered, and a duplicate table name is caught before it can pick a
 * winner.
 */

import { describe, expect, it } from "vitest";
import {
  declareConfig, PLATFORM_CONFIG, redactConfig, resolveConfig, resolveKey, writableToShared,
} from "../src/config.js";
import {
  fingerprintOf, subjectCascade, tablesIn, tenantCascade, unscopedTables, validateComposition,
  validateModule, type SchemaModule,
} from "../src/schema.js";

/* ---------------------------------------------------------------- config --- */

const registry = declareConfig({
  "shared.key": { shared: true, secret: false },
  "shared.secret": { shared: true, secret: true },
  "own.key": { shared: false, secret: false, why: "per app" },
});

describe("two config layers, and the app's own wins", () => {
  it("prefers the app's value over the platform's", () => {
    expect(resolveKey("shared.key", { "shared.key": "mine" }, { "shared.key": "theirs" }, registry)).toBe("mine");
  });

  /*
    ⚠️ NON-EMPTY WINS, NOT PRESENT WINS.

    Every consumer reads "" as unconfigured, so a blank local row must fall
    THROUGH rather than mask the shared value — otherwise an operator who opens a
    settings screen and saves it without typing anything silently switches off a
    key that was working.
  */
  it("falls through a BLANK local value rather than masking the shared one", () => {
    expect(resolveKey("shared.key", { "shared.key": "" }, { "shared.key": "theirs" }, registry)).toBe("theirs");
    expect(resolveKey("shared.key", {}, { "shared.key": "theirs" }, registry)).toBe("theirs");
  });

  it("never falls through for a key that is not shared", () => {
    // The consequence to know: you cannot switch a shared key off for one app by
    // blanking it. Give that app its own value, or do not share the key.
    expect(resolveKey("own.key", {}, { "own.key": "theirs" }, registry)).toBe("");
  });

  /*
    ⚠️ Enforced on WRITE as well as read. Checking only on read lets an unshared
    key reach the shared store, where it is invisible until a second app resolves
    it — and by then it is another product's problem with no trace of its origin.
  */
  it("refuses to write an unshared key to the shared store", () => {
    expect(writableToShared("shared.key", registry)).toBe(true);
    expect(writableToShared("own.key", registry)).toBe(false);
    expect(writableToShared("never.declared", registry)).toBe(false);
  });

  it("reports whether a secret is set, and never what it is", () => {
    const values = resolveConfig({ "shared.secret": "sk_live_dangerous", "shared.key": "visible" }, {}, registry);
    const shown = redactConfig(values, registry);
    expect(shown["shared.key"]).toBe("visible");
    expect(shown["shared.secret"]).toBe(true);
    expect(JSON.stringify(shown)).not.toContain("sk_live_dangerous");
  });

  it("makes every unshared platform key explain itself", () => {
    for (const [key, spec] of Object.entries(PLATFORM_CONFIG)) {
      if (!spec.shared) expect(spec.why.length, `${key} must say why it is not shared`).toBeGreaterThan(40);
    }
  });

  it("keeps the per-endpoint and per-product keys OUT of the shared store", () => {
    // A shared webhook secret makes every app fail verification but the one that
    // saved it last; a shared sender name renames the sender for all of them.
    for (const key of ["stripe.webhook_secret", "email.from", "platform.maintenance"]) {
      expect(writableToShared(key, PLATFORM_CONFIG), key).toBe(false);
    }
  });
});

/* ---------------------------------------------------------------- schema --- */

const tenancy: SchemaModule = {
  id: "tenancy",
  ddl: ['CREATE TABLE IF NOT EXISTS tenant_settings (tenant_id TEXT PRIMARY KEY, branding_json TEXT);'],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["tenant_settings"] },
};
const notify: SchemaModule = {
  id: "notify",
  after: ["tenancy"],
  ddl: ['CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, tenant_id TEXT);'],
  alters: ["ALTER TABLE tenant_settings ADD COLUMN notif_policy_json TEXT"],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["notifications"] },
};

describe("the version is computed, so it cannot be forgotten", () => {
  /*
    ⚠️ THE SCAR THIS DESIGNS OUT. The previous runner carried a hand-written
    version and short-circuited on a marker. Forgetting the bump made a new table
    INVISIBLE on a fresh database and fatal on every existing one — never created,
    and every route touching it answering 500. The mitigation was a paragraph
    asking people to remember.
  */
  it("changes when the DDL changes", () => {
    const before = fingerprintOf(tenancy);
    const after = fingerprintOf({ ...tenancy, ddl: [...tenancy.ddl, "CREATE TABLE IF NOT EXISTS extra (id TEXT PRIMARY KEY);"] });
    expect(after.ddl).not.toBe(before.ddl);
  });

  it("is stable when nothing changed", () => {
    expect(fingerprintOf(tenancy)).toEqual(fingerprintOf({ ...tenancy }));
  });

  it("is PER SECTION, so a backfill edit does not re-run the DDL", () => {
    const withBackfill = fingerprintOf({ ...notify, backfills: [{ id: "b1", sql: "UPDATE notifications SET tenant_id = tenant_id" }] });
    expect(withBackfill.ddl).toBe(fingerprintOf(notify).ddl);
    expect(withBackfill.backfills).not.toBe(fingerprintOf(notify).backfills);
  });

  it("distinguishes a boundary move between statements", () => {
    // ["ab","c"] and ["a","bc"] must not hash alike, or two different schemas
    // could share a marker.
    const a = fingerprintOf({ ...tenancy, ddl: ["ab", "c"] });
    const b = fingerprintOf({ ...tenancy, ddl: ["a", "bc"] });
    expect(a.ddl).not.toBe(b.ddl);
  });
});

describe("the rules that fail silently", () => {
  const rules = (m: Partial<SchemaModule>) => validateModule({ id: "x", ddl: [], ...m }).map((p) => p.rule);

  it("refuses DDL that is not re-runnable", () => {
    expect(rules({ ddl: ["CREATE TABLE thing (id TEXT);"] })).toContain("idempotent");
  });

  it("refuses a statement with no terminator, which concatenates into its neighbour", () => {
    expect(rules({ ddl: ["CREATE TABLE IF NOT EXISTS a (id TEXT)"] })).toContain("terminator");
  });

  it("refuses a line comment, which swallows the rest of the batch", () => {
    expect(rules({ ddl: ["CREATE TABLE IF NOT EXISTS a (id TEXT); -- why"] })).toContain("comment");
  });

  it("refuses an embedded newline, which splits the batch", () => {
    expect(rules({ ddl: ["CREATE TABLE IF NOT EXISTS a (\n id TEXT);"] })).toContain("newline");
  });

  it("refuses any ALTER that is not ADD COLUMN", () => {
    // Only ADD COLUMN has a failure the runner can safely tolerate on a re-run.
    expect(rules({ alters: ["ALTER TABLE a DROP COLUMN b"] })).toContain("alter");
    expect(rules({ alters: ["ALTER TABLE a ADD COLUMN b TEXT"] })).not.toContain("alter");
  });

  it("refuses an unnamed or duplicated backfill", () => {
    expect(rules({ backfills: [{ id: "", sql: "UPDATE a SET b = 1" }] })).toContain("backfill");
    expect(rules({ backfills: [{ id: "b", sql: "x" }, { id: "b", sql: "y" }] })).toContain("backfill");
  });

  it("accepts a well-formed module", () => {
    expect(validateModule(tenancy)).toEqual([]);
    expect(validateModule(notify)).toEqual([]);
  });
});

describe("the composition, and what only shows across modules", () => {
  it("accepts a correct one", () => {
    expect(validateComposition([tenancy, notify])).toEqual([]);
  });

  /*
    ⚠️ THE MOST EXPENSIVE FAILURE IN THE SET. `CREATE TABLE IF NOT EXISTS` is won
    by whichever module runs first, and the loser's columns silently never exist —
    so a query naming them fails at runtime, on one route, long after the change.
  */
  it("catches two modules creating one table", () => {
    const rival: SchemaModule = { id: "rival", ddl: ['CREATE TABLE IF NOT EXISTS tenant_settings (tenant_id TEXT PRIMARY KEY, other TEXT);'] };
    const problems = validateComposition([tenancy, rival]);
    expect(problems.map((p) => p.rule)).toContain("table");
    expect(problems.find((p) => p.rule === "table")?.detail).toMatch(/tenant_settings/);
  });

  /*
    ⚠️ A wrong order did not FAIL in the previous runner: the ALTER hit a table
    that did not exist, the runner swallowed it, and a column silently never
    appeared. Declaring the dependency makes it a validation error instead.
  */
  it("catches a module running before one it declares it needs", () => {
    expect(validateComposition([notify, tenancy]).map((p) => p.rule)).toContain("after");
  });

  it("catches a dependency that is not in the composition at all", () => {
    expect(validateComposition([notify]).map((p) => p.rule)).toContain("after");
  });

  it("catches two modules sharing an id, and therefore a marker", () => {
    expect(validateComposition([tenancy, { ...tenancy }]).map((p) => p.rule)).toContain("duplicate");
  });
});

describe("erasure is derived from the declarations", () => {
  it("collects every scoped table, once", () => {
    expect(tenantCascade([tenancy, notify])).toEqual([
      { table: "tenant_settings", column: "tenant_id", moduleId: "tenancy" },
      { table: "notifications", column: "tenant_id", moduleId: "notify" },
    ]);
  });

  it("does not emit a table twice when two modules name it", () => {
    const dupe: SchemaModule = { id: "dupe", ddl: [], scoped: { tenantColumn: "tenant_id", tenantTables: ["notifications"] } };
    expect(tenantCascade([notify, dupe]).filter((s) => s.table === "notifications")).toHaveLength(1);
  });

  /*
    ⚠️ Unscoped is NOT automatically wrong. A plan catalog, a licensed library
    and a webhook seen-set are correctly unscoped — putting one in a tenant
    cascade deletes it for everybody on the first erasure. This surfaces the list
    so the decision is made in the open rather than by omission.
  */
  it("surfaces a table nobody scoped, for a decision", () => {
    const catalogue: SchemaModule = { id: "catalogue", ddl: ['CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY);'] };
    expect(unscopedTables([tenancy, catalogue])).toEqual(["plans"]);
    expect(unscopedTables([tenancy, notify])).toEqual([]);
  });

  it("reads table names out of the DDL rather than being told them", () => {
    expect(tablesIn(notify)).toEqual(["notifications"]);
  });

  /*
    ⚠️ THE SUBJECT COLUMN TRAVELS WITH ITS TABLE, and this is the check that
    makes the alternative impossible rather than merely discouraged.

    One column per module takes whichever collection was declared last, and then
    forgetting a client runs `DELETE … WHERE coach_id = ?` against a table whose
    column is `client_id`. SQLite throws, the purge catches — it must, because an
    older database legitimately lacks a table — and the run reports a successful
    erasure over rows that are all still there. Nothing anywhere says otherwise.
  */
  it("carries a subject column per table, so two subjects cannot overwrite each other", () => {
    const mixed: SchemaModule = {
      id: "mixed", ddl: [],
      scoped: {
        tenantColumn: "tenant_id",
        tenantTables: ["notes", "shifts"],
        subjectTables: [
          { table: "notes", column: "client_id" },
          { table: "shifts", column: "coach_id" },
        ],
      },
    };
    expect(subjectCascade([mixed])).toEqual([
      { table: "notes", tenantColumn: "tenant_id", subjectColumn: "client_id", moduleId: "mixed" },
      { table: "shifts", tenantColumn: "tenant_id", subjectColumn: "coach_id", moduleId: "mixed" },
    ]);
  });

  /* ⚠️ BOTH COLUMNS, ALWAYS. By subject alone reaches across workspaces the
     moment two of them mint the same id — and ids are the app's. */
  it("binds the tenant column on every subject step", () => {
    const m: SchemaModule = {
      id: "m", ddl: [],
      scoped: { tenantColumn: "workspace", subjectTables: [{ table: "notes", column: "client_id" }] },
    };
    expect(subjectCascade([m])).toEqual([
      { table: "notes", tenantColumn: "workspace", subjectColumn: "client_id", moduleId: "m" },
    ]);
  });

  /* A module that scopes nothing to a person contributes nothing to this walk. */
  it("skips a module with no subject tables at all", () => {
    expect(subjectCascade([tenancy, notify])).toEqual([]);
  });
});
