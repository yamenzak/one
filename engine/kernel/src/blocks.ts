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

const slot = (label: string, takes: SlotSpec["takes"], required = false): SlotSpec =>
  ({ label, takes, ...(required ? { required: true } : {}) });

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
    who: slot("Whose row this is", ["subject", "field"], true),
    label: slot("Their name", SAID, true),
    under: slot("The second line", SAID),
    aside: slot("At the end", TOLD),
  }),

  /**
   * ⚠️ THE QUIET LINE AT THE BOTTOM OF A CARD, and it is a block rather than a
   * property of one because it is the honest way to say a true thing that is
   * nobody's field — "Scanning a shelf puts everything after it there".
   */
  NoteRow: block("NoteRow", "rows", {
    says: slot("The sentence", SAID, true),
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
    rows: slot("The rows", ["view"], true),
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
    label: slot("What it counts", SAID),
    under: slot("What that means", SAID),
  }),

  /** A number among several. */
  Stat: block("Stat", "figure", {
    value: slot("The figure", ["field", "count"], true),
    label: slot("What it counts", SAID, true),
    under: slot("What that means", SAID),
  }),

  /** How far along something is. */
  Meter: block("Meter", "figure", {
    value: slot("How much", ["field", "count"], true),
    of: slot("Out of how much", ["field", "count"], true),
    label: slot("What it measures", SAID),
  }),

  /** How much it moved. */
  Delta: block("Delta", "figure", {
    value: slot("Now", ["field", "count"], true),
    was: slot("Before", ["field", "count"], true),
    label: slot("What moved", SAID),
  }),

  /** A number out of a possible best. */
  Score: block("Score", "figure", {
    value: slot("The score", ["field", "count"], true),
    label: slot("What it scores", SAID),
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
 * ⚠️ EVERY CHART TAKES A VIEW AND A LABEL AND NOTHING ELSE, WHICH IS THE POINT.
 * Which shape suits a series is a design decision made once per screen, not a
 * set of axis, tick, grid and legend options an app spends an afternoon on —
 * that is the whole reason the chart package exists (`CHART_TYPE`).
 */
const chart = (id: string): BlockEntry => block(id, "chart", {
  series: slot("What is plotted", ["view"], true),
  label: slot("What the chart is", ["words"], true),
});

const CHARTS: BlockIndex = Object.fromEntries([
  "LineChart", "AreaChart", "ColumnChart", "BarChart", "StackedChart",
  "DivergingChart", "DumbbellChart", "HeatmapChart", "ScatterChart",
  "DonutChart", "CompositionBar", "Sparkline", "ChartTable",
].map((id) => [id, chart(id)]));

/* ------------------------------------------------------------------ marks --- */

const MARKS: BlockIndex = {
  /** A barcode, drawn from a code the record carries. */
  Bars: block("Bars", "figure", {
    code: slot("The code", ["field"], true),
  }),

  /** Whose or what's — never a picture. */
  Face: block("Face", "figure", {
    of: slot("Who or what", ["subject", "field"], true),
  }),

  /** Prose a workspace wrote, wearing the design system. */
  Markdown: block("Markdown", "text", {
    text: slot("The prose", SAID, true),
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
