/**
 * THE RECALL, end to end.
 *
 * The scenario in one paragraph: on Tuesday a load comes out of the autoclave,
 * the machine printout and the chemical strip both pass, a qualified person
 * releases it, and the trays go on shelves. One is opened over a patient on
 * Wednesday. On Thursday the biological indicator comes back FAILED. What can
 * the clinic still reach, and what can it not?
 *
 * That last question is the product. Every test below exists because there is a
 * shortcut that would make the answer wrong in a way nobody would notice:
 * collapsing the three indicators into one boolean, letting the machine release
 * its own load, overwriting an indicator result, or reporting only the trays the
 * recall successfully froze.
 *
 * The harness makes every signed-in user a platform admin (`integration.test.ts`),
 * so the run/release permission split is not observable here — `access.ts` and
 * its comments carry that. What IS observable is the lifecycle, and that is what
 * these assert. Each test builds its own trays, because Miniflare gives every
 * test its own storage frame.
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
let recipeId = "";

const H = () => ({ "content-type": "application/json", origin, ...auth });
const post = (path: string, body: unknown) => SELF.fetch(`${origin}${path}`, { method: "POST", headers: H(), body: JSON.stringify(body) });
const get = (path: string) => SELF.fetch(`${origin}${path}`, { headers: auth });
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

let seq = 0;
/** A built tray, ready to go into a machine. */
async function tray(): Promise<string> {
  const u = await json<{ id: string }>(await post("/api/instruments", { catalogItemId: forcepsId, labelCode: `I-${++seq}` }));
  const p = await json<{ id: string }>(await post("/api/packs", { recipeId, labelCode: `T-${++seq}`, unitIds: [u.id] }));
  return p.id;
}

const packStatus = async (id: string): Promise<string | undefined> =>
  (await db().prepare("SELECT status FROM packs WHERE id = ?").bind(id).first<{ status: string }>())?.status;

/** Start a load, take it out with both fast indicators passing. */
async function runLoad(packIds: string[], opts: { requireBiological?: boolean } = {}): Promise<string> {
  const { id } = await json<{ id: string }>(await post("/api/cycles", { machine: "Autoclave 1", cycleNumber: "47", packIds, ...opts }));
  await post(`/api/cycles/${id}/end`, { physicalOk: true, chemicalOk: true });
  return id;
}

beforeAll(async () => {
  await ensureSchema(db());
  const email = "cycles@test.dev";
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
    body: JSON.stringify({ name: "Clinic", slug: "klinik" }),
  });
  jar = cookies(org) || jar;
  auth = { Cookie: jar };
  origin = "http://klinik.localhost:8787";

  forcepsId = (await json<{ id: string }>(await post("/api/catalog", { name: "Kelly forceps", tracking: "unit", kind: "instrument" }))).id;
  recipeId = (await json<{ id: string }>(await post("/api/recipes", { name: "Minor tray", sterileShelfDays: 180 }))).id;
});

describe("running a load", () => {
  it("commits the trays at START, so a load that fails mid-run still knows what was in it", async () => {
    const p = await tray();
    const { id } = await json<{ id: string }>(await post("/api/cycles", { machine: "Autoclave 1", packIds: [p] }));
    expect(await packStatus(p)).toBe("in_cycle");
    const detail = await json<{ packs: unknown[] }>(await get(`/api/cycles/${id}`));
    expect(detail.packs).toHaveLength(1);
  });

  it("refuses a tray that is already in another machine", async () => {
    const p = await tray();
    await post("/api/cycles", { machine: "Autoclave 1", packIds: [p] });
    const second = await post("/api/cycles", { machine: "Autoclave 2", packIds: [p] });
    expect(second.status).toBe(409);
    expect((await json<{ error: string }>(second)).error).toBe("not_ready");
  });

  it("brings the trays out AWAITING RELEASE, not usable", async () => {
    // The gap between `ended` and `released` is where a qualified person looks
    // at the evidence. Without it the autoclave is the releaser.
    const p = await tray();
    await runLoad([p]);
    expect(await packStatus(p)).toBe("awaiting_release");
  });
});

describe("Freigabe", () => {
  it("will not release a load that is still running", async () => {
    const p = await tray();
    const { id } = await json<{ id: string }>(await post("/api/cycles", { machine: "Autoclave 1", packIds: [p] }));
    const res = await post(`/api/cycles/${id}/release`, {});
    expect(res.status).toBe(409);
    expect((await json<{ reason: string }>(res)).reason).toBe("not_ended");
  });

  it("releases on the fast evidence and SAYS the biological is still out", async () => {
    const p = await tray();
    const id = await runLoad([p]);
    const res = await post(`/api/cycles/${id}/release`, {});
    expect(res.status).toBe(200);
    expect(await json<{ biologicalPending: boolean }>(res)).toMatchObject({ biologicalPending: true });
    expect(await packStatus(p)).toBe("sterile");
  });

  it("stamps the pack with an expiry and a NAMED releaser", async () => {
    // The date goes on a physical label; the name is the Freigabe. Neither is
    // derivable later, which is why both are written at the moment of release.
    const p = await tray();
    await post(`/api/cycles/${await runLoad([p])}/release`, {});
    const row = await db().prepare("SELECT expiry, released_by, released_at FROM packs WHERE id = ?").bind(p).first<{ expiry: string; released_by: string }>();
    expect(row?.expiry).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row?.released_by).toBeTruthy();
    // 180 days of sterile shelf life, from the day it came out of the machine.
    const days = Math.round((Date.parse(`${row!.expiry}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
    expect(days).toBe(180);
  });

  it("counts one more reprocessing cycle against every instrument in the tray", async () => {
    // MPBetreibV expects the service history to exist. `cycle_count` is what
    // makes an instrument different from a batch.
    const u = await json<{ id: string }>(await post("/api/instruments", { catalogItemId: forcepsId, labelCode: `CNT-${++seq}` }));
    const p = await json<{ id: string }>(await post("/api/packs", { recipeId, labelCode: `CNT-T-${++seq}`, unitIds: [u.id] }));
    await post(`/api/cycles/${await runLoad([p.id])}/release`, {});
    const row = await db().prepare("SELECT cycle_count FROM units WHERE id = ?").bind(u.id).first<{ cycle_count: number }>();
    expect(row?.cycle_count).toBe(1);
  });

  it("waits for the biological when the load was started as one that needs it", async () => {
    const p = await tray();
    const id = await runLoad([p], { requireBiological: true });
    const blocked = await post(`/api/cycles/${id}/release`, {});
    expect(blocked.status).toBe(409);
    expect((await json<{ reason: string }>(blocked)).reason).toBe("biological_pending");

    await post(`/api/cycles/${id}/biological`, { passed: true });
    expect((await post(`/api/cycles/${id}/release`, {})).status).toBe(200);
  });
});

describe("a load that fails at the door", () => {
  it("freezes every tray in it and never lets them reach a shelf", async () => {
    const p = await tray();
    const { id } = await json<{ id: string }>(await post("/api/cycles", { machine: "Autoclave 1", packIds: [p] }));
    const res = await post(`/api/cycles/${id}/end`, { physicalOk: true, chemicalOk: false });
    expect(await json<{ status: string; summary: { quarantined: number; unreachable: number } }>(res)).toMatchObject({
      status: "failed",
      summary: { quarantined: 1, unreachable: 0 },
    });
    expect(await packStatus(p)).toBe("quarantined");
  });

  it("refuses to release it afterwards", async () => {
    const p = await tray();
    const { id } = await json<{ id: string }>(await post("/api/cycles", { machine: "Autoclave 1", packIds: [p] }));
    await post(`/api/cycles/${id}/end`, { physicalOk: false, chemicalOk: true });
    const res = await post(`/api/cycles/${id}/release`, {});
    expect((await json<{ reason: string }>(res)).reason).toBe("cycle_failed");
  });
});

describe("THE RECALL — a biological that fails after release", () => {
  it("freezes what it can reach and NAMES what it cannot", async () => {
    /**
     * The whole product, in one test. Three trays released on Tuesday; one is
     * opened over a patient; on Thursday the spores turn out to have survived.
     *
     * The two frozen trays are the easy half. The opened one is the point: no
     * software action can undo it, so it is reported by name with the case
     * reference the clinic typed — the only thread back to a person, and one
     * Tessa deliberately cannot resolve (TESSA.md Rule 1).
     */
    const [a, b, used] = [await tray(), await tray(), await tray()];
    const id = await runLoad([a, b, used]);
    await post(`/api/cycles/${id}/release`, {});

    await db()
      .prepare("INSERT INTO cases (id, tenant_id, case_ref, status, opened_at, created_at) SELECT 'case_r', tenant_id, 'OP-2026-114', 'open', ?, ? FROM packs WHERE id = ?")
      .bind(new Date().toISOString(), new Date().toISOString(), used)
      .run();
    await post(`/api/packs/${used}/open`, { caseId: "case_r" });

    const res = await post(`/api/cycles/${id}/biological`, { passed: false });
    const body = await json<{
      outcome: string;
      summary: { quarantined: number; unreachable: number };
      unreachable: { id: string; caseId: string }[];
    }>(res);

    expect(body.outcome).toBe("recall");
    expect(body.summary).toMatchObject({ quarantined: 2, unreachable: 1 });
    expect(body.unreachable).toHaveLength(1);
    expect(body.unreachable[0]).toMatchObject({ id: used, caseId: "case_r" });

    expect(await packStatus(a)).toBe("quarantined");
    expect(await packStatus(b)).toBe("quarantined");
    // The opened one is untouched: it is finished, and pretending otherwise
    // would make the report look like it had done something about it.
    expect(await packStatus(used)).toBe("opened");
  });

  it("is a contained failure when nobody had released it yet", async () => {
    const p = await tray();
    const id = await runLoad([p]);
    const body = await json<{ outcome: string }>(await post(`/api/cycles/${id}/biological`, { passed: false }));
    expect(body.outcome).toBe("fail");
    expect(await packStatus(p)).toBe("quarantined");
  });

  it("REFUSES a second reading that disagrees, rather than overwriting it", async () => {
    // Last-write-wins would quietly rewrite the evidence a release was justified
    // by — the one thing an audit trail may never do.
    const p = await tray();
    const id = await runLoad([p]);
    await post(`/api/cycles/${id}/release`, {});
    await post(`/api/cycles/${id}/biological`, { passed: true });

    const res = await post(`/api/cycles/${id}/biological`, { passed: false });
    expect(res.status).toBe(409);
    expect((await json<{ reason: string }>(res)).reason).toBe("contradiction");
    // Nothing moved: the load is still released and the tray still on the shelf.
    expect(await packStatus(p)).toBe("sterile");
  });

  it("lets a person lift the quarantine — back to PACKED, never back to sterile", async () => {
    // The way out has to exist or people stop quarantining. What it must never
    // do is put a failed load on a shelf with one click, so a cleared tray lands
    // in "needs reprocessing", not "ready".
    const p = await tray();
    const id = await runLoad([p]);
    await post(`/api/cycles/${id}/biological`, { passed: false });
    expect(await packStatus(p)).toBe("quarantined");

    const { applyEvent } = await import("../src/ledger.js");
    const tenantId = (await db().prepare("SELECT tenant_id FROM packs WHERE id = ?").bind(p).first<{ tenant_id: string }>())!.tenant_id;
    const r = await applyEvent(db(), { tenantId, actorUserId: "usr", event: "cleared", trackedKind: "pack", trackedId: p, note: "re-run" });
    expect(r.ok).toBe(true);
    expect(await packStatus(p)).toBe("packed");
  });
});

describe("the recall report", () => {
  it("is re-openable afterwards, and still names the unreachable tray", async () => {
    // A recall is a document a clinic works through over days and hands to an
    // inspector, not a toast that appeared once.
    const [shelf, used] = [await tray(), await tray()];
    const id = await runLoad([shelf, used]);
    await post(`/api/cycles/${id}/release`, {});
    await post(`/api/packs/${used}/open`, {});
    await post(`/api/cycles/${id}/biological`, { passed: false });

    const report = await json<{
      summary: { quarantined: number; unreachable: number };
      packs: { id: string; disposition: string }[];
      instruments: { unit_id: string }[];
    }>(await get(`/api/trace/cycle/${id}`));

    expect(report.summary).toMatchObject({ unreachable: 1 });
    expect(report.packs.find((p) => p.id === used)?.disposition).toBe("unreachable");
    // …and the instruments, which outlive the trays they were in.
    expect(report.instruments.length).toBe(2);
  });
});
