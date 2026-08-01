/**
 * CASES, AND THE TRACE READ BACKWARDS.
 *
 * The recall runs forwards: a load failed, which trays came out of it. This file
 * covers the other direction — this procedure happened, what went into it, and
 * was any of it from a load that has since failed.
 *
 * The last question is the one worth building for. A case closed on Tuesday was
 * correct on Tuesday; on Thursday a load it drew from fails, and the same rows
 * now mean something different. Nothing about the case changed — the evidence
 * around it did.
 *
 * Also here: the two ways a case reference goes wrong quietly. An id from
 * another tenant writes a foreign key that resolves to nothing, and a closed
 * case absorbing writes makes "closed" mean nothing. Both are invisible at the
 * moment they happen and only surface when someone needs the record.
 *
 * Each test builds its own case — Miniflare gives every test its own storage
 * frame, so a row written inside `it(...)` is invisible to the next one.
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
let gauzeId = "";
let forcepsId = "";
let recipeId = "";
let binId = "";

const H = () => ({ "content-type": "application/json", origin, ...auth });
const post = (path: string, body: unknown) => SELF.fetch(`${origin}${path}`, { method: "POST", headers: H(), body: JSON.stringify(body) });
const get = (path: string) => SELF.fetch(`${origin}${path}`, { headers: auth });
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

let seq = 0;
const openCase = async (ref = `OP-${++seq}`): Promise<string> => (await json<{ id: string }>(await post("/api/cases", { caseRef: ref }))).id;

/** A lot of gauze on the shelf, ready to be consumed into a case. */
async function gauzeLot(): Promise<string> {
  const r = await json<{ lotId: string }>(
    await post("/api/stock/receive", { catalogItemId: gauzeId, locationId: binId, quantity: 20, lotCode: `L-${++seq}` }),
  );
  return r.lotId;
}

/** A released tray, on the shelf, from a load that PASSED everything. */
async function releasedTray(): Promise<{ packId: string; cycleId: string }> {
  const u = await json<{ id: string }>(await post("/api/instruments", { catalogItemId: forcepsId, labelCode: `I-${++seq}` }));
  const p = await json<{ id: string }>(await post("/api/packs", { recipeId, labelCode: `T-${++seq}`, unitIds: [u.id] }));
  const cy = await json<{ id: string }>(await post("/api/cycles", { machine: "Autoclave 1", packIds: [p.id] }));
  await post(`/api/cycles/${cy.id}/end`, { physicalOk: true, chemicalOk: true });
  await post(`/api/cycles/${cy.id}/release`, {});
  return { packId: p.id, cycleId: cy.id };
}

beforeAll(async () => {
  await ensureSchema(db());
  const email = "cases@test.dev";
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
    body: JSON.stringify({ name: "Praxis", slug: "praxis" }),
  });
  jar = cookies(org) || jar;
  auth = { Cookie: jar };
  origin = "http://praxis.localhost:8787";

  binId = (await json<{ id: string }>(await post("/api/locations", { name: "Theatre 1", kind: "room" }))).id;
  gauzeId = (await json<{ id: string }>(await post("/api/catalog", { name: "Sterile gauze", tracking: "lot", consumption: "discrete" }))).id;
  forcepsId = (await json<{ id: string }>(await post("/api/catalog", { name: "Kelly forceps", tracking: "unit", kind: "instrument" }))).id;
  recipeId = (await json<{ id: string }>(await post("/api/recipes", { name: "Minor tray", sterileShelfDays: 180 }))).id;
});

describe("opening a case", () => {
  it("needs a reference, because a case without one attaches to nothing", async () => {
    const res = await post("/api/cases", { procedureCode: "EXT-3" });
    expect(res.status).toBe(400);
  });

  it("holds a reference and a code, and nothing about a person", async () => {
    // TESSA.md Rule 1, at the table where the temptation is strongest. The
    // schema-level guarantee is in `conformance.test.ts`; this is the route
    // half — there is no field to put a name in.
    const id = await openCase("OP-2026-500");
    const { case: row } = await json<{ case: Record<string, unknown> }>(await get(`/api/cases/${id}`));
    expect(row).toMatchObject({ case_ref: "OP-2026-500", status: "open" });
    expect(Object.keys(row).join(" ")).not.toMatch(/name|birth|diagnos/);
  });
});

describe("logging against a case", () => {
  it("collects what was consumed AND what was opened, on one record", async () => {
    const caseId = await openCase();
    const lot = await gauzeLot();
    const { packId } = await releasedTray();

    await post(`/api/stock/${lot}/use`, { quantity: 3, caseId });
    await post(`/api/packs/${packId}/open`, { caseId });

    const { lines } = await json<{ lines: { event: string; tracked_kind: string }[] }>(await get(`/api/cases/${caseId}`));
    // The gauze, the tray, and the instrument that came back out of the tray.
    expect(lines.filter((l) => l.tracked_kind === "lot" && l.event === "consumed")).toHaveLength(1);
    expect(lines.filter((l) => l.tracked_kind === "pack" && l.event === "opened")).toHaveLength(1);
    expect(lines.filter((l) => l.tracked_kind === "unit")).toHaveLength(1);
  });

  it("refuses a case id that isn't this tenant's, instead of writing it", async () => {
    /**
     * Nothing stops a caller sending an id read somewhere else. It leaks nothing
     * — every read is tenant-scoped — but it writes a foreign key that resolves
     * to nothing, so the trace for that procedure is quietly incomplete forever.
     */
    const lot = await gauzeLot();
    const res = await post(`/api/stock/${lot}/use`, { quantity: 1, caseId: "cas_someone_else" });
    expect(res.status).toBe(404);
    expect((await json<{ reason: string }>(res)).reason).toBe("unknown_case");
    // And nothing was consumed: the refusal comes before the ledger.
    const q = await db().prepare("SELECT quantity FROM lots WHERE id = ?").bind(lot).first<{ quantity: number }>();
    expect(q?.quantity).toBe(20);
  });
});

describe("closing, and the amendment nobody plans for", () => {
  it("refuses new lines once closed — otherwise 'closed' means nothing", async () => {
    const caseId = await openCase();
    const lot = await gauzeLot();
    await post(`/api/cases/${caseId}/close`, {});

    const res = await post(`/api/stock/${lot}/use`, { quantity: 1, caseId });
    expect(res.status).toBe(409);
    expect((await json<{ reason: string }>(res)).reason).toBe("case_closed");
  });

  it("lets a person reopen it, and COUNTS that it happened", async () => {
    // Somebody remembers a gauze pack twenty minutes later. Refusing outright
    // makes the record wrong; absorbing it silently makes closing meaningless.
    // The count is what tells an auditor this record was amended.
    const caseId = await openCase();
    const lot = await gauzeLot();
    await post(`/api/cases/${caseId}/close`, {});
    expect(await json<{ reopenCount: number }>(await post(`/api/cases/${caseId}/reopen`, {}))).toMatchObject({ reopenCount: 1 });

    expect((await post(`/api/stock/${lot}/use`, { quantity: 1, caseId })).status).toBe(200);
    const trace = await json<{ amended: boolean }>(await get(`/api/trace/case/${caseId}`));
    expect(trace.amended).toBe(true);
  });

  it("keeps the ORIGINAL close time through a reopen", async () => {
    // It is the marker of when the first record stopped. Clearing it would make
    // "amended" true with nothing to say amended after what.
    const caseId = await openCase();
    await post(`/api/cases/${caseId}/close`, {});
    const first = (await db().prepare("SELECT closed_at FROM cases WHERE id = ?").bind(caseId).first<{ closed_at: string }>())!.closed_at;
    await post(`/api/cases/${caseId}/reopen`, {});
    const after = await db().prepare("SELECT closed_at, status FROM cases WHERE id = ?").bind(caseId).first<{ closed_at: string; status: string }>();
    expect(after).toMatchObject({ closed_at: first, status: "open" });
  });

  it("refuses to close twice or reopen what is open", async () => {
    const caseId = await openCase();
    expect((await post(`/api/cases/${caseId}/reopen`, {})).status).toBe(409);
    await post(`/api/cases/${caseId}/close`, {});
    expect((await post(`/api/cases/${caseId}/close`, {})).status).toBe(409);
  });

  it("records WHO closed it", async () => {
    // A close with no name is an assertion nobody made — TESSA.md Rule 2.
    const caseId = await openCase();
    await post(`/api/cases/${caseId}/close`, {});
    const row = await db().prepare("SELECT closed_by FROM cases WHERE id = ?").bind(caseId).first<{ closed_by: string }>();
    expect(row?.closed_by).toBeTruthy();
  });
});

describe("the reverse trace", () => {
  it("flags a tray this case used whose load HAS SINCE FAILED", async () => {
    /**
     * The whole reason the endpoint exists. On Tuesday this case was correct and
     * closed. On Thursday the spore test from the load it drew from comes back
     * positive, and the same rows now mean something else. Nothing about the
     * case changed — only the evidence around it — so only a query that joins
     * the two can say so.
     */
    const caseId = await openCase("OP-CONCERN");
    const { packId, cycleId } = await releasedTray();
    await post(`/api/packs/${packId}/open`, { caseId });
    await post(`/api/cases/${caseId}/close`, {});

    // Clean at close time.
    const before = await json<{ concerns: unknown[] }>(await get(`/api/trace/case/${caseId}`));
    expect(before.concerns).toHaveLength(0);

    // Thursday.
    await post(`/api/cycles/${cycleId}/biological`, { passed: false });

    const after = await json<{ concerns: { packId: string; cycleId: string }[] }>(await get(`/api/trace/case/${caseId}`));
    expect(after.concerns).toHaveLength(1);
    expect(after.concerns[0]).toMatchObject({ packId, cycleId });
  });

  it("names the instruments that were in the tray, not just the tray", async () => {
    // An instrument outlives the tray it was in, which is what makes "has this
    // forceps been in a case that is now in doubt" answerable at all.
    const caseId = await openCase();
    const { packId } = await releasedTray();
    await post(`/api/packs/${packId}/open`, { caseId });
    const trace = await json<{ instruments: { unit_id: string; label_code: string }[] }>(await get(`/api/trace/case/${caseId}`));
    expect(trace.instruments).toHaveLength(1);
    expect(trace.instruments[0]!.label_code).toMatch(/^I-/);
  });

  it("stays quiet about a load that passed", async () => {
    const caseId = await openCase();
    const { packId, cycleId } = await releasedTray();
    await post(`/api/packs/${packId}/open`, { caseId });
    await post(`/api/cycles/${cycleId}/biological`, { passed: true });
    expect((await json<{ concerns: unknown[] }>(await get(`/api/trace/case/${caseId}`))).concerns).toHaveLength(0);
  });
});
