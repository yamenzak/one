/**
 * The three outcomes, and the one that matters is the third.
 *
 * These sign the payload for real (`verifyWebhook` does HMAC-SHA256 over
 * `${t}.${payload}`), so a broken signature path fails here rather than in
 * production. D1 is faked down to the two calls `park` makes — enough to assert
 * that a row is written, which is the entire difference between this package and
 * the silent 200 it replaces.
 */

import { describe, expect, it } from "vitest";
import { dispatchEvent, type RailDeps } from "../src/dispatch.js";
import type { RailApp } from "../src/routing.js";

const SECRET = "whsec_test";

async function sign(payload: string, secret = SECRET, at = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${at}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${at},v1=${hex}`;
}

/** A D1 stand-in that records what was written. */
function fakeDb() {
  const writes: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return { run: async () => { writes.push({ sql, args }); return { success: true }; } };
        },
      };
    },
  } as unknown as D1Database;
  return { db, writes };
}

const APPS: RailApp[] = [{ slug: "kova", metadataPrefix: "kova" }];

function deps(handle: RailDeps["apps"][number]["handle"], seen = true) {
  const released: (string | undefined)[] = [];
  const d: RailDeps = {
    apps: [{ ...APPS[0]!, handle }],
    firstSeen: async () => seen,
    release: async (id) => { released.push(id); },
  };
  return { d, released };
}

const body = (metadata: Record<string, string>, type = "checkout.session.completed", id = "evt_1") =>
  JSON.stringify({ id, type, data: { object: { metadata } } });

describe("a signature that does not verify", () => {
  it("is refused before anything else happens", async () => {
    const { db, writes } = fakeDb();
    const payload = body({ app: "kova" });
    const { d } = deps(async () => { throw new Error("must not run"); });
    const r = await dispatchEvent({ DB: db }, d, payload, await sign(payload, "wrong_secret"), SECRET);
    expect(r.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("is refused when the endpoint has no secret configured", async () => {
    const { db } = fakeDb();
    const payload = body({ app: "kova" });
    const { d } = deps(async () => { throw new Error("must not run"); });
    expect((await dispatchEvent({ DB: db }, d, payload, await sign(payload), "")).status).toBe(400);
  });
});

describe("an event that belongs to a known app", () => {
  it("is handed to that app", async () => {
    const { db } = fakeDb();
    const payload = body({ kova_tenant: "t_1" });
    let got = "";
    const { d } = deps(async (e) => { got = e.type; });
    const r = await dispatchEvent({ DB: db }, d, payload, await sign(payload), SECRET);
    expect(r).toMatchObject({ status: 200, body: { received: true, app: "kova", via: "prefix" } });
    expect(got).toBe("checkout.session.completed");
  });

  it("is skipped when the id was already claimed", async () => {
    const { db } = fakeDb();
    const payload = body({ app: "kova" });
    const { d } = deps(async () => { throw new Error("must not run"); }, false);
    expect((await dispatchEvent({ DB: db }, d, payload, await sign(payload), SECRET)).body).toMatchObject({ duplicate: true });
  });

  it("RELEASES the idempotency claim when the handler throws, so Stripe's retry is not eaten", async () => {
    // Without the release, a transient D1/DO failure is recorded as processed
    // and the redelivery is dropped as a duplicate: money captured, nothing
    // granted, and no further deliveries coming.
    const { db } = fakeDb();
    const payload = body({ app: "kova" });
    const { d, released } = deps(async () => { throw new Error("D1 unavailable"); });
    await expect(dispatchEvent({ DB: db }, d, payload, await sign(payload), SECRET)).rejects.toThrow("D1 unavailable");
    expect(released).toEqual(["evt_1"]);
  });
});

describe("an event that belongs to NO known app", () => {
  it("is parked with its payload, not silently accepted", async () => {
    const { db, writes } = fakeDb();
    const payload = body({ bocca_tenant: "t_1" });
    const { d } = deps(async () => { throw new Error("must not run"); });
    const r = await dispatchEvent({ DB: db }, d, payload, await sign(payload), SECRET);

    expect(r).toMatchObject({ status: 200, body: { parked: true, reason: "no-app-marker" } });
    expect(writes).toHaveLength(1);
    expect(writes[0]!.sql).toContain("rail_parked_events");
    // The payload is kept because replay is the point: once the attribution is
    // fixed, this row is the only remaining copy of the event.
    expect(writes[0]!.args).toContain(payload);
  });

  it("does NOT claim the event id, so a replay after the fix is still possible", async () => {
    const { db } = fakeDb();
    const payload = body({ app: "unheard-of" });
    let claimed = false;
    const d: RailDeps = {
      apps: [{ ...APPS[0]!, handle: async () => undefined }],
      firstSeen: async () => { claimed = true; return true; },
      release: async () => undefined,
    };
    await dispatchEvent({ DB: db }, d, payload, await sign(payload), SECRET);
    expect(claimed, "claiming an unroutable event makes its replay a duplicate").toBe(false);
  });

  it("records WHY, so the operator sees a cause rather than a count", async () => {
    // Two KNOWN apps claiming one object — the corruption case. (With only one
    // app registered this same payload parks as `unknown-app` instead, which is
    // the more actionable answer when the tag names nothing at all.)
    const { db, writes } = fakeDb();
    const payload = body({ app: "scena", kova_tenant: "t_1" });
    const d: RailDeps = {
      apps: [
        { slug: "kova", metadataPrefix: "kova", handle: async () => { throw new Error("must not run"); } },
        { slug: "scena", handle: async () => { throw new Error("must not run"); } },
      ],
      firstSeen: async () => true,
      release: async () => undefined,
    };
    const r = await dispatchEvent({ DB: db }, d, payload, await sign(payload), SECRET);
    expect(r.body).toMatchObject({ reason: "ambiguous" });
    expect(writes[0]!.args).toContain("ambiguous");
    expect(writes[0]!.args).toContain(JSON.stringify(["kova", "scena"]));
  });
});

describe("an app that recognises its own events by lookup", () => {
  // The regression this prevents is concrete: Kova's `invoice.paid` resolves the
  // tenant with `meta.kova_tenant ?? tenantByCustomer(db, obj.customer)`, so a
  // subscription invoice with no metadata is handled correctly TODAY. A
  // metadata-only rail would have parked it — turning a working path into a
  // dead-letter row on the day the rail shipped.
  const withClaims = (claims: RailDeps["apps"][number]["claims"], handled: string[]): RailDeps => ({
    apps: [{ slug: "kova", metadataPrefix: "kova", claims, handle: async () => { handled.push("kova"); } }],
    firstSeen: async () => true,
    release: async () => undefined,
  });

  it("routes a metadata-less event the app claims", async () => {
    const { db, writes } = fakeDb();
    const payload = JSON.stringify({ id: "evt_9", type: "invoice.paid", data: { object: { customer: "cus_1" } } });
    const handled: string[] = [];
    const r = await dispatchEvent({ DB: db }, withClaims(async () => true, handled), payload, await sign(payload), SECRET);
    expect(r.body).toMatchObject({ app: "kova", via: "claim" });
    expect(handled).toEqual(["kova"]);
    expect(writes, "a claimed event must not be parked").toEqual([]);
  });

  it("parks it when no app claims it", async () => {
    const { db, writes } = fakeDb();
    const payload = JSON.stringify({ id: "evt_9", type: "invoice.paid", data: { object: { customer: "cus_unknown" } } });
    const handled: string[] = [];
    const r = await dispatchEvent({ DB: db }, withClaims(async () => false, handled), payload, await sign(payload), SECRET);
    expect(r.body).toMatchObject({ parked: true, reason: "no-app-marker" });
    expect(handled).toEqual([]);
    expect(writes).toHaveLength(1);
  });

  it("is NOT consulted when metadata carries a contradiction", async () => {
    // A lookup that overruled an explicit tag is how a payment reaches the wrong
    // tenant. `claims` resolves silence, never disagreement.
    const { db } = fakeDb();
    const payload = body({ app: "not-an-app" });
    let asked = false;
    const handled: string[] = [];
    const d = withClaims(async () => { asked = true; return true; }, handled);
    const r = await dispatchEvent({ DB: db }, d, payload, await sign(payload), SECRET);
    expect(asked, "a claim must not override an explicit tag").toBe(false);
    expect(r.body).toMatchObject({ parked: true, reason: "unknown-app" });
  });

  it("refuses when two apps both claim the same event", async () => {
    const { db } = fakeDb();
    const payload = JSON.stringify({ id: "evt_9", type: "invoice.paid", data: { object: {} } });
    const d: RailDeps = {
      apps: [
        { slug: "kova", claims: async () => true, handle: async () => { throw new Error("must not run"); } },
        { slug: "scena", claims: async () => true, handle: async () => { throw new Error("must not run"); } },
      ],
      firstSeen: async () => true,
      release: async () => undefined,
    };
    expect((await dispatchEvent({ DB: db }, d, payload, await sign(payload), SECRET)).body).toMatchObject({ reason: "ambiguous" });
  });
});
