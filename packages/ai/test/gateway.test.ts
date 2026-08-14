/**
 * The AI Gateway re-basing — config-gated, and unset means unchanged.
 *
 * The invariant that matters: with no `ai.gateway_base`, every derived value
 * is exactly the direct call — same URL, no gateway named to the binding. A
 * platform that cannot take this path to "off" is one where the gateway is a
 * migration rather than a setting.
 */

import { describe, expect, it } from "vitest";
import { geminiBaseFrom, gatewayIdFrom } from "../src/generate";

const GATEWAY = "https://gateway.ai.cloudflare.com/v1/abc123/one-gw";

describe("geminiBaseFrom", () => {
  it("goes direct when nothing is configured", () => {
    for (const unset of [undefined, "", "   "]) {
      expect(geminiBaseFrom(unset)).toBe("https://generativelanguage.googleapis.com/v1beta");
    }
  });

  it("re-bases onto the gateway's google-ai-studio route", () => {
    expect(geminiBaseFrom(GATEWAY)).toBe(`${GATEWAY}/google-ai-studio/v1beta`);
  });

  it("tolerates a trailing slash from a copy-paste", () => {
    expect(geminiBaseFrom(`${GATEWAY}/`)).toBe(`${GATEWAY}/google-ai-studio/v1beta`);
  });
});

describe("gatewayIdFrom", () => {
  it("names no gateway when nothing is configured", () => {
    expect(gatewayIdFrom(undefined)).toBeUndefined();
    expect(gatewayIdFrom("")).toBeUndefined();
  });

  it("is the URL's last segment — the name the Workers AI binding wants", () => {
    expect(gatewayIdFrom(GATEWAY)).toBe("one-gw");
    expect(gatewayIdFrom(`${GATEWAY}/`)).toBe("one-gw");
  });
});
