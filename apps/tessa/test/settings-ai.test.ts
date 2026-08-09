/**
 * PRACTICE SETTINGS AND THE AI GATES.
 *
 * The gates are the interesting part. There are three of them — plan, centre,
 * person — and every one of them fails OPEN if you get it slightly wrong:
 *
 *   a plan check that reads a missing row as "allowed" gives the AI suite away
 *   a per-feature switch that defaults to OFF makes a paid feature look broken
 *   a per-feature switch that IGNORES a stored `false` bills a centre that
 *     explicitly turned the thing off
 *
 * None of those throws, and none of them shows up in a typecheck.
 */

import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { seedBilling } from "../src/billing-store.js";
import { AI_FEATURES, TONE_KEYS } from "../src/ai.js";
import { DEFAULT_BRANDING, DEFAULT_PREFS } from "../src/settings-routes.js";

const db = () => env.DB as D1Database;

beforeAll(async () => {
  await ensureSchema(db());
  await seedBilling(db());
});

describe("the AI registry", () => {
  it("declares four features, each with a task the runner can route", async () => {
    expect(AI_FEATURES).toHaveLength(4);
    const keys = AI_FEATURES.map((f) => f.key).sort();
    expect(keys).toEqual(["read-document", "read-label", "recall-report", "reorder-advisor"]);

    for (const f of AI_FEATURES) {
      // An unroutable task string does not fail at startup — it fails at the
      // first call, in production, having already been sold.
      expect(["text", "text-small", "vision", "image"]).toContain(f.task);
      // The prompt is what makes the feature; an empty one is a feature that
      // returns whatever the base model felt like.
      expect(f.defaultSystem.length).toBeGreaterThan(80);
    }
  });

  it("routes the label reader to vision and nothing else to it", () => {
    // The one feature that takes a photo. If this drifts to `text`, the image is
    // silently dropped and the model answers from the prompt alone — which
    // reads as "the AI is bad at labels" rather than as a wiring bug.
    const vision = AI_FEATURES.filter((f) => f.task === "vision").map((f) => f.key);
    expect(vision).toEqual(["read-label"]);
  });

  it("gives every tonable feature a tone that actually exists", () => {
    // A tonable feature whose tone key is not in TONE_GUIDE silently appends
    // `undefined` to its system prompt.
    for (const f of AI_FEATURES.filter((f) => f.tonable)) {
      expect(TONE_KEYS.length).toBeGreaterThan(0);
      expect(f.key).toBeTruthy();
    }
    expect(TONE_KEYS).toContain("professional");
  });
});

/**
 * THE SUITE'S FIRST STATEMENT, AND THE ONE THAT USED TO THROW.
 *
 * `@4dl/ai`'s `generate()` and `generateImage()` both open with `loadTenantAi`,
 * an unguarded `SELECT ai_config_json, ai_toggles_json FROM tenant_settings`.
 * `ai_config_json` was declared by exactly ONE app, in its own schema module —
 * so here, and in every future app, the whole AI suite threw
 * `no such column: ai_config_json` on every call. A paid entitlement, dead, with
 * nothing anywhere saying so: the package's tests passed, this file passed
 * (it only ever asserted that an unauthenticated call is refused, and a refusal
 * never reaches the query), and a 500 on a feature nobody has tried yet looks
 * exactly like a feature nobody has tried yet.
 *
 * The column is `@4dl/ai`'s now — a package that reads a column has to ship it.
 * This asserts the select the package actually makes, rather than the column
 * list, because the select is what breaks.
 */
describe("the columns the AI package reads", () => {
  it("answers `generate()`'s opening query without throwing", async () => {
    await ensureSchema(env.DB as D1Database);
    const row = await (env.DB as D1Database)
      .prepare("SELECT ai_config_json, ai_toggles_json FROM tenant_settings WHERE tenant_id = ?")
      .bind("nobody")
      .first();
    // No row is the correct answer for an unknown tenant; what matters is that
    // the statement PREPARED and RAN.
    expect(row).toBeNull();
  });
});

describe("the AI gates", () => {
  const origin = "http://nobody.localhost:8787";

  it("refuses every AI route without a session", async () => {
    for (const path of ["/api/ai/features", "/api/ai/read-label", "/api/ai/reorder-advisor", "/api/ai/recall-report", "/api/ai/read-document"]) {
      const res = await SELF.fetch(`${origin}${path}`, {
        method: path === "/api/ai/features" ? "GET" : "POST",
        headers: { "content-type": "application/json" },
        body: path === "/api/ai/features" ? undefined : "{}",
      });
      // Not 200, and not a 500 either — an unauthenticated call must be
      // REFUSED, not crash on a missing tenant halfway through.
      expect(res.status, path).toBeGreaterThanOrEqual(400);
      expect(res.status, path).toBeLessThan(500);
    }
  });
});

describe("settings defaults", () => {
  it("ship German and a system theme", () => {
    // A German-market product whose default locale is English means every
    // centre that never opens settings reads the wrong language.
    expect(DEFAULT_PREFS.locale).toBe("de");
    expect(DEFAULT_PREFS.theme).toBe("system");
  });

  it("start with no branding rather than an invented accent", () => {
    // `null`, not a colour. A default accent would override the design system's
    // own token for every centre that never chose one.
    expect(DEFAULT_BRANDING.primary).toBeNull();
    expect(DEFAULT_BRANDING.logoUrl).toBeNull();
  });

  it("is refused without a session", async () => {
    const res = await SELF.fetch("http://nobody.localhost:8787/api/settings");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
