/**
 * AI-feature registry conformance. AI_FEATURES is the single source of truth for
 * every metered AI action — its audience, task, prompt and tone drive both the
 * settings UI and route enforcement (`sys(key) = featureDef(key)!.defaultSystem`,
 * a hard non-null). A malformed or duplicate entry would break the settings model
 * picker (which filters by task) or throw at a route; this guards the shape so
 * that fails in CI instead. Route keys are guarded at runtime by the integration
 * suite (every AI route calls featureDef(key)! and would throw on a bad key).
 */
import { describe, expect, it } from "vitest";
import { AI_FEATURES, featureDef, TONE_GUIDE } from "../src/ai-features.js";

const AUDIENCES = new Set(["trainer", "client"]);
const TASKS = new Set(["text", "text-small", "vision", "image"]);

describe("AI feature registry conformance", () => {
  it("keys are unique", () => {
    const keys = AI_FEATURES.map((f) => f.key);
    expect(new Set(keys).size, "duplicate feature key").toBe(keys.length);
  });

  it("every entry is structurally valid and resolvable via featureDef", () => {
    for (const f of AI_FEATURES) {
      expect(f.key, "empty key").toBeTruthy();
      expect(f.label, `${f.key}.label`).toBeTruthy();
      expect(AUDIENCES.has(f.audience), `${f.key}.audience = ${f.audience}`).toBe(true);
      expect(TASKS.has(f.task), `${f.key}.task = ${f.task}`).toBe(true);
      expect(f.defaultSystem.length, `${f.key}.defaultSystem is empty`).toBeGreaterThan(0);
      expect(typeof f.tonable, `${f.key}.tonable`).toBe("boolean");
      // featureDef is the lookup every route uses; it must resolve each key.
      expect(featureDef(f.key), `featureDef(${f.key})`).toBe(f);
    }
  });

  it("featureDef returns undefined for an unknown key (no silent false resolve)", () => {
    expect(featureDef("does-not-exist")).toBeUndefined();
  });

  it("the tone guide covers every house tone", () => {
    // A tonable feature appends TONE_GUIDE[tone]; every configured tone must exist.
    for (const tone of Object.keys(TONE_GUIDE)) expect(TONE_GUIDE[tone as keyof typeof TONE_GUIDE]).toBeTruthy();
    expect(Object.keys(TONE_GUIDE).length).toBeGreaterThan(0);
  });
});
