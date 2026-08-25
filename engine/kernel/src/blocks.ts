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
const TOLD = ["field", "count", "words"] as const;

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
    children: slot("The sentence", SAID, true),
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

  /** What is inside what. */
  Tree: block("Tree", "rows", {
    nodes: slot("The branches", ["view"], true),
  }),

  /** What happened, in order. */
  Timeline: block("Timeline", "rows", {
    moments: slot("The moments", ["view"], true),
  }),

  /** Destinations or measures as tiles. */
  TileGrid: block("TileGrid", "tiles", {
    tiles: slot("The tiles", ["view"], true),
  }),

  /** The two or three things somebody reaches for — see `BlockSpec.does`. */
  QuickActions: block("QuickActions", "tiles", {}),

  /** Where this screen sits, and the way back up. */
  Crumbs: block("Crumbs", "rows", {
    trail: slot("The trail", ["view"], true),
  }),

  /** Questions and their answers. */
  Faq: block("Faq", "rows", {
    items: slot("The questions", ["view"], true),
  }),

  /** Where a flow has got to. */
  Steps: block("Steps", "rows", {
    steps: slot("The steps", ["view"], true),
    at: slot("Which one", ["field"], true),
  }),
};

/* ---------------------------------------------------------------- figures --- */

const FIGURES: BlockIndex = {
  /** One number is the point of the screen. */
  Hero: block("Hero", "hero", {
    value: slot("The figure", ["field", "count"], true),
    eyebrow: slot("What it counts", SAID),
    under: slot("What that means", SAID),
  }),

  /** A number among several. */
  Stat: block("Stat", "figure", {
    value: slot("The figure", ["field", "count"], true),
    label: slot("What it counts", SAID, true),
  }),

  /** How far along something is. */
  Meter: block("Meter", "figure", {
    value: slot("How much", ["field", "count"], true),
    limit: slot("Out of how much", ["field", "count"], true),
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
    value: slot("How far it moved", ["field", "count"], true),
    of: slot("Against what", ["words"], true),
  }),

  /** A number out of a possible best. */
  Score: block("Score", "figure", {
    of: slot("The score", ["field", "count"], true),
    out: slot("Out of", ["field", "count"], true),
    label: slot("What it scores", SAID, true),
  }),

  /** A dial. */
  Gauge: block("Gauge", "figure", {
    value: slot("Where the needle sits", ["field", "count"], true),
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
  /** A series over time. */
  LineChart: block("LineChart", "chart", {
    describes: slot("What the chart is", ["words"], true),
    series: slot("What is plotted", ["view"], true),
  }),

  /** Named things compared, laid out along the reading direction. */
  BarChart: block("BarChart", "chart", {
    describes: slot("What the chart is", ["words"], true),
    data: slot("What is compared", ["view"], true),
  }),
};

/* ------------------------------------------------------------------ marks --- */

const MARKS: BlockIndex = {
  /** A barcode, drawn from a code the record carries. */
  Bars: block("Bars", "figure", {
    of: slot("The code", ["field"], true),
  }),

  /** Whose or what's — never a picture. */
  Face: block("Face", "figure", {
    of: slot("Who or what", ["subject", "field"], true),
  }),

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
  ...ROWS, ...LISTS, ...FIGURES, ...CHARTS, ...MARKS,
};
