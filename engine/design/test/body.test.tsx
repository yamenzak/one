/**
 * A DECLARATION IN, A SCREEN OUT.
 *
 * ⚠️ WHAT IS ASSERTED HERE IS THAT THE BINDING REACHES THE COMPONENT, which is
 * the one thing every other check in the repository is blind to. React drops a
 * prop a component does not read — no error, no warning, no type complaint — so
 * a renderer filling the wrong prop name composes, mounts, and draws an empty
 * region. Twenty-three of the forty registry entries named a slot their
 * component does not take when this file was written; `vocabulary.test.mjs` is
 * the static half and this is the half that watches a value come out the far end.
 *
 * ⚠️ AND THE VALUES ARE DISTINCTIVE ON PURPOSE. "eighteen" in a test is a string
 * that could arrive from four places; `Sodium chloride` and `48 crates` could
 * not. A fixture that would still pass if the wrong field were read is a fixture
 * asserting the component renders rather than that the binding works.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SurfaceSpec } from "@engine/kernel";
import { ready, waiting, trouble } from "../src/index.js";
import { Body, type Has } from "../src/rendered/body.js";
import { PLATFORM_PROBLEMS, problem } from "@engine/kernel";

const RECORD = { name: "Sodium chloride", held: 48, worth: 125_00, standing: "held" };

const has = (over: Partial<Has> = {}): Has => ({
  record: RECORD,
  views: {
    shelves: ready([
      { id: "s1", name: "Cold room" }, { id: "s2", name: "Bay four" },
      { id: "s3", name: "Trolley" },
    ]),
  },
  ...over,
});

const drawn = (body: SurfaceSpec, over: Partial<Has> = {}) =>
  renderToStaticMarkup(<Body body={body} has={has(over)} />);

const one = (block: SurfaceSpec["blocks"][number]): SurfaceSpec =>
  ({ shape: "detail", layout: { as: "stack" }, blocks: [block] });

/* ------------------------------------------------------------ the binding --- */

describe("a binding reaches the prop it names", () => {
  it("puts a field on the component that reads it", () => {
    expect(drawn(one({
      block: "FieldRow",
      bind: {
        label: { from: { of: "words", says: "What it is" } },
        value: { from: { of: "field", field: "name" } },
      },
    }))).toContain("Sodium chloride");
  });

  /*
    ⚠️ THE ONE THAT CATCHES A RENAMED PROP. `Listing` reads `of`; the registry
    said `rows` for a year. Bound to `rows` this renders a list component with an
    undefined collection — which is a table with a header and no error.
  */
  it("puts a view on a block that takes a whole list", () => {
    const html = drawn(one({
      block: "Listing",
      shows: [{ field: "name", label: "Shelf" }],
      nothing: { says: "No shelves yet" },
      bind: {
        label: { from: { of: "words", says: "Shelves" } },
        of: { from: { of: "view", view: "shelves" } },
      },
    }));
    /* ⚠️ THE ROW'S OWN WORDS, NOT THE COLUMN HEADING. The wide half of a listing
       is behind a lazy boundary, so static markup holds the narrow half — the
       rows — and asserting on the heading would be asserting that a Suspense
       fallback rendered. */
    expect(html, "the list drew none of its three rows").toContain("Cold room");
  });

  it("counts a view rather than listing it", () => {
    expect(drawn(one({
      block: "Stat",
      bind: {
        label: { from: { of: "words", says: "Shelves" } },
        value: { from: { of: "count", view: "shelves" } },
      },
    }))).toContain("3");
  });

  /*
    ⚠️ A FORMAT IS THE DECLARATION'S, AND THE DIFFERENCE HAS TO BE VISIBLE. The
    same stored number drawn plain and drawn as money are two different strings;
    if they are not, the `as` never reached a formatter and every price in the
    product is a bare integer of minor units.
  */
  it("draws the same number differently when the format says so", () => {
    const bind = (as?: "money") => one({
      block: "FieldRow",
      bind: {
        label: { from: { of: "words", says: "Worth" } },
        value: { from: { of: "field", field: "worth" }, ...(as ? { as } : {}) },
      },
    });
    const plain = drawn(bind());
    const money = drawn(bind("money"), { currency: "EUR" });
    expect(plain).toContain("12500");
    expect(money, "the format never reached a formatter").not.toContain(">12500<");
  });

  /*
    ⚠️ NO CURRENCY, NO PRICE. A default would draw one workspace's prices in
    another's symbol — right to the penny and wrong by a factor — so the absence
    has to be an absence rather than a guess.
  */
  it("draws no price at all when the workspace has no currency", () => {
    expect(drawn(one({
      block: "FieldRow",
      bind: {
        label: { from: { of: "words", says: "Worth" } },
        value: { from: { of: "field", field: "worth" }, as: "money" },
      },
    }))).not.toContain("12500");
  });
});

/* ------------------------------------------------------------- whether --- */

describe("a block is drawn only when its condition holds", () => {
  const conditional = (when: NonNullable<SurfaceSpec["blocks"][number]["when"]>) => one({
    block: "NoteRow",
    when,
    bind: { children: { from: { of: "words", says: "Only sometimes" } } },
  });

  it("draws it when the field is there", () => {
    expect(drawn(conditional({ has: { of: "field", field: "name" } })))
      .toContain("Only sometimes");
  });

  it("leaves it out when the field is not", () => {
    expect(drawn(conditional({ has: { of: "field", field: "nothing" } })))
      .not.toContain("Only sometimes");
  });

  it("answers an enum by membership rather than by presence", () => {
    expect(drawn(conditional({ is: { of: "field", field: "standing" }, one: ["held"] })))
      .toContain("Only sometimes");
    expect(drawn(conditional({ is: { of: "field", field: "standing" }, one: ["ok"] })))
      .not.toContain("Only sometimes");
  });

  it("inverts", () => {
    expect(drawn(conditional({ not: { has: { of: "field", field: "name" } } })))
      .not.toContain("Only sometimes");
  });
});

/* ------------------------------------------------------------ the outcomes --- */

/**
 * ⚠️ A BLOCK WAITS ON WHAT IT READS AND NOTHING ELSE. Joining every block to one
 * outcome puts a heading and a note — neither of them fetched — behind the
 * slowest list on the page, which is the whole-screen skeleton this vocabulary
 * replaced.
 */
describe("a block waits on the view it reads, and only that", () => {
  const screen: SurfaceSpec = {
    shape: "detail",
    layout: { as: "stack" },
    blocks: [
      { block: "NoteRow", bind: { children: { from: { of: "words", says: "Always here" } } } },
      {
        block: "Listing",
        shows: [{ field: "name", label: "Shelf" }],
        nothing: { says: "No shelves yet", under: "Add one to get started" },
        bind: {
          label: { from: { of: "words", says: "Shelves" } },
          of: { from: { of: "view", view: "shelves" } },
        },
      },
    ],
  };

  it("draws the unfetched block while the fetched one is still waiting", () => {
    const html = drawn(screen, { views: { shelves: waiting() } });
    expect(html, "a note that reads nothing was held behind a list").toContain("Always here");
    expect(html).toContain('aria-label="Loading table"');
  });

  it("draws trouble rather than emptiness when the view failed", () => {
    const html = drawn(screen, {
      views: { shelves: trouble(problem(PLATFORM_PROBLEMS, "platform.unavailable")) },
    });
    expect(html).toContain("Always here");
    expect(html).not.toContain('aria-label="Loading table"');
  });

  /*
    ⚠️ IN THE APP'S OWN WORDS, WHICH IS WHY `nothing` IS REQUIRED OF ANY BLOCK
    THAT READS A LIST. A renderer inventing "Nothing here yet" is the omission
    `Region.nothing` was made required to stop, with the app taken out of the
    loop — every empty list in every product saying the same nothing.
  */
  it("says what emptiness means, in the words the declaration carries", () => {
    const html = drawn(screen, { views: { shelves: ready([]) } });
    expect(html).toContain("Always here");
    expect(html).toContain("No shelves yet");
  });
});

/* --------------------------------------------------------------- the shape --- */

describe("the declaration's structure survives into the markup", () => {
  it("draws a group's label over its blocks", () => {
    expect(drawn({
      shape: "detail",
      layout: { as: "stack" },
      blocks: [{
        group: "What it is",
        of: [{
          block: "FieldRow",
          bind: {
            label: { from: { of: "words", says: "Name" } },
            value: { from: { of: "field", field: "name" } },
          },
        }],
      }],
    })).toContain("What it is");
  });

  /*
    ⚠️ THE ASIDE IS PULLED OUT BEFORE THE REST, because a split's two columns are
    a structure rather than two siblings — `Arranged` takes it as its own
    argument. A renderer that left it in the list would draw it as a third row
    under the main content on every width.
  */
  it("hands a split's aside to the layout rather than leaving it in the column", () => {
    const html = drawn({
      shape: "detail",
      layout: { as: "split", aside: "end" },
      blocks: [
        { block: "NoteRow", bind: { children: { from: { of: "words", says: "The main thing" } } } },
        {
          block: "NoteRow",
          beside: true,
          bind: { children: { from: { of: "words", says: "The side thing" } } },
        },
      ],
    });
    expect(html).toContain("<aside");
    expect(html.indexOf("The main thing")).toBeLessThan(html.indexOf("<aside"));
    expect(html.indexOf("The side thing")).toBeGreaterThan(html.indexOf("<aside"));
  });
});
