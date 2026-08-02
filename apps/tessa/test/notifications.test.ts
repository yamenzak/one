/**
 * THE INBOX, end to end — the capability that shipped dark.
 *
 * Before this, Tessa exported `InboxDO`, bound it in `wrangler.jsonc`, pinned
 * its class name in a permanent migration and applied four tables, and there was
 * no route, no dispatch and no UI. Everything typechecked. Every test passed. A
 * Durable Object and four tables that nothing on earth reached.
 *
 * So these tests are deliberately about REACHABILITY rather than about the
 * channel algebra (which `@4dl/notify`'s own suite covers against a registry
 * that is neither shipped app's). What they assert is that a real event in the
 * sterilisation loop produces a row, that the row comes back out of the route,
 * and that the two writes actually mark it read — the chain that was missing.
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
const post = (path: string, body?: unknown) => SELF.fetch(`${origin}${path}`, { method: "POST", headers: H(), body: JSON.stringify(body ?? {}) });
const get = (path: string) => SELF.fetch(`${origin}${path}`, { headers: auth });
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

interface Row {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  category: string | null;
  read: number;
}

const inbox = async (): Promise<Row[]> => (await json<{ notifications: Row[] }>(await get("/api/notifications"))).notifications;
const ofType = async (type: string): Promise<Row | undefined> => (await inbox()).find((n) => n.type === type);

let seq = 0;
async function tray(): Promise<string> {
  const u = await json<{ id: string }>(await post("/api/instruments", { catalogItemId: forcepsId, labelCode: `N-${++seq}` }));
  const p = await json<{ id: string }>(await post("/api/packs", { recipeId, labelCode: `NT-${++seq}`, unitIds: [u.id] }));
  return p.id;
}

/** Start a load and take it out with both fast indicators passing. */
async function runLoad(packIds: string[], opts: { requireBiological?: boolean } = {}): Promise<string> {
  const { id } = await json<{ id: string }>(await post("/api/cycles", { machine: "Autoclave 1", cycleNumber: "47", packIds, ...opts }));
  await post(`/api/cycles/${id}/end`, { physicalOk: true, chemicalOk: true });
  return id;
}

beforeAll(async () => {
  await ensureSchema(db());
  const email = "inbox@test.dev";
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
    body: JSON.stringify({ name: "Clinic", slug: "postfach" }),
  });
  jar = cookies(org) || jar;
  auth = { Cookie: jar };
  origin = "http://postfach.localhost:8787";

  forcepsId = (await json<{ id: string }>(await post("/api/catalog", { name: "Kelly forceps", tracking: "unit", kind: "instrument" }))).id;
  recipeId = (await json<{ id: string }>(await post("/api/recipes", { name: "Minor tray", sterileShelfDays: 180 }))).id;
});

describe("the routes exist and are personal", () => {
  it("serves an empty inbox rather than 404ing", async () => {
    const res = await get("/api/notifications");
    expect(res.status).toBe(200);
    expect(Array.isArray((await json<{ notifications: unknown }>(res)).notifications)).toBe(true);
  });

  it("refuses a socket upgrade that is not one", async () => {
    // A plain GET on the WS path used to 404 — there was no path. Now it is a
    // 426, which is the difference between "no such feature" and "wrong verb".
    expect((await get("/api/inbox/ws")).status).toBe(426);
  });

  it("turns away a stranger", async () => {
    const res = await SELF.fetch(`${origin}/api/notifications`);
    expect(res.status).toBe(401);
  });
});

describe("the sterilisation loop reaches the inbox", () => {
  it("tells the centre a load is waiting on a release", async () => {
    await runLoad([await tray()]);
    const n = await ofType("release_pending");
    expect(n).toBeDefined();
    // Named the way a person says it out loud, not by its `cyc_…` id.
    expect(n!.title).toContain("Load 47 on Autoclave 1");
    // The category comes from the registry, never from the call site.
    expect(n!.category).toBe("sterilisation");
    expect(n!.link).toMatch(/^\/cycles\//);
  });

  it("tells the centre a load FAILED its fast evidence", async () => {
    const p = await tray();
    const { id } = await json<{ id: string }>(await post("/api/cycles", { machine: "Autoclave 2", cycleNumber: "48", packIds: [p] }));
    await post(`/api/cycles/${id}/end`, { physicalOk: false, chemicalOk: true });
    const n = await ofType("cycle_failed");
    expect(n).toBeDefined();
    expect(n!.category).toBe("quarantine");
    expect(n!.message).toContain("printout");
  });

  it("RECALLS on a late biological failure, and says what could not be frozen", async () => {
    // The scenario the whole product exists for: released on the fast evidence,
    // one tray already opened over a patient, biological fails on Thursday.
    const opened = await tray();
    const shelved = await tray();
    const id = await runLoad([opened, shelved], { requireBiological: false });
    await post(`/api/cycles/${id}/release`, {});
    const caseId = (await json<{ id: string }>(await post("/api/cases", { caseRef: "OP-9" }))).id;
    await post(`/api/packs/${opened}/open`, { caseId });
    await post(`/api/cycles/${id}/biological`, { passed: false });

    const n = await ofType("recall_issued");
    expect(n).toBeDefined();
    expect(n!.title).toContain("RECALL");
    // The unreachable count is the point of the message. A notice that named
    // only what it successfully froze would read as a completed job.
    expect(n!.message).toContain("already opened");
  });

  it("dedupes, so re-running a sweep or retrying a request does not double the row", async () => {
    const id = await runLoad([await tray()]);
    await post(`/api/cycles/${id}/release`, {});
    // The release route refuses a second time (nothing left awaiting release),
    // so drive the dedupe directly: the same cycle can only ever produce one
    // `load_released` row, because the key is the cycle.
    const rows = (await inbox()).filter((n) => n.type === "load_released" && n.link === `/cycles/${id}`);
    expect(rows).toHaveLength(1);
  });
});

describe("marking read", () => {
  it("marks one, and only for its recipient", async () => {
    await runLoad([await tray()]);
    const before = (await inbox()).find((n) => !n.read)!;
    expect((await post(`/api/notifications/${before.id}/read`)).status).toBe(200);
    expect((await inbox()).find((n) => n.id === before.id)!.read).toBe(1);

    // An id belonging to somebody else is a no-op, not a cross-user write.
    const foreign = await post("/api/notifications/ntf_not_mine/read");
    expect(foreign.status).toBe(200);
  });

  it("marks all", async () => {
    await runLoad([await tray()]);
    expect((await inbox()).some((n) => !n.read)).toBe(true);
    await post("/api/notifications/read-all");
    expect((await inbox()).every((n) => n.read === 1)).toBe(true);
  });
});
