import { describe, expect, it } from "vitest";
import { schemaStatements } from "@4dl/core";
import { AUTH_SCHEMA } from "@4dl/auth";
import { BILLING_SCHEMA } from "@4dl/billing";
import { COMMERCE_SCHEMA } from "@4dl/commerce";
import { TENANCY_SCHEMA } from "@4dl/tenancy";
import { KOVA_SCHEMA } from "../src/db.js";

/**
 * Invariants the composed runner relies on. Every one of these is something that
 * fails SILENTLY at runtime if it is wrong — the DDL batch half-applies, or a
 * migration marks itself done while a column every write needs is missing — so
 * they are asserted here rather than discovered in production.
 */
describe("the Kova schema module", () => {
  it("declares only idempotent DDL", () => {
    // The module re-applies from scratch on any version bump, so a statement that
    // is not `IF NOT EXISTS` would throw on the second run and abort the batch.
    // `DROP INDEX IF EXISTS` is allowed alongside the creates: retiring an index
    // is idempotent too, and it has to run in the same ordered batch as the
    // statement that replaces it.
    for (const sql of schemaStatements(KOVA_SCHEMA)) {
      expect(sql, sql.slice(0, 70)).toMatch(/^(CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS|DROP INDEX IF EXISTS)/);
    }
  });

  it("batches safely into one exec", () => {
    // The runner joins DDL with a space. A `--` comment would swallow every
    // statement after it in the batch; an embedded newline would split one
    // statement in half. Neither failure raises an error — the tables simply
    // never appear.
    for (const sql of schemaStatements(KOVA_SCHEMA)) {
      expect(sql, sql.slice(0, 70)).not.toMatch(/--/);
      expect(sql, sql.slice(0, 70)).not.toMatch(/\n/);
      // …and every statement TERMINATES. A statement in the `alters` array is
      // exec'd alone and needs no semicolon; the same string moved into `ddl`
      // fuses with the next one — `…created_at TEXT) CREATE INDEX …` — and D1
      // rejects the whole batch with `near "CREATE": syntax error`, taking all
      // 115 statements down with it. That is exactly how the two statements
      // re-homed here from `alters` first landed.
      expect(sql, sql.slice(0, 70)).toMatch(/;$/);
    }
  });

  it("uses ALTER only for tolerated column adds", () => {
    // The runner swallows exactly one error — "duplicate column" — because that
    // is what a re-applied ADD COLUMN raises. Any other ALTER shape (RENAME,
    // DROP) would fail differently and abort the module every single run.
    for (const sql of KOVA_SCHEMA.alters ?? []) {
      expect(sql, sql.slice(0, 70)).toMatch(/^ALTER TABLE \w+ ADD COLUMN /);
    }
  });

  it("still covers the whole database", () => {
    // A guard against an extraction quietly dropping statements on the way out.
    // These numbers go DOWN as tables move into @4dl/* packages — when they do,
    // update them here in the same commit as the move, so a silent loss can't
    // hide behind a passing suite. Stage 1 took `tenant_domains` and
    // `tenant_settings` (2 tables, 1 index, 4 ALTERs) into @4dl/tenancy; Stage 2
    // took Better Auth's eight plus `auth_logs` and `action_otps` (10 tables,
    // 2 indexes) into @4dl/auth; Stage 3 took plans, subscriptions,
    // credit_packs, credit_ledger and stripe_events (5 tables, 3 indexes) into
    // @4dl/billing; Stage 4 took packages, subject_subscriptions, redemption_codes,
    // redemption_uses, promo_codes and addon_types (6 tables, 6 indexes,
    // 4 ALTERs) into @4dl/commerce.
    const ddl = schemaStatements(KOVA_SCHEMA);
    expect(ddl.filter((s) => s.startsWith("CREATE TABLE"))).toHaveLength(43);
    expect(ddl.filter((s) => s.startsWith("CREATE INDEX"))).toHaveLength(30);
    expect(ddl.filter((s) => s.startsWith("CREATE UNIQUE INDEX"))).toHaveLength(6);
    expect(ddl.filter((s) => s.startsWith("DROP INDEX"))).toHaveLength(1);
    expect(KOVA_SCHEMA.alters ?? []).toHaveLength(44);
  });

  it("names every backfill", () => {
    // Backfills are best-effort and only ever surface in a log line, so an
    // unnamed one is unattributable when it fails.
    for (const b of KOVA_SCHEMA.backfills ?? []) expect(b.name).toBeTruthy();
  });
});

describe("the composed schema", () => {
  it("declares one module per owner, with no table claimed twice", () => {
    // Two modules creating the same table would each apply it under their own
    // marker: harmless while both agree (`IF NOT EXISTS`) and silently divergent
    // the moment one is edited. Ownership has to be exclusive.
    const tableOf = (s: string) => /CREATE TABLE IF NOT EXISTS "?(\w+)"?/.exec(s)?.[1];
    const owned = new Map<string, string>();
    for (const m of [AUTH_SCHEMA, TENANCY_SCHEMA, BILLING_SCHEMA, COMMERCE_SCHEMA, KOVA_SCHEMA]) {
      for (const sql of schemaStatements(m)) {
        const t = tableOf(sql);
        if (!t) continue;
        expect(owned.get(t), `${t} is claimed by both ${owned.get(t)} and ${m.id}`).toBeUndefined();
        owned.set(t, m.id);
      }
    }
    expect(owned.get("user")).toBe("auth");
    expect(owned.get("member")).toBe("auth");
    expect(owned.get("action_otps")).toBe("auth");
    expect(owned.get("tenant_domains")).toBe("tenancy");
    expect(owned.get("tenant_settings")).toBe("tenancy");
    expect(owned.get("subscriptions")).toBe("billing");
    expect(owned.get("credit_ledger")).toBe("billing");
    expect(owned.get("packages")).toBe("commerce");
    expect(owned.get("subject_subscriptions")).toBe("commerce");
    expect(owned.get("clients")).toBe("kova");
  });

  it("lets a later module extend an earlier module's table", () => {
    // `tenant_settings` is tenancy's row, and billing/AI/email/commerce each own
    // columns on it. That works ONLY because tenancy applies first — so this
    // asserts the ordering the app relies on, not just the ALTERs themselves.
    const kovaAlters = (KOVA_SCHEMA.alters ?? []).filter((s) => s.includes("tenant_settings"));
    expect(kovaAlters.length).toBeGreaterThan(0);
    expect(schemaStatements(TENANCY_SCHEMA).some((s) => s.includes("CREATE TABLE IF NOT EXISTS tenant_settings"))).toBe(true);
  });

  it("keeps identity OUT of the tenant cascade", () => {
    // `user`, `session`, `account`, `verification` and `passkey` are keyed on a
    // USER, who is cross-tenant: a person in two tenants keeps their identity
    // when one is purged. Sweeping them with the tenant would delete a stranger's
    // account as a side effect of someone else closing theirs.
    const t = AUTH_SCHEMA.scoped?.tenantTables ?? [];
    expect(t).toContain("member");
    expect(t).toContain("invitation");
    for (const identity of ["user", "session", "account", "verification", "passkey"]) {
      expect(t, identity).not.toContain(identity);
    }
  });

  it("keeps the PLATFORM catalog out of the tenant cascade", () => {
    // `plans`, `credit_packs` and `stripe_events` belong to the platform, not to
    // any one tenant. Sweeping them with a tenant purge would delete the catalog
    // every OTHER tenant is subscribed to — the loudest possible way to discover
    // that a scope declaration was copied without being read.
    const t = BILLING_SCHEMA.scoped?.tenantTables ?? [];
    expect(t).toEqual(["subscriptions", "credit_ledger"]);
  });

  it("declares the SUBJECT scope too, not just the tenant one", () => {
    // Commerce is the first module with rows keyed on an individual rather than
    // on a tenant, and the two cascades are different operations: closing a
    // tenant clears everything, while one customer exercising erasure clears
    // only theirs. `redemption_uses` has no tenant column at all — it is reached
    // through its codes one way and through the subject the other.
    expect(COMMERCE_SCHEMA.scoped?.subjectColumn).toBe("subject_id");
    expect(COMMERCE_SCHEMA.scoped?.subjectTables).toContain("redemption_uses");
    expect(COMMERCE_SCHEMA.scoped?.tenantTables).not.toContain("redemption_uses");
  });

  it("declares what a tenant purge must clear", () => {
    // Stage 7 derives the erasure cascade from these, replacing the two
    // hand-maintained inventories in purge.ts that must currently be kept in
    // step with the DDL by hand.
    expect(TENANCY_SCHEMA.scoped?.tenantColumn).toBe("tenant_id");
    expect(TENANCY_SCHEMA.scoped?.tenantTables).toContain("tenant_domains");
  });
});
