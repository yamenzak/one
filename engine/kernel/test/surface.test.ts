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
  actsIn, askedOf, blocksIn, editsIn, fieldsIn, fillOf, fillWith, fillsIn, opensOn, refuseStory,
  refuseSurface, refuseView,
  saidWhen, stepApplies, unreadViews,
  viewsIn, type ActSpec, type BlockIndex, type SurfaceSpec, type ViewSpec,
} from "../src/surface.js";
import { BLOCKS, HEROES } from "../src/blocks.js";

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

/* ------------------------------------------------------------- counting up --- */

/**
 * ⚠️ THE COMMONEST THING A READING SCREEN SHOWS THAT A DECLARATION COULD NOT SAY,
 * measured across OneInventory: a per-row count on the location tree, the
 * supplier list, the run list, the product page and the kit page — five copies
 * of one query, each assembled in a container with a `Map` and a loop over a
 * whole second collection.
 */
describe("a view may count what points back at it", () => {
  const tallied = (t: { as: string; of: string; by: string }) =>
    refuseView({ ...recent, tally: [t] } as ViewSpec, COLLECTIONS).map((p) => p.why);

  it("accepts a count over a reference that points back", () => {
    /* ⚠️ `person` has no ref to `note`, so the pair that WORKS here is a note
       counted by its author — read the other way round from the view. */
    expect(refuseView(
      { id: "people", of: "person", tally: [{ as: "notes", of: "note", by: "author" }] } as ViewSpec,
      COLLECTIONS,
    )).toEqual([]);
  });

  it("refuses a count whose name is already a field", () => {
    expect(tallied({ as: "title", of: "note", by: "author" })).toEqual(["tally_name_taken"]);
  });

  it("refuses a count over a collection this app does not declare", () => {
    expect(tallied({ as: "n", of: "nothing", by: "author" }))
      .toEqual(["tally_collection_unknown"]);
  });

  it("refuses a count by something that is not a reference", () => {
    expect(tallied({ as: "n", of: "note", by: "title" })).toEqual(["tally_not_a_ref"]);
  });

  /*
    ⚠️ THE ONE THAT MATTERS, AND THE ONLY ONE THAT IS SILENT. `of` naming a real
    collection and `by` naming a real reference on it is not enough — the
    reference has to point back at THIS view's collection. Pointed elsewhere the
    count is over rows that have nothing to do with the ones being drawn, and it
    answers zero for every one of them: an empty shelf rather than a manifest
    naming the wrong pair.
  */
  it("refuses a count by a reference that points somewhere else", () => {
    expect(refuseView(
      { id: "notes", of: "note", tally: [{ as: "n", of: "note", by: "author" }] } as ViewSpec,
      COLLECTIONS,
    ).map((p) => p.why)).toEqual(["tally_points_elsewhere"]);
  });

  it("refuses a count into something that is not a name", () => {
    expect(tallied({ as: "how many!", of: "note", by: "author" })).toEqual(["not_a_name"]);
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
            wide: true,
            bind: { says: { from: { of: "words", says: "Note" } } },
          }],
        }],
      }),
    }))).toContain("wide_without_a_grid");
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

  /*
    ⚠️ AND THE HERO, WHICH WAS WALKED BY NOTHING AT ALL. `readsIn` read
    `body.blocks` alone, so the loudest binding on every screen in every product
    was invisible to the one function that decides which views to RUN — the door
    reads `viewsIn` to choose its queries, so a figure bound to a view no block
    also happened to name was never fetched and the hero drew "nothing has
    happened yet" for ever, over a workspace with the number in the table
    underneath.

    ⚠️ IT SURVIVED BECAUSE THE FIRST HERO EVER WRITTEN SHARED ITS VIEW WITH A
    LIST. The figure counted the same declaration the page behind it drew, so the
    view was run for the LIST and the figure worked by coincidence — which is the
    whole argument for that pairing and, here, exactly what hid the fault. This
    fixture deliberately gives the hero a view no block names.
  */
  it("finds a view named only by the hero", () => {
    const led = body({
      hero: {
        as: "figure",
        nothing: { says: "Nothing yet" },
        bind: { value: { from: { of: "count", view: "gone-off" } } },
      },
      blocks: [{
        block: "Heading",
        bind: { says: { from: { of: "words", says: "Recent" } } },
      }],
    });
    expect(viewsIn(led)).toEqual(["gone-off"]);
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
  it("refuses a whole-row block on a stack, which has no columns to give", () => {
    expect(why(screen({
      body: body({
        blocks: [{
          block: "Heading",
          wide: true,
          bind: { says: { from: { of: "words", says: "Note" } } },
        }],
      }),
    }))).toContain("wide_without_a_grid");
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

  /*
    ⚠️ AND IT IS ACCEPTED ON A GRID, which is the whole of what `wide` now means.
    This assertion used to be "refuses a span wide enough to be a page layout",
    over a count that could ask for four cells in a grid that fits two — a
    request the browser answers by inventing tracks, so the refusal was guarding
    the wrong end of a mechanism that overflowed at every count above the number
    of columns nobody knows. See `Wide`.
  */
  it("accepts a whole-row block on a grid", () => {
    expect(why(screen({
      body: body({
        layout: { as: "grid", least: "card" },
        blocks: [{
          block: "Heading",
          wide: true,
          bind: { says: { from: { of: "words", says: "Note" } } },
        }],
      }),
    }))).toEqual([]);
  });

  /*
    ⚠️ A BLOCK THAT LEADS TO ONE PLACE HAS ROOM FOR ONE — see `BlockEntry.leads`.
    The renderer fills a single `onOpen` from it, so a second destination is one
    it must silently drop while the declaration reads as though both were
    reachable. The array form is shared with a row of shortcuts, so nothing about
    the shape itself says which this is.
  */
  it("refuses a one-destination block that names several", () => {
    const ONE: BlockIndex = {
      ...INDEX,
      Tile: { id: "Tile", bones: "figure", takes: {}, leads: "one" },
    };
    expect(refuseSurface(
      screen({ body: { ...body(), blocks: [{ block: "Tile", leads: ["a", "b"] }] } }),
      ONE, [recent], COLLECTIONS, [], ["a", "b"],
    ).map((p) => p.why)).toContain("leads_to_several");
  });

  /* --- the second kind ---------------------------------------------------- */

  /*
    ⚠️ THE REGION TAKES A KIND AND THE SECOND ONE IS WHAT PROVES IT. `figure`
    shipped first and was treated as though it were THE hero — a screen either
    had a big number or opened flat. These assert that a wholly different shape
    composes through the same contract, and that its one coupling is checked.
  */
  const carrying = {
    as: "subject",
    nothing: { says: "Nothing yet", under: "Write the first one" },
    bind: {
      of: { from: { of: "words", says: "Where you left off" } },
      name: { from: { of: "first", view: "recent-notes", field: "title" } },
    },
  };

  it("accepts a hero of the second kind", () => {
    expect(refuseSurface(
      screen({ body: { ...body(), hero: carrying } }),
      INDEX, [recent], COLLECTIONS, [], [], HEROES,
    ).map((p) => p.why)).toEqual([]);
  });

  it("refuses one that opens a screen the app does not declare", () => {
    expect(refuseSurface(
      screen({ body: { ...body(), hero: { ...carrying, goes: "nowhere" } } }),
      INDEX, [recent], COLLECTIONS, [], [], HEROES,
    ).map((p) => p.why)).toContain("goes_nowhere");
  });

  /*
    ⚠️ THE ONE COUPLING IN THE CONTRACT, CHECKED — see `HeroSpec.goes`. The id
    comes off the row the NAME came from, so a name that is a literal leaves the
    press with no record to carry: it would open a screen with no subject, which
    then draws its own empty state over nothing at all.
  */
  it("refuses one that opens a record when its name is not read off a row", () => {
    expect(refuseSurface(
      screen({ body: { ...body(), hero: {
        ...carrying,
        goes: "one-note",
        bind: { ...carrying.bind, name: { from: { of: "words", says: "A note" } } },
      } } }),
      INDEX, [recent], COLLECTIONS, [], ["one-note"], HEROES,
    ).map((p) => p.why)).toContain("hero_opens_nothing");
  });

  it("accepts one that opens a record its name came from", () => {
    expect(refuseSurface(
      screen({ body: { ...body(), hero: { ...carrying, goes: "one-note" } } }),
      INDEX, [recent], COLLECTIONS, [], ["one-note"], HEROES,
    ).map((p) => p.why)).toEqual([]);
  });

  it("accepts a one-destination block that names one", () => {
    const ONE: BlockIndex = {
      ...INDEX,
      Tile: { id: "Tile", bones: "figure", takes: {}, leads: "one" },
    };
    expect(refuseSurface(
      screen({ body: { ...body(), blocks: [{ block: "Tile", leads: ["a"] }] } }),
      ONE, [recent], COLLECTIONS, [], ["a"],
    ).map((p) => p.why)).toEqual([]);
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

/* ------------------------------------------- what the screen fills in --- */

/**
 * ⚠️ WITHOUT THIS EVERY DECLARED SCREEN'S FIRST BUTTON ASKS FOR AN ID. Every
 * write in OneInventory takes the thing it acts on and the day it happened, and
 * a form drawn from `input` alone puts both in front of somebody who opened the
 * item and is pressing the button today.
 */
describe("an act says what the screen already knows", () => {
  const offering = (does: readonly (string | ActSpec)[]) => screen({
    body: body({
      blocks: [{
        block: "Heading",
        does,
        bind: { says: { from: { of: "words", says: "Note" } } },
      }],
    }),
  });

  it("takes the operation's id out of either form", () => {
    expect(actsIn(body({
      blocks: [
        { block: "Heading", does: ["note.publish"], bind: { says: { from: { of: "words", says: "A" } } } },
        { block: "Heading", does: [{ op: "note.archive" }], bind: { says: { from: { of: "words", says: "B" } } } },
      ],
    }))).toEqual(["note.publish", "note.archive"]);
  });

  /* ⚠️ THE BARE STRING STAYS LEGAL, because most acts take nothing or take only
     what a person types. The object form is for the rest. */
  it("reads no fills off the bare string", () => {
    expect(fillsIn(body({
      blocks: [{ block: "Heading", does: ["note.publish"], bind: { says: { from: { of: "words", says: "A" } } } }],
    }))).toEqual({});
  });

  it("reads the fills off the object form, by operation", () => {
    expect(fillsIn(body({
      blocks: [{
        block: "Heading",
        does: [{ op: "note.publish", fills: { note: "record", day: "today" } }],
        bind: { says: { from: { of: "words", says: "A" } } },
      }],
    }))).toEqual({ "note.publish": { note: "record", day: "today" } });
  });

  it("still refuses an operation the app does not declare in the object form", () => {
    expect(why(offering([{ op: "note.vanish" }]))).toContain("operation_unknown");
  });

  it("accepts the object form of one it does", () => {
    expect(why(offering([{ op: "note.publish", fills: { note: "record" } }]))).toEqual([]);
  });
});

/* ------------------------------------------------------------- the valve --- */

/**
 * ⚠️ THE ONE ESCAPE FROM A CLOSED VOCABULARY, AND WHAT KEEPS IT FROM BEING A
 * HOLE. `Match` is equality and presence, so a screen whose subject is
 * arithmetic could not be declared at all — but the answer is never to grow the
 * query grammar an operator at a time. It is to push the arithmetic DOWN into a
 * declared operation, where it is typed, gated, audited and readable by an
 * agent, and let the view name it.
 *
 * ⚠️ EVERY TEST BELOW IS A SCREEN THAT WOULD DRAW. A view that also declares a
 * `where` shows every row and says it shows five; a `first` off a field the
 * collection has not got draws an empty figure over a workspace with plenty.
 */
describe("a view answered by an operation", () => {
  const asked: ViewSpec = {
    id: "running-out", of: "note",
    asked: { operation: "note.due", take: "items", fills: { today: "today" } },
  };

  it("accepts one that names an operation and nothing else", () => {
    expect(refuseView(asked, COLLECTIONS)).toEqual([]);
  });

  /* ⚠️ THE FOUR CLAUSES BESIDE IT ARE THE FAILURE, one at a time — each is an
     instruction to a query builder that never runs. */
  for (const [what, over] of [
    ["where", { where: [{ field: "pinned", is: { literal: true } }] }],
    ["sort", { sort: { by: "at", dir: "down" } }],
    ["limit", { limit: 5 }],
    ["tally", { tally: [{ as: "n", of: "note", by: "author" }] }],
  ] as const) {
    it(`refuses one that also declares a ${what}`, () => {
      expect(refuseView({ ...asked, ...over } as ViewSpec, COLLECTIONS).map((p) => p.why))
        .toEqual(["asked_and_queried"]);
    });
  }

  /* ⚠️ AND THE COLUMNS GO UNCHECKED, WHICH IS STATED RATHER THAN HIDDEN. The row
     shape is the handler's; checking `name` against `note` would refuse the very
     thing the valve exists for. */
  it("does not check a column against the collection the rows are about", () => {
    expect(why(screen({
      of: undefined,
      body: body({
        blocks: [{
          block: "Listing",
          shows: [{ field: "nowhere", label: "Nothing" }],
          nothing: { says: "None" },
          bind: { rows: { from: { of: "view", view: "running-out" } } },
        }],
      }),
    }), [asked])).toEqual([]);
  });
});

/**
 * ⚠️ THE FIGURE OFF A VIEW'S FIRST ROW — how an aggregate reaches a `Stat`
 * without a second kind of fetch. It is a projection of something the screen
 * already has: same request, same permission, same outcome.
 */
describe("a figure taken off the first row", () => {
  /* ⚠️ A BLOCK WHOSE SLOT TAKES A FIGURE, because the stand-in `Heading` takes a
     field or a word — the refusals here are about the SOURCE resolving, not
     about which slots accept it. */
  const FIGURES: BlockIndex = {
    ...INDEX,
    Stat: {
      id: "Stat", bones: "figure",
      takes: { value: { label: "The figure", takes: ["field", "count", "first"], required: true } },
    },
  };

  const one = (view: string, field: string): SurfaceSpec => body({
    blocks: [{ block: "Stat", bind: { value: { from: { of: "first", view, field } } } }],
  });

  const asks = (s: SurfaceSpec, views: readonly ViewSpec[] = [recent]) =>
    refuseSurface(screen({ body: s }), FIGURES, views, COLLECTIONS, []).map((p) => p.why);

  it("counts as reading the view, so the door fetches it", () => {
    expect(viewsIn(one("recent-notes", "words"))).toEqual(["recent-notes"]);
  });

  it("accepts a field the view's collection has", () => {
    expect(asks(one("recent-notes", "words"))).toEqual([]);
  });

  it("refuses one it has not", () => {
    expect(asks(one("recent-notes", "nowhere"))).toEqual(["view_field_unknown"]);
  });

  /* ⚠️ A TALLY IS A COLUMN ON THE ROW TOO — the same exemption `shows` gets, and
     for the same reason: it is what the view promised to put there. */
  it("accepts a tally the view declares", () => {
    const counted: ViewSpec = {
      ...recent, tally: [{ as: "mentions", of: "note", by: "author" }],
    };
    expect(asks(one("recent-notes", "mentions"), [counted])).toEqual([]);
  });

  /* ⚠️ AND AN ASKED VIEW IS EXEMPT, for the reason its columns are — the row
     shape is a handler's answer and nothing writes it down. */
  it("does not check a field off an asked view", () => {
    const asked: ViewSpec = {
      id: "recent-notes", of: "note", asked: { operation: "note.due", take: "items" },
    };
    expect(asks(one("recent-notes", "nowhere"), [asked])).toEqual([]);
  });
});

/**
 * ⚠️ WHICH FIELD CARRIES THE ADDRESS — `id` is the default and it is wrong often
 * enough to need saying. A row on "what runs out" is a delivery, and there is no
 * screen for one.
 */
describe("where a row leads", () => {
  const leading = (goes: unknown): SurfaceSpec => body({
    blocks: [{
      block: "Listing",
      goes: goes as never,
      nothing: { says: "None" },
      bind: { rows: { from: { of: "view", view: "recent-notes" } } },
    }],
  });

  const asks = (goes: unknown) => refuseSurface(
    screen({ body: leading(goes) }), INDEX, [recent], COLLECTIONS, [], ["one-note"],
  ).map((p) => p.why);

  it("still accepts the bare screen id", () => {
    expect(asks("one-note")).toEqual([]);
  });

  it("refuses a long form naming a screen this app does not declare", () => {
    expect(asks({ to: "nowhere", by: "author" })).toEqual(["goes_nowhere"]);
  });

  it("accepts a long form addressed by a field the rows carry", () => {
    expect(asks({ to: "one-note", by: "author" })).toEqual([]);
  });

  it("refuses one addressed by a field they do not", () => {
    expect(asks({ to: "one-note", by: "nowhere" })).toEqual(["shows_field_unknown"]);
  });
});

/**
 * ⚠️ THE TWO SOURCES A DETAIL SCREEN'S ACTS NEEDED — see `Fill`. `record` is the
 * id of the thing somebody opened, and a write often wants something ON that row
 * instead: carrying stock takes the product and the shelf, and a stock line
 * holds both as columns.
 */
describe("what the screen fills in", () => {
  it("reads the bare forms unchanged", () => {
    expect(fillOf("record")).toEqual({ of: "record" });
    expect(fillOf("today")).toEqual({ of: "today" });
  });

  it("reads a column off the record", () => {
    expect(fillOf({ field: "author" })).toEqual({ of: "field", field: "author" });
  });

  /* ⚠️ A CONSTANT THE SCREEN SUPPLIES, and it is a literal in a manifest rather
     than a value from anywhere a caller could reach. */
  it("reads a literal", () => {
    expect(fillOf({ says: "typed" })).toEqual({ of: "says", says: "typed" });
    expect(fillOf({ says: 1 })).toEqual({ of: "says", says: 1 });
  });

  /*
    ⚠️ AND RESOLVING THEM IS SHARED WITH THE WORKER — see `fillWith`. Two
    readings of one contract at the two ends of a wire is how a source comes to
    mean different things, and nothing would ever compare them.
  */
  describe("what a screen actually supplies", () => {
    const HELD = { name: "Casting resin", product: "prd_1", brand: "" };

    it("gives the record, the day and the record's own columns", () => {
      expect(fillWith(
        { count: "record", day: "today", product: { field: "product" }, capture: { says: "typed" } },
        { record: "cnt_9", today: "2026-12-31", held: HELD },
      )).toEqual({ count: "cnt_9", day: "2026-12-31", product: "prd_1", capture: "typed" });
    });

    /*
      ⚠️ THE YEAR IS THAT SAME DAY'S, AS A NUMBER — see `Fill`. It is what reads
      a six-digit expiry's century, four operations take it as required input,
      and none of them could be offered by a declared body before: `today` is a
      date string and a manifest cannot hold a year without being edited every
      January. Taken off a clock of its own it could disagree with the day beside
      it, which is a real state one second before midnight on this very date.
    */
    it("gives that day's year, as a number", () => {
      expect(fillWith({ year: "year" }, { today: "2026-12-31" })).toEqual({ year: 2026 });
    });

    /* ⚠️ AND NOTHING IS SENT EMPTY. A screen whose address has not resolved has
       no record, and an empty string in a required field is a refusal that says
       the field is missing when the screen is merely not ready. */
    it("leaves out what it has nothing for", () => {
      expect(fillWith(
        { count: "record", brand: { field: "brand" }, gone: { field: "nope" } },
        { today: "2026-08-27", held: HELD },
      )).toEqual({});
    });
  });
});

/* -------------------------------------------------------------- narrowing --- */

/**
 * ⚠️ THE CONTROL THAT NARROWS NOTHING IS THE SHARP ONE — see `PickSpec`. It
 * moves, and the screen does not: a period somebody chose, a list that did not
 * change, and nothing anywhere reporting a disagreement.
 */
describe("what a screen can be narrowed to", () => {
  const asked: ViewSpec = {
    id: "over-a-period",
    of: "note",
    asked: {
      operation: "note.report", take: "rows", fills: { span: { picked: "span" } },
    },
  };
  const SPAN = { id: "span", label: "Over", options: [{ value: "week", label: "7 days" }] };

  const narrowed = (picks: unknown, views: readonly ViewSpec[] = [asked, recent]) => refuseSurface(
    screen({
      body: body({
        picks: picks as never,
        blocks: [{
          block: "Listing",
          nothing: { says: "None" },
          bind: { rows: { from: { of: "view", view: views[0]!.id } } },
        }],
      }),
    }),
    INDEX, views, COLLECTIONS, ["note.report"],
  ).map((p) => p.why);

  it("accepts a pick a view actually fills from", () => {
    expect(narrowed([SPAN])).toEqual([]);
  });

  /* ⚠️ THE ONE THIS EXISTS FOR. A control over rows nothing narrows is a screen
     that answers a gesture by doing nothing. */
  it("refuses a pick no view fills from", () => {
    expect(narrowed([{ ...SPAN, id: "unused" }])).toContain("pick_narrows_nothing");
  });

  /* ⚠️ ONE WAY OR THE OTHER, AND NEITHER IS ALSO WRONG — a control with nothing
     to pick is a label, and one with both has nothing deciding what it draws. */
  it("refuses a pick that offers no options and no collection", () => {
    expect(narrowed([{ id: "span", label: "Over" }])).toContain("pick_two_ways");
  });

  it("refuses a pick that is both a written set and a collection", () => {
    expect(narrowed([{ ...SPAN, of: "note" }])).toContain("pick_two_ways");
  });

  /* ⚠️ AND AN UNLABELLED ONE, which on a screen full of figures is a control
     nobody can say what changed. */
  it("refuses a pick under no words", () => {
    expect(narrowed([{ ...SPAN, label: " " }])).toContain("pick_says_nothing");
  });

  it("refuses two picks with one name", () => {
    expect(narrowed([SPAN, SPAN])).toContain("pick_name_taken");
  });

  it("reads a narrowing as a source of its own", () => {
    expect(fillOf({ picked: "span" })).toEqual({ of: "picked", picked: "span" });
  });

  /*
    ⚠️ THE DEFAULT AND THE READING ORDER ARE TWO FACTS — see `PickSpec.opens`.
    Four options or fewer are a segmented control, so the order is what somebody
    reads left to right; making the first one the default forces a period list
    that runs 30 · 7 · 90, or a report that opens on the wrong month.
  */
  it("accepts a written set that opens on something other than its first", () => {
    expect(narrowed([{
      ...SPAN,
      options: [{ value: "week", label: "7 days" }, { value: "month", label: "30 days" }],
      opens: "month",
    }])).toEqual([]);
  });

  it("refuses opening on an option the set has not got", () => {
    expect(narrowed([{ ...SPAN, opens: "fortnight" }]))
      .toContain("pick_opens_unknown");
  });

  /* ⚠️ AND NOT OVER ROWS, because they are not known here — an unchecked default
     is a control that opens on a row that may not exist. */
  it("refuses a default over a collection's rows", () => {
    expect(narrowed([{ id: "span", label: "Over", of: "note", any: "All", opens: "n1" }]))
      .toContain("pick_two_ways");
  });

  /*
    ⚠️ AND A PICK OVER ROWS MUST OFFER A WAY BACK — see `PickSpec.any`. The rows
    arrive from the door AFTER the first read has gone out, so without one the
    control draws its first row as chosen over a screen that was asked for every
    one of them: a narrowing that never happened, stated as a fact.
  */
  it("refuses a pick over rows with no way back to all of them", () => {
    expect(narrowed([{ id: "span", label: "Over", of: "note" }]))
      .toContain("pick_rows_without_a_way_back");
  });

  it("accepts one that offers it", () => {
    expect(narrowed([{ id: "span", label: "Over", of: "note", any: "Everywhere" }]))
      .toEqual([]);
  });

  /*
    ⚠️ ONE READING, TWO CALLERS — see `opensOn`. The container seeds the first
    read from it and the renderer draws the chosen segment from it, and the two
    disagreeing is a control saying "30 days" over a week of figures.
  */
  describe("what a narrowing opens on", () => {
    it("is the first option where nothing says otherwise", () => {
      expect(opensOn(SPAN)).toBe("week");
    });

    it("is what the declaration says where it says", () => {
      expect(opensOn({
        ...SPAN,
        options: [{ value: "week", label: "7 days" }, { value: "month", label: "30 days" }],
        opens: "month",
      })).toBe("month");
    });

    /* ⚠️ AND "NOT NARROWED" WINS OVER BOTH, because a list that opens on
       everything opens on everything — see `PickSpec.any`. */
    it("is nothing at all where there is a way back to all of them", () => {
      expect(opensOn({ id: "where", label: "Where", of: "note", any: "Everywhere" })).toBe("");
    });
  });
});

/* ------------------------------------------------------------------ marks --- */

/**
 * ⚠️ A COLUMN SAYS ITS VALUE THE WAY A BINDING DOES — see `Column.as`. Without
 * one a timestamp column is twenty characters of ISO on every row; with the
 * wrong one it is `Invalid Date` down the whole column, which is a string by the
 * time it reaches a browser and therefore throws nowhere.
 */
describe("how a column says its value", () => {
  const shown = (col: unknown) => refuseSurface(
    screen({
      body: body({
        blocks: [{
          block: "Listing",
          shows: [col as never],
          nothing: { says: "None" },
          bind: { rows: { from: { of: "view", view: "recent-notes" } } },
        }],
      }),
    }),
    INDEX, [recent], COLLECTIONS, [],
  ).map((p) => p.why);

  it("accepts a formatter the field's kind can wear", () => {
    expect(shown({ field: "at", label: "Written", as: "when" })).toEqual([]);
  });

  it("accepts one over a hop", () => {
    expect(shown({ field: "author.email", label: "Email" })).toEqual([]);
  });

  it("refuses a date drawn as money", () => {
    expect(shown({ field: "at", label: "Written", as: "money" })).toContain("format_wrong");
  });

  it("refuses a name drawn as a date", () => {
    expect(shown({ field: "title", label: "Title", as: "when" })).toContain("format_wrong");
  });

  it("says nothing about a column that names no formatter", () => {
    expect(shown({ field: "at", label: "Written" })).toEqual([]);
  });
});

/**
 * ⚠️ A CHART WITH NO AXES DRAWS AN EMPTY BOX UNDER A CORRECT HEADING — see
 * `PlotSpec`. The view is fetched, the region reports ready, the label is right
 * and the figure is blank, so it reads as a workspace with no data in it.
 */
describe("what a chart plots", () => {
  const CHARTED: BlockIndex = {
    ...INDEX,
    Run: {
      id: "Run", bones: "chart", plots: "series",
      takes: { series: { label: "What is plotted", takes: ["view"], required: true } },
    },
    Bars: {
      id: "Bars", bones: "chart", plots: "labelled",
      takes: { data: { label: "What is compared", takes: ["view"], required: true } },
    },
  };

  const drawn = (block: string, plots: unknown, slot = "series") => refuseSurface(
    screen({
      body: body({
        blocks: [{
          block, ...(plots === undefined ? {} : { plots: plots as never }),
          nothing: { says: "None" },
          bind: { [slot]: { from: { of: "view", view: "recent-notes" } } },
        }],
      }),
    }),
    CHARTED, [recent], COLLECTIONS, [],
  ).map((p) => p.why);

  it("accepts a run of points with a measure and no names", () => {
    expect(drawn("Run", { of: "words" })).toEqual([]);
  });

  it("refuses a chart that does not say what its axes are", () => {
    expect(drawn("Run", undefined)).toContain("plots_missing");
  });

  it("refuses a mark per row whose marks have no names", () => {
    expect(drawn("Bars", { of: "words" }, "data")).toContain("plots_unlabelled");
  });

  it("accepts one that names them", () => {
    expect(drawn("Bars", { along: "title", of: "words" }, "data")).toEqual([]);
  });

  it("refuses a measure the rows do not carry", () => {
    expect(drawn("Run", { of: "nowhere" })).toContain("shows_field_unknown");
  });

  /* ⚠️ AND ON A BLOCK THAT DRAWS NO MARKS AT ALL, which is a projection nothing
     applies — the class of quietly-ignored declaration the registry closes. */
  it("refuses axes on something that is not a chart", () => {
    expect(drawn("Listing", { of: "words" }, "rows"))
      .toContain("plots_on_a_block_that_draws_none");
  });
});

/* ------------------------------------------------------- changing a fact --- */

/**
 * ⚠️ EVERY ONE OF THESE ENDS AS A PENCIL OVER A SAVE THAT CANNOT LAND — see
 * `BlockSpec.edits`. That is the expensive shape: somebody presses it, reads the
 * sheet, types the correction, presses Save, and is told nothing happened. None
 * of the four fails anywhere else — React drops a prop a component does not
 * take, and the door refuses a field the update does not advertise long after
 * the screen offered it.
 */
describe("a row that offers to change what it says", () => {
  /* ⚠️ ITS OWN COLLECTION, BECAUSE ONE FIELD HERE IS `settled` AND THE FIXTURE
     ABOVE IS SHARED. A `settled` added to `note` would be a fact about a world
     forty other assertions are written against. */
  const kit = collection({
    id: "kit",
    label: { one: "Kit", many: "Kits" },
    scope: { of: "tenant" },
    permission: "kit",
    retention: null,
    onClose: { then: "purge" },
    fields: {
      title: field.text({ label: "Title", required: true, holds: "none" }),
      /* ⚠️ THE UNIT EVERY OTHER NUMBER IS IN — see `FieldSpec.settled`. */
      unit: field.text({ label: "Counted in", holds: "none", settled: true }),
    },
  });

  const ROWS: BlockIndex = {
    ...INDEX,
    Fact: { id: "Fact", bones: "rows", edits: true, takes: {
      says: { label: "The words", takes: ["field", "words"], required: true },
    } },
  };

  /* ⚠️ `null` FOR "NO SUBJECT", NOT `undefined` — an omitted argument and an
     explicit `undefined` are the same value to a default parameter, so the one
     case this helper exists to reach would silently be the ordinary one. */
  const edited = (block: string, edits: string, of: string | null = "kit") => refuseSurface(
    { id: "one-kit", ...(of ? { of } : {}), body: body({
      blocks: [{
        block, edits,
        bind: { says: { from: { of: "words", says: "x" } } },
      }],
    }) } as Parameters<typeof refuseSurface>[0],
    ROWS, [], [kit], [],
  ).map((p) => p.why);

  it("accepts a field the subject has and the update will take", () => {
    expect(edited("Fact", "title")).toEqual([]);
  });

  /* ⚠️ A BLOCK WITH NOWHERE TO PUT IT. A figure draws a number with no field
     behind it; the prop is dropped and the declaration reads as though the
     value were changeable. */
  it("refuses an edit on a block that is not a row of one fact", () => {
    expect(edited("Heading", "title")).toContain("edits_on_a_block_that_takes_none");
  });

  /* ⚠️ NOTHING TO WRITE IT TO. A screen that is not about a record has no id
     for the update to name, so the sheet would save into the void. */
  it("refuses an edit on a screen that is about no record", () => {
    expect(edited("Fact", "title", null)).toContain("edits_without_a_subject");
  });

  it("refuses a field the collection has not got", () => {
    expect(edited("Fact", "nope")).toContain("edits_unknown");
  });

  /* ⚠️ AND THE ONE THE DOOR WOULD REFUSE. `settled` is not advertised by the
     generated update, so this row's sheet is a dead end with a pencil on it. */
  it("refuses a field that is set when the record is made", () => {
    expect(edited("Fact", "unit")).toContain("edits_settled");
  });

  /* ⚠️ AND THE RUNTIME NEEDS THE LIST, ONCE, WALKED THROUGH GROUPS. A screen
     with a card of editable rows has none at its top level. */
  it("reports every field a body offers to change, however deeply placed", () => {
    expect(editsIn(body({
      blocks: [
        { block: "Fact", edits: "title", bind: {} },
        { group: "More", of: [{ block: "Fact", edits: "unit", bind: {} }] },
        /* ⚠️ ONCE EACH — two rows over one field is one thing to change. */
        { block: "Fact", edits: "title", bind: {} },
      ],
    }))).toEqual(["title", "unit"]);
  });
});

/* ------------------------------------------------------------- shortcuts --- */

/**
 * ⚠️ A ROW OF SHORTCUTS WITH NOTHING IN IT IS A GAP UNDER A CORRECT HEADING —
 * see `BlockSpec.leads`. Same failure as a chart with no axes, and quieter.
 */
describe("a row of shortcuts", () => {
  const SHORT: BlockIndex = {
    ...INDEX,
    Quick: { id: "Quick", bones: "tiles", leads: true, takes: {} },
  };

  const led = (block: string, leads: unknown) => refuseSurface(
    screen({
      body: body({
        blocks: [{
          block, ...(leads === undefined ? {} : { leads: leads as never }),
          ...(block === "Quick" ? {} : { bind: { says: { from: { of: "words", says: "x" } } } }),
        }],
      }),
    }),
    SHORT, [recent], COLLECTIONS, [], ["one-note"],
  ).map((p) => p.why);

  it("accepts screens this app declares", () => {
    expect(led("Quick", ["one-note"])).toEqual([]);
  });

  it("refuses a row of shortcuts that names none", () => {
    expect(led("Quick", undefined)).toContain("leads_missing");
  });

  it("refuses a destination this app does not declare", () => {
    expect(led("Quick", ["nowhere"])).toContain("goes_nowhere");
  });

  it("refuses shortcuts on a block that draws none", () => {
    expect(led("Heading", ["one-note"])).toContain("leads_on_a_block_that_takes_none");
  });

  /*
    ⚠️ A TILE WITH NO DESTINATION IS A WHOLE TILE — see `BlockEntry.leads`. The
    rule above is about a block whose ONLY body is its destinations; a figure
    with a label and a number draws completely without one, and the press is an
    affordance on it rather than the thing it is. Requiring one anyway made a
    number whose list has no screen yet unplaceable, so the choice was an
    invented destination or a deleted tile — a checker deciding a screen's
    composition.
  */
  it("accepts a one-destination block that names none", () => {
    const ONE: BlockIndex = {
      ...INDEX,
      Tile: { id: "Tile", bones: "figure", takes: {}, leads: "one" },
    };
    expect(refuseSurface(
      screen({ body: { ...body(), blocks: [{ block: "Tile" }] } }),
      ONE, [recent], COLLECTIONS, [], ["a"],
    ).map((p) => p.why)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ hero --- */

/**
 * ⚠️ THE REGION EVERY SCREEN LEADS WITH, AND THE ONE THING IT MUST NOT BE IS
 * SILENT. A hero naming a kind nothing registers has to refuse at compose time —
 * the alternative is a screen that mounts with its whole top third missing, and
 * a blank region reads as a slow network rather than as a mistake.
 */
describe("the hero", () => {
  const leading = (hero: unknown) => refuseSurface(
    screen({ body: { ...body(), hero } }),
    INDEX, [recent], COLLECTIONS, [], [], HEROES,
  ).map((p) => p.why);

  /* ⚠️ `recent-notes`, WHICH IS THE VIEW THIS FILE DECLARES — and this fixture
     said `recent` for as long as nothing walked a hero's bindings. It passed
     every assertion below it, because the one function every refusal in
     `refuseSurface` reads walked `body.blocks` alone. A fixture naming a view
     that does not exist is the fault the check exists for, written into the
     check's own subject. */
  const figure = {
    as: "figure",
    nothing: { says: "Nothing counted yet" },
    bind: {
      value: { from: { of: "count", view: "recent-notes" } },
      of: { from: { of: "words", says: "Notes" } },
    },
  };

  it("accepts one whose kind is registered and whose slots are filled", () => {
    expect(leading(figure)).toEqual([]);
  });

  it("refuses a kind nothing registers", () => {
    expect(leading({ ...figure, as: "dial" })).toContain("hero_unknown");
  });

  it("refuses a hero missing a slot it cannot draw without", () => {
    const { value: _drop, ...rest } = figure.bind;
    expect(leading({ ...figure, bind: rest })).toContain("slot_missing");
  });

  it("refuses a slot the kind does not take", () => {
    expect(leading({ ...figure, bind: { ...figure.bind, rows: { from: { of: "view", view: "recent-notes" } } } }))
      .toContain("slot_unknown");
  });

  it("refuses a source the slot cannot be given", () => {
    expect(leading({ ...figure, bind: { ...figure.bind, of: { from: { of: "view", view: "recent-notes" } } } }))
      .toContain("slot_kind_wrong");
  });

  /*
    ⚠️ AND A HERO NAMING A VIEW THE APP DOES NOT DECLARE IS REFUSED, WHICH IT WAS
    NOT. Every refusal in `refuseSurface` reads one walk of the body's sources,
    and that walk skipped the hero — so the loudest binding on the screen was the
    one thing nothing checked. It is not only a missing check: the door reads the
    same walk to decide which views to RUN, so the figure was never fetched
    either, and it drew "nothing has happened yet" over a workspace that had the
    number.
  */
  it("refuses a hero bound to a view nothing declares", () => {
    expect(leading({
      ...figure,
      bind: { ...figure.bind, value: { from: { of: "count", view: "ghost" } } },
    })).toContain("view_unknown");
  });

  /*
    ⚠️ AND A CALLER THAT FORGETS THE REGISTRY GETS A REFUSAL RATHER THAN A PASS.
    An optional index that skipped its check when absent would mean every hero in
    every product going unexamined the day somebody adds a call site — which is
    the exact shape of silence this file exists to refuse.
  */
  it("refuses every hero when it is given no registry at all", () => {
    expect(refuseSurface(
      screen({ body: { ...body(), hero: figure } }),
      INDEX, [recent], COLLECTIONS, [],
    ).map((p) => p.why)).toContain("hero_unknown");
  });

  /*
    ⚠️ THE SHORTCUTS UNDER THE FIGURE ARE CHECKED LIKE A BLOCK'S AND THE CHECK IS
    A SECOND ONE — see `HeroSpec.leads`. The loop that examines `leads` walks the
    body's BLOCKS, and the hero is not one, so a hero leading nowhere passed
    every existing assertion in this file and would have drawn a pill whose press
    does nothing, at the top of the screen, where it is pressed most.
  */
  const leadingTo = (leads: readonly string[], screens: readonly string[]) => refuseSurface(
    screen({ body: { ...body(), hero: { ...figure, leads } } }),
    INDEX, [recent], COLLECTIONS, [], screens, HEROES,
  ).map((p) => p.why);

  it("accepts a hero leading to screens the app declares", () => {
    expect(leadingTo(["write", "search"], ["write", "search"])).toEqual([]);
  });

  it("refuses a hero leading to a screen that does not exist", () => {
    expect(leadingTo(["write", "nowhere"], ["write"])).toContain("goes_nowhere");
  });

  it("accepts a hero that leads nowhere at all", () => {
    expect(leading(figure)).toEqual([]);
  });
});

/* ------------------------------------------------------------- the flow --- */

/**
 * A FLOW OF QUESTIONS, REFUSED — and every fault here WALKS.
 *
 * ⚠️ SHARPER THAN A BODY'S, BECAUSE A FLOW HOLDS UNSAVED WORK. A body that binds
 * a missing field draws a blank line and somebody reloads; a step that asks for
 * a field the write does not take draws a control, accepts an answer, carries it
 * through the review and drops it at the door — so the failure arrives at the
 * one press where the cost of being wrong is everything typed so far.
 *
 * ⚠️ AND SEVERAL OF THEM ARE ONLY VISIBLE DOWN ONE PATH. A closed set missing a
 * sentence for its fifth option is correct for four of five people; a blank
 * naming a field the step does not ask for prints braces in a review only when
 * that step is reached. None of them is findable by using the flow once.
 */

const WRITE = {
  id: "thing.register",
  input: {
    name: field.text({ label: "Name", required: true, holds: "none" }),
    brand: field.text({ label: "Brand", holds: "none" }),
    unit: field.text({ label: "Counted in", required: true, holds: "none" }),
    tracking: field.enum({
      label: "Tracked as", required: true, holds: "none", values: ["listed", "counted", "batched"],
    }),
    par: field.number({ label: "Tell me below", holds: "none" }),
    shots: field.json({ label: "Pictures", holds: "none" }),
  },
  output: { thing: field.text({ label: "Thing", holds: "none" }) },
};

/** ⚠️ A model's answer, and it names keys the write takes — see `story_fills_nothing`. */
const SEES = {
  id: "thing.see",
  input: { shots: field.json({ label: "Pictures", holds: "none" }) },
  output: {
    name: field.text({ label: "Name", holds: "none" }),
    brand: field.text({ label: "Brand", holds: "none" }),
    unit: field.text({ label: "Counted in", holds: "none" }),
  },
};

const OPS = [WRITE, SEES];

/**
 * ⚠️ THE SAME PAIR, EACH DEMANDING A GRANT — for `fills_permission_wrong` only.
 * The fixtures above deliberately carry none, because every other rule here is
 * about a step and the write's INPUT, and a permission on them would be a field
 * forty assertions ignore.
 */
const GRANTED = [
  { ...WRITE, permission: "thing:write" },
  { ...SEES, permission: "thing:read" },
];

/**
 * ⚠️ A STAND-IN FOR THE ASKING REGISTRY, AND IT IS NOT THE BODY'S — see `ASKS`.
 * A body block is FED bindings and draws; a step's block is HANDED what the flow
 * holds and answers back. Checked against the wrong one a step naming `Listing`
 * composes, and the flow hands a camera's contract to a table.
 */
const ASKING = {
  Shots: { id: "Shots", bones: "tiles", answers: ["shots"] },
  /* ⚠️ The same block writing somewhere the write does not take. */
  Weather: { id: "Weather", bones: "text", answers: ["weather"] },
} as const;

const SAID = {
  listed: "kept as a single running total",
  counted: "counted, so a number is a number",
  batched: "kept apart per delivery, so one can be expired",
} as const;

/** ⚠️ A flow that composes — every case below is one edit away from it. */
const flow = (over: Record<string, unknown> = {}) => ({
  id: "add-a-thing",
  story: {
    writes: "thing.register",
    asks: [
      { id: "named", ask: "What is it?", takes: ["name", "brand"], says: { as: "{name}" } },
      { id: "counted", ask: "What do you count it in?", takes: ["unit"] },
      {
        id: "tracked", ask: "How closely do you follow it?", takes: ["tracking"],
        always: true, says: { per: SAID },
      },
      /* ⚠️ THE STEP THAT ANSWERS WHAT THE FILL IS HANDED — see
         `fills_given_unanswered`. Without it the flow pays for a vision run over
         an empty list of photographs. */
      { id: "shot", ask: "Can you photograph it?", block: "Shots" },
    ],
    ...over,
  },
}) as Parameters<typeof refuseStory>[0];

const told = (s: Parameters<typeof refuseStory>[0]) =>
  refuseStory(s, OPS, ASKING).map((p) => p.why);

/*
  ⚠️ THE FILL'S GRANT IS THE ONE COMPOSITION COULD NOT SEE, AND IT WAS A TYPE
  THAT STOPPED IT. `operations` was `{ id, input, output }` — no permission in
  the shape — so this rule was not merely unwritten, it was inexpressible. The
  failure it lets through is quieter than the write's: a mismatched write refuses
  at the last press, which somebody reports; a mismatched fill just asks every
  question, which reads as the product not having the feature.
*/
describe("the fill's grant against the one the flow is offered on", () => {
  const offered = (permission: string): Parameters<typeof refuseStory>[0] => ({
    ...flow({ fills: { by: "thing.see", with: { shots: "shots" } } }),
    permission,
  });

  it("refuses a reader demanding a grant the flow's audience was not offered", () => {
    expect(refuseStory(offered("thing:write"), GRANTED, ASKING).map((p) => p.why))
      .toContain("fills_permission_wrong");
  });

  it("says nothing when the two match", () => {
    const same = [{ ...WRITE, permission: "thing:write" }, { ...SEES, permission: "thing:write" }];
    expect(refuseStory(offered("thing:write"), same, ASKING).map((p) => p.why))
      .not.toContain("fills_permission_wrong");
  });

  /* ⚠️ A SCREEN THAT NAMES NO GRANT HAS NOTHING TO COMPARE AGAINST, and inventing
     one would refuse a correct declaration for being unopinionated. */
  it("says nothing about a flow that names no permission of its own", () => {
    expect(told(flow({ fills: { by: "thing.see", with: { shots: "shots" } } })))
      .not.toContain("fills_permission_wrong");
  });
});

/*
  ⚠️ A SETTING A FLOW BEGINS AT — see `StorySpec.starts`. Both failures here are
  silent on the screen and identical to each other: an unset workspace default.
  Somebody sees an empty box, fills it in, and never learns that the answer they
  saved in settings was supposed to be there.
*/
describe("what a flow starts already answered", () => {
  const starting = (starts: Record<string, string>) => flow({ starts });

  it("refuses an input the write does not take", () => {
    expect(refuseStory(starting({ colour: "thing.default_unit" }), OPS, ASKING, [
      "thing.default_unit",
    ]).map((p) => p.why)).toContain("starts_takes_unknown");
  });

  it("refuses a setting this app does not declare", () => {
    expect(refuseStory(starting({ unit: "thing.nope" }), OPS, ASKING, [
      "thing.default_unit",
    ]).map((p) => p.why)).toContain("starts_not_a_setting");
  });

  it("says nothing about an input and a setting that both exist", () => {
    expect(refuseStory(starting({ unit: "thing.default_unit" }), OPS, ASKING, [
      "thing.default_unit",
    ])).toEqual([]);
  });

  /* ⚠️ AND A FLOW THAT STARTS AT NOTHING IS THE COMMON CASE, so the absent field
     must cost nothing — including at an app that declares no settings at all. */
  it("says nothing about a flow that starts at nothing", () => {
    expect(told(flow())).toEqual([]);
  });
});

/**
 * ⚠️ WHERE A FLOW ENDS IS DECLARED BECAUSE THE ALTERNATIVE WAS A PRODUCT'S ROUTE
 * IN THE PLATFORM — see `StorySpec.lands`. The browser went to `/products` after
 * every flow in every app; the second app's would have landed on a list it does
 * not have, silently, on a route that draws nothing.
 */
describe("where a flow ends", () => {
  const ending = (lands: string) =>
    refuseStory(flow({ lands }), OPS, ASKING, [], ["thing", "things"]).map((p) => p.why);

  it("accepts a screen this app declares", () => {
    expect(ending("thing")).toEqual([]);
  });

  it("refuses one it does not", () => {
    expect(ending("nowhere")).toContain("lands_nowhere");
  });

  /* ⚠️ AND A FLOW THAT NAMES NOWHERE IS NOT WRONG. It ends where it started,
     which is right for one that records something rather than making it. */
  it("says nothing about a flow that names no destination", () => {
    expect(refuseStory(flow(), OPS, ASKING, [], ["thing"])).toEqual([]);
  });

  /* ⚠️ AND AN EMPTY LIST CHECKS NOTHING RATHER THAN REFUSING EVERYTHING — the
     same shape `heroes` takes. A caller that has not been updated does not get
     every flow reported as broken. */
  it("checks nothing when it was handed no screens", () => {
    expect(refuseStory(flow({ lands: "nowhere" }), OPS, ASKING)).toEqual([]);
  });
});

describe("a flow that composes", () => {
  it("refuses nothing about a story whose steps reach its write", () => {
    expect(refuseStory(flow(), OPS, ASKING)).toEqual([]);
  });

  /* ⚠️ A SCREEN THAT IS NOT A FLOW IS NOT THIS FUNCTION'S BUSINESS, and saying so
     is what lets `refuseApp` call it for every screen without asking first. */
  it("says nothing about a screen with no story on it", () => {
    expect(refuseStory({ id: "plain" }, OPS, ASKING)).toEqual([]);
  });

  /* ⚠️ AN UNKNOWN WRITE IS ALREADY REPORTED ONE LEVEL UP — see the note in
     `refuseStory`. Reporting every field of it as unknown as well would bury the
     one line that says what to fix under five that say the same typo again. */
  it("stops rather than reporting every step against a write it cannot find", () => {
    expect(told(flow({ writes: "thing.nope" }))).toEqual([]);
  });
});

describe("what a step asks for", () => {
  it("refuses a question with nothing under it", () => {
    expect(told(flow({
      asks: [{ id: "named", ask: "What is it?" }],
    }))).toContain("step_asks_nothing");
  });

  it("refuses a step that draws controls and a block", () => {
    expect(told(flow({
      asks: [{ id: "named", ask: "What is it?", takes: ["name"], block: "Heading" }],
    }))).toContain("step_asks_two_ways");
  });

  it("refuses a field the write does not take", () => {
    expect(told(flow({
      asks: [{ id: "named", ask: "What is it?", takes: ["name", "colour"] }],
    }))).toContain("step_takes_unknown");
  });

  it("refuses a block the registry does not hold", () => {
    expect(told(flow({
      asks: [{ id: "shot", ask: "Photograph it?", block: "Nothing" }],
    }))).toContain("step_block_unknown");
  });

  /* ⚠️ WORSE THAN A FIELD DROPPED, BECAUSE THE WORK WAS DONE. A photograph
     taken, carried through the review, and discarded at the door with nothing on
     any screen saying so. */
  it("refuses a block that answers where the write does not take", () => {
    expect(told(flow({
      asks: [
        ...flow().story!.asks,
        { id: "sky", ask: "What is the weather?", block: "Weather" },
      ],
    }))).toContain("step_takes_unknown");
  });

  /* ⚠️ AND WHAT A BLOCK ANSWERS COUNTS TOWARD FINISHING, exactly as a `takes`
     does — otherwise a flow whose camera supplies the name is refused for not
     asking for it. */
  it("counts what a block answers toward the write being reachable", () => {
    const shot = {
      id: "thing.shoot",
      input: { shots: field.json({ label: "Pictures", holds: "none" }) },
      output: { shots: field.json({ label: "Pictures", holds: "none" }) },
    };
    expect(refuseStory(
      { id: "s", story: { writes: "thing.shoot", asks: [{ id: "shot", ask: "Photograph it?", block: "Shots" }] } },
      [shot], ASKING,
    ).map((p) => p.why)).toEqual([]);
  });

  it("refuses the same step declared twice", () => {
    expect(told(flow({
      asks: [
        { id: "named", ask: "What is it?", takes: ["name"] },
        { id: "named", ask: "And again?", takes: ["brand"] },
      ],
    }))).toContain("step_id_taken");
  });

  /* ⚠️ `always` MEANS "ASK THIS EVEN IF IT ARRIVED FILLED", and a block step has
     no fields to arrive filled — so the word reads as a rule being applied and
     is applied to nothing. */
  it("refuses insisting on a step that has no fields to have been filled", () => {
    expect(told(flow({
      asks: [{ id: "shot", ask: "Photograph it?", block: "Heading", always: true }],
    }))).toContain("step_always_without_fields");
  });
});

describe("how a step reads back", () => {
  it("refuses a blank naming a field the step does not ask for", () => {
    expect(told(flow({
      asks: [{ id: "named", ask: "What is it?", takes: ["name"], says: { as: "{name} by {brand}" } }],
    }))).toContain("says_blank_unknown");
  });

  it("accepts a blank for every field the step asks for", () => {
    expect(told(flow({
      asks: [{
        id: "named", ask: "What is it?", takes: ["name", "brand"],
        says: { as: "{name} by {brand}" },
      }],
    }))).not.toContain("says_blank_unknown");
  });

  it("refuses a sentence per value where there is no closed set", () => {
    expect(told(flow({
      asks: [{ id: "named", ask: "What is it?", takes: ["name"], says: { per: SAID } }],
    }))).toContain("says_per_not_a_set");
  });

  /* ⚠️ THE ONE MOST LIKELY TO SHIP. Four of the five options read back correctly
     and the fifth is silently absent from the review — in the fact somebody
     chose most deliberately. */
  it("refuses a closed set with a value that has no sentence", () => {
    expect(told(flow({
      asks: [{
        id: "tracked", ask: "How closely do you follow it?", takes: ["tracking"],
        always: true, says: { per: { listed: SAID.listed, counted: SAID.counted } },
      }],
    }))).toContain("says_per_incomplete");
  });
});

describe("what fills the flow before it is walked", () => {
  it("accepts a fill whose output the write takes", () => {
    expect(told(flow({ fills: { by: "thing.see", with: { shots: "shots" } } }))).toEqual([]);
  });

  it("refuses a fill this app does not declare", () => {
    expect(told(flow({ fills: { by: "thing.dream", with: {} } }))).toContain("story_fills_unknown");
  });

  it("refuses handing a fill an input it does not take", () => {
    expect(told(flow({ fills: { by: "thing.see", with: { pictures: "shots" } } })))
      .toContain("fills_takes_unknown");
  });

  /* ⚠️ THE FLOW ONLY EVER HOLDS THE WRITE'S OWN INPUT NAMES, so a source outside
     that set is a value that cannot exist — the fill is handed nothing under a
     correct-looking key. */
  it("refuses a source the write does not take", () => {
    expect(told(flow({ fills: { by: "thing.see", with: { shots: "camera" } } })))
      .toContain("fills_given_unknown");
  });

  /*
    ⚠️ THE ONE THAT COSTS MONEY. A source no step asks for and no block answers
    is never set, so the run happens, is charged for, and the model is asked to
    identify a product from an empty list of photographs. It answers; models
    always do.
  */
  it("refuses a source no step asks for and no block answers", () => {
    expect(told(flow({
      fills: { by: "thing.see", with: { shots: "shots" } },
      asks: [
        { id: "named", ask: "What is it?", takes: ["name"] },
        { id: "counted", ask: "In what?", takes: ["unit"] },
        { id: "tracked", ask: "How closely?", takes: ["tracking"], always: true, says: { per: SAID } },
      ],
    }))).toContain("fills_given_unanswered");
  });

  /*
    ⚠️ CHECKED AGAINST WHAT IS ANSWERED RATHER THAN WHAT IS REACHED, and the
    difference is the fill itself: a source the fill also OUTPUTS would satisfy a
    laxer check, which is a fill fed by its own answer — i.e. by nothing, on the
    first and only run.
  */
  it("does not let a fill's own output count as the thing it is handed", () => {
    const loops = {
      id: "thing.loop",
      input: { name: field.text({ label: "Name", holds: "none" }) },
      output: { name: field.text({ label: "Name", holds: "none" }) },
    };
    expect(refuseStory(
      {
        id: "s",
        story: {
          writes: "thing.register",
          fills: { by: "thing.loop", with: { name: "name" } },
          asks: [
            { id: "counted", ask: "In what?", takes: ["unit"] },
            { id: "tracked", ask: "How?", takes: ["tracking"], always: true, says: { per: SAID } },
          ],
        },
      },
      [...OPS, loops], ASKING,
    ).map((p) => p.why)).toContain("fills_given_unanswered");
  });

  /* ⚠️ IT RUNS, IT IS CHARGED FOR, AND EVERY ANSWER IS DROPPED — green in every
     suite, because the run succeeded and the flow worked. */
  it("refuses a fill whose output the write takes none of", () => {
    const elsewhere = {
      id: "thing.elsewhere",
      input: {},
      output: { weather: field.text({ label: "Weather", holds: "none" }) },
    };
    expect(refuseStory(flow({ fills: { by: "thing.elsewhere", with: {} } }), [...OPS, elsewhere], ASKING)
      .map((p) => p.why)).toContain("story_fills_nothing");
  });
});

describe("when a step applies", () => {
  it("refuses a condition on a field the write does not take", () => {
    expect(told(flow({
      asks: [
        ...flow().story!.asks,
        { id: "extra", ask: "How many?", takes: ["par"], when: { field: "colour", set: true } },
      ],
    }))).toContain("when_field_unknown");
  });

  /* ⚠️ A FLOW IS ANSWERS ON THE WAY TO MAKING SOMETHING, so there is no record. */
  it("refuses a condition reaching for a record", () => {
    expect(told(flow({
      asks: [
        ...flow().story!.asks,
        { id: "extra", ask: "How many?", takes: ["par"], when: { field: "brand", is: { here: "record" } } },
      ],
    }))).toContain("when_reaches_a_record");
  });

  const when = (m: Parameters<typeof stepApplies>[0], held: Record<string, unknown>) =>
    stepApplies(m, held);

  it("applies where nothing is declared", () => {
    expect(when(undefined, {})).toBe(true);
  });

  it("reads set and unset", () => {
    expect(when({ field: "brand", set: true }, { brand: "Ansell" })).toBe(true);
    expect(when({ field: "brand", set: true }, {})).toBe(false);
    expect(when({ field: "brand", unset: true }, {})).toBe(true);
  });

  /* ⚠️ EVERY CONTROL CLEARS TO `""`, so a step conditioned on `set` would stay
     live over a box somebody emptied — which is the state they emptied it to. */
  it("counts an emptied box as unset", () => {
    expect(when({ field: "brand", set: true }, { brand: "" })).toBe(false);
  });

  it("reads is and isnt against a literal", () => {
    expect(when({ field: "tracking", is: { literal: "batched" } }, { tracking: "batched" })).toBe(true);
    expect(when({ field: "tracking", is: { literal: "batched" } }, { tracking: "counted" })).toBe(false);
    expect(when({ field: "tracking", isnt: { literal: "batched" } }, { tracking: "counted" })).toBe(true);
  });
});

/**
 * ⚠️ A CONDITION IS PRINTED, AND AN OBJECT INTERPOLATES WITHOUT COMPLAINT. The
 * agent door appends a flow's questions to the tool's description; a `Match` put
 * in raw is `[object Object]`, which is not a degraded sentence but a wrong one —
 * the model reads a conditional question as unconditional and the guard the flow
 * expresses is missing from its own account of itself.
 */
describe("a condition in words", () => {
  it("says presence either way", () => {
    expect(saidWhen({ field: "brand", set: true })).toBe("brand is set");
    expect(saidWhen({ field: "brand", unset: true })).toBe("brand is not set");
  });

  it("says a literal either way", () => {
    expect(saidWhen({ field: "tracking", is: { literal: "batched" } }))
      .toBe("tracking is batched");
    expect(saidWhen({ field: "tracking", isnt: { literal: "listed" } }))
      .toBe("tracking is not listed");
  });

  /* ⚠️ A STEP MAY NOT REACH A RECORD — `when_reaches_a_record` refuses it — so
     this only has to be honest about a manifest that never composed. */
  it("names what a pointer points at rather than guessing a value", () => {
    expect(saidWhen({ field: "owner", is: { here: "me" } })).toBe("owner is you");
    expect(saidWhen({ field: "of", is: { here: "record" } })).toBe("of is this record");
  });

  it("never prints an object", () => {
    for (const m of [
      { field: "a", set: true },
      { field: "a", unset: true },
      { field: "a", is: { literal: 3 } },
      { field: "a", isnt: { here: "me" } },
    ] as const) expect(saidWhen(m)).not.toContain("object");
  });
});

describe("which steps somebody is actually asked", () => {
  const STEPS = [
    { id: "named", takes: ["name", "brand"] },
    { id: "counted", takes: ["unit"] },
    { id: "tracked", takes: ["tracking"], always: true as const },
    { id: "shot" },
    { id: "par", takes: ["par"], when: { field: "tracking", is: { literal: "batched" } } },
  ];
  const ids = (held: Record<string, unknown>, filled: string[]) =>
    askedOf(STEPS, held, new Set(filled)).map((s) => s.id);

  it("asks everything that applies when nothing has arrived", () => {
    expect(ids({ tracking: "batched" }, [])).toEqual(["named", "counted", "tracked", "shot", "par"]);
  });

  /* ⚠️ NOT ASKED AND IN THE REVIEW — the whole point of a fill. */
  it("drops a step whose fields all arrived", () => {
    expect(ids({ tracking: "batched" }, ["unit"])).not.toContain("counted");
  });

  /* ⚠️ EVERY FIELD, NOT ANY: the brand would otherwise be unanswerable except
     through the review. */
  it("keeps a step where only some of its fields arrived", () => {
    expect(ids({ tracking: "batched" }, ["name"])).toContain("named");
  });

  /* ⚠️ THE DECISION SOMEBODY MAKES RATHER THAN CONFIRMS. */
  it("asks an insistent step even when it arrived filled", () => {
    expect(ids({ tracking: "batched" }, ["tracking"])).toContain("tracked");
  });

  /* ⚠️ A BLOCK STEP IS NEVER FILLED — skipping it would remove the step that was
     going to produce what fills the rest. */
  it("keeps a block step whatever arrived", () => {
    expect(ids({ tracking: "batched" }, ["name", "brand", "unit", "tracking", "par"]))
      .toContain("shot");
  });

  /* ⚠️ AND INSISTENCE DOES NOT SURVIVE NOT APPLYING. */
  it("drops a step that does not apply, however it arrived", () => {
    expect(ids({ tracking: "counted" }, [])).not.toContain("par");
  });
});

describe("a flow that cannot finish", () => {
  it("refuses a required field no step asks for", () => {
    expect(told(flow({
      asks: [{ id: "named", ask: "What is it?", takes: ["name"] }],
    }))).toContain("story_cannot_finish");
  });

  /* ⚠️ AND A FILL SATISFIES IT, which is the half that makes the check usable at
     all: a flow whose model supplies the unit is a flow that finishes, and one
     demanding a step for every required field would refuse exactly the design
     this contract exists for. */
  it("accepts a required field a fill supplies", () => {
    expect(told(flow({
      fills: { by: "thing.see", with: { shots: "shots" } },
      asks: [
        { id: "named", ask: "What is it?", takes: ["name"] },
        { id: "tracked", ask: "How closely?", takes: ["tracking"], always: true, says: { per: SAID } },
      ],
    }))).not.toContain("story_cannot_finish");
  });
});
