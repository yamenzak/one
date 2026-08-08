/**
 * THE STRIPE CONSOLE ROUTES, against a fake D1 that records every statement.
 *
 * Everything asserted here is a rule that was present in ONE app's copy of
 * these handlers and absent from another's, which is what made them worth
 * moving rather than worth deleting:
 *
 *   TWO LANES, BOTH STORED. Kova kept `stripe.test.*` and `stripe.live.*` at
 *   once; Tessa wrote whichever lane the mode named and Scena wrote a single
 *   unscoped key through a generic config form. Going live is meant to be a
 *   switch, not a re-paste under pressure.
 *
 *   THE MODE FLIP SWAPS THE CATALOG. Stripe products and prices are per-lane
 *   objects, so flipping without moving them leaves every plan pointing at the
 *   other lane's price id — a payments outage produced by pressing the button
 *   the console offers.
 *
 *   A CONTRADICTION IS REFUSED, NOT CORRECTED. A live key filed under a `test`
 *   mode still moves real money. Relabelling what an operator typed is how a
 *   live key ends up active by accident, so the write is rejected whole.
 *
 *   A BLANK FIELD PRESERVES. Keys are write-only — the console renders "set"
 *   from a boolean and a last-4 — so an empty box must mean "keep it", never
 *   "clear it".
 *
 * The fake is deliberately dumb: it records `prepare`/`bind` and answers
 * `first` from a canned map. What is under test is which statements we emit and
 * which requests we refuse.
 */

import { describe, expect, it } from "vitest";
import { stripeAdminRoutes, type CatalogSyncResult } from "../src/stripe-admin-routes.js";

interface Stmt { sql: string; binds: unknown[] }

class FakeDb {
  stmts: Stmt[] = [];
  /** `app_config` as a plain map, which is all these routes treat it as. */
  config: Record<string, string> = {};

  prepare(sql: string) {
    const self = this;
    const rec: Stmt = { sql, binds: [] };
    this.stmts.push(rec);
    const stmt = {
      bind(...binds: unknown[]) { rec.binds = binds; return stmt; },
      async first<T>(): Promise<T | null> {
        if (sql.includes("FROM app_config") && sql.includes("WHERE key")) {
          const key = String(rec.binds[0] ?? "");
          return (key in self.config ? { value: self.config[key] } : null) as T | null;
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (sql.includes("FROM app_config")) {
          return { results: Object.entries(self.config).map(([key, value]) => ({ key, value })) as T[] };
        }
        return { results: [] as T[] };
      },
      async run(): Promise<{ meta: { changes: number } }> {
        // The one write these routes make directly is a config upsert.
        if (sql.includes("INSERT INTO app_config")) {
          const [key, value] = rec.binds as [string, string];
          self.config[key] = value;
        }
        return { meta: { changes: 2 } };
      },
      __rec: rec,
    };
    return stmt;
  }

  async batch(stmts: { __rec: Stmt }[]): Promise<void> {
    for (const s of stmts) {
      if (s.__rec.sql.includes("INSERT INTO app_config")) {
        const [key, value] = s.__rec.binds as [string, string];
        this.config[key] = value;
      }
    }
  }
}

const SK_TEST = "sk_test_51abcdefXYZ";
const SK_LIVE = "sk_live_51abcdefLIVE";
const PK_TEST = "pk_test_51abcdefXYZ";

function harness(opts: { admin?: boolean; config?: Record<string, string>; rebuild?: boolean } = {}) {
  const db = new FakeDb();
  Object.assign(db.config, opts.config ?? {});
  let synced = 0;
  let seeded = 0;
  let cleared = 0;
  let lastSecret: string | null = null;
  const app = stripeAdminRoutes({
    isPlatformAdmin: () => opts.admin !== false,
    seed: async () => { seeded += 1; },
    syncCatalog: async (_db, secretKey): Promise<CatalogSyncResult> => {
      synced += 1;
      lastSecret = secretKey;
      return { plans: 4, packs: 2 };
    },
    ...(opts.rebuild === false
      ? {}
      : { clearCatalogIds: async () => { cleared += 1; return { cleared: 4, clearedPacks: 2 }; } }),
  });
  const env = { DB: db as unknown as D1Database };
  const json = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, env);
  return {
    db,
    counts: () => ({ synced, seeded, cleared }),
    lastSecret: () => lastSecret,
    get: (path: string) => app.request(path, {}, env),
    post: json,
  };
}

describe("GET /admin/stripe/status", () => {
  it("reports presence and provenance and NEVER a key", async () => {
    const h = harness({ config: { "stripe.mode": "test", "stripe.test.secret_key": SK_TEST, "stripe.test.publishable_key": PK_TEST } });
    const text = await (await h.get("/admin/stripe/status")).text();
    // The whole safety property of this endpoint, asserted on the raw body
    // rather than a parsed field: no stored secret may appear anywhere in it.
    expect(text).not.toContain(SK_TEST);
    expect(text).not.toContain(PK_TEST);
    const body = JSON.parse(text) as { mode: string; activeLane: string; lanes: Record<string, { secretKey: boolean; secretKeyLast4: string | null }> };
    expect(body.mode).toBe("test");
    expect(body.activeLane).toBe("test");
    expect(body.lanes.test!.secretKey).toBe(true);
    // A last-4 hint is the most it may say — enough to recognise a key, not
    // enough to use one.
    expect(body.lanes.test!.secretKeyLast4).toBe(SK_TEST.slice(-4));
    expect(body.lanes.live!.secretKey).toBe(false);
  });

  it("reports the CONTRADICTION rather than resolving it", async () => {
    // Live keys under a `test` label: this deployment is already taking real
    // money. Failing closed would turn a labelling bug into a payments outage,
    // so it is reported and left running.
    const h = harness({ config: { "stripe.mode": "test", "stripe.test.secret_key": SK_LIVE } });
    const body = (await (await h.get("/admin/stripe/status")).json()) as { laneMismatch: boolean; keyLane: string | null };
    expect(body.laneMismatch).toBe(true);
    expect(body.keyLane).toBe("live");
  });

  it("refuses a caller who is not a platform admin", async () => {
    const h = harness({ admin: false });
    expect((await h.get("/admin/stripe/status")).status).toBe(403);
  });
});

describe("POST /admin/stripe/config", () => {
  it("stores BOTH lanes at once, so going live is a switch and not a re-paste", async () => {
    const h = harness();
    const res = await h.post("/admin/stripe/config", {
      mode: "test",
      lanes: { test: { secretKey: SK_TEST }, live: { secretKey: SK_LIVE } },
    });
    expect(res.status).toBe(200);
    expect(h.db.config["stripe.test.secret_key"]).toBe(SK_TEST);
    expect(h.db.config["stripe.live.secret_key"]).toBe(SK_LIVE);
  });

  it("keeps a stored key when the field comes back blank", async () => {
    // The console never reads a key back, so it posts "" for anything the
    // operator did not retype. Treating that as a clear would wipe the lane on
    // every unrelated save.
    const h = harness({ config: { "stripe.mode": "test", "stripe.test.secret_key": SK_TEST } });
    await h.post("/admin/stripe/config", { secretKey: "", publishableKey: PK_TEST });
    expect(h.db.config["stripe.test.secret_key"]).toBe(SK_TEST);
    expect(h.db.config["stripe.test.publishable_key"]).toBe(PK_TEST);
  });

  it("refuses a key pasted into the wrong SLOT", async () => {
    const h = harness();
    const res = await h.post("/admin/stripe/config", { secretKey: PK_TEST });
    expect(res.status).toBe(400);
    expect((await res.json() as { code: string }).code).toBe("invalid_prefix");
  });

  it("refuses a key pasted into the wrong LANE, and writes nothing", async () => {
    const h = harness();
    const res = await h.post("/admin/stripe/config", { lane: "test", secretKey: SK_LIVE });
    expect(res.status).toBe(400);
    expect((await res.json() as { code: string }).code).toBe("lane_mismatch");
    expect(h.db.config["stripe.test.secret_key"]).toBeUndefined();
  });

  it("refuses a mode whose resulting ACTIVE keys belong to the other lane", async () => {
    // The pre-lane case: legacy unscoped live keys plus a `test` mode. Nothing
    // in this request is individually wrong; the RESULT is.
    const h = harness({ config: { "stripe.secret_key": SK_LIVE } });
    const res = await h.post("/admin/stripe/config", { mode: "test" });
    expect(res.status).toBe(400);
    expect((await res.json() as { code: string }).code).toBe("mode_key_mismatch");
    expect(h.db.config["stripe.mode"]).toBeUndefined();
  });

  it("validates the WHOLE set before committing any of it", async () => {
    // A half-applied save is the exact half-swap the two-lane model exists to
    // prevent: the live lane's key stored, the test lane's refused, and a
    // console that now disagrees with itself.
    const h = harness();
    const res = await h.post("/admin/stripe/config", {
      lanes: { test: { secretKey: SK_TEST }, live: { secretKey: SK_TEST } },
    });
    expect(res.status).toBe(400);
    expect(h.db.config["stripe.test.secret_key"]).toBeUndefined();
  });

  it("SWAPS the catalog's per-lane ids when the mode flips", async () => {
    const h = harness({ config: { "stripe.mode": "test", "stripe.test.secret_key": SK_TEST, "stripe.live.secret_key": SK_LIVE } });
    const res = await h.post("/admin/stripe/config", { mode: "live" });
    expect(res.status).toBe(200);
    expect((await res.json() as { catalogSwapped: boolean }).catalogSwapped).toBe(true);
    expect(h.db.config["stripe.mode"]).toBe("live");
    // The swap parks the outgoing lane's ids and restores the incoming lane's.
    // Without it every plan would point at the test lane's price id and every
    // checkout would fail with "No such price".
    expect(h.db.config["stripe.test.catalog_ids"]).toBeDefined();
  });

  it("does not swap when the mode did not move", async () => {
    const h = harness({ config: { "stripe.mode": "test", "stripe.test.secret_key": SK_TEST } });
    const res = await h.post("/admin/stripe/config", { mode: "test", publishableKey: PK_TEST });
    expect((await res.json() as { catalogSwapped: boolean }).catalogSwapped).toBe(false);
  });

  it("refuses an unrecognised mode or lane rather than defaulting", async () => {
    // Defaulting an unrecognised `lane` would file the key in whichever lane
    // happened to be active, which is the mistake every check here exists for.
    const h = harness();
    expect((await h.post("/admin/stripe/config", { mode: "sandbox" })).status).toBe(400);
    expect((await h.post("/admin/stripe/config", { lane: "staging", secretKey: SK_TEST })).status).toBe(400);
    expect(h.db.config["stripe.test.secret_key"]).toBeUndefined();
  });

  it("refuses a caller who is not a platform admin", async () => {
    const h = harness({ admin: false });
    expect((await h.post("/admin/stripe/config", { secretKey: SK_TEST })).status).toBe(403);
  });
});

describe("POST /admin/stripe/sync", () => {
  it("hands the ACTIVE lane's resolved key to the app's catalog sync", async () => {
    // One resolution, passed down. An app re-reading the config for itself
    // could resolve a different lane than the one this request just verified.
    const h = harness({ config: { "stripe.mode": "live", "stripe.live.secret_key": SK_LIVE, "stripe.test.secret_key": SK_TEST } });
    const body = (await (await h.post("/admin/stripe/sync", {})).json()) as { plans: number; packs: number; cleared: number };
    expect(h.lastSecret()).toBe(SK_LIVE);
    expect(body).toMatchObject({ plans: 4, packs: 2, cleared: 0 });
    expect(h.counts().seeded).toBe(1);
  });

  it("refuses to sync when Stripe is not configured", async () => {
    const h = harness({ config: { "stripe.mode": "disabled" } });
    expect((await h.post("/admin/stripe/sync", {})).status).toBe(400);
    expect(h.counts().synced).toBe(0);
  });

  it("rebuilds prices only when asked", async () => {
    const cfg = { "stripe.mode": "test", "stripe.test.secret_key": SK_TEST };
    const plain = harness({ config: { ...cfg } });
    await plain.post("/admin/stripe/sync", {});
    expect(plain.counts().cleared).toBe(0);

    const rebuild = harness({ config: { ...cfg } });
    const body = (await (await rebuild.post("/admin/stripe/sync", { resyncPrices: true })).json()) as { cleared: number; clearedPacks: number };
    expect(rebuild.counts().cleared).toBe(1);
    // PACKS TOO. A rebuild that cleared plans only left packs with no repair
    // path at all — sync skips a row that holds a price id, so a pack whose
    // price had gone stale was permanently broken and reported as done.
    expect(body).toMatchObject({ cleared: 4, clearedPacks: 2 });
  });

  it("REFUSES a rebuild in an app that has no rebuild path, rather than reporting zero", async () => {
    // "0 rebuilt" reads as "nothing needed rebuilding", which is the opposite
    // of what happened.
    const h = harness({ config: { "stripe.mode": "test", "stripe.test.secret_key": SK_TEST }, rebuild: false });
    expect((await h.post("/admin/stripe/sync", { resyncPrices: true })).status).toBe(400);
    expect(h.counts().synced).toBe(0);
  });

  it("answers 502 with Stripe's own message when the upstream refuses", async () => {
    // A bare 500 with an empty body is what an operator saw before: not which
    // object, not which lane, not whether it was their key.
    const db = new FakeDb();
    Object.assign(db.config, { "stripe.mode": "test", "stripe.test.secret_key": SK_TEST });
    const app = stripeAdminRoutes({
      isPlatformAdmin: () => true,
      syncCatalog: async () => { throw new Error("No such price: price_123"); },
    });
    const res = await app.request(
      "/admin/stripe/sync",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      { DB: db as unknown as D1Database },
    );
    expect(res.status).toBe(502);
    expect((await res.json() as { error: string }).error).toBe("No such price: price_123");
  });

  it("refuses a caller who is not a platform admin", async () => {
    const h = harness({ admin: false });
    expect((await h.post("/admin/stripe/sync", {})).status).toBe(403);
    expect(h.counts().synced).toBe(0);
  });
});
