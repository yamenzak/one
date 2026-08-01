/**
 * `syncCatalog` — and specifically, what it does when Stripe says no.
 *
 * The catalog sync has two jobs: CREATE what is missing, and RECONCILE the name
 * of what already exists. The second was added so a plan renamed in the catalog
 * (Solo → Starter) stops being called by its old name on every checkout page and
 * invoice — a rename does not move the price, so it never invalidates the stored
 * ids and the create-only loop skipped straight past it.
 *
 * ── The regression this file exists to stop coming back ─────────────────────
 *
 * That reconcile was written to push the name unconditionally, and unguarded. A
 * stored product id can legitimately fail to resolve:
 *
 *   - the row carries TEST-lane ids while the LIVE lane is active (ids are
 *     lane-specific, and both look like `prod_…` so nothing warns you), or
 *   - an operator deleted the product in the Stripe dashboard.
 *
 * Either way Stripe answers "No such product" and `stripeCall` throws. Because
 * the throw propagated, ONE stale row aborted the entire sync: no plan created,
 * no pack created, nothing renamed — and the operator saw a bare HTTP 500,
 * because the admin router had no error handler either.
 *
 * The rule the tests below pin: **creating what is missing must never be blocked
 * by a cosmetic rename of something else.** A failed rename is counted and
 * reported, and the loop carries on.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { syncCatalog } from "../src/stripe.js";

const calls: { path: string; body: Record<string, unknown> | undefined }[] = [];

/**
 * Intercepted at `fetch`, not at `stripeCall` — the two live in the same module,
 * so there is no seam to mock between them, and going through the real
 * `stripeCall` is better anyway: it exercises the actual `!res.ok → throw` that
 * this whole test is about. A live-key suite covers the real API
 * (apps/api/test/stripe-live.test.ts); what is under test here is OUR control
 * flow around a failure.
 */
function installFetch() {
  vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
    const path = String(url).replace("https://api.stripe.com/v1/", "");
    const body = Object.fromEntries(new URLSearchParams(init?.body ?? "")) as Record<string, unknown>;
    calls.push({ path, body });
    // `prod_stale` is the row whose id does not resolve in the active lane —
    // a row still carrying the other lane's ids, or a product deleted by hand.
    if (path === "products/prod_stale") {
      return new Response(JSON.stringify({ error: { message: "No such product: 'prod_stale'" } }), { status: 404 });
    }
    const id = path === "prices" ? "price_new" : "prod_new";
    return new Response(JSON.stringify({ id }), { status: 200 });
  });
}

const BRANDING = { productPrefix: "Kova", metadataPrefix: "kova" };

/** A minimal D1 stand-in: enough for the two SELECTs and the UPDATE. */
function fakeDb(plans: unknown[], packs: unknown[]) {
  const updates: string[] = [];
  return {
    updates,
    prepare(sql: string) {
      const rows = sql.includes("FROM plans") ? plans : sql.includes("FROM credit_packs") ? packs : [];
      return {
        bind: (...args: unknown[]) => {
          if (sql.startsWith("UPDATE")) updates.push(String(args[args.length - 1]));
          return {
            all: async () => ({ results: rows }),
            run: async () => ({ meta: { changes: 1 } }),
            first: async () => null,
          };
        },
        all: async () => ({ results: rows }),
        run: async () => ({ meta: { changes: 1 } }),
        first: async () => null,
      };
    },
  } as unknown as D1Database & { updates: string[] };
}

const plan = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: id, price_usd_month: 9.99, stripe_product_id: null, stripe_price_id: null, ...over,
});

beforeEach(() => {
  calls.length = 0;
  installFetch();
});
afterEach(() => vi.unstubAllGlobals());

describe("a product id that Stripe cannot resolve", () => {
  it("does not abort the sync — the missing plan is still created", async () => {
    // The regression, stated as a scenario: one already-synced row whose product
    // is gone, and one row that has never been synced. Before the fix the first
    // threw and the second was never reached.
    const db = fakeDb(
      [
        plan("stale", { stripe_product_id: "prod_stale", stripe_price_id: "price_old" }),
        plan("brandnew"),
      ],
      [],
    );
    const r = await syncCatalog(db, "sk_test_x", BRANDING);
    expect(r.plans).toBe(1); // `brandnew` was created despite the failure above it
    expect(r.renameFailed).toBe(1);
    expect(r.renamed).toBe(0);
  });

  it("reports the failure rather than swallowing it", async () => {
    // Silence here would be the worse bug of the two: the operator would read
    // "0 renamed" as "nothing needed renaming" and never learn that their rows
    // point at another lane's products.
    const db = fakeDb([plan("stale", { stripe_product_id: "prod_stale", stripe_price_id: "price_old" })], []);
    const r = await syncCatalog(db, "sk_test_x", BRANDING);
    expect(r.renameFailed).toBe(1);
  });

  it("still renames the rows that DO resolve", async () => {
    // Per-row, not all-or-nothing: a stale row must not cost a healthy one its
    // rename, or one bad id would freeze the whole catalog's naming forever.
    const db = fakeDb(
      [
        plan("stale", { stripe_product_id: "prod_stale", stripe_price_id: "price_old" }),
        plan("fine", { stripe_product_id: "prod_fine", stripe_price_id: "price_fine" }),
      ],
      [],
    );
    const r = await syncCatalog(db, "sk_test_x", BRANDING);
    expect(r.renamed).toBe(1);
    expect(r.renameFailed).toBe(1);
    expect(calls.some((c) => c.path === "products/prod_fine" && c.body?.name === "Kova fine")).toBe(true);
  });
});

describe("the happy paths still hold", () => {
  it("creates a product + price for a plan that has neither", async () => {
    const db = fakeDb([plan("solo")], []);
    const r = await syncCatalog(db, "sk_test_x", BRANDING);
    expect(r).toMatchObject({ plans: 1, renamed: 0, renameFailed: 0 });
    expect(calls.map((c) => c.path)).toEqual(["products", "prices"]);
  });

  it("renames an existing product to the catalog's current name", async () => {
    // The reason the reconcile was added at all: Solo → Starter has to reach
    // Stripe, or the old name stays on every checkout page and invoice.
    const db = fakeDb([plan("solo", { name: "Starter", stripe_product_id: "prod_solo", stripe_price_id: "price_solo" })], []);
    const r = await syncCatalog(db, "sk_test_x", BRANDING);
    expect(r).toMatchObject({ plans: 0, renamed: 1, renameFailed: 0 });
    expect(calls[0]).toMatchObject({ path: "products/prod_solo", body: { name: "Kova Starter" } });
  });

  it("skips a row with a price but no product id, rather than throwing", async () => {
    // Half-written rows exist (an interrupted sync). There is nothing to rename
    // without a product id, and no reason to fail.
    const db = fakeDb([plan("halfway", { stripe_product_id: null, stripe_price_id: "price_orphan" })], []);
    const r = await syncCatalog(db, "sk_test_x", BRANDING);
    expect(r).toMatchObject({ plans: 0, renamed: 0, renameFailed: 0 });
    expect(calls).toHaveLength(0);
  });
});
