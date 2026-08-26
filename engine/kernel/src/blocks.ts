/**
 * WHAT A SCREEN MAY DECLARE — the index of registered blocks.
 *
 * ⚠️ THE MEMBERSHIP IS DERIVED AND THE MEANING IS DECLARED, which is not what
 * the plan said and is the honest shape. `scripts/blocks.test.mjs` reads the
 * design package's own source and refuses in BOTH directions: an entry here
 * naming a component that is not exported, and a component that could be a block
 * and is classified as nothing. So a block cannot be quietly left out. What
 * cannot be derived is what a slot MEANS — "the rows" versus "how many", and
 * that this one takes a view and nothing else. A `React.ReactNode` says none of
 * that, and a generator that guessed would be inventing the answer.
 *
 * ⚠️ AND IT IS IN THE KERNEL DESPITE BEING ABOUT COMPONENTS, for two reasons.
 * `defineApp` is the last cheap place a screen naming a block that is not there
 * can be caught — after it, the cost is a blank region on a page in production.
 * And this runs in the Worker: an index living in `@engine/design` would pull
 * React into a manifest.
 *
 * ⚠️ THE SET IS WHAT THE PRODUCT ACTUALLY DRAWS, COUNTED. Every entry below was
 * chosen by tallying the components used across the twelve OneInventory screens
 * that only read — so this is the vocabulary a real product turned out to need,
 * rather than a survey of what the design package happens to export.
 *
 * Layer 3. Imports surface.
 */

import type { BlockEntry, BlockIndex, Bones, SlotSpec } from "./surface.js";

/* ------------------------------------------------------------------ sugar --- */

const slot = (
  label: string, takes: SlotSpec["takes"], required = false, whole = false,
): SlotSpec => ({
  label, takes, ...(required ? { required: true } : {}), ...(whole ? { whole: true } : {}),
});

/** A value off the record the screen is about, or a fixed word. */
const SAID = ["field", "words"] as const;
/** A value, a count, or a fixed word — anything that renders as one figure. */
const TOLD = ["field", "count", "words", "first"] as const;

/**
 * A NUMBER, HOWEVER IT WAS ARRIVED AT — see `Read`.
 *
 * ⚠️ `first` IS IN HERE AND IT IS THE ONE THAT MAKES A HOME SCREEN POSSIBLE. A
 * figure block took a field off the screen's own record or a count of a view, so
 * a total — of anything, over anything — could not be put on a screen at all.
 * The row it reads off is a view's first, which is where an aggregate answers.
 */
const FIGURE = ["field", "count", "first"] as const;

/**
 * ⚠️ EVERY ENTRY NAMES ITS SKELETON AND THE TYPE IS WHAT INSISTS. The frame
 * draws waiting, nothing, trouble and denied around whatever it places; the one
 * thing it cannot work out is what the absence should LOOK like, and a spinner
 * standing in for rows is a layout that will jump when they land.
 */
const block = (
  id: string, bones: Bones, takes: Readonly<Record<string, SlotSpec>>,
): BlockEntry => ({ id, takes, bones });

/* ------------------------------------------------------------------- rows --- */

/**
 * ⚠️ ROWS ARE MOST OF EVERY SCREEN, WHICH THE COUNT MADE PLAIN. Across the
 * twelve reading screens, a row of some kind is drawn more often than every
 * other block put together — so this is where the vocabulary has to be precise,
 * and where a missing entry costs the most.
 */
const ROWS: BlockIndex = {
  /** A label and a fact. The commonest thing on a detail screen. */
  FieldRow: block("FieldRow", "rows", {
    label: slot("What it is", SAID, true),
    value: slot("The fact", TOLD, true),
    under: slot("Why it is that way", SAID),
  }),

  /** A label and a number, with the number given room. */
  AmountRow: block("AmountRow", "rows", {
    label: slot("What it is", SAID, true),
    amount: slot("How many", TOLD, true),
    under: slot("The second line", SAID),
    aside: slot("After the amount", SAID),
  }),

  /** A row that leads somewhere — see `BlockSpec.goes`. */
  NavRow: block("NavRow", "rows", {
    label: slot("Where it leads", SAID, true),
    under: slot("The second line", SAID),
    aside: slot("At the end", TOLD),
  }),

  /** A row about a person or a place, wearing its face. */
  PersonRow: block("PersonRow", "rows", {
    name: slot("Their name", SAID, true),
    under: slot("The second line", SAID),
    aside: slot("At the end", TOLD),
  }),

  /**
   * ⚠️ THE QUIET LINE AT THE BOTTOM OF A CARD, and it is a block rather than a
   * property of one because it is the honest way to say a true thing that is
   * nobody's field — "Scanning a shelf puts everything after it there".
   */
  NoteRow: block("NoteRow", "rows", {
    /* ⚠️ AND `first` IS HERE, WHICH IS WHAT LETS THE SENTENCE BE A CONDITIONAL.
       "Nothing left the shelves" and "the rest went without anybody scanning it"
       are two true things about the same two numbers, and a declaration has no
       `if` — so the operation decides which, answers it as a column, and this
       reads it off the first row. A `words` here could only ever say one of
       them, on the period where the other is true. */
    children: slot("The sentence", TOLD, true),
  }),

  /** An identifier somebody will read out or retype. */
  CopyRow: block("CopyRow", "rows", {
    label: slot("What it is", SAID, true),
    value: slot("The code", ["field"], true),
  }),

  /** A row that does something — see `BlockSpec.does`. */
  ActionRow: block("ActionRow", "rows", {
    label: slot("What it does", SAID, true),
    under: slot("What that means", SAID),
  }),

  /** One step of something being explained. */
  StepRow: block("StepRow", "rows", {
    label: slot("The step", SAID, true),
    under: slot("What it involves", SAID),
  }),

  /** The way out of a list that was cut short — see `BlockSpec.goes`. */
  SeeAll: block("SeeAll", "rows", {
    label: slot("The words on it", ["words"]),
  }),
};

/* ------------------------------------------------------------- structures --- */

const LISTS: BlockIndex = {
  /** Rows that become columns where there is room. */
  Listing: block("Listing", "table", {
    /* ⚠️ THE OUTCOME, NOT THE ROWS — see `SlotSpec.whole`. This block pages and
       searches, so it sizes its own skeleton and can tell an empty list from a
       search that matched nothing in a list that is not empty. */
    of: slot("The rows", ["view"], true, true),
    label: slot("What this list is", ["words"], true),
  }),

  /*
    ⚠️ SIX ENTRIES WERE HERE AND THE SAME MISTAKE HAD BEEN MADE TWICE. `Tree`,
    `Timeline`, `TileGrid`, `Crumbs`, `Faq` and `Steps` each declared a `view`
    slot — and the renderer projects a view into a component's shape in exactly
    two places, `shows` and `plots`. Everything else is handed the ROWS. So a
    declaration naming `Tree` composed, passed every check in this repository,
    and drew nothing: `nodes.filter((n) => n.of === here)` over rows that carry
    no `of` finds none, on a screen that reports ready.

    ⚠️ THAT IS WORD FOR WORD THE ELEVEN CHARTS, and the note above CHARTS is what
    should have caught it: those were removed for taking `series`, or `data` and
    `subject`, or `rows`/`columns`/`values` while the entry claimed one API. A
    branch, a moment, a tile, a crumb and a question are five more shapes a row
    is not — and being in `LISTS` rather than in `CHARTS` is the only reason the
    same argument was not applied to them on the same afternoon.

    ⚠️ THEY ARE NOT DELETED, THEY ARE NOT IN THE VOCABULARY — the charts' own
    treatment. Each is still exported and a hand-written screen may draw any of
    them; what none of them is, is bindable. `scripts/placed.test.mjs` is what
    stops a seventh joining them, and each comes back with the projection that
    says what it takes, designed against the screen that wants it.
  */

  /**
   * The three or four screens somebody reaches for — see `BlockSpec.leads`.
   *
   * ⚠️ IT TAKES DESTINATIONS, NOT ACTS, AND THE ENTRY SAID NEITHER. This was a
   * registry entry with no slots and no `leads`, so a screen could place it and
   * it drew nothing — the "built and reached by nothing" shape one level down
   * from the one `capability.test.mjs` catches. Every shortcut a real home
   * screen offers goes somewhere: a spreadsheet, a sheet of labels, the people
   * it is bought from. The verb is the mark in the circle.
   *
   * ⚠️ AND IT DRAWS FOUR AND DROPS A FIFTH WITHOUT A WORD, which is arithmetic
   * rather than taste — at 80px with a 24px gap five do not fit a phone. Naming
   * five here is a manifest that quietly loses one.
   */
  QuickActions: { ...block("QuickActions", "tiles", {}), leads: true },
};

/* ---------------------------------------------------------------- figures --- */

const FIGURES: BlockIndex = {
  /** One number is the point of the screen. */
  Hero: block("Hero", "hero", {
    value: slot("The figure", FIGURE, true),
    eyebrow: slot("What it counts", SAID),
    under: slot("What that means", SAID),
  }),

  /** A number among several. */
  Stat: block("Stat", "figure", {
    value: slot("The figure", FIGURE, true),
    label: slot("What it counts", SAID, true),
  }),

  /** How far along something is. */
  Meter: block("Meter", "figure", {
    value: slot("How much", FIGURE, true),
    limit: slot("Out of how much", FIGURE, true),
    label: slot("What it measures", SAID, true),
  }),

  /**
   * How much it moved.
   *
   * ⚠️ IT TAKES THE MOVEMENT, NOT THE TWO FIGURES. This entry described a block
   * that subtracts `was` from `value`; the component does no arithmetic at all
   * and never did. `of` is the words a delta is meaningless without — "vs last
   * month" — because a signed number on its own is not a fact.
   */
  Delta: block("Delta", "figure", {
    value: slot("How far it moved", FIGURE, true),
    of: slot("Against what", ["words"], true),
  }),

  /** A number out of a possible best. */
  Score: block("Score", "figure", {
    of: slot("The score", FIGURE, true),
    out: slot("Out of", FIGURE, true),
    label: slot("What it scores", SAID, true),
  }),

  /** A dial. */
  Gauge: block("Gauge", "figure", {
    value: slot("Where the needle sits", FIGURE, true),
    label: slot("What it measures", SAID),
    note: slot("The line under it", SAID),
  }),
};

/* ----------------------------------------------------------------- charts --- */

/**
 * ⚠️ TWO, AND THE THIRTEEN THAT WERE HERE WERE NOT COUNTED — THEY WERE LISTED.
 * The header of this file says every entry was chosen by tallying the components
 * the twelve reading screens actually draw. That was true of the rows and the
 * figures and false of the charts: `LineChart` and `BarChart` are the two a
 * product draws, and the other eleven appear only in the proving ground's
 * gallery, which is where a design system shows what it has rather than where a
 * product says what it needs.
 *
 * ⚠️ AND THE ENTRY CLAIMED THEY SHARE ONE API, WHICH NONE OF THEM DO. It said
 * every chart takes a view and a label; the components take `series`, or `data`
 * and `subject`, or `rows`/`columns`/`values`, or `points` and `tone`. A
 * declaration naming `HeatmapChart` and binding `series` would have passed every
 * check in the repository and drawn an empty box, because the prop it filled is
 * not one that component has.
 *
 * ⚠️ THE ELEVEN ARE NOT DELETED, THEY ARE NOT IN THE VOCABULARY. They remain
 * exported components a hand-written screen may draw. A heatmap needs two
 * categorical axes and a measure, a dumbbell needs pairs, a table needs columns
 * — three data shapes `ViewSpec` cannot yet describe, and inventing a binding
 * that silently drops two of the three would be this same fault again. When a
 * product needs one, the contract grows a way to say what it takes and the entry
 * comes back with it.
 */
const CHARTS: BlockIndex = {
  /* ⚠️ A SERIES OF POINTS, WHICH IS WHY IT NEEDS NO NAME PER MARK. A line draws
     a run and no x labels at all — see `BlockEntry.plots`. */
  /** A series over time. */
  LineChart: { ...block("LineChart", "chart", {
    describes: slot("What the chart is", ["words"], true),
    series: slot("What is plotted", ["view"], true),
  }), plots: "series" },

  /* ⚠️ A MARK PER ROW WITH ITS NAME DOWN THE SIDE, so the name is required. */
  /** Named things compared, laid out along the reading direction. */
  BarChart: { ...block("BarChart", "chart", {
    describes: slot("What the chart is", ["words"], true),
    data: slot("What is compared", ["view"], true),
  }), plots: "labelled" },
};

/* ------------------------------------------------------------------ books --- */

/**
 * ⚠️ THE TWO BLOCKS WHOSE SOURCE IS THE APP ITSELF — see `BlockEntry.book`. The
 * checklist and the milestones are already declared on the manifest, and what
 * has been DONE is the platform's own read: the same question with the same
 * answer for every product. A slot binding either would be a screen restating
 * steps the manifest holds, and the restatement is the copy that goes stale
 * silently — progress is measured against the manifest, so a second list is the
 * one nobody's progress ever reaches.
 *
 * ⚠️ AND BOTH DRAW NOTHING WHEN THERE IS NOTHING TO SAY. A checklist that stays
 * after it is complete is a permanent reminder of something already handled, and
 * a congratulation repeated on every load is furniture rather than recognition.
 * That is the component's rule, not the declaration's — which is why neither
 * carries a `nothing`.
 */
const BOOKS: BlockIndex = {
  /** The first few things, ticked by what actually happened. */
  Guide: { ...block("Guide", "rows", {}), book: "guide" },

  /** What this workspace has reached, said once. */
  Milestones: { ...block("Milestones", "rows", {}), book: "milestones" },
};

/* ------------------------------------------------------------------ marks --- */

const MARKS: BlockIndex = {
  /** A barcode, drawn from a code the record carries. */
  Bars: block("Bars", "figure", {
    of: slot("The code", ["field"], true),
  }),

  /*
    ⚠️ `Face` WAS HERE AND COULD NOT BE FILLED FROM A DECLARATION, WHICH IS THE
    ELEVEN CHARTS ONE MORE TIME. The component takes a `FaceOf` — a KIND and a
    seed — and the kind is what decides the world it is drawn in: a person is an
    aura you stand inside, a workspace is a planet seen from outside, a thing is
    the photograph itself. A binding carries a field's value and nothing else, so
    a body naming this handed a string to a prop that wanted a pair, composed,
    passed every check in the tree, and drew a plate with nothing on it.

    ⚠️ AND A DEFAULT KIND WOULD HAVE BEEN WORSE THAN THE GAP. Choosing one here
    means every declared face is drawn in one world, silently, including the ones
    that are somebody's — so the failure stops being an empty plate and becomes a
    confident wrong picture. The kind is a fact only the caller knows, `PersonRow`
    takes the face as its own prop, and a screen that needs one draws it in a
    session. What is missing before this comes back is a way for a declaration to
    SAY which kind it means.
  */

  /** Prose a workspace wrote, wearing the design system. */
  Markdown: block("Markdown", "text", {
    of: slot("The prose", SAID, true),
  }),

  /** A legal document or a policy, read rather than scanned. */
  Document: block("Document", "text", {
    text: slot("The document", SAID, true),
  }),
};

/* ---------------------------------------------------------------- the set --- */

export const BLOCKS: BlockIndex = {
  ...ROWS, ...LISTS, ...FIGURES, ...CHARTS, ...BOOKS, ...MARKS,
};

/* ------------------------------------------------------------------ heroes --- */

/**
 * WHAT A SCREEN CAN LEAD WITH — see `HeroSpec`.
 *
 * ⚠️ A SEPARATE REGISTRY, BECAUSE A HERO IS NOT A BLOCK THAT HAPPENS TO BE
 * FIRST. It bleeds past the gutter every block obeys, the crown collapses into
 * it, and it carries its own ambience — none of which an entry in `BLOCKS` can
 * say about itself. Keeping them in one index would mean every block silently
 * gaining three properties it has no answer for, and the first screen to place a
 * row in the hero slot would find out by looking.
 *
 * ⚠️ ONE ENTRY, AND THE COUNT IS THE POINT. Six were sketched — a figure, a
 * title, a picture, a dial, a viewfinder, a field — and five of them are absent
 * because no screen has asked yet. That restraint is the whole lesson of this
 * file: thirteen charts and six list shapes were registered by listing what the
 * design package could export, and seventeen of the nineteen were removed once
 * somebody asked what a declaration naming one would draw. A vocabulary grows
 * one screen at a time or it grows wrong.
 */
export const HEROES: BlockIndex = {
  /**
   * A NUMBER THAT MATTERS, WHAT IT IS OF, AND WHEN IT WAS LAST TRUE.
   *
   * ⚠️ `fresh` IS THE SLOT THAT MAKES THIS HONEST AND IT IS THE ONE A DASHBOARD
   * LEAVES OUT. A figure with no age is a figure a person cannot decide about:
   * a count from four seconds ago and a count from last Tuesday look identical,
   * and the second one is the reason somebody walks to a shelf to check. It is
   * not required, because a figure computed at read time genuinely has no age —
   * but a screen reading a stored total and omitting it is showing a number
   * without saying whether to believe it.
   *
   * ⚠️ AND THERE IS NO TREND SLOT, WHICH WAS THE FOURTH ONE SKETCHED. A spark
   * beside the figure needs a VIEW projected into a series, and the renderer
   * performs exactly two such projections — the reason six list shapes were
   * taken out of the block registry. Adding a third here, for a slot no screen
   * has asked for, would be that mistake made deliberately. It arrives designed
   * against the screen that wants it, or it does not arrive.
   */
  figure: block("figure", "figure", {
    value: slot("The figure", FIGURE, true),
    of: slot("What it is of", SAID, true),
    fresh: slot("When it was last true", SAID),
  }),
};
