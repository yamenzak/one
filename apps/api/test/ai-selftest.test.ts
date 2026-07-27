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
import { syncModelCatalog, evaluateSelfTestOutput, selfTestCheck, SELF_TEST_CHECKS, PRICING_SOURCES, type FetchedDoc } from "../src/ai-routes.js";

const ORIGIN = "http://localhost:8787"; // treated as local by createAuth (non-secure cookies)
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
    expect(r.detail).toMatch(/cannot read images/i);
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

## Gemini 2.0 Flash

*\`gemini-2.0-flash\`*

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
    for (const id of ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash-image", "gemini-2.5-flash-preview-tts"]) {
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
    // The seed tags gemini-2.0-flash as the VISION model. The pricing page has
    // no lane column, and the id reads like a text model — sync used to
    // overwrite `task`, which quietly moved every text feature onto 2.5-pro.
    const beforeTask = (await modelRow("gemini-2.0-flash"))!.task;
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
    // …but its lane is NOT rewritten.
    expect((await modelRow("gemini-2.0-flash"))!.task).toBe(beforeTask);
  });
});
