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
    expect(configWriteRefusal({ "ai.markup": "3", "weather.credits_per_call": "3" }, false)).toBeNull();
    expect(configWriteRefusal({}, false)).toBeNull();
  });

  /**
   * ⚠️ THIS ASSERTION USED TO SAY THE OPPOSITE, and it was right at the time.
   *
   * `{ "stripe.secret_key": "sk_test_x" }` was pinned as ALLOWED, because the
   * generic config form was the only way to configure Stripe here. It stores
   * whatever string it is handed — so a live secret key under a `test` mode, a
   * publishable key in the secret slot and a signing secret in either were all
   * saved without a word, and each is a payment path that is dead or dangerous
   * with nothing on screen saying so.
   *
   * `@4dl/billing`'s `stripeAdminRoutes` is the door now: both lanes kept at
   * once, every prefix checked against its slot AND its lane, and a mode whose
   * resulting active keys belong to the other lane refused outright. Two ways in
   * where one has no checks is not a fallback.
   */
  it("refuses a Stripe credential, which has a validated door of its own", () => {
    for (const key of ["stripe.secret_key", "stripe.publishable_key", "stripe.webhook_secret"]) {
      expect(configWriteRefusal({ [key]: "sk_test_x" }, false), key).toMatch(/Stripe panel/);
      // Development is not an exemption: the keys are as real there.
      expect(configWriteRefusal({ [key]: "sk_test_x" }, true), `${key} (dev)`).toMatch(/Stripe panel/);
    }
  });

  it("refuses the MODE too, which is the sharpest of the four", () => {
    // Flipping `stripe.mode` here skips the per-lane catalog swap, leaving every
    // plan pointing at the outgoing lane's price id — so every checkout fails
    // with "No such price", produced by a field that looks inert.
    expect(configWriteRefusal({ "stripe.mode": "live" }, false)).toMatch(/Stripe panel/);
  });

  it("names the key it refused, so an operator knows which field to move", () => {
    // A refusal that just says "invalid" sends somebody to bisect a form.
    expect(configWriteRefusal({ "billing.grace_days": "7", "stripe.webhook_secret": "whsec_x" }, false)).toContain("stripe.webhook_secret");
  });
});
