/**
 * A SCREEN'S BODY, REFUSED — every fault here draws a page.
 *
 * ⚠️ THAT IS THE STANDARD, AND IT IS SHARPER FOR A BODY THAN FOR ANYTHING ELSE
 * IN THE MANIFEST. A collection that does not compose fails on the first
 * request; a screen that binds a field its subject does not have renders a blank
 * line where a fact was, and a blank line looks like an unfinished design rather
 * than a bug. Every case below produces a screen somebody would sign off.
 *
 * ⚠️ AND THE FIRST GROUP IS ABOUT THE VOCABULARY BEING CLOSED, which is the one
 * property this whole design rests on. If a comparison can be smuggled into a
 * view, or a slot can take a kind of source it cannot draw, the declaration has
 * started being a programming language and every argument for it stops holding.
 */

import { describe, expect, it } from "vitest";
import { collection } from "../src/collection.js";
import { field } from "../src/field.js";
import {
  BLOCK_STATES, COLS_MOST, colsOf, fieldsIn, refuseSurface, refuseView, unreadViews,
  viewsIn, type BlockIndex, type SurfaceSpec, type ViewSpec,
} from "../src/surface.js";

/* ------------------------------------------------------------------ world --- */

const note = collection({
  id: "note",
  label: { one: "Note", many: "Notes" },
  scope: { of: "tenant" },
  permission: "note",
  retention: null,
  onClose: { then: "purge" },
  fields: {
    title: field.text({ label: "Title", required: true, holds: "none" }),
    at: field.instant({ label: "Written", holds: "none" }),
    pinned: field.bool({ label: "Pinned", holds: "none" }),
    words: field.number({ label: "Words", holds: "none" }),
  },
});

const COLLECTIONS = [note];

const recent: ViewSpec = {
  id: "recent-notes",
  of: "note",
  where: [{ field: "pinned", is: { literal: true } }],
  sort: { by: "at", dir: "down" },
  limit: 10,
};

/**
 * ⚠️ A STAND-IN FOR THE GENERATED INDEX, AND IT IS DELIBERATELY SMALL. What
 * stage 91 generates is the real one; what these tests need is a block whose
 * slots have known kinds, because the refusals are about the PAIRING of a slot
 * and a binding rather than about any particular component.
 */
const HEADING = {
  id: "Heading",
  takes: { says: { label: "The words", takes: ["field", "words"], required: true } },
  states: [...BLOCK_STATES],
} as const satisfies BlockIndex[string];

const INDEX: BlockIndex = {
  Heading: HEADING,
  Listing: {
    id: "Listing",
    takes: {
      rows: { label: "The rows", takes: ["view"], required: true },
      total: { label: "How many", takes: ["count"] },
    },
    states: [...BLOCK_STATES],
  },
};

const body = (over: Partial<SurfaceSpec> = {}): SurfaceSpec => ({
  shape: "detail",
  layout: { as: "stack" },
  blocks: [{ block: "Heading", bind: { says: { from: { of: "field", field: "title" } } } }],
  ...over,
});

const screen = (over: Record<string, unknown> = {}) =>
  ({ id: "one-note", of: "note", body: body(), ...over }) as Parameters<typeof refuseSurface>[0];

const why = (
  s: Parameters<typeof refuseSurface>[0],
  views: readonly ViewSpec[] = [recent],
  ops: readonly string[] = ["note.publish"],
) => refuseSurface(s, INDEX, views, COLLECTIONS, ops).map((p) => p.why);

/* ------------------------------------------------------------ it composes --- */

describe("a body that composes", () => {
  it("accepts one whose every name resolves", () => {
    expect(refuseSurface(screen(), INDEX, [recent], COLLECTIONS, [])).toEqual([]);
  });

  /* ⚠️ A screen with no body is every screen today — the two coexist, so a
     product ports one screen at a time rather than all of them at once. */
  it("says nothing at all about a screen that draws itself", () => {
    expect(refuseSurface({ id: "x" }, {}, [], COLLECTIONS, [])).toEqual([]);
  });

  it("reports every fault in one pass, like the rest of the manifest", () => {
    const found = why(screen({
      body: body({
        blocks: [
          { block: "Ghost" },
          { block: "Heading", bind: { says: { from: { of: "field", field: "nope" } } } },
        ],
      }),
    }));
    expect(found).toContain("block_unknown");
    expect(found).toContain("field_unknown");
  });
});

/* --------------------------------------------------- the closed vocabulary --- */

describe("the vocabulary is closed", () => {
  /*
    ⚠️ THIS IS THE TEST THAT PROTECTS THE WHOLE DESIGN, and it is a type-level
    claim asserted at runtime on purpose. A `Match` has `is`, `isnt`, `set` and
    `unset` and no comparison — so a rule like "below its floor" cannot be
    written here and has to become a field the collection computes. The day
    somebody adds `gt` to make one screen easier, the manifest has become a
    query language and every argument for declaring screens stops holding.
  */
  it("has no comparison operator anywhere in a match", () => {
    const keys = new Set<string>();
    for (const m of [
      { field: "a", is: { literal: 1 } },
      { field: "a", isnt: { literal: 1 } },
      { field: "a", set: true },
      { field: "a", unset: true },
    ] as const) for (const k of Object.keys(m)) keys.add(k);
    expect([...keys].sort()).toEqual(["field", "is", "isnt", "set", "unset"]);
  });

  it("refuses a slot given a kind of source it cannot draw", () => {
    /* A list of records bound to one value: today this renders an empty list. */
    expect(why(screen({
      body: body({
        blocks: [{ block: "Listing", bind: { rows: { from: { of: "field", field: "title" } } } }],
      }),
    }))).toContain("slot_kind_wrong");
  });

  it("refuses a slot the block does not have", () => {
    expect(why(screen({
      body: body({
        blocks: [{
          block: "Heading",
          bind: {
            says: { from: { of: "words", says: "Note" } },
            colour: { from: { of: "words", says: "red" } },
          },
        }],
      }),
    }))).toContain("slot_unknown");
  });

  it("refuses a block missing a slot it cannot draw without", () => {
    expect(why(screen({ body: body({ blocks: [{ block: "Heading" }] }) })))
      .toContain("slot_missing");
  });
});

/* ------------------------------------------------------------ the subject --- */

describe("a field is a field of something", () => {
  /*
    ⚠️ THE SHARPEST ONE HERE. Without `of` there is no record, so every `field`
    binding resolves to undefined — and a heading bound to undefined is not an
    error, it is a blank line. The screen reads as unfinished rather than as
    broken, which is exactly how it survives review.
  */
  it("refuses a field bound on a screen that is about nothing", () => {
    expect(why(screen({ of: undefined }))).toContain("field_without_a_subject");
  });

  it("refuses a field the subject does not have", () => {
    expect(why(screen({
      body: body({
        blocks: [{ block: "Heading", bind: { says: { from: { of: "field", field: "author" } } } }],
      }),
    }))).toContain("field_unknown");
  });

  it("refuses a subject collection the app does not declare", () => {
    expect(why(screen({ of: "ghost" }))).toContain("view_collection_unknown");
  });

  /* ⚠️ A name that is not a name would be interpolated into a column. */
  it("refuses a field name that could not be a column", () => {
    expect(why(screen({
      body: body({
        blocks: [{ block: "Heading", bind: { says: { from: { of: "field", field: "1; drop" } } } }],
      }),
    }))).toContain("not_a_name");
  });
});

/* ------------------------------------------------------------ formatters --- */

describe("a formatter can say the kind it is given", () => {
  /*
    ⚠️ NEITHER HALF IS WRONG ON ITS OWN, which is why nothing downstream can see
    it. The field is a real field, the formatter is a real formatter, and the
    pair renders `Invalid Date` on a screen nobody opened during review.
  */
  it("refuses a date drawn over a name", () => {
    expect(why(screen({
      body: body({
        blocks: [{
          block: "Heading",
          bind: { says: { from: { of: "field", field: "title" }, as: "when" } },
        }],
      }),
    }))).toContain("format_wrong");
  });

  it("refuses money drawn over a count of words", () => {
    expect(why(screen({
      body: body({
        blocks: [{
          block: "Heading",
          bind: { says: { from: { of: "field", field: "words" }, as: "money" } },
        }],
      }),
    }))).toContain("format_wrong");
  });

  it("accepts a date drawn over an instant", () => {
    expect(why(screen({
      body: body({
        blocks: [{
          block: "Heading",
          bind: { says: { from: { of: "field", field: "at" }, as: "when" } },
        }],
      }),
    }))).toEqual([]);
  });
});

/* ----------------------------------------------------------------- views --- */

describe("a view is checked against the collection it reads", () => {
  it("accepts one whose every field is there", () => {
    expect(refuseView(recent, COLLECTIONS)).toEqual([]);
  });

  /*
    ⚠️ THIS DOES NOT THROW ANYWHERE ELSE. A comparison against a missing column
    is an error the runtime reports as a failed read, so the list draws its
    trouble state: the screen is wrong, every guard is green, and the cause is
    four files away.
  */
  it("refuses one narrowing on a field the collection does not have", () => {
    const bad = { ...recent, where: [{ field: "author", set: true }] } as ViewSpec;
    expect(refuseView(bad, COLLECTIONS).map((p) => p.why)).toContain("view_field_unknown");
  });

  it("refuses one sorting by a field the collection does not have", () => {
    const bad = { ...recent, sort: { by: "author", dir: "down" } } as ViewSpec;
    expect(refuseView(bad, COLLECTIONS).map((p) => p.why)).toContain("view_field_unknown");
  });

  it("refuses one over a collection the app does not declare", () => {
    expect(refuseView({ id: "v", of: "ghost" }, COLLECTIONS).map((p) => p.why))
      .toContain("view_collection_unknown");
  });

  it("refuses a screen reading a view nobody declared", () => {
    expect(why(screen({
      body: body({
        blocks: [{ block: "Listing", bind: { rows: { from: { of: "view", view: "ghost" } } } }],
      }),
    }), [])).toContain("view_unknown");
  });

  /*
    ⚠️ A VIEW NAMED ONLY INSIDE A `when` IS STILL A VIEW. A check reading `bind`
    alone reports the screen as sound while its one conditional points at
    nothing — and the section then never draws, which reads as "there is none of
    that here" rather than as a fault.
  */
  it("finds a view named only in a condition", () => {
    const conditional = body({
      blocks: [{
        block: "Heading",
        when: { not: { empty: { of: "view", view: "recent-notes" } } },
        bind: { says: { from: { of: "words", says: "Recent" } } },
      }],
    });
    expect(viewsIn(conditional)).toEqual(["recent-notes"]);
  });

  it("finds a field named only in a condition", () => {
    const conditional = body({
      blocks: [{
        block: "Heading",
        when: { has: { of: "field", field: "at" } },
        bind: { says: { from: { of: "words", says: "Written" } } },
      }],
    });
    expect(fieldsIn(conditional)).toEqual(["at"]);
  });

  it("reports a view no screen reads", () => {
    expect(unreadViews([recent], [body()])).toEqual(["recent-notes"]);
    const reading = body({
      blocks: [{ block: "Listing", bind: { rows: { from: { of: "view", view: "recent-notes" } } } }],
    });
    expect(unreadViews([recent], [reading])).toEqual([]);
  });
});

/* ---------------------------------------------------------------- layouts --- */

describe("a block asks for room the layout has", () => {
  it("hands out one column on a stack", () => {
    expect(colsOf({ as: "stack" })).toBe(1);
    expect(colsOf({ as: "grid", cols: 3 })).toBe(3);
  });

  it("refuses a span on a stack, which has one column", () => {
    expect(why(screen({
      body: body({
        blocks: [{
          block: "Heading",
          span: { cols: 2 },
          bind: { says: { from: { of: "words", says: "Note" } } },
        }],
      }),
    }))).toContain("span_without_a_grid");
  });

  it("refuses a span wider than its grid", () => {
    expect(why(screen({
      body: body({
        layout: { as: "grid", cols: 2 },
        blocks: [{
          block: "Heading",
          span: { cols: 3 },
          bind: { says: { from: { of: "words", says: "Note" } } },
        }],
      }),
    }))).toContain("span_overflows");
  });

  /*
    ⚠️ THE CEILING IS A DESIGN DECISION RATHER THAN A LIMITATION. Past four
    columns a declaration has stopped arranging and started placing pixels, and
    the moment an author is placing pixels the block can no longer be
    responsible for its own reflow — somebody else is doing it for them.
  */
  it("refuses a grid wide enough to be a coordinate system", () => {
    expect(why(screen({ body: body({ layout: { as: "grid", cols: COLS_MOST + 1 } }) })))
      .toContain("grid_too_wide");
  });

  it("refuses a body with nothing on it", () => {
    expect(why(screen({ body: body({ blocks: [] }) }))).toContain("nothing_on_it");
  });
});

/* ----------------------------------------------------------------- blocks --- */

describe("a block is registered, complete, and offers what exists", () => {
  /*
    ⚠️ AN EMPTY INDEX REFUSES EVERY BLOCK, AND THAT IS CORRECT. A screen may not
    name what nothing registers; an index that let unknown names through would
    be worse than no index at all, because the failure would then be a blank
    region on a page in production rather than a refusal at composition.
  */
  it("refuses every block while the index is empty", () => {
    expect(refuseSurface(screen(), {}, [recent], COLLECTIONS, []).map((p) => p.why))
      .toContain("block_unknown");
  });

  it("refuses a block that has not implemented all four states", () => {
    const partial: BlockIndex = {
      ...INDEX,
      Heading: { ...HEADING, states: ["waiting", "nothing"] },
    };
    const found = refuseSurface(screen(), partial, [recent], COLLECTIONS, []).map((p) => p.why);
    expect(found.filter((w) => w === "state_missing")).toHaveLength(2);
  });

  it("refuses a block offering an operation the app does not declare", () => {
    expect(why(screen({
      body: body({
        blocks: [{
          block: "Heading",
          does: ["note.vanish"],
          bind: { says: { from: { of: "words", says: "Note" } } },
        }],
      }),
    }))).toContain("operation_unknown");
  });

  it("accepts a block offering one it does", () => {
    expect(why(screen({
      body: body({
        blocks: [{
          block: "Heading",
          does: ["note.publish"],
          bind: { says: { from: { of: "words", says: "Note" } } },
        }],
      }),
    }))).toEqual([]);
  });
});
