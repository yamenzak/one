/**
 * THE STOCK ROUTES, over real HTTP.
 *
 * The two-scan receive is the product's central claim — scan the bin, scan the
 * box, type a number — so it is driven here with a real GS1 element string
 * rather than a pre-parsed object. If the parser and the route disagree about
 * what a barcode means, this is where it shows.
 *
 * Note the harness makes every signed-in user a platform admin (see
 * `integration.test.ts`), so action gates are not observable. What IS observable,
 * and is what these assert, is behaviour: what the barcode supplies, what the
 * ledger records, and what the shelf says afterwards.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";

const SETUP = "http://setup.localhost:8787";
const db = () => env.DB as D1Database;

function cookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return (h.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

let origin = "";
let auth: Record<string, string> = {};
let binId = "";
let gauzeId = "";

/** A real GS1 element string: GTIN 07612345678900, expiry 2027-01-31, lot L-9. */
const GS = "\x1d";
const BARCODE = `010761234567890017270131${GS}10L-9`;

const H = () => ({ "content-type": "application/json", origin, ...auth });

/**
 * Receive, and hand back the lot.
 *
 * A helper rather than shared state because the harness gives each test its own
 * storage frame: a row written inside `it(...)` is invisible to the next one,
 * while a `beforeAll` write is replayed into every frame. Tests that lean on a
 * predecessor's row pass alone and fail in sequence.
 */
async function receive(quantity: number, barcode = BARCODE): Promise<{ status: number; lotId: string; quantity: number; expiry: string; lotCode: string }> {
  const res = await SELF.fetch(`${origin}/api/stock/receive`, {
    method: "POST", headers: H(), body: JSON.stringify({ barcode, locationId: binId, quantity }),
  });
  const body = (await res.json().catch(() => ({}))) as { lotId: string; quantity: number; expiry: string; lotCode: string };
  return { status: res.status, ...body };
}

const shelf = async (): Promise<{ id: string; quantity: number; expiry: string; expiryReason: string; expiryStatus: string; daysLeft: number }[]> =>
  ((await (await SELF.fetch(`${origin}/api/stock`, { headers: auth })).json()) as { lots: never[] }).lots;

beforeAll(async () => {
  await ensureSchema(db());
  const email = "stock@test.dev";
  await SELF.fetch(`${SETUP}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SETUP },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db()
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
  const verify = await SELF.fetch(`${SETUP}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SETUP },
    body: JSON.stringify({ email, otp }),
  });
  let jar = cookies(verify);
  const org = await SELF.fetch(`${SETUP}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SETUP, Cookie: jar },
    body: JSON.stringify({ name: "Clinic", slug: "clinic" }),
  });
  jar = cookies(org) || jar;
  auth = { Cookie: jar };
  origin = "http://clinic.localhost:8787";

  const loc = await SELF.fetch(`${origin}/api/locations`, {
    method: "POST", headers: H(), body: JSON.stringify({ name: "Bin A", kind: "bin" }),
  });
  binId = ((await loc.json()) as { id: string }).id;

  const cat = await SELF.fetch(`${origin}/api/catalog`, {
    method: "POST",
    headers: H(),
    body: JSON.stringify({ name: "Sterile gauze 10x10", tracking: "lot", consumption: "discrete", gtin: "07612345678900" }),
  });
  gauzeId = ((await cat.json()) as { id: string }).id;
});

describe("receiving by scan", () => {
  it("takes product, expiry and lot from the barcode — only the count is typed", async () => {
    // The central claim of the product, driven with a real element string.
    const r = await receive(20);
    expect(r.status).toBe(201);
    expect(r).toMatchObject({ quantity: 20, expiry: "2027-01-31", lotCode: "L-9" });
  });

  it("tops up the SAME lot on a second delivery rather than fragmenting the shelf", async () => {
    // Two rows for identical stock cannot be reconciled against the shelf, and
    // would make FEFO picking choose arbitrarily between them.
    await receive(20);
    const second = await receive(5);
    expect(second.quantity).toBe(25);
    const n = await db().prepare("SELECT COUNT(*) AS n FROM lots WHERE catalog_item_id = ?").bind(gauzeId).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("answers 409 with what it DID read when the product is unknown", async () => {
    // So the next screen is a pre-filled confirmation rather than a blank form.
    const unknown = `010000000000001717270131${GS}10L-X`;
    const res = await SELF.fetch(`${origin}/api/stock/receive`, {
      method: "POST", headers: H(),
      body: JSON.stringify({ barcode: unknown, locationId: binId, quantity: 1 }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; scan: { lot: string; expiry: string } };
    expect(body.error).toBe("unknown_product");
    expect(body.scan).toMatchObject({ lot: "L-X", expiry: "2027-01-31" });
  });

  it("refuses a location that is not this tenant's", async () => {
    const res = await SELF.fetch(`${origin}/api/stock/receive`, {
      method: "POST", headers: H(),
      body: JSON.stringify({ barcode: BARCODE, locationId: "loc_elsewhere", quantity: 1 }),
    });
    expect(res.status).toBe(404);
  });
});

describe("using stock", () => {
  it("counts down, and refuses to go below zero", async () => {
    const { lotId } = await receive(25);

    const use = await SELF.fetch(`${origin}/api/stock/${lotId}/use`, {
      method: "POST", headers: H(), body: JSON.stringify({ quantity: 5 }),
    });
    expect(((await use.json()) as { quantity: number }).quantity).toBe(20);

    // The refusal carries copy a person can act on, not an enum.
    const tooMuch = await SELF.fetch(`${origin}/api/stock/${lotId}/use`, {
      method: "POST", headers: H(), body: JSON.stringify({ quantity: 999 }),
    });
    expect(tooMuch.status).toBe(409);
    expect(((await tooMuch.json()) as { error: string }).error).toMatch(/isn't that much left/);
  });

  it("records every movement in the ledger — and nothing for a refusal", async () => {
    const { lotId } = await receive(10);
    await SELF.fetch(`${origin}/api/stock/${lotId}/use`, { method: "POST", headers: H(), body: JSON.stringify({ quantity: 2 }) });
    // Refused: over-consumption. It must leave no trace, because a ledger row
    // for something that did not happen is evidence of a falsehood.
    await SELF.fetch(`${origin}/api/stock/${lotId}/use`, { method: "POST", headers: H(), body: JSON.stringify({ quantity: 999 }) });

    const h = (await (await SELF.fetch(`${origin}/api/stock/${lotId}/history`, { headers: auth })).json()) as {
      events: { event: string }[];
    };
    expect(h.events.map((e) => e.event).sort()).toEqual(["consumed", "received"]);
  });
});

describe("what the shelf says", () => {
  it("reports the effective expiry AND which clock produced it", async () => {
    await receive(10);
    expect((await shelf())[0]).toMatchObject({ expiry: "2027-01-31", expiryReason: "printed" });
  });

  it("shortens the expiry once opened, and says WHY", async () => {
    // The dangerous clock (TESSA.md §3.4): printed 2027, but this item is
    // unusable 7 days after opening. A UI showing 2027 here would be confidently
    // wrong at the moment someone decides to use it.
    await db().prepare("UPDATE catalog_items SET post_opening_days = 7 WHERE id = ?").bind(gauzeId).run();
    const { lotId } = await receive(10);
    await SELF.fetch(`${origin}/api/stock/${lotId}/open`, { method: "POST", headers: H(), body: "{}" });

    const lot = (await shelf())[0]!;
    expect(lot.expiryReason).toBe("opened");
    expect(lot.expiry).not.toBe("2027-01-31");
    expect(lot.daysLeft).toBeLessThanOrEqual(7);
  });

  it("does not restart the clock when opened twice", async () => {
    // Re-opening would silently EXTEND an expiry — the unsafe direction. The
    // projection uses COALESCE for exactly this.
    await db().prepare("UPDATE catalog_items SET post_opening_days = 7 WHERE id = ?").bind(gauzeId).run();
    const { lotId } = await receive(10);
    await SELF.fetch(`${origin}/api/stock/${lotId}/open`, { method: "POST", headers: H(), body: "{}" });

    // Backdate the first opening. Without this the two opens land in the same
    // second and the assertion holds no matter what the projection does — the
    // test would pass while COALESCE was missing, which is worse than no test.
    const backdated = new Date(Date.now() - 5 * 86_400_000).toISOString();
    await db().prepare("UPDATE lots SET opened_at = ? WHERE id = ?").bind(backdated, lotId).run();
    const first = (await shelf())[0]!.expiry;
    expect(first).toBe(new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));

    await SELF.fetch(`${origin}/api/stock/${lotId}/open`, { method: "POST", headers: H(), body: "{}" });
    expect((await shelf())[0]!.expiry).toBe(first);
  });
});
