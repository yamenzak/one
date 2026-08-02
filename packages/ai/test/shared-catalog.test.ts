/**
 * The catalog half of `ai_models`, shared across apps.
 *
 * Two properties carry the whole design and both are asserted here: a malformed
 * or empty blob must read as "nothing published" rather than as a catalog, and
 * publishing must never be able to fail a sync that already succeeded. The rest
 * of `ai_models` — `enabled`, `is_default` — never leaves an app's own database,
 * because which models a product turns on is a product decision.
 */

import { describe, expect, it } from "vitest";
import { SHARED_CATALOG_KEY, publishSharedCatalog, readSharedCatalog } from "../src/shared-catalog.js";
import type { ModelSeed } from "../src/pricing.js";

const model = (over: Partial<ModelSeed> = {}): ModelSeed => ({
  id: "@cf/meta/llama-3.1-8b",
  label: "Llama 3.1 8B",
  provider: "workers-ai",
  task: "text",
  inputRate: 100,
  outputRate: 200,
  unitRate: null,
  unitKind: null,
  ...over,
});

function fakeKv(initial?: unknown, opts: { failGet?: boolean; failPut?: boolean } = {}) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(SHARED_CATALOG_KEY, JSON.stringify(initial));
  const kv = {
    get: async (k: string, o?: { type?: string }) => {
      if (opts.failGet) throw new Error("kv down");
      const raw = store.get(k);
      return raw === undefined ? null : o?.type === "json" ? JSON.parse(raw) : raw;
    },
    put: async (k: string, v: string) => {
      if (opts.failPut) throw new Error("kv down");
      store.set(k, v);
    },
  };
  return { env: { PLATFORM_CONFIG: kv as unknown as KVNamespace }, read: () => JSON.parse(store.get(SHARED_CATALOG_KEY) ?? "null") };
}

describe("readSharedCatalog", () => {
  it("returns nothing when no namespace is bound", async () => {
    expect(await readSharedCatalog({})).toBeNull();
  });

  it("returns the published catalog", async () => {
    const { env } = fakeKv({ syncedAt: "2026-08-02T00:00:00.000Z", syncedBy: "Kova", models: [model()] });
    const c = await readSharedCatalog(env);
    expect(c?.models).toHaveLength(1);
    expect(c?.syncedBy).toBe("Kova");
  });

  /** A KV failure must read as "nothing published", never throw — the app then
   *  falls back to its own sync, which is where it was before this existed. */
  it("survives a KV failure", async () => {
    const { env } = fakeKv({ models: [model()] }, { failGet: true });
    expect(await readSharedCatalog(env)).toBeNull();
  });

  /**
   * The one that protects the credit math. `ai_models` is what metering reads,
   * so a row with no id or no provider reaching it from a hand-edited namespace
   * would corrupt pricing rather than merely look wrong.
   */
  it("drops rows that are not models, and refuses a blob with none left", async () => {
    const { env } = fakeKv({ models: [{ id: "" }, { provider: "google" }, null, "nope"] });
    expect(await readSharedCatalog(env)).toBeNull();
  });

  it("keeps the good rows when only some are junk", async () => {
    const { env } = fakeKv({ models: [model(), { id: "" }, model({ id: "gemini-2.5-flash", provider: "google" })] });
    const c = await readSharedCatalog(env);
    expect(c?.models.map((m) => m.id)).toEqual(["@cf/meta/llama-3.1-8b", "gemini-2.5-flash"]);
  });

  it("refuses a blob with no models array at all", async () => {
    const { env } = fakeKv({ syncedAt: "x" });
    expect(await readSharedCatalog(env)).toBeNull();
  });
});

describe("publishSharedCatalog", () => {
  it("writes what was parsed, stamped with the app and the time", async () => {
    const { env, read } = fakeKv();
    expect(await publishSharedCatalog(env, [model()], "Kova", "2026-08-02T09:00:00.000Z")).toBe(true);
    expect(read()).toMatchObject({ syncedBy: "Kova", syncedAt: "2026-08-02T09:00:00.000Z" });
    expect(read().models).toHaveLength(1);
  });

  it("does nothing when no namespace is bound", async () => {
    expect(await publishSharedCatalog({}, [model()], "Kova", "t")).toBe(false);
  });

  /** Publishing an empty list would hand every other app a catalog with nothing
   *  in it. Guarded on both sides — `readSharedCatalog` refuses one too. */
  it("refuses to publish an empty catalog", async () => {
    const { env } = fakeKv();
    expect(await publishSharedCatalog(env, [], "Kova", "t")).toBe(false);
  });

  /**
   * A failed publish must not turn a successful sync into an error: the app
   * that ran it already has the fresh rows, and the next sync republishes.
   */
  it("reports failure instead of throwing when KV is down", async () => {
    const { env } = fakeKv(undefined, { failPut: true });
    expect(await publishSharedCatalog(env, [model()], "Kova", "t")).toBe(false);
  });
});
