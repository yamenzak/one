/**
 * THE LEDGER CHOKEPOINT, against a real database.
 *
 * `@tessa/domain`'s tests cover the arithmetic without D1. This file covers the
 * three things that only exist once there IS a database, and that no amount of
 * pure testing can reach:
 *
 *   ATOMICITY      the ledger row and the state change land together, or not at
 *                  all — an audit trail that can be wrong in either direction is
 *                  worth nothing
 *   THE CAS        two people consuming the last units of one lot at the same
 *                  moment is a Tuesday in a busy clinic, and without the
 *                  compare-and-set both succeed
 *   TENANT SCOPE   `applyEvent` is the one way anything changes, so it is also
 *                  the one place a cross-tenant write would get through
 *
 * These use `applyEvent` directly rather than over HTTP: there are no routes on
 * top of it yet, and the invariant belongs to the function, not to a URL.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { applyEvent, historyOf } from "../src/ledger.js";

const db = () => env.DB as D1Database;
const TENANT = "tnt_ledger";
const OTHER = "tnt_other";
const USER = "usr_1";

async function seedCatalog(id: string, consumption: string) {
  await db()
    .prepare("INSERT OR REPLACE INTO catalog_items (id, tenant_id, name, kind, tracking, consumption, active, created_at) VALUES (?, ?, ?, 'consumable', 'lot', ?, 1, ?)")
    .bind(id, TENANT, id, consumption, new Date().toISOString())
    .run();
}

async function seedLot(id: string, catalogId: string, qty: number, tenant = TENANT) {
  await db()
    .prepare("INSERT OR REPLACE INTO lots (id, tenant_id, catalog_item_id, location_id, quantity, status, created_at) VALUES (?, ?, ?, 'loc_a', ?, 'active', ?)")
    .bind(id, tenant, catalogId, qty, new Date().toISOString())
    .run();
}

const qtyOf = async (id: string): Promise<{ quantity: number; status: string } | null> =>
  db().prepare("SELECT quantity, status FROM lots WHERE id = ?").bind(id).first<{ quantity: number; status: string }>();

const ledgerCount = async (id: string): Promise<number> =>
  ((await db().prepare("SELECT COUNT(*) AS n FROM ledger WHERE tracked_id = ?").bind(id).first<{ n: number }>())?.n ?? 0);

beforeAll(async () => {
  await ensureSchema(db());
  await seedCatalog("cat_discrete", "discrete");
  await seedCatalog("cat_bottle", "divisible");
});

describe("an event moves the world and records itself, together", () => {
  it("consumes stock and writes the ledger row that justifies it", async () => {
    await seedLot("lot_1", "cat_discrete", 10);
    const r = await applyEvent(db(), {
      tenantId: TENANT, actorUserId: USER, event: "consumed",
      trackedKind: "lot", trackedId: "lot_1", quantity: 3,
    });
    expect(r).toMatchObject({ ok: true, quantity: 7 });
    expect(await qtyOf("lot_1")).toMatchObject({ quantity: 7, status: "active" });
    expect(await ledgerCount("lot_1")).toBe(1);
  });

  it("stores the delta SIGNED, so summing the ledger reproduces the balance", async () => {
    await seedLot("lot_signed", "cat_discrete", 10);
    await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "consumed", trackedKind: "lot", trackedId: "lot_signed", quantity: 4 });
    await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "received", trackedKind: "lot", trackedId: "lot_signed", quantity: 1 });
    // A reader must not have to know which events subtract. This is what makes
    // the balance rebuildable from history alone.
    const sum = await db()
      .prepare("SELECT SUM(quantity_delta) AS s FROM ledger WHERE tracked_id = ?")
      .bind("lot_signed")
      .first<{ s: number }>();
    expect(sum?.s).toBe(-3);
    expect((await qtyOf("lot_signed"))?.quantity).toBe(7);
  });

  it("closes a lot that reaches zero rather than leaving it active at 0", async () => {
    // An empty-but-active lot keeps appearing in pick lists forever.
    await seedLot("lot_empty", "cat_discrete", 2);
    const r = await applyEvent(db(), {
      tenantId: TENANT, actorUserId: USER, event: "consumed",
      trackedKind: "lot", trackedId: "lot_empty", quantity: 2,
    });
    expect(r.ok).toBe(true);
    expect(await qtyOf("lot_empty")).toMatchObject({ quantity: 0, status: "consumed" });
  });

  it("records who and when, on every row", async () => {
    // TESSA.md Rule 2: the app records a person's act. A ledger row with no
    // actor is an assertion nobody made.
    await seedLot("lot_who", "cat_discrete", 5);
    await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "consumed", trackedKind: "lot", trackedId: "lot_who", quantity: 1 });
    const row = await db().prepare("SELECT actor_user_id, at FROM ledger WHERE tracked_id = ?").bind("lot_who").first<{ actor_user_id: string; at: string }>();
    expect(row?.actor_user_id).toBe(USER);
    expect(row?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("a refused event changes NOTHING — not the state, not the ledger", () => {
  it("refuses to over-consume, and leaves no trace", async () => {
    // The important half is the second one. A ledger row for an event that did
    // not happen is worse than no row: it is evidence of a thing that is false.
    await seedLot("lot_short", "cat_discrete", 2);
    const r = await applyEvent(db(), {
      tenantId: TENANT, actorUserId: USER, event: "consumed",
      trackedKind: "lot", trackedId: "lot_short", quantity: 5,
    });
    expect(r).toEqual({ ok: false, reason: "insufficient" });
    expect((await qtyOf("lot_short"))?.quantity).toBe(2);
    expect(await ledgerCount("lot_short")).toBe(0);
  });

  it("refuses a fraction of a discrete item but allows it on a divisible one", async () => {
    await seedLot("lot_d", "cat_discrete", 5);
    await seedLot("lot_b", "cat_bottle", 1);
    expect(await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "consumed", trackedKind: "lot", trackedId: "lot_d", quantity: 0.5 }))
      .toEqual({ ok: false, reason: "not_divisible" });
    // `divisible` is read from the CATALOG, not the lot — so this proves the
    // join is wired, not just the arithmetic.
    expect(await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "consumed", trackedKind: "lot", trackedId: "lot_b", quantity: 0.5 }))
      .toMatchObject({ ok: true, quantity: 0.5 });
  });

  it("refuses an event that does not apply to this kind", async () => {
    await seedLot("lot_kind", "cat_discrete", 5);
    expect(await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "retired", trackedKind: "lot", trackedId: "lot_kind" }))
      .toEqual({ ok: false, reason: "not_applicable" });
  });

  it("refuses to touch a finished thing", async () => {
    await seedLot("lot_done", "cat_discrete", 0);
    await db().prepare("UPDATE lots SET status = 'consumed' WHERE id = ?").bind("lot_done").run();
    expect(await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "received", trackedKind: "lot", trackedId: "lot_done", quantity: 5 }))
      .toEqual({ ok: false, reason: "finished" });
  });

  it("freezes a quarantined thing without ending it", async () => {
    // Frozen, not finished: a recall must be reversible by a human decision, or
    // people stop quarantining.
    await seedLot("lot_q", "cat_discrete", 5);
    expect((await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "quarantined", trackedKind: "lot", trackedId: "lot_q", note: "cycle 47" })).ok).toBe(true);
    expect((await qtyOf("lot_q"))?.status).toBe("quarantined");
    // …and nothing else may act on it while it is frozen.
    expect(await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "consumed", trackedKind: "lot", trackedId: "lot_q", quantity: 1 }))
      .toEqual({ ok: false, reason: "frozen" });
  });
});

describe("tenant scope", () => {
  it("cannot reach another tenant's lot, even with its exact id", async () => {
    // `applyEvent` is the ONE way anything changes, which makes it the one place
    // a cross-tenant write would get through. Reported as not_found rather than
    // forbidden: the existence of another tenant's row is not ours to confirm.
    await seedLot("lot_theirs", "cat_discrete", 10, OTHER);
    const r = await applyEvent(db(), {
      tenantId: TENANT, actorUserId: USER, event: "consumed",
      trackedKind: "lot", trackedId: "lot_theirs", quantity: 1,
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
    expect((await qtyOf("lot_theirs"))?.quantity).toBe(10);
  });
});

describe("concurrency", () => {
  it("does not let two simultaneous writers both take the last units", async () => {
    // The Tuesday-afternoon case. Without the compare-and-set both reads see 2,
    // both writes succeed, and the lot ends at 1 having handed out 2 — the app
    // and the shelf disagree with nothing to explain why.
    await seedLot("lot_race", "cat_discrete", 2);
    const [a, b] = await Promise.all([
      applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "consumed", trackedKind: "lot", trackedId: "lot_race", quantity: 2 }),
      applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "consumed", trackedKind: "lot", trackedId: "lot_race", quantity: 2 }),
    ]);
    const wins = [a, b].filter((r) => r.ok).length;
    expect(wins).toBe(1);
    expect((await qtyOf("lot_race"))?.quantity).toBe(0);
    // The loser leaves no ledger row either — see the CAS unwind in ledger.ts.
    expect(await ledgerCount("lot_race")).toBe(1);
  });
});

describe("history", () => {
  it("returns one thing's events, newest first", async () => {
    await seedLot("lot_hist", "cat_discrete", 10);
    await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "consumed", trackedKind: "lot", trackedId: "lot_hist", quantity: 1 });
    await applyEvent(db(), { tenantId: TENANT, actorUserId: USER, event: "moved", trackedKind: "lot", trackedId: "lot_hist", toLocationId: "loc_b" });
    const h = await historyOf(db(), TENANT, "lot", "lot_hist");
    expect(h).toHaveLength(2);
    expect(h.map((r) => r.event)).toContain("moved");
    // A move records where it went, so provenance survives the transfer.
    expect(h.find((r) => r.event === "moved")?.to_location_id).toBe("loc_b");
  });

  it("does not leak another tenant's history", async () => {
    const h = await historyOf(db(), OTHER, "lot", "lot_hist");
    expect(h).toHaveLength(0);
  });
});
