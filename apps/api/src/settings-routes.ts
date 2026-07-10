/**
 * Tenant settings (SPEC §7, §8.10) — branding (login skin + accent, gated by
 * the `branding` entitlement), AI feature toggles, marketplace config,
 * and the Stripe Connect account handle (onboarding lands with the commerce
 * Stripe phase).
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { tenantEntitlements } from "./billing-store.js";
import { nowIso, periodKey } from "./ids.js";
import { parseJson, j } from "./db.js";

export const settingsRoutes = new Hono<AppEnv>()
  .get("/settings", async (c) => {
    const who = requireTenant(c)!;
    const row = await c.env.DB.prepare("SELECT * FROM tenant_settings WHERE tenant_id = ?")
      .bind(who.tenantId)
      .first<{ branding_json: string | null; ai_toggles_json: string | null; marketplace_json: string | null; stripe_account_id: string | null }>();
    const ent = await tenantEntitlements(c.env.DB, who.tenantId);
    return c.json({
      branding: parseJson(row?.branding_json, { accent: null, logoUrl: null, welcome: null }),
      aiToggles: parseJson(row?.ai_toggles_json, {}),
      marketplace: parseJson(row?.marketplace_json, { enabled: false, selfRegister: false }),
      stripeConnected: Boolean(row?.stripe_account_id),
      entitlements: ent,
    });
  })

  .patch("/settings", async (c) => {
    const who = requireTenant(c)!;
    const parsed = z
      .object({
        branding: z.object({ accent: z.string().nullish(), logoUrl: z.string().nullish(), welcome: z.string().max(300).nullish() }).optional(),
        aiToggles: z.record(z.string(), z.boolean()).optional(),
        marketplace: z.object({ enabled: z.boolean().optional(), selfRegister: z.boolean().optional() }).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;

    // Branding edits require the entitlement.
    if (d.branding) {
      const ent = await tenantEntitlements(c.env.DB, who.tenantId);
      if (!ent.features.branding) return c.json({ error: "branding not in your plan" }, 403);
    }

    const existing = await c.env.DB.prepare("SELECT branding_json, ai_toggles_json, marketplace_json FROM tenant_settings WHERE tenant_id = ?")
      .bind(who.tenantId)
      .first<{ branding_json: string | null; ai_toggles_json: string | null; marketplace_json: string | null }>();
    const branding = { ...parseJson(existing?.branding_json, {}), ...(d.branding ?? {}) };
    const aiToggles = { ...parseJson(existing?.ai_toggles_json, {}), ...(d.aiToggles ?? {}) };
    const marketplace = { ...parseJson(existing?.marketplace_json, {}), ...(d.marketplace ?? {}) };

    await c.env.DB.prepare(
      "INSERT INTO tenant_settings (tenant_id, branding_json, ai_toggles_json, marketplace_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET branding_json = ?, ai_toggles_json = ?, marketplace_json = ?, updated_at = ?",
    )
      .bind(who.tenantId, j(branding), j(aiToggles), j(marketplace), nowIso(), j(branding), j(aiToggles), j(marketplace), nowIso())
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
