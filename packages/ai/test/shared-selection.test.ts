/**
 * "Apply to every app", as a broadcast.
 *
 * The behaviours that matter are the ones that separate a broadcast from a
 * shared default: an op applies ONCE and then the app owns its row again, an op
 * naming a model this app has never synced does not stall every later op behind
 * it, and turning a model off cannot leave it as its lane's default.
 */

import { describe, expect, it } from "vitest";
import { SHARED_SELECTION_KEY, applySharedSelection, broadcastSelection } from "../src/shared-selection.js";

interface Row { id: string; task: string; enabled: number; is_default: number }

/**
 * A D1 over an array of model rows, understanding the four statements this
 * module issues. `config` doubles as `app_config`, which is where the cursor
 * lives — so "applied once" is asserted against real persisted state.
 */
function fakeDb(rows: Row[], config: Record<string, string> = {}) {
  const db = {
    prepare: (sql: string) => ({
      all: async () => ({ results: Object.entries(config).map(([key, value]) => ({ key, value })) }),
      first: async () => null,
      bind: (...args: unknown[]) => ({
        first: async () => rows.find((r) => r.id === args[0]) ?? null,
        run: async () => {
          if (/INSERT INTO app_config/.test(sql)) {
            config[String(args[0])] = String(args[1]);
          } else if (/SET is_default = 0 WHERE task/.test(sql)) {
            for (const r of rows) if (r.task === args[0]) r.is_default = 0;
          } else if (/UPDATE ai_models SET/.test(sql)) {
            const target = rows.find((r) => r.id === args[args.length - 1]);
            if (target) {
              const fields = sql.slice(sql.indexOf("SET") + 3, sql.indexOf("WHERE")).split(",").map((f) => f.trim().split(" ")[0]);
              fields.forEach((f, i) => {
                if (f === "enabled") target.enabled = Number(args[i]);
                if (f === "is_default") target.is_default = Number(args[i]);
              });
            }
          }
          return { success: true };
        },
      }),
    }),
  } as unknown as D1Database;
  return { db, rows, config };
}

function fakeKv(initial?: unknown) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(SHARED_SELECTION_KEY, JSON.stringify(initial));
  const kv = {
    get: async (k: string, o?: { type?: string }) => {
      const raw = store.get(k);
      return raw === undefined ? null : o?.type === "json" ? JSON.parse(raw) : raw;
    },
    put: async (k: string, v: string) => void store.set(k, v),
  };
  return { kv: kv as unknown as KVNamespace, read: () => JSON.parse(store.get(SHARED_SELECTION_KEY) ?? "null") };
}

const model = (id: string, task = "text", over: Partial<Row> = {}): Row => ({ id, task, enabled: 0, is_default: 0, ...over });

describe("broadcastSelection", () => {
  it("appends an op with the next sequence number", async () => {
    const { kv, read } = fakeKv();
    expect(await broadcastSelection({ PLATFORM_CONFIG: kv }, { modelId: "m1", enabled: true, by: "Kova", at: "t" })).toBe(true);
    expect(await broadcastSelection({ PLATFORM_CONFIG: kv }, { modelId: "m2", enabled: true, by: "Kova", at: "t" })).toBe(true);
    expect(read().ops.map((o: { seq: number }) => o.seq)).toEqual([1, 2]);
  });

  /** An operator who ticked the box must be told when nothing was sent. */
  it("reports failure when there is no shared store", async () => {
    expect(await broadcastSelection({}, { modelId: "m1", enabled: true, by: "Kova", at: "t" })).toBe(false);
  });
});

describe("applySharedSelection", () => {
  it("applies an op to this app's rows", async () => {
    const { kv } = fakeKv({ seq: 1, ops: [{ seq: 1, modelId: "m1", enabled: true, by: "Kova", at: "t" }] });
    const { db, rows } = fakeDb([model("m1")]);
    const r = await applySharedSelection({ DB: db, PLATFORM_CONFIG: kv });
    expect(r.applied).toBe(1);
    expect(rows[0]!.enabled).toBe(1);
  });

  /**
   * The property that makes this a broadcast rather than a shared default: once
   * applied, the app owns its row. Turning it back off locally must stick.
   */
  it("applies each op exactly once, so a later local change survives", async () => {
    const { kv } = fakeKv({ seq: 1, ops: [{ seq: 1, modelId: "m1", enabled: true, by: "Kova", at: "t" }] });
    const { db, rows, config } = fakeDb([model("m1")]);

    await applySharedSelection({ DB: db, PLATFORM_CONFIG: kv });
    expect(rows[0]!.enabled).toBe(1);
    expect(config["ai.selection_cursor"]).toBe("1");

    // The operator turns it off on THIS app.
    rows[0]!.enabled = 0;

    const again = await applySharedSelection({ DB: db, PLATFORM_CONFIG: kv });
    expect(again.applied).toBe(0);
    expect(rows[0]!.enabled).toBe(0);
  });

  it("applies only what is past the cursor", async () => {
    const { kv } = fakeKv({
      seq: 3,
      ops: [
        { seq: 1, modelId: "m1", enabled: true, by: "Kova", at: "t" },
        { seq: 2, modelId: "m2", enabled: true, by: "Kova", at: "t" },
        { seq: 3, modelId: "m3", enabled: true, by: "Kova", at: "t" },
      ],
    });
    const { db, rows } = fakeDb([model("m1"), model("m2"), model("m3")], { "ai.selection_cursor": "2" });
    const r = await applySharedSelection({ DB: db, PLATFORM_CONFIG: kv });
    expect(r.applied).toBe(1);
    expect(rows.map((x) => x.enabled)).toEqual([0, 0, 1]);
  });

  /**
   * An app that has not synced a model has no row to update. Holding the cursor
   * back would stall every LATER op behind one it can never satisfy.
   */
  it("advances past an op for a model it does not have", async () => {
    const { kv } = fakeKv({
      seq: 2,
      ops: [
        { seq: 1, modelId: "unknown", enabled: true, by: "Kova", at: "t" },
        { seq: 2, modelId: "m1", enabled: true, by: "Kova", at: "t" },
      ],
    });
    const { db, rows, config } = fakeDb([model("m1")]);
    await applySharedSelection({ DB: db, PLATFORM_CONFIG: kv });
    expect(rows[0]!.enabled).toBe(1);
    expect(config["ai.selection_cursor"]).toBe("2");
  });

  /** A lane whose default is switched off resolves to a disabled row, and every
   *  call in it fails. Turning a model off must clear its default too. */
  it("clears the default when a model is switched off", async () => {
    const { kv } = fakeKv({ seq: 1, ops: [{ seq: 1, modelId: "m1", enabled: false, by: "Kova", at: "t" }] });
    const { db, rows } = fakeDb([model("m1", "text", { enabled: 1, is_default: 1 })]);
    await applySharedSelection({ DB: db, PLATFORM_CONFIG: kv });
    expect(rows[0]!.enabled).toBe(0);
    expect(rows[0]!.is_default).toBe(0);
  });

  it("clears the previous default in the lane when a new one arrives", async () => {
    const { kv } = fakeKv({ seq: 1, ops: [{ seq: 1, modelId: "m2", isDefault: true, by: "Kova", at: "t" }] });
    const { db, rows } = fakeDb([model("m1", "text", { enabled: 1, is_default: 1 }), model("m2", "text", { enabled: 1 })]);
    await applySharedSelection({ DB: db, PLATFORM_CONFIG: kv });
    expect(rows[0]!.is_default).toBe(0);
    expect(rows[1]!.is_default).toBe(1);
  });

  it("does nothing, and never throws, with no shared store", async () => {
    const { db } = fakeDb([model("m1")]);
    expect((await applySharedSelection({ DB: db })).applied).toBe(0);
  });
});
