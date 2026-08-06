/**
 * The mock lane, in the environment the integration suite cannot be.
 *
 * `test/integration.test.ts` runs with `ENVIRONMENT: "development"` and a
 * Workers-pool binding is fixed for the whole runtime, so the branch that
 * actually matters — what happens on a DEPLOYED worker — is unreachable there.
 * These assertions are the other half, and without them the guard's production
 * behaviour would be a claim rather than a fact.
 *
 * What was wrong before Stage 5: Scena's `mockMode()` read `app_config["ai.mock"]`
 * and nothing else. Three paths fabricated output in production and charged the
 * workspace credits for it — `ai.mock = "on"` from the console, a missing `AI`
 * binding, and a provider failure falling back in "auto". The environment gate is
 * now the OUTER condition, so none of them can fire on a deployed worker.
 */

import { describe, expect, it } from "vitest";
import { shouldUseMockLane } from "@4dl/ai";
import { configWriteRefusal } from "../src/billing-routes.js";

/** The three call shapes `ai.ts` composes, named so a failure says which. */
const lane = (mockMode: string | null, canRunReal: boolean, isDevelopment: boolean) =>
  shouldUseMockLane({ mockMode, canRunReal, isDevelopment });

describe("the mock lane on a deployed worker", () => {
  it("never mocks, whatever ai.mock says", () => {
    for (const mode of ["on", "auto", "off", null, "anything"]) {
      expect(lane(mode, true, false), `ai.mock=${mode} with a provider`).toBe(false);
      // The one that used to be silent: no `AI` binding. `AI` is optional in
      // env.ts, so a deploy that dropped it did not fail — it started answering
      // with stubs and invoicing for them.
      expect(lane(mode, false, false), `ai.mock=${mode} with NO provider`).toBe(false);
    }
  });
});

describe("the mock lane in development", () => {
  it('"on" forces it, "off" refuses it, "auto" follows the credential', () => {
    expect(lane("on", true, true)).toBe(true);
    expect(lane("off", false, true)).toBe(false);
    expect(lane("auto", true, true)).toBe(false);
    expect(lane("auto", false, true)).toBe(true);
    // An unrecognised value behaves as "auto" rather than as "on" — failing
    // towards the real provider, not towards fabrication.
    expect(lane(null, true, true)).toBe(false);
    expect(lane("nonsense", true, true)).toBe(false);
  });

  it("an EXTERNAL provider is never mocked, because it can always run real", () => {
    // Gemini/Lyria run on the platform Google key regardless of the Workers AI
    // binding, so `ai.ts` passes canRunReal = true for them. "auto" then has
    // nothing to fall back from — which is the property that keeps a Gemini
    // failure visible instead of quietly becoming a stub.
    expect(lane("auto", true, true)).toBe(false);
  });
});

describe("the config write path", () => {
  it("refuses ai.mock=on outside development, and stores it inside", () => {
    expect(configWriteRefusal({ "ai.mock": "on" }, false)).toMatch(/development-only/);
    expect(configWriteRefusal({ "ai.mock": "on" }, true)).toBeNull();
  });

  it("leaves every other mode and every other key alone", () => {
    for (const mode of ["auto", "off"]) {
      expect(configWriteRefusal({ "ai.mock": mode }, false), `ai.mock=${mode}`).toBeNull();
    }
    expect(configWriteRefusal({ "ai.markup": "3", "stripe.secret_key": "sk_test_x" }, false)).toBeNull();
    expect(configWriteRefusal({}, false)).toBeNull();
  });
});
