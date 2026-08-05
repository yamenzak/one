/**
 * A LENS A PACKAGE DOES NOT INCLUDE MUST NOT BE ON THE WIRE.
 *
 * `/api/progress` answers with four lenses at once — body, training, nutrition,
 * wellness — and three of them are sold per package. It carried no gate at all:
 * a client whose package excluded the strength report still received every PR
 * and the whole tonnage series, and the app hid the tab. Hiding a tab is a
 * layout decision. This file asserts the enforcement.
 *
 * Everything here is observable in this suite (AGENTS.md §4): the shaping runs
 * inside the handler off `resolveClientFlagsFor`, consults no admin status, and
 * turns on `c.get("role") === "client"` — which the client sessions below have.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { ClientFlags } from "@kova/domain";
import { ensureSchema } from "../src/db.js";

const B = "http://setup.localhost:8787";

function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
const auth = (cookies: string) => ({ Cookie: cookies, origin: B });
const J = (cookies: string) => ({ "content-type": "application/json", ...auth(cookies) });

async function signIn(email: string): Promise<string> {
  const db = env.DB as D1Database;
  await SELF.fetch(`${B}/api/auth/email-otp/send-verification-otp`, {
    method: "POST", headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  const row = await db.prepare("SELECT value FROM verification ORDER BY createdAt DESC LIMIT 1").first<{ value: string }>();
  const otp = ((row?.value ?? "").match(/\d{6}/) ?? [])[0];
  if (!otp) throw new Error("could not read OTP from verification table");
  return grabCookies(await SELF.fetch(`${B}/api/auth/sign-in/email-otp`, {
    method: "POST", headers: { "content-type": "application/json", origin: B },
    body: JSON.stringify({ email, otp }),
  }));
}

/** A studio on `pro` (every entitlement) with its owner signed in. */
async function studio(tag: string) {
  let owner = await signIn(`${tag}-owner@test.dev`);
  const org = await SELF.fetch(`${B}/api/auth/organization/create`, {
    method: "POST", headers: J(owner),
    body: JSON.stringify({ name: `${tag} Studio`, slug: tag.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
  });
  const refreshed = grabCookies(org);
  if (refreshed) owner = refreshed;
  const tenantId = ((await (await SELF.fetch(`${B}/api/context`, { headers: auth(owner) })).json()) as { active: { tenantId: string } }).active.tenantId;
  const r = await SELF.fetch(`${B}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: J(owner), body: JSON.stringify({ planId: "pro" }) });
  expect(r.status).toBe(200);
  return { owner, tenantId };
}

/**
 * A studio, a client on a package with exactly `flags`, and a client session.
 * The `all` budget keeps budget-gating out of it — this file is about the FLAG.
 */
async function world(tag: string, flags: Partial<ClientFlags>) {
  const { owner, tenantId } = await studio(tag);
  const email = `${tag}-client@test.dev`;
  const created = await SELF.fetch(`${B}/api/clients`, {
    method: "POST", headers: J(owner), body: JSON.stringify({ displayName: `${tag} Client`, email }),
  });
  expect(created.status).toBeLessThan(300);
  const clientId = ((await created.json()) as { client: { id: string } }).client.id;

  const pkg = await SELF.fetch(`${B}/api/packages`, {
    method: "POST", headers: J(owner),
    body: JSON.stringify({ name: `${tag} Pack`, budgets: [{ feature: "all", days: 30 }], flags }),
  });
  expect(pkg.status).toBe(201);
  const packageId = ((await pkg.json()) as { id: string }).id;
  const grant = await SELF.fetch(`${B}/api/subscriptions/grant`, {
    method: "POST", headers: J(owner), body: JSON.stringify({ clientId, packageId }),
  });
  expect(grant.status).toBeLessThan(300);

  // Something to withhold: a logged set (→ PRs + tonnage) and a weigh-in.
  await SELF.fetch(`${B}/api/logs/workout-sets`, {
    method: "POST", headers: J(owner),
    body: JSON.stringify({ clientId, data: { date: DAY, workoutPlanId: "wp", planDayIndex: 0, blockIndex: 0, slotIndex: 0, exerciseId: "ex_bench", sets: [{ setIndex: 0, reps: 5, weightKg: 100, completed: true }] } }),
  });
  await SELF.fetch(`${B}/api/measurements`, {
    method: "POST", headers: J(owner),
    body: JSON.stringify({ clientId, data: { date: DAY, weightKg: 82.5 } }),
  });

  const client = await signIn(email);
  await SELF.fetch(`${B}/api/context`, { headers: auth(client) });
  await SELF.fetch(`${B}/api/context/switch`, { method: "POST", headers: J(client), body: JSON.stringify({ tenantId }) });
  const ctx = (await (await SELF.fetch(`${B}/api/context`, { headers: auth(client) })).json()) as { active: { role: string } };
  expect(ctx.active.role).toBe("client");
  return { owner, client, clientId };
}

const DAY = "2026-05-04";

interface ProgressBody {
  included: { body: boolean; training: boolean; nutrition: boolean };
  body: { latest: { weightKg: number | null }; weight: unknown[] };
  training: { prs: unknown[]; totalTonnage: number; workoutDays: number };
  wellness: { averages: unknown };
  consistency: { checkInDays: number };
}
const progress = async (cookies: string, clientId: string) =>
  (await (await SELF.fetch(`${B}/api/progress/${clientId}?range=30d&today=${DAY}`, { headers: auth(cookies) })).json()) as ProgressBody;

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
});

describe("/api/progress is shaped by the client's package", () => {
  it("withholds the strength lens when the package excludes it", async () => {
    const w = await world("nostrength", { canViewExerciseReport: false });
    const p = await progress(w.client, w.clientId);
    expect(p.included.training).toBe(false);
    expect(p.training.prs).toEqual([]);
    expect(p.training.totalTonnage).toBe(0);
    expect(p.training.workoutDays).toBe(0);
    // …and takes nothing else with it: the ungated lenses still answer, and the
    // body lens the same package DOES include is untouched.
    expect(p.included.body).toBe(true);
    expect(p.body.latest.weightKg).toBe(82.5);
    expect(p.consistency).toBeDefined();
    expect(p.wellness.averages).toBeDefined();
  });

  it("serves it when the package includes it — the shaping is the flag, not a bug", async () => {
    const w = await world("yesstrength", { canViewExerciseReport: true });
    const p = await progress(w.client, w.clientId);
    expect(p.included.training).toBe(true);
    expect(p.training.prs.length).toBe(1);
    expect(p.training.totalTonnage).toBe(500); // 5 reps × 100kg
  });

  it("withholds the body lens when the package excludes it", async () => {
    const w = await world("nobody", { canViewBodyMetricsReport: false });
    const p = await progress(w.client, w.clientId);
    expect(p.included.body).toBe(false);
    expect(p.body.latest.weightKg).toBeNull();
    expect(p.body.weight).toEqual([]);
    // The strength lens is a different flag and stays on.
    expect(p.included.training).toBe(true);
    expect(p.training.totalTonnage).toBe(500);
  });

  it("withholds the nutrition lens when the package excludes it", async () => {
    const w = await world("nonutri", { showNutritionReports: false });
    const p = await progress(w.client, w.clientId);
    expect(p.included.nutrition).toBe(false);
  });

  it("never bounds the COACH — a client's package does not limit their trainer", async () => {
    const w = await world("coachsees", { canViewExerciseReport: false, canViewBodyMetricsReport: false });
    const p = await progress(w.owner, w.clientId);
    expect(p.included).toEqual({ body: true, training: true, nutrition: true });
    expect(p.training.totalTonnage).toBe(500);
    expect(p.body.latest.weightKg).toBe(82.5);
  });
});

describe("/api/reports/client is shaped the same way", () => {
  const report = async (cookies: string, clientId: string) =>
    (await (await SELF.fetch(`${B}/api/reports/client/${clientId}?range=30d&today=${DAY}`, { headers: auth(cookies) })).json()) as { prs: unknown[]; totalTonnage: number };

  it("withholds PRs and tonnage from a client whose package excludes the strength report", async () => {
    // The body-metrics flag is ON, which is the whole point: the strength half
    // used to ride in on the body-metrics gate.
    const w = await world("reportnostrength", { canViewBodyMetricsReport: true, canViewExerciseReport: false });
    const r = await report(w.client, w.clientId);
    expect(r.prs).toEqual([]);
    expect(r.totalTonnage).toBe(0);
  });

  it("serves them to the coach regardless", async () => {
    const w = await world("reportcoach", { canViewBodyMetricsReport: true, canViewExerciseReport: false });
    const r = await report(w.owner, w.clientId);
    expect(r.prs.length).toBe(1);
    expect(r.totalTonnage).toBe(500);
  });
});
