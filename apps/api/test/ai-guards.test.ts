/**
 * Two correctness guards, integration-tested on the Miniflare workers pool.
 *
 * 1. `ai.mock = "on"` must never fabricate output outside development. It used
 *    to short-circuit BOTH the environment gate and the vision-image refusal, so
 *    one click in the admin console made production return invented clinical lab
 *    markers that pre-filled a coach's review sheet — and billed the tenant
 *    credits for them.
 *
 * 2. The weekly training-load target must have exactly ONE authoritative store.
 *    `targets_json.weeklyTrainingLoad` (coach-written, has a UI) and the
 *    `weekly_load_target` column (pinned at a hardcoded 300, never sent by any
 *    client) used to disagree, so a coach who set 900 got a Train tab showing
 *    900, a recovery score graded against 300, and an AI coach note praising the
 *    client against 300.
 *
 * ── Reaching "production" in this harness ────────────────────────────────────
 * `vitest.config.ts` pins `ENVIRONMENT: "development"` for every binding set,
 * and that is load-bearing for the rest of the suite (platform-admin fail-open,
 * the mock mailer that delivers sign-in OTPs). Mutating the `env` object from
 * `cloudflare:test` does NOT reach the Worker — verified: the route still
 * behaved as development. What DOES work is invoking the default export directly
 * with our own env object, so `prodFetch` below spreads the real bindings and
 * overrides `ENVIRONMENT`. No separate vitest project needed.
 */

import { createExecutionContext, env, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WEEKLY_LOAD_TARGET, resolveUnits } from "@mossa/domain";
import worker from "../src/index.js";
import { ensureSchema } from "../src/db.js";
import { buildClientContext } from "../src/ai-context.js";
import type { KnowledgeClient } from "../src/client-knowledge.js";

const ORIGIN = "http://localhost:8787"; // treated as local by createAuth (non-secure cookies)
const OWNER_EMAIL = "aiguard-owner@test.dev";

let ownerCookie = "";
let tenantId = "";
let clientId = "";
let labId = "";
let labFileKey = "";

/** Extract the Better Auth session cookie(s) from a Set-Cookie header list. */
function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
}

/** Full passwordless sign-in: request OTP, read it from D1, verify, create org.
 *  (Same ceremony as api.test.ts — must run while ENVIRONMENT=development, as
 *  the mock mailer fails closed anywhere else.) */
async function signInFlow(email: string, studioName: string): Promise<string> {
  const db = env.DB as D1Database;
  await SELF.fetch(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db
    .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
    .bind(`%otp%${email}%`)
    .first<{ value: string }>();
  const fallback = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? fallback?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  const verify = await SELF.fetch(`${ORIGIN}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, otp }),
  });
  let cookies = grabCookies(verify);
  const org = await SELF.fetch(`${ORIGIN}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, Cookie: cookies },
    body: JSON.stringify({ name: studioName, slug: studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) cookies = refreshed;
  return cookies;
}

const auth = (cookies: string) => ({ Cookie: cookies, origin: ORIGIN });
const H = () => ({ "content-type": "application/json", ...auth(ownerCookie) });

/** The same worker, same D1/DO/R2 bindings, but ENVIRONMENT=production.
 *  `ADMIN_EMAILS` is set explicitly because the platform-admin fail-open is
 *  itself dev-gated — without it every /admin route would 403 for an unrelated
 *  reason and the assertions below would pass vacuously. */
function prodEnv(): never {
  return { ...(env as unknown as Record<string, unknown>), ENVIRONMENT: "production", ADMIN_EMAILS: OWNER_EMAIL } as never;
}

async function prodFetch(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${ORIGIN}${path}`, init), prodEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const balance = async (): Promise<number> => {
  const b = (await (await SELF.fetch(`${ORIGIN}/api/billing`, { headers: auth(ownerCookie) })).json()) as { balance: { balance: number } };
  return b.balance.balance;
};

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
  // Force the mock lane on, exactly as an admin would. This is the dangerous
  // stored state both halves of the first suite are about.
  await (env.DB as D1Database)
    .prepare("INSERT INTO app_config (key, value) VALUES ('ai.mock', 'on') ON CONFLICT(key) DO UPDATE SET value = 'on'")
    .run();
  ownerCookie = await signInFlow(OWNER_EMAIL, "Guard Studio");
  const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
  tenantId = ctx.active.tenantId;
  // `studio` comps enough credits that a debit is measurable and opens aiSuite.
  await SELF.fetch(`${ORIGIN}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: H(), body: JSON.stringify({ planId: "studio" }) });

  const created = (await (
    await SELF.fetch(`${ORIGIN}/api/clients`, { method: "POST", headers: H(), body: JSON.stringify({ displayName: "Guard Client" }) })
  ).json()) as { client: { id: string } };
  clientId = created.client.id;

  // A lab test with an uploaded report — the input lab-extract needs.
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "labs.jpg");
  fd.append("purpose", "lab");
  fd.append("clientId", clientId);
  const up = await SELF.fetch(`${ORIGIN}/api/media/upload`, { method: "POST", headers: auth(ownerCookie), body: fd });
  labFileKey = ((await up.json()) as { key: string }).key;
  const lab = (await (
    await SELF.fetch(`${ORIGIN}/api/labs`, { method: "POST", headers: H(), body: JSON.stringify({ clientId, type: "blood_panel" }) })
  ).json()) as { id?: string; lab?: { id: string } };
  labId = lab.id ?? lab.lab!.id;
  await SELF.fetch(`${ORIGIN}/api/labs/${labId}/upload`, { method: "POST", headers: H(), body: JSON.stringify({ clientId, fileKey: labFileKey }) });
});

describe('ai.mock = "on" cannot fabricate data outside development', () => {
  it("the admin write path refuses to persist mockMode=on in production, but allows it in dev", async () => {
    const prod = await prodFetch("/api/admin/ai/config", { method: "POST", headers: H(), body: JSON.stringify({ mockMode: "on" }) });
    expect(prod.status).toBe(400);
    expect(((await prod.json()) as { error: string }).error).toMatch(/outside development/i);
    // Non-dangerous modes are still settable in production.
    const auto = await prodFetch("/api/admin/ai/config", { method: "POST", headers: H(), body: JSON.stringify({ mockMode: "auto" }) });
    expect(auto.status).toBe(200);
    // And dev is unaffected — this is an environment gate, not a blanket ban.
    const dev = await SELF.fetch(`${ORIGIN}/api/admin/ai/config`, { method: "POST", headers: H(), body: JSON.stringify({ mockMode: "on" }) });
    expect(dev.status).toBe(200);
    const stored = await (env.DB as D1Database).prepare("SELECT value FROM app_config WHERE key = 'ai.mock'").first<{ value: string }>();
    expect(stored?.value).toBe("on");
  });

  it("a STORED ai.mock=on returns no fabricated lab markers in production, and bills nothing", async () => {
    // The stored config still says "on" (beforeAll) — this is the state a
    // hand-edited app_config row or a restored backup can still produce even
    // with the write path closed, so the read point in ai.ts must hold too.
    const stored = await (env.DB as D1Database).prepare("SELECT value FROM app_config WHERE key = 'ai.mock'").first<{ value: string }>();
    expect(stored?.value).toBe("on");

    const before = await balance();
    const res = await prodFetch("/api/ai/lab-extract", { method: "POST", headers: H(), body: JSON.stringify({ clientId, labId }) });
    // No Gemini key is configured, so the real vision path has no credential and
    // must fail closed rather than fall back to the mock.
    expect(res.status).toBe(503);
    const body = (await res.json()) as { values?: unknown[]; error?: string };
    expect(body.values).toBeUndefined();
    // Nothing that looks like a clinical result may appear anywhere in the reply.
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/Vitamin D|Ferritin|Testosterone|ng\/mL|ng\/dL/i);
    // And no credits were taken for the non-generation.
    expect(await balance()).toBe(before);
    const gens = await (env.DB as D1Database)
      .prepare("SELECT COALESCE(SUM(credits),0) AS c FROM ai_generations WHERE tenant_id = ? AND feature = 'lab-extract'")
      .bind(tenantId)
      .first<{ c: number }>();
    expect(gens?.c ?? 0).toBe(0);
  });

  it("in dev the same call DOES answer from the mock — and every marker is labelled SIMULATED", async () => {
    // Non-vacuity: the production refusal above is not "lab-extract is broken".
    const res = await SELF.fetch(`${ORIGIN}/api/ai/lab-extract`, { method: "POST", headers: H(), body: JSON.stringify({ clientId, labId }) });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { values: { marker: string }[]; mocked: boolean };
    expect(out.mocked).toBe(true);
    expect(out.values.length).toBeGreaterThan(0);
    // The marker NAME carries the warning, so it survives into the client's
    // chart, the `LABS:` prompt block and the supplement recommender.
    for (const v of out.values) expect(v.marker).toMatch(/^SIMULATED/);
  });

  it("a stored ai.mock=on no longer bypasses the vision-image refusal in production", async () => {
    const db = env.DB as D1Database;
    // Force vision onto a NON-multimodal Workers AI model. That is the only
    // configuration that reaches the `input.image && !isGoogle` refusal — and the
    // one `mockMode === "on"` used to skip, fabricating billable "vision" output.
    await db.prepare("UPDATE ai_models SET enabled = 0 WHERE provider = 'google'").run();
    await db
      .prepare(
        "INSERT OR REPLACE INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default) VALUES ('@cf/test/blind-vision', 'vision', 'Blind (test)', 'workers-ai', 1000, 2000, NULL, NULL, 3, 1, 1)",
      )
      .run();
    try {
      const before = await balance();
      const res = await prodFetch("/api/ai/lab-extract", { method: "POST", headers: H(), body: JSON.stringify({ clientId, labId }) });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { detail?: string };
      expect(body.detail ?? "").toMatch(/cannot read images/i);
      // Refused BEFORE the reserve — nothing held, nothing settled.
      expect(await balance()).toBe(before);
    } finally {
      await db.prepare("DELETE FROM ai_models WHERE id = '@cf/test/blind-vision'").run();
      await db.prepare("UPDATE ai_models SET enabled = 1 WHERE provider = 'google'").run();
    }
  });

  it("dev keeps the mock lane, so the reserve → run → settle loop is still exercised", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "meal.jpg");
    fd.append("purpose", "meal-snap");
    fd.append("clientId", clientId);
    const up = await SELF.fetch(`${ORIGIN}/api/media/upload`, { method: "POST", headers: auth(ownerCookie), body: fd });
    const { key } = (await up.json()) as { key: string };
    const before = await balance();
    const snap = await SELF.fetch(`${ORIGIN}/api/ai/snap-meal`, { method: "POST", headers: H(), body: JSON.stringify({ clientId, imageKey: key }) });
    expect(snap.status).toBe(200);
    const out = (await snap.json()) as { mocked: boolean; credits: number; entries: unknown[] };
    expect(out.mocked).toBe(true);
    expect(out.entries.length).toBeGreaterThan(0);
    // Mock generations still settle in DEV on purpose: that is what keeps the
    // metering path honest locally. It is safe because the lane cannot run
    // anywhere else (see the production cases above).
    expect(out.credits).toBeGreaterThan(0);
    expect(await balance()).toBeLessThan(before);
  });

  it("the same vision call in production fails closed instead of mocking", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "meal2.jpg");
    fd.append("purpose", "meal-snap");
    fd.append("clientId", clientId);
    const up = await SELF.fetch(`${ORIGIN}/api/media/upload`, { method: "POST", headers: auth(ownerCookie), body: fd });
    const { key } = (await up.json()) as { key: string };
    const before = await balance();
    const snap = await prodFetch("/api/ai/snap-meal", { method: "POST", headers: H(), body: JSON.stringify({ clientId, imageKey: key }) });
    expect(snap.status).toBe(503);
    const text = JSON.stringify(await snap.json());
    expect(text).not.toMatch(/Grilled chicken|Cooked rice|Mixed salad/i);
    expect(await balance()).toBe(before);
  });
});

describe("weekly training-load target — one authoritative value", () => {
  const COACH_TARGET = 900;
  let goalId = "";

  // The goal is created HERE, not in the first `it`: the workers pool isolates
  // storage per test, so a row written inside one `it` is rolled back before the
  // next one runs. Suite-level writes survive for the whole block.
  beforeAll(async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/goals`, {
      method: "POST",
      headers: H(),
      // Exactly what GoalManager sends: the target rides on targets_json and NO
      // body-level weeklyLoadTarget is sent (which is how the column used to end
      // up pinned at the zod default of 300).
      body: JSON.stringify({ clientId, label: "Load phase", targets: { targetCalories: 2200, targetProteinG: 170, weeklyTrainingLoad: COACH_TARGET } }),
    });
    if (res.status !== 201) throw new Error(`goal setup failed: ${res.status} ${await res.text()}`);
    goalId = ((await res.json()) as { id: string }).id;
  });

  it("a coach-set targets_json.weeklyTrainingLoad is mirrored into the column", async () => {
    const row = await (env.DB as D1Database)
      .prepare("SELECT weekly_load_target FROM client_goals WHERE id = ?")
      .bind(goalId)
      .first<{ weekly_load_target: number }>();
    expect(row?.weekly_load_target).toBe(COACH_TARGET);
    expect(row?.weekly_load_target).not.toBe(DEFAULT_WEEKLY_LOAD_TARGET);
  });

  it("GET /goals returns the resolved target the client's Train tab reads", async () => {
    const out = (await (await SELF.fetch(`${ORIGIN}/api/goals?clientId=${clientId}`, { headers: auth(ownerCookie) })).json()) as {
      goals: { status: string; weeklyLoadTarget: number; targets: { weeklyTrainingLoad?: number } | null }[];
    };
    const active = out.goals.find((g) => g.status === "active")!;
    expect(active.weeklyLoadTarget).toBe(COACH_TARGET);
    expect(active.targets?.weeklyTrainingLoad).toBe(COACH_TARGET);
  });

  it("the wellness/recovery score grades against the coach's target, not 300", async () => {
    const out = (await (await SELF.fetch(`${ORIGIN}/api/wellness/score?clientId=${clientId}`, { headers: auth(ownerCookie) })).json()) as {
      input: { weeklyLoadTarget: number };
    };
    expect(out.input.weeklyLoadTarget).toBe(COACH_TARGET);
  });

  it("the /today bundle reports the resolved target", async () => {
    const date = new Date().toISOString().slice(0, 10);
    const out = (await (await SELF.fetch(`${ORIGIN}/api/today?clientId=${clientId}&date=${date}`, { headers: auth(ownerCookie) })).json()) as {
      goal: { weeklyLoadTarget: number } | null;
    };
    expect(out.goal?.weeklyLoadTarget).toBe(COACH_TARGET);
  });

  it("the AI client context tells the model the coach's target, not 300", async () => {
    const row = await (env.DB as D1Database).prepare("SELECT * FROM clients WHERE id = ?").bind(clientId).first<KnowledgeClient>();
    const ctx = await buildClientContext(env as never, row!, { today: new Date().toISOString().slice(0, 10), hour: 12, units: resolveUnits(null) });
    expect(ctx.text).toContain(`Weekly training load target ${COACH_TARGET}`);
    expect(ctx.text).toMatch(new RegExp(`training load \\d+/${COACH_TARGET}`));
    // The exact wrong number the audit found ("training load 620/300").
    expect(ctx.text).not.toContain(`/${DEFAULT_WEEKLY_LOAD_TARGET}`);
    expect(ctx.text).not.toContain(`target ${DEFAULT_WEEKLY_LOAD_TARGET}.`);
  });

  it("a goal with no coach target falls back to the ONE domain default everywhere", async () => {
    const other = (await (
      await SELF.fetch(`${ORIGIN}/api/clients`, { method: "POST", headers: H(), body: JSON.stringify({ displayName: "No Target" }) })
    ).json()) as { client: { id: string } };
    const cid = other.client.id;
    const res = await SELF.fetch(`${ORIGIN}/api/goals`, { method: "POST", headers: H(), body: JSON.stringify({ clientId: cid, label: "Base", targets: { targetCalories: 2000 } }) });
    expect(res.status).toBe(201);
    const goals = (await (await SELF.fetch(`${ORIGIN}/api/goals?clientId=${cid}`, { headers: auth(ownerCookie) })).json()) as {
      goals: { status: string; weeklyLoadTarget: number }[];
    };
    expect(goals.goals.find((g) => g.status === "active")!.weeklyLoadTarget).toBe(DEFAULT_WEEKLY_LOAD_TARGET);
    const wellness = (await (await SELF.fetch(`${ORIGIN}/api/wellness/score?clientId=${cid}`, { headers: auth(ownerCookie) })).json()) as {
      input: { weeklyLoadTarget: number };
    };
    expect(wellness.input.weeklyLoadTarget).toBe(DEFAULT_WEEKLY_LOAD_TARGET);
  });

  it("a legacy row whose value only ever reached the column still resolves to it", async () => {
    // Pre-mirror rows carry the number in the
    // column only. The resolver must fall through to it rather than the default.
    const other = (await (
      await SELF.fetch(`${ORIGIN}/api/clients`, { method: "POST", headers: H(), body: JSON.stringify({ displayName: "Legacy Row" }) })
    ).json()) as { client: { id: string } };
    const cid = other.client.id;
    await (env.DB as D1Database)
      .prepare(
        "INSERT INTO client_goals (id, tenant_id, client_id, label, status, start_date, targets_json, weekly_load_target, created_by, created_at) VALUES ('goal_legacy_1', ?, ?, 'Legacy', 'active', '2026-01-01', '{\"targetCalories\":2100}', 620, 'u', '2026-01-01T00:00:00.000Z')",
      )
      .bind(tenantId, cid)
      .run();
    const goals = (await (await SELF.fetch(`${ORIGIN}/api/goals?clientId=${cid}`, { headers: auth(ownerCookie) })).json()) as {
      goals: { status: string; weeklyLoadTarget: number }[];
    };
    expect(goals.goals.find((g) => g.status === "active")!.weeklyLoadTarget).toBe(620);
    const wellness = (await (await SELF.fetch(`${ORIGIN}/api/wellness/score?clientId=${cid}`, { headers: auth(ownerCookie) })).json()) as {
      input: { weeklyLoadTarget: number };
    };
    expect(wellness.input.weeklyLoadTarget).toBe(620);
  });
});
