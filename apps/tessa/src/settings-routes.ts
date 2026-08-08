/**
 * PRACTICE SETTINGS — what a centre configures about itself.
 *
 * One row (`tenant_settings`, created by `@4dl/tenancy`), three JSON columns,
 * and a single PATCH that validates every field before it lands. The row is
 * SHARED: tenancy owns `branding_json`, this app owns `ai_toggles_json`, and
 * `@4dl/email` owns others. Nothing here may write a column it does not own.
 *
 * ── Why branding at all, in a clinic tool ───────────────────────────────────
 *
 * Not vanity. A reprocessing centre's staff sign in on a shared tablet in a
 * dirty-side room, often alongside a second system, and the fastest way to know
 * you are in the right place is that it looks like your practice. The accent
 * also carries into printed pack labels, which is the one artefact that leaves
 * the building.
 *
 * ── The one thing NOT stored here ───────────────────────────────────────────
 *
 * The practice NAME. That is `organization.name`, Better Auth's, and duplicating
 * it into a settings blob would give a centre two names that drift — the one on
 * the sign-in screen and the one in every invite email.
 */

import { Hono } from "hono";
import { z } from "zod";
import { nowIso, parseJson } from "@4dl/core";
import { type AppEnv, requirePermission, requireTenant } from "./auth-context.js";
import { invalidateTenantHosts } from "./host-context.js";
import { hasFeature } from "./billing-store.js";
import { AI_FEATURES, TONE_KEYS } from "./ai.js";

/**
 * The accent, as a CSS colour.
 *
 * `@4dl/ui`'s tokens make `--primary` runtime-overridable, so this lands as an
 * inline custom property. Validated as a hex triple rather than accepted as free
 * text: an arbitrary string here is injected into a `style` attribute, and
 * `oklch(from var(--primary) …)` in `--shadow-glow` silently produces nothing
 * for a value it cannot parse — so a bad value degrades to an invisible shadow
 * rather than a visible error.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Defaults, and the shape every read returns whether or not a row exists. */
export const DEFAULT_BRANDING = { primary: null, logoUrl: null, headline: null, subtext: null } as const;
export const DEFAULT_PREFS = { locale: "de", theme: "system" } as const;

/**
 * A CSS colour map, as `@4dl/ui`'s `BrandTokens` — `{ "--primary": "oklch(...)" }`.
 *
 * The values are NOT hex-validated the way `primary` is, because a token may
 * legitimately be `oklch()`, `hsl()`, `color-mix()` or a keyword, and a regex
 * that admitted all of those would admit anything. What protects the page is
 * `applyBranding`'s own filter in `@4dl/ui` — it refuses a value the browser
 * cannot parse rather than injecting broken CSS. So the wire schema bounds SIZE
 * and shape (a flat string map, capped) and leaves meaning to the consumer.
 */
const tokenMap = z.record(z.string().max(120), z.string().max(200)).optional();

const SettingsBody = z.object({
  /*
    THE WHOLE `Branding`, not four fields.

    This accepted `primary`, `logoUrl`, `headline` and `subtext` — a colour and
    three strings — while the column it writes is the same
    `tenant_settings.branding_json` Kova stores a twenty-field brand in, and
    `applyBranding` (shared) already knew how to apply every one of them. The
    editor is `@4dl/ui`'s `BrandingEditor` now, so the schema has to admit what
    that editor produces or the save 400s on a token map.

    Widening a JSON column is not a migration: an existing row simply has fewer
    keys, and every reader already treats a missing key as "not set".
  */
  branding: z
    .object({
      primary: z.string().regex(HEX, "Use a six-digit hex colour, e.g. #25c891").nullable().optional(),
      primaryForeground: z.string().max(200).nullable().optional(),
      logoUrl: z.string().url().max(500).nullable().optional(),
      logoUrlLight: z.string().url().max(500).nullable().optional(),
      iconUrl: z.string().url().max(500).nullable().optional(),
      iconUrlLight: z.string().url().max(500).nullable().optional(),
      headline: z.string().max(80).nullable().optional(),
      subtext: z.string().max(200).nullable().optional(),
      // The theme half — what `BrandingEditor` owns.
      tokens: z.object({ light: tokenMap, dark: tokenMap }).nullable().optional(),
      radius: z.number().min(0).max(3).nullable().optional(),
      /*
        ⚠️ THESE THREE ENUMS MIRROR `@4dl/ui` BY HAND, and the first draft of
        this one was WRONG — `["none","soft","medium","strong"]` against the real
        `ShadowPreset`, which is `subtle` and `dramatic`, not `medium` and
        `strong`. A guessed enum typechecks perfectly and 400s the save the first
        time somebody picks Dramatic.

        The worker cannot import `@4dl/ui` (a Hono worker has no business
        depending on a React design system), so the mirror is unavoidable; what
        is avoidable is copying it from memory. `ShadowPreset`, `NeutralTint` and
        `ThemeMode` in `packages/ui/src/lib/theme.ts` are the source.
      */
      shadow: z.enum(["none", "subtle", "soft", "dramatic"]).nullable().optional(),
      borderWidth: z.number().min(0).max(4).nullable().optional(),
      borderColor: z.string().max(200).nullable().optional(),
      neutral: z.enum(["brand", "gray", "cool", "warm"]).nullable().optional(),
      defaultMode: z.enum(["dark", "light"]).nullable().optional(),
      // `preset` is nulled by the editor once tokens carry everything — see the
      // note on `BrandTheme`. Accepting null is what lets it be CLEARED.
      preset: z.string().max(40).nullable().optional(),
      tintedNav: z.boolean().nullable().optional(),
      ambient: z.boolean().nullable().optional(),
    })
    .optional(),
  prefs: z
    .object({
      // German first: this is a German-market product, and a centre that never
      // opens settings should not be reading English.
      locale: z.enum(["de", "en"]).optional(),
      theme: z.enum(["system", "light", "dark"]).optional(),
    })
    .optional(),
  ai: z
    .object({
      /** Per-feature kill switches, keyed by `AI_FEATURES[].key`. */
      features: z.record(z.string(), z.boolean()).optional(),
      tone: z.enum(TONE_KEYS).optional(),
    })
    .optional(),
});

async function readRow(db: D1Database, tenantId: string) {
  return db
    .prepare("SELECT branding_json, ai_toggles_json, integrations_json FROM tenant_settings WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ branding_json: string | null; ai_toggles_json: string | null; integrations_json: string | null }>()
    .catch(() => null);
}

export const settingsRoutes = new Hono<AppEnv>()
  .get("/settings", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const row = await readRow(c.env.DB, who.tenantId);
    const ai = parseJson(row?.ai_toggles_json, { features: {} as Record<string, boolean>, tone: "professional" });
    return c.json({
      branding: parseJson(row?.branding_json, { ...DEFAULT_BRANDING }),
      prefs: parseJson(row?.integrations_json, { ...DEFAULT_PREFS }),
      ai: {
        ...ai,
        /**
         * The catalog travels with the toggles.
         *
         * A settings screen that hard-codes the feature list drifts the moment
         * one is added, and drifts SILENTLY — the new feature is simply absent
         * from the screen while being perfectly callable. Sending the registry
         * makes the screen a renderer.
         */
        catalog: AI_FEATURES.map((f) => ({ key: f.key, label: f.label, description: f.description })),
      },
      // What the plan allows, so the screen can explain a disabled control
      // rather than just rendering it dead.
      canUseAi: await hasFeature(c.env.DB, who.tenantId, "ai"),
    });
  })

  .patch("/settings", async (c) => {
    const who = requireTenant(c);
    if (!who) return c.json({ error: "unauthenticated" }, 401);
    const denied = requirePermission(c, { settings: ["manage"] });
    if (denied) return denied;

    const body = SettingsBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      // Return the FIRST message, not the whole zod tree: the screen shows this
      // next to the control that failed, and "invalid body" next to a colour
      // picker tells nobody which field or why.
      return c.json({ error: body.error.issues[0]?.message ?? "invalid body" }, 400);
    }

    const row = await readRow(c.env.DB, who.tenantId);
    const current = {
      branding: parseJson(row?.branding_json, { ...DEFAULT_BRANDING }),
      prefs: parseJson(row?.integrations_json, { ...DEFAULT_PREFS }),
      ai: parseJson(row?.ai_toggles_json, { features: {} as Record<string, boolean>, tone: "professional" }),
    };

    // Merge rather than replace: the screen PATCHes one section at a time, and a
    // replace would wipe whatever the other sections held.
    const branding = { ...current.branding, ...(body.data.branding ?? {}) };
    const prefs = { ...current.prefs, ...(body.data.prefs ?? {}) };
    const ai = {
      ...current.ai,
      ...(body.data.ai?.tone ? { tone: body.data.ai.tone } : {}),
      features: { ...current.ai.features, ...(body.data.ai?.features ?? {}) },
    };

    // An unknown feature key would sit in the blob forever, never rendered and
    // never read — refuse it rather than store it.
    const known = new Set(AI_FEATURES.map((f) => f.key));
    for (const key of Object.keys(body.data.ai?.features ?? {})) {
      if (!known.has(key)) return c.json({ error: `unknown AI feature "${key}"` }, 400);
    }

    await c.env.DB
      .prepare(
        "INSERT INTO tenant_settings (tenant_id, branding_json, ai_toggles_json, integrations_json, updated_at) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(tenant_id) DO UPDATE SET branding_json = excluded.branding_json, ai_toggles_json = excluded.ai_toggles_json, integrations_json = excluded.integrations_json, updated_at = excluded.updated_at",
      )
      .bind(who.tenantId, JSON.stringify(branding), JSON.stringify(ai), JSON.stringify(prefs), nowIso())
      .run();

    /**
     * The host cache holds `branding_json` — `resolveHost` reads it on every
     * request and caches it in KV. Without this invalidation a centre changes
     * its accent, sees the save succeed, and the sign-in screen keeps the old
     * one until the cache happens to expire.
     */
    await invalidateTenantHosts(c.env, who.tenantId).catch(() => undefined);

    return c.json({ branding, prefs, ai });
  });
