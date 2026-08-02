/**
 * The shared config layer, against fakes.
 *
 * Everything here is precedence and blast radius — the two things that decide
 * whether "set a key once" is a convenience or an outage. There is no Miniflare
 * and no worker pool: `getConfig` takes a D1 and a KV, and a hand-written pair
 * exercises every branch faster and more legibly than the real ones would.
 */

import { describe, expect, it } from "vitest";
import {
  SHARED_CONFIG_KEY,
  SHARED_CONFIG_KEYS,
  getConfig,
  isSecretConfigKey,
  isSharedConfigKey,
  readSharedConfig,
  writeSharedConfig,
} from "../src/config.js";

/** A D1 that answers the one query `getConfig` makes. */
function fakeDb(rows: Record<string, string>): D1Database {
  return {
    prepare: () => ({
      all: async () => ({ results: Object.entries(rows).map(([key, value]) => ({ key, value })) }),
    }),
  } as unknown as D1Database;
}

/** A KV holding one JSON blob, with an optional forced failure. */
function fakeKv(initial?: Record<string, string>, opts: { failGet?: boolean } = {}) {
  const store = new Map<string, string>();
  if (initial) store.set(SHARED_CONFIG_KEY, JSON.stringify(initial));
  const kv = {
    get: async (key: string, o?: { type?: string }) => {
      if (opts.failGet) throw new Error("kv down");
      const raw = store.get(key);
      if (raw === undefined) return null;
      return o?.type === "json" ? JSON.parse(raw) : raw;
    },
    put: async (key: string, value: string) => void store.set(key, value),
  };
  return { kv: kv as unknown as KVNamespace, read: () => JSON.parse(store.get(SHARED_CONFIG_KEY) ?? "{}") };
}

describe("the shared-key allow list", () => {
  it("carries the credentials one account issues for the whole platform", () => {
    for (const k of ["google.gemini_key", "turnstile.secret", "cf.saas.api_token", "cf.saas.zone_id", "stripe.test.secret_key"]) {
      expect(isSharedConfigKey(k), k).toBe(true);
    }
  });

  /**
   * The four that look shareable and are not, plus the three that would corrupt
   * state rather than merely misconfigure it. Asserted by NAME because the cost
   * of each is specific: a shared `email.from` sends every product's mail under
   * one product's name, a shared webhook secret fails signature verification on
   * every incoming event, a shared `cf.saas.worker_name` routes one product's
   * custom domains at another product's worker, a shared `platform.maintenance`
   * closes every app when one is migrated, and a shared `schema:` marker
   * convinces one database it ran another's migrations.
   */
  it("excludes everything two apps could legitimately disagree about", () => {
    for (const k of [
      "email.from",
      "stripe.test.webhook_secret",
      "stripe.live.webhook_secret",
      "cf.saas.worker_name",
      "platform.maintenance",
      "platform.maintenance.message",
      "plans.catalog_version",
      "schema:kova",
    ]) {
      expect(isSharedConfigKey(k), k).toBe(false);
    }
  });

  it("marks every credential a console must not read back", () => {
    for (const k of SHARED_CONFIG_KEYS.filter((x) => /secret|token|_key$/.test(x))) {
      // Publishable keys are public by Stripe's own definition, and a site key
      // is handed to the browser — neither is a secret.
      if (k.includes("publishable") || k === "turnstile.site_key" || k === "cf.saas.zone_id") continue;
      expect(isSecretConfigKey(k), k).toBe(true);
    }
    expect(isSecretConfigKey("stripe.mode")).toBe(false);
    expect(isSecretConfigKey("turnstile.site_key")).toBe(false);
  });
});

describe("getConfig precedence", () => {
  it("reads only the app's own table when nothing shared is bound", async () => {
    const cfg = await getConfig(fakeDb({ "google.gemini_key": "local" }));
    expect(cfg).toEqual({ "google.gemini_key": "local" });
  });

  it("falls back to the shared store for a key the app has not set", async () => {
    const { kv } = fakeKv({ "google.gemini_key": "shared" });
    const cfg = await getConfig({ DB: fakeDb({ "email.from": "Kova <x@y.z>" }), PLATFORM_CONFIG: kv });
    expect(cfg["google.gemini_key"]).toBe("shared");
    expect(cfg["email.from"]).toBe("Kova <x@y.z>");
  });

  it("lets a non-empty local row win over the shared value", async () => {
    const { kv } = fakeKv({ "stripe.mode": "live" });
    const cfg = await getConfig({ DB: fakeDb({ "stripe.mode": "test" }), PLATFORM_CONFIG: kv });
    expect(cfg["stripe.mode"]).toBe("test");
  });

  /**
   * The rule the header argues for at length, and the one worth a test: every
   * consumer already treats "" as unconfigured, so a blank local row masking a
   * good shared value would show a configured key on one screen and "not
   * configured" on another, with nothing naming the cause.
   */
  it("falls THROUGH an empty local row rather than masking the shared value", async () => {
    const { kv } = fakeKv({ "turnstile.secret": "shared-secret" });
    const cfg = await getConfig({ DB: fakeDb({ "turnstile.secret": "" }), PLATFORM_CONFIG: kv });
    expect(cfg["turnstile.secret"]).toBe("shared-secret");
  });

  it("keeps an empty local row for a key the shared store does not hold", async () => {
    const { kv } = fakeKv({});
    const cfg = await getConfig({ DB: fakeDb({ "email.from": "" }), PLATFORM_CONFIG: kv });
    expect(cfg["email.from"]).toBe("");
  });

  /** A KV outage degrades to "not configured", never to a 500 on every route. */
  it("survives a shared-store failure and serves the app's own rows", async () => {
    const { kv } = fakeKv({ "google.gemini_key": "shared" }, { failGet: true });
    const cfg = await getConfig({ DB: fakeDb({ "stripe.mode": "test" }), PLATFORM_CONFIG: kv });
    expect(cfg).toEqual({ "stripe.mode": "test" });
  });

  /** A key hand-written into the namespace must not reach a consumer. */
  it("drops a non-shareable key that reached the namespace anyway", async () => {
    const { kv } = fakeKv({ "platform.maintenance": "full", "stripe.mode": "test" });
    expect(await readSharedConfig(kv)).toEqual({ "stripe.mode": "test" });
  });
});

describe("writeSharedConfig", () => {
  it("merges rather than replacing, so one panel's save keeps another's keys", async () => {
    const { kv, read } = fakeKv({ "google.gemini_key": "g", "stripe.mode": "test" });
    await writeSharedConfig(kv, { "stripe.mode": "live" });
    expect(read()).toEqual({ "google.gemini_key": "g", "stripe.mode": "live" });
  });

  it("refuses a key that is not on the allow list", async () => {
    const { kv, read } = fakeKv({});
    await writeSharedConfig(kv, { "platform.maintenance": "full" });
    expect(read()).toEqual({});
  });

  /** Blank and absent mean the same thing to every consumer; only one of the
   *  two can be reported honestly, so a blank deletes. */
  it("deletes on an empty value instead of storing a blank", async () => {
    const { kv, read } = fakeKv({ "turnstile.secret": "s" });
    await writeSharedConfig(kv, { "turnstile.secret": "" });
    expect(read()).toEqual({});
  });
});
