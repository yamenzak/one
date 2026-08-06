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
  resyncModels,
  defaultModelForTask,
  listLedger,
  tenantEntitlements,
  setTenantOverrides,
} from "./billing-store.js";
import { syncGeminiFromGoogle, hasGeminiKey, isGoogleGenModel } from "./gemini.js";
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
import { stripeCfg, stripeEnabled, syncCatalog, subscriptionCheckout, packCheckout, stripePing, verifySignature, handleWebhook } from "./stripe.js";
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

  /* --------------------------- tenant billing ---------------------------- */
  app.get("/api/billing", async (c) => {
    const t = tenantOf(c);
    // Idempotent monthly grant so the balance reflects the plan on first view.
    await grantForTenant(c.env, t).catch(() => 0);
    const sub = await getSubscription(c.env.DB, t);
    const [plan, plans, packs, balance, ledger, ent] = await Promise.all([
      getPlan(c.env.DB, sub.plan_id),
      listPlans(c.env.DB),
      listPacks(c.env.DB),
      balanceOf(c.env, t),
      listLedger(c.env.DB, t, 30),
      tenantEntitlements(c.env.DB, t),
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
    const visible = models.filter((m) => (isGoogleGenModel(m.cf_model) ? geminiReady : true));
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
      if (typeof id === "string" && models.some((m) => m.id === id && m.task === task)) entries[`ai.default_model.${task}:${t}`] = id;
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
    await setConfig(c.env.DB, clean);
    return c.json({ ok: true });
  });

  app.post("/api/admin/email/test", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const cfg = await getConfig(c.env);
    const to = cfg["email.admin"] || c.env.OPERATOR_EMAIL || "";
    const result = await sendEmail(c.env.DB, {
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
    return c.json({ models: await listModels(c.env.DB) });
  });

  app.put("/api/admin/models/:id", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    await upsertModel(c.env.DB, { id: c.req.param("id"), ...body });
    return c.json({ ok: true });
  });

  // Re-sync the model catalog: the built-in Workers AI + curated Gemini rows
  // (adds new models, refreshes rates), then — if a platform Gemini key is set —
  // fetch Google's live model list and fold in any additional Gemini/Lyria models.
  app.post("/api/admin/models/resync", async (c) => {
    const deny = await requireAdmin(c);
    if (deny) return deny;
    const curated = await resyncModels(c.env.DB);
    const gemini = await syncGeminiFromGoogle(c.env);
    return c.json({
      added: curated.added + gemini.added,
      updated: curated.updated + gemini.updated,
      gemini: gemini.error ? { error: gemini.error } : { added: gemini.added, updated: gemini.updated },
    });
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
  app.post("/api/stripe/webhook", async (c) => {
    const cfg = await stripeCfg(c.env);
    const payload = await c.req.text();
    const sig = c.req.header("stripe-signature") ?? "";
    if (!(await verifySignature(payload, sig, cfg.webhookSecret))) return c.json({ error: "bad signature" }, 400);
    try {
      await handleWebhook(c.env, JSON.parse(payload));
    } catch {
      return c.json({ error: "handler failed" }, 500);
    }
    return c.json({ received: true });
  });
}

function maskKey(v: string | undefined): string {
  if (!v) return "";
  return v.length <= 8 ? "••••" : `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
