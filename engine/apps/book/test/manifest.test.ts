/**
 * THE MANIFEST COMPOSES, AND THE DECISIONS THAT MAKE IT INTERNATIONAL SURVIVE.
 *
 * ⚠️ `defineApp` RUNS EVERY REFUSAL, so the first test is the whole composition
 * suite asserted by the fact that building it does not throw.
 *
 * ⚠️ THE REST GUARD THE THREE THINGS THAT COULD BE UNDONE WITHOUT ANYTHING ELSE
 * FAILING: the role field staying editable, the type field staying settled, and
 * the seed staying refusable a second time.
 */

import { describe, expect, it } from "vitest";
import { oneBook } from "../src/index.js";
import { CHARTS } from "../src/charts.js";
import { ROLES, ROOTS } from "../src/roles.js";

const app = oneBook();
const of = (id: string) => app.collections.find((one) => one.id === id);
const fields = of("account")?.fields ?? {};

describe("OneBook's manifest", () => {
  it("composes", () => {
    expect(app.id).toBe("book");
    expect(app.name).toBe("OneBook");
  });

  /*
    ⚠️ THE ROLE MOVES AND THE KIND DOES NOT, AND THAT PAIR IS THE WHOLE DESIGN.
    Moving a role is the lever a workspace uses to make the books post where it
    wants; moving an account from asset to expense after anything has posted
    moves money between two statements with no write near a figure.
  */
  it("lets the role move and pins the kind", () => {
    expect(fields.role?.settled).toBeUndefined();
    expect(fields.type?.settled).toBe(true);
  });

  it("offers every root and every role on the record", () => {
    expect(fields.type?.values).toEqual([...ROOTS]);
    expect(fields.role?.values).toEqual([...ROLES]);
  });

  /* ⚠️ CLOSED RATHER THAN DELETED — last year's figures were made of it. */
  it("can close an account rather than only delete one", () => {
    expect(fields.closed?.kind).toBe("bool");
  });

  /*
    ⚠️ NOT SHARED, AND THAT IS DELIBERATE. Nothing outside OneBook names an
    account — a posting rule names a role — so sharing it would be a promise to
    keep a shape stable for nobody.
  */
  it("keeps the account table to itself", () => {
    expect(of("account")?.shared).toBeUndefined();
  });

  /* ⚠️ A CHART IS THIRTY ROWS. A ceiling on it would be a workspace that cannot
     describe its own money — see the manifest's own note. */
  it("meters nothing", () => {
    expect(app.entitlements).toEqual({});
    expect(of("account")?.quota).toBeUndefined();
  });
});

describe("opening the books", () => {
  const start = app.operations.find((one) => one.id === "book.start");

  it("offers every shipped chart, by name", () => {
    expect(start?.input.chart?.values).toEqual(CHARTS.map((one) => one.id));
    expect(start?.input.chart?.labels?.universal).toBe("Plain");
  });

  /*
    ⚠️ THE REFUSAL THAT PROTECTS TWO YEARS OF POSTINGS. A template that can be
    applied twice can be applied over a chart somebody has been using, and the
    second application would look like a successful setup.
  */
  it("can refuse a second seed", () => {
    expect(start?.fails).toContain("book.already_open");
    expect(app.problems?.["book.already_open"]?.title).toContain("already open");
  });

  it("is reached by a flow rather than a settings screen", () => {
    const flow = app.screens.find((one) => one.id === "start-the-book");
    const story = (flow as { story?: { writes?: string; lands?: string } })?.story;
    expect(story?.writes).toBe("book.start");
    expect(story?.lands).toBe("accounts");
  });
});

describe("topping the chart up", () => {
  const extend = app.operations.find((one) => one.id === "book.extend");

  /*
    ⚠️ ADDITIVE ONLY, AND THE INPUT BEING EMPTY IS HALF OF WHY. There is nothing
    to pass it: no account to name, no field to overwrite, no template to force.
    An operation that took a chart id could be pointed at somebody else's country
    a year into posting.
  */
  it("takes nothing, so there is nothing to point it at", () => {
    expect(extend?.input).toEqual({});
  });

  it("reads which chart the workspace actually started from", () => {
    expect(app.settings?.["book.chart"]).toBeTruthy();
  });

  it("refuses on a workspace whose books were never opened", () => {
    expect(extend?.fails).toContain("book.not_open");
  });
});
