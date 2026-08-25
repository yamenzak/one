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
}

export interface Sort {
  readonly by: string;
  readonly dir: "up" | "down";
}

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
  | { readonly of: "words"; readonly says: string };

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
 * WHETHER A BLOCK IS DRAWN AT ALL — presence, and only presence.
 *
 * ⚠️ THIS IS THE `below.length ? … : null` EVERY HAND-WRITTEN SCREEN HAS, AND IT
 * IS THE ONLY CONDITIONAL A DECLARATION GETS. A section with nothing in it is a
 * heading over a gap, so the test has to exist; an equality or a comparison here
 * would be the same operator the view already refuses, in the place where it is
 * hardest to see.
 */
export type Presence =
  | { readonly has: Read }
  | { readonly empty: Read }
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
  readonly cols?: number;
  readonly rows?: number;
}

/**
 * ⚠️ FOUR COLUMNS IS THE CEILING AND IT IS A DESIGN DECISION, NOT A LIMITATION.
 * Past four, a declaration has stopped arranging and started placing pixels —
 * and the moment an author is placing pixels the block can no longer be
 * responsible for its own reflow, because somebody else is doing it for them.
 * A screen wanting twelve columns wants a different shape.
 */
export const COLS_MOST = 4;

export type Layout =
  | { readonly as: "stack" }
  | { readonly as: "grid"; readonly cols: number }
  /** ⚠️ `lead` is how many of the grid's columns the first block takes. */
  | { readonly as: "split"; readonly lead: number };

/**
 * ONE THING ON A SCREEN.
 *
 * ⚠️ `does` NAMES OPERATIONS RATHER THAN CARRYING HANDLERS, which is what keeps
 * this a declaration. A handler is code, and code in a manifest is the hatch
 * this whole design exists to avoid; an operation id is something the kernel
 * already checks, the permission gate already reads, and the agent surface
 * already exposes. What happens when it succeeds is the operation's business.
 */
export interface BlockSpec {
  /** ⚠️ A registered component — see `BlockEntry`. */
  readonly block: string;
  readonly label?: string;
  readonly span?: Span;
  readonly when?: Presence;
  readonly bind?: Readonly<Record<string, Binding>>;
  readonly does?: readonly string[];
}

/** A screen's body: what it is for, how it is arranged, and what is on it. */
export interface SurfaceSpec {
  readonly shape: ScreenShape;
  readonly layout: Layout;
  readonly blocks: readonly BlockSpec[];
}

/* --------------------------------------------------------- the block index --- */

/**
 * THE FOUR STATES EVERY BLOCK OWES, AND THE CALLER STOPS WIRING THEM.
 *
 * ⚠️ EACH OF THESE HAS SHIPPED AS A WRONG ANSWER WEARING A LOADING STATE'S
 * EXCUSE. An empty array rendered as "nothing here" while the request was still
 * in flight; a failed load rendered as "no media yet"; a control drawn for
 * somebody who could not press it. They are the caller's job today, which is
 * exactly the class of thing a caller forgets — so they move inside the block,
 * and a block that does not implement one cannot be registered.
 */
export type BlockState = "waiting" | "nothing" | "trouble" | "denied";

export const BLOCK_STATES: readonly BlockState[] = ["waiting", "nothing", "trouble", "denied"];

/**
 * WHAT ONE SLOT ON A BLOCK ACCEPTS.
 *
 * ⚠️ THE KINDS OF SOURCE, NOT A TYPE. A list block's rows slot takes a `view`
 * and nothing else; a heading takes a `field` or `words`. Saying so is what
 * turns "bound a single record to a list" from a blank screen into a refusal.
 */
export interface SlotSpec {
  readonly label: string;
  readonly takes: readonly Read["of"][];
  readonly required?: boolean;
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
  readonly states: readonly BlockState[];
}

export type BlockIndex = Readonly<Record<string, BlockEntry>>;

/* --------------------------------------------------------------- refusals --- */

export type SurfaceRefusal =
  | "not_a_name" | "view_unknown" | "view_collection_unknown" | "view_field_unknown"
  | "block_unknown" | "slot_unknown" | "slot_missing" | "slot_kind_wrong"
  | "field_unknown" | "field_without_a_subject" | "format_wrong"
  | "span_overflows" | "span_without_a_grid" | "grid_too_wide"
  | "state_missing" | "operation_unknown" | "nothing_on_it";

export interface SurfaceProblem {
  readonly of: string;
  readonly why: SurfaceRefusal;
  readonly detail: string;
}

/** How many columns a layout has to hand out. */
export const colsOf = (layout: Layout): number =>
  layout.as === "grid" ? layout.cols : layout.as === "split" ? COLS_MOST : 1;

/**
 * Every view a body reads, however deeply it is named.
 *
 * ⚠️ WALKED RATHER THAN LISTED, because a view named only inside a `when` is
 * still a view — and a check reading `bind` alone would report a screen as
 * sound while its one conditional pointed at nothing.
 */
export const viewsIn = (body: SurfaceSpec): readonly string[] => {
  const out: string[] = [];
  const fromSource = (s: Read) => {
    if (s.of === "view" || s.of === "count") out.push(s.view);
  };
  const fromPresence = (p: Presence) => {
    if ("not" in p) return fromPresence(p.not);
    fromSource("has" in p ? p.has : p.empty);
  };
  for (const b of body.blocks) {
    if (b.when) fromPresence(b.when);
    for (const bind of Object.values(b.bind ?? {})) fromSource(bind.from);
  }
  return out;
};

/** Every `field` source a body reads — all of them off the screen's subject. */
export const fieldsIn = (body: SurfaceSpec): readonly string[] => {
  const out: string[] = [];
  const fromSource = (s: Read) => { if (s.of === "field") out.push(s.field); };
  const fromPresence = (p: Presence) => {
    if ("not" in p) return fromPresence(p.not);
    fromSource("has" in p ? p.has : p.empty);
  };
  for (const b of body.blocks) {
    if (b.when) fromPresence(b.when);
    for (const bind of Object.values(b.bind ?? {})) fromSource(bind.from);
  }
  return out;
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

  const known = (name: string) => name in held.fields;
  for (const m of spec.where ?? []) {
    if (!known(m.field)) {
      at("view_field_unknown", `narrows on "${m.field}", which ${held.id} does not have`);
    }
  }
  if (spec.sort && !known(spec.sort.by)) {
    at("view_field_unknown", `sorts by "${spec.sort.by}", which ${held.id} does not have`);
  }

  return out;
}

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
  screen: { readonly id: string; readonly of?: string; readonly body?: SurfaceSpec },
  index: BlockIndex,
  views: readonly ViewSpec[],
  collections: readonly CollectionSpec[],
  operations: readonly string[],
): readonly SurfaceProblem[] {
  const body = screen.body;
  if (!body) return [];

  const out: SurfaceProblem[] = [];
  const at = (why: SurfaceRefusal, detail: string) =>
    out.push({ of: `screen ${screen.id}`, why, detail });

  /* --- the layout ------------------------------------------------------- */

  if (body.layout.as === "grid" && (body.layout.cols < 2 || body.layout.cols > COLS_MOST)) {
    at("grid_too_wide",
      `a grid of ${body.layout.cols} — two to ${COLS_MOST} columns is arranging, and more `
      + `than that is placing pixels a block can no longer reflow inside`);
  }
  if (body.layout.as === "split" && (body.layout.lead < 1 || body.layout.lead >= COLS_MOST)) {
    at("span_overflows", `a split leading with ${body.layout.lead} of ${COLS_MOST} columns leaves nothing beside it`);
  }
  if (body.blocks.length === 0) {
    at("nothing_on_it", "declares a body with no blocks in it, which draws a title over an empty page");
  }

  const cols = colsOf(body.layout);

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
    if (!FIELD_NAME.test(name)) {
      at("not_a_name", `binds "${name}", which is not a field name`);
    } else if (!screen.of) {
      at("field_without_a_subject",
        `binds the field "${name}" and names no \`of\` — there is no record for it to be a field of`);
    } else if (subject && !(name in subject)) {
      at("field_unknown", `binds "${name}", which ${screen.of} does not have`);
    }
  }

  /* --- the views -------------------------------------------------------- */

  const byId = new Map(views.map((v) => [v.id, v]));
  for (const name of viewsIn(body)) {
    if (!byId.has(name)) at("view_unknown", `reads the view "${name}", which this app does not declare`);
  }

  /* --- the blocks ------------------------------------------------------- */

  for (const b of body.blocks) {
    const where = `${screen.id} · ${b.block}`;
    const entry = index[b.block];
    if (!entry) {
      at("block_unknown", `${where}: no such block — nothing in the design package registers it`);
      continue;
    }

    for (const state of BLOCK_STATES) {
      if (!entry.states.includes(state)) {
        at("state_missing", `${where} has no "${state}" state, so a screen using it can be caught without one`);
      }
    }

    if (b.span && body.layout.as === "stack") {
      at("span_without_a_grid", `${where} asks for ${b.span.cols ?? 1} columns on a stack, which has one`);
    }
    if (b.span?.cols && b.span.cols > cols) {
      at("span_overflows", `${where} asks for ${b.span.cols} of ${cols} columns`);
    }

    for (const op of b.does ?? []) {
      if (!operations.includes(op)) {
        at("operation_unknown", `${where} offers "${op}", which is not an operation this app declares`);
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
