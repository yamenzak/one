/**
 * THE VAULT'S STATEMENTS, AND ITS ARITHMETIC.
 *
 * ⚠️ THE FIRST DESCRIBE EXISTS BECAUSE OF A MISSPELLED COLUMN. A rename swept
 * every occurrence of one word except the one inside an `ON CONFLICT … DO UPDATE
 * SET`, and the result typechecked, passed 50 unit tests over the resolver, and
 * answered 503 on exactly one write — a share, which is the write the whole
 * subsystem is for. Nothing in a type system can see inside a SQL string, so the
 * check has to be here.
 *
 * ⚠️ THE SECOND EXISTS BECAUSE A DERIVATION IS DEFINED BY WHAT IT REFUSES TO
 * SAY. "How much have they changed" is naturally written by returning the two
 * endpoints, and a reading that hands back an endpoint discloses the value it
 * was built to withhold.
 */

import { describe, expect, it } from "vitest";
import type { Instant, PlainDate, SqlHandle } from "@one/kernel";
import {
  derive, publishedSpecs, VAULT_COLUMNS, VAULT_SCHEMA, VAULT_SPEC_COLUMNS, VAULT_SPEC_SCHEMA,
  type StoredFact,
} from "../src/vault.js";

/* ⚠️ EVERY TABLE THIS FILE WRITES TO, whichever module declares it. The scanner
   below reads statements, and a statement does not know which schema its table
   came from — so a second map that the scanner did not consult would be a table
   whose columns nothing checked. */
const ALL_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  ...VAULT_COLUMNS, vault_specs: VAULT_SPEC_COLUMNS,
};

/* --------------------------------------------------------------- columns --- */

describe("every statement names a column that exists", () => {
  const source = [...VAULT_SCHEMA.ddl].join("\n");

  it("declares each table with exactly the columns it lists", () => {
    for (const [table, columns] of Object.entries(VAULT_COLUMNS)) {
      const ddl = source.split("\n").find((line) => line.includes(`CREATE TABLE IF NOT EXISTS ${table} `));
      expect(ddl, `${table} has no CREATE TABLE`).toBeDefined();
      for (const c of columns) {
        expect(ddl, `${table} does not declare ${c}`).toMatch(new RegExp(`[(,]\\s*${c}\\s`));
      }
    }
  });

  /*
    ⚠️ THE ONE THAT WOULD HAVE CAUGHT IT. Every `SET x = ` and every insert
    column list in the store, checked against the table it writes to. A word that
    is not a column of that table is a statement that throws at runtime and
    nowhere else.
  */
  it("writes only columns the table it writes to actually has", async () => {
    const store = await import("node:fs/promises")
      .then((fs) => fs.readFile(new URL("../src/vault.ts", import.meta.url), "utf8"));

    /* Strip comments: a column name in prose is not a statement. */
    const code = store.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    for (const [, table, list] of code.matchAll(/INSERT INTO (vault_\w+)\s*\(([^)]+)\)/g)) {
      const known = ALL_COLUMNS[table!];
      expect(known, `INSERT names an unknown table ${table}`).toBeDefined();
      for (const raw of list!.split(",")) {
        const c = raw.trim();
        if (!c) continue;
        expect(known, `INSERT INTO ${table} names ${c}, which is not one of its columns`).toContain(c);
      }
    }

    /*
      ⚠️ AND THE UPDATE HALF, which is where it actually went wrong. The insert
      list was right and the conflict clause was not, so every FIRST share
      succeeded and every re-share threw — the failure appeared only on the
      second attempt, which is the shape nobody reproduces.
    */
    for (const [, clause] of code.matchAll(/DO UPDATE SET ([^`]+?)(?:`|,\s*$)/g)) {
      for (const [, column] of clause!.matchAll(/(\w+)\s*=\s*excluded\./g)) {
        const anywhere = Object.values(ALL_COLUMNS).some((cols) => cols.includes(column!));
        expect(anywhere, `DO UPDATE SET names ${column}, which is not a column of any vault table`).toBe(true);
      }
    }
  });

  /*
    ⚠️ EVERY TABLE IS SCOPED, WHICH IS WHAT MAKES ERASURE DERIVED. A table added
    here without a scope is one a purge walks silently past — and the person it
    belonged to is told their data is gone.
  */
  it("declares every table for erasure", () => {
    expect([...(VAULT_SCHEMA.scoped?.tenantTables ?? [])].sort()).toEqual(Object.keys(VAULT_COLUMNS).sort());
    expect(VAULT_SCHEMA.scoped?.tenantColumn).toBe("account_id");
  });
});

/* -------------------------------------------------------------- readings --- */

describe("what a reading refuses to say", () => {
  const NOW = "2026-08-11T10:00:00.000Z" as Instant;
  const day = (at: string, value: string): StoredFact =>
    ({ fact: "body.mass", at: at as PlainDate, value, recordedAt: NOW });

  const WEIGHTS = [day("2026-08-01", "84.6"), day("2026-08-15", "82.4")];

  it("gives a rate per week and neither weight behind it", () => {
    const out = derive("body.mass.trend", WEIGHTS, NOW)!;
    expect(out.value).toBe(-1.1);
    const seen = JSON.stringify(out);
    expect(seen).not.toContain("84.6");
    expect(seen).not.toContain("82.4");
  });

  /*
    ⚠️ WHOLE POINTS, AND NO COARSER. What makes this safe is that the reader does
    not know the start, not that the number is vague — so coarsening buys no
    privacy and costs accuracy. Rounding to five turned a real 2.6% into a
    reported 5%, which is privacy bought by lying to the person planning from it.
  */
  it("gives an honest percentage, because coarsening it buys no privacy here", () => {
    expect(derive("body.mass.progress", WEIGHTS, NOW)!.value).toBe(-3);
  });

  it("says nothing at all from a single reading, because a trend over one is not one", () => {
    expect(derive("body.mass.trend", [day("2026-08-01", "84.6")], NOW)!.value).toBeNull();
  });

  it("reports how many days it stands on, so a caller can refuse a thin one", () => {
    expect(derive("body.mass.trend", WEIGHTS, NOW)!.over).toBe(2);
  });

  /* ⚠️ A decade, never an age. An age in years plus a month of birth is a date. */
  it("gives a decade band and never a birth date", () => {
    const born = { fact: "person.birthDate", at: "0001-01-01" as PlainDate, value: "1988-03-14", recordedAt: NOW };
    const out = derive("person.birthDate.ageBand", [born], NOW)!;
    expect(out.value).toBe("30s");
    expect(JSON.stringify(out)).not.toContain("1988");
  });

  /*
    ⚠️ AN UNIMPLEMENTED READING RETURNS NOTHING RATHER THAN GUESSING. The
    registry is checked at composition and the arithmetic is not, so the gap
    between them is where a reading declared today and computed next week lives.
    A default branch handing back the raw value would turn that gap into a
    disclosure.
  */
  it("computes nothing for a reading it does not know", () => {
    expect(derive("body.mass.aura", WEIGHTS, NOW)).toBeNull();
  });

  it("survives a value that is not a number", () => {
    expect(derive("body.mass.trend", [day("2026-08-01", "heavy"), day("2026-08-15", "heavier")], NOW)!.value).toBeNull();
  });
});

describe("what every app wants, where every app can see it", () => {
  /*
    ⚠️ THE VAULT IS ONE PERSON'S, SO IT CANNOT BE RENDERED FROM ONE APP'S MANIFEST.
    A worker knows its own wants and nothing about the product beside it — so the
    hub could only ever have shown the app it happened to be running
    inside, which is not the question it exists to answer. Every app publishes its
    declaration into the global store; whoever renders the vault reads all of them.

    ⚠️ AND EVERY STATEMENT IS READ AGAINST THE COLUMNS IT NAMES, which is the same
    check the grant table has and for the same reason: a rename swept every
    occurrence except the one inside an `ON CONFLICT` clause, it typechecked, it
    passed every unit test, and it threw only on the second write.
  */
  const columns = new Set<string>(VAULT_SPEC_COLUMNS);

  it("declares one table, and every column it uses is in it", () => {
    const ddl = VAULT_SPEC_SCHEMA.ddl.join("\n");
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS vault_specs");
    for (const c of columns) expect(ddl, `${c} is named and never created`).toContain(c);
    const created = [...ddl.matchAll(/\b([a-z_]+) (?:TEXT|INTEGER)\b/g)].map((m) => m[1]!);
    for (const c of created) expect(columns, `${c} is created and not on the allow-list`).toContain(c);
  });

  /*
    ⚠️ NOTHING ABOUT A PERSON IS IN IT, and the list is how that stays true. Rows
    here are copied out of manifests that ship in the bundle — as public as the app
    is — and one convenient addition would silently make this a global store of
    something residency governs, with nothing failing.
  */
  it("holds declarations and nothing that belongs to anybody", () => {
    expect([...columns]).toEqual(["app_id", "app_name", "wants"]);
    expect(VAULT_SPEC_SCHEMA.ddl.join("\n")).not.toMatch(/account_id|user_id|tenant_id|email/);
  });

  /* ⚠️ GLOBAL, LIKE THE VAULT ITSELF. Declared regionally, an hub in
     one region would answer for a subset of the products somebody uses and say
     nothing about the rest. */
  it("names no dependency that would put it in a region", () => {
    expect(VAULT_SPEC_SCHEMA.after ?? []).toEqual([]);
    expect(VAULT_SPEC_SCHEMA.scoped).toBeUndefined();
  });
});

describe("reading every app's declaration back", () => {
  /* A handle that answers one query, which is all this reader does. */
  const answering = (rows: unknown[]): SqlHandle =>
    ({ all: async () => rows } as unknown as SqlHandle);

  it("hands back each app's wants, parsed", async () => {
    const back = await publishedSpecs(answering([
      { app_id: "kova", app_name: "Kova", wants: '[{"fact":"body.mass","need":"derived","why":"A direction."}]' },
    ]));
    expect(back).toEqual([{
      appId: "kova", appName: "Kova",
      spec: { wants: [{ fact: "body.mass", need: "derived", why: "A direction." }] },
    }]);
  });

  /*
    ⚠️ ONE PRODUCT'S BAD ROW MUST NOT TAKE THE ACCOUNT CENTRE DOWN WITH IT. Every
    row here was written by a different worker, possibly a version ahead — so a
    value this one cannot read is a product missing from the screen, never a screen
    that fails to render.
  */
  it("drops a row it cannot parse rather than throwing on it", async () => {
    const back = await publishedSpecs(answering([
      { app_id: "scena", app_name: "Scena", wants: "{not json" },
      { app_id: "kova", app_name: "Kova", wants: "[]" },
    ]));
    expect(back.map((x) => x.appId)).toEqual(["kova"]);
  });

  /* ⚠️ AND A STORE THAT WILL NOT ANSWER IS AN EMPTY VAULT, not a broken one. */
  it("answers with nothing when the store refuses the read", async () => {
    const broken = { all: async () => { throw new Error("no"); } } as unknown as SqlHandle;
    expect(await publishedSpecs(broken)).toEqual([]);
  });
});
