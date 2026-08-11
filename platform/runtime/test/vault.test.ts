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
import type { Instant, PlainDate } from "@one/kernel";
import { derive, VAULT_COLUMNS, VAULT_SCHEMA, type StoredFact } from "../src/vault.js";

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
      const known = VAULT_COLUMNS[table!];
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
        const anywhere = Object.values(VAULT_COLUMNS).some((cols) => cols.includes(column!));
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
