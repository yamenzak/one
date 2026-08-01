/**
 * THE CSSD LOOP, over real HTTP.
 *
 * An instrument goes clean → into a tray → through a procedure → dirty →
 * reprocessed → clean. The loop is the reason Tessa has three identity
 * granularities instead of one, and every assertion here is about a way the loop
 * can be broken so quietly that the app still looks right:
 *
 *   an instrument in two trays at once
 *   an instrument still marked `packed` in a tray that was used an hour ago
 *   an instrument going from a patient back into a tray without reprocessing
 *   a tray built from instruments that were never cleaned
 *
 * Each of those produces a database that reads perfectly and describes a
 * building that does not exist.
 *
 * The harness makes every signed-in user a platform admin (see
 * `integration.test.ts`), so permission gates are not observable here; what is
 * observable is behaviour, and that is what these assert. Each test also builds
 * its own instruments, because a row written inside `it(...)` is invisible to
 * the next test (Miniflare gives each one its own storage frame).
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
let forcepsId = "";
let scalpelId = "";
let recipeId = "";
let binId = "";

const H = () => ({ "content-type": "application/json", origin, ...auth });
const post = (path: string, body: unknown) => SELF.fetch(`${origin}${path}`, { method: "POST", headers: H(), body: JSON.stringify(body) });
const get = (path: string) => SELF.fetch(`${origin}${path}`, { headers: auth });

/** Register an instrument and hand back its id. Label codes must be unique. */
let seq = 0;
async function instrument(catalogItemId = forcepsId): Promise<string> {
  const res = await post("/api/instruments", { catalogItemId, labelCode: `INS-${++seq}`, locationId: binId });
  const body = (await res.json()) as { id: string };
  return body.id;
}

const unitStatus = async (id: string): Promise<string | undefined> =>
  (await db().prepare("SELECT status FROM units WHERE id = ?").bind(id).first<{ status: string }>())?.status;

/** Build a tray from freshly-registered instruments. */
async function tray(count = 2): Promise<{ status: number; id: string; units: string[]; shortfall: { wanted: number; have: number }[] }> {
  const units = [];
  for (let i = 0; i < count; i++) units.push(await instrument());
  const res = await post("/api/packs", { recipeId, labelCode: `TRAY-${++seq}`, locationId: binId, unitIds: units });
  const body = (await res.json().catch(() => ({}))) as { id: string; shortfall: { wanted: number; have: number }[] };
  return { status: res.status, units, ...body };
}

beforeAll(async () => {
  await ensureSchema(db());
  const email = "packs@test.dev";
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
    body: JSON.stringify({ name: "Centre", slug: "centre" }),
  });
  jar = cookies(org) || jar;
  auth = { Cookie: jar };
  origin = "http://centre.localhost:8787";

  binId = ((await (await post("/api/locations", { name: "CSSD", kind: "room" })).json()) as { id: string }).id;
  forcepsId = ((await (await post("/api/catalog", { name: "Kelly forceps 14cm", tracking: "unit", kind: "instrument", reprocessingClass: "kritisch_a" })).json()) as { id: string }).id;
  scalpelId = ((await (await post("/api/catalog", { name: "Scalpel handle #3", tracking: "unit", kind: "instrument" })).json()) as { id: string }).id;

  // "Two forceps and a scalpel handle" — so a two-forceps build is short.
  recipeId = ((await (await post("/api/recipes", {
    name: "Minor surgery tray",
    sterileShelfDays: 180,
    items: [{ catalogItemId: forcepsId, quantity: 2 }, { catalogItemId: scalpelId, quantity: 1 }],
  })).json()) as { id: string }).id;
});

describe("registering an instrument", () => {
  it("starts life clean, with no cycles on it", async () => {
    const id = await instrument();
    const row = await db().prepare("SELECT status, cycle_count FROM units WHERE id = ?").bind(id).first<{ status: string; cycle_count: number }>();
    expect(row).toMatchObject({ status: "clean", cycle_count: 0 });
  });

  it("refuses a duplicate label code", async () => {
    // The code is what gets scanned. Two instruments answering to one code makes
    // every history downstream — cycles, service, the recall — attach to
    // whichever row the query happened to return.
    await post("/api/instruments", { catalogItemId: forcepsId, labelCode: "DUP-1" });
    const second = await post("/api/instruments", { catalogItemId: forcepsId, labelCode: "DUP-1" });
    expect(second.status).toBe(409);
  });
});

describe("building a tray", () => {
  it("packs the tray and every instrument in it, in one act", async () => {
    const t = await tray(2);
    expect(t.status).toBe(201);
    expect(await unitStatus(t.units[0]!)).toBe("packed");
    expect(await unitStatus(t.units[1]!)).toBe("packed");
  });

  it("REPORTS what the recipe wanted and did not get, without refusing", async () => {
    // A centre legitimately builds variants, and an app that blocks the build is
    // an app people assemble trays beside instead of inside. So the difference
    // is surfaced and recorded — TESSA.md Rule 2 — and the person decides.
    const t = await tray(2); // recipe wants 2 forceps AND a scalpel handle
    expect(t.status).toBe(201);
    expect(t.shortfall).toEqual([{ catalogItemId: scalpelId, wanted: 1, have: 0 }]);

    // …and it is in the ledger, where an auditor looks, not only in the reply.
    const meta = await db().prepare("SELECT meta_json FROM ledger WHERE tracked_id = ? AND event = 'packed'").bind(t.id).first<{ meta_json: string }>();
    expect(JSON.parse(meta!.meta_json)).toMatchObject({ shortfall: [{ have: 0 }] });
  });

  it("refuses an instrument that is not clean, and says which", async () => {
    // `applyEvents` would happily pack a dirty instrument — it only refuses what
    // is finished or frozen — so this rule lives in the route, and its absence
    // would put an unreprocessed instrument into a sterile tray.
    const dirty = await instrument();
    await db().prepare("UPDATE units SET status = 'dirty' WHERE id = ?").bind(dirty).run();
    const clean = await instrument();
    const res = await post("/api/packs", { recipeId, labelCode: "TRAY-DIRTY", unitIds: [clean, dirty] });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; instruments: { id: string; status: string }[] };
    expect(body.error).toBe("not_clean");
    expect(body.instruments).toEqual([{ id: dirty, labelCode: expect.any(String), status: "dirty" }]);
    // The clean one is untouched: refused whole, not half-built.
    expect(await unitStatus(clean)).toBe("clean");
  });

  it("refuses the same instrument listed twice", async () => {
    const u = await instrument();
    const res = await post("/api/packs", { recipeId, labelCode: "TRAY-TWICE", unitIds: [u, u] });
    expect(res.status).toBe(400);
    expect(await unitStatus(u)).toBe("clean");
  });

  it("cannot put one instrument into two trays being built at once", async () => {
    /**
     * Two people in the CSSD room reaching for the same forceps. Exactly one
     * build may win, and the loser must leave nothing behind — the pack row is
     * written before the chokepoint runs, so a refusal has to take it back out.
     * An orphan tray with no members shows up in pick lists and cannot be opened.
     *
     * Which refusal the loser gets depends on how the two interleave: it either
     * sees the instrument already `packed` during validation (409 `not_clean`,
     * before any row is written) or loses its compare-and-set inside the
     * chokepoint (409 `conflict`, after — the path that needs the cleanup). Both
     * are correct; the assertion is the invariant that holds under either.
     */
    const shared = await instrument();
    const other = await instrument();
    const [a, b] = await Promise.all([
      post("/api/packs", { recipeId, labelCode: "TRAY-RACE-A", unitIds: [shared, other] }),
      post("/api/packs", { recipeId, labelCode: "TRAY-RACE-B", unitIds: [shared] }),
    ]);
    expect([a.status, b.status].filter((s) => s === 201)).toHaveLength(1);

    const packs = await db().prepare("SELECT COUNT(*) AS n FROM packs WHERE label_code IN ('TRAY-RACE-A', 'TRAY-RACE-B')").first<{ n: number }>();
    expect(packs?.n).toBe(1);
    // …and the instrument is in exactly one member list, not two.
    const members = await db().prepare("SELECT COUNT(*) AS n FROM pack_members WHERE unit_id = ?").bind(shared).first<{ n: number }>();
    expect(members?.n).toBe(1);
  });
});

describe("an instrument inside a tray", () => {
  it("cannot be reprocessed or retired where it stands", async () => {
    // Otherwise the tray's member list keeps naming an instrument that is no
    // longer in it — and the recall reads that list.
    const t = await tray(2);
    const res = await post(`/api/instruments/${t.units[0]}/clean`, {});
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/Open the tray first/);
    expect(await unitStatus(t.units[0]!)).toBe("packed");
  });

  it("is listed as a member, with its own label", async () => {
    const t = await tray(2);
    const detail = (await (await get(`/api/packs/${t.id}`)).json()) as { members: { unit_id: string; status: string }[] };
    expect(detail.members).toHaveLength(2);
    expect(detail.members.map((m) => m.unit_id).sort()).toEqual([...t.units].sort());
  });
});

describe("opening a tray", () => {
  it("finishes the pack and returns every instrument to the DIRTY pool", async () => {
    // The heart of the loop. `dirty`, never `clean`: reprocessing is an act
    // somebody performs and records, and short-cutting it here is how an
    // instrument goes from a patient straight into the next tray.
    const t = await tray(2);
    const res = await post(`/api/packs/${t.id}/open`, {});
    expect(res.status).toBe(200);
    expect((await res.json()) as { returned: number }).toMatchObject({ returned: 2 });
    expect(await unitStatus(t.units[0]!)).toBe("dirty");
    expect(await unitStatus(t.units[1]!)).toBe("dirty");
    const pack = await db().prepare("SELECT status FROM packs WHERE id = ?").bind(t.id).first<{ status: string }>();
    expect(pack?.status).toBe("opened");
  });

  it("cannot be opened twice", async () => {
    // A sterile pack is single-use on opening, so the second attempt is a sign
    // someone is looking at the wrong tray — worth an error, not a shrug.
    const t = await tray(1);
    await post(`/api/packs/${t.id}/open`, {});
    const second = await post(`/api/packs/${t.id}/open`, {});
    expect(second.status).toBe(409);
  });

  it("records the case it was opened for, on the pack AND on every instrument", async () => {
    // The trace runs both ways: from a case to what was used, and from an
    // instrument to the cases it has been through.
    const t = await tray(1);
    const caseId = "case_1";
    await db()
      .prepare("INSERT INTO cases (id, tenant_id, case_ref, status, opened_at, created_at) SELECT ?, tenant_id, 'OP-1', 'open', ?, ? FROM packs WHERE id = ?")
      .bind(caseId, new Date().toISOString(), new Date().toISOString(), t.id)
      .run();
    await post(`/api/packs/${t.id}/open`, { caseId });

    const rows = await db().prepare("SELECT tracked_kind FROM ledger WHERE case_id = ?").bind(caseId).all<{ tracked_kind: string }>();
    expect((rows.results ?? []).map((r) => r.tracked_kind).sort()).toEqual(["pack", "unit"]);
  });

  it("reprocessing an instrument afterwards closes the loop", async () => {
    const t = await tray(1);
    await post(`/api/packs/${t.id}/open`, {});
    const res = await post(`/api/instruments/${t.units[0]}/clean`, {});
    expect(res.status).toBe(200);
    expect(await unitStatus(t.units[0]!)).toBe("clean");
  });
});
