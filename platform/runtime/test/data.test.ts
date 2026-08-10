/**
 * LEAVING, AND THE SWITCH THAT CLOSES EVERY DOOR.
 *
 * ⚠️ THE END-TO-END BEHAVIOUR IS ASSERTED IN `hello` AGAINST A REAL DATABASE.
 * What is here is the decisions — the ones that only show up at a boundary a
 * real database will not reach in a test: a table over the ceiling, a table that
 * is not there, and a stored value nobody can parse.
 */

import { describe, expect, it } from "vitest";
import { erasurePlan, eraseTenant, exportTenant, keptBy, mustLeaveWith, sweepRetention } from "../src/data.js";
import { OPEN, PLATFORM_STATE_SCHEMA, readMaintenance, refuses, setMaintenance, SURVIVES_MAINTENANCE } from "../src/maintenance.js";
import { dataOperations } from "../src/data-ops.js";

import { collection, field } from "@one/kernel";
import { begin } from "../src/impersonation.js";
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
    const out = await eraseTenant(store(rows, ["receipts"]), erasurePlan(modules), "t", null);
    expect(out.tables).toEqual(["notes", "inbox"]);
    expect(out.absent).toEqual(["receipts"]);
    expect(rows).toEqual({ notes: [], inbox: [] });
  });
});

/* --------------------------------------------------------------- objects --- */

/**
 * ⚠️ THE ROWS ARE THE ONLY INDEX OF THE KEYS.
 *
 * A cascade that drops the media table leaves every object in the store with
 * nothing anywhere naming it: it costs money every month, it survives the
 * workspace being forgotten, and the only way to find it again is to list the
 * bucket by hand. `files.ts` says so at the top of itself, and the erasure it
 * warns about was this one.
 */
describe("the bytes, not just the rows", () => {
  /** A store that answers the two statements `eraseObjects` issues, over one table. */
  const withMedia = (media: { id: string; object_key: string }[], rest: Record<string, unknown[]> = {}): SqlHandle => ({
    async all<T>(sql: string, _tenant: unknown, limit: number) {
      if (/FROM media/.test(sql)) return media.slice(0, limit) as T[];
      return ((rest[/FROM (\w+)/.exec(sql)![1]!] ?? []) as T[]).slice(0, limit);
    },
    async first<T>(sql: string) {
      if (/FROM media/.test(sql)) return { n: media.length } as T;
      return { n: 0 } as T;
    },
    async run(sql: string, _tenant: unknown, id?: unknown) {
      if (/DELETE FROM media/.test(sql) && id !== undefined) {
        const at = media.findIndex((m) => m.id === id);
        if (at >= 0) media.splice(at, 1);
        return;
      }
      const table = /FROM (\w+)/.exec(sql)![1]!;
      if (table === "media") media.length = 0;
      else rest[table] = [];
    },
  } as unknown as SqlHandle);

  const bucket = (refuse: readonly string[] = []) => {
    const gone: string[] = [];
    /* ⚠️ Counted, because "gave up" is a claim about attempts rather than results. */
    const tried: string[] = [];
    return {
      gone,
      tried,
      handle: {
        async put() { return ""; },
        async get() { return null; },
        async delete(key: string) {
          tried.push(key);
          if (refuse.includes(key)) throw new Error("no");
          gone.push(key);
        },
      },
    };
  };

  it("deletes every object the workspace stored", async () => {
    const store2 = withMedia([{ id: "m1", object_key: "t/aa" }, { id: "m2", object_key: "t/bb" }], { notes: [{ i: 1 }] });
    const store3 = bucket();
    const out = await eraseTenant(store2, erasurePlan(modules), "t", store3.handle);
    expect(store3.gone).toEqual(["t/aa", "t/bb"]);
    expect(out.objects).toBe(2);
    expect(out.stranded).toBe(0);
    expect(out.tables).toContain("notes");
  });

  /*
    ⚠️ AND THE CASCADE DOES NOT RUN WHILE ONE IS LEFT. Proceeding past a failed
    delete would drop the row naming that key and report a complete erasure —
    somebody's file still on our disks, unfindable, after we told them it was
    gone. Erasure is re-runnable, so refusing costs a retry and nothing else.
  */
  it("stops rather than dropping the rows that name what it could not delete", async () => {
    const store2 = withMedia([{ id: "m1", object_key: "t/aa" }], { notes: [{ i: 1 }] });
    const out = await eraseTenant(store2, erasurePlan(modules), "t", bucket(["t/aa"]).handle);
    expect(out.stranded).toBe(1);
    expect(out.tables).toEqual([]);
    expect(await store2.first<{ n: number }>("SELECT COUNT(*) AS n FROM media")).toEqual({ n: 1 });
  });

  /*
    ⚠️ NO STORE AND SOMETHING STORED IS NOT THE SAME AS NOTHING STORED. A
    deployment with no object binding cannot delete what it cannot reach, and a
    silent zero there is the leak wearing a clean run's clothes.
  */
  it("refuses when there are files and no store to delete them from", async () => {
    const out = await eraseTenant(withMedia([{ id: "m1", object_key: "t/aa" }]), erasurePlan(modules), "t", null);
    expect(out.stranded).toBe(1);
    expect(out.tables).toEqual([]);
  });

  /*
    ⚠️ PAGES UNTIL THERE ARE NONE, NOT ONE PAGE. A single bounded pass deletes
    the first page and reports a clean run, and the cascade behind it drops the
    rows naming every other object — the same leak, reintroduced by the ceiling
    that was meant to bound the work.
  */
  it("keeps going past one page", async () => {
    const many = Array.from({ length: 1_100 }, (_, i) => ({ id: `m${i}`, object_key: `t/${i}` }));
    const store3 = bucket();
    const out = await eraseTenant(withMedia(many), erasurePlan(modules), "t", store3.handle);
    expect(out.objects).toBe(1_100);
    expect(out.stranded).toBe(0);
  });

  /*
    ⚠️ A PAGE THAT DELETED NOTHING ENDS THE RUN. The rows that failed are still
    the first page of the next query, so without it a store that is simply down
    is called ten thousand times before anybody is told.
  */
  it("gives up on a store that is refusing everything", async () => {
    const keys = Array.from({ length: 3 }, (_, i) => `t/${i}`);
    const store3 = bucket(keys);
    const out = await eraseTenant(withMedia(keys.map((k, i) => ({ id: `m${i}`, object_key: k }))), erasurePlan(modules), "t", store3.handle);
    expect(out.stranded).toBe(3);
    expect(out.objects).toBe(0);
    /* Once each, and then it stops asking. */
    expect(store3.tried).toEqual(keys);
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
    expect(runs?.permission).toBe("platform:operate");
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


/* ------------------------------------------------------------ retention --- */

/**
 * WHAT A COLLECTION SAID ABOUT KEEPING ITS OWN ROWS — and both halves of it were
 * read by nothing for the whole of stage 7.
 *
 * ⚠️ THE TWO DECLARATIONS ARE ABOUT DIFFERENT MOMENTS. `days` applies while the
 * workspace is perfectly healthy and is a limit on how long a record may be
 * held at all; `onTenantClose` is a promise about the ORDER of two operations
 * when it leaves. Reading either as the other is the mistake this was written
 * after making.
 */
describe("what a collection says about keeping its rows", () => {
  const keeping = [
    { table: "transient", days: 30, onTenantClose: "purge" as const },
    { table: "permanent", days: null, onTenantClose: "export-then-purge" as const },
    { table: "zeroed", days: 0, onTenantClose: "purge" as const },
  ];

  /*
    ⚠️ `export-then-purge` IS AN OBLIGATION, NOT A PROHIBITION. It does not say
    "never export this"; it says an export happens BEFORE this is destroyed. The
    first implementation read it backwards and filtered the table out of the
    export, which is the opposite of what the words ask for.
  */
  it("names what may not be destroyed without being handed over", () => {
    expect([...mustLeaveWith(keeping)]).toEqual(["permanent"]);
  });

  /* ⚠️ A limit of null or zero is not a limit — sweeping on either would delete
     everything a workspace has ever recorded, immediately. */
  it("sweeps only what declared a real limit", async () => {
    const deleted: string[] = [];
    const db = {
      first: async () => ({ n: 3 }),
      all: async () => [],
      run: async (sql: string) => { deleted.push(/FROM (\w+)/.exec(sql)?.[1] ?? ""); },
      batch: async () => undefined,
    } as unknown as SqlHandle;

    const out = await sweepRetention(db, keeping, "tenant_id", "t_1", "2026-08-10T00:00:00.000Z" as Instant);
    expect(out.map((e) => e.table)).toEqual(["transient"]);
    expect(deleted).toEqual(["transient"]);
  });

  /*
    ⚠️ AND THE NUMBER REPORTED IS WHAT WAS THERE, NOT THE CEILING. Reporting the
    cap — which the first draft did — makes a sweep that removed nothing
    indistinguishable from one that removed five hundred, on the one job whose
    whole output is a number nobody can check afterwards.
  */
  it("reports what it actually removed", async () => {
    const db = {
      first: async () => ({ n: 7 }),
      all: async () => [],
      run: async () => undefined,
      batch: async () => undefined,
    } as unknown as SqlHandle;
    const out = await sweepRetention(db, keeping, "tenant_id", "t_1", "2026-08-10T00:00:00.000Z" as Instant, 500);
    expect(out).toEqual([{ table: "transient", deleted: 7 }]);
  });

  /* ⚠️ Nothing due is no row at all, so a workspace with nothing to sweep does
     not appear as one that was swept. */
  it("says nothing where nothing is due", async () => {
    const db = {
      first: async () => ({ n: 0 }),
      all: async () => [],
      run: async () => { throw new Error("must not delete"); },
      batch: async () => undefined,
    } as unknown as SqlHandle;
    expect(await sweepRetention(db, keeping, "tenant_id", "t_1", "2026-08-10T00:00:00.000Z" as Instant)).toEqual([]);
  });

  /* ⚠️ Derived from the collection, so a renamed one carries its rule with it
     rather than leaving the rule pointed at a table that no longer exists. */
  it("reads the declaration off the collection rather than a list", () => {
    const thing = collection({
      id: "thing",
      label: { one: "Thing", many: "Things" },
      scope: { of: "tenant" },
      version: true,
      holding: { kind: "none" as const, why: "A fixture. It exists to be a shape, not to hold anybody's data." },
      retention: { days: 90, onTenantClose: "purge" },
      onDelete: { on: "archive" },
      fields: { title: field.text({ required: true }) },
    });
    expect(keptBy([thing])).toEqual([{ table: "things", days: 90, onTenantClose: "purge" }]);
  });
});

/* --------------------------------------------------- acting as somebody --- */

/**
 * ⚠️ THE STORE'S OWN REFUSALS, ASSERTED SEPARATELY FROM THE OPERATION'S INPUT
 * SHAPE. The operation declares `reason: s.text({ min: 8 })`, so a short one is
 * refused at the boundary and the check inside `begin` never runs — which means
 * an end-to-end test proves the SHAPE and says nothing about the store.
 *
 * That matters because the shape is the thing somebody widens in six months to
 * accept a different format, and the store is the last thing standing when they
 * do. Two checks for one rule is correct here; one test for two checks is not.
 */
describe("beginning a support session", () => {
  const store = (live: unknown = null) => ({
    async first() { return live; },
    async all() { return []; },
    async run() { return undefined; },
  } as unknown as SqlHandle);

  const ok = { operatorId: "u_1", tenantId: "t_1", reason: "Investigating ticket 4471", maxMinutes: 30 };
  const NOW = "2026-08-10T00:00:00.000Z" as Instant;

  it("takes one with a reason somebody could act on", async () => {
    const out = await begin(store(), ok, NOW);
    expect(out.ok).toBe(true);
  });

  /* ⚠️ "support" is a row nobody can act on six months later. */
  it("refuses one with no reason worth reading", async () => {
    expect(await begin(store(), { ...ok, reason: "support" }, NOW)).toEqual({ ok: false, why: "no_reason" });
    expect(await begin(store(), { ...ok, reason: "        " }, NOW)).toEqual({ ok: false, why: "no_reason" });
  });

  /* ⚠️ A time box with no ceiling, or one measured in days, is not a time box. */
  it("refuses one that is not bounded", async () => {
    for (const maxMinutes of [0, -5, 241, 30.5]) {
      expect(await begin(store(), { ...ok, maxMinutes }, NOW), String(maxMinutes)).toEqual({ ok: false, why: "too_long" });
    }
  });

  /* ⚠️ Two live grants are two expiry times, and the longer one silently
     extends the shorter — which is how a time box stops being one. */
  it("refuses a second while one is live", async () => {
    const running = { id: "imp_1", reason: "x", started_at: NOW, expires_at: "2099-01-01T00:00:00.000Z" };
    expect(await begin(store(running), ok, NOW)).toEqual({ ok: false, why: "already_live" });
  });
});
