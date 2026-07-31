/**
 * Attribution is the whole package, so this is where the coverage goes.
 *
 * The bug being prevented is worth restating, because it is what makes the
 * "ambiguous" and "no-app-marker" cases worth refusing rather than guessing at:
 * an event nobody claims used to be answered `200 {received: true}` with its id
 * already in the idempotency table, so Stripe never retried. Money captured,
 * nothing granted, no signal.
 */

import { describe, expect, it } from "vitest";
import { metadataBags, resolveApp, type RailApp } from "../src/routing.js";

const APPS: RailApp[] = [
  { slug: "kova", metadataPrefix: "kova" },
  { slug: "inventory", metadataPrefix: "inv" },
  { slug: "scena" }, // no legacy prefix — born after `metadata.app`
];

const ev = (object: unknown) => ({ data: { object } });

describe("explicit metadata.app", () => {
  it("routes to the named app", () => {
    expect(resolveApp(ev({ metadata: { app: "scena" } }), APPS)).toEqual({ app: "scena", via: "explicit" });
  });

  it("refuses an app the rail was never told about", () => {
    // A typo in a hand-created Stripe product, or an app that was retired. Both
    // must park: delivering to a guess is worse than not delivering.
    const r = resolveApp(ev({ metadata: { app: "bocca" } }), APPS);
    expect(r).toMatchObject({ unroutable: true, reason: "unknown-app", candidates: ["bocca"] });
  });

  it("ignores whitespace-only", () => {
    expect(resolveApp(ev({ metadata: { app: "   " } }), APPS)).toMatchObject({ reason: "no-app-marker" });
  });
});

describe("inference from the legacy prefixed keys", () => {
  it("routes an object that predates metadata.app", () => {
    // Everything Kova created before this package exists carries only these.
    // Without inference, every live subscription becomes unroutable on the day
    // the rail ships.
    expect(resolveApp(ev({ metadata: { kova_tenant: "t_1", kova_plan: "pro" } }), APPS)).toEqual({ app: "kova", via: "prefix" });
  });

  it("matches on the PREFIX, not a fixed key list, so a new marker still routes", () => {
    expect(resolveApp(ev({ metadata: { kova_somethingNew: "x" } }), APPS)).toEqual({ app: "kova", via: "prefix" });
  });

  it("does not match a prefix that is merely a substring", () => {
    // `inv` must not claim `invoice_id`; the separator is part of the contract.
    expect(resolveApp(ev({ metadata: { invoice_id: "in_1" } }), APPS)).toMatchObject({ reason: "no-app-marker" });
  });

  it("an app with no prefix is only ever reachable explicitly", () => {
    expect(resolveApp(ev({ metadata: { scena_tenant: "t_1" } }), APPS)).toMatchObject({ reason: "no-app-marker" });
  });
});

describe("explicit wins, but disagreement is corruption", () => {
  it("prefers metadata.app when it agrees with the prefix", () => {
    expect(resolveApp(ev({ metadata: { app: "kova", kova_tenant: "t_1" } }), APPS)).toEqual({ app: "kova", via: "explicit" });
  });

  it("refuses when the explicit tag and the prefix name DIFFERENT apps", () => {
    // Two code paths stamped one object and disagreed. Crediting either risks
    // granting a paid product to the wrong tenant, so neither is acceptable.
    const r = resolveApp(ev({ metadata: { app: "scena", kova_tenant: "t_1" } }), APPS);
    expect(r).toMatchObject({ unroutable: true, reason: "ambiguous", candidates: ["kova", "scena"] });
  });

  it("refuses when two prefixes both match", () => {
    const r = resolveApp(ev({ metadata: { kova_tenant: "t_1", inv_tenant: "t_2" } }), APPS);
    expect(r).toMatchObject({ unroutable: true, reason: "ambiguous", candidates: ["inventory", "kova"] });
  });
});

describe("where the marker actually hides", () => {
  it("finds it on a subscription invoice's parent.subscription_details", () => {
    // The Basil-shaped invoice: nothing useful on the top-level metadata.
    const invoice = { metadata: {}, parent: { subscription_details: { metadata: { app: "kova" } } } };
    expect(resolveApp(ev(invoice), APPS)).toEqual({ app: "kova", via: "explicit" });
  });

  it("finds it on a line item when it is nowhere else", () => {
    const invoice = { lines: { data: [{ metadata: { kova_plan: "pro" } }] } };
    expect(resolveApp(ev(invoice), APPS)).toEqual({ app: "kova", via: "prefix" });
  });

  it("still refuses when two bags disagree", () => {
    const invoice = { metadata: { app: "kova" }, lines: { data: [{ metadata: { app: "scena" } }] } };
    expect(resolveApp(ev(invoice), APPS)).toMatchObject({ reason: "ambiguous" });
  });
});

describe("nothing to go on", () => {
  it.each([
    ["no metadata at all", {}],
    ["an empty bag", { metadata: {} }],
    ["a null object", null],
    ["non-string metadata values", { metadata: { app: 3 } }],
  ])("parks: %s", (_label, object) => {
    expect(resolveApp(ev(object), APPS)).toMatchObject({ unroutable: true, reason: "no-app-marker" });
  });

  it("survives a malformed event without throwing", () => {
    expect(() => resolveApp({} as never, APPS)).not.toThrow();
    expect(resolveApp({} as never, APPS)).toMatchObject({ unroutable: true });
  });
});

describe("metadataBags", () => {
  it("collects every bag and drops non-string values", () => {
    const bags = metadataBags({ metadata: { a: "1", n: 2 }, lines: { data: [{ metadata: { b: "2" } }] } });
    expect(bags).toEqual([{ a: "1" }, { b: "2" }]);
  });

  it("returns nothing for a primitive", () => {
    expect(metadataBags("nope")).toEqual([]);
  });
});
