/**
 * NAMES THE DATABASE CANNOT TAKE.
 *
 * Everything else about a derived table is checked in `data.test.ts` against a
 * real one. This file is about the names themselves, which fail somewhere no
 * human is looking: the DDL is generated, so the first person to see the syntax
 * error is whoever is reading a 503 on every route.
 */

import { describe, expect, it } from "vitest";
import { collection, deriveSchema, field } from "../src/index.js";

/* ------------------------------------------------------------- reserved --- */

/**
 * ⚠️ THE DDL IS GENERATED, SO NOBODY READS IT. A field called `on` — the day
 * something happened, which is exactly what a coaching product wants to call it
 * — derives `on TEXT NOT NULL`, and SQLite answers `near "on": syntax error`.
 * That throws out of the boot-time schema apply, so every route answers 503 with
 * a reference number and no mention of a column.
 *
 * Quoting the identifiers instead would work and is worse: every hand-written
 * query in every app would carry quotes forever, and the one that forgets fails
 * the same way. Refusing the name costs one rename, once, at declaration.
 */
describe("a name SQL cannot take", () => {
  const withField = (name: string) => deriveSchema("t", [collection({
    id: "thing",
    label: { one: "Thing", many: "Things" },
    scope: { of: "tenant" },
    version: true,
    retention: { days: null, onTenantClose: "purge" },
    onDelete: { on: "archive" },
    fields: { [name]: field.text() },
  })]).problems;

  it("refuses a field whose column is a SQL keyword, naming it", () => {
    expect(withField("on").map((p) => p.detail).join()).toMatch(/"on".*SQL keyword/);
    expect(withField("current").map((p) => p.rule)).toContain("reserved");
  });

  it("accepts a name beside one", () => {
    expect(withField("onDay")).toEqual([]);
    expect(withField("currently")).toEqual([]);
  });

  /*
    ⚠️ THE TABLE NAME TOO. A collection called `value` derives `values` and one
    called `row` derives `rows` — both keywords, both a 503 from the first boot.
  */
  it("refuses a collection whose derived table is a keyword", () => {
    const problems = deriveSchema("t", [collection({
      id: "value",
      label: { one: "Value", many: "Values" },
      scope: { of: "tenant" },
      version: true,
      retention: { days: null, onTenantClose: "purge" },
      onDelete: { on: "archive" },
      fields: { title: field.text() },
    })]).problems;
    expect(problems.map((p) => p.detail).join()).toMatch(/table "values"/);
  });
});
