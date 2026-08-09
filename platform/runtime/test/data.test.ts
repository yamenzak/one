/**
 * LEAVING, AND THE SWITCH THAT CLOSES EVERY DOOR.
 *
 * ⚠️ THE END-TO-END BEHAVIOUR IS ASSERTED IN `hello` AGAINST A REAL DATABASE.
 * What is here is the decisions — the ones that only show up at a boundary a
 * real database will not reach in a test: a table over the ceiling, a table that
 * is not there, and a stored value nobody can parse.
 */

import { describe, expect, it } from "vitest";
import { erasurePlan, eraseTenant, exportTenant } from "../src/data.js";
import { OPEN, PLATFORM_STATE_SCHEMA, readMaintenance, refuses, setMaintenance, SURVIVES_MAINTENANCE } from "../src/maintenance.js";
import { dataOperations } from "../src/data-ops.js";

import type { Instant, SchemaModule, SqlHandle } from "@one/kernel";

const AT = "2026-01-10T00:00:00.000Z" as Instant;

const modules: SchemaModule[] = [
  { id: "a", ddl: [], scoped: { tenantColumn: "tenant_id", tenantTables: ["notes", "receipts"] } },
  { id: "b", ddl: [], scoped: { tenantColumn: "tenant_id", tenantTables: ["notes", "inbox"] } },
  { id: "c", ddl: [] },
];

/** Answers the three statements these functions issue, and refuses one table. */
function store(rows: Record<string, unknown[]>, missing: readonly string[] = []): SqlHandle {
  return {
    async all<T>(sql: string, _tenant: unknown, limit: number) {
      const table = /FROM (\w+)/.exec(sql)![1]!;
      if (missing.includes(table)) throw new Error("no such table");
      return (rows[table] ?? []).slice(0, limit) as T[];
    },
    async first<T>(sql: string) {
      const table = /FROM (\w+)/.exec(sql)![1]!;
      if (missing.includes(table)) throw new Error("no such table");
      return { n: (rows[table] ?? []).length } as T;
    },
    async run(sql: string) {
      const table = /FROM (\w+)/.exec(sql)![1]!;
      if (missing.includes(table)) throw new Error("no such table");
      rows[table] = [];
    },
  } as unknown as SqlHandle;
}

/* ------------------------------------------------------------------ plan --- */

describe("what belongs to a workspace", () => {
  /*
    ⚠️ ONE DERIVATION, NOT TWO. A table exported and not erased is a promise
    broken; one erased and not exported is a workspace losing something it was
    never offered a copy of. They differ by a verb, so they read one plan.
  */
  it("names every declared table once, and skips a module that declares none", () => {
    expect(erasurePlan(modules).map((s) => s.table)).toEqual(["notes", "receipts", "inbox"]);
  });
});

/* ---------------------------------------------------------------- export --- */

describe("taking everything with you", () => {
  /*
    ⚠️ WHAT WAS LEFT OUT IS REPORTED. A truncated export that says nothing reads
    as "this is everything you had" — a claim about somebody's own records, made
    falsely, in writing, at the moment they are leaving.
  */
  it("says how much it dropped when a table is over the ceiling", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ i }));
    const out = await exportTenant(store({ notes: many }), erasurePlan(modules), "t", AT, 5);
    expect(out.tables.notes!.length).toBe(5);
    expect(out.dropped).toEqual({ notes: 7 });
  });

  it("says nothing about a table that fitted", async () => {
    const out = await exportTenant(store({ notes: [{ i: 1 }] }), erasurePlan(modules), "t", AT, 5);
    expect(out.dropped).toEqual({});
  });

  /*
    ⚠️ A MISSING TABLE IS SKIPPED RATHER THAN FATAL. An older database
    legitimately predates a module, and refusing the whole export over one absent
    table makes the feature unavailable to exactly the oldest workspaces — the
    ones with the most to lose.
  */
  it("still exports everything else when one table is not there", async () => {
    const out = await exportTenant(store({ notes: [{ i: 1 }] }, ["receipts"]), erasurePlan(modules), "t", AT);
    expect(out.tables.notes!.length).toBe(1);
    expect(out.tables.receipts).toEqual([]);
  });
});

/* --------------------------------------------------------------- erasure --- */

describe("being forgotten", () => {
  /*
    ⚠️ A PURGE THAT THREW ON THE FIRST ABSENT TABLE WOULD LEAVE A WORKSPACE HALF
    ERASED, which is the worst of the three outcomes because it looks like the
    operation did not run.
  */
  it("continues past a table this database does not have, and says which", async () => {
    const rows = { notes: [{ i: 1 }], inbox: [{ i: 2 }] };
    const out = await eraseTenant(store(rows, ["receipts"]), erasurePlan(modules), "t");
    expect(out.tables).toEqual(["notes", "inbox"]);
    expect(out.absent).toEqual(["receipts"]);
    expect(rows).toEqual({ notes: [], inbox: [] });
  });
});

/* ----------------------------------------------------------- maintenance --- */

describe("the switch that closes every door", () => {
  it("refuses writes in readonly and everything in full", () => {
    const readonly = { mode: "readonly" as const, message: "" };
    const full = { mode: "full" as const, message: "" };
    expect(refuses(OPEN, "notes", true, false)).toBe(false);
    expect(refuses(readonly, "notes", false, false)).toBe(false);
    expect(refuses(readonly, "notes", true, false)).toBe(true);
    expect(refuses(full, "notes", false, false)).toBe(true);
  });

  /*
    ⚠️ THE MACHINE LANES SURVIVE. A deployment nobody can probe is one nobody can
    tell has recovered, and a payment provider retries into a closed door and
    eventually gives up — on money.
  */
  it("keeps the lanes with no person behind them open", () => {
    for (const lane of SURVIVES_MAINTENANCE) {
      expect(refuses({ mode: "full", message: "" }, lane, true, false), lane).toBe(false);
    }
  });

  it("lets an operator through, because somebody has to be able to end it", () => {
    expect(refuses({ mode: "full", message: "" }, "notes", true, true)).toBe(false);
  });

  /*
    ⚠️ AN UNREADABLE ROW MEANS OPEN, NOT CLOSED. Failing closed here takes an
    entire deployment down over a malformed string — and the operator's way to
    fix it is a request, which would be refused.
  */
  it("reads a value nobody can parse as open rather than as closed", async () => {
    const rows = new Map<string, string>();
    const db = {
      async first<T>() { const v = rows.get("maintenance"); return v ? ({ value: v } as T) : null; },
      async run(_sql: string, _k: string, value: string) { rows.set("maintenance", value); },
    } as unknown as SqlHandle;

    expect(await readMaintenance(db)).toEqual(OPEN);
    rows.set("maintenance", "{not json");
    expect(await readMaintenance(db)).toEqual(OPEN);
    rows.set("maintenance", JSON.stringify({ mode: "sideways", message: "" }));
    expect(await readMaintenance(db)).toEqual(OPEN);

    await setMaintenance(db, { mode: "full", message: "Back shortly" }, AT);
    expect(await readMaintenance(db)).toEqual({ mode: "full", message: "Back shortly" });
  });

  it("stores its switch in the global store, where it is readable before a region is", () => {
    expect(PLATFORM_STATE_SCHEMA.ddl[0]).toMatch(/platform_state/);
  });
});

/* ------------------------------------------------------------- the doors --- */

describe("the way out", () => {
  const ops = dataOperations({} as never);

  it("mounts export, close, cancel and erase, all on the exit lane", () => {
    const leaving = ops.filter((op) => op.id.startsWith("exit."));
    expect(leaving.map((op) => op.id).sort()).toEqual(["exit.cancel", "exit.close", "exit.erase", "exit.export"]);
    expect(leaving.length).toBe(4);
  });

  /*
    ⚠️ THE SCHEDULER'S RECORD SITS WITH THE DEAD LETTER, on the `billing` lane
    and behind an operator permission. Both answer the same shape of question —
    "is the machinery still running" — and both are read during exactly the
    incident where hitting a standing gate would be least helpful.
  */
  it("puts the scheduler's record beside the other operator reads", () => {
    const runs = ops.find((op) => op.id === "billing.jobs");
    expect(runs?.permission).toBe("billing:operate");
  });

  /*
    ⚠️ THREE OF THE FOUR ARE NOT TOOLS. An export is every row a workspace has;
    closing and erasing are decisions a model can be talked into by a sentence in
    something it was asked to read. Cancelling a close is the one that is safe —
    the worst it can do is keep a workspace alive.
  */
  it("keeps everything but changing your mind away from the assistant", () => {
    const byId = new Map(ops.map((op) => [op.id, op]));
    for (const id of ["exit.export", "exit.close", "exit.erase"]) expect(byId.get(id)!.tool, id).toBe(false);
    expect(byId.get("exit.cancel")!.tool).toBeUndefined();
  });
});
