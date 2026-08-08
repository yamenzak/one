/**
 * Billing, AI, and Admin routes (BLUEPRINT §24, §25). Registered onto the main
 * Hono app from index.ts. Three surfaces:
 *
 *   /api/me, /api/billing/*, /api/ai/*   tenant-facing (plan, credits, studio)
 *   /api/admin/*                          email-gated operator console
 *   /api/stripe/webhook                   verified Stripe callback
 *
 * Tenancy is single-user (DEMO_TENANT); the admin gate resolves the caller
 * email from Cloudflare Access (or the dev OPERATOR_EMAIL) against ADMIN_EMAILS.
 */

import type { Context, Hono } from "hono";
import type { Env } from "./env.js";
import {
  applySharedSelection,
  disableRetiredModels,
  fetchPricingDoc,
  globalMarkup,
  lanesFor,
  mockModeSettable,
  publishSharedCatalog,
  readSharedCatalog,
  seedAiModels,
  syncModelCatalog,
  type AiMockMode,
} from "@4dl/ai";
import { nowIso } from "@4dl/core";
import { listUserTenants } from "@4dl/tenancy";
import type { Branding as WorkspaceBranding } from "./branding-store.js";
import { storageUsage } from "./storage.js";
import { DEMO_TENANT } from "./db.js";
import {
  getConfig,
  setConfig,
  listPlans,
  getPlan,
  upsertPlan,
  getSubscription,
  updateSubscription,
  listSubscriptions,
  listPacks,
  listModels,
  upsertModel,
  defaultModelForTask,
  listLedger,
  tenantEntitlements,
  setTenantOverrides,
} from "./billing-store.js";
import { hasGeminiKey } from "./gemini.js";
import { checkDowngrade, type Usage } from "./entitlements.js";
import { countScreens } from "./db.js";
import { listChannels } from "./content.js";
import { listBoards } from "./board-store.js";
import { boardUserScope } from "./board-users.js";
import { listFeeds } from "./feeds.js";
import { countTenantScheduleRules } from "./device-schedule-store.js";
import { redeemPromo, createPromo, listPromos, getPromo, setPromoActive } from "./promos.js";
import { listLibrary, listGenres, createLibraryTrack, updateLibraryTrack, deleteLibraryTrack } from "./library-store.js";
import { generate, type AiTask } from "./ai.js";
import { addSlide } from "./content.js";
import { grantForTenant, lifecycleSweep, deleteTenantData } from "./billing-service.js";
import { stripeCfg, stripeEnabled, syncCatalog, subscriptionCheckout, packCheckout, stripePing, handleWebhook } from "./stripe.js";
import { dispatchEvent } from "@4dl/billing-rail";
import { firstSeen, unmarkSeen } from "@4dl/billing";

/** This app's slug on the shared Stripe rail. Stamped into `metadata.app` on
 *  every product, and what an event is attributed to. */
export const SCENA_APP = "scena";

/**
 * Does this Stripe customer belong to a Scena workspace?
 *
 * The `claims` lookup — a SILENCE resolver, never a contradiction. Several event
 * types carry no metadata at all (`invoice.paid` is the common one) and are ours
 * only by customer id, so metadata-only routing would park events that work.
 */
async function tenantByCustomer(db: D1Database, customer: unknown): Promise<boolean> {
  const id = typeof customer === "string" ? customer : null;
  if (!id) return false;
  const row = await db
    .prepare("SELECT tenant_id FROM subscriptions WHERE stripe_customer_id = ?")
    .bind(id)
    .first<{ tenant_id: string }>()
    .catch(() => null);
  return Boolean(row);
}
import { sendEmail, emailShell } from "./mailer.js";
import { requestNuke, confirmNuke } from "./nuke.js";
import { type AppEnv, isPlatformAdmin, tenantOf } from "./auth-context.js";

type App = Hono<AppEnv>;
type Ctx = Context<AppEnv>;

/** Balance view for a tenant from its credit-authority DO. */
async function balanceOf(env: Env, tenantId = DEMO_TENANT) {
  const b = env.BILLING.get(env.BILLING.idFromName(tenantId));
  await b.bind(tenantId);
  return b.view();
}

/** Gather current usage for the downgrade-eligibility diff (§25). */
async function gatherUsage(env: Env, tenantId = DEMO_TENANT): Promise<Usage> {
  const [devices, channels, boards, feeds, scheduleRules] = await Promise.all([
    countScreens(env.DB, tenantId),
    listChannels(env.DB, tenantId),
    listBoards(env.DB),
    listFeeds(env.DB),
    countTenantScheduleRules(env.DB, tenantId),
  ]);
  return {
    pairedDevices: devices,
    channels: channels.length,
    feeds: feeds.length,
    scheduleRules,
    liveBoards: boards.length,
    stations: 0,
  };
}

/**
 * Why an operator's config write might be refused — a message, or null to store.
 *
 * Pure, exported and tested directly (`test/mock-lane.test.ts`) because the
 * branch that matters is the one the integration suite structurally cannot
 * reach: it runs with `ENVIRONMENT: "development"`, and a Workers-pool binding
 * is fixed for the whole runtime. A guard whose production branch is never
 * executed by anything is a guard nobody has checked.
 *
 * ── `ai.mock = "on"` is a DEVELOPMENT override ─────────────────────────────
 *
 * The generation path already refuses to mock outside development (`mayMock` in
 * ai.ts), so storing "on" in production would be inert rather than dangerous.
 * Refusing it anyway is the difference between a setting that does nothing and
 * an operator who believes they turned something on: the console offered this
 * as an ordinary dropdown value, and before the gate it did exactly what it
 * said — fabricated slides, posters and voice clips, billed at the real model's
 * rate and filed in the Media Library as ordinary assets.
 *
 * Refused with a reason rather than dropped, because a silently ignored field
 * is how a config screen comes to lie about the state it displays.
 */
export function configWriteRefusal(config: Record<string, string>, isDevelopment: boolean): string | null {
  const mode = config["ai.mock"];
  if (mode !== undefined && !mockModeSettable(mode as AiMockMode, isDevelopment)) {
    return "ai.mock=on is a development-only setting";
  }
  return null;
}

export function registerBilling(app: App): void {
  /* ------------------------------ identity ------------------------------- */
  // Public probe: returns the resolved session so the dashboard can bootstrap
  // (null user → show login). `tenantId` is the active organization; `role` is
  // the caller's role in it; `isAdmin` is the platform-admin axis.
  app.get("/api/me", async (c) => {
    const user = c.get("user");
    // Board-scoped users land on their control surface, not the operator app.
    // `username` used to ride along here, read off a `"user".username` column
    // Scena added to a table `@4dl/auth` now owns. Nothing signs in with a handle
    // any more, and a station's handle is already in `board.label` and in its
    // `board_users` row — so the field was a second copy of something that had
    // stopped being an identity.
    const board = user ? await boardUserScope(c.env.DB, user.id) : null;
    // The tenant's effective plan gates (features + quotas), so the dashboard can
    // hide/disable what the plan doesn't include — the same source the server enforces.
    const tenantId = c.get("tenantId");
    let features: Record<string, unknown> | null = null;
    let quotas: Record<string, number> | null = null;
    if (tenantId) {
      const ent = await tenantEntitlements(c.env.DB, tenantId).catch(() => null);
      if (ent) { features = ent.features as unknown as Record<string, unknown>; quotas = ent.quotas as unknown as Record<string, number>; }
    }
    return c.json({
      user,
      email: user?.email ?? null,
      tenantId,
      role: c.get("role"),
      isAdmin: isPlatformAdmin(c),
      board,
      features,
      quotas,
      // The caller's effective permission grant — the client mirrors it in useCan.
      permissions: c.get("perms"),
      authenticated: Boolean(user),
    });
  });

  /**
   * EVERY WORKSPACE THIS PERSON BELONGS TO — the signpost's list.
   *
   * Answers on the ROOT door, which is the only place it matters: the root is
   * not anybody's workspace, so the one useful thing it can do for a signed-in
   * visitor is hand them theirs. Without this the root is a dead end for exactly
   * the people who have somewhere to be — and the installed PWA's `start_url` is
   * `/`, so that is not a rare arrival.
   *
   * Separate from `/api/me` rather than folded into it, because `/api/me` runs on
   * every door on every boot and this is a two-table join that only one screen
   * reads.
   *
   * Safe on the root: it is scoped to the CALLER's own memberships, returns only
   * what the signpost draws (name, address, mark), and a visitor with no session
   * gets an empty list rather than a 401 — there is nothing here to refuse.
   */
  app.get("/api/me/workspaces", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ workspaces: [] });
    const mine = await listUserTenants<WorkspaceBranding>(c.env.DB, user.id);
    return c.json({
      workspaces: mine.map((t) => ({
        tenantId: t.tenantId,
        tenantName: t.name,
        tenantSlug: t.slug,
        logoUrl: t.branding?.logoUrl ?? null,
        iconUrl: t.branding?.iconUrl ?? null,
        logoUrlLight: t.branding?.logoUrlLight ?? null,
        iconUrlLight: t.branding?.iconUrlLight ?? null,
      })),
    });
  });

  /* --------------------------- tenant billing ---------------------------- */
  app.get("/api/billing", async (c) => {
    const t = tenantOf(c);
    // Idempotent monthly grant so the balance reflects the plan on first view.
    await grantForTenant(c.env, t).catch(() => 0);
    const sub = await getSubscription(c.env.DB, t);
    const [plan, plans, packs, balance, ledger, ent, storage] = await Promise.all([
      getPlan(c.env.DB, sub.plan_id),
      listPlans(c.env.DB),
      listPacks(c.env.DB),
      balanceOf(c.env, t),
      listLedger(c.env.DB, t, 30),
      tenantEntitlements(c.env.DB, t),
      // Shipped beside the balance because they are the same kind of fact: two
      // meters the plan sets a ceiling on. A quota nobody can see is a quota
      // that surprises you at the moment you most need the upload to work.
      storageUsage(c.env, t),
    ]);
    const cfg = await stripeCfg(c.env);
    return c.json({
      subscription: sub,
      plan,
      entitlements: ent,
      balance,
      plans: plans.filter((p) => p.active === 1),
      packs,
      ledger,
      storage,
      stripeEnabled: stripeEnabled(cfg),
    });
  });

  app.post("/api/billing/downgrade/check", async (c) => {
    const body = await c.req.json<{ planId?: string }>().catch(() => ({}) as { planId?: string });
    const plan = await getPlan(c.env.DB, body.planId ?? "");
    if (!plan) return c.json({ error: "unknown plan" }, 404);
    const ent = await import("./entitlements.js").then((m) => m.resolveEntitlements(plan.entitlements_json));
    const usage = await gatherUsage(c.env, tenantOf(c));
    return c.json({ targetPlan: plan.id, ...checkDowngrade(usage, ent) });
  });

  /**
   * Change plan. When Stripe is enabled, an upgrade goes through Checkout; a
   * downgrade first runs the eligibility check (§25) and is blocked until
   * compliant. With Stripe disabled (dev), the switch applies directly after
   * the same eligibility gate.
   */
  app.post("/api/billing/change-plan", async (c) => {
    const body = await c.req.json<{ planId?: string }>().catch(() => ({}) as { planId?: string });
    const target = await getPlan(c.env.DB, body.planId ?? "");
    if (!target) return c.json({ error: "unknown plan" }, 404);
    const t = tenantOf(c);
    const sub = await getSubscription(c.env.DB, t);
    const current = await getPlan(c.env.DB, sub.plan_id);
    const isDowngrade = (current?.price_cents ?? 0) > target.price_cents;

    if (isDowngrade) {
      const ent = await import("./entitlements.js").then((m) => m.resolveEntitlements(target.entitlements_json));
      const usage = await gatherUsage(c.env, t);
      const check = checkDowngrade(usage, ent);
      if (!check.eligible) return c.json({ blocked: true, ...check }, 409);
    }

    const cfg = await stripeCfg(c.env);
    const paid = target.price_cents > 0 && !sub.comp;
    if (stripeEnabled(cfg) && paid) {
      const origin = new URL(c.req.url).origin;
      try {
        const { url } = await subscriptionCheckout(c.env, target.id, {
          success: `${origin}/billing?checkout=success`,
          cancel: `${origin}/billing?checkout=cancel`,
        }, t);
        return c.json({ checkoutUrl: url });
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "checkout failed" }, 502);
      }
    }

    // A paid plan can't be granted for free: without Stripe configured, only a
    // platform admin may comp a tenant onto a paid plan (via the admin console /
    // an override). A normal tenant clicking a paid plan is told payments aren't
    // enabled, rather than silently receiving it — this closes the "switch plans
    // for free by clicking" hole when Stripe is disabled.
    if (paid && !isPlatformAdmin(c)) {
      return c.json({ error: "payments_unavailable" }, 402);
    }

    // Free target, comped sub, or admin comp: apply immediately and (re)grant.
    await updateSubscription(c.env.DB, t, { plan_id: target.id, status: "active", pending_plan_id: null });
    // Force a fresh grant for the new plan by clearing the period marker.
    const billing = c.env.BILLING.get(c.env.BILLING.idFromName(t));
    await billing.bind(t);
    await grantForTenant(c.env, t).catch(() => 0);
    return c.json({ ok: true, planId: target.id });
  });

  app.post("/api/billing/checkout/pack", async (c) => {
    const body = await c.req.json<{ packId?: string }>().catch(() => ({}) as { packId?: string });
    const origin = new URL(c.req.url).origin;
    try {
      const { url } = await packCheckout(c.env, body.packId ?? "", {
        success: `${origin}/billing?checkout=success`,
        cancel: `${origin}/billing?checkout=cancel`,
      }, tenantOf(c));
      return c.json({ checkoutUrl: url });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "checkout failed" }, 502);
    }
  });

  app.post("/api/billing/promo", async (c) => {
    const body = await c.req.json<{ code?: string }>().catch(() => ({}) as { code?: string });
    if (!body.code?.trim()) return c.json({ error: "code required" }, 400);
    try {
      const t = tenantOf(c);
      const result = await redeemPromo(c.env.DB, body.code, t);
      if (result.kind === "credits" && result.credits) {
        const billing = c.env.BILLING.get(c.env.BILLING.idFromName(t));
        await billing.bind(t);
        await billing.topUp(result.credits, "promo.redeem", body.code.trim().toUpperCase());
      }
      const balance = await balanceOf(c.env, t);
      return c.json({ ok: true, ...result, balance });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "redeem failed" }, 400);
    }
  });

  /* ------------------------------- AI (§24) ------------------------------ */
  app.get("/api/ai/models", async (c) => {
    const models = await listModels(c.env.DB, true);
    // Gemini/Lyria models only appear once the platform Gemini key is configured
    // — otherwise they'd fail at generation with no key.
    const geminiReady = await hasGeminiKey(c.env, tenantOf(c));
    // The `provider` COLUMN, not a prefix test on the id. Same answer today and
    // still the right one when Google ships a model whose name does not begin
    // with "gemini-" — which `lyria-002`, already in the catalog, does not.
    const visible = models.filter((m) => (m.provider === "google" ? geminiReady : true));
    return c.json({ models: visible.map((m) => ({ id: m.id, label: m.label, task: m.task, markup: m.markup })) });
  });

  // The tenant's default model per task (what the generators reach for when a
  // call omits an explicit modelId). Read by Settings + AI Studio.
  app.get("/api/ai/defaults", async (c) => {
    const out: Record<string, string> = {};
    for (const task of ["text", "image", "tts", "music"] as AiTask[]) {
      const m = await defaultModelForTask(c.env.DB, task, tenantOf(c));
      if (m) out[task] = m.id;
    }
    return c.json({ defaults: out });
  });

  app.put("/api/ai/defaults", async (c) => {
    const body = await c.req.json<Record<string, string>>().catch(() => ({}) as Record<string, string>);
    const models = await listModels(c.env.DB, true);
    const t = tenantOf(c);
    const entries: Record<string, string> = {};
    for (const task of ["text", "image", "tts", "music"] as AiTask[]) {
      const id = body[task];
      // Per-tenant override key — a tenant's default model choice must not
      // overwrite the global (admin) default or leak into other tenants.
      //
      // `lanesFor`, because the catalog stores text-to-speech under both `tts`
      // (Cloudflare's page) and `speech` (Google's): an exact `task` comparison
      // silently DISCARDED a workspace's choice of any Gemini voice, and this
      // route answers `{ok: true}` either way.
      const lanes = lanesFor(task);
      if (typeof id === "string" && models.some((m) => m.id === id && lanes.includes(m.task))) entries[`ai.default_model.${task}:${t}`] = id;
    }
    if (Object.keys(entries).length) await setConfig(c.env.DB, entries);
    return c.json({ ok: true });
  });

  app.post("/api/ai/generate", async (c) => {
    const ent = await tenantEntitlements(c.env.DB, tenantOf(c));
    if (!ent.features.aiGeneration) return c.json({ error: "ai generation not in plan" }, 403);
    const body = await c.req
      .json<{ task?: string; modelId?: string; prompt?: string; options?: Record<string, unknown>; channelId?: string; addSlide?: boolean; durationMs?: number }>()
      .catch(() => ({}) as Record<string, never>);
    const task = (["text", "tts", "image", "music"].includes(body.task ?? "") ? body.task : "text") as AiTask;
    if (!body.prompt?.trim()) return c.json({ error: "prompt required" }, 400);

    // modelId is optional — omitted, we fall back to the tenant's per-task default.
    const modelId = body.modelId?.trim() || (await defaultModelForTask(c.env.DB, task, tenantOf(c)))?.id;
    if (!modelId) return c.json({ error: "no model available for task" }, 404);

    const result = await generate(c.env, { task, modelId, prompt: body.prompt, options: body.options, tenantId: tenantOf(c) });
    if (!result.ok) {
      const code = result.error === "insufficient_credits" ? 402 : result.error === "unknown_model" ? 404 : 502;
      return c.json(result, code);
    }

    // Optionally drop the generated content straight into a channel as a slide.
    let slideId: string | undefined;
    if (body.addSlide && body.channelId) {
      if (task === "text" && result.html) {
        slideId = await addSlide(c.env.DB, body.channelId, { type: "html", htmlBody: result.html, durationMs: body.durationMs });
      } else if (result.assetHash && result.assetUrl && task === "image") {
        slideId = await addSlide(c.env.DB, body.channelId, { type: "image", assetHash: result.assetHash, assetUrl: result.assetUrl, durationMs: body.durationMs });
      }
    }
    return c.json({ ...result, slideId });
  });

  // AI layout designer (§24): reads the current canvas and returns a validated
  // set of widget nodes — design-from-scratch or improve/extend the existing
  // layout. Metered like a text generation (see ai.ts `layout` task).
  app.post("/api/ai/layout", async (c) => {
    const ent = await tenantEntitlements(c.env.DB, tenantOf(c));
    if (!ent.features.aiGeneration) return c.json({ error: "ai generation not in plan" }, 403);
    const body = await c.req
      .json<{ modelId?: string; prompt?: string; widgets?: unknown[]; designW?: number; designH?: number }>()
      .catch(() => ({}) as Record<string, never>);
    if (!body.prompt?.trim()) return c.json({ error: "prompt required" }, 400);

    // Layout runs on the tenant's text model (it's a text-in/JSON-out task).
    const modelId = body.modelId?.trim() || (await defaultModelForTask(c.env.DB, "text", tenantOf(c)))?.id;
    if (!modelId) return c.json({ error: "no model available for task" }, 404);

    const result = await generate(c.env, {
      task: "layout",
      modelId,
      prompt: body.prompt,
      options: {
        currentWidgets: Array.isArray(body.widgets) ? body.widgets : [],
        designW: body.designW,
        designH: body.designH,
      },
      tenantId: tenantOf(c),
    });
    if (!result.ok) {
      const code = result.error === "insufficient_credits" ? 402 : result.error === "unknown_model" ? 404 : 502;
      return c.json(result, code);
    }
    return c.json(result);
  });

  /* -------------------------- admin console ------------------------------ */
  // The routeGuard already gates /api/admin/* on isPlatformAdmin; this is
  // defense-in-depth using the same session-based check (a signed-in user whose
  // email is in ADMIN_EMAILS), not the pre-auth OPERATOR_EMAIL fallback.
  const requireAdmin = (c: Ctx): Response | null => {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return null;
  };

  app.get("/api/admin/config", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const cfg = await getConfig(c.env);
    // Mask the secret key so it never round-trips to the client in full.
    const masked = { ...cfg, "stripe.secret_key": maskKey(cfg["stripe.secret_key"]), "stripe.webhook_secret": maskKey(cfg["stripe.webhook_secret"]), "email.api_key": maskKey(cfg["email.api_key"]), "google.gemini_key": maskKey(cfg["google.gemini_key"]), "weather.api_key": maskKey(cfg["weather.api_key"]) };
    return c.json({ config: masked });
  });

  app.put("/api/admin/config", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const body = await c.req.json<{ config?: Record<string, string> }>().catch(() => ({}) as { config?: Record<string, string> });
    const entries = body.config ?? {};
    // Ignore masked values the client echoed back unchanged.
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(entries)) if (!v.includes("••")) clean[k] = v;
    const refusal = configWriteRefusal(clean, c.env.ENVIRONMENT === "development");
    if (refusal) return c.json({ error: refusal }, 400);
    await setConfig(c.env.DB, clean);
    return c.json({ ok: true });
  });

  app.post("/api/admin/email/test", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const cfg = await getConfig(c.env);
    const to = cfg["email.admin"] || c.env.OPERATOR_EMAIL || "";
    const result = await sendEmail(c.env, {
      to,
      subject: "Scena test email",
      html: emailShell("Test email", "<p>Your Scena email delivery is configured correctly.</p>"),
    }, c.env.EMAIL);
    return c.json({ to, ...result });
  });

  /* --- factory reset (nuke): email an OTP, then wipe EVERYTHING (§admin) --- */
  app.post("/api/admin/nuke/request", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const to = c.get("user")?.email;
    if (!to) return c.json({ error: "no admin email on file" }, 400);
    await requestNuke(c.env, to);
    // Reveal only the masked recipient so the UI can say where the code went.
    return c.json({ ok: true, sentTo: to });
  });

  app.post("/api/admin/nuke/confirm", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const body = await c.req.json<{ otp?: string; phrase?: string }>().catch(() => ({}) as { otp?: string; phrase?: string });
    // Belt-and-suspenders: a typed phrase in addition to the emailed code.
    if ((body.phrase ?? "").trim() !== "WIPE EVERYTHING") return c.json({ error: 'type "WIPE EVERYTHING" to confirm' }, 400);
    try {
      const r = await confirmNuke(c.env, body.otp ?? "");
      return c.json({ ok: true, ...r });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "wipe failed" }, 400);
    }
  });

  app.get("/api/admin/stripe/ping", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    return c.json(await stripePing(c.env));
  });

  app.post("/api/admin/stripe/sync", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    try {
      return c.json({ ok: true, ...(await syncCatalog(c.env)) });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "sync failed" }, 502);
    }
  });

  app.get("/api/admin/plans", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    return c.json({ plans: await listPlans(c.env.DB) });
  });

  app.put("/api/admin/plans/:id", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const body = await c.req.json<{ name?: string; price_cents?: number; entitlements_json?: string; active?: number; sort?: number }>().catch(() => ({}));
    await upsertPlan(c.env.DB, { id: c.req.param("id"), ...body });
    return c.json({ ok: true });
  });

  app.get("/api/admin/models", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    /*
      THREE THINGS BEFORE THE READ, all of them `@4dl/ai`'s and all idempotent.

      `seedAiModels(DB, env)` — WITH the env, unlike `ensureBilling`'s call. That
      is what lets a fresh deployment arrive with the whole priced catalog the
      platform has already parsed from the two pricing pages, instead of living
      on the curated floor until somebody presses Sync.

      `applySharedSelection` — whatever another 4DL app broadcast with "apply to
      every app" and this one has not seen yet. Applied here so an operator who
      goes looking sees the effect immediately.

      `disableRetiredModels` — anything whose announced shutdown date came true
      since the last sync. A console that shows a model as available when the
      provider has stopped answering is worse than one that shows nothing.

      All three swallow their errors: this is a READ, and none of them failing is
      a reason an operator cannot see the catalog.
    */
    await seedAiModels(c.env.DB, c.env).catch(() => undefined);
    await applySharedSelection(c.env).catch(() => undefined);
    await disableRetiredModels(c.env.DB).catch(() => undefined);
    return c.json({ models: await listModels(c.env.DB) });
  });

  app.put("/api/admin/models/:id", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    await upsertModel(c.env.DB, { id: c.req.param("id"), ...body });
    return c.json({ ok: true });
  });

  /**
   * RE-SYNC THE CATALOG AGAINST THE PROVIDERS' OWN PRICING PAGES.
   *
   * ── What this replaces, twice over ─────────────────────────────────────────
   *
   * First it called `resyncModels`, which upserted every row of a hardcoded list
   * and returned how many rows it touched. An operator pressed "Sync", read
   * "17 updated", and reasonably concluded the rates had been refreshed from
   * Cloudflare. Nothing was fetched; the same constants were written back over
   * themselves, and Scena went on metering real credits against whatever they
   * said on the day somebody typed them.
   *
   * Then it grew a hand-written `syncScenaModelRates` + `syncGeminiFromGoogle`
   * beside it — ~200 lines reimplementing what `@4dl/ai` already did, because
   * Scena's `ai_models` keyed differently and could not use the shared syncer.
   * That is fixed at the schema now, so this is the shared path, and it brings
   * three things the local pair never had:
   *
   *   PUBLISHES  a successful sync writes what it parsed to the shared platform
   *              store, so a brand-new 4DL app seeds its whole priced catalog on
   *              first boot instead of living on eleven hardcoded rows.
   *   FALLS BACK when both pages fail — a doc-format change, a provider having a
   *              bad day — it applies the LAST published catalog rather than
   *              reporting total failure and applying nothing.
   *   RE-ELECTS  a lane whose default was just retired or delisted gets the
   *              cheapest surviving model in the same pass.
   *
   * 502 only when NEITHER provider produced a usable parse AND no shared catalog
   * could stand in. A one-sided failure did real work and must report it.
   */
  app.post("/api/admin/models/resync", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    // The MERGED config: a markup set once for the platform reaches the rows this
    // sync inserts. It is the default for NEW rows only — an existing row keeps
    // its own column, which is what the per-model control edits.
    const cfg = await getConfig(c.env);
    const markup = globalMarkup(cfg);

    let report = await syncModelCatalog(c.env.DB, { markup, fetchMd: fetchPricingDoc });
    let published = false;
    if (report.ok) {
      published = await publishSharedCatalog(c.env, report.parsedModels, "Scena", nowIso());
    } else {
      const shared = await readSharedCatalog(c.env);
      if (shared) report = await syncModelCatalog(c.env.DB, { markup, fetchMd: fetchPricingDoc, from: shared.models });
    }

    // `parsedModels` is the input to the publication above, not something an
    // operator screen has any use for — dropped before serialising.
    const { parsedModels: _dropped, ...body } = report;
    return c.json({ ...body, published }, report.ok ? 200 : 502);
  });

  // Licensed music library (§16 ext) — the global, admin-curated catalog.
  app.get("/api/admin/library", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    return c.json({ tracks: await listLibrary(c.env.DB), genres: await listGenres(c.env.DB) });
  });

  app.post("/api/admin/library", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const body = await c.req.json<{ genre?: string; title?: string; artist?: string; assetHash?: string; assetUrl?: string; durationMs?: number; artHash?: string; artUrl?: string; vocal?: string }>().catch(() => ({}) as Record<string, never>);
    if (!body.assetHash || !body.assetUrl) return c.json({ error: "track needs an uploaded asset" }, 400);
    if (!(body.durationMs && body.durationMs > 0)) return c.json({ error: "track needs a duration" }, 400);
    const vocal = body.vocal === "vocal" || body.vocal === "instrumental" ? body.vocal : undefined;
    const id = await createLibraryTrack(c.env.DB, { genre: body.genre ?? "", title: body.title ?? "", artist: body.artist ?? "", assetHash: body.assetHash, assetUrl: body.assetUrl, durationMs: body.durationMs, artHash: body.artHash, artUrl: body.artUrl, vocal });
    return c.json({ id });
  });

  app.put("/api/admin/library/:id", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const body = await c.req.json<{ genre?: string; title?: string; artist?: string; vocal?: string | null; artHash?: string | null; artUrl?: string | null }>().catch(() => ({}) as Record<string, never>);
    const vocal = body.vocal === "vocal" || body.vocal === "instrumental" ? body.vocal : body.vocal === null || body.vocal === "" ? null : undefined;
    await updateLibraryTrack(c.env.DB, c.req.param("id"), { genre: body.genre, title: body.title, artist: body.artist, vocal, artHash: body.artHash, artUrl: body.artUrl });
    return c.json({ ok: true });
  });

  app.delete("/api/admin/library/:id", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    await deleteLibraryTrack(c.env.DB, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/api/admin/promos", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    return c.json({ promos: await listPromos(c.env.DB) });
  });

  app.post("/api/admin/promos", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const body = await c.req
      .json<{ code?: string; kind?: string; credits?: number; planId?: string; planMonths?: number; maxRedemptions?: number | null; perTenantLimit?: number | null; expiresAt?: number | null; note?: string }>()
      .catch(() => ({}) as Record<string, never>);
    if (!body.code?.trim()) return c.json({ error: "code required" }, 400);
    const kind = body.kind === "plan" ? "plan" : "credits";
    if (await getPromo(c.env.DB, body.code)) return c.json({ error: "code exists" }, 409);
    await createPromo(c.env.DB, {
      code: body.code,
      kind,
      credits: body.credits,
      planId: body.planId,
      planMonths: body.planMonths,
      maxRedemptions: body.maxRedemptions ?? null,
      perTenantLimit: body.perTenantLimit ?? null,
      expiresAt: body.expiresAt ?? null,
      note: body.note,
    });
    return c.json({ ok: true });
  });

  app.post("/api/admin/promos/:code/toggle", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const promo = await getPromo(c.env.DB, c.req.param("code"));
    if (!promo) return c.json({ error: "not found" }, 404);
    await setPromoActive(c.env.DB, promo.code, promo.active !== 1);
    return c.json({ ok: true, active: promo.active !== 1 });
  });

  app.get("/api/admin/tenants", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const subs = await listSubscriptions(c.env.DB);
    const tenants = await Promise.all(
      subs.map(async (s) => ({ ...s, balance: (await balanceOf(c.env, s.tenant_id)).balance })),
    );
    return c.json({ tenants });
  });

  // Per-tenant entitlement overrides (§25 gifts): plan baseline + overrides + effective.
  app.get("/api/admin/tenants/:id/entitlements", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const tenantId = c.req.param("id");
    const sub = await getSubscription(c.env.DB, tenantId);
    const plan = await getPlan(c.env.DB, sub.plan_id);
    const planEnt = await import("./entitlements.js").then((m) => m.resolveEntitlements(plan?.entitlements_json));
    let overrides: unknown = {};
    try { overrides = sub.overrides_json ? JSON.parse(sub.overrides_json) : {}; } catch { /* ignore */ }
    const effective = await tenantEntitlements(c.env.DB, tenantId);
    return c.json({ planId: sub.plan_id, plan: planEnt, overrides, effective });
  });

  app.put("/api/admin/tenants/:id/overrides", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const body = await c.req.json<{ overrides?: unknown }>().catch(() => ({}) as { overrides?: unknown });
    const json = body.overrides && Object.keys(body.overrides).length ? JSON.stringify(body.overrides) : null;
    await setTenantOverrides(c.env.DB, c.req.param("id"), json);
    return c.json({ ok: true });
  });

  app.post("/api/admin/tenants/:id/credits", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const body = await c.req.json<{ mode?: string; credits?: number }>().catch(() => ({}) as { mode?: string; credits?: number });
    const billing = c.env.BILLING.get(c.env.BILLING.idFromName(c.req.param("id")));
    await billing.bind(c.req.param("id"));
    const view = body.mode === "set" ? await billing.setBalance(body.credits ?? 0) : await billing.topUp(body.credits ?? 0, "admin.grant");
    return c.json({ ok: true, balance: view });
  });

  app.post("/api/admin/tenants/:id/lifecycle", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const tenantId = c.req.param("id");
    // The demo/sandbox tenant backs the signed-out demo + fallback content, so it
    // must never be suspended or deleted — that would break the public demo.
    if (tenantId === DEMO_TENANT) return c.json({ error: "The demo tenant can't be changed." }, 400);
    const body = await c.req.json<{ action?: string }>().catch(() => ({}) as { action?: string });
    if (body.action === "suspend") await updateSubscription(c.env.DB, tenantId, { status: "suspended", delete_at: null });
    else if (body.action === "reactivate") await updateSubscription(c.env.DB, tenantId, { status: "active", past_due_at: null, suspend_at: null, delete_at: null });
    else if (body.action === "delete") {
      await deleteTenantData(c.env, tenantId);
      await updateSubscription(c.env.DB, tenantId, { status: "canceled", plan_id: "free" });
    } else return c.json({ error: "unknown action" }, 400);
    return c.json({ ok: true });
  });

  app.post("/api/admin/lifecycle/sweep", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    return c.json({ actions: await lifecycleSweep(c.env) });
  });

  /* --------------------------- stripe webhook ---------------------------- */
  /**
   * The platform webhook, on `@4dl/billing-rail`.
   *
   * ONE STRIPE ACCOUNT, MANY APPS. The rail verifies the signature once,
   * attributes the event to an app, and parks what it cannot attribute in
   * `rail_parked_events` — with its payload, so an operator can read it.
   *
   * ── Two things this replaces, and both were real ──────────────────────────
   *
   * **There was NO IDEMPOTENCY.** Stripe retries on any non-2xx and sometimes
   * redelivers a successful one. Every redelivery of a
   * `checkout.session.completed` carrying a credit pack ran `topUp` again — the
   * pack granted twice, three times, as many times as the delivery repeated,
   * each answered a correct-looking 200. `firstSeen` claims the id; `release`
   * gives it back when the handler throws, so a genuine transient failure is
   * still retried rather than swallowed as a duplicate.
   *
   * **An unattributable event became the DEMO TENANT.** `handleWebhook` read
   * `meta.scena_tenant || DEMO_TENANT`, so an event with no Scena metadata — one
   * belonging to another app on the same account, or one of Scena's own where
   * the metadata did not survive — was applied to a real workspace's
   * subscription and balance. The rail refuses to guess: no attribution, no
   * handler, the event parks.
   *
   * `claims` is what stops the switch to metadata-routing being a regression:
   * `invoice.paid` and `customer.subscription.*` often carry no metadata at all
   * and are Scena's only by their Stripe CUSTOMER id.
   */
  app.post("/api/stripe/webhook", async (c) => {
    const cfg = await stripeCfg(c.env);
    const payload = await c.req.text();
    const sig = c.req.header("stripe-signature") ?? "";
    const outcome = await dispatchEvent(
      { DB: c.env.DB },
      {
        apps: [{
          slug: SCENA_APP,
          metadataPrefix: "scena",
          claims: async (e) => tenantByCustomer(c.env.DB, (e.data.object as { customer?: unknown }).customer),
          handle: (e) => handleWebhook(c.env, e as never),
        }],
        firstSeen: (id) => firstSeen(c.env.DB, id),
        // A failure inside the handler (DO/D1 transient) must NOT leave the id
        // marked seen, or Stripe's retry is dropped as a duplicate. The rail
        // releases the claim and rethrows, so the worker 500s and Stripe
        // redelivers.
        release: (id) => unmarkSeen(c.env.DB, id),
      },
      payload,
      sig,
      cfg.webhookSecret,
    );
    return c.json(outcome.body, outcome.status as 200);
  });
}

function maskKey(v: string | undefined): string {
  if (!v) return "";
  return v.length <= 8 ? "••••" : `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
