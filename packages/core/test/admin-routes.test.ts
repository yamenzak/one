/**
 * The operator routes over the shared store, driven through `app.request()`.
 *
 * Three things are worth a test here and none of them is CRUD: that an
 * unprovisioned deployment says so instead of quietly writing somewhere else,
 * that a secret goes out as four characters rather than a value, and that the
 * response tells the operator when THIS app is overriding what they just set —
 * which is the whole reason the precedence rule is visible anywhere in the UI.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { SHARED_CONFIG_KEY } from "../src/config.js";
import { sharedConfigRoutes } from "../src/admin-routes.js";

function fakeDb(rows: Record<string, string>): D1Database {
  return {
    prepare: () => ({ all: async () => ({ results: Object.entries(rows).map(([key, value]) => ({ key, value })) }) }),
  } as unknown as D1Database;
}

function fakeKv(initial?: Record<string, string>) {
  const store = new Map<string, string>();
  if (initial) store.set(SHARED_CONFIG_KEY, JSON.stringify(initial));
  const kv = {
    get: async (k: string, o?: { type?: string }) => {
      const raw = store.get(k);
      return raw === undefined ? null : o?.type === "json" ? JSON.parse(raw) : raw;
    },
    put: async (k: string, v: string) => void store.set(k, v),
  };
  return { kv: kv as unknown as KVNamespace, read: () => JSON.parse(store.get(SHARED_CONFIG_KEY) ?? "{}") };
}

function mount(opts: { local?: Record<string, string>; shared?: Record<string, string>; wired?: boolean; admin?: boolean }) {
  const { kv, read } = fakeKv(opts.shared ?? {});
  const env = { DB: fakeDb(opts.local ?? {}), PLATFORM_CONFIG: opts.wired === false ? undefined : kv };
  const app = new Hono().route("/api", sharedConfigRoutes({ isPlatformAdmin: () => opts.admin !== false }) as never);
  return {
    read,
    get: () => app.request("/api/admin/shared-config", {}, env),
    post: (patch: unknown) =>
      app.request("/api/admin/shared-config", { method: "POST", body: JSON.stringify({ patch }) }, env),
  };
}

interface Body {
  wired: boolean;
  entries: { key: string; shared: boolean; value: string | null; last4: string | null; overriddenHere: boolean }[];
}

const read = async (res: Response): Promise<Body> => (await res.json()) as Body;
const entryFor = (body: Body, key: string) => body.entries.find((e) => e.key === key)!;

describe("GET /admin/shared-config", () => {
  it("refuses anyone who is not a platform operator", async () => {
    expect((await mount({ admin: false }).get()).status).toBe(403);
  });

  it("reports the store as unwired when no namespace is bound", async () => {
    const body = await read(await mount({ wired: false }).get());
    expect(body.wired).toBe(false);
    // Still lists the keys: an operator has to be able to SEE what the feature
    // would manage before deciding to provision it.
    expect(body.entries.length).toBeGreaterThan(0);
  });

  it("confirms a secret without returning it", async () => {
    const body = await read(await mount({ shared: { "google.gemini_key": "AIzaSyTOPSECRET1234" } }).get());
    const e = entryFor(body, "google.gemini_key");
    expect(e.shared).toBe(true);
    expect(e.value).toBeNull();
    expect(e.last4).toBe("1234");
  });

  it("returns a non-secret in full, because an operator has to see what the platform is doing", async () => {
    const body = await read(await mount({ shared: { "stripe.mode": "live" } }).get());
    expect(entryFor(body, "stripe.mode").value).toBe("live");
  });

  /**
   * Without this field, "I set it centrally and this app still uses the old
   * one" has no visible cause: the override is a row in a database nobody is
   * looking at.
   */
  it("flags a key this app overrides locally", async () => {
    const body = await read(await mount({ shared: { "stripe.mode": "live" }, local: { "stripe.mode": "test" } }).get());
    expect(entryFor(body, "stripe.mode").overriddenHere).toBe(true);
  });

  it("does not call an empty local row an override — it falls through", async () => {
    const body = await read(await mount({ shared: { "stripe.mode": "live" }, local: { "stripe.mode": "" } }).get());
    expect(entryFor(body, "stripe.mode").overriddenHere).toBe(false);
  });
});

describe("POST /admin/shared-config", () => {
  it("refuses anyone who is not a platform operator", async () => {
    expect((await mount({ admin: false }).post({ "stripe.mode": "live" })).status).toBe(403);
  });

  /**
   * 503 and not a silent local write. Writing the app's own `app_config`
   * instead would look identical from the console and leave the operator
   * believing every product got the value.
   */
  it("answers 503 rather than writing somewhere else when nothing is bound", async () => {
    const res = await mount({ wired: false }).post({ "stripe.mode": "live" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/provisioning/i);
  });

  it("stores a shared key", async () => {
    const m = mount({});
    expect((await m.post({ "stripe.mode": "live" })).status).toBe(200);
    expect(m.read()).toEqual({ "stripe.mode": "live" });
  });

  /** A 400, not a silent drop: a safety rule that fails quietly is one an
   *  operator learns about from the wrong symptom. */
  it("rejects a key that is not shareable, and writes nothing", async () => {
    const m = mount({ shared: { "stripe.mode": "test" } });
    const res = await m.post({ "platform.maintenance": "full" });
    expect(res.status).toBe(400);
    expect(m.read()).toEqual({ "stripe.mode": "test" });
  });

  it("rejects a non-string value", async () => {
    expect((await mount({}).post({ "ai.markup": 1.5 })).status).toBe(400);
  });

  it("rejects a body with no patch object", async () => {
    expect((await mount({}).post(undefined)).status).toBe(400);
  });

  it("leaves the keys it was not sent alone", async () => {
    const m = mount({ shared: { "google.gemini_key": "g", "stripe.mode": "test" } });
    await m.post({ "stripe.mode": "live" });
    expect(m.read()).toEqual({ "google.gemini_key": "g", "stripe.mode": "live" });
  });
});
