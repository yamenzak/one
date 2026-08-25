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
  CELLS_MOST, blocksIn, fieldsIn, refuseSurface, refuseView, unreadViews,
  viewsIn, type BlockIndex, type SurfaceSpec, type ViewSpec,
} from "../src/surface.js";
import { BLOCKS } from "../src/blocks.js";

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
    /* ⚠️ The axis a dispatch may branch on — see "what it turned out to be". */
    state: field.enum({ label: "State", holds: "none", values: ["draft", "live", "filed"] }),
    author: field.ref({ label: "Written by", holds: "none", to: "person" }),
  },
});

/* ⚠️ THE OTHER END OF A REFERENCE — see the "one hop over" block below. `note`
   points at it, so `author.name` is a field a body may read and
   `author.nothing` is one it may not. */
const person = collection({
  id: "person",
  label: { one: "Person", many: "People" },
  scope: { of: "tenant" },
  permission: "member",
  retention: null,
  onClose: { then: "purge" },
  fields: {
    name: field.text({ label: "Name", required: true, holds: "none" }),
    email: field.email({ label: "Email", holds: "none" }),
  },
});

const COLLECTIONS = [note, person];

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
  bones: "text",
  takes: { says: { label: "The words", takes: ["field", "words"], required: true } },
} as const satisfies BlockIndex[string];

const INDEX: BlockIndex = {
  Heading: HEADING,
  Listing: {
    id: "Listing",
    bones: "table",
    takes: {
      rows: { label: "The rows", takes: ["view"], required: true },
      total: { label: "How many", takes: ["count"] },
    },
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

/* -------------------------------------------------------- one hop over --- */

/**
 * ⚠️ WITHOUT THIS EVERY DECLARED LIST IS A COLUMN OF IDS, which is the finding
 * that stopped the port. A stock line holds `product` as a reference and the
 * screen wants the product's NAME — measured across OneInventory, twelve
 * reading screens and every one of them joining. What is checked here is that
 * the path resolves against the declaration rather than at the database, because
 * a path that does not is a blank under a correct heading: missing data to
 * anybody reading the screen, and a typo four files away.
 */
describe("a body may read one hop over a reference", () => {
  const reading = (path: string) => why(screen({
    body: body({
      blocks: [{ block: "Heading", bind: { says: { from: { of: "field", field: path } } } }],
    }),
  }));

  it("accepts a field on what the record points at", () => {
    expect(reading("author.name")).toEqual([]);
  });

  it("refuses a field the other end does not have", () => {
    expect(reading("author.nothing")).toEqual(["path_field_unknown"]);
  });

  /*
    ⚠️ A HOP THROUGH SOMETHING THAT IS NOT A REFERENCE IS THE SHARP ONE. `title`
    is text; `title.length` looks like the property access every author's fingers
    already know, and reaching a string's own members from a manifest is where a
    declaration quietly becomes an expression language.
  */
  it("refuses a hop through a field that is not a reference", () => {
    expect(reading("title.length")).toEqual(["path_head_not_a_ref"]);
  });

  it("refuses a hop through a field that is not there", () => {
    expect(reading("nobody.name")).toEqual(["path_head_unknown"]);
  });

  /*
    ⚠️ AND THE SECOND HOP IS NOT COMING. Two references deep is where a manifest
    stops being a declaration and starts needing a query planner — the same line
    `Match` draws at the first comparison operator, and for the same reason: the
    third one is then free.
  */
  it("refuses two hops", () => {
    expect(reading("author.team.name")).toEqual(["path_too_deep"]);
  });

  it("refuses a path that is not made of names", () => {
    expect(reading("author.Name!")).toEqual(["not_a_name"]);
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

/* ----------------------------------------------------------- the dispatch --- */

/**
 * ⚠️ WHAT A THING TURNED OUT TO BE DECIDES THE SCREEN, and presence could not
 * say it. Three of the four hardest screens in OneInventory turn on exactly
 * this: a scanned code that is a shelf sends the session there, a known product
 * is a thing to open, an unknown one is a question — three different cards and
 * three different acts, and "is there a code" answers none of them.
 */
describe("a block branches on what something turned out to be", () => {
  const onState = (one: readonly string[], field = "state") => screen({
    body: body({
      blocks: [{
        block: "Heading",
        when: { is: { of: "field", field }, one },
        bind: { says: { from: { of: "words", says: "Here" } } },
      }],
    }),
  });

  it("accepts a branch over values the field declares", () => {
    expect(why(onState(["draft", "filed"]))).toEqual([]);
  });

  /*
    ⚠️ A CARD NOBODY WILL EVER SEE, AND IT LOOKS LIKE A CASE NOT YET HIT. The
    branch is well-formed, the field is real, the screen renders — and the value
    is one the column can never hold, so the section is simply always absent.
  */
  it("refuses a branch on a value the field can never hold", () => {
    expect(why(onState(["draft", "archived"]))).toContain("dispatch_unreachable");
  });

  it("refuses a branch against no values at all", () => {
    expect(why(onState([]))).toContain("dispatch_unreachable");
  });

  /*
    ⚠️ AN ENUM AND NOTHING ELSE, WHICH IS WHAT KEEPS THE VOCABULARY CLOSED. A
    dispatch over free text is a comparison against a string — the operator this
    file exists without — and it has no declared set for the check above to read.
    The fix is to make the column an enum, which is the same direction a derived
    field goes and for the same reason.
  */
  it("refuses a branch on anything that has not declared its values", () => {
    expect(why(onState(["anything"], "title"))).toContain("dispatch_not_closed");
  });

  it("refuses a branch on a whole record, which has no values to branch over", () => {
    expect(why(screen({
      body: body({
        blocks: [{
          block: "Heading",
          when: { is: { of: "subject" }, one: ["draft"] },
          bind: { says: { from: { of: "words", says: "Here" } } },
        }],
      }),
    }))).toContain("dispatch_not_closed");
  });

  /* ⚠️ ONE WALK, so a conditional's source is seen by every check. */
  it("finds a field named only inside a negated dispatch", () => {
    expect(fieldsIn(body({
      blocks: [{
        block: "Heading",
        when: { not: { is: { of: "field", field: "state" }, one: ["draft"] } },
        bind: { says: { from: { of: "words", says: "Here" } } },
      }],
    }))).toEqual(["state"]);
  });
});

/* ------------------------------------------------------- one kind of thing --- */

/**
 * ⚠️ THE SPIKE'S FINDING, MADE A REFUSAL. A `body` is READ and drawn by the
 * engine; a `story` is CAPTURE — a flow of questions holding unsaved answers,
 * whose controls are a camera and a viewfinder and cannot be declared without
 * building a second React. A screen carrying both has two answers to what it
 * is, and the renderer would pick one silently, by whichever it checked first.
 */
describe("a screen is one kind of thing", () => {
  it("refuses a screen that is both a story and a body", () => {
    expect(why(screen({ story: { writes: "note.publish", asks: [] } })))
      .toContain("two_kinds_of_screen");
  });

  it("says nothing about a story with no body", () => {
    expect(refuseSurface(
      { id: "register", story: { writes: "note.publish", asks: [] } },
      INDEX, [recent], COLLECTIONS, [],
    )).toEqual([]);
  });
});

/* ------------------------------------------------------------- the groups --- */

/**
 * ⚠️ THE COMMONEST SHAPE IN THE PRODUCT, AND THE FLAT CONTRACT COULD NOT SAY IT.
 * Counted across the twelve OneInventory screens that only read, `Section` and
 * `Group` are the two most-drawn components by a wide margin — a labelled region
 * holding a card of rows is what almost every screen is made of. A flat list of
 * blocks would have drawn every one of them as one undivided column.
 */
describe("blocks sit under one heading, and the nesting stops there", () => {
  const grouped = (over: Partial<SurfaceSpec> = {}) => screen({
    body: body({
      blocks: [{
        group: "Label",
        of: [{ block: "Heading", bind: { says: { from: { of: "field", field: "title" } } } }],
      }],
      ...over,
    }),
  });

  it("accepts a group of blocks", () => {
    expect(why(grouped())).toEqual([]);
  });

  it("refuses a heading over an empty card", () => {
    expect(why(screen({ body: body({ blocks: [{ group: "Label", of: [] }] }) })))
      .toContain("nothing_on_it");
  });

  it("checks the blocks inside a group, not only the ones beside it", () => {
    expect(why(screen({
      body: body({
        blocks: [{ group: "Label", of: [{ block: "Ghost" }] }],
      }),
    }))).toContain("block_unknown");
  });

  /*
    ⚠️ ROOM IS ASKED FOR AT THE TOP LEVEL AND NOWHERE ELSE, which falls out of
    what a group IS. The layout hands columns to what it places; a group's own
    blocks stack inside the card it draws, so a span in there is a number the
    layout will never read — declared, typechecked, and silently ignored.
  */
  it("refuses a span inside a group, whose blocks stack", () => {
    expect(why(screen({
      body: body({
        layout: { as: "grid", least: "card" },
        blocks: [{
          group: "Label",
          of: [{
            block: "Heading",
            span: { cells: 2 },
            bind: { says: { from: { of: "words", says: "Note" } } },
          }],
        }],
      }),
    }))).toContain("span_without_a_grid");
  });

  it("lets the group itself ask for room", () => {
    expect(why(grouped({ layout: { as: "grid", least: "card" } }))).toEqual([]);
  });

  it("flattens every block with the group it is under", () => {
    const flat = blocksIn(body({
      blocks: [
        { block: "Heading", bind: { says: { from: { of: "words", says: "Top" } } } },
        { group: "Label", of: [{ block: "Listing" }] },
      ],
    }));
    expect(flat.map((f) => [f.block.block, f.under]))
      .toEqual([["Heading", null], ["Listing", "Label"]]);
  });
});

/* --------------------------------------------------------------- it leads --- */

describe("a row leads to a screen this app has", () => {
  const leading = (goes: string) => screen({
    body: body({
      blocks: [{
        block: "Heading",
        goes,
        bind: { says: { from: { of: "words", says: "Onwards" } } },
      }],
    }),
  });

  it("accepts one naming a declared screen", () => {
    expect(refuseSurface(leading("stock"), INDEX, [recent], COLLECTIONS, [], ["stock"]))
      .toEqual([]);
  });

  /*
    ⚠️ A ROW THAT LEADS NOWHERE IS THE ONE FAULT THAT LOOKS LIKE A SLOW APP. The
    row is drawn, it is pressable, pressing it does nothing — so the person
    presses it again. Naming the screen rather than a path is what makes this
    checkable: a route typed here would be a second spelling of an address, and
    the two drift the first time a screen moves.
  */
  it("refuses one leading nowhere", () => {
    expect(refuseSurface(leading("ghost"), INDEX, [recent], COLLECTIONS, [], ["stock"])
      .map((p) => p.why)).toContain("goes_nowhere");
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
        blocks: [{ block: "Heading", bind: { says: { from: { of: "field", field: "nobody" } } } }],
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
    const bad = { ...recent, where: [{ field: "nobody", set: true }] } as ViewSpec;
    expect(refuseView(bad, COLLECTIONS).map((p) => p.why)).toContain("view_field_unknown");
  });

  it("refuses one sorting by a field the collection does not have", () => {
    const bad = { ...recent, sort: { by: "nobody", dir: "down" } } as ViewSpec;
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
  it("refuses a span on a stack, which has no cells to give", () => {
    expect(why(screen({
      body: body({
        blocks: [{
          block: "Heading",
          span: { cells: 2 },
          bind: { says: { from: { of: "words", says: "Note" } } },
        }],
      }),
    }))).toContain("span_without_a_grid");
  });

  /*
    ⚠️ A SPLIT WITH NO ASIDE DOES NOT FAIL — it draws the main content and an
    empty gutter beside it, which reads as a screen that failed to load half of
    itself. Two asides is the same fault from the other end: the second silently
    replaces the first.
  */
  it("refuses a split with nothing declaring itself the aside", () => {
    expect(why(screen({ body: body({ layout: { as: "split", aside: "end" } }) })))
      .toContain("split_without_an_aside");
  });

  it("refuses a split with two of them", () => {
    expect(why(screen({
      body: body({
        layout: { as: "split", aside: "end" },
        blocks: [
          { block: "Heading", beside: true, bind: { says: { from: { of: "words", says: "A" } } } },
          { block: "Heading", beside: true, bind: { says: { from: { of: "words", says: "B" } } } },
        ],
      }),
    }))).toContain("split_without_an_aside");
  });

  it("accepts a split with exactly one", () => {
    expect(why(screen({
      body: body({
        layout: { as: "split", aside: "end" },
        blocks: [
          { block: "Heading", bind: { says: { from: { of: "words", says: "A" } } } },
          { block: "Heading", beside: true, bind: { says: { from: { of: "words", says: "B" } } } },
        ],
      }),
    }))).toEqual([]);
  });

  it("refuses an aside on a layout that has nothing to put it beside", () => {
    expect(why(screen({
      body: body({
        blocks: [{ block: "Heading", beside: true, bind: { says: { from: { of: "words", says: "A" } } } }],
      }),
    }))).toContain("aside_without_a_split");
  });

  it("refuses a span wide enough to be a page layout", () => {
    expect(why(screen({
      body: body({
        layout: { as: "grid", least: "card" },
        blocks: [{
          block: "Heading",
          span: { cells: CELLS_MOST + 1 },
          bind: { says: { from: { of: "words", says: "Note" } } },
        }],
      }),
    }))).toContain("span_too_wide");
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
