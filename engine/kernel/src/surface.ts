/**
 * A SCREEN, DECLARED — the shape of a surface no app draws.
 *
 * ⚠️ THIS IS NOT A NEW MECHANISM, IT IS AN UNFINISHED ONE. Eleven surfaces are
 * already drawn from declarations no app writes a line of — settings, the money
 * pages, the console, the policy reader, the vault sheet, the guide, the field
 * editor. What was left hand-written is a PRODUCT's own screens, and the line
 * between the two was never a principle: it is where the work stopped. Every UI
 * defect this framework has had was one shape — a capability declared in one
 * place and drawn in another, where the drawing could disagree — and a screen
 * somebody types is the largest remaining place that can happen.
 *
 * ⚠️ AND THE HARD PART IS THE BINDING, WHICH IS WHERE THESE SYSTEMS DIE. The
 * declaration needs a conditional, then a derived value, then a loop, and a bad
 * programming language grows inside a manifest. So every expression in here is a
 * CLOSED SET and there is no operator anywhere: a value comes from one of five
 * sources, wears one of a fixed list of formatters, and is tested for presence
 * and for nothing else. A comparison, a sum or a threshold is not expressible
 * here on purpose — it becomes a query on a collection, where it is typed,
 * tested, and reachable by everything else that reads that collection.
 *
 * ⚠️ THAT IS AN ESCAPE VALVE RATHER THAN AN ESCAPE HATCH, AND THE DIFFERENCE IS
 * THE WHOLE DESIGN. A hatch takes the logic somewhere nothing can see it; the
 * valve pushes it DOWN, into the data layer, where the kernel already refuses a
 * field that does not exist and the search index, the export and the erasure
 * cascade all read the same declaration. A screen that needs to know whether
 * stock is below its floor does not get an operator — the collection gets a view
 * that says so, and every other screen asking the same question gets the same
 * answer.
 *
 * ⚠️ WHAT IS DELIBERATELY NOT HERE: an event handler, a piece of state, an
 * arithmetic expression, a template string, a slot coordinate a block can read.
 * Each of those is one step from a second React with worse names, and the moment
 * one exists the rest arrive to keep it company.
 *
 * Layer 3. Imports primitives, field and collection.
 */

import type { FieldKind, Fields } from "./field.js";
import type { CollectionSpec } from "./collection.js";
import { FIELD_NAME, NAME } from "./collection.js";

/* ------------------------------------------------------------------ shape --- */

/**
 * WHAT A SCREEN IS FOR — eight kinds of purpose, never kinds of arrangement.
 *
 * ⚠️ "TWO COLUMNS" IS NOT A SHAPE, IT IS A CONSEQUENCE, and naming consequences
 * is how a preset system becomes a second CSS. What a screen knows about itself
 * is what it is FOR; the width, the waiting skeleton, the spacing and whether a
 * primary action is even legal all fall out of that in one table.
 *
 * ⚠️ AND IT LIVES IN THE KERNEL RATHER THAN BESIDE THE TABLE THAT READS IT,
 * because a declaration now names one. Two lists of shapes is a manifest that
 * composes with a shape the renderer has never heard of — which does not throw:
 * it falls through to a default and draws a settings page as a form.
 *
 * ⚠️ THE UNION AND NOT A LIST BESIDE IT. `SHAPES` in the design package is a
 * `Record<ScreenShape, …>`, so the compiler already refuses one missing a row —
 * and an array here would be a third place the eight are written down, kept in
 * step by nothing.
 */
export type ScreenShape =
  | "list" | "detail" | "figure" | "board" | "settings" | "form" | "reader" | "decision";

/* ------------------------------------------------------------------ views --- */

/**
 * WHICH RECORDS, AND IN WHAT ORDER — a query, declared once and named by screens.
 *
 * ⚠️ A VIEW IS ON THE APP RATHER THAN ON THE SCREEN, AND THAT IS THE POINT. Two
 * screens asking "what is expiring" with two hand-written filters is two answers
 * to one question, and they drift the first time the rule changes. A named view
 * is one answer, checked once against the collection it reads, and readable by
 * an agent, the docs and an operator without opening a browser.
 */
export interface ViewSpec {
  readonly id: string;
  /** The collection it reads. */
  readonly of: string;
  readonly where?: readonly Match[];
  readonly sort?: Sort;
  /**
   * ⚠️ A CEILING ON THE ROWS, NOT A PAGE SIZE. Paging is the list block's, and it
   * asks for what it can draw; this is a view that is only ever meant to be the
   * top few — a recent-movements strip, a shortlist. A view with no limit is a
   * view somebody will point a phone at with forty thousand rows behind it.
   */
  readonly limit?: number;
  /**
   * HOW MANY ROWS POINT BACK AT EACH OF THESE (D93) — "lines on this shelf", "items in
   * this run", "products from this supplier".
   *
   * ⚠️ THE COMMONEST THING A READING SCREEN SHOWS THAT A DECLARATION COULD NOT
   * SAY. Measured across OneInventory: a per-row count appears on the location
   * tree, the supplier list, the run list, the product page and the kit page —
   * every one of them assembled in a container with a `Map` and a loop, which is
   * five copies of one query the database can answer in one statement.
   *
   * ⚠️ IT IS ON THE VIEW RATHER THAN ON THE COLLECTION, AND THE DIFFERENCE IS
   * WHAT IT COSTS. A field would imply a column, and a column implies a writer
   * and a drift — a counter maintained by every operation that adds or removes a
   * row, wrong the first time one of them forgets. This is computed on read,
   * beside the rows it belongs to, and a view that does not ask does not pay.
   *
   * ⚠️ ONE GROUPED STATEMENT PER TALLY, never one per row. Same discipline as the
   * join beside it, and for the same reason.
   */
  readonly tally?: readonly TallySpec[];
  /**
   * ANSWERED BY ONE OF THE APP'S OWN READ OPERATIONS INSTEAD OF BY A QUERY.
   *
   * ⚠️ THIS IS THE ESCAPE VALVE D92 NAMED, AND IT PUSHES DOWN RATHER THAN OUT. A
   * `Match` is equality and presence and will never be more, deliberately — so a
   * screen whose subject is ARITHMETIC could not be declared at all. "What runs
   * out" is four expiry clocks resolved against a threshold the workspace sets;
   * "how much left the shelves this month" is a sum over a period. Neither is a
   * filter and neither should be: they are the product's own logic, and the
   * product already has a place to put logic that is typed, gated, audited and
   * readable by an agent — a declared operation.
   *
   * ⚠️ AND IT REUSES THE WHOLE PIPE RATHER THAN OPENING A SECOND ONE. What comes
   * back is a `Viewed` like any other view's, so `Listing` binds it unchanged,
   * `count` counts it, `first` reads a figure off it, and `collectionsFor` still
   * asks for `of`'s read permission before any of it runs. A block-level valve
   * would have been a second kind of source every renderer, guard and document
   * had to learn.
   *
   * ⚠️ IT MUST BE A `read`, AND THAT IS CHECKED. A body is drawn on arrival, so a
   * write here would fire on every navigation, on every re-read after an act, and
   * twice in a browser that mounts a tree twice.
   *
   * ⚠️ THE ROW SHAPE IS THE OPERATION'S AND IS NOT CHECKED — the honest limit of
   * this. `output` says the answer carries `items`; what is inside them is a
   * handler's business, so a `shows` column or a `first` field over an asked view
   * is unverified and draws blank when it is wrong. `of` still names the
   * collection the rows are ABOUT, because that is what the permission is of.
   */
  readonly asked?: AskedSpec;
}

/** ⚠️ Which read operation answers a view, and which of its fields is the rows. */
export interface AskedSpec {
  readonly operation: string;
  /**
   * ⚠️ WHICH OUTPUT FIELD HOLDS THE ROWS, because an operation answers a RECORD
   * and a view is a list. Checked against the operation's declared `output`,
   * which is the one half of the shape that IS written down.
   */
  readonly take: string;
  /** ⚠️ What the screen supplies rather than asks for — see `Fill`. */
  readonly fills?: Readonly<Record<string, Fill>>;
}

/**
 * ⚠️ COUNTING UP A REFERENCE, WHICH IS THE MIRROR OF READING DOWN ONE. `reachFor`
 * answers "the name of the product this line points at"; this answers "how many
 * lines point at this location". Between them a screen can say what a row IS and
 * what it HOLDS, which is what every list in this product turned out to need.
 */
export interface TallySpec {
  /** ⚠️ What the number is called on the row — a `shows` column may name it. */
  readonly as: string;
  /** The collection whose rows are counted. */
  readonly of: string;
  /** The `ref` field on that collection which points back at this view's own. */
  readonly by: string;
}

export interface Sort {
  readonly by: string;
  readonly dir: "up" | "down";
}

/**
 * WHAT RUNNING A VIEW ANSWERS — the rows, and how many there are.
 *
 * ⚠️ THE COUNT IS NOT `items.length`, AND IT IS IN THE CONTRACT SO IT CANNOT BE
 * DROPPED ON THE WAY TO THE SCREEN. A view carries a `limit`; a block drawing
 * "50" over a strip capped at fifty is a screen reporting its own ceiling as a
 * fact about the workspace. The runner goes to the trouble of counting, and the
 * only thing that makes that worth doing is the browser carrying it.
 *
 * ⚠️ AND IT IS THE KERNEL'S RATHER THAN THE RUNTIME'S, because the renderer
 * reads it. The arrow points `apps → design → runtime → kernel`, so a shape both
 * ends of that need has exactly one home — and restating it in the design
 * package is how the two come to disagree about a field neither one throws on.
 */
export interface Viewed {
  readonly items: readonly Readonly<Record<string, unknown>>[];
  readonly count: number;
}

/**
 * WHERE A DECLARED SCREEN IS ANSWERED — `/api/screen/<id>`.
 *
 * ⚠️ THE PATH SEGMENT, NAMED ONCE, AND IN THE KERNEL BECAUSE BOTH ENDS SPEAK IT.
 * The worker routes on it and the browser asks for it; spelled at each door they
 * are two strings that have to agree, and they disagree by one character exactly
 * once, silently, as a 404 that reads like an unfinished screen.
 *
 * ⚠️ AN OPERATION ID MAY NOT CONTAIN A SLASH, which is what makes this safe to
 * put in the same space: `screen/<id>` cannot collide with one.
 */
export const SCREEN_PATH = "screen";

/**
 * ⚠️ EQUALITY AND PRESENCE, AND NOTHING ELSE — see the header. There is no `gt`,
 * no `lt`, no `in`, no `like`, and none of them is coming: the first comparison
 * operator is the one that makes a manifest a language, and the second is free.
 *
 * ⚠️ THE THREE `is` VALUES ARE THE THREE THINGS A SCREEN ACTUALLY KNOWS. A
 * literal is a fact the author wrote; `record` is the subject the screen is
 * about; `me` is whoever is signed in. Everything else a real filter wants —
 * below a floor, expiring inside a week, over budget — is a field the collection
 * computes, so that the rule lives once and every reader agrees about it.
 */
export type Match =
  | { readonly field: string; readonly is: Value }
  | { readonly field: string; readonly isnt: Value }
  | { readonly field: string; readonly set: true }
  | { readonly field: string; readonly unset: true };

export type Value =
  | { readonly literal: string | number | boolean }
  | { readonly here: "record" | "me" };

/* --------------------------------------------------------------- bindings --- */

/**
 * WHERE A VALUE COMES FROM — five sources, and a screen has no sixth.
 *
 * ⚠️ `words` IS A LITERAL AND IT IS THE ONE THAT NEEDS DEFENDING. A block whose
 * heading is fixed prose should say so here rather than have the author reach
 * for a component; the alternative is a `label` on every block and a `bind` on
 * some of them, which is two ways to put a word on a screen.
 *
 * ⚠️ `subject` HANDS OVER THE WHOLE RECORD AND `field` HANDS OVER ONE VALUE, and
 * they are separate because a formatter only makes sense on the second. A block
 * taking a whole record is a block that knows what to do with one — a header, an
 * editor, a card — and a formatter over it would have nothing to format.
 */
export type Read =
  | { readonly of: "field"; readonly field: string }
  | { readonly of: "subject" }
  | { readonly of: "view"; readonly view: string }
  | { readonly of: "count"; readonly view: string }
  | { readonly of: "words"; readonly says: string }
  /**
   * A FIELD OFF THE FIRST ROW A VIEW ANSWERS — the figure, not the list.
   *
   * ⚠️ THIS IS HOW AN AGGREGATE REACHES A `Stat` WITHOUT A SECOND KIND OF FETCH.
   * A view that answers one row of totals is still a view: same request, same
   * permission, same outcome. Reading `items[0].onHand` off it is a projection of
   * something the screen already has, and the alternative — a scalar source with
   * its own runner — would be a second thing to fetch, wait for and draw a
   * skeleton over.
   *
   * ⚠️ AND IT IS NOT ONLY FOR AGGREGATES. `sort` plus `limit: 1` over an ordinary
   * collection is "the latest count", "the biggest line", "who touched it last" —
   * facts every product's home screen wants and none of them could say.
   *
   * ⚠️ AN EMPTY VIEW READS AS NOTHING, WHICH IS THE TRUTHFUL ANSWER. A workspace
   * with no movements has no latest movement; drawing a zero there would be the
   * renderer inventing a fact, which is the failure `Region.nothing` exists about.
   */
  | { readonly of: "first"; readonly view: string; readonly field: string };

/**
 * HOW A VALUE IS SAID — the closed set of components that already draw numbers.
 *
 * ⚠️ NAMED, NEVER COMPOSED. `Num`, `Money`, `When`, `Size`, `Unit` and `Tally`
 * exist, each with its own rules about locale, tabular figures and rounding, and
 * a binding picks one. It may not wrap one in another, because "money, rounded,
 * in thousands, as a delta" is four decisions and the place to make four
 * decisions is a component with a name.
 */
export type Format = "plain" | "num" | "money" | "when" | "size" | "unit" | "tally";

/**
 * ⚠️ WHICH KINDS EACH FORMATTER CAN ACTUALLY SAY. A `money` over a boolean and a
 * `when` over a name are not type errors — both are strings by the time they
 * reach a browser — so they render as `$NaN` and `Invalid Date` in production,
 * on a screen nobody opened during review. This table is what makes them
 * refusals at composition instead.
 */
export const FORMATS: Readonly<Record<Format, readonly FieldKind[] | "any">> = {
  plain: "any",
  num: ["number"],
  money: ["money"],
  when: ["instant", "day"],
  size: ["number"],
  unit: ["text", "enum"],
  tally: ["number"],
};

export interface Binding {
  readonly from: Read;
  readonly as?: Format;
}

/**
 * WHETHER A BLOCK IS DRAWN AT ALL — presence, and membership in a closed set.
 *
 * ⚠️ `has` AND `empty` ARE THE `below.length ? … : null` EVERY HAND-WRITTEN
 * SCREEN HAS. A section with nothing in it is a heading over a gap, so the test
 * has to exist.
 *
 * ⚠️ AND `is`/`one` IS THE OTHER HALF, WHICH PRESENCE ALONE COULD NOT SAY AND
 * WHICH THREE OF THE FOUR HARDEST SCREENS TURN ON. What a scanned code turned
 * out to be — a shelf, a known product, an unknown code — decides which card is
 * drawn and what the one action does; "is there a code" answers none of that. It
 * is not a comparison: no ordering, no arithmetic, no arbitrary value. It is
 * membership in a list of names.
 *
 * ⚠️ AND IT MAY ONLY BE ASKED OF AN `enum`, WHICH IS WHAT KEEPS IT CLOSED. The
 * field has to have DECLARED its possible values, so a branch naming a value
 * that can never occur is refused at composition rather than being a card
 * nobody ever sees. A screen wanting to dispatch on something that is not an
 * enum makes it one on the collection — the same direction the derived field
 * goes, and for the same reason.
 */
export type Presence =
  | { readonly has: Read }
  | { readonly empty: Read }
  | { readonly is: Read; readonly one: readonly string[] }
  | { readonly not: Presence };

/* --------------------------------------------------------------- the body --- */

/**
 * HOW MUCH ROOM A BLOCK ASKS FOR.
 *
 * ⚠️ A SPAN IS WHAT THE LAYOUT IS TOLD, AND THE BLOCK NEVER SEES IT. That is the
 * one rule in this file most likely to be broken by somebody being helpful: a
 * block that knows it is "in a 2×1" is a block that breaks in the first layout
 * not using that vocabulary, and every layout after this one is a layout nobody
 * has designed yet. A block reflows by measuring its OWN box — a container query
 * — so it works at any width, including widths that arrive from a sidebar
 * opening, a phone rotating or a workspace nobody anticipated.
 */
export interface Span {
  /**
   * ⚠️ HOW MANY CELLS, NOT WHICH ONES. A block that names a position is placed
   * by the author; a block that asks for room is placed by the layout, and only
   * the second survives a grid that fits a different number of cells on a
   * different screen.
   */
  readonly cells?: number;
}

/**
 * ONE COLUMN OF A LIST — the field, and the word over it.
 *
 * ⚠️ THE WORD IS REQUIRED AND IS NOT THE FIELD'S OWN LABEL. A column heading is
 * read at the top of a narrow column beside five others, where the field's full
 * label ("How many are on this shelf right now") is a paragraph; the field's
 * label is right in a form and wrong here, and one of the two has to give.
 */
export interface Column {
  readonly field: string;
  readonly label: string;
}

/**
 * ⚠️ THREE CELLS IS THE CEILING, AND IT IS A DESIGN DECISION RATHER THAN A
 * LIMITATION. A block spanning most of a grid is a block that wanted to be
 * outside the grid — put it above or below, where it is one thing on its own,
 * rather than making the grid pretend to be a page layout.
 */
export const CELLS_MOST = 3;

/**
 * HOW NARROW A CELL MAY BE — a named width, never a number.
 *
 * ⚠️ AND NEVER A COLUMN COUNT, WHICH IS THE SAME MISTAKE `Grid` ALREADY REFUSES
 * ONE LEVEL DOWN. "Three columns" needs a breakpoint for every size it does not
 * fit; a narrowest-cell has none and cannot be wrong on a device nobody tested.
 * The number of columns is then whatever fits, which is the answer at every
 * width including the ones nobody anticipated.
 *
 * ⚠️ AND IT IS THE SAME CLOSED SET A RAIL'S CARDS USE, because a tile beside a
 * tile should be the same tile whether it is scrolled to or laid out.
 */
export type Cell = "tile" | "panel" | "card";

/**
 * HOW A SCREEN'S BLOCKS ARE ARRANGED — three, and none of them is a coordinate.
 *
 * ⚠️ `split` NAMES A SIDE RATHER THAN A WIDTH, and the side is only about where
 * the aside is DRAWN: the reading order never changes, because putting a filter
 * panel before the results in the DOM because it is drawn on the left is how a
 * page becomes unusable without being wrong.
 */
export type Layout =
  | { readonly as: "stack" }
  | { readonly as: "grid"; readonly least: Cell }
  | { readonly as: "split"; readonly aside: "start" | "end" };

/**
 * ONE THING ON A SCREEN.
 *
 * ⚠️ `does` NAMES OPERATIONS RATHER THAN CARRYING HANDLERS, which is what keeps
 * this a declaration. A handler is code, and code in a manifest is the hatch
 * this whole design exists to avoid; an operation id is something the kernel
 * already checks, the permission gate already reads, and the agent surface
 * already exposes. What happens when it succeeds is the operation's business.
 */
/**
 * WHERE A VALUE THE PERSON IS NOT ASKED FOR COMES FROM — and there are two (D93).
 *
 * ⚠️ `record` IS THE THING THE SCREEN IS ABOUT and `today` IS THE DEVICE'S OWN
 * CALENDAR DAY. Both are facts the screen is standing on, and both appear in the
 * input of nearly every write this product has: `unit.issue` takes the item and
 * the day, `batch.open` takes the batch and the day, `stock.move` takes four
 * things of which two are already known.
 *
 * ⚠️ AND THERE IS NO `me`, DELIBERATELY. An operation that needs to know who is
 * acting reads the session — a value the browser supplied would be the caller
 * naming somebody else, which is the one thing an identity must never be taken
 * from. The absence is the security property, not an omission.
 *
 * ⚠️ `today` IS THE DEVICE'S DAY BECAUSE A SHELF LIFE IS COUNTED WHERE THE SHELF
 * IS. The server has no way to know what day it is where somebody is standing,
 * and its own calendar would call a box expired the evening before it is — or,
 * west of Greenwich, current for a few hours after it is not.
 */
export type Fill = "record" | "today" | { readonly field: string } | { readonly says: Said };

/**
 * ⚠️ THE THIRD SOURCE, AND IT IS THE ONE `/move` FOUND. `record` is the id of
 * the thing the screen is about; a write often wants something ON that row
 * instead. Carrying stock takes the PRODUCT and the SHELF, and a stock line
 * holds both as columns — so with only `record` the form asked a person to type
 * two identifiers they were looking at.
 *
 * ⚠️ AND THE FOURTH IS A CONSTANT THE SCREEN SUPPLIES. `capture: "typed"`
 * distinguishes a movement somebody keyed from one a camera read; it is required
 * input, it is never a question, and without a way to say it the only options
 * were a form asking "Recorded by" or an operation with a default that made the
 * two indistinguishable in the ledger.
 *
 * ⚠️ NEITHER IS AN ESCAPE HATCH. `field` is checked against the screen's subject
 * at composition, exactly as a binding is, and `says` is a literal in a manifest
 * rather than a value from a browser — the caller cannot reach either.
 */
export type Said = string | number | boolean;

/** ⚠️ One reading of the four forms, so no caller writes the branch twice. */
export const fillOf = (
  one: Fill,
): { readonly of: "record" | "today" } | { readonly of: "field"; readonly field: string }
  | { readonly of: "says"; readonly says: Said } => (
    typeof one === "string" ? { of: one }
      : "field" in one ? { of: "field", field: one.field }
        : { of: "says", says: one.says });

/**
 * AN ACT A BLOCK OFFERS, AND WHAT THE SCREEN FILLS IN FOR IT.
 *
 * ⚠️ THE BARE STRING IS STILL THE COMMON CASE and stays legal, because most acts
 * take nothing or take only what a person types. This form exists for the ones
 * whose input names something the screen already knows.
 */
export interface ActSpec {
  readonly op: string;
  /** ⚠️ Field name → where its value comes from. Never drawn, never asked. */
  readonly fills?: Readonly<Record<string, Fill>>;
}

/** ⚠️ One reading of the two forms, so no caller writes the ternary twice. */
export const opOf = (one: string | ActSpec): string => (typeof one === "string" ? one : one.op);

/**
 * WHERE A ROW LEADS, AND WHICH OF ITS FIELDS IS THE ADDRESS.
 *
 * ⚠️ `id` IS THE DEFAULT AND IT IS WRONG OFTEN ENOUGH TO NEED SAYING. A row on
 * "what runs out" is a DELIVERY, and there is no screen for one — what somebody
 * wants is the product it is of, which the row carries in another column. With
 * only `id` the choice was between opening the wrong record and not linking the
 * row at all, and the second is the "row that leads nowhere" this exists about.
 *
 * ⚠️ AND IT IS A FIELD RATHER THAN A PATH, so the same check applies as
 * everywhere else: a name that is not on the rows is a refusal at composition,
 * not a press that does nothing.
 */
export interface GoSpec {
  readonly to: string;
  readonly by?: string;
}

/** ⚠️ One reading of the two forms — the twin of `opOf`, for the same reason. */
export const goOf = (one: string | GoSpec): GoSpec =>
  (typeof one === "string" ? { to: one } : one);

export interface BlockSpec {
  /** ⚠️ A registered component — see `BlockEntry`. */
  readonly block: string;
  readonly label?: string;
  readonly span?: Span;
  readonly when?: Presence;
  readonly bind?: Readonly<Record<string, Binding>>;
  readonly does?: readonly (string | ActSpec)[];
  /**
   * ⚠️ WHERE A ROW LEADS, AS A SCREEN'S ID RATHER THAN A PATH. `does` names
   * operations and could not express "open the shelf this row is about" — which
   * is what half the rows in a product do. A route typed here would be a second
   * spelling of an address the manifest already holds, and the two would drift
   * the first time a screen moved.
   *
   * ⚠️ THE LONG FORM SAYS WHICH FIELD CARRIES THE ID — see `GoSpec`. Same two
   * forms as `does`, and for the same reason: the short one is the common case
   * and stays legal.
   */
  readonly goes?: string | GoSpec;
  /**
   * WHICH FIELDS OF A LIST BECOME ITS COLUMNS.
   *
   * ⚠️ A LIST'S COLUMNS ARE NOT RECOVERABLE FROM ITS ROWS, and `Listing`'s own
   * header has said so since it was written: which fields matter, in what order,
   * under what words, and which of them a person may sort by are four decisions,
   * and a component that guessed would guess differently per screen. The
   * renderer needs them and no binding can carry them — a `Read` resolves to one
   * value, and this is a projection.
   *
   * ⚠️ SO IT IS A PROPERTY OF THE PLACEMENT RATHER THAN A SLOT, like `span` and
   * `when`. Every field named here is checked against the collection the view
   * reads, so a renamed column is a refusal at composition rather than a blank
   * column on a page.
   */
  readonly shows?: readonly Column[];
  /**
   * WHAT ITS EMPTINESS MEANS, IN THE APP'S OWN WORDS.
   *
   * ⚠️ REQUIRED OF ANY BLOCK THAT READS A LIST, for the reason `Region.nothing`
   * is required one level down: a surface that renders an empty result as a
   * confident fact does it because saying what emptiness MEANS was something the
   * caller could leave out. A renderer inventing "Nothing here yet" is that same
   * omission with the app taken out of the loop — every empty list in every
   * product saying the same nothing.
   */
  readonly nothing?: { readonly says: string; readonly under?: string };
  /**
   * ⚠️ THIS IS THE ASIDE OF A SPLIT, AND EXACTLY ONE THING MAY SAY SO. The
   * alternative is positional — "the last block is the sidebar" — which reads as
   * an accident the first time somebody reorders a body, and reordering a body
   * is the one edit a declaration is supposed to make safe.
   */
  readonly beside?: true;
}

/**
 * BLOCKS UNDER ONE HEADING, AND THE NESTING STOPS HERE.
 *
 * ⚠️ THIS IS THE COMMONEST SHAPE IN THE PRODUCT AND THE CONTRACT COULD NOT SAY
 * IT. Counted across the screens that only read, `Section` and `Group` are the
 * two most-used components by a wide margin — a labelled region holding a card
 * of rows is what almost every screen is made of, and a flat list of blocks
 * would have drawn every one of them as one undivided column.
 *
 * ⚠️ AND A GROUP HOLDS BLOCKS, NEVER ANOTHER GROUP. One level is a layout; two
 * is a tree, and a tree in a declaration is the template language this design
 * exists without. The type is what refuses it, so there is no rule to remember.
 */
export interface GroupSpec {
  /** ⚠️ `null` is a card with no heading, which is a real and common thing. */
  readonly group: string | null;
  readonly of: readonly BlockSpec[];
  readonly when?: Presence;
  readonly span?: Span;
  /** ⚠️ See `BlockSpec.beside` — a group can be the aside just as a block can. */
  readonly beside?: true;
}

export type Placed = BlockSpec | GroupSpec;

export const isGroup = (p: Placed): p is GroupSpec => "group" in p;

/** A screen's body: what it is for, how it is arranged, and what is on it. */
export interface SurfaceSpec {
  readonly shape: ScreenShape;
  readonly layout: Layout;
  readonly blocks: readonly Placed[];
}

/* --------------------------------------------------------- the block index --- */

/**
 * WHAT A BLOCK'S ABSENCE LOOKS LIKE, AND IT IS THE ONE THING THE FRAME CANNOT
 * WORK OUT.
 *
 * ⚠️ THE FOUR OUTCOMES — waiting, nothing, trouble, denied — ARE THE FRAME'S,
 * NOT FORTY COMPONENTS'. Each has shipped as a wrong answer wearing a loading
 * state's excuse: an empty array drawn as "nothing here" while the request was
 * still in flight, a failed load drawn as "no media yet", a control drawn for
 * somebody who could not press it. Building the four into every block would be
 * thirty-nine copies of one decision, which is the shape this arc exists to
 * remove — so `Region` draws them ONCE, and what it needs from the block is the
 * only thing it cannot derive.
 *
 * ⚠️ AND THE FOUR ARE NOT LISTED HERE. They were, and nothing imported the list:
 * the frame's own branches are what enforce them, and a second enumeration is a
 * thing to keep in step with no way of knowing when it has drifted.
 */
/**
 * ⚠️ A SKELETON IS SHAPED LIKE WHAT IS COMING, WHICH IS WHY A SPINNER IS NOT ONE.
 * A spinner is a layout that will jump; rows that become rows do not. Only the
 * block knows which of these it is, so it is the one thing the frame has to be
 * told — and naming it here rather than in the component keeps it a fact the
 * renderer can read without mounting anything.
 */
export type Bones =
  | "rows" | "hero" | "figure" | "chart" | "tiles" | "table" | "form" | "text";

/* ⚠️ THERE IS NO RUNTIME LIST OF THESE, DELIBERATELY. `BlockEntry.bones` is
   typed, so a registry entry naming an unknown skeleton is a compile error, and
   the frame's own map is `Record<Bones, …>`, so a skeleton it cannot draw is
   another one. An exported array beside them would be a third statement of the
   same closed set that nothing keeps in step — which is what `CELLS` was before
   it went the same way. */

/**
 * WHAT ONE SLOT ON A BLOCK ACCEPTS.
 *
 * ⚠️ THE KINDS OF SOURCE, NOT A TYPE. A list block's rows slot takes a `view`
 * and nothing else; a heading takes a `field` or `words`. Saying so is what
 * turns "bound a single record to a list" from a blank screen into a refusal.
 */
export interface SlotSpec {
  label: string;
  takes: readonly Read["of"][];
  required?: boolean;
  /**
   * ⚠️ THIS SLOT TAKES THE OUTCOME, NOT THE ROWS — and the block draws its own
   * waiting. One block needs it: `Listing` pages and searches, so it sizes its
   * own skeleton by its column count and knows when a search found nothing in a
   * list that is not empty. Wrapping it in the frame's four outcomes as well
   * would draw a generic table skeleton and then a specific one.
   *
   * ⚠️ IT IS ON THE ENTRY RATHER THAN IN THE RENDERER, because "which block owns
   * its own loading" is knowledge about a component, and a renderer holding a
   * list of component names is the join this whole registry exists to remove.
   */
  whole?: boolean;
}

/**
 * ⚠️ THE REGISTRY IS GENERATED FROM THE COMPONENTS THEMSELVES, refusing rather
 * than skipping — the same direction as the module inventory and the guard
 * ledger. A hand-kept list of what can be declared is a list that is missing
 * whatever was added last, and the failure is a manifest refused for naming a
 * component that exists.
 */
export interface BlockEntry {
  readonly id: string;
  readonly takes: Readonly<Record<string, SlotSpec>>;
  /** ⚠️ What its absence looks like — see `Bones`. The frame draws the rest. */
  readonly bones: Bones;
}

export type BlockIndex = Readonly<Record<string, BlockEntry>>;

/* --------------------------------------------------------------- refusals --- */

export type SurfaceRefusal =
  | "not_a_name" | "view_unknown" | "view_collection_unknown" | "view_field_unknown"
  | "block_unknown" | "slot_unknown" | "slot_missing" | "slot_kind_wrong"
  | "field_unknown" | "field_without_a_subject" | "format_wrong"
  | "dispatch_not_closed" | "dispatch_unreachable" | "two_kinds_of_screen"
  | "goes_nowhere"
  | "span_too_wide" | "span_without_a_grid"
  | "shows_without_a_list" | "shows_field_unknown" | "nothing_unsaid"
  /* ⚠️ THE SIX A DOTTED PATH CAN GET WRONG — see `reachFor`. They are separate
     from `field_unknown` because the fix is different for each: a typo, a hop
     through something that is not a reference, a second hop that is not coming. */
  | "tally_name_taken" | "tally_collection_unknown"
  | "tally_not_a_ref" | "tally_points_elsewhere"
  | ReachRefusal
  | "split_without_an_aside" | "aside_without_a_split"
  /* ⚠️ THE FOUR AN ASKED VIEW CAN GET WRONG — see `AskedSpec`. Three of them are
     checked where an operation's declaration is in scope, which is `refuseApp`
     and not here: this function is handed ids alone. */
  | "asked_and_queried" | "asked_operation_unknown" | "asked_not_a_read"
  | "asked_take_unknown"
  | "operation_unknown" | "nothing_on_it";

export interface SurfaceProblem {
  readonly of: string;
  readonly why: SurfaceRefusal;
  readonly detail: string;
}

/**
 * The one place a `when` is taken apart.
 *
 * ⚠️ ONE WALK, BECAUSE A SECOND COPY IS WHERE A BRANCH GOES MISSING. There were
 * two — one collecting views and one collecting fields — and adding the `is`
 * arm to `Presence` meant editing both. Whichever was missed would have gone on
 * reporting green about a conditional it could no longer see.
 */
const insidePresence = (p: Presence, take: (r: Read) => void): void => {
  if ("not" in p) return insidePresence(p.not, take);
  if ("has" in p) return take(p.has);
  if ("empty" in p) return take(p.empty);
  return take(p.is);
};

/**
 * Every source a body reads, however deeply it is named.
 *
 * ⚠️ WALKED RATHER THAN LISTED, because a view named only inside a `when` is
 * still a view — and a check reading `bind` alone would report a screen as
 * sound while its one conditional pointed at nothing.
 */
export const readsIn = (body: SurfaceSpec): readonly Read[] => {
  const out: Read[] = [];
  const take = (r: Read) => out.push(r);
  for (const placed of body.blocks) {
    /* ⚠️ A GROUP'S OWN CONDITION, THEN ITS BLOCKS' — never the same one twice.
       Walking `placed.when` and then walking it again as one of the blocks
       reported every top-level condition's sources in duplicate, which is the
       kind of wrongness a check counts rather than reads. */
    if (isGroup(placed) && placed.when) insidePresence(placed.when, take);
    for (const b of isGroup(placed) ? placed.of : [placed]) {
      if (b.when) insidePresence(b.when, take);
      for (const bind of Object.values(b.bind ?? {})) take(bind.from);
    }
  }
  return out;
};

/**
 * ⚠️ EVERY BLOCK, FLATTENED, AND WITH ITS GROUP'S NAME ON IT. A check that
 * walked only the top level would report a screen sound while every row inside
 * every card went unexamined — which, on this shape, is most of the screen.
 */
export const blocksIn = (
  body: SurfaceSpec,
): readonly { readonly block: BlockSpec; readonly under: string | null }[] =>
  body.blocks.flatMap((placed) => (isGroup(placed)
    ? placed.of.map((block) => ({ block, under: placed.group }))
    : [{ block: placed, under: null }]));

export const viewsIn = (body: SurfaceSpec): readonly string[] =>
  readsIn(body).flatMap((r) => (
    r.of === "view" || r.of === "count" || r.of === "first" ? [r.view] : []));

/**
 * EVERY OPERATION A BODY OFFERS — what `does` names, across every block.
 *
 * ⚠️ READ ONCE HERE RATHER THAN WALKED AT EACH END. The door sends the acts a
 * screen offers so the browser can draw their forms; the guard checks each one
 * is declared; the agent surface lists them. Three walks of one tree is how one
 * of them comes to miss a group's blocks, and the symptom is a button that opens
 * nothing on exactly the screens whose acts are inside a group.
 */
export const actsIn = (body: SurfaceSpec): readonly string[] => {
  const out: string[] = [];
  for (const { block } of blocksIn(body)) {
    for (const one of block.does ?? []) {
      const id = opOf(one);
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
};

/**
 * WHAT THE SCREEN ALREADY KNOWS, PER OPERATION — the fields a form must not ask.
 *
 * ⚠️ WITHOUT IT EVERY DECLARED SCREEN'S FIRST BUTTON ASKS FOR AN ID. Measured
 * across OneInventory: every write takes the thing it acts on and the day it
 * happened, both of which the screen is standing on — so a form drawn from
 * `input` alone puts "Item" and "On" in front of somebody who opened the item
 * and is pressing the button today. They would have to copy a row id off a URL.
 *
 * ⚠️ AND IT IS ON THE BLOCK RATHER THAN ON THE OPERATION, because it is a fact
 * about where the button is. `unit.issue` is the same operation from a detail
 * screen (which knows the item) and from a list (which does not); an operation
 * declaring its own fills would be an operation that knows which screen called
 * it.
 *
 * ⚠️ LAST BLOCK WINS, and it is not a case worth designing around: two blocks on
 * one screen offering the same act with different fills is a screen with two
 * different buttons for one thing, which `refuseSurface` has no way to call
 * wrong and no reader would write on purpose.
 */
export const fillsIn = (
  body: SurfaceSpec,
): Readonly<Record<string, Readonly<Record<string, Fill>>>> => {
  const out: Record<string, Readonly<Record<string, Fill>>> = {};
  for (const { block } of blocksIn(body)) {
    for (const one of block.does ?? []) {
      if (typeof one !== "string" && one.fills) out[one.op] = one.fills;
    }
  }
  return out;
};

/**
 * WHICH COLUMNS EACH VIEW IS ASKED FOR, BY VIEW ID.
 *
 * ⚠️ THE PATHS ARE PER BLOCK AND THE FETCHING IS PER VIEW, so this is where the
 * two are joined up — a block names its columns, the view it binds is what those
 * columns are of, and the runner needs one list per view rather than one per
 * block. Two blocks over one view contribute to the same list, which is what
 * stops the same reference being resolved twice in one screen.
 *
 * ⚠️ AND IT IS THE KERNEL'S BECAUSE IT IS A READING OF THE DECLARATION, not a
 * fetching decision. The runtime does the query; what a body asked for is a
 * question about the body, and `refuseSurface` has already checked every one of
 * these against the collection.
 */
export const columnsIn = (body: SurfaceSpec): Readonly<Record<string, readonly string[]>> => {
  const out: Record<string, string[]> = {};
  for (const { block } of blocksIn(body)) {
    if (!block.shows?.length) continue;
    const read = Object.values(block.bind ?? {}).map((b) => b.from).find((r) => r.of === "view");
    if (read?.of !== "view") continue;
    const held = (out[read.view] ??= []);
    for (const col of block.shows) if (!held.includes(col.field)) held.push(col.field);
  }
  return out;
};

/** Every `field` source a body reads — all of them off the screen's subject. */
export const fieldsIn = (body: SurfaceSpec): readonly string[] =>
  readsIn(body).flatMap((r) => (r.of === "field" ? [r.field] : []));

/* ------------------------------------------------------------ one hop over --- */

/**
 * A FIELD ON THE ROW, OR A FIELD ON WHAT THE ROW POINTS AT — `"product.name"` (D93).
 *
 * ⚠️ WITHOUT THIS EVERY LIST IN EVERY PRODUCT IS A COLUMN OF IDS. A stock row
 * holds `product` and `location` as `ref`s; the screen wants the product's name,
 * its unit, its photograph and the location's name. Measured across
 * OneInventory: twelve reading screens, and every one of them joins. A
 * declaration that cannot say `product.name` is a declaration those screens
 * cannot be written in, which was the finding that stopped the port.
 *
 * ⚠️ ONE HOP, AND THE SECOND ONE IS NOT COMING. `product.supplier.name` is where
 * a manifest stops being a declaration and starts needing a query planner —
 * which is the same line `Match` draws at the first comparison operator. A
 * screen that needs two hops wants a field the collection computes, so the rule
 * lives once and every reader agrees about it.
 *
 * ⚠️ AND IT IS RESOLVED ON THE SERVER, so the browser gets flat rows and the
 * renderer needs no idea any of this happened — `row["product.name"]` is a plain
 * key. A join done in the browser would be N requests, a second copy of the
 * matching rule in every screen, and rows that are missing their names for the
 * length of whichever fetch lost.
 */
export type Reach =
  | { readonly on: "self"; readonly field: string }
  | { readonly on: "ref"; readonly through: string; readonly to: string; readonly field: string };

export type ReachRefusal =
  | "path_too_deep" | "path_head_unknown" | "path_head_not_a_ref"
  | "path_target_unknown" | "path_field_unknown" | "not_a_name";

/**
 * ⚠️ ONE RESOLVER, READ BY THE REFUSAL AND BY THE RUNNER. Two implementations of
 * "what does `product.name` mean" is how a path the kernel accepts becomes a
 * column the runner cannot find — a blank under a correct heading, which reads
 * as missing data rather than as a fault.
 */
export function reachFor(
  path: string, held: Fields, collections: readonly CollectionSpec[],
): Reach | ReachRefusal {
  const parts = path.split(".");
  if (parts.length > 2) return "path_too_deep";
  if (!parts.every((p) => FIELD_NAME.test(p))) return "not_a_name";
  const [head, tail] = parts as [string, string | undefined];
  if (tail === undefined) return head in held ? { on: "self", field: head } : "path_field_unknown";

  const through = held[head];
  if (!through) return "path_head_unknown";
  if (through.kind !== "ref") return "path_head_not_a_ref";
  const to = collections.find((c) => c.id === through.to);
  if (!to) return "path_target_unknown";
  if (!(tail in to.fields)) return "path_field_unknown";
  return { on: "ref", through: head, to: to.id, field: tail };
}

/**
 * ⚠️ ONE SENTENCE PER REFUSAL, SAID ONCE. The same six can be raised from a
 * `field` binding and from a `shows` column, and two copies of the wording is how
 * one of them comes to name the wrong collection.
 */
export const sayReach = (
  why: ReachRefusal, path: string, of: string, held: Fields,
): string => {
  const head = path.split(".")[0]!;
  switch (why) {
    case "path_too_deep": return `"${path}" reaches through two references — a screen may `
      + "read a field on the record or a field on what it points at, and no further";
    case "not_a_name": return `"${path}", which is not a field name`;
    case "path_head_unknown": return `"${path}", and "${of}" has no "${head}" to reach through`;
    case "path_head_not_a_ref": return `"${path}", and "${head}" is a `
      + `${(held[head] as { kind: string } | undefined)?.kind ?? "field"} rather than a reference`;
    case "path_target_unknown": return `"${path}", and "${head}" points at a collection `
      + "this app does not declare";
    case "path_field_unknown": return `"${path}", which is not there`;
  }
};

/** ⚠️ The hops a set of paths needs, deduplicated — one query each, never one per row. */
export const hopsIn = (reaches: readonly Reach[]): readonly { through: string; to: string }[] => {
  const out = new Map<string, { through: string; to: string }>();
  for (const r of reaches) if (r.on === "ref") out.set(r.through, { through: r.through, to: r.to });
  return [...out.values()];
};

/**
 * What one view declaration can get wrong.
 *
 * ⚠️ A `where` OR `sort` NAMING A FIELD THAT IS NOT THERE IS THE FAILURE THIS
 * EXISTS FOR, and it does not throw: SQLite answers a comparison against a
 * missing column with an error the runtime reports as a failed read, and the
 * list draws its trouble state. The screen is wrong, the guard is green, and the
 * cause is four files away.
 */
export function refuseView(
  spec: ViewSpec,
  collections: readonly CollectionSpec[],
): readonly SurfaceProblem[] {
  const out: SurfaceProblem[] = [];
  const at = (why: SurfaceRefusal, detail: string) =>
    out.push({ of: `view ${spec.id}`, why, detail });

  if (!NAME.test(spec.id)) at("not_a_name", `"${spec.id}" is not a name a screen can call for`);

  const held = collections.find((c) => c.id === spec.of);
  if (!held) {
    at("view_collection_unknown", `reads "${spec.of}", which this app does not declare`);
    return out;
  }

  /*
    ⚠️ AN ASKED VIEW IS ANSWERED BY A HANDLER, SO EVERY CLAUSE BESIDE IT IS A RULE
    NOTHING APPLIES. `where`, `sort`, `limit` and `tally` are instructions to the
    query builder, and there is no query — so they are declared, typechecked, and
    silently do nothing. That is the worst of the three possible behaviours: a
    view that says it shows the top five and shows everything reads as a handler
    bug rather than as a clause in the wrong place.

    ⚠️ AND THE FIX IS NEVER TO HONOUR THEM HERE. Filtering the operation's answer
    after the fact would be the engine second-guessing logic the product declared
    on purpose — and a `limit` applied to rows already fetched is a ceiling that
    costs everything it was meant to save.
  */
  if (spec.asked) {
    const spare = (["where", "sort", "limit", "tally"] as const)
      .filter((k) => spec[k] !== undefined);
    if (spare.length) {
      at("asked_and_queried",
        `is answered by ${spec.asked.operation} and also declares ${spare.join(", ")} — `
        + "nothing applies them to a handler's answer, so they would be a rule that "
        + "reads as honoured and is not");
    }
    return out;
  }

  const known = (name: string) => name in held.fields;
  for (const m of spec.where ?? []) {
    if (!known(m.field)) {
      at("view_field_unknown", `narrows on "${m.field}", which ${held.id} does not have`);
    }
  }
  if (spec.sort && !known(spec.sort.by)) {
    at("view_field_unknown", `sorts by "${spec.sort.by}", which ${held.id} does not have`);
  }

  /*
    ⚠️ THE POINTING HAS TO GO BOTH WAYS, AND THE THIRD CHECK IS THE ONE THAT
    MATTERS. `of` naming a real collection and `by` naming a real reference on it
    is not enough — the reference has to point back at THIS view's collection, or
    the count is over rows that have nothing to do with the ones being drawn. It
    answers zero for every row, which reads as an empty shelf rather than as a
    manifest naming the wrong pair.
  */
  for (const t of spec.tally ?? []) {
    if (!FIELD_NAME.test(t.as)) {
      at("not_a_name", `counts into "${t.as}", which is not a name a column could show`);
      continue;
    }
    if (known(t.as)) {
      at("tally_name_taken",
        `counts into "${t.as}", which is already a field on ${held.id} — the count would `
        + "replace it, so a column showing it would draw the wrong number");
      continue;
    }
    const of = collections.find((c) => c.id === t.of);
    if (!of) {
      at("tally_collection_unknown",
        `counts "${t.of}", which this app does not declare`);
      continue;
    }
    const by = of.fields[t.by];
    if (!by) {
      at("tally_not_a_ref", `counts ${t.of} by "${t.by}", which ${t.of} does not have`);
    } else if (by.kind !== "ref") {
      at("tally_not_a_ref",
        `counts ${t.of} by "${t.by}", which is a ${by.kind} rather than a reference`);
    } else if (by.to !== held.id) {
      at("tally_points_elsewhere",
        `counts ${t.of} by "${t.by}", which points at ${by.to} rather than at ${held.id}`);
    }
  }

  return out;
}

/** ⚠️ What a view's rows carry beyond their own columns — read by the refusal
    checking a `shows`, and by nothing at runtime, where the key is just a key. */
export const talliedIn = (spec: ViewSpec): readonly string[] =>
  (spec.tally ?? []).map((t) => t.as);

/**
 * What one screen's body can get wrong.
 *
 * ⚠️ EVERY CHECK IN HERE IS ONE THAT WOULD OTHERWISE PRODUCE A SCREEN THAT
 * DRAWS. That is the standard: a mistake the compiler already sees does not
 * belong here, and neither does one that throws on the first request. What
 * belongs is the class that boots, serves, and is quietly wrong — a block bound
 * to a slot it does not have, a formatter that will say `Invalid Date`, a span
 * wider than its grid, a section whose condition names a view nobody declared.
 */
export function refuseSurface(
  screen: {
    readonly id: string; readonly of?: string;
    readonly body?: SurfaceSpec; readonly story?: unknown; readonly session?: unknown;
  },
  index: BlockIndex,
  views: readonly ViewSpec[],
  collections: readonly CollectionSpec[],
  operations: readonly string[],
  screens: readonly string[] = [],
): readonly SurfaceProblem[] {
  const body = screen.body;
  if (!body) return [];

  const out: SurfaceProblem[] = [];
  const at = (why: SurfaceRefusal, detail: string) =>
    out.push({ of: `screen ${screen.id}`, why, detail });

  /*
    ⚠️ A SCREEN IS ONE KIND OF THING, AND THE TWO KINDS ARE NOT A STYLE CHOICE.
    A `body` is READ and drawn by the engine; a `story` is CAPTURE — a flow of
    questions holding unsaved answers, whose controls are a camera, a viewfinder
    and a packing editor and cannot be declared without building a second React.
    A screen carrying both has two answers to what it is, and the renderer would
    have to pick one — silently, by whichever it checked first.
  */
  if (screen.story) {
    at("two_kinds_of_screen",
      "declares both a story and a body — one asks questions and holds the answers, "
      + "the other is drawn from what it reads, and nothing can be both");
  }
  /* ⚠️ AND THE THIRD KIND IS EXCLUSIVE FOR THE SAME REASON — see `SessionSpec`.
     A session is a loop holding unsaved state between writes; a body is redrawn
     from what the door answers, so the two disagree about who owns the screen. */
  if (screen.session) {
    at("two_kinds_of_screen",
      "declares both a session and a body — one is a place somebody works and holds "
      + "what they are part-way through, the other is drawn from what it reads");
  }

  /* --- the layout ------------------------------------------------------- */

  if (body.blocks.length === 0) {
    at("nothing_on_it", "declares a body with no blocks in it, which draws a title over an empty page");
  }

  /*
    ⚠️ A SPLIT WITH NO ASIDE IS ONE COLUMN WEARING A TWO-COLUMN DECLARATION, and
    it does not fail — it draws the main content and an empty gutter beside it,
    which reads as a screen that failed to load half of itself. Two asides is the
    same fault from the other end: the second silently replaces the first.
  */
  const asides = body.blocks.filter((p) => p.beside).length;
  if (body.layout.as === "split" && asides !== 1) {
    at("split_without_an_aside",
      asides === 0
        ? "is a split and nothing declares itself the aside, so one column is drawn beside an empty gutter"
        : `is a split and ${asides} things claim to be the aside — a split has one`);
  }
  if (body.layout.as !== "split" && asides > 0) {
    at("aside_without_a_split",
      `declares an aside on a ${body.layout.as}, which has nothing to put it beside`);
  }

  /* --- the subject ------------------------------------------------------ */

  /*
    ⚠️ A `field` SOURCE ON A SCREEN THAT IS ABOUT NOTHING IS THE SHARPEST ONE
    HERE. `of` says which collection this screen's record comes from; without it
    there is no record, so every `field` binding resolves to undefined — and a
    heading bound to undefined is not an error, it is a blank line. The screen
    looks unfinished rather than broken, which is how it survives review.
  */
  const subject: Fields | null = screen.of
    ? (collections.find((c) => c.id === screen.of)?.fields ?? null)
    : null;
  if (screen.of && !subject) {
    at("view_collection_unknown", `is about "${screen.of}", which this app does not declare`);
  }
  for (const name of fieldsIn(body)) {
    if (!screen.of) {
      at("field_without_a_subject",
        `binds the field "${name}" and names no \`of\` — there is no record for it to be a field of`);
      continue;
    }
    if (!subject) continue;
    /* ⚠️ ONE HOP IS A FIELD TOO — see `reachFor`. A screen about a stock line
       binding "product.name" is the ordinary case, not an exception. */
    const reach = reachFor(name, subject, collections);
    if (typeof reach !== "string") continue;
    /* ⚠️ A BARE NAME KEEPS ITS OWN REFUSAL. `field_unknown` says "this screen's
       subject has no such field", which is the whole story for a name with no
       dot in it; the path codes exist because a dotted one has five other ways
       to be wrong and the fix differs for each. */
    at(reach === "path_field_unknown" && !name.includes(".") ? "field_unknown" : reach,
      name.includes(".")
        ? sayReach(reach, name, screen.of, subject)
        : `binds "${name}", which ${screen.of} does not have`);
  }

  /* --- the dispatches --------------------------------------------------- */

  /*
    ⚠️ A DISPATCH MAY ONLY BE ASKED OF AN `enum`, AND THAT IS WHAT KEEPS THE
    VOCABULARY CLOSED. The field has DECLARED its possible values, so this can
    check both directions at once — and both failures are silent. A branch on a
    value the field can never hold is a card nobody ever sees, which reads as a
    case somebody has not hit yet; a dispatch over a free-text column is a
    comparison against a string, which is the operator this file exists without.
  */
  const dispatching: { readonly said: string; readonly when: Presence }[] = [];
  for (const placed of body.blocks) {
    const said = isGroup(placed) ? `the "${placed.group ?? "unnamed"}" group` : placed.block;
    if (placed.when) dispatching.push({ said, when: placed.when });
    if (isGroup(placed)) {
      for (const b of placed.of) if (b.when) dispatching.push({ said: b.block, when: b.when });
    }
  }
  for (const { said, when } of dispatching) {
    const arms: { readonly at: Read; readonly one: readonly string[] }[] = [];
    const collect = (p: Presence): void => {
      if ("not" in p) return collect(p.not);
      if ("is" in p) arms.push({ at: p.is, one: p.one });
    };
    collect(when);
    for (const arm of arms) {
      if (arm.at.of !== "field") {
        at("dispatch_not_closed",
          `${said} branches on a ${arm.at.of}, which has no declared set of values to branch over`);
        continue;
      }
      const f = subject?.[arm.at.field];
      if (!f) continue;
      if (f.kind !== "enum" || !f.values) {
        at("dispatch_not_closed",
          `${said} branches on "${arm.at.field}", which is a ${f.kind} — a dispatch is `
          + `membership in a declared set, so make it an enum on ${screen.of} or do not branch on it`);
        continue;
      }
      for (const value of arm.one) {
        if (!f.values.includes(value)) {
          at("dispatch_unreachable",
            `${said} draws when "${arm.at.field}" is "${value}", which is not one of its `
            + `values (${f.values.join(", ")}) — a card nobody will ever see`);
        }
      }
      if (arm.one.length === 0) {
        at("dispatch_unreachable", `${said} branches on "${arm.at.field}" against no values at all`);
      }
    }
  }

  /* --- the views -------------------------------------------------------- */

  const byId = new Map(views.map((v) => [v.id, v]));
  for (const name of viewsIn(body)) {
    if (!byId.has(name)) at("view_unknown", `reads the view "${name}", which this app does not declare`);
  }

  /*
    ⚠️ A FIGURE OFF A VIEW'S FIRST ROW IS STILL A COLUMN, AND A WRONG ONE DRAWS A
    DASH. `Stat` bound to a field the collection does not have is not an error at
    any layer — the row comes back, the key is absent, and the block draws its
    empty state — so the screen reports "no figure yet" about a workspace with
    plenty. Same class as `shows_field_unknown`, one block over.

    ⚠️ AN ASKED VIEW IS EXEMPT AND THAT IS THE HONEST LIMIT — see `AskedSpec`.
    The rows come from a handler, so the only thing anybody could check them
    against is a shape nothing writes down.
  */
  for (const r of readsIn(body)) {
    if (r.of !== "first") continue;
    const view = byId.get(r.view);
    if (!view || view.asked) continue;
    const held = collections.find((c) => c.id === view.of)?.fields;
    if (!held || r.field in held || talliedIn(view).includes(r.field)) continue;
    at("view_field_unknown",
      `takes "${r.field}" off the first row of "${r.view}", which ${view.of} does not have`);
  }

  /* --- the blocks ------------------------------------------------------- */

  /*
    ⚠️ ROOM IS ASKED FOR AT THE TOP LEVEL AND NOWHERE ELSE, which falls out of
    what a group IS. The layout hands columns to what it places; a group's own
    blocks stack inside the card it draws, so a span in there is a number the
    layout will never read — declared, typechecked and silently ignored.
  */
  for (const placed of body.blocks) {
    const said = isGroup(placed) ? `the "${placed.group ?? "unnamed"}" group` : placed.block;
    if (placed.span && body.layout.as !== "grid") {
      at("span_without_a_grid",
        `${said} asks for ${placed.span.cells ?? 1} cells, and a ${body.layout.as} has none to give`);
    }
    if (placed.span?.cells !== undefined
      && (placed.span.cells < 2 || placed.span.cells > CELLS_MOST)) {
      at("span_too_wide",
        `${said} asks for ${placed.span.cells} cells — one is the default and more than `
        + `${CELLS_MOST} is a block that wanted to be outside the grid`);
    }
    if (!isGroup(placed)) continue;
    if (placed.of.length === 0) {
      at("nothing_on_it",
        `${said} holds no blocks, which draws a heading over an empty card`);
    }
    for (const b of placed.of) {
      if (b.span) {
        at("span_without_a_grid",
          `${b.block} asks for room inside ${said}, whose blocks stack — the span belongs on the group`);
      }
    }
  }

  for (const { block: b, under } of blocksIn(body)) {
    const where = `${screen.id} · ${b.block}${under ? ` (in "${under}")` : ""}`;
    const entry = index[b.block];
    if (!entry) {
      at("block_unknown", `${where}: no such block — nothing in the design package registers it`);
      continue;
    }


    for (const one of b.does ?? []) {
      const op = opOf(one);
      if (!operations.includes(op)) {
        at("operation_unknown", `${where} offers "${op}", which is not an operation this app declares`);
      }
    }

    /*
      ⚠️ A ROW THAT LEADS NOWHERE IS THE ONE FAULT THAT LOOKS LIKE A SLOW APP.
      The row is drawn, it is pressable, and pressing it does nothing — so the
      person presses it again. Naming the screen rather than a path is what
      makes this checkable at all: a route typed here would be a second spelling
      of an address, and the two drift the first time a screen moves.
    */
    if (b.goes !== undefined) {
      const go = goOf(b.goes);
      if (!screens.includes(go.to)) {
        at("goes_nowhere", `${where} leads to "${go.to}", which is not a screen this app declares`);
      }
      /*
        ⚠️ AND THE ADDRESS HAS TO BE ON THE ROWS — see `GoSpec`. A field that is
        not there resolves to nothing, and the row then opens the destination
        with no record, which draws its not-found. Checked against the view this
        block reads, which is where the rows come from; a block with no view
        reads the screen's own subject and is checked against that.
      */
      if (go.by) {
        const reads = Object.values(b.bind ?? {}).map((x) => x.from).find((r) => r.of === "view");
        const view = reads?.of === "view" ? views.find((v) => v.id === reads.view) : undefined;
        /* ⚠️ AN ASKED VIEW IS EXEMPT, for the reason its columns are — the row
           shape is a handler's and nothing writes it down. */
        const held = view
          ? (view.asked ? null : collections.find((c) => c.id === view.of)?.fields)
          : subject;
        if (held && !(go.by in held)) {
          at("shows_field_unknown",
            `${where} leads to "${go.to}" by "${go.by}", which ${view?.of ?? screen.of} does not have`);
        }
      }
    }

    /*
      ⚠️ A BLOCK THAT READS A LIST CAN BE EMPTY, AND EMPTINESS IS THE APP'S
      SENTENCE. A renderer inventing "Nothing here yet" is the same omission
      `Region.nothing` was made required to stop, with the app taken out of the
      loop — every empty list in every product saying the same nothing, and
      nobody able to say what a person should do about it.
    */
    const lists = Object.values(b.bind ?? {}).some((x) => x.from.of === "view");
    if (lists && !b.nothing) {
      at("nothing_unsaid",
        `${where} reads a list and does not say what it means when the list is empty`);
    }

    /*
      ⚠️ A LIST'S COLUMNS ARE A DECLARATION, NOT A DERIVATION — `Listing`'s own
      header has said so since it was written. What is checked here is that the
      fields named are on the collection the view reads, because the alternative
      is a column of blanks under a correct heading, which reads as missing data
      rather than as a typo.
    */
    if (b.shows?.length) {
      const reads = Object.values(b.bind ?? {}).map((x) => x.from).find((r) => r.of === "view");
      const view = reads?.of === "view" ? views.find((v) => v.id === reads.view) : undefined;
      if (!view) {
        at("shows_without_a_list",
          `${where} names columns and binds no view, so there are no rows for them to be columns of`);
      } else if (!view.asked) {
        /* ⚠️ AN ASKED VIEW'S COLUMNS GO UNCHECKED, AND IT IS THE HONEST LIMIT OF
           THIS — see `AskedSpec`. The rows are a handler's answer; the only
           thing anybody could check them against is a shape nothing writes
           down, and refusing every column would make the escape valve unusable
           for the exact screens it exists for. */
        const held = collections.find((c) => c.id === view.of)?.fields;
        /* ⚠️ A TALLY IS A COLUMN TOO, AND IT IS NOT A FIELD. `talliedIn` is what
           the view promises to put on each row beyond the collection's own — so
           a `shows` naming one is correct, and checking against the fields alone
           would refuse the very thing the tally was declared for. */
        const counted = talliedIn(view);
        for (const col of b.shows) {
          if (!held || counted.includes(col.field)) continue;
          const reach = reachFor(col.field, held, collections);
          if (typeof reach === "string") {
            at(reach === "path_field_unknown" && !col.field.includes(".")
              ? "shows_field_unknown"
              : reach,
              `${where} shows ${sayReach(reach, col.field, view.of, held)}`);
          }
        }
      }
    }

    const bound = b.bind ?? {};
    for (const [slot, spec] of Object.entries(entry.takes)) {
      if (spec.required && !(slot in bound)) {
        at("slot_missing", `${where} does not bind "${slot}" (${spec.label}), which it cannot draw without`);
      }
    }
    for (const [slot, binding] of Object.entries(bound)) {
      const spec = entry.takes[slot];
      if (!spec) {
        at("slot_unknown",
          `${where} binds "${slot}", which it does not take — `
          + `it takes ${Object.keys(entry.takes).join(", ") || "nothing"}`);
        continue;
      }
      if (!spec.takes.includes(binding.from.of)) {
        at("slot_kind_wrong",
          `${where}: "${slot}" takes ${spec.takes.join(" or ")}, and is given a ${binding.from.of}`);
      }
      /*
        ⚠️ THE FORMATTER IS CHECKED AGAINST THE FIELD'S DECLARED KIND, WHICH IS
        THE ONLY PLACE THE TWO EVER MEET. Neither half is wrong on its own: the
        field is a real field and the formatter is a real formatter. What is
        wrong is the pair, and nothing downstream of here can see both.
      */
      if (binding.as && binding.as !== "plain" && binding.from.of === "field") {
        const f = subject?.[binding.from.field];
        const takes = FORMATS[binding.as];
        if (f && takes !== "any" && !takes.includes(f.kind)) {
          at("format_wrong",
            `${where}: "${binding.from.field}" is a ${f.kind} and is drawn as ${binding.as}, `
            + `which says ${takes.join(" or ")}`);
        }
      }
      if (binding.as && binding.as !== "plain" && binding.from.of === "count"
        && !(FORMATS[binding.as] === "any" || (FORMATS[binding.as] as readonly FieldKind[]).includes("number"))) {
        at("format_wrong", `${where}: "${slot}" is a count and is drawn as ${binding.as}`);
      }
    }
  }

  return out;
}

/**
 * ⚠️ A VIEW NOTHING READS IS A QUERY NOBODY RUNS, and unlike an unused constant
 * it is not free: it is a rule about this product's data, written down, that
 * every reader will assume some screen honours. Reported rather than refused —
 * a view can legitimately land one commit before the screen that reads it — but
 * reported, because the alternative is a manifest that accumulates them.
 */
export const unreadViews = (
  views: readonly ViewSpec[],
  bodies: readonly (SurfaceSpec | undefined)[],
): readonly string[] => {
  const read = new Set(bodies.filter(Boolean).flatMap((b) => viewsIn(b as SurfaceSpec)));
  return views.filter((v) => !read.has(v.id)).map((v) => v.id);
};

export const view = (spec: ViewSpec): ViewSpec => spec;
