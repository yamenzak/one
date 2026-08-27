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
import type { Permission } from "./operation.js";
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
  /**
   * WHICH OUTPUT FIELD SAYS HOW MANY THERE ARE, WHERE THE ROWS ARE A PAGE.
   *
   * ⚠️ WITHOUT IT A BOUNDED ANSWER READS AS THE WHOLE ANSWER. A view sorts and
   * is bounded and reports its count separately; an asked view had no such
   * channel, so a handler returning its first two hundred rows produced a list
   * that says "200" in a product whose entire purpose is answering how many
   * there are. Naming the field is what lets `Listing` say "200 of 4,310"
   * instead of quietly claiming the workspace has two hundred.
   *
   * ⚠️ AND IT IS DECLARED RATHER THAN GUESSED. Reading a field called `count`
   * off any answer that happens to have one would misread an operation whose
   * `count` means something else entirely — which is a wrong number rather than
   * a missing one.
   */
  readonly total?: string;
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
 * ⚠️ THE ROOM A BLOCK ASKS FOR IS "THE WHOLE ROW" OR IT IS NOTHING, AND THE
 * ALTERNATIVE WAS MEASURED RATHER THAN ARGUED. This was `Span { cells?: number }`
 * — up to three, refused above that — and a grid here is `auto-fit` with a
 * narrowest cell, which means NOBODY KNOWS HOW MANY COLUMNS THERE ARE. An item
 * asking for three of them is a request the browser satisfies by INVENTING
 * tracks, so a list under three tiles forced a third column onto a phone that
 * fits two and reached 407px past a 390px viewport. The old code carried a
 * comment claiming the browser clamps it; it does not, and the claim survived
 * because the one screen that could have shown it was measured by nothing.
 *
 * ⚠️ SO THE ONLY SPAN THAT CANNOT CREATE A TRACK IS THE ONE THAT NAMES NONE.
 * `grid-column: 1 / -1` means "every column that exists", at every width,
 * including the widths nobody tested — which is the same promise `auto-fit` and
 * `Cell` already make, and which a count cannot keep.
 *
 * ⚠️ AND A COUNT IS NOT COMING BACK WITHOUT A SCREEN BEHIND IT. "Two of four on
 * a desk" is a real thing to want and nothing in this repository wanted it: the
 * feature was declared, refused-above-three, tested three ways, and used once —
 * by the screen that then overflowed. Same argument as the eleven charts.
 *
 * ⚠️ A BLOCK STILL NEVER SEES THIS. That is the rule in this file most likely to
 * be broken by somebody being helpful: a block that knows it is "in a 2×1" is a
 * block that breaks in the first layout not using that vocabulary. A block
 * reflows by measuring its OWN box — a container query — so it works at any
 * width, including one arriving from a sidebar opening or a phone rotating.
 */
export type Wide = true;

/**
 * WHICH FIELDS OF A LIST BECOME A CHART'S AXES.
 *
 * ⚠️ A CHART'S DATA IS A PROJECTION AND THE COMPONENTS SAID SO ALL ALONG.
 * `LineChart` takes series of points and `BarChart` takes labelled values; the
 * declared binding passed a view's rows into both, so the entry composed, the
 * screen mounted, and the chart drew an empty box. `blocks.ts` was right that
 * inventing a binding which silently drops what it does not understand is the
 * fault to avoid — this is the contract growing a way to say what a chart takes.
 *
 * ⚠️ AND WHICH FIELDS ARE REQUIRED IS THE BLOCK'S TO SAY — see `BlockEntry.plots`.
 * A bar needs a name for each bar; a line does not draw one, so demanding it
 * would be a field declared and read by nothing.
 */
export interface PlotSpec {
  /** ⚠️ The measure — what the height or the length of the mark is. */
  readonly of: string;
  /** ⚠️ What each mark is called, where the chart draws one. */
  readonly along?: string;
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
  /**
   * HOW THE VALUE IS SAID — the same closed set a binding picks from.
   *
   * ⚠️ WITHOUT IT A TIMESTAMP COLUMN IS AN ISO STRING, and that is not a
   * formatting nicety: `2026-08-11T14:55:00.000Z` in a "Last seen" column is
   * unreadable at a glance, wider than the name beside it, and the same twenty
   * characters on every row — so the column that exists to say whether a number
   * is stale says nothing at all. Every list in the vocabulary went out that
   * way, because a column had nowhere to say it.
   *
   * ⚠️ AND IT IS DECLARED WHERE ALIGNMENT IS DERIVED, WHICH IS NOT AN
   * INCONSISTENCY. That a field holds numbers is a FACT the collection already
   * states, so the renderer reads it off the rows rather than asking twice.
   * Whether an instant is said as "four months ago" or as a date is a DECISION
   * with two right answers — which is the whole reason a binding carries `as`
   * as well.
   */
  readonly as?: Format;
}

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
 *
 * ⚠️ AND `year` IS THAT SAME DAY'S YEAR, WHICH IS NOT THE SAME AS A SECOND
 * DEVICE FACT. A six-digit expiry printed on a box has its century inferred from
 * a window around NOW, so reading one needs the year where the box is — and four
 * operations in the inventory product take it as required input. None of them
 * could be offered by a declared body at all: `today` is a date STRING and the
 * input is a number, and a manifest cannot hold a year without being edited every
 * January. Derived from `today` in both resolvers rather than read from the clock
 * a second time, so the day a screen sends and the year it sends can never
 * disagree — which they can at 23:59:59 on the thirty-first of December.
 */
export type FillFrom =
  | "record" | "today" | "year"
  | { readonly field: string } | { readonly says: Said }
  /** ⚠️ What somebody narrowed the screen to — see `PickSpec`. */
  | { readonly picked: string };

/**
 * ⚠️ AND `each` IS THE SAME VALUE IN A LIST OF ONE, which is the whole of what a
 * detail page needs to reach a write that works on many. `product.label` takes
 * `ids` because a workspace labels forty shelves in a sitting — and the place a
 * person actually asks for a label is the page about the one shelf they are
 * standing at. Without it the choice was an operation that takes a single id and
 * a second one that takes a list, which is two implementations of one act and
 * therefore two places for the scoping loop to be wrong.
 *
 * ⚠️ IT WRAPS AND DOES NOT COLLECT. `each` says the ARITY the input wants, not
 * that a screen may gather several records; a body has no selection and this
 * does not give it one. The bulk case is a screen that offers the whole
 * collection, and it is a different surface with a different question.
 *
 * ⚠️ AND IT CANNOT NEST, BY TYPE. `{ each: { each: ... } }` does not compose,
 * because a list of lists is a shape no operation in this vocabulary takes and
 * one nobody could read at either end of the wire.
 */
export type Fill = FillFrom | { readonly each: FillFrom };

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

/**
 * A CONTROL THAT CHANGES WHAT THE SCREEN READS.
 *
 * ⚠️ THE LAST THING A READING SCREEN DOES THAT A DECLARATION COULD NOT SAY. A
 * report is over a period somebody picks; a stock list is narrowed to a place
 * they choose. Both are the SAME shape — a value held on the screen, fed into
 * what its views ask for — and without it the two screens that need it were the
 * two screens still written by hand.
 *
 * ⚠️ IT NARROWS A READ AND CAN DO NOTHING ELSE. A pick reaches exactly one place:
 * the `fills` of an asked view, checked at composition. It is not state a block
 * can bind, not a value an act can be given, and not a condition a `when` can
 * branch on — each of those would make a body a program, which is the line D92
 * draws and this does not cross.
 *
 * ⚠️ AND THE OPTIONS ARE DECLARED OR THEY ARE ROWS, never assembled. A period is
 * a closed set the product wrote down; a place is every row of a collection,
 * named by its `names` field and fetched by the door — the same list an act's
 * `ref` input offers, from the same query, under the same permission.
 */
export interface PickSpec {
  readonly id: string;
  /** ⚠️ The word over the control — "Over", "Where". Never the id. */
  readonly label: string;
  /** ⚠️ A closed set the product wrote down, in the order it is read. */
  readonly options?: readonly PickOption[];
  /** ⚠️ Or every row of a collection — see `CollectionSpec.names`. */
  readonly of?: string;
  /**
   * WHICH OPTION IT OPENS ON, WHEN THAT IS NOT THE FIRST ONE.
   *
   * ⚠️ THE READING ORDER AND THE DEFAULT ARE TWO FACTS, AND THIS CONTRACT HELD
   * ONE SLOT FOR BOTH. Four options or fewer are drawn as a segmented control —
   * a row of words read left to right — so a period reads "7 days · 30 days ·
   * 90 days" and nothing else. Making the first one the default then forces the
   * choice between a list in the wrong order and a report that opens on the
   * wrong period, and both are wrong on the screen rather than in the manifest.
   *
   * ⚠️ IT IS FOR A WRITTEN SET ONLY. A collection-backed pick's rows are not
   * known where this is composed, so a value named here could not be checked
   * against anything — and an unchecked default is a control that opens on a row
   * that may not exist. `refuseSurface` refuses the pair.
   */
  readonly opens?: string;
  /**
   * ⚠️ THE WORDS FOR "NOT NARROWED", WHERE THAT IS AN ANSWER. A stock list opens
   * on everything and a place is how somebody narrows it; without a way back the
   * control is a trap. Absent means the first option is the only starting point,
   * which is right for a period — "no period" is not a report.
   *
   * ⚠️ AND A COLLECTION-BACKED PICK MUST HAVE ONE. Its rows arrive from the door
   * after the first read has already gone out, so the control draws its first
   * row as chosen while the screen under it was asked for everything — a
   * narrowing that was never applied, stated as a fact. With `any` the first
   * entry is "not narrowed", which is what actually happened.
   */
  readonly any?: string;
}

export interface PickOption {
  readonly value: string;
  readonly label: string;
}

/**
 * WHAT A NARROWING OPENS ON, READ IN ONE PLACE.
 *
 * ⚠️ TWO CALLERS AND ONE RULE, BECAUSE THEY HAVE TO AGREE OR THE SCREEN LIES.
 * The container seeds its held narrowing from this so the FIRST read carries it;
 * the renderer draws the chosen segment from it. Answered separately they drift
 * by exactly one edit, and the result is a control saying "30 days" over a week
 * of figures — every half internally correct, nothing anywhere disagreeing.
 *
 * ⚠️ `""` IS "NOT NARROWED" AND IS A REAL ANSWER, not an absence. A pick that
 * offers a way back to everything opens there; `refuseSurface` insists on one
 * for a collection-backed pick, whose rows this cannot see.
 */
export const opensOn = (pick: PickSpec): string => (
  pick.any !== undefined ? "" : pick.opens ?? pick.options?.[0]?.value ?? ""
);

/**
 * ⚠️ One reading of the six forms, so no caller writes the branch twice.
 *
 * ⚠️ `every` IS ARITY AND NOT A SIXTH SOURCE, which is why it rides beside `of`
 * rather than replacing it. Every caller that asks WHERE a value comes from —
 * the composition check that wants a subject, the one that wants a column that
 * exists — asks exactly the same question of `{ each: "record" }` as of
 * `"record"`, and would have had to unwrap it first to get the same answer.
 * Only the two resolvers read `every`, because only they build a value.
 */
export const fillOf = (
  one: Fill,
): (
  | { readonly of: "record" | "today" | "year" }
  | { readonly of: "field"; readonly field: string }
  | { readonly of: "says"; readonly says: Said }
  | { readonly of: "picked"; readonly picked: string }
) & { readonly every: boolean } => {
  const every = typeof one === "object" && "each" in one;
  const source: FillFrom = every ? (one as { each: FillFrom }).each : (one as FillFrom);
  return {
    ...(typeof source === "string" ? { of: source } as const
      : "field" in source ? { of: "field", field: source.field } as const
        : "picked" in source ? { of: "picked", picked: source.picked } as const
          : { of: "says", says: source.says } as const),
    every,
  };
};

/**
 * EVERY FILL AN ACT NEEDS, RESOLVED — the browser's half of `Fill`.
 *
 * ⚠️ IT IS HERE RATHER THAN IN THE PAGE THAT USES IT BECAUSE THE OTHER HALF IS
 * ALREADY SHARED. The runtime resolves the same five sources for an asked view;
 * two readings of one contract is how a source comes to mean different things at
 * the two ends of the wire, and the two ends are a browser and a worker, so
 * nothing would ever compare them.
 *
 * ⚠️ ONE DAY IN, TWO FACTS OUT. `today` and `year` are the same calendar day
 * read twice, which is the whole reason the year is not taken off a clock of its
 * own: at 23:59:59 on the thirty-first of December two clock reads are two
 * different years, and a box's expiry would be inferred around one while the
 * movement was dated in the other.
 *
 * ⚠️ AND A SOURCE WITH NOTHING BEHIND IT IS LEFT OUT RATHER THAN SENT EMPTY. A
 * detail screen whose address has not resolved has no record, and an empty string
 * in a required field is a refusal that says the field is missing when the truth
 * is that the screen is not ready.
 */
export const fillWith = (
  fills: Readonly<Record<string, Fill>>,
  from: {
    readonly record?: string | undefined;
    readonly today: string;
    /** ⚠️ The record itself, for a `field` — see `Fill`. */
    readonly held?: Readonly<Record<string, unknown>> | null | undefined;
  },
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [name, one] of Object.entries(fills)) {
    const source = fillOf(one);
    let value: unknown;
    if (source.of === "record" && from.record) value = from.record;
    if (source.of === "today") value = from.today;
    if (source.of === "year") value = Number(from.today.slice(0, 4));

    if (source.of === "field") {
      const held = from.held?.[source.field];
      if (held !== undefined && held !== null && held !== "") value = held;
    }
    if (source.of === "says") value = source.says;
    /* ⚠️ WRAPPED ONLY WHERE THERE IS SOMETHING TO WRAP — see `Fill`. `[]` is not
       "nothing supplied": a list-taking operation reads an empty list as "you
       named no rows" and refuses saying so, which is a worse answer than the
       required-field refusal a missing key gives, and a wrong one when the truth
       is that the screen has not resolved its record yet. */
    if (value !== undefined) out[name] = source.every ? [value] : value;
  }
  return out;
};

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
  readonly wide?: Wide;
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
   * WHICH FIELDS OF A LIST BECOME A CHART'S AXES — see `PlotSpec`.
   *
   * ⚠️ THE SAME KIND OF THING AS `shows`, AND FOR THE SAME REASON. A chart's
   * data is not recoverable from a view's rows: which column is the measure and
   * which one names each bar are decisions, and a component handed a list of
   * rows would have to guess. The two charts in the vocabulary took `series` and
   * `data` in their own shapes and the renderer passed rows straight in, so
   * every declared chart drew an empty box.
   */
  readonly plots?: PlotSpec;
  /**
   * THE SCREENS THIS BLOCK IS A ROW OF SHORTCUTS TO — see `BlockEntry.leads`.
   *
   * ⚠️ IDS, AND EACH TILE WEARS THE SCREEN'S OWN LABEL AND MARK. A shortcut that
   * carried its own words is a second name for a place the manifest already
   * named, and the two say different things the first time one is renamed —
   * which is a bar item and a tile for the same screen reading as two places.
   *
   * ⚠️ AND A SCREEN THIS PERSON MAY NOT OPEN IS DROPPED RATHER THAN DRAWN. The
   * nav filters itself on the same question; a tile inside a screen has nothing
   * filtering it, so a shortcut to a refusal is a promise the product does not
   * keep.
   */
  readonly leads?: readonly string[];
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
   * WHICH FIELD OF THE SCREEN'S SUBJECT THIS ROW CHANGES.
   *
   * ⚠️ A DETAIL SCREEN IS A LIST OF FACTS, AND EVERY ONE OF THEM IS SOMETHING
   * SOMEBODY GOT WRONG ONCE. Without this the only way to correct a typo in a
   * product's name is a screen that draws the whole record as a form — which is
   * a second surface saying the same things in a different order, and the two
   * drift the first time a field is added. The fact and the way to change it
   * belong in one place, and that place is the row already showing it.
   *
   * ⚠️ IT NAMES A FIELD AND NOT AN OPERATION, and the operation is DERIVED:
   * `<collection>.update`, the same generated write the API and an agent reach.
   * A declaration naming its own operation would be free to name one that does
   * something else to a field the row is not about — and the row's pencil would
   * then be a button whose label is somebody else's word for what it does.
   *
   * ⚠️ AND A `settled` FIELD IS REFUSED HERE RATHER THAN AT THE DOOR. The update
   * does not advertise one, so a row offering it would open a sheet whose Save
   * cannot land — a dead end with a pencil on it, which is the shape
   * `FieldRow.onEdit` is documented as never taking.
   */
  readonly edits?: string;
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
  readonly wide?: Wide;
  /** ⚠️ See `BlockSpec.beside` — a group can be the aside just as a block can. */
  readonly beside?: true;
}

export type Placed = BlockSpec | GroupSpec;

export const isGroup = (p: Placed): p is GroupSpec => "group" in p;

/**
 * THE ONE PLACE A SCREEN EARNS REAL DESIGN, AND EVERY SCREEN HAS EXACTLY ONE.
 *
 * ⚠️ A SCREEN WITHOUT ONE OPENS FLAT. Every block is peer to every other, so
 * nothing leads and a person arriving has to READ in order to find out what they
 * are looking at. That is not a failure anybody reports — it is a screen that
 * feels assembled rather than designed, which is a thing people notice and
 * cannot point at.
 *
 * ⚠️ IT IS A REGION RATHER THAN WHATEVER IS FIRST IN `blocks`, AND FOUR THINGS
 * FOLLOW FROM NAMING IT. The KIND DECIDES ITS OWN BLEED — a figure is a card
 * inside the gutter and a picture runs to the edges of the screen — which is a
 * decision no entry in a flat list of blocks can make about itself. The crown
 * COLLAPSES INTO IT, so a screen's name rises into the chrome as the hero leaves
 * rather than every author remembering to arrange it. It carries its own
 * AMBIENCE, which no ordinary block does. And a guard can REQUIRE one, so "this
 * screen opens flat" is a test rather than a note somebody writes in a review.
 *
 * ⚠️ AND "IT IS FULL BLEED" IS WHAT THIS SAID, WHICH WAS TRUE OF ONE KIND AND
 * WRITTEN AS THOUGH IT WERE TRUE OF THE REGION. A blanket rule here would have
 * made every hero run to the edges — correct for a photograph, wrong for a card,
 * and the sort of thing that is discovered by drawing the second kind rather
 * than by reading the first.
 *
 * ⚠️ THE KIND IS A CLOSED SET AND THE CONTENT IS THE SCREEN'S OWN. That is what
 * makes a hero feel made for the screen without making every screen a snowflake
 * — the same trick a face uses, where a person gets one world and a workspace
 * gets another rather than every plate being a letter in a circle.
 *
 * ⚠️ AND A KIND IS REGISTERED WHEN A SCREEN ASKS FOR IT, NEVER BEFORE. The
 * temptation is to sit down and name the six beautiful things a hero could be;
 * that is exactly how thirteen charts and six list shapes came to be registered
 * in this engine, by listing what the design package could export rather than by
 * counting what a product draws. Eleven of the charts, then all six of the
 * lists, were removed once somebody asked what a declaration naming one would
 * actually render. A hero kind with no screen behind it is the same mistake in a
 * bigger box.
 */
export interface HeroSpec {
  /** Which kind — a key of `HEROES`. */
  readonly as: string;
  readonly bind?: Readonly<Record<string, Binding>>;
  /**
   * ⚠️ WHAT IT SAYS BEFORE ANYTHING HAS HAPPENED, and it is required for a
   * reason no ordinary block's is. A hero is the first thing on a new
   * workspace's first screen, so its empty state IS the product's first
   * impression — and it has to read as *nothing has happened yet*, never as
   * broken. A block further down that says nothing is a quiet row; a hero that
   * says nothing is a screen that looks like it failed to load.
   */
  readonly nothing: { readonly says: string; readonly under?: string };
  /**
   * WHERE SOMEBODY GOES FROM HERE — the screens a person most often wants after
   * reading the figure, as a row of shortcuts under it.
   *
   * ⚠️ THIS IS `BlockSpec.leads` IN THE HERO'S REGION, DELIBERATELY THE SAME
   * MECHANISM. A separate list carrying its own labels and marks would be a
   * second spelling of words the manifest already holds, and the two drift the
   * first time a screen is renamed — which is the exact argument `leads` was
   * given for over a route written by hand.
   *
   * ⚠️ AND IT IS WHAT MAKES THE REGION A HERO RATHER THAN A BIG NUMBER. A figure
   * alone answers "how much" and leaves a person to go and find the thing it is
   * about; the same figure with three ways onward is the top of the screen doing
   * the work the rest of it would otherwise have to.
   */
  readonly leads?: readonly string[];
  /**
   * WHERE THE RECORD ITSELF OPENS — the screen, and which of its fields is the
   * address. Same shape as `BlockSpec.goes`, for the same reason.
   *
   * ⚠️ AND IT READS ITS ID OFF THE SAME VIEW THE NAME CAME FROM, which is the
   * one coupling in this contract and is written here rather than inferred
   * quietly. A subject hero is ABOUT the first row of a view; the words on it
   * are that row's fields, so the row to open is that row and there is no second
   * place it could come from. `refuseSurface` insists the name is a `first` when
   * this is set, because a hero whose name is a literal has no record behind it
   * and the press would open a screen with no subject — which draws its own
   * empty state over nothing at all.
   */
  readonly goes?: string | GoSpec;
}

/** A screen's body: what it is for, how it is arranged, and what is on it. */
export interface SurfaceSpec {
  readonly shape: ScreenShape;
  readonly layout: Layout;
  /** ⚠️ The one place this screen earns real design — see `HeroSpec`. */
  readonly hero?: HeroSpec;
  readonly blocks: readonly Placed[];
  /**
   * ⚠️ WHAT SOMEBODY CAN NARROW THIS SCREEN TO — see `PickSpec`. Above the
   * blocks, because a control that changes what everything below it says belongs
   * where it is read first, and because a body has one such row rather than one
   * per block: two narrowings of one screen disagreeing about what is being
   * looked at is the shape a filter panel exists to avoid.
   */
  readonly picks?: readonly PickSpec[];
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
  /**
   * ⚠️ THIS SLOT'S WORDS ARE A GLYPH'S NAME, AND THE PROP IS A DRAWN MARK. A
   * declaration can only ever carry a STRING, and the component takes a node —
   * so without this the renderer hands `"note"` to a prop expecting a mark and
   * React renders the word inside the circle, on a screen that composes, passes
   * every check and looks like somebody typed into an icon.
   *
   * ⚠️ AND IT IS A FLAG ON THE SLOT RATHER THAN A NAME THE RENDERER KNOWS.
   * Converting by matching the slot's NAME would put a list of prop names back
   * inside the renderer, which is the join this registry exists to remove — and
   * the second block to call its mark something else would silently stop
   * converting.
   */
  glyph?: boolean;
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
  /**
   * THIS BLOCK IS A CHART, AND WHICH SHAPE OF DATA IT TAKES — see `PlotSpec`.
   *
   * ⚠️ `labelled` NEEDS A NAME PER MARK AND `series` DOES NOT, which is the whole
   * reason this is on the entry rather than assumed. A bar chart draws the name
   * of every bar down its side; a line draws a run of points and no x labels at
   * all, so requiring one there would be a field declared and read by nothing —
   * and the reader would go looking for where it appears.
   *
   * ⚠️ AND ITS ABSENCE IS WHAT MAKES `plots` REFUSABLE ON EVERYTHING ELSE. A
   * `plots` on a `FieldRow` is a projection nothing applies, which is the class
   * of quietly-ignored declaration this registry exists to close.
   */
  readonly plots?: "labelled" | "series";
  /**
   * THIS BLOCK DRAWS A LIST OF DESTINATIONS — see `BlockSpec.leads`.
   *
   * ⚠️ SEVERAL, WHICH IS WHY `goes` COULD NOT SAY IT. A row leads to one place;
   * a row of shortcuts leads to four, and the whole point of it is that they sit
   * beside each other. Without this the one block in the registry for that shape
   * was placeable and drew nothing.
   *
   * ⚠️ `"one"` IS THE SAME MECHANISM WITH ONE DESTINATION, and it is a second
   * value rather than a second field because the DECLARATION is identical — a
   * list of screen ids, resolved through the manifest, dropped where the person
   * may not open it. What differs is the PROP: a row of shortcuts takes an array
   * and a tile takes a single `onOpen`, so a renderer handing the array to both
   * would set a prop the tile does not take and React would drop it without a
   * word. The kernel refuses a second entry, so "which one did it mean" is never
   * a question anybody has to answer at runtime.
   *
   * ⚠️ AND `true` IS REQUIRED WHERE `"one"` IS OPTIONAL, WHICH IS NOT A
   * SOFTENING. A row of shortcuts with no destinations is a block that draws
   * NOTHING — the heading above it is right and the gap reads as a screen still
   * loading. A tile with no destination is a whole tile: a figure to read rather
   * than a door, which is the correct shape for a number whose list has no
   * screen yet. Requiring one there forced either an invented destination or a
   * tile deleted for a reason that was the checker's rather than the design's.
   */
  readonly leads?: true | "one";
  /**
   * THIS BLOCK CAN CARRY A WAY TO CHANGE THE FACT IT SHOWS — see
   * `BlockSpec.edits`.
   *
   * ⚠️ IT IS ON THE ENTRY BECAUSE IT IS A FACT ABOUT THE COMPONENT: a row that
   * draws a label and a value has somewhere to put a pencil and something for
   * the pencil to be about. A figure does not, and a chart has thirty values and
   * no one of them. Without this an `edits` on either would compose, mount and
   * silently draw no way in — the prop is dropped, and the declaration reads as
   * though the field were editable.
   *
   * ⚠️ AND ONE ENTRY HAS IT, WHICH IS THE HONEST STATE. `FieldRow` is the block
   * a detail screen is made of; the others arrive when a screen wants one, not
   * ahead of it.
   */
  readonly edits?: true;
  /**
   * THIS BLOCK IS FED BY THE APP'S OWN BOOK, NOT BY A BINDING.
   *
   * ⚠️ THE ONLY SOURCE IN THE VOCABULARY THAT IS NOT A VIEW OR A FIELD, and it
   * is here because the checklist is already declared — `AppSpec.guide` and
   * `AppSpec.milestones` are what the events tick. A slot binding them would be
   * a screen restating steps the manifest holds, which is the copy that goes
   * stale silently: the manifest is what progress is measured against, so the
   * restatement is the version nobody's progress ever reaches.
   *
   * ⚠️ AND WHAT HAS BEEN DONE IS THE PLATFORM'S, fetched by the surface rather
   * than declared. An app cannot name a view over another app's tables, and it
   * should not have to: "how far has this workspace got" is one question with
   * one answer for every product.
   */
  readonly book?: "guide" | "milestones";
}

export type BlockIndex = Readonly<Record<string, BlockEntry>>;

/* --------------------------------------------------------------- refusals --- */

export type SurfaceRefusal =
  | "not_a_name" | "view_unknown" | "view_collection_unknown" | "view_field_unknown"
  | "block_unknown" | "hero_unknown" | "hero_opens_nothing" | "slot_unknown" | "slot_missing" | "slot_kind_wrong"
  | "field_unknown" | "field_without_a_subject" | "format_wrong" | "format_missing"
  | "dispatch_not_closed" | "dispatch_unreachable" | "two_kinds_of_screen"
  | "goes_nowhere"
  | "wide_without_a_grid"
  | "shows_without_a_list" | "shows_field_unknown" | "nothing_unsaid"
  /* ⚠️ THE THREE A CHART'S AXES CAN GET WRONG — see `PlotSpec`. Every one of
     them draws an empty box under a correct heading. */
  | "plots_on_a_block_that_draws_none" | "plots_missing" | "plots_unlabelled"
  /* ⚠️ THE TWO A ROW OF SHORTCUTS CAN GET WRONG — see `BlockSpec.leads`. An
     unknown destination is `goes_nowhere`, which is the same fault one tile at a
     time and deserves the same name. */
  | "leads_missing" | "leads_on_a_block_that_takes_none" | "leads_to_several"
  /* ⚠️ THE FOUR A FIELD'S EDIT CAN GET WRONG — see `BlockSpec.edits`. Each ends
     as a pencil that opens onto a Save which cannot land, which is worse than no
     pencil: somebody types the correction and is told nothing happened. */
  | "edits_on_a_block_that_takes_none" | "edits_without_a_subject"
  | "edits_unknown" | "edits_settled"
  /* ⚠️ THE FOUR A NARROWING CAN GET WRONG — see `PickSpec`. A control drawn over
     rows nothing narrows is the sharpest: it moves, and the screen does not. */
  | "pick_name_taken" | "pick_says_nothing" | "pick_two_ways" | "pick_narrows_nothing"
  | "pick_opens_unknown" | "pick_rows_without_a_way_back"
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
  /*
    ⚠️ THE HERO FIRST, AND IT WAS WALKED BY NOTHING AT ALL. This read
    `body.blocks` alone — so the loudest binding on every screen in every product
    was invisible to the one function that decides which views to RUN. The
    consequence is not a missing check: `viewsIn` is what the door reads to
    choose the queries, so a figure bound to a view no block also happens to name
    was never fetched, and the hero drew its "nothing has happened yet" state for
    ever, on a workspace with the number right there in the table underneath.

    ⚠️ AND IT SURVIVED BECAUSE THE FIRST ONE SHARED ITS VIEW WITH A LIST. The
    home screen's figure counts the same declaration the page behind it draws, so
    the view was run for the LIST and the figure worked by coincidence — which is
    the whole argument for that pairing and, here, exactly what hid the fault. It
    surfaced on the second hero to be written, whose view is genuinely its own.

    ⚠️ THE COMPOSER SEES IT NOW TOO, which is the half worth having: a hero
    naming a view or a field that does not exist used to compose, because every
    refusal in `refuseSurface` reads this walk.
  */
  if (body.hero?.bind) for (const bind of Object.values(body.hero.bind)) take(bind.from);
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
 * EVERY FIELD A BODY OFFERS TO CHANGE IN PLACE — see `BlockSpec.edits`.
 *
 * ⚠️ THE FIELDS RATHER THAN THE OPERATION, BECAUSE THE OPERATION IS DERIVED.
 * There is exactly one write behind all of them — `<collection>.update` — and
 * the caller already knows which collection the screen is about, so returning
 * an id here would be this file spelling out a join the runtime holds. What the
 * runtime cannot work out is which of the record's fields the screen offered.
 *
 * ⚠️ AND IT IS WALKED RATHER THAN LISTED, for the reason `readsIn` is: a field
 * offered inside a group is still offered, and a check that read the top level
 * would report a screen as having none while a card of them sat in the middle.
 */
export const editsIn = (body: SurfaceSpec): readonly string[] => {
  const out: string[] = [];
  for (const { block } of blocksIn(body)) {
    if (block.edits && !out.includes(block.edits)) out.push(block.edits);
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
  /*
    ⚠️ EMPTY REFUSES EVERY HERO, WHICH IS WHY THIS MAY DEFAULT AT ALL. A caller
    that forgets it does not get heroes UNCHECKED — it gets `hero_unknown` on
    every screen that declares one, loudly, on the first compose. An optional
    index that skipped its check instead would be the silent-hole shape this
    whole file is built to refuse.
  */
  heroes: BlockIndex = {},
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

  /* --- what narrows it -------------------------------------------------- */

  /*
    ⚠️ A CONTROL THAT NARROWS NOTHING IS THE SHARPEST FAULT HERE, and it is the
    one that looks like the platform being slow. The picker draws, it moves, the
    screen underneath does not change, and somebody presses it again. Nothing
    throws, nothing is missing, and every other check is green.
  */
  const named = new Set<string>();
  for (const pick of body.picks ?? []) {
    if (!NAME.test(pick.id)) {
      at("not_a_name", `narrows by "${pick.id}", which is not a name a view can fill from`);
    }
    if (named.has(pick.id)) {
      at("pick_name_taken",
        `narrows by "${pick.id}" twice — a view filling from it would take whichever `
        + "control the reader happened to write second");
    }
    named.add(pick.id);
    const ways = [pick.options?.length ? "options" : null, pick.of ?? null].filter(Boolean);
    if (ways.length !== 1) {
      at("pick_two_ways",
        ways.length === 0
          ? `narrows by "${pick.id}" and offers nothing to pick — a control with no options `
            + "is a label"
          : `narrows by "${pick.id}" with both a written set and a collection's rows, and `
            + "nothing decides which the control draws");
    }
    if (!pick.label.trim()) {
      at("pick_says_nothing",
        `narrows by "${pick.id}" under no words — an unlabelled control on a screen full of `
        + "figures is one nobody knows the effect of");
    }
    /* ⚠️ A DEFAULT THAT NAMES NOTHING IS A CONTROL WITH NOTHING SELECTED, and
       the screen under it was asked with a value no option can get back to. */
    if (pick.opens !== undefined) {
      if (pick.of) {
        at("pick_two_ways",
          `narrows by "${pick.id}" over ${pick.of}'s rows and names an option to open on — `
          + "the rows are not known here, so nothing can check it names one of them");
      } else if (!(pick.options ?? []).some((o) => o.value === pick.opens)) {
        at("pick_opens_unknown",
          `narrows by "${pick.id}" opening on "${pick.opens}", which is not one of the `
          + "options — the control would draw with nothing chosen");
      }
    }
    /* ⚠️ SEE `PickSpec.any`. Without it the control claims a narrowing that the
       first read never carried. */
    if (pick.of && pick.any === undefined) {
      at("pick_rows_without_a_way_back",
        `narrows by "${pick.id}" over ${pick.of}'s rows and offers no way back to all of `
        + "them — the first row draws as chosen while the screen was asked for every one");
    }
  }
  /*
    ⚠️ AND EVERY ONE OF THEM HAS TO REACH A VIEW. A pick fills exactly one thing
    — the input of an asked view — so a pick nothing fills is a control that
    moves over a screen that does not. Checked here from the body's own views
    rather than from the app's, which is why the view list is passed in.
  */
  for (const pick of body.picks ?? []) {
    const filled = viewsIn(body)
      .map((id) => views.find((v) => v.id === id))
      .some((v) => Object.values(v?.asked?.fills ?? {})
        .some((f) => typeof f === "object" && "picked" in f && f.picked === pick.id));
    if (!filled) {
      at("pick_narrows_nothing",
        `narrows by "${pick.id}" and no view this screen reads fills from it — the control `
        + "would move and the screen under it would not change");
    }
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

  /**
   * WHETHER A BOUND SLOT DRAWS ITS VALUE THE WAY THAT VALUE HAS TO BE DRAWN.
   *
   * ⚠️ ONE WALK, CALLED FROM BOTH THE HERO AND EVERY BLOCK, BECAUSE THE HERO IS
   * WHERE IT ACTUALLY WENT WRONG. The block loop had these checks inline and the
   * hero had none — so the slot at the very top of a detail screen, in the
   * biggest type on the page, was the one slot nothing asked about. Two
   * implementations of "is this drawn right" is how the one that matters ends up
   * being the one that was never written.
   */
  function formatted(where: string, slot: string, binding: Binding): void {
    /*
      ⚠️ THE FORMATTER IS CHECKED AGAINST THE FIELD'S DECLARED KIND, WHICH IS THE
      ONLY PLACE THE TWO EVER MEET. Neither half is wrong on its own: the field
      is a real field and the formatter is a real formatter. What is wrong is the
      pair, and nothing downstream of here can see both.
    */
    if (binding.from.of === "field") {
      const f = subject?.[binding.from.field];
      if (f && binding.as && binding.as !== "plain") {
        const takes = FORMATS[binding.as];
        if (takes !== "any" && !takes.includes(f.kind)) {
          at("format_wrong",
            `${where}: "${binding.from.field}" is a ${f.kind} and is drawn as ${binding.as}, `
            + `which says ${takes.join(" or ")}`);
        }
      }
      /*
        ⚠️ AND THE MIRROR: A DATE LEFT UNFORMATTED, which is the half that got
        through. The check above only ever ran when somebody SAID `as`, so the
        wrong pair was caught and the absent one was not — and a `day` drawn
        plain is `String(v)`, which put `2026-08-27` under a big number in the
        one slot on a hero whose entire job is how OLD something is.

        ⚠️ THERE IS NO CASE FOR THE RAW VALUE, WHICH IS WHY THIS IS A REFUSAL
        RATHER THAN A REPORT. `when` says "Today", "Yesterday", and then the
        date — so past two days it draws what the stored string was going to say
        anyway, in the reader's own locale and zone. The bare ISO text is never
        the better answer; it is only ever the forgotten one.
      */
      if (f && !binding.as && (f.kind === "day" || f.kind === "instant")) {
        at("format_missing",
          `${where}: "${binding.from.field}" is a ${f.kind} and is drawn plain, `
          + "which shows the stored text — say `as: \"when\"`");
      }
    }
    if (binding.as && binding.as !== "plain" && binding.from.of === "count"
      && !(FORMATS[binding.as] === "any"
        || (FORMATS[binding.as] as readonly FieldKind[]).includes("number"))) {
      at("format_wrong", `${where}: "${slot}" is a count and is drawn as ${binding.as}`);
    }
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
    if (placed.wide && body.layout.as !== "grid") {
      at("wide_without_a_grid",
        `${said} asks for the whole row, and a ${body.layout.as} has no columns to give it`);
    }
    if (!isGroup(placed)) continue;
    if (placed.of.length === 0) {
      at("nothing_on_it",
        `${said} holds no blocks, which draws a heading over an empty card`);
    }
    for (const b of placed.of) {
      if (b.wide) {
        at("wide_without_a_grid",
          `${b.block} asks for the whole row inside ${said}, whose blocks stack — it belongs on the group`);
      }
    }
  }

  /*
    ⚠️ THE HERO IS CHECKED LIKE A BLOCK BECAUSE IT IS BOUND LIKE ONE — the same
    slots, the same sources, the same refusals — and it is checked SEPARATELY
    because it is not one. It reads from its own registry, so a body cannot lead
    with an ordinary row by accident, and an ordinary block cannot be placed in
    the region that bleeds past the gutter.
  */
  if (body.hero) {
    const lead = `screen ${screen.id} · hero`;
    const kind = heroes[body.hero.as];
    if (!kind) {
      at("hero_unknown",
        `${lead}: "${body.hero.as}" is not a kind of hero — `
        + `there ${Object.keys(heroes).length === 1 ? "is" : "are"} `
        + `${Object.keys(heroes).join(", ") || "none registered"}`);
    } else {
      const held = body.hero.bind ?? {};
      for (const [slot, spec] of Object.entries(kind.takes)) {
        if (spec.required && !(slot in held)) {
          at("slot_missing",
            `${lead} does not bind "${slot}" (${spec.label}), which it cannot draw without`);
        }
      }
      for (const [slot, binding] of Object.entries(held)) {
        const spec = kind.takes[slot];
        if (!spec) {
          at("slot_unknown",
            `${lead} binds "${slot}", which it does not take — `
            + `it takes ${Object.keys(kind.takes).join(", ")}`);
          continue;
        }
        if (!spec.takes.includes(binding.from.of)) {
          at("slot_kind_wrong",
            `${lead}: "${slot}" takes ${spec.takes.join(" or ")}, and is given a ${binding.from.of}`);
        }
        formatted(lead, slot, binding);
      }
    }
    /* ⚠️ THE SAME QUESTION A BLOCK'S SHORTCUTS ARE ASKED, and it has to be asked
       here too because the hero is not one: the loop below walks `blocksIn`, so
       a hero leading to a screen that does not exist would draw a shortcut whose
       press goes nowhere, at the top of the screen, where it is pressed most. */
    for (const to of body.hero.leads ?? []) {
      if (!screens.includes(to)) {
        at("goes_nowhere",
          `${lead} leads to "${to}", which is not a screen this app declares`);
      }
    }
    if (body.hero.goes) {
      const go = goOf(body.hero.goes);
      if (!screens.includes(go.to)) {
        at("goes_nowhere",
          `${lead} opens "${go.to}", which is not a screen this app declares`);
      }
      /* ⚠️ SEE `HeroSpec.goes`. The id comes off the row the name came from, so
         a name that is not read from a row leaves the press with nothing to
         open — a destination reached with no subject, drawing its own empty
         state over a record that was never there. */
      const named = body.hero.bind?.["name"]?.from;
      if (named && named.of !== "first") {
        at("hero_opens_nothing",
          `${lead} opens "${go.to}" and its name is a ${named.of} rather than a row — `
          + "there is no record for the press to carry");
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
            continue;
          }
          /* ⚠️ AND A COLUMN'S FORMATTER IS CHECKED LIKE A BINDING'S — see
             `Column.as`. `money` over a name and `when` over a quantity are not
             type errors: both are strings by the time they reach a browser, so
             they render as `$NaN` and `Invalid Date` down a whole column on a
             screen nobody opened during review. */
          const of = reach.on === "self"
            ? held[reach.field]
            : collections.find((c) => c.id === reach.to)?.fields[reach.field];
          /* ⚠️ AND A DATE COLUMN LEFT PLAIN IS THE SAME FAULT DOWN A LIST —
             see the binding half. `2026-08-27` under a heading reading "Started"
             is the stored string shown to somebody who wanted to know whether
             that was today. */
          if ((!col.as || col.as === "plain") && of
            && (of.kind === "day" || of.kind === "instant")) {
            at("format_missing",
              `${where} shows "${col.field}", which is a ${of.kind}, plain — `
              + "that draws the stored text; say `as: \"when\"`");
          }
          if (!col.as || col.as === "plain") continue;
          const takes = FORMATS[col.as];
          if (of && takes !== "any" && !takes.includes(of.kind)) {
            at("format_wrong",
              `${where} shows "${col.field}", which is a ${of.kind}, as ${col.as} — `
              + `that says ${takes.join(" or ")}`);
          }
        }
      }
    }

    /*
      ⚠️ A CHART WITHOUT ITS AXES DRAWS AN EMPTY BOX UNDER A CORRECT HEADING —
      see `PlotSpec`. The view is fetched, the region reports ready, the label is
      right, and the figure is blank; nothing throws and nothing is missing, so
      it reads as a workspace with no data in it.
    */
    if (entry.plots && !b.plots) {
      at("plots_missing",
        `${where} is a chart and does not say which fields are its axes — the rows would `
        + "go in as they are and the chart would draw nothing");
    }
    if (!entry.plots && b.plots) {
      at("plots_on_a_block_that_draws_none",
        `${where} names chart axes and is not a chart — nothing would apply them`);
    }
    if (entry.plots === "labelled" && b.plots && !b.plots.along) {
      at("plots_unlabelled",
        `${where} draws a mark per row and does not say what each one is called — `
        + "every bar would be nameless");
    }
    if (b.plots) {
      const reads = Object.values(b.bind ?? {}).map((x) => x.from).find((r) => r.of === "view");
      const view = reads?.of === "view" ? views.find((v) => v.id === reads.view) : undefined;
      /* ⚠️ AN ASKED VIEW IS EXEMPT, exactly as its columns are — the row shape is
         a handler's answer and nothing writes it down. */
      const held = view && !view.asked
        ? collections.find((c) => c.id === view.of)?.fields
        : undefined;
      for (const name of [b.plots.of, b.plots.along].filter((n): n is string => Boolean(n))) {
        if (held && !(name in held) && !(view && talliedIn(view).includes(name))) {
          at("shows_field_unknown",
            `${where} plots "${name}", which ${view?.of} does not have`);
        }
      }
    }

    /*
      ⚠️ A ROW OF SHORTCUTS WITH NOTHING IN IT IS A BLOCK THAT DRAWS NOTHING —
      see `BlockSpec.leads`. It is the same failure as a chart with no axes and
      it is quieter: the heading above it is right, the region reports ready, and
      the gap where four tiles should be reads as a screen still loading.

      ⚠️ `true` ONLY, AND `"one"` IS DELIBERATELY EXEMPT. A tile whose whole body
      is a label and a number is a complete tile; the destination is an
      affordance ON it, not the thing it draws. Asking for one anyway made a
      figure with no list behind it unplaceable, which is a checker deciding a
      screen's composition.
    */
    if (entry.leads === true && !b.leads?.length) {
      at("leads_missing",
        `${where} is a row of shortcuts and names no screens — it would draw a gap `
        + "under a correct heading");
    }
    if (!entry.leads && b.leads) {
      at("leads_on_a_block_that_takes_none",
        `${where} names screens to lead to and is not a row of shortcuts — `
        + "nothing would draw them");
    }
    /* ⚠️ ONE MEANS ONE — see `BlockEntry.leads`. A tile has a single `onOpen`, so
       a second destination here is one the renderer must silently drop, and the
       declaration would read as though both were reachable. */
    if (entry.leads === "one" && (b.leads?.length ?? 0) > 1) {
      at("leads_to_several",
        `${where} names ${b.leads?.length} screens and has room for one — `
        + "the rest would be declared and unreachable");
    }
    for (const to of b.leads ?? []) {
      if (!screens.includes(to)) {
        at("goes_nowhere",
          `${where} leads to "${to}", which is not a screen this app declares`);
      }
    }

    /*
      ⚠️ A ROW THAT OFFERS A CHANGE HAS TO HAVE SOMETHING TO CHANGE IT ON — see
      `BlockSpec.edits`. All four of these end in the same place at runtime: a
      pencil that opens a sheet whose Save cannot land, and somebody typing a
      correction into it and being told nothing happened. None of them fails
      anywhere else — React drops a prop a component does not take, and the door
      refuses a field the update does not advertise long after the screen drew
      it as changeable.
    */
    if (b.edits !== undefined) {
      if (!entry.edits) {
        at("edits_on_a_block_that_takes_none",
          `${where} offers to change "${b.edits}" and is not a row that shows one fact — `
          + "there is nowhere on it for the control to go");
      } else if (!subject) {
        at("edits_without_a_subject",
          `${where} offers to change "${b.edits}" on a screen that is not about a record, `
          + "so there is nothing for the change to be written to");
      } else if (!(b.edits in subject)) {
        at("edits_unknown",
          `${where} offers to change "${b.edits}", which ${screen.of} does not have`);
      } else if (subject[b.edits]?.settled) {
        /* ⚠️ AND THE UPDATE DOES NOT ADVERTISE IT — see `FieldSpec.settled`. The
           refusal is the door's and it is correct; what is wrong is a screen
           offering the change at all, which is a promise made a whole sheet
           before it is broken. */
        at("edits_settled",
          `${where} offers to change "${b.edits}", which is set when the record is made — `
          + "changing it is an operation that knows what else has to be true first");
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
      formatted(where, slot, binding);
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

/* ------------------------------------------------------------- the flow --- */

/**
 * WHAT A DECLARED FLOW CAN GET WRONG.
 *
 * ⚠️ SAME STANDARD AS `refuseSurface`: every check here is one that would
 * otherwise produce a flow that RUNS. A question with no controls under it, a
 * blank that renders as literal braces in the middle of a review, a closed set
 * whose fifth option has no sentence — each of them draws, walks and commits,
 * and each of them is only visible to whoever happens to pick that path.
 *
 * ⚠️ AND IT IS HANDED THE OPERATIONS RATHER THAN THEIR IDS, which the surface
 * check is not. That is the whole reason this is a second function: every rule
 * below is about the relationship between a step and the INPUT of the write it
 * is walking toward, and an id cannot answer any of them.
 */
export type StoryRefusal =
  | "step_asks_nothing" | "step_asks_two_ways" | "step_id_taken"
  | "step_takes_unknown" | "step_block_unknown"
  | "step_always_without_fields"
  | "says_blank_unknown" | "says_per_not_a_set" | "says_per_incomplete"
  | "when_field_unknown" | "when_reaches_a_record"
  | "story_fills_unknown" | "story_fills_nothing"
  | "fills_takes_unknown" | "fills_given_unknown" | "fills_given_unanswered"
  | "fills_permission_wrong"
  | "starts_takes_unknown" | "starts_not_a_setting"
  | "holds_takes_unknown" | "holds_reaches_a_record"
  /* ⚠️ A flow that ends somewhere that is not a screen — see `StorySpec.lands`. */
  | "lands_nowhere"
  | "story_cannot_finish";

export interface StoryProblem {
  readonly of: string;
  readonly why: StoryRefusal;
  readonly detail: string;
}

/** ⚠️ The blanks in a `says.as`, in declaration order. */
const blanksIn = (said: string): readonly string[] =>
  [...said.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);

export function refuseStory(
  screen: {
    readonly id: string;
    /**
     * ⚠️ WHO IS OFFERED THE FLOW, WHICH IS THE ANCHOR THE FILL IS JUDGED AGAINST
     * — see `fills_permission_wrong`. Without it this function could check the
     * SHAPE of a fill and never the question of whether the audience can run it.
     */
    readonly permission?: Permission;
    readonly story?: {
      readonly writes: string;
      readonly starts?: Readonly<Record<string, string>>;
      /** ⚠️ What the flow supplies itself — see `StorySpec.holds`. */
      readonly holds?: Readonly<Record<string, Fill>>;
      readonly lands?: string;
      readonly fills?: {
        readonly by: string;
        readonly with: Readonly<Record<string, string>>;
      };
      readonly asks: readonly {
        readonly id: string; readonly ask: string;
        readonly takes?: readonly string[]; readonly block?: string;
        readonly says?: { readonly as?: string; readonly per?: Readonly<Record<string, string>> };
        readonly always?: true; readonly when?: Match;
      }[];
    };
  },
  /**
   * ⚠️ AND THEIR PERMISSIONS, WHICH THIS DELIBERATELY DID NOT TAKE. Typed as
   * `{ id, input, output }` it could not see a permission at all — so the fill's
   * was checked at composition by nothing, and a story offered on one grant could
   * name a reader demanding another. The failure is silent degradation: the run
   * 403s, the person is told the pictures could not be read, and answers every
   * question by hand. A parameter's type is a statement about which rules are
   * even expressible, and this one ruled out the rule that mattered.
   */
  operations: readonly {
    readonly id: string;
    readonly input: Fields;
    readonly output: Fields;
    readonly permission?: Permission;
  }[],
  /**
   * ⚠️ THE ASKING REGISTRY, NOT THE BODY'S — see `ASKS`. A body block is FED
   * bindings and draws; a step's block is HANDED what the flow holds and answers
   * back, and nothing about the two prop shapes overlaps. Checked against the
   * wrong one, a step naming `Listing` composes and the flow hands a camera's
   * contract to a table.
   */
  asks: Readonly<Record<string, { readonly answers: readonly string[] }>>,
  /**
   * ⚠️ THE SETTING IDS THIS APP DECLARES — see `StorySpec.starts`. A story
   * starting an input at a setting nothing declares is a value that never
   * arrives, which is indistinguishable on the screen from the workspace having
   * left the setting alone. Nothing else here needs the book, so it is the ids
   * rather than the book.
   */
  settings: readonly string[] = [],
  /**
   * ⚠️ EVERY SCREEN THIS APP DECLARES — see `StorySpec.lands`. A flow ending at
   * a screen that is not there leaves somebody on a blank route with the thing
   * they just made nowhere in sight, and nothing throws.
   */
  screens: readonly string[] = [],
): readonly StoryProblem[] {
  const told = screen.story;
  if (!told) return [];

  const out: StoryProblem[] = [];
  const at = (why: StoryRefusal, detail: string) =>
    out.push({ of: `screen ${screen.id}`, why, detail });

  /* ⚠️ ABSENT IS NOT AN ERROR HERE — `story_write_unknown` in `refuseApp` has
     already said so, and a second complaint about the same typo is noise. What
     it means for this function is that every rule below has nothing to check
     against, so it stops rather than reporting each field as unknown. */
  const write = operations.find((o) => o.id === told.writes);
  if (!write) return out;

  /* --- where it ends ------------------------------------------------------ */

  /* ⚠️ CHECKED ONLY WHERE A LIST WAS GIVEN, for the reason `heroes` defaults to
     empty and refuses: a caller that forgets does not get flows UNCHECKED, it
     gets a loud refusal on the first one that declares a destination. */
  if (told.lands && screens.length && !screens.includes(told.lands)) {
    at("lands_nowhere",
      `ends at "${told.lands}", which is not a screen this app declares — the flow `
      + "would finish by moving somebody to a blank route");
  }

  /* --- what starts already answered -------------------------------------- */

  for (const [name, id] of Object.entries(told.starts ?? {})) {
    /* ⚠️ AN INPUT THE WRITE DOES NOT TAKE IS A VALUE THE FLOW NEVER HOLDS, so
       the setting is read, sent, and dropped — and the step it was meant for is
       asked with an empty control while the workspace's answer sits one layer
       away. */
    if (!(name in write.input)) {
      at("starts_takes_unknown",
        `starts "${name}" at ${id}, and ${write.id} does not take it — the value would be `
        + "resolved, sent and dropped, and the step asked as though nothing was chosen");
    }
    /* ⚠️ AND A SETTING NOTHING DECLARES RESOLVES TO NOTHING, which on the screen
       is identical to a workspace that left it alone. A typo here is a feature
       that silently never worked. */
    if (!settings.includes(id)) {
      at("starts_not_a_setting",
        `starts "${name}" at "${id}", which this app does not declare — it would resolve `
        + "to nothing, and an empty control is what a workspace that chose nothing sees");
    }
  }

  /* --- what the flow holds by itself ------------------------------------- */

  for (const [name, from] of Object.entries(told.holds ?? {})) {
    /* ⚠️ SAME FAULT AS `starts_takes_unknown`, ONE SOURCE OVER: the value is
       resolved, sent and dropped, and the write refuses for want of something
       the flow believed it was supplying. */
    if (!(name in write.input)) {
      at("holds_takes_unknown",
        `holds "${name}", and ${write.id} does not take it — the value would be sent and `
        + "dropped, and the write refused for want of a field the flow thought it had");
    }
    /* ⚠️ AND A FLOW IS NOT ABOUT A RECORD — see `StorySpec.holds`. `record` and a
       column ON one are the two sources a DETAIL screen has; a story is making
       something that does not exist yet, so both resolve to nothing and the
       write refuses naming a field nobody was asked for. */
    const source = fillOf(from);
    if (source.of === "record" || source.of === "field") {
      at("holds_reaches_a_record",
        `holds "${name}" from the record, and a flow is not about one — it is making `
        + "something that does not exist yet, so the value would arrive empty");
    }
  }

  /* --- the fill --------------------------------------------------------- */

  const fills = told.fills ? operations.find((o) => o.id === told.fills?.by) : undefined;
  if (told.fills && !fills) {
    at("story_fills_unknown",
      `is filled by "${told.fills.by}", which this app does not declare — nothing would `
      + "arrive and every step would be asked, which is the flow this one exists to replace");
  }
  if (fills) {
    /*
      ⚠️ THE FILL'S OWN GRANT, AGAINST THE ONE THE FLOW IS OFFERED ON. This is
      `story_permission_wrong` one operation over, and it fails more quietly: the
      write's mismatch is a refusal at the last press, which somebody reports;
      the fill's is a flow that simply asks every question, which reads as the
      product not having the feature.

      ⚠️ EXACT EQUALITY, BECAUSE THIS DEPLOYMENT HAS NO IMPLICATION BETWEEN
      GRANTS. The gate is `permissions.has(op.permission)` — a flat membership
      test — so holding `product:write` says nothing about holding
      `product:read`. A rule admitting "weaker" permissions would need an order
      that does not exist, and would pass exactly the pairs that 403.
    */
    /* ⚠️ A PUBLIC FILL IS NEVER WRONG, and `PUBLIC` is a symbol rather than a
       string — so it is normalised out rather than compared. Anybody who reached
       the flow is signed in, which is all `PUBLIC` asks of them. */
    const wants = typeof fills.permission === "string" ? fills.permission : "";
    const offered = typeof screen.permission === "string" ? screen.permission : "";
    if (wants && offered && wants !== offered) {
      at("fills_permission_wrong",
        `is offered on "${offered}" and is filled by ${fills.id}, which demands `
        + `"${wants}" — the reader would be refused and every step asked by hand, which `
        + "reads as the feature not existing");
    }
    /* ⚠️ THE JOIN IS THE SHARED KEYS AND NOTHING ELSE CHECKS IT. An operation
       that runs, spends credits and answers into a flow that drops every value
       is green in every suite: the run succeeded, the flow worked, and the
       person was asked all eight questions anyway. */
    const lands = Object.keys(fills.output).filter((k) => k in write.input);
    if (!lands.length) {
      at("story_fills_nothing",
        `is filled by ${fills.id}, whose output names nothing ${write.id} takes — `
        + "it would run, be charged for, and every answer would be dropped");
    }
    for (const [wants, from] of Object.entries(told.fills?.with ?? {})) {
      /* ⚠️ AN INPUT THE FILL DOES NOT DECLARE IS DROPPED AT ITS OWN DOOR, so the
         model is asked its question with the thing it was supposed to look at
         missing — and answers anyway, plausibly, about nothing. */
      if (!(wants in fills.input)) {
        at("fills_takes_unknown",
          `hands ${fills.id} a "${wants}", which it does not take — the value would be `
          + "dropped at its door and the run would go ahead without it");
      }
      /* ⚠️ AND THE OTHER END IS THE WRITE'S OWN INPUT, because that is the only
         set of names the flow ever holds. A source outside it is a value that
         cannot exist, so the fill is handed nothing under a correct-looking key. */
      if (!(from in write.input)) {
        at("fills_given_unknown",
          `hands ${fills.id} its "${wants}" from "${from}", which ${write.id} does not `
          + "take — the flow never holds a value by that name, so nothing is sent");
      }
    }
  }

  /* --- the steps -------------------------------------------------------- */

  const seen = new Set<string>();
  /** ⚠️ Everything the flow can put into the write, however it got there. */
  const reached = new Set<string>([
    ...(fills ? Object.keys(fills.output).filter((k) => k in write.input) : []),
    /* ⚠️ AND WHAT THE FLOW HOLDS BY ITSELF — see `StorySpec.holds`. A value the
       device supplies is reached exactly as one a model filled is: the write
       gets it, so `story_cannot_finish` must not report it missing. */
    ...Object.keys(told.holds ?? {}).filter((k) => k in write.input),
  ]);
  /** ⚠️ What a person or a block actually PUTS THERE — see `fills_given_unanswered`. */
  const answered = new Set<string>();

  for (const step of told.asks) {
    const of = `step "${step.id}"`;

    if (seen.has(step.id)) {
      at("step_id_taken",
        `${of} is declared twice — the flow addresses a step by its id, so the second `
        + "is unreachable and the review's press lands on the first");
    }
    seen.add(step.id);

    const takes = step.takes ?? [];

    if (!takes.length && !step.block) {
      at("step_asks_nothing",
        `${of} names neither fields nor a block — it draws a question with nothing under `
        + "it, and Next carries somebody past it having answered nothing");
    }
    /*
      ⚠️ BOTH IS REFUSED RATHER THAN COMPOSED, and the reason is who owns the
      answer. A block may ANSWER — that is what makes the camera work — so a step
      drawing controls AND a block has two writers for one step's values and no
      stated order between them. A step that genuinely needs both is a block whose
      own slots take the fields.
    */
    if (takes.length && step.block) {
      at("step_asks_two_ways",
        `${of} names fields and a block — both may write this step's answers, and `
        + "nothing says which wins; give the block the fields it needs as slots");
    }

    for (const name of takes) {
      if (!(name in write.input)) {
        at("step_takes_unknown",
          `${of} asks for "${name}", which ${write.id} does not take — the control would `
          + "draw, somebody would fill it in, and the door would drop the value");
      }
      reached.add(name);
      answered.add(name);
    }

    const asking = step.block ? asks[step.block] : undefined;
    if (step.block && !asking) {
      at("step_block_unknown",
        `${of} names the block "${step.block}", which the asking registry does not hold — `
        + "the step would draw its question over nothing");
    }
    /*
      ⚠️ AND WHAT IT ANSWERS HAS TO REACH THE WRITE, which is `step_takes_unknown`
      from the other end and is worse: a block writing a field the operation does
      not take is work somebody DID — a photograph taken, a ladder built — carried
      through the review and dropped at the door, with nothing on any screen
      saying so.
    */
    for (const name of asking?.answers ?? []) {
      if (!(name in write.input)) {
        at("step_takes_unknown",
          `${of} draws "${step.block}", which answers "${name}" — ${write.id} does not take `
          + "it, so the work would be done, reviewed, and dropped at the door");
        continue;
      }
      reached.add(name);
      answered.add(name);
    }

    /* ⚠️ ON A BLOCK STEP IT IS A WORD WITH NO MEANING. "Ask this even when it
       arrived filled" is a statement about fields, and a block step has none —
       so it reads as a rule being applied and is applied to nothing. */
    if (step.always && !takes.length) {
      at("step_always_without_fields",
        `${of} insists on being asked and takes no fields — there is nothing that `
        + "could have arrived filled, so the rule reads as applying and applies to nothing");
    }

    /* --- when it applies ------------------------------------------------ */

    /*
      ⚠️ A `when` THAT NAMES NOTHING IS A STEP THAT IS ALWAYS THERE OR NEVER,
      AND WHICH ONE DEPENDS ON THE READER. Against an answer that cannot exist,
      `set` is false for ever and `unset` is true for ever — so the same typo
      either removes a question from every walk of the flow or makes a
      conditional one unconditional, and both draw perfectly.
    */
    if (step.when && !(step.when.field in write.input)) {
      at("when_field_unknown",
        `${of} applies when "${step.when.field}" — ${write.id} takes no such input, so `
        + "the condition is decided by a value that can never arrive");
    }
    /* ⚠️ AND A FLOW HAS NO RECORD AND NO ROW TO BE SOMEBODY'S — see `Value`. A
       story is unsaved answers on the way to making a thing; `here` reaches for a
       subject that does not exist yet, and reads as a condition being evaluated. */
    const against = step.when && "is" in step.when ? step.when.is
      : step.when && "isnt" in step.when ? step.when.isnt : undefined;
    if (against && "here" in against) {
      at("when_reaches_a_record",
        `${of} applies against "${against.here}" — a flow is answers on the way to `
        + "making something, so there is no record for it to be a value of");
    }

    /* --- what it says --------------------------------------------------- */

    const says = step.says;
    if (says?.as !== undefined) {
      for (const blank of blanksIn(says.as)) {
        if (!takes.includes(blank)) {
          at("says_blank_unknown",
            `${of} reads back "{${blank}}", which it does not ask for — the review would `
            + "print the braces, in the sentence somebody reads before committing");
        }
      }
    }
    if (says?.per !== undefined) {
      const only = takes.length === 1 ? write.input[takes[0] as string] : undefined;
      if (!only || only.kind !== "enum" || !only.values?.length) {
        at("says_per_not_a_set",
          `${of} reads back a sentence per value and does not ask for exactly one closed `
          + "set — there is nothing for the values to be values of");
      } else {
        for (const value of only.values) {
          if (!(value in says.per)) {
            at("says_per_incomplete",
              `${of} has no sentence for "${value}" — somebody choosing it reaches a review `
              + "with the fact they chose most deliberately silently missing from it");
          }
        }
      }
    }
  }

  /*
    ⚠️ AND WHAT THE FILL IS HANDED HAS TO BE SOMETHING SOMEBODY PUTS THERE. A
    source no step asks for and no block answers is a key that is never set — so
    the run happens, is charged for, and the model is asked to identify a product
    from an empty list of photographs. It answers; models always do.

    ⚠️ CHECKED AGAINST `answered` RATHER THAN `reached`, and the difference is the
    fill itself. `reached` includes what the fill WRITES, so a source that the
    fill also happens to output would satisfy a check against it — which is a
    fill fed by its own answer, i.e. by nothing, on the first and only run.
  */
  for (const [wants, from] of Object.entries(told.fills?.with ?? {})) {
    if (!fills || !(from in write.input) || answered.has(from)) continue;
    at("fills_given_unanswered",
      `hands ${fills.id} its "${wants}" from "${from}", which no step asks for and no `
      + "block answers — the run would be charged for and given nothing");
  }

  /*
    ⚠️ AND THE WHOLE FLOW HAS TO BE ABLE TO FINISH, WHICH IS THE ONE CHECK HERE
    THAT IS ABOUT THE FLOW RATHER THAN A STEP. A write's required input that no
    step asks for and no fill supplies is a flow somebody walks to the end and is
    refused by — with the refusal naming a field that was never on any screen, so
    there is nowhere to go and fix it.
  */
  for (const [name, spec] of Object.entries(write.input)) {
    if (!spec.required || reached.has(name)) continue;
    at("story_cannot_finish",
      `${write.id} requires "${name}" and no step asks for it — every walk of this flow `
      + "ends in a refusal naming a field that was never on a screen");
  }

  return out;
}

/**
 * WHETHER A STEP APPLIES, GIVEN WHAT HAS BEEN ANSWERED SO FAR.
 *
 * ⚠️ HERE RATHER THAN IN THE RENDERER, BECAUSE BOTH ENDS ASK IT AND THEY MUST
 * AGREE. The browser decides which questions to draw; the guard decides whether a
 * required field is reachable. Two implementations of "does this step apply" is
 * how a flow comes to skip a step the checker counted on — and the failure is a
 * refusal at the last press naming a field nobody was asked for.
 *
 * ⚠️ NO CONDITION MEANS IT APPLIES, which is the only sane default: a step whose
 * `when` was left off is a question the author wanted asked.
 *
 * ⚠️ AND `here` IS FALSE RATHER THAN THROWN. `when_reaches_a_record` refuses it
 * at composition, so arriving here means a manifest that never composed; a step
 * that quietly does not apply is a better end than a white screen.
 */
export const stepApplies = (
  when: Match | undefined,
  held: Readonly<Record<string, unknown>>,
): boolean => {
  if (!when) return true;
  const value = held[when.field];
  /* ⚠️ AN EMPTY STRING IS UNSET, and that is not a shortcut. Every control in
     the field renderer clears to `""` rather than to `undefined`, so a step
     conditioned on `set` would stay live over a box somebody emptied — which is
     the state they emptied it to leave. */
  const there = value !== undefined && value !== null && value !== "";
  if ("set" in when) return there;
  if ("unset" in when) return !there;
  const want = "is" in when ? when.is : when.isnt;
  if ("here" in want) return false;
  const same = value === want.literal;
  return "is" in when ? same : !same;
};

/**
 * A CONDITION IN WORDS, FOR A READER RATHER THAN A RUNTIME.
 *
 * ⚠️ IT EXISTS BECAUSE A `Match` IS AN OBJECT AND SOMETHING PRINTS IT. The agent
 * door appends a flow's questions to the tool's description so a model is told
 * the reasoning the screen already encodes — and a condition interpolated raw is
 * `[object Object]`, which is not a degraded sentence but a wrong one: the agent
 * reads it as a question that is always asked, and the guard the flow expresses
 * is gone from its account of itself. It typechecks, because everything
 * interpolates.
 *
 * ⚠️ AND `here` SAYS WHAT IT POINTS AT RATHER THAN GUESSING AT A VALUE. A step
 * may not reach a record — `when_reaches_a_record` refuses it — so this only ever
 * has to be honest about a manifest that never composed.
 */
export const saidWhen = (when: Match): string => {
  if ("set" in when) return `${when.field} is set`;
  if ("unset" in when) return `${when.field} is not set`;
  const want = "is" in when ? when.is : when.isnt;
  const said = "here" in want
    ? (want.here === "me" ? "you" : "this record")
    : String(want.literal);
  return `${when.field} is ${"is" in when ? "" : "not "}${said}`;
};

/**
 * THE STEPS SOMEBODY IS ACTUALLY ASKED, IN ORDER.
 *
 * ⚠️ TWO REASONS A STEP IS NOT ASKED AND THEY ARE DIFFERENT. `when` says it does
 * not APPLY — it is out of the flow, out of the count, out of the review. Filled
 * says it does apply and the answer already ARRIVED, so it is out of the
 * questions and INTO the review, where a press on its clause opens it. Collapsing
 * the two would either hide what a model wrote from the person confirming it, or
 * put a question in front of them about something that does not apply.
 *
 * ⚠️ AND `always` OVERRIDES ONLY THE SECOND. A step that does not apply is not
 * asked however insistent its declaration — `always` is about confirming versus
 * deciding, and a decision that does not arise is not a decision.
 */
export const askedOf = <S extends {
  readonly id: string; readonly takes?: readonly string[];
  readonly always?: true; readonly when?: Match;
}>(
  steps: readonly S[],
  held: Readonly<Record<string, unknown>>,
  filled: ReadonlySet<string>,
): readonly S[] => steps.filter((step) => {
  if (!stepApplies(step.when, held)) return false;
  if (step.always) return true;
  const takes = step.takes ?? [];
  /* ⚠️ A BLOCK STEP IS NEVER FILLED, because what fills a flow is an operation's
     output and a block is how somebody DOES something — photographs a box, builds
     a ladder. Skipping it because a name arrived would remove the step that was
     going to produce the photographs. */
  if (!takes.length) return true;
  /* ⚠️ EVERY FIELD, NOT ANY. A step asking a name and a brand where only the
     name arrived still has a question to ask, and dropping it would leave the
     brand unanswerable except through the review. */
  return !takes.every((name) => filled.has(name));
});
