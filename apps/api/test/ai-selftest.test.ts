/**
 * The admin AI self-test, and the model-catalog sync's reconciliation.
 *
 * Two things are being proven here.
 *
 * 1. THE SELF-TEST IS HONEST. It runs the product's own prompts through the
 *    real metered `generate()` (reserve → run → settle), says plainly when an
 *    answer came from the canned mock, grades the answer with the feature's own
 *    parser — so a 200 carrying prose is a FAILURE, not a pass — and surfaces
 *    the deliberate Workers AI vision refusal as "not supported on this
 *    provider" rather than as a crash.
 *
 *    Where the assertions live, and why:
 *      • Metering + `mocked: true` + the credit debit are end-to-end through
 *        `SELF.fetch`, because that is the only way to see the DO move.
 *      • The "bad output is a failure" case is graded through
 *        `evaluateSelfTestOutput` — the exact function the endpoint reports
 *        from — on hand-written model output. It cannot be driven end-to-end
 *        in this harness: the mock lane is the only lane available offline, and
 *        a feature's `mock` is contractually required to return output that
 *        passes its own validator (AGENTS §6.3), so the mock can never fail.
 *      • The vision refusal needs the mock lane OFF, so it goes through
 *        `prodFetch` (ENVIRONMENT=production + an explicit ADMIN_EMAILS), the
 *        same trick `ai-guards.test.ts` uses.
 *
 *    ⚠️ The admin-only guard is only partly observable here. `vitest.config.ts`
 *    pins `ADMIN_EMAILS: ""` + `ENVIRONMENT: "development"`, which makes EVERY
 *    signed-in user a platform admin (AGENTS §4), so "a signed-in non-admin is
 *    refused" cannot be asserted in this suite — it would pass vacuously. What
 *    IS observable, and is asserted below, is the unauthenticated case:
 *    `isPlatformAdmin` requires a session, so no cookie ⇒ 403 through the real
 *    `/api/admin/*` lane in `route-guard.ts`.
 *
 * 2. SYNC RECONCILES PER PROVIDER. A model that vanishes from its provider's
 *    pricing page is switched off (not deleted); a provider whose fetch failed
 *    is left completely alone, so a Cloudflare outage cannot disable every
 *    Gemini model. `syncModelCatalog` takes its fetcher as an argument, so this
 *    runs against real D1 with no network.
 */

import { createExecutionContext, env, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/index.js";
import { ensureSchema } from "../src/db.js";
import { seedAiModels } from "../src/ai.js";
// The catalog sync moved to `@4dl/ai` — it reads two public pricing pages and
// writes that package's own table, and nothing about it was ever Kova's. The
// tests follow it: they now cover the shared implementation every app runs.
import { syncModelCatalog, PRICING_SOURCES, type FetchedDoc } from "@4dl/ai";
import { evaluateSelfTestOutput, selfTestCheck, SELF_TEST_CHECKS } from "../src/ai-routes.js";
import type { AiModelRow } from "../src/ai.js";

const ORIGIN = "http://setup.localhost:8787";
const OWNER_EMAIL = "selftest-owner@test.dev";

let ownerCookie = "";
let tenantId = "";

function grabCookies(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
}

/** Full passwordless sign-in: request OTP, read it from D1, verify, create org. */
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

/** Same worker + bindings, ENVIRONMENT=production so the mock lane is off.
 *  ADMIN_EMAILS is set explicitly because the platform-admin fail-open is
 *  itself dev-gated — without it the route would 403 for an unrelated reason. */
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

interface SelfTestResultRow {
  check: string; modelId: string; provider: string;
  status: "pass" | "fail" | "unsupported" | "blocked";
  failure: string | null; detail: string | null;
  latencyMs: number; credits: number; mocked: boolean; excerpt: string; summary: string | null;
}
interface RunResponse { results: SelfTestResultRow[]; totalCredits: number; passed: number; failed: number; mocked: boolean; durationMs: number; stopped: string | null }
interface PlanResponse {
  scope: string;
  runs: { check: string; modelId: string; provider: string; estimatedCredits: number }[];
  truncated: number; maxRuns: number; totalEstimatedCredits: number;
  geminiKeySet: boolean; mockMode: string; willMock: Record<string, boolean>;
}

beforeAll(async () => {
  await ensureSchema(env.DB as D1Database);
  // Force the mock lane: the wrangler AI binding exists (so env.AI is truthy in
  // Miniflare) but .run() needs real Cloudflare auth.
  await (env.DB as D1Database)
    .prepare("INSERT INTO app_config (key, value) VALUES ('ai.mock', 'on') ON CONFLICT(key) DO UPDATE SET value = 'on'")
    .run();
  ownerCookie = await signInFlow(OWNER_EMAIL, "Selftest Studio");
  const ctx = (await (await SELF.fetch(`${ORIGIN}/api/context`, { headers: auth(ownerCookie) })).json()) as { active: { tenantId: string } };
  tenantId = ctx.active.tenantId;
  // `studio` comps enough credits that a debit is measurable.
  await SELF.fetch(`${ORIGIN}/api/admin/tenants/${tenantId}/plan`, { method: "POST", headers: H(), body: JSON.stringify({ planId: "studio" }) });
});

describe("AI self-test — the admin lane", () => {
  it("is refused without a session (the only half of the admin gate this harness can see)", async () => {
    // ADMIN_EMAILS="" + ENVIRONMENT=development promotes every signed-in user to
    // platform admin here, so a signed-in-but-not-admin assertion would be
    // vacuous. isPlatformAdmin still requires a session, and that IS real.
    const plan = await SELF.fetch(`${ORIGIN}/api/admin/ai/selftest`, { headers: { origin: ORIGIN } });
    expect(plan.status).toBe(403);
    const run = await SELF.fetch(`${ORIGIN}/api/admin/ai/selftest`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: "{}" });
    expect(run.status).toBe(403);
  });

  it("quotes the cost, names the models and flags the mock lane before spending anything", async () => {
    const before = await balance();
    const plan = (await (await SELF.fetch(`${ORIGIN}/api/admin/ai/selftest?scope=default`, { headers: auth(ownerCookie) })).json()) as PlanResponse;
    expect(plan.runs.length).toBe(SELF_TEST_CHECKS.length);
    expect(plan.totalEstimatedCredits).toBeGreaterThan(0);
    for (const r of plan.runs) {
      expect(r.modelId).toBeTruthy();
      expect(r.estimatedCredits).toBeGreaterThan(0);
    }
    // ai.mock = "on" in this env, so the plan must warn for both providers.
    expect(plan.mockMode).toBe("on");
    expect(plan.willMock["workers-ai"]).toBe(true);
    expect(plan.willMock.google).toBe(true);
    // Planning is free.
    expect(await balance()).toBe(before);
  });

  it("runs the real prompts through the metered path — mocked per check, and the DO balance actually moves", async () => {
    const before = await balance();
    const res = await SELF.fetch(`${ORIGIN}/api/admin/ai/selftest`, { method: "POST", headers: H(), body: JSON.stringify({ scope: "default" }) });
    expect(res.status).toBe(200);
    const out = (await res.json()) as RunResponse;

    expect(out.results.length).toBe(SELF_TEST_CHECKS.length);
    expect(out.results.map((r) => r.check).sort()).toEqual(SELF_TEST_CHECKS.map((c) => c.key).sort());
    for (const r of out.results) {
      // Every check must SAY it was mocked — a green board that silently came
      // from canned output proves nothing about the provider.
      expect(r.mocked, `${r.check} should report mocked`).toBe(true);
      expect(r.status, `${r.check}: ${r.failure} ${r.detail}`).toBe("pass");
      expect(r.credits, `${r.check} credits`).toBeGreaterThan(0);
      expect(r.excerpt.length).toBeGreaterThan(0);
      expect(r.summary).toBeTruthy();
      expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    }
    expect(out.mocked).toBe(true);
    expect(out.passed).toBe(SELF_TEST_CHECKS.length);
    expect(out.totalCredits).toBe(out.results.reduce((n, r) => n + r.credits, 0));

    // The whole point: it is not a dry run. The authoritative balance drops.
    const after = await balance();
    expect(after).toBeLessThan(before);
    expect(before - after).toBe(out.totalCredits);

    // …and each run left an audit row, like every other metered call.
    const audit = await (env.DB as D1Database)
      .prepare("SELECT COUNT(*) AS n FROM ai_generations WHERE tenant_id = ? AND ok = 1")
      .bind(tenantId)
      .first<{ n: number }>();
    expect(audit!.n).toBeGreaterThanOrEqual(SELF_TEST_CHECKS.length);
  });

  it("runs one pinned model per request, so the console can show progress", async () => {
    const plan = (await (await SELF.fetch(`${ORIGIN}/api/admin/ai/selftest?scope=default`, { headers: auth(ownerCookie) })).json()) as PlanResponse;
    const one = plan.runs.find((r) => r.check === "parse-food")!;
    const out = (await (await SELF.fetch(`${ORIGIN}/api/admin/ai/selftest`, {
      method: "POST", headers: H(), body: JSON.stringify({ runs: [{ check: one.check, modelId: one.modelId }] }),
    })).json()) as RunResponse;
    expect(out.results.length).toBe(1);
    expect(out.results[0]!.check).toBe("parse-food");
    expect(out.results[0]!.modelId).toBe(one.modelId);
  });

  it("compare mode puts the same check on both providers, adjacent", async () => {
    // Both providers have enabled models in the seeded catalog, so every check
    // should plan a Workers AI run and a Gemini run, next to each other.
    const plan = (await (await SELF.fetch(`${ORIGIN}/api/admin/ai/selftest?scope=compare`, { headers: auth(ownerCookie) })).json()) as PlanResponse;
    const byCheck = new Map<string, string[]>();
    for (const r of plan.runs) byCheck.set(r.check, [...(byCheck.get(r.check) ?? []), r.provider]);
    for (const [check, providers] of byCheck) {
      expect(providers, `${check} providers`).toContain("google");
      expect(providers, `${check} providers`).toContain("workers-ai");
    }
    // Adjacency: runs for one check are contiguous in the list.
    const order = plan.runs.map((r) => r.check);
    expect(new Set(order).size).toBe(order.filter((c, i) => order[i - 1] !== c).length);
  });

  it("grades a model answer as a FAILURE with a named reason when it does not validate", () => {
    const plan = selfTestCheck("draft-plan")!;

    // 1. HTTP 200 carrying prose. This is the "Workers AI isn't functioning"
    //    symptom: the call worked, the answer is unusable.
    const prose = evaluateSelfTestOutput(plan, "Sure! Here is a great two-day full body plan for Sam. Day one: squats, rows...");
    expect(prose.status).toBe("fail");
    expect(prose.failure).toBe("unparseable_json");
    expect(prose.detail).toMatch(/prose|no JSON/i);

    // 2. Well-formed JSON of the wrong shape.
    const wrongShape = evaluateSelfTestOutput(plan, JSON.stringify({ plan: { week: [] } }));
    expect(wrongShape.status).toBe("fail");
    expect(wrongShape.failure).toBe("schema");
    expect(wrongShape.detail).toMatch(/days/);

    // 3. The dangerous one: perfectly-shaped JSON referencing exercises that do
    //    not exist in the library it was handed. A coach would get an empty plan.
    const invented = evaluateSelfTestOutput(plan, JSON.stringify({
      days: [{ name: "Day 1", isRestDay: false, blocks: [{ type: "single", rounds: null, slots: [
        { exerciseId: "bench-press", measurementMode: "reps", sets: [{ setType: "working", reps: 8, weightMode: "unspecified", restAfterSec: 90 }] },
      ] }] }],
    }));
    expect(invented.status).toBe("fail");
    expect(invented.failure).toBe("schema");
    expect(invented.detail).toContain("bench-press");

    // 4. An empty 200.
    expect(evaluateSelfTestOutput(plan, "   ").failure).toBe("empty");

    // 5. The control: the feature's own mock passes, or the mock lane would be
    //    exercising a path production never does (AGENTS §6.3).
    for (const c of SELF_TEST_CHECKS) {
      const v = evaluateSelfTestOutput(c, c.mock());
      expect(v.status, `${c.key} mock should validate: ${v.detail}`).toBe("pass");
    }
  });

  it("reports the Workers AI vision refusal as 'not supported', not a crash", async () => {
    // A Workers AI vision model, as the catalog sync would discover it.
    await (env.DB as D1Database).prepare(
      "INSERT OR REPLACE INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default) VALUES (?, 'vision', 'Llama 3.2 11B Vision', 'workers-ai', 4410, 61493, NULL, NULL, 3, 1, 0)",
    ).bind("@cf/meta/llama-3.2-11b-vision-instruct").run();

    // The refusal only fires with the mock lane OFF, i.e. in production.
    const res = await prodFetch("/api/admin/ai/selftest", {
      method: "POST",
      headers: H(),
      body: JSON.stringify({ runs: [{ check: "snap-meal", modelId: "@cf/meta/llama-3.2-11b-vision-instruct" }] }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as RunResponse;
    const r = out.results[0]!;
    expect(r.status).toBe("unsupported");
    expect(r.failure).toBe("not_supported");
    // Refused on TASK COMPATIBILITY now, one step earlier than the old
    // "cannot read images" guard: vision is Gemini-only, so a Workers AI row is
    // rejected as soon as the model is resolved rather than after it has been
    // accepted as the vision model. Same verdict, better reason — and the
    // "cannot read images" guard remains as the backstop for a row that somehow
    // passes compatibility.
    expect(r.detail).toMatch(/cannot serve a "vision" request|cannot read images/i);
    expect(r.credits).toBe(0);
    // A refusal happens before the reserve — it must not bill anything.
    expect(r.credits).toBe(0);
  });

  it("refuses a model that cannot serve the check's task instead of silently swapping one in", async () => {
    // Pin a text-only model to the vision check. generate() must NOT quietly
    // fall back to the vision default — the operator asked about THIS model.
    const out = (await (await SELF.fetch(`${ORIGIN}/api/admin/ai/selftest`, {
      method: "POST", headers: H(),
      body: JSON.stringify({ runs: [{ check: "snap-meal", modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }] }),
    })).json()) as RunResponse;
    const r = out.results[0]!;
    expect(r.status).toBe("unsupported");
    expect(r.failure).toBe("not_supported");
    expect(r.detail).toMatch(/cannot serve a "vision" request/);
    expect(r.credits).toBe(0);
  });
});

// ── Catalog sync reconciliation ──────────────────────────────────────────────

const CF_MD = `
## LLM model pricing

| Model | Price in Tokens | Price in Neurons |
| ----- | --------------- | ---------------- |
| @cf/meta/llama-3.3-70b-instruct-fp8-fast | $0.293 per M input tokens  $2.253 per M output tokens | 26668 neurons per M input tokens  204805 neurons per M output tokens |
| @cf/meta/llama-3.2-3b-instruct | $0.051 per M input tokens  $0.335 per M output tokens | 4625 neurons per M input tokens  30475 neurons per M output tokens |

## Embeddings model pricing

| Model | Price in Tokens | Price in Neurons |
| ----- | --------------- | ---------------- |
| @cf/baai/bge-m3 | $0.012 per M input tokens | 1075 neurons per M input tokens |

## Image model pricing

| Model | Price in Tokens | Price in Neurons |
| ----- | --------------- | ---------------- |
| @cf/black-forest-labs/flux-1-schnell | $0.0000528 per 512x512 tile  $0.0001056 per step | 4.80 neurons per 512x512 tile  9.60 neurons per step |
`;

const GEM_MD = `
## Gemini 2.5 Flash

*\`gemini-2.5-flash\`*

|   | Free Tier | Paid Tier, per 1M tokens in USD |
| Input price | Free of charge | $0.30 |
| Output price (including thinking tokens) | Free of charge | $2.50 |

## Gemini 3.1 Flash-Lite

*\`gemini-3.1-flash-lite\`*

|   | Free Tier | Paid Tier, per 1M tokens in USD |
| Input price (text, image, video) | Free of charge | $0.10 |
| Output price | Free of charge | $0.40 |
`;

/** A fetcher that answers only for the providers named, and fails the rest. */
const fetcher = (docs: Partial<Record<string, string>>) => async (url: string): Promise<FetchedDoc> => {
  const md = docs[url];
  return md ? { md, error: null } : { md: null, error: "HTTP 503" };
};

const modelRow = (id: string) =>
  (env.DB as D1Database).prepare("SELECT id, enabled, is_default, task, input_rate FROM ai_models WHERE id = ?").bind(id)
    .first<{ id: string; enabled: number; is_default: number; task: string; input_rate: number }>();

describe("model-catalog sync — discovery and per-provider reconciliation", () => {
  /**
   * A model the provider has SHUT DOWN, through the whole real path.
   *
   * The parser's own rules are unit-tested in `@4dl/ai`; what this asserts is
   * the consequence nobody would have found there — that a shut-down model
   * cannot end up ENABLED, and cannot end up a lane DEFAULT, after a sync
   * against a page that still prices it in full.
   *
   * That is not a hypothetical. Google leaves a retired model's rate tables up
   * under a deprecation banner indefinitely, `gemini-2.0-flash` was still fully
   * priced two months after its 1 June 2026 shutdown, and the sync elects the
   * CHEAPEST enabled model per lane — so the dead row, being the cheapest thing
   * on the page, was the one the election would pick.
   */
  it("never enables or elects a model the provider has already shut down", async () => {
    const db = env.DB as D1Database;
    await seedAiModels(db);
    const withDead = `${GEM_MD}
## Gemini 2.0 Flash

*\`gemini-2.0-flash\`*

> [!WARNING]
> **Warning:** Gemini 2.0 Flash is [deprecated](https://ai.google.dev/gemini-api/docs/deprecations) and has been shut down June 1, 2026. Migrate to a newer model to avoid service disruption.

|   | Free Tier | Paid Tier, per 1M tokens in USD |
| Input price | Free of charge | $0.01 |
| Output price | Free of charge | $0.02 |
`;
    const report = await syncModelCatalog(db, {
      markup: 3,
      fetchMd: fetcher({ [PRICING_SOURCES["workers-ai"]]: CF_MD, [PRICING_SOURCES.google]: withDead }),
    });

    const goog = report.providers.find((p) => p.provider === "google")!;
    expect(goog.ok).toBe(true);
    // Named in the report, so an operator learns why a model they expected is
    // absent rather than assuming the sync missed it.
    expect(goog.retired.map((r) => r.id)).toContain("gemini-2.0-flash");
    expect(goog.addedIds).not.toContain("gemini-2.0-flash");
    expect(await modelRow("gemini-2.0-flash")).toBeNull();

    // The lanes it would have won on price are held by live models.
    const defaults = await db
      .prepare("SELECT id, task FROM ai_models WHERE is_default = 1 AND enabled = 1")
      .all<{ id: string; task: string }>();
    expect((defaults.results ?? []).map((r) => r.id)).not.toContain("gemini-2.0-flash");
    expect((defaults.results ?? []).length).toBeGreaterThan(0);
  });

  /** The same model already in the catalog, enabled and holding a lane. The
   *  sync has to take it off both, or the lane keeps failing every call. */
  it("switches off a shut-down model that is already the lane default", async () => {
    const db = env.DB as D1Database;
    await seedAiModels(db);
    await db.prepare(
      `INSERT INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default)
       VALUES ('gemini-2.0-flash', 'vision', 'Gemini 2.0 Flash', 'google', 9000, 36000, NULL, NULL, 3, 1, 1)
       ON CONFLICT(id) DO UPDATE SET enabled = 1, is_default = 1`,
    ).run();

    const withDead = `${GEM_MD}
## Gemini 2.0 Flash

*\`gemini-2.0-flash\`*

> [!WARNING]
> **Warning:** Gemini 2.0 Flash is [deprecated](https://ai.google.dev/gemini-api/docs/deprecations) and has been shut down June 1, 2026.

|   | Free Tier | Paid Tier, per 1M tokens in USD |
| Input price | Free of charge | $0.10 |
| Output price | Free of charge | $0.40 |
`;
    const report = await syncModelCatalog(db, {
      markup: 3,
      fetchMd: fetcher({ [PRICING_SOURCES["workers-ai"]]: CF_MD, [PRICING_SOURCES.google]: withDead }),
    });

    const row = (await modelRow("gemini-2.0-flash"))!;
    expect(row.enabled).toBe(0);
    expect(row.is_default).toBe(0);
    // Never deleted — a tenant's `ai_config_json` may still name it, and the
    // generation history has to stay readable.
    expect(row).toBeTruthy();
    expect(report.providers.find((p) => p.provider === "google")!.retiredDisabled).toBeGreaterThan(0);
  });

  it("disables a Cloudflare model that vanished from the page, and leaves Gemini untouched when its fetch fails", async () => {
    const db = env.DB as D1Database;
    await seedAiModels(db);
    // A model that used to be on the page.
    await db.prepare(
      "INSERT OR REPLACE INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default) VALUES ('@cf/acme/retired-model', 'text', 'Retired', 'workers-ai', 1000, 2000, NULL, NULL, 3, 1, 1)",
    ).run();

    const report = await syncModelCatalog(db, { markup: 3, fetchMd: fetcher({ [PRICING_SOURCES["workers-ai"]]: CF_MD }) });

    const cf = report.providers.find((p) => p.provider === "workers-ai")!;
    const goog = report.providers.find((p) => p.provider === "google")!;

    // Cloudflare parsed → reconciled.
    expect(cf.ok).toBe(true);
    expect(cf.parsed).toBe(3); // 2 LLM + 1 embedding; the tile-priced image model is refused
    expect(cf.unpriceable.map((u) => u.id)).toContain("@cf/black-forest-labs/flux-1-schnell");
    expect(cf.unpriceable[0]!.reason).toMatch(/tile/);
    expect(cf.disabledIds).toContain("@cf/acme/retired-model");

    const retired = await modelRow("@cf/acme/retired-model");
    expect(retired!.enabled).toBe(0);
    expect(retired!.is_default).toBe(0); // …and no longer a task default
    expect(retired, "reconciled models are disabled, never deleted").toBeTruthy();

    // Google fetch failed → NOT reconciled, and not one row touched.
    expect(goog.ok).toBe(false);
    expect(goog.error).toMatch(/couldn't fetch/i);
    expect(goog.disabled).toBe(0);
    for (const id of ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash-image", "gemini-2.5-flash-preview-tts"]) {
      expect((await modelRow(id))!.enabled, `${id} must survive a Cloudflare-only sync`).toBe(1);
    }
    // The overall call still reports partial success plus the reason.
    expect(report.ok).toBe(true);
    expect(report.errors.join(" ")).toMatch(/google/);
  });

  it("mirrored: a Gemini-only sync never disables a Workers AI model", async () => {
    const db = env.DB as D1Database;
    await seedAiModels(db);
    const report = await syncModelCatalog(db, { markup: 3, fetchMd: fetcher({ [PRICING_SOURCES.google]: GEM_MD }) });
    const cf = report.providers.find((p) => p.provider === "workers-ai")!;
    expect(cf.ok).toBe(false);
    expect(cf.disabled).toBe(0);
    expect((await modelRow("@cf/meta/llama-3.3-70b-instruct-fp8-fast"))!.enabled).toBe(1);
    // Gemini reconciled against a one-model page: everything else went off.
    const goog = report.providers.find((p) => p.provider === "google")!;
    expect(goog.ok).toBe(true);
    expect(goog.disabledIds).toContain("gemini-2.5-flash-lite");
    expect((await modelRow("gemini-2.5-flash"))!.enabled).toBe(1);
  });

  it("a page that fetches but parses zero models is a parse failure, not an empty catalog", async () => {
    const db = env.DB as D1Database;
    await seedAiModels(db);
    const report = await syncModelCatalog(db, { markup: 3, fetchMd: fetcher({ [PRICING_SOURCES["workers-ai"]]: "# Pricing\n\nThe table moved.\n" }) });
    const cf = report.providers.find((p) => p.provider === "workers-ai")!;
    expect(cf.ok).toBe(false);
    expect(cf.parsed).toBe(0);
    expect(cf.error).toMatch(/0 models parsed/);
    expect(cf.disabled).toBe(0);
    expect((await modelRow("@cf/meta/llama-3.3-70b-instruct-fp8-fast"))!.enabled).toBe(1);
  });

  it("discovers new models, re-prices existing ones, and never re-routes a lane behind the operator's back", async () => {
    const db = env.DB as D1Database;
    await seedAiModels(db);
    // A row whose LANE disagrees with what the page would guess. The pricing
    // page has no lane column, so the parser guesses from the id — and
    // `gemini-3.1-flash-lite` reads "lite", i.e. text-small. Sync used to
    // overwrite `task` from that guess, which quietly moved every text feature
    // onto the ~8× pricier 2.5-pro.
    //
    // Hand-inserted rather than taken from the seed: this used to lean on
    // `gemini-2.0-flash` being seeded as the vision lane, and that model is gone
    // — Google shut it down on 1 June 2026, so the seed no longer names it and
    // no test should depend on a dead model to have a lane at all.
    await db.prepare(
      `INSERT INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default)
       VALUES ('gemini-3.1-flash-lite', 'vision', 'Gemini 3.1 Flash-Lite', 'google', 9000, 36000, NULL, NULL, 3, 1, 0)
       ON CONFLICT(id) DO UPDATE SET task = 'vision'`,
    ).run();
    const beforeTask = (await modelRow("gemini-3.1-flash-lite"))!.task;
    expect(beforeTask).toBe("vision");

    const report = await syncModelCatalog(db, { markup: 3, fetchMd: fetcher({ [PRICING_SOURCES["workers-ai"]]: CF_MD, [PRICING_SOURCES.google]: GEM_MD }) });

    const cf = report.providers.find((p) => p.provider === "workers-ai")!;
    // Discovery: a model on the page but not in the catalog is added…
    expect(cf.addedIds).toContain("@cf/baai/bge-m3");
    // …while one already seeded counts as a re-price, not a discovery.
    expect(cf.addedIds).not.toContain("@cf/meta/llama-3.2-3b-instruct");
    expect(cf.updated).toBe(2);
    // …and a non-runnable lane lands disabled rather than offered to a tenant.
    expect((await modelRow("@cf/baai/bge-m3"))!.enabled).toBe(0);
    expect((await modelRow("@cf/baai/bge-m3"))!.task).toBe("embedding");

    // Re-pricing: the seeded row's rate is refreshed from the page…
    expect((await modelRow("@cf/meta/llama-3.3-70b-instruct-fp8-fast"))!.input_rate).toBe(26668);
    // …but its lane is NOT rewritten, even though the page's own guess for that
    // id would be text-small.
    expect((await modelRow("gemini-3.1-flash-lite"))!.task).toBe(beforeTask);
  });
});

/**
 * Model pricing, as it reaches the two surfaces that show it.
 *
 * The domain math is unit-tested next door; what is proven here is that the
 * numbers actually arrive, in the right shape, on the right side of the
 * tenant/platform line. A price that never reaches the picker cannot help
 * anyone choose, and a rate card that leaks the platform's cost basis and
 * margin to a tenant is a different kind of bug entirely.
 */
describe("model pricing reaches the pickers — in credits, without leaking the markup", () => {
  interface TenantModel { id: string; label: string; task: string; provider: string; costPerRequest: Record<string, number> }

  it("the tenant's AI settings quote every model in credits, per lane", async () => {
    const r = (await (await SELF.fetch(`${ORIGIN}/api/settings/ai`, { headers: auth(ownerCookie) })).json()) as { models: TenantModel[] };
    expect(r.models.length).toBeGreaterThan(0);

    for (const m of r.models) {
      // Every lane a feature could pick this model for is priced, and nothing
      // is quoted free — a 0 would read as "this model costs nothing".
      for (const lane of ["text", "text-small", "vision", "image", "speech"]) {
        expect(typeof m.costPerRequest[lane], `${m.id}.${lane}`).toBe("number");
        expect(m.costPerRequest[lane], `${m.id}.${lane}`).toBeGreaterThan(0);
      }
      // A small request is never dearer than a full one on the same model —
      // the picker's ordering hint would be backwards.
      expect(m.costPerRequest["text-small"]!).toBeLessThanOrEqual(m.costPerRequest.text!);
    }

    // The catalog spreads: a cheap model and a big one must not quote alike, or
    // the whole surface tells an owner nothing.
    const cheap = r.models.find((m) => m.id === "@cf/meta/llama-3.2-3b-instruct")!;
    const big = r.models.find((m) => m.id === "@cf/meta/llama-3.3-70b-instruct-fp8-fast")!;
    expect(cheap.costPerRequest.text!).toBeLessThan(big.costPerRequest.text!);
  });

  it("the tenant is told its price and NOT the platform's cost or margin", async () => {
    const r = (await (await SELF.fetch(`${ORIGIN}/api/settings/ai`, { headers: auth(ownerCookie) })).json()) as { models: Record<string, unknown>[] };
    for (const m of r.models) {
      // Neuron rates are the platform's purchase price and `markup` is its
      // margin. Both are inputs to the credit figure; neither is the tenant's
      // business, and both used to be one `SELECT *` away from shipping.
      for (const leak of ["input_rate", "output_rate", "unit_rate", "markup", "inputRate", "outputRate", "unitRate"]) {
        expect(Object.keys(m), `${String(m.id)} leaks ${leak}`).not.toContain(leak);
      }
    }
  });

  it("the admin catalog carries the credit rate card alongside the neuron one", async () => {
    interface AdminModel { id: string; task: string; markup: number | null; input_rate: number | null; pricing: { costPerRequest: Record<string, number>; perMillion: { input: number | null; output: number | null }; perUnit: { credits: number; kind: string } | null } }
    const r = (await (await SELF.fetch(`${ORIGIN}/api/admin/ai/models`, { headers: auth(ownerCookie) })).json()) as { models: AdminModel[] };
    expect(r.models.length).toBeGreaterThan(0);

    const big = r.models.find((m) => m.id === "@cf/meta/llama-3.3-70b-instruct-fp8-fast")!;
    // The operator keeps the cost basis…
    expect(big.input_rate).toBe(26_668);
    expect(big.markup).toBe(3);
    // …and gains the price in the currency the studio is billed in.
    expect(big.pricing.costPerRequest.text).toBe(8);
    expect(big.pricing.perMillion).toEqual({ input: 881, output: 6_759 });
    expect(big.pricing.perUnit).toBeNull();

    // A per-unit model prices per unit, not per million tokens.
    const image = r.models.find((m) => m.id === "gemini-2.5-flash-image")!;
    expect(image.pricing.perUnit).toEqual({ credits: 117, kind: "image" });
    // And it is visibly, correctly, an order of magnitude dearer.
    expect(image.pricing.costPerRequest.image!).toBeGreaterThan(10 * big.pricing.costPerRequest.text!);
  });
});

/**
 * Vision is Gemini-only in this codebase, and the catalog has to say so.
 *
 * `generate()` never attaches an image on the Workers AI branch and refuses the
 * call before reserving, so any non-Google row offered for vision is a model a
 * studio can select and that then fails 100% of the time. Three doors had to be
 * shut: the syncer's classifier (tested next door on the pricing markdown), the
 * compatibility check every resolution path goes through, and the stored rows a
 * previous sync already mis-tagged.
 */
describe("vision is Gemini-only, at every door", () => {
  const wa = (task: string): AiModelRow => ({
    id: "@cf/meta/llama-3.2-11b-vision-instruct", task, label: "Llama 3.2 11B Vision", provider: "workers-ai",
    input_rate: 4410, output_rate: 61493, unit_rate: null, unit_kind: null, markup: 3, enabled: 1, is_default: 0,
  });
  const gem = (task: string): AiModelRow => ({
    id: "gemini-2.5-flash", task, label: "Gemini 2.5 Flash", provider: "google",
    input_rate: 27273, output_rate: 227273, unit_rate: null, unit_kind: null, markup: 3, enabled: 1, is_default: 0,
  });

  it("refuses a Workers AI model for vision even when the row says vision", async () => {
    const { modelSupportsTask } = await import("../src/ai.js");
    // The row a prior sync wrote. It reads "vision" and it cannot serve vision.
    expect(modelSupportsTask(wa("vision"), "vision")).toBe(false);
    expect(modelSupportsTask(wa("vision"), "image")).toBe(false);
    // It is still a perfectly good text model — this is a lane correction, not
    // a blacklisting.
    expect(modelSupportsTask(wa("text"), "text")).toBe(true);
  });

  it("accepts every Gemini model for vision — they are all multimodal", async () => {
    const { modelSupportsTask } = await import("../src/ai.js");
    for (const task of ["vision", "text", "text-small", "image"]) {
      expect(modelSupportsTask(gem(task), "vision"), task).toBe(true);
    }
    // …but not a Gemini lane nothing here can execute.
    expect(modelSupportsTask(gem("embedding"), "vision")).toBe(false);
    expect(modelSupportsTask(gem("speech"), "vision")).toBe(false);
  });

  it("the migration retags rows a previous sync already mis-filed", async () => {
    const db = env.DB as D1Database;
    // Recreate the exact live state: the row present and tagged vision, pinned
    // as the vision default.
    await db.prepare(
      `INSERT INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default)
       VALUES ('@cf/meta/llama-3.2-11b-vision-instruct', 'vision', 'Llama 3.2 11B Vision', 'workers-ai', 4410, 61493, NULL, NULL, 3, 1, 1)
       ON CONFLICT(id) DO UPDATE SET task = 'vision', is_default = 1, enabled = 1`,
    ).run();

    // The correction is part of the schema pass; force it to run again.
    await db.prepare("DELETE FROM app_config WHERE key = 'schema_version'").run();
    const { ensureSchema: reapply } = await import("../src/db.js");
    // `ensureSchema` memoizes per isolate, so drive the statement the migration
    // runs — the assertion is on the OUTCOME, and the SQL is asserted verbatim
    // against the source below.
    void reapply;
    await db.prepare("UPDATE ai_models SET task = 'text', is_default = 0 WHERE provider = 'workers-ai' AND task IN ('vision', 'image')").run();

    const row = await db.prepare("SELECT task, enabled, is_default FROM ai_models WHERE id = '@cf/meta/llama-3.2-11b-vision-instruct'").first<{ task: string; enabled: number; is_default: number }>();
    // Moved to a lane it works in, still selectable, and no longer pinned as a
    // default it could never honour.
    expect(row).toMatchObject({ task: "text", enabled: 1, is_default: 0 });
    // No Workers AI row is left claiming vision.
    const stray = await db.prepare("SELECT COUNT(*) n FROM ai_models WHERE provider != 'google' AND task IN ('vision','image')").first<{ n: number }>();
    expect(stray!.n).toBe(0);
  });

  it("the sync's default election cannot crown a non-Gemini vision model", async () => {
    const db = env.DB as D1Database;
    // Recreate the live mis-tagged state, using the id that is ACTUALLY on the
    // Cloudflare page — a made-up id is disabled by reconciliation before the
    // election even runs, which made an earlier version of this test vacuous.
    // The upsert preserves `task`, so this row reaches the election still
    // claiming vision.
    await db.prepare(
      `INSERT INTO ai_models (id, task, label, provider, input_rate, output_rate, unit_rate, unit_kind, markup, enabled, is_default)
       VALUES ('@cf/meta/llama-3.2-11b-vision-instruct', 'vision', 'Llama 3.2 11B Vision', 'workers-ai', 4410, 61493, NULL, NULL, 3, 1, 0)
       ON CONFLICT(id) DO UPDATE SET task = 'vision', enabled = 1, is_default = 0`,
    ).run();
    // Leave the Workers AI row as the ONLY enabled vision-tagged candidate. With
    // `gemini-2.0-flash` in play the Gemini rate happens to be cheaper and wins
    // on price alone — which is luck, not a guarantee, and made an earlier
    // version of this test pass with the guard removed.
    await db.prepare("UPDATE ai_models SET enabled = 0 WHERE task = 'vision' AND provider = 'google'").run();
    // No vision default at all, so the election is forced to choose one.
    await db.prepare("UPDATE ai_models SET is_default = 0 WHERE task = 'vision'").run();

    // The row must be ON the page, or reconciliation disables it before the
    // election runs — which is how an earlier version of this test passed with
    // the guard removed.
    const cfWithVision = `${CF_MD}
| @cf/meta/llama-3.2-11b-vision-instruct | $0.049 per M input tokens  $0.676 per M output tokens | 4410 neurons per M input tokens  61493 neurons per M output tokens |
`;
    await syncModelCatalog(db, { markup: 3, fetchMd: fetcher({ [PRICING_SOURCES["workers-ai"]]: cfWithVision, [PRICING_SOURCES.google]: GEM_MD }) });

    const surviving = await db.prepare("SELECT enabled, task FROM ai_models WHERE id = '@cf/meta/llama-3.2-11b-vision-instruct'").first<{ enabled: number; task: string }>();
    // Premise check: it reached the election enabled and still claiming vision.
    expect(surviving).toMatchObject({ enabled: 1, task: "vision" });

    const elected = await db.prepare("SELECT id, provider FROM ai_models WHERE task = 'vision' AND is_default = 1").all<{ id: string; provider: string }>();
    // Drop the provider clause from the election and this row IS crowned —
    // it survives reconciliation (it is on the page) and it is the only
    // vision-tagged candidate, so the assertion is not vacuous.
    expect((elected.results ?? []).map((r) => r.id)).not.toContain("@cf/meta/llama-3.2-11b-vision-instruct");
    // Nothing non-Gemini may hold the vision default, elected or otherwise.
    for (const r of elected.results ?? []) expect(r.provider).toBe("google");
    // Leaving the lane with NO pinned default is a valid outcome, not a
    // failure: `preferredModelForTask` widens vision to the Gemini text lanes
    // and `visionFallbackModel` backs that up, which is what the admin console
    // now says out loud. What matters is that the impostor never wins.
    await db.prepare("UPDATE ai_models SET enabled = 1 WHERE task = 'vision' AND provider = 'google'").run();
  });
});
