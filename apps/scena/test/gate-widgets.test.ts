import { describe, it, expect } from "vitest";
import { gateWidgets } from "../src/content.js";
import { FREE_ENTITLEMENTS } from "../src/entitlements.js";
import type { Features } from "../src/entitlements.js";

/** A permissive feature set with everything unlocked, for the "keeps all" case. */
const ALL: Features = {
  ...FREE_ENTITLEMENTS.features,
  htmlSandbox: true,
  widgetStack: true,
  clockAnalog: true,
  ticker: true,
  weather: true,
};

/** The restrictive baseline: no html sandbox, no stacks, digital-only clock,
 *  and no ticker/weather at all (the free-plan shape). */
const NONE: Features = {
  ...FREE_ENTITLEMENTS.features,
  htmlSandbox: false,
  widgetStack: false,
  clockAnalog: false,
  ticker: false,
  weather: false,
};

const sample = () => [
  { type: "text", config: { text: "hi" } },
  { type: "html", config: { body: "<b>x</b>" } },
  { type: "stack", config: {} },
  { type: "clock", config: { variant: "analog" } },
  { type: "ticker", config: {} },
  { type: "weather", config: {} },
];

describe("gateWidgets (compile-time plan enforcement)", () => {
  it("keeps everything when the plan includes it", () => {
    const out = gateWidgets(sample(), ALL);
    expect(out.map((w) => w.type)).toEqual(["text", "html", "stack", "clock", "ticker", "weather"]);
    expect(out[3]!.config.variant).toBe("analog");
  });

  it("strips html/stack/ticker/weather widgets and downgrades analog clock when not in the plan", () => {
    const out = gateWidgets(sample(), NONE);
    expect(out.map((w) => w.type)).toEqual(["text", "clock"]);
    expect(out[1]!.config.variant).toBe("digital");
  });

  it("passes non-array input through untouched", () => {
    expect(gateWidgets(null, NONE)).toBeNull();
    expect(gateWidgets(undefined, NONE)).toBeUndefined();
  });
});
