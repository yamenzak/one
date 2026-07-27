/**
 * Tenant settings (SPEC §7, §8.10) — branding (login skin + accent, gated by
 * the `branding` entitlement), AI feature toggles, marketplace config,
 * and the Stripe Connect account handle (onboarding lands with the commerce
 * Stripe phase).
 */

import { Hono } from "hono";
import { z } from "zod";
import { AI_TONES, TTS_VOICES, TTS_VOICE_IDS } from "@mossa/protocol";
import { categoriesForRole, resolveAllChannels, parseNotifPrefs, NOTIF_CATEGORIES, parseNotifPolicy, resolveEmailPolicy, sanitizeEmailPolicy, NOTIF_TYPES, notifTemplateOf, notifVarsOf, notifCategoryOf, notifTitleOf, type NotifRole, type NotifType, type StoredNotifPrefs } from "@mossa/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { tenantEntitlements, getConfig } from "./billing-store.js";
import { gateFeature } from "./client-flags.js";
import { nowIso, periodKey } from "./ids.js";
import { parseJson, j } from "./db.js";
import { invalidateHostCache } from "./host-context.js";
import { PROVIDERS, resolveIntegrations, maskIntegrations } from "./integrations.js";
import { resolveEmailConfig, maskEmailConfig } from "./email-provider.js";

const notifRole = (r: string | null | undefined): NotifRole => (r === "owner" || r === "trainer" || r === "assistant" || r === "client" ? r : "member");
import { AI_FEATURES } from "./ai-features.js";
import { listModels, modelCostPerRequest } from "./ai.js";

export const settingsRoutes = new Hono<AppEnv>()
  .get("/settings", async (c) => {
    const who = requireTenant(c)!;
    const row = await c.env.DB.prepare("SELECT * FROM tenant_settings WHERE tenant_id = ?")
      .bind(who.tenantId)
      .first<{ branding_json: string | null; ai_toggles_json: string | null; marketplace_json: string | null; integrations_json: string | null; email_config_json: string | null; notif_policy_json: string | null; stripe_account_id: string | null }>();
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    const platformFrom = (await getConfig(c.env.DB))["email.platform_from"] || "Mossa <noreply@fourdegreelabs.com>";
    return c.json({
      branding: parseJson(row?.branding_json, { accent: null, logoUrl: null, welcome: null }),
      aiToggles: parseJson(row?.ai_toggles_json, {}),
      marketplace: parseJson(row?.marketplace_json, { enabled: false, selfRegister: false, requireActiveAccess: false }),
      integrations: maskIntegrations(resolveIntegrations(parseJson(row?.integrations_json ?? null, {}))),
      integrationProviders: PROVIDERS,
      email: maskEmailConfig(resolveEmailConfig(parseJson(row?.email_config_json ?? null, {}))),
      emailPlatformFrom: platformFrom,
      // What ONE email costs on the Mossa lane. Brevo is the studio's own
      // account and costs them nothing here, so the number is only meaningful
      // for the platform provider — the UI shows it only there.
      emailCreditsEach: Number((await getConfig(c.env.DB))["email.credits_per_email"] ?? "1"),
      // Owner-governed studio-wide email allow-list, by category AND audience
      // (email clients vs staff about a category, separately).
      notifCategories: NOTIF_CATEGORIES,
      notifPolicy: {
        client: resolveEmailPolicy(parseNotifPolicy(row?.notif_policy_json ?? null), "client"),
        staff: resolveEmailPolicy(parseNotifPolicy(row?.notif_policy_json ?? null), "staff"),
      },
      stripeConnected: Boolean(row?.stripe_account_id),
      entitlements: ent,
    });
  })

  .patch("/settings", async (c) => {
    const who = requireTenant(c)!;
    // Studio-level config (branding, marketplace, integrations) is the owner's —
    // employed trainers/assistants can't change it.
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const tokenMap = z.record(z.string(), z.string().max(120));
    const parsed = z
      .object({
        branding: z
          .object({
            preset: z.string().max(40).nullish(),
            primary: z.string().max(120).nullish(),
            primaryForeground: z.string().max(120).nullish(),
            radius: z.number().min(0.2).max(2).nullish(),
            // Elevation preset (scales every --shadow-* token) and the hairline
            // colour. An enum, not free-form CSS: a mistyped box-shadow reaching
            // `applyBranding` would inject broken CSS into every page.
            shadow: z.enum(["none", "subtle", "soft", "dramatic"]).nullish(),
            borderColor: z.string().max(120).nullish(),
            borderWidth: z.number().min(0).max(4).nullish(),
            // Surface tint. Only a generator input — the tokens carry the effect —
            // but it has to persist or the next colour change silently discards it.
            neutral: z.enum(["brand", "gray", "cool", "warm"]).nullish(),
            defaultMode: z.enum(["dark", "light"]).nullish(),
            logoUrl: z.string().max(500).nullish(),
            iconUrl: z.string().max(500).nullish(),
            aiAvatarUrl: z.string().max(500).nullish(),
            aiName: z.string().max(40).nullish(),
            tokens: z.object({ light: tokenMap.nullish(), dark: tokenMap.nullish() }).nullish(),
            // Sign-in screen copy + affordances (branded login).
            login: z.object({
              tagline: z.string().max(60).nullish(),
              headline: z.string().max(120).nullish(),
              subtext: z.string().max(200).nullish(),
              bgImageUrl: z.string().max(500).nullish(),
              showPasskey: z.boolean().nullish(),
            }).nullish(),
            // Legacy fields kept for backward compatibility.
            accent: z.string().nullish(),
            welcome: z.string().max(300).nullish(),
          })
          .optional(),
        aiToggles: z.record(z.string(), z.boolean()).optional(),
        marketplace: z.object({ enabled: z.boolean().optional(), selfRegister: z.boolean().optional(), requireActiveAccess: z.boolean().optional() }).optional(),
        // Per-provider: { enabled?, <keyField>?: string }. Empty string clears a key.
        integrations: z.record(z.string(), z.record(z.string(), z.union([z.boolean(), z.string().max(200)]))).optional(),
        // Email provider: platform (metered) | brevo (own key) | off.
        email: z.object({
          provider: z.enum(["platform", "brevo", "off"]).optional(),
          brevoApiKey: z.string().max(200).optional(),
          senderEmail: z.string().max(200).optional(),
          senderName: z.string().max(120).optional(),
        }).optional(),
        // Studio-wide email allow-list, per audience: category → may email.
        notifPolicy: z.object({
          client: z.record(z.string(), z.boolean()).optional(),
          staff: z.record(z.string(), z.boolean()).optional(),
        }).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;

    // Branding edits require the entitlement.
    if (d.branding) {
      const gate = await gateFeature(c, "branding"); if (gate) return gate;
    }

    const existing = await c.env.DB.prepare("SELECT branding_json, ai_toggles_json, marketplace_json, integrations_json FROM tenant_settings WHERE tenant_id = ?")
      .bind(who.tenantId)
      .first<{ branding_json: string | null; ai_toggles_json: string | null; marketplace_json: string | null; integrations_json: string | null }>();
    const branding = { ...parseJson(existing?.branding_json, {}), ...(d.branding ?? {}) };
    const aiToggles = { ...parseJson(existing?.ai_toggles_json, {}), ...(d.aiToggles ?? {}) };
    const marketplace = { ...parseJson(existing?.marketplace_json, {}), ...(d.marketplace ?? {}) };

    // Merge integrations provider-by-provider so keys aren't clobbered.
    const integrations = resolveIntegrations(parseJson(existing?.integrations_json ?? null, {})) as Record<string, Record<string, unknown>>;
    if (d.integrations) {
      for (const [pid, patch] of Object.entries(d.integrations)) {
        integrations[pid] = { ...(integrations[pid] ?? {}), ...patch };
      }
    }

    await c.env.DB.prepare(
      "INSERT INTO tenant_settings (tenant_id, branding_json, ai_toggles_json, marketplace_json, integrations_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET branding_json = ?, ai_toggles_json = ?, marketplace_json = ?, integrations_json = ?, updated_at = ?",
    )
      .bind(who.tenantId, j(branding), j(aiToggles), j(marketplace), j(integrations), nowIso(), j(branding), j(aiToggles), j(marketplace), j(integrations), nowIso())
      .run();

    // Branding changed → drop cached host resolutions for this tenant's custom
    // domains so white-label branding refreshes without waiting out the 60s TTL.
    if (d.branding) {
      const domains = await c.env.DB.prepare("SELECT hostname FROM tenant_domains WHERE tenant_id = ?").bind(who.tenantId).all<{ hostname: string }>().catch(() => ({ results: [] as { hostname: string }[] }));
      for (const dom of domains.results ?? []) await invalidateHostCache(c.env, dom.hostname);
    }

    // Email provider config, merged so a blank key doesn't wipe a set one unless
    // explicitly cleared (empty string clears; undefined keeps).
    if (d.email) {
      const cur = resolveEmailConfig(parseJson((await c.env.DB.prepare("SELECT email_config_json FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ email_config_json: string | null }>())?.email_config_json ?? null, {}));
      const next = {
        provider: d.email.provider ?? cur.provider,
        brevoApiKey: d.email.brevoApiKey !== undefined ? d.email.brevoApiKey : cur.brevoApiKey,
        senderEmail: d.email.senderEmail !== undefined ? d.email.senderEmail : cur.senderEmail,
        senderName: d.email.senderName !== undefined ? d.email.senderName : cur.senderName,
      };
      await c.env.DB.prepare("UPDATE tenant_settings SET email_config_json = ?, updated_at = ? WHERE tenant_id = ?").bind(j(next), nowIso(), who.tenantId).run();
    }

    // Studio-wide email allow-list, merged category-by-category (unknown keys dropped).
    if (d.notifPolicy) {
      const cur = parseNotifPolicy((await c.env.DB.prepare("SELECT notif_policy_json FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ notif_policy_json: string | null }>())?.notif_policy_json ?? null);
      const emailAudience: Record<string, Record<string, boolean>> = { ...(cur.emailAudience as Record<string, Record<string, boolean>> ?? {}) };
      for (const a of ["client", "staff"] as const) {
        if (d.notifPolicy[a]) emailAudience[a] = { ...(emailAudience[a] ?? {}), ...sanitizeEmailPolicy(d.notifPolicy[a]!) };
      }
      const next = { ...(cur.emailCategories ? { emailCategories: cur.emailCategories } : {}), emailAudience };
      await c.env.DB.prepare("UPDATE tenant_settings SET notif_policy_json = ?, updated_at = ? WHERE tenant_id = ?").bind(j(next), nowIso(), who.tenantId).run();
    }
    return c.json({ ok: true });
  })

  // Per-user notification preferences (any member; scoped to their own row).
  .get("/notification-prefs", async (c) => {
    const who = requireTenant(c)!;
    const role = notifRole(c.get("role"));
    const row = await c.env.DB.prepare("SELECT notif_json FROM user_prefs WHERE user_id = ?").bind(who.userId).first<{ notif_json: string | null }>();
    return c.json({
      categories: categoriesForRole(role),
      prefs: resolveAllChannels(role, parseNotifPrefs(row?.notif_json ?? null)),
    });
  })

  .patch("/notification-prefs", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z.record(z.string(), z.object({ inbox: z.boolean().optional(), email: z.boolean().optional() }))
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const row = await c.env.DB.prepare("SELECT notif_json FROM user_prefs WHERE user_id = ?").bind(who.userId).first<{ notif_json: string | null }>();
    const cur = parseNotifPrefs(row?.notif_json ?? null) as StoredNotifPrefs;
    for (const [cat, patch] of Object.entries(parsed.data)) {
      cur[cat as keyof StoredNotifPrefs] = { ...(cur[cat as keyof StoredNotifPrefs] ?? {}), ...patch };
    }
    await c.env.DB.prepare(
      "INSERT INTO user_prefs (user_id, notif_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET notif_json = ?, updated_at = ?",
    ).bind(who.userId, j(cur), nowIso(), j(cur), nowIso()).run();
    return c.json({ ok: true });
  })

  // ── Email white-label (owner): per-type template overrides + a signature ─────
  // Lists every templatable type with its registry default merged with any
  // tenant override, plus the exposed {{variables}} and the global signature.
  .get("/email-templates", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const rows = await c.env.DB.prepare("SELECT type, subject, body, enabled FROM email_templates WHERE tenant_id = ?").bind(who.tenantId).all<{ type: string; subject: string | null; body: string | null; enabled: number }>();
    const overrides = new Map((rows.results ?? []).map((r) => [r.type, r]));
    const sig = await c.env.DB.prepare("SELECT email_signature FROM tenant_settings WHERE tenant_id = ?").bind(who.tenantId).first<{ email_signature: string | null }>();
    const templates = (Object.keys(NOTIF_TYPES) as NotifType[])
      .filter((t) => notifTemplateOf(t))
      .map((t) => {
        const def = notifTemplateOf(t)!;
        const ov = overrides.get(t);
        return {
          type: t,
          label: notifTitleOf(t) ?? t.replace(/_/g, " "),
          category: notifCategoryOf(t),
          vars: ["studioName", ...notifVarsOf(t)],
          defaultSubject: def.subject,
          defaultBody: def.body,
          subject: ov?.subject ?? def.subject,
          body: ov?.body ?? def.body,
          enabled: ov ? ov.enabled === 1 : true,
          customized: !!ov,
        };
      });
    return c.json({ templates, signature: sig?.email_signature ?? "" });
  })

  .put("/email-templates/:type", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const type = c.req.param("type");
    if (!(type in NOTIF_TYPES) || !notifTemplateOf(type as NotifType)) return c.json({ error: "not a templatable type" }, 400);
    const b = z.object({ subject: z.string().max(200), body: z.string().max(8000), enabled: z.boolean().default(true) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid body" }, 400);
    await c.env.DB.prepare(
      "INSERT INTO email_templates (tenant_id, type, subject, body, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, type) DO UPDATE SET subject = excluded.subject, body = excluded.body, enabled = excluded.enabled, updated_at = excluded.updated_at",
    ).bind(who.tenantId, type, b.data.subject, b.data.body, b.data.enabled ? 1 : 0, nowIso()).run();
    return c.json({ ok: true });
  })

  // Reset a type to its registry default (drop the override).
  .delete("/email-templates/:type", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    await c.env.DB.prepare("DELETE FROM email_templates WHERE tenant_id = ? AND type = ?").bind(who.tenantId, c.req.param("type")).run();
    return c.json({ ok: true });
  })

  .put("/email-signature", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const b = z.object({ signature: z.string().max(600) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid body" }, 400);
    await c.env.DB.prepare("UPDATE tenant_settings SET email_signature = ? WHERE tenant_id = ?").bind(b.data.signature || null, who.tenantId).run();
    return c.json({ ok: true });
  })

  // AI configuration surface: the feature registry + model catalog + tones,
  // plus the tenant's current per-feature overrides.
  .get("/settings/ai", async (c) => {
    const who = requireTenant(c)!;
    // AI configuration is owner-only — trainers use the AI, they don't tune it.
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const row = await c.env.DB.prepare("SELECT ai_config_json FROM tenant_settings WHERE tenant_id = ?")
      .bind(who.tenantId)
      .first<{ ai_config_json: string | null }>();
    // `costPerRequest` is what makes the picker a real decision: credits are the
    // owner's currency, and a raw neuron rate card is not one. The markup and
    // the neuron rates that produce it stay server-side.
    const models = (await listModels(c.env.DB)).map((m) => ({
      id: m.id, label: m.label, task: m.task, provider: m.provider, costPerRequest: modelCostPerRequest(m),
    }));
    return c.json({ features: AI_FEATURES, models, tones: AI_TONES, voices: TTS_VOICES, config: parseJson(row?.ai_config_json, {}) });
  })

  // Save AI config: house tone + per-feature enable/model/prompt/tone. Owner-only.
  .patch("/settings/ai", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const featurePatch = z.object({
      enabled: z.boolean().optional(),
      model: z.string().max(120).nullish(),
      system: z.string().max(8000).nullish(),
      tone: z.string().max(40).nullish(),
    });
    const parsed = z
      .object({ tone: z.string().max(40).nullish(), ttsVoice: z.enum(TTS_VOICE_IDS as [string, ...string[]]).nullish(), perClientDailyCreditCap: z.number().int().min(0).max(1_000_000).nullish(), features: z.record(z.string(), featurePatch).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;

    const row = await c.env.DB.prepare("SELECT ai_config_json FROM tenant_settings WHERE tenant_id = ?")
      .bind(who.tenantId)
      .first<{ ai_config_json: string | null }>();
    const existing = parseJson<{ tone?: string | null; ttsVoice?: string | null; perClientDailyCreditCap?: number | null; features?: Record<string, Record<string, unknown>> }>(row?.ai_config_json, {});
    const merged: { tone?: string | null; ttsVoice?: string | null; perClientDailyCreditCap?: number | null; features: Record<string, Record<string, unknown>> } = {
      tone: d.tone !== undefined ? d.tone : existing.tone ?? null,
      ttsVoice: d.ttsVoice !== undefined ? d.ttsVoice : existing.ttsVoice ?? null,
      perClientDailyCreditCap: d.perClientDailyCreditCap !== undefined ? d.perClientDailyCreditCap : existing.perClientDailyCreditCap ?? null,
      features: { ...(existing.features ?? {}) },
    };
    for (const [key, patch] of Object.entries(d.features ?? {})) {
      merged.features[key] = { ...(merged.features[key] ?? {}), ...patch };
    }

    await c.env.DB.prepare(
      "INSERT INTO tenant_settings (tenant_id, ai_config_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET ai_config_json = ?, updated_at = ?",
    )
      .bind(who.tenantId, j(merged), nowIso(), j(merged), nowIso())
      .run();
    return c.json({ ok: true });
  })

  // AI usage-by-feature breakdown for the owner's credits surface.
  .get("/settings/ai-usage", async (c) => {
    const who = requireTenant(c)!;
    const since = Date.now() - 30 * 86_400_000;
    const rows = await c.env.DB.prepare(
      "SELECT feature, COUNT(*) AS calls, SUM(credits) AS credits FROM ai_generations WHERE tenant_id = ? AND at > ? AND ok = 1 GROUP BY feature ORDER BY credits DESC",
    )
      .bind(who.tenantId, since)
      .all();
    return c.json({ period: periodKey(), usage: rows.results ?? [] });
  });
