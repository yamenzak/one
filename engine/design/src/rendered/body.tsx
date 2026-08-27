/**
 * A SCREEN DRAWN FROM WHAT IT DECLARES.
 *
 * ⚠️ THIS IS THE GENERALISATION OF THE ELEVEN SURFACES BESIDE IT, NOT A NEW
 * IDEA. `settings.tsx` already draws every declared setting, `legal.tsx` every
 * declared document, `guide.tsx` every declared milestone — each one a renderer
 * over one kind of declaration. What was missing is the general case: a screen
 * whose blocks, layout and bindings are the declaration.
 *
 * ⚠️ AND IT PLACES BLOCKS, IT DOES NOT DRAW THEM. Every component here comes out
 * of `PARTS`, which is the design package's half of the registry the kernel
 * carries. The renderer decides WHERE a block goes, WHETHER it goes, WHAT it is
 * given, and WHAT HAPPENS around it while its data is in flight — and nothing
 * about what any of them looks like, because that is the block's own answer and
 * is the same answer in every app.
 *
 * ⚠️ THE FOUR OUTCOMES ARE DRAWN HERE, ONCE, AROUND EVERY BLOCK. That is stage
 * 93's whole point: waiting, nothing, trouble and denied built into forty
 * components would be thirty-nine copies of one decision. A block whose binding
 * reads a view waits on that view; one that only reads the record it is about is
 * ready the moment the screen is.
 *
 * ⚠️ A SLOT NAME IS A PROP NAME AND THE JOIN IS GUARDED. `vocabulary.test.mjs`
 * refuses a registry entry naming a slot its component does not take, because
 * React drops an unknown prop without a word: the manifest would compose, the
 * screen would mount, and the region would be blank. Twenty-three of forty
 * entries were wrong that way when this file was written.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import type {
  Binding, BlockSpec, Column, Fields, Format, GroupSpec, GuideBook, Layout, MilestoneBook, Placed,
  Presence, Raised, Read, SurfaceSpec, Viewed,
} from "@engine/kernel";
import { BLOCKS, goOf, isGroup, opOf, opensOn, reached, remaining } from "@engine/kernel";
import { Arranged, spanning } from "../parts/arrange.js";
import { Group, QuickActions } from "../parts/surfaces.js";
import { Region, ready, type Loaded } from "../parts/state.js";
import { Lookup, Segmented } from "../parts/forms.js";
/* ⚠️ THE SAME VERDICTS `Screen.does` READS — see `Placed`. A second opinion
   about access is how a product comes to offer a button that answers 403. */
import { sayGate, useGate } from "../parts/gated.js";
import { SPACE } from "../tokens/metrics.js";
import { Num, Size, Unit, When } from "../parts/said.js";
import { Money } from "../parts/surfaces.js";
import { Tally } from "../parts/tally.js";
import { PARTS } from "./parts.js";
import { Edit, type Refusal } from "./edit.js";
import { PutAside } from "../parts/aside.js";
import { Lead, Resuming } from "../chart/figures.js";
import { glyphOf } from "../frame/shell.js";

/* ------------------------------------------------------------ what it has --- */

/**
 * WHAT A BODY IS DRAWN AGAINST.
 *
 * ⚠️ `views` HOLDS OUTCOMES, NOT ROWS, which is what lets the frame own the four
 * states. A caller handing over rows has already decided that waiting is over,
 * and the only thing it can then say about a request still in flight is an empty
 * array — which is the exact fault `Region` exists to make impossible.
 */
export interface Has {
  /** The record this screen is about, where it is about one. */
  readonly record?: Readonly<Record<string, unknown>> | undefined;
  /**
   * Every view the app declared, by id, as an outcome.
   *
   * ⚠️ THE WHOLE `Viewed`, NOT THE ROWS. A view carries a `limit`, so
   * `items.length` is the ceiling rather than the total — and `count` is a
   * binding a block can be pointed at. Handing over rows alone made every
   * `count` in every product a number that stops rising at the cap, silently,
   * with the true figure already fetched and thrown away one function earlier.
   */
  readonly views: Readonly<Record<string, Loaded<Viewed>>>;
  /**
   * Where a `goes` leads — the screen's ID, and the record it is about.
   *
   * ⚠️ AN ID RATHER THAN A ROUTE, because that is what the declaration says and
   * what the kernel checks. Turning it into an address is the shell's business:
   * a route written in a manifest would be a second spelling of one the manifest
   * already holds, and the two drift the first time a screen moves.
   *
   * ⚠️ AND THE RECORD IS THE SECOND HALF. A list row leads to the thing the row
   * is about; without it the destination opens with no subject, which draws its
   * own empty state over a record that is right there.
   */
  readonly onGo?: ((screen: string, record?: string) => void) | undefined;
  /** What a `does` runs. */
  readonly onDo?: ((operation: string) => void) | undefined;
  /**
   * ⚠️ THE WORKSPACE'S CURRENCY, WHICH A DECLARATION CANNOT KNOW AND MUST NOT
   * GUESS. `money` says the number is minor units; which currency's minor units
   * is a fact about the workspace, and a default here would draw one workspace's
   * prices in another's symbol — right to the penny and wrong by a factor.
   */
  readonly currency?: string | undefined;
  /**
   * CHANGING ONE FACT FROM THE ROW SHOWING IT — see `BlockSpec.edits`.
   *
   * ⚠️ THE DECLARATION AND THE WRITE, WHICH IS EVERYTHING `Edit` NEEDS AND
   * NOTHING MORE. The sheet is drawn from the field's own spec — its control,
   * its help, its option names, its bounds — so a flag saying "this is editable"
   * would leave the renderer holding a pencil and no way to draw what it opens.
   *
   * ⚠️ AND ITS ABSENCE IS THE ANSWER TO "MAY THEY". The door leaves `fields`
   * empty for somebody whose role cannot write, so no pencil is drawn — never a
   * disabled one, which invites somebody to go looking for how to enable it, and
   * never one that opens onto a Save the door refuses, which is worse because
   * they type the correction first.
   */
  readonly edits?: {
    readonly fields: Fields;
    readonly onSave: (field: string, value: unknown) => Promise<Refusal>;
  } | undefined;
  /**
   * THE TWO WAYS THIS RECORD LEAVES — see `Leaving`.
   *
   * ⚠️ THE DOOR'S ANSWER, NOT A DECLARATION. Every detail screen has the same
   * two, so the manifest says nothing about them; what the browser cannot work
   * out is the collection's own word, what this record is called, and whether
   * the collection has a delete at all.
   *
   * ⚠️ AND `null` COVERS THREE TRUE THINGS WITH ONE ABSENCE: no record, not
   * arrived, or may not write. All three end in nothing to press.
   */
  readonly aside?: {
    readonly of: string;
    readonly name: string;
    readonly bin: boolean;
    readonly already: "frozen" | "binned" | null;
  } | undefined;
  /** ⚠️ What the confirmed sheet runs — see `Leaving`. */
  readonly onAside?: ((how: "frozen" | "binned") => void) | undefined;
  /**
   * WHAT THE SCREEN IS NARROWED TO, BY PICK ID — see `PickSpec`.
   *
   * ⚠️ HELD BY THE CALLER RATHER THAN BY THIS COMPONENT, because changing it is a
   * REFETCH. The narrowing reaches an asked view's input on the worker, so a
   * value kept here would move a control and leave the rows it filters exactly
   * where they were — which is the "control that narrows nothing" the kernel
   * refuses one shape earlier.
   */
  readonly picked?: Readonly<Record<string, string>> | undefined;
  /** ⚠️ The rows a collection-backed narrowing offers — see `Drawn.picks`. */
  readonly picks?: Readonly<Record<string, readonly { id: string; label: string }[]>> | undefined;
  readonly onPick?: ((id: string, value: string) => void) | undefined;
  /**
   * WHAT A SHORTCUT LOOKS LIKE — the screen's own label and mark, by id.
   *
   * ⚠️ RESOLVED BY THE CALLER, WHICH IS WHERE THE MANIFEST IS. A declaration
   * names screens (`BlockSpec.leads`) and never their words; this is the lookup
   * that turns one into the other, so a renamed screen renames its shortcut and
   * the bar item and the tile cannot say different things about one place.
   *
   * ⚠️ AND `undefined` FOR A SCREEN THIS PERSON MAY NOT OPEN, so the tile is
   * dropped rather than drawn. A shortcut to a refusal is a promise the product
   * does not keep — the nav already filters itself on the same question.
   */
  readonly named?:
  ((screen: string) => { readonly label: string; readonly icon?: string } | undefined) | undefined;
  /**
   * THE CHECKLIST AND THE MILESTONES — the app's own books, and how far this
   * workspace has got. See `BlockEntry.book`.
   *
   * ⚠️ `raised` IS `null` UNTIL IT IS KNOWN, AND THAT IS NOT "NOTHING DONE".
   * Both arrive as empty lists from a screen whose answer has not landed, and a
   * checklist cannot tell them apart — so it draws every step unticked under a
   * confident "0 of 3 done" on a workspace that may be two thirds finished.
   */
  readonly book?: {
    readonly guide: GuideBook;
    readonly milestones: MilestoneBook;
    readonly raised: Raised | null;
    readonly counts: Readonly<Record<string, number>>;
    /** ⚠️ Which congratulations have already been said. Repeated is not said. */
    readonly already: readonly string[];
    readonly held: ReadonlySet<string>;
    /**
     * ⚠️ A ROUTE, NOT A SCREEN ID, WHICH IS WHY IT IS NOT `Has.onGo`. A guide
     * step's `link` is written in the declaration as an address — it may point
     * outside the product, at the workspace's own settings — so it is the one
     * destination in this file that is not a screen this app declares.
     */
    readonly onGo: (route: string) => void;
  } | undefined;
}

/* ------------------------------------------------------------- the values --- */

/**
 * ⚠️ ONE FORMATTER PER `Format`, AND THE SET IS CLOSED IN THE KERNEL. A screen
 * cannot reach past this: `present.test.mjs` refuses a value formatted anywhere
 * but here, and the declaration cannot even name a format that is not one of
 * seven. That is the guard's `refused: format_wrong` answer made good.
 */
const DRAWN: Record<Format, (v: unknown, has: Has) => React.ReactNode> = {
  /*
    ⚠️ `plain` IS `String(v)` WITH ONE EXCEPTION, AND THE EXCEPTION IS NOT A
    FORMATTER. `String(true)` is "true", which is programmer output: a column
    headed "Blind" reading `true` / `false` down a stockroom screen is the
    stored value shown to somebody who has never seen a boolean. Yes and no are
    what that value MEANS in English, and there is no second reasonable reading
    of it — which is why this is here rather than an eighth `Format`. A screen
    wanting different words wants a different value, and the place to compute
    one is the collection.
  */
  plain: (v) => (v === null || v === undefined
    ? null
    : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)),
  num: (v) => <Num value={Number(v)} />,
  /* ⚠️ NO CURRENCY, NO PRICE. Drawing the number bare would read as a quantity;
     drawing it in a guessed currency reads as a price and is a different one. */
  money: (v, has) => (has.currency
    ? <Money minor={Number(v)} currency={has.currency} />
    : null),
  when: (v) => <When at={String(v)} />,
  size: (v) => <Size bytes={Number(v)} />,
  unit: (v) => <Unit of={String(v)} />,
  tally: (v) => <Tally value={Number(v)} />,
};

/**
 * WHAT A PHONE ROW CARRIES AT ITS END — see the fold in `Listing`.
 *
 * ⚠️ THE END SLOT HAS NO HEADING OVER IT, WHICH CHANGES WHAT A BOOLEAN MEANS
 * THERE. In the table half a column sits under its own label and "Yes" is
 * exactly right — `DRAWN.plain` records why at length. Folded into a row the
 * label is gone, so `/counts` read "B1 · 2026-08-24 · Yes": a word answering a
 * question the row does not ask, and one nobody can resolve without opening the
 * session to find out what was being asked.
 *
 * ⚠️ SO A BOOLEAN AT THE END MARKS THE EXCEPTION AND SAYS NOTHING OTHERWISE. The
 * column's own name is the answer when the value is true — a blind count reads
 * "Blind" — and a false one draws nothing at all, because half a list ending in
 * "No" is a column of noise about the ordinary case. The declaration already
 * holds the word; the fold was throwing it away.
 *
 * ⚠️ AND ONLY A BOOLEAN. Every other value is said the way the table says it, by
 * the same formatter, because a number folded into a row is still a number.
 */
const endOf = (col: Column, row: Readonly<Record<string, unknown>>, has: Has) =>
  (typeof row[col.field] === "boolean"
    ? (row[col.field] ? col.label : null)
    : DRAWN[col.as ?? "plain"](row[col.field], has));

const rowsOf = (has: Has, view: string) => {
  const held = has.views[view];
  return held?.status === "ready" ? held.data.items : undefined;
};

/* ⚠️ ONE FIELD OFF THE FIRST ROW, AND `undefined` OVER NO ROWS — see the `first`
   source. A workspace with nothing in it has no first row, and that is a
   truthful absence rather than a blank: what reads it draws the app's own
   sentence about emptiness instead of an untitled card. */
const firstOf = (has: Has, view: string, field: string) =>
  rowsOf(has, view)?.[0]?.[field];

/* ⚠️ THE VIEW'S OWN COUNT, NOT THE LENGTH OF WHAT CAME BACK — see `Has.views`.
   A view is bounded, so counting the rows in hand answers the limit. */
const countOf = (has: Has, view: string) => {
  const held = has.views[view];
  return held?.status === "ready" ? held.data.count : undefined;
};

/**
 * WHAT ONE BINDING RESOLVES TO.
 *
 * ⚠️ `words` IS A VALUE LIKE ANY OTHER, and that is what stops a declaration
 * needing an escape hatch for a fixed label. "Sold this week" is not a field on
 * anything; without a source that says so, a body would have to accept a raw
 * string somewhere, and a raw string somewhere is where markup comes back.
 */
const valueOf = (read: Read, has: Has): unknown => {
  switch (read.of) {
    case "words": return read.says;
    case "field": return has.record?.[read.field];
    case "subject": return has.record;
    case "view": return rowsOf(has, read.view);
    case "count": return countOf(has, read.view);
    /* ⚠️ A PROJECTION OF SOMETHING ALREADY FETCHED — see `Read`. An empty view
       reads as nothing, and the block draws its own empty state rather than a
       zero the workspace never earned. */
    case "first": return rowsOf(has, read.view)?.[0]?.[read.field];
  }
};

const drawn = (binding: Binding, has: Has): unknown => {
  const value = valueOf(binding.from, has);
  /* ⚠️ A VIEW AND A SUBJECT GO THROUGH UNFORMATTED, because they are not a
     figure — a formatter over a list of rows is a category error, and the
     kernel's `FORMATS` has no entry that would accept one. */
  if (binding.from.of === "view" || binding.from.of === "subject") return value;
  if (value === undefined || value === null) return undefined;
  return DRAWN[binding.as ?? "plain"](value, has);
};

/* -------------------------------------------------------------- whether --- */

/**
 * ⚠️ ONE WALK, AND IT IS THE SAME ONE `readsIn` USES. Two implementations of
 * "what does this condition depend on" is how a new arm gets added to one and
 * missed by the other — which nearly happened to `is`/`one` in the kernel, and
 * is why that file has one walk too.
 */
const holds = (when: Presence, has: Has): boolean => {
  if ("not" in when) return !holds(when.not, has);
  if ("one" in when) {
    const v = valueOf(when.is, has);
    return typeof v === "string" && when.one.includes(v);
  }
  const read = "has" in when ? when.has : when.empty;
  const v = valueOf(read, has);
  const there = Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";
  return "has" in when ? there : !there;
};

/* --------------------------------------------------------------- a block --- */

/**
 * ⚠️ A BLOCK WAITS ON WHAT IT READS AND NOTHING ELSE. A screen that joined every
 * block to one outcome would hold a heading and a note — neither of which is
 * fetched — behind the slowest list on the page, which is the "whole screen is a
 * skeleton" pattern this vocabulary replaced.
 */
const outcomeFor = (block: BlockSpec, has: Has): Loaded<true> => {
  for (const binding of Object.values(block.bind ?? {})) {
    const from = binding.from;
    if (from.of !== "view" && from.of !== "count") continue;
    const held = has.views[from.view];
    if (!held) continue;
    if (held.status !== "ready") return held as Loaded<true>;
  }
  return ready(true);
};

/**
 * ⚠️ EMPTINESS IS THE VIEW'S, NOT THE BLOCK'S. A block bound to a list is empty
 * when the list is; one bound to fields is never empty, because a record that is
 * there has its fields. Asking the question of a `FieldRow` would put "nothing
 * here" under a label whose value is legitimately blank.
 */
const isNothing = (block: BlockSpec, has: Has): boolean => {
  for (const binding of Object.values(block.bind ?? {})) {
    if (binding.from.of !== "view") continue;
    const rows = rowsOf(has, binding.from.view);
    if (rows && rows.length === 0) return true;
  }
  return false;
};

/**
 * A ROW WITH A WAY TO CHANGE WHAT IT SAYS — the pencil, and the sheet behind it.
 *
 * ⚠️ THE OPEN STATE IS PER ROW AND HAS TO BE, which is the whole reason this is
 * a component rather than three lines in `Placed`. A screen has eight of these
 * on it; one flag held above them would open eight sheets, or — worse — one
 * sheet about whichever field the shared state was last set to, which is the
 * "confirmation about whichever row they think is selected" fault one drawer
 * over.
 *
 * ⚠️ AND IT WRAPS RATHER THAN REPLACES, so the row is still the registry's
 * component drawn from the registry's slots. Drawing a `FieldRow` here would be
 * a second answer to what a row looks like, living in the renderer, and the two
 * would drift the first time one of them was styled.
 */
function Editable({ field, has, then }: {
  readonly field: string;
  readonly has: Has;
  readonly then: (onEdit: (() => void) | undefined) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const spec = has.edits?.fields[field];
  const value = has.record?.[field];

  /* ⚠️ NO SPEC, NO RECORD, NO PENCIL — and each absence is a different true
     thing. The field may not be one this person can write, or the record may not
     have arrived: opening a sheet over either draws a control with nothing in it
     and saves that nothing over what is stored. */
  if (!spec || !has.record) return <>{then(undefined)}</>;

  return (
    <>
      {then(() => setOpen(true))}
      <Edit
        spec={spec}
        name={field}
        value={value}
        open={open}
        onOpen={setOpen}
        onSave={(next) => has.edits!.onSave(field, next)}
      />
    </>
  );
}

function Placed({ block, has }: { readonly block: BlockSpec; readonly has: Has }) {
  const entry = BLOCKS[block.block];
  /* ⚠️ CAST AT THE ONE PLACE THE NAME BECOMES A COMPONENT. Thirty components
     have thirty prop types and their union is not callable; what makes a binding
     safe is the kernel refusing an unknown slot and the guard refusing a slot
     that is not a prop, both of which happen before this line. */
  const Part = PARTS[block.block] as React.ComponentType<Record<string, unknown>> | undefined;
  /* ⚠️ Both halves are guarded — `vocabulary.test.mjs` refuses an entry with no
     component and a component in no registry — so this is the belt on a screen
     that got past composition anyway, and it draws nothing rather than throwing. */
  if (!entry || !Part) return null;

  const props: Record<string, unknown> = {};
  let children: React.ReactNode = null;
  /* ⚠️ A SLOT THAT TAKES THE WHOLE OUTCOME MEANS THE BLOCK OWNS ITS OWN WAITING
     — see `SlotSpec.whole`. The frame still asks the gate; what it stops doing
     is drawing a generic skeleton in front of a specific one. */
  let owns = false;
  for (const [slot, binding] of Object.entries(block.bind ?? {})) {
    const spec = entry.takes[slot];
    if (spec?.whole && binding.from.of === "view") {
      owns = true;
      /* ⚠️ THE ROWS, NOT THE `Viewed`. A list block pages over what it holds, so
         a total beside them is not a prop it has — the total reaches a screen as
         a `count` binding on a block that draws a figure. Handing the wrapper
         through would put `{items, count}` where an array belongs and draw a
         table of one row that is an object. */
      const got = has.views[binding.from.view];
      props[slot] = got === undefined
        ? ready([])
        : got.status === "ready" ? ready(got.data.items) : got;
      /* ⚠️ AND THE EMPTY SENTENCE GOES WITH IT, because the block that owns its
         waiting owns its emptiness too — `Region` is not the one drawing it. */
      if (block.nothing) {
        props["says"] = {
          nothing: block.nothing.says,
          ...(block.nothing.under ? { under: block.nothing.under } : {}),
        };
      }
      continue;
    }
    /*
      ⚠️ A CHART'S DATA IS A PROJECTION AND NOT THE ROWS — see `PlotSpec`. Both
      charts declare their own shape (`Series[]` of points, `Datum[]` of labelled
      values) and the rows went in untouched, so every declared chart drew an
      empty box under a correct heading. The kernel has already refused a `plots`
      naming a field the collection has not got, so this maps rather than checks.
    */
    if (entry.plots && block.plots && binding.from.of === "view") {
      const rows = rowsOf(has, binding.from.view) ?? [];
      const plots = block.plots;
      props[slot] = entry.plots === "labelled"
        ? rows.map((row) => ({
          label: String(row[plots.along ?? ""] ?? ""), value: Number(row[plots.of] ?? 0),
        }))
        /* ⚠️ ONE SERIES, AND ITS x IS THE POSITION. A line draws a run in the
           order the view answered; a date on the axis is not something this
           chart draws, which is why `along` is not asked for. */
        : [{
          id: plots.of,
          label: block.label ?? plots.of,
          subject: true,
          points: rows.map((row, i) => ({ x: i, y: Number(row[plots.of] ?? 0) })),
        }];
      continue;
    }
    const value = drawn(binding, has);
    if (slot === "children") children = value as React.ReactNode;
    /* ⚠️ A GLYPH SLOT'S WORDS ARE A NAME AND THE PROP IS A DRAWN MARK — see
       `SlotSpec.glyph`. The registry says which; matching the slot's own name
       here would put a list of prop names back in the renderer, and the second
       block to call its mark something else would silently stop converting. */
    else if (spec?.glyph) props[slot] = value === undefined ? undefined : glyphOf(String(value));
    else props[slot] = value;
  }
  if (block.label !== undefined && !("label" in props)) props["label"] = block.label;
  /* ⚠️ COLUMNS ARE A PROJECTION, NOT A BINDING — see `BlockSpec.shows`. `at` is
     the accessor the grid calls per row; the kernel has already refused a field
     the collection does not have, so this reads rather than checks. */
  if (block.shows?.length) {
    /*
      ⚠️ A COLUMN OF NUMBERS IS RIGHT-ALIGNED AND TABULAR, AND NOTHING IN THE
      DECLARATION SAYS SO. `Col.num` is what makes a quantity column comparable
      down the page — a ragged left-aligned column of 1200, 4 and 137 is three
      numbers nobody can weigh against each other, which on an inventory's list
      is the whole reason the column is there.

      ⚠️ AND IT IS READ OFF THE ROWS RATHER THAN ASKED FOR. The collection
      already declares the field's kind, so a `numeric` in `shows` would be a second
      answer to a question already settled — and the first list where the two
      disagree is a screen the author is sure is right. What reaches the browser
      is what the door answered with, and a number column arrives as numbers.

      ⚠️ THE FIRST ROW THAT HAS A VALUE, NOT THE FIRST ROW. A blank cell in the
      top row is ordinary — a product with no brand, a line never counted — and
      deciding the whole column's alignment on it would left-align a column of
      figures because one of them was missing.
    */
    const seen = block.bind?.["of"]?.from.of === "view"
      ? rowsOf(has, block.bind["of"].from.view) ?? []
      : [];
    const figures = (field: string) =>
      typeof seen.find((row) => row[field] !== undefined && row[field] !== null)?.[field]
        === "number";
    props["cols"] = block.shows.map((col) => ({
      id: col.field,
      label: col.label,
      ...(figures(col.field) ? { numeric: true } : {}),
      /* ⚠️ THE SAME FORMATTERS A BINDING PICKS FROM — see `Column.as`. Without
         one a timestamp column is twenty characters of ISO on every row, which
         is the column that exists to say whether a number is stale saying
         nothing at all. */
      cell: (row: Readonly<Record<string, unknown>>) =>
        DRAWN[col.as ?? "plain"](row[col.field], has),
    }));
    props["rowKey"] = (row: Readonly<Record<string, unknown>>, i: number) =>
      String(row["id"] ?? i);
    /*
      ⚠️ AND THE NARROW HALF, WHICH IS THE SAME COLUMNS READ DOWN. A listing is a
      table where there is room and rows where there is not, and the rows need a
      name, a second line and an end — so the first three columns become exactly
      that. Without it the phone half draws the row's ID, which is the fault
      `keys.test.mjs` is about with the declaration supplying the key.
    */
    const [first, second, third] = block.shows;
    /* ⚠️ AND THE NARROW HALF SAYS ITS VALUES THE SAME WAY — see `Column.as`.
       Applying a formatter to the columns alone left a phone showing the raw
       stored value of the very field a desk drew properly: one list, one
       declaration, two answers, and only the one nobody works on was right. */
    props["asRow"] = (row: Readonly<Record<string, unknown>>) => ({
      name: String(row[first!.field] ?? ""),
      ...(second ? { under: DRAWN[second.as ?? "plain"](row[second.field], has) } : {}),
      ...(third ? { aside: endOf(third, row, has) } : {}),
    });
  }
  /*
    ⚠️ AND THE ROW TRAVELS WITH IT. `Listing` hands its `onOpen` the row that was
    pressed, and this threw it away — so every row on every declared list opened
    the destination screen with no record, which draws the list it was pressed
    from or a not-found. The row is right there; losing it is the "row that leads
    nowhere" fault `goes` exists to prevent, one seam further along.
  */
  if (block.goes && has.onGo) {
    /* ⚠️ THE FIELD THE DECLARATION NAMED, OR `id` — see `GoSpec`. A row about a
       delivery leads to the product it is of, and the id for that is in another
       column. */
    const go = goOf(block.goes);
    props["onOpen"] = (row?: Readonly<Record<string, unknown>>) => {
      /* ⚠️ THE ROW IF THERE IS ONE, THE SCREEN'S OWN SUBJECT OTHERWISE. A list
         row leads to the thing the row is about; a row on a detail screen leads
         to another view of the record already open, and both are "the record
         this control is about". */
      const of = row && typeof row === "object" ? row : has.record;
      const id = of ? String(of[go.by ?? "id"] ?? "") : "";
      has.onGo?.(go.to, id || undefined);
    };
  }
  /* ⚠️ `does` IS A LIST AND THE FIRST IS THE ROW'S OWN ACT. A row draws one
     control; the rest of the list is what a screen offers ELSEWHERE about the
     same thing, which is the shape `ActionRow` and the crown share. Handing all
     of them to one press would run several operations from one tap. */
  /*
    ⚠️ A ROW OF SHORTCUTS, EACH WEARING THE SCREEN'S OWN WORDS — see
    `BlockSpec.leads`. The declaration names screens and nothing else; the label
    and the mark come from the manifest, so a renamed screen renames its shortcut
    and the bar item and the tile cannot disagree about one place.

    ⚠️ AND ONE THIS PERSON MAY NOT OPEN IS DROPPED. `named` answers `undefined`
    for a screen behind a grant they do not hold, which is the same question the
    nav already asks of itself.
  */
  if (block.leads?.length) {
    const on = block.leads
      .map((to) => {
        const said = has.named?.(to);
        if (!said) return null;
        return {
          id: to,
          label: said.label,
          /* ⚠️ THE NODE, NOT THE NAME — see `glyphOf`. A manifest names its mark
             as a string and every component that takes one takes a `ReactNode`,
             so passing it through renders the WORD in the circle a glyph should
             be in: `QuickActions` photographed with "add" set as text. React
             will not complain about a string where a node was wanted, because a
             string IS a node. `leadsOn` one screen below did this correctly and
             this did not, which is the whole argument for a shared resolver. */
          ...(said.icon ? { icon: glyphOf(said.icon) } : {}),
          onDo: () => has.onGo?.(to),
        };
      })
      .filter((one) => one !== null);
    /* ⚠️ ONE DESTINATION IS A DIFFERENT PROP, NOT A SHORTER ARRAY — see
       `BlockEntry.leads`. A tile takes `onOpen`; handing it the array would set a
       prop it does not take, and React drops an unknown prop without a word. The
       kernel has already refused a second entry, so `[0]` is the only one. */
    if (entry.leads === "one") {
      const one = on[0];
      if (one) props["onOpen"] = one.onDo;
    } else {
      props["actions"] = on;
    }
  }

  /*
    ⚠️ THE CHECKLIST'S SOURCE IS THE APP, NOT A BINDING — see `BlockEntry.book`.
    Both of these draw nothing when there is nothing to say, which is their own
    rule: a list that stays after it is complete is a permanent reminder of
    something already handled.
  */
  if (entry.book === "guide" && has.book) {
    props["book"] = has.book.guide;
    props["raised"] = has.book.raised;
    props["held"] = has.book.held;
    props["onGo"] = has.book.onGo;
  }
  if (entry.book === "milestones" && has.book) {
    props["book"] = has.book.milestones;
    props["counts"] = has.book.counts;
    props["already"] = has.book.already;
  }

  const act = block.does?.[0];
  /* ⚠️ EITHER FORM — see `ActSpec`. What the screen fills in travels with the
     act to the door, not to the press, so the id is all this needs. */
  const id = act === undefined ? undefined : opOf(act);
  if (id && has.onDo) props["onPress"] = () => has.onDo?.(id);
  /*
    ⚠️ AND THE GATE IS ASKED BEFORE IT IS DRAWN, WHICH `Screen.does` HAS ALWAYS
    DONE AND A BLOCK'S `does` DID NOT. The verdicts arrive with the boot — every
    blocked operation, with which gate blocked it — so a control the door will
    refuse is knowable at paint. Drawn anyway it is a row somebody presses, a
    sheet they fill in, and a refusal over the top of it: the work is gone, which
    is worse than never having offered it.

    ⚠️ AND IT IS THE SHARPEST ACCESS RULE IN AN INVENTORY THAT MADE THIS URGENT.
    Taking stock and correcting a number are deliberately different grants, so a
    product page offering both draws one control the commonest role can press and
    one it cannot — and without this, the two are indistinguishable until the
    press.

    ⚠️ DISABLED AND EXPLAINED, NEVER ABSENT. A row that has silently vanished is
    a feature somebody goes looking for; `sayGate` is the library's own line for
    each of the nine, so the words are the design system's rather than each
    screen's.
  */
  const stopped = useGate(id);
  if (stopped) {
    props["isDisabled"] = true;
    props["why"] = sayGate(stopped);
  }

  /* ⚠️ THE PENCIL IS ADDED TO THE ROW'S OWN PROPS — see `Editable`. It is not a
     slot: nothing in the declaration binds it, and the registry's guard would
     refuse a slot no component takes. */
  const drawPart = (onEdit?: () => void) => (
    <Part {...props} {...(onEdit ? { onEdit } : {})}>{children}</Part>
  );

  return (
    <Region
      bones={entry.bones}
      of={owns ? ready(true) : outcomeFor(block, has)}
      {...(owns ? {} : { isNothing: () => isNothing(block, has) })}
      /* ⚠️ THE APP'S OWN SENTENCE — the kernel refuses a list-reading block that
         does not carry one (`nothing_unsaid`), so the fallback here is only ever
         reached by a block that cannot be empty. */
      nothing={block.nothing ?? { says: block.label ?? "" }}
      then={() => (block.edits
        ? <Editable field={block.edits} has={has} then={drawPart} />
        : drawPart())}
    />
  );
}

/* ---------------------------------------------------------------- the body --- */

/**
 * A BLOCK THAT WILL DRAW NOTHING, KNOWN BEFORE IT IS PLACED.
 *
 * ⚠️ A CELL AROUND NOTHING IS AN EMPTY CARD, and it is worse than a missing one
 * because it reads as a screen that failed to load something. Both book blocks
 * remove themselves when there is nothing to say — a finished checklist, a
 * congratulation already given — and that is correct inside the component and
 * too late outside it: the `Group` around it has already drawn a surface, and a
 * grid cell is already holding a space. Photographed on Stock, the milestones
 * were a bare rounded bar between the checklist and the figures.
 *
 * ⚠️ IT ASKS THE SAME PURE FUNCTIONS THE COMPONENTS DO, so there is no second
 * opinion about emptiness to drift from the first. Anything else is drawn: a
 * block whose data has not arrived is WAITING, which is a skeleton rather than
 * a silence, and this must never hide one.
 */
const silent = (placed: Placed, has: Has): boolean => {
  if (isGroup(placed)) return placed.of.every((b) => silent(b, has));
  const entry = BLOCKS[placed.block];
  if (!entry?.book || !has.book) return false;
  return entry.book === "guide"
    ? !has.book.raised
      || !remaining(has.book.guide, has.book.raised, has.book.held).length
    : !reached(has.book.milestones, has.book.counts, has.book.already).length;
};

const wrap = (placed: Placed, has: Has, key: number, layout: Layout) => {
  if (silent(placed, has)) return null;
  if (!("when" in placed) || !placed.when || holds(placed.when, has)) {
    const inner = isGroup(placed)
      ? (
        <Group label={placed.group ?? undefined}>
          {placed.of.map((b, i) => <Placed key={i} block={b} has={has} />)}
        </Group>
      )
      : <Placed block={placed} has={has} />;
    /* ⚠️ THE WHOLE ROW IS ONLY EVER A GRID'S, and the kernel refuses it anywhere
       else (`wide_without_a_grid`) — so this reads the layout rather than
       trusting it. */
    const style = layout.as === "grid" ? spanning(placed.wide) : {};
    return <div key={key} style={style}>{inner}</div>;
  }
  return null;
};

export interface BodyProps {
  readonly body: SurfaceSpec;
  readonly has: Has;
}

/**
 * ⚠️ THE ASIDE IS PULLED OUT BEFORE THE REST, because `Arranged` takes it as its
 * own argument — a split's two columns are a structure, not two siblings, and
 * the kernel has already refused a split without exactly one thing claiming it.
 */
export function Body({ body, has }: BodyProps) {
  const beside = body.blocks.find((p) => p.beside);
  const rest = body.blocks.filter((p) => !p.beside);
  return (
    <>
      <Led body={body} has={has} />
      <Narrowing body={body} has={has} />
      <Arranged
        layout={body.layout}
        aside={beside ? wrap(beside, has, -1, body.layout) : undefined}
      >
        {rest.map((p, i) => wrap(p, has, i, body.layout))}
      </Arranged>
      <Leaving has={has} />
    </>
  );
}

/**
 * THE TWO WAYS A RECORD LEAVES, AT THE FOOT OF THE SCREEN IT IS ABOUT.
 *
 * ⚠️ AT THE BOTTOM, AND THAT IS THE PLACEMENT DECISION. The way to remove
 * something should be arrived at rather than landed on: everything the record IS
 * comes first, and by the time somebody reaches this they have read it. In the
 * crown it would sit a thumb's width from Back on every detail screen in the
 * product.
 *
 * ⚠️ AND IT IS DERIVED, NOT DECLARED — see `Drawn.aside`. Every detail screen in
 * every product has the same two ways out; a manifest saying so per screen would
 * be the same three lines on forty of them, thirty-nine right and one forgotten.
 * The door answers `null` where there is nothing to press, which covers "this
 * screen is about no record", "it has not arrived" and "they may not write" with
 * one absence.
 */
function Leaving({ has }: { readonly has: Has }) {
  const aside = has.aside;
  if (!aside) return null;
  /* ⚠️ ALREADY ASIDE MEANS THE QUESTION IS THE OTHER ONE — putting it back —
     and that is the bin screen's, not this one's. Offering to delete a deleted
     record is a control whose outcome is nothing. */
  if (aside.already) return null;
  return (
    <div className="flex justify-end">
      <PutAside
        /*
          ⚠️ THE BUTTON ITSELF, NOT A BUTTON INSIDE `Drawer.Trigger`. The drawer's
          root is a `DialogTrigger`, which wires its own button child — so
          wrapping ours in `Drawer.Trigger` put one pressable inside another:
          invalid HTML, two elements answering one press, and, since both carry a
          generated id, the same name twice in the document, which is what hands
          a screen reader the wrong element. It photographs perfectly, so only a
          browser ever found it.

          ⚠️ AND THE ANSWER IS NOT TO PUT THE BUTTON'S CLASSES ON THE TRIGGER.
          That restyles a library component by hand (D7), and a class written
          here is one a workspace's branding never reaches.

          ⚠️ QUIET, AND THE WORD RATHER THAN A GLYPH. A bin icon alone at the
          foot of a page is a control somebody has to press to find out about,
          and this is the one control in the product where finding out by
          pressing is not acceptable.
        */
        trigger={<Button variant="tertiary">{aside.bin ? "Delete" : "Put it away"}</Button>}
        name={aside.name}
        /* ⚠️ THE COLLECTION'S OWN WORD, MID-SENTENCE — "The product itself is
           kept". `label.one` is a heading and is capitalised for one. */
        of={aside.of.toLowerCase()}
        opens={aside.bin ? "bin" : "freeze"}
        onBin={() => has.onAside?.("binned")}
        onFreeze={() => has.onAside?.("frozen")}
      />
    </div>
  );
}

/**
 * WHAT THE SCREEN LEADS WITH — see `HeroSpec`.
 *
 * ⚠️ ABOVE EVERYTHING AND OUTSIDE THE LAYOUT, which is the whole reason the
 * region is named rather than being the first block. Put through `Arranged` it
 * would take a grid cell and sit beside the things it is supposed to introduce,
 * and it could not bleed past the gutter every block obeys.
 *
 * ⚠️ AND ITS OWN SENTENCE FOR AN EMPTY WORKSPACE, WHICH IS WHY `nothing` IS
 * REQUIRED. The hero is the first thing on a new workspace's first screen: a
 * figure with no value yet has to say that nothing has HAPPENED, in the app's
 * own words, because a blank space where the biggest number on the screen goes
 * reads as a page that failed rather than as a workspace that is new.
 */
function Led({ body, has }: BodyProps) {
  const hero = body.hero;
  if (!hero) return null;
  /* ⚠️ ONE KIND, AND THE SWITCH IS HOW THE NEXT ONE ARRIVES. A lookup table
     keyed on the kind would be the shape that invites registering six of them;
     a branch per kind is a place somebody has to write the drawing code, which
     is the point at which "does a screen want this" gets asked. */
  if (hero.as === "figure") {
    const value = hero.bind?.["value"] ? drawn(hero.bind["value"], has) : undefined;
    const of = hero.bind?.["of"] ? drawn(hero.bind["of"], has) : undefined;
    const unit = hero.bind?.["unit"] ? drawn(hero.bind["unit"], has) : undefined;
    const fresh = hero.bind?.["fresh"] ? drawn(hero.bind["fresh"], has) : undefined;
    const mark = hero.bind?.["mark"] ? drawn(hero.bind["mark"], has) : undefined;
    /* ⚠️ `undefined` AND `null` BOTH MEAN NOT YET, AND ZERO DOES NOT. A workspace
       that has counted nothing has no figure; a workspace that counted and found
       none has a figure and it is 0. Reading them the same way is how an empty
       state comes to cover a real answer. */
    const nothing = value === undefined || value === null;
    /* ⚠️ THE WAYS ONWARD SURVIVE AN EMPTY WORKSPACE, and that is the decision.
       They are what somebody presses to MAKE the figure be something — a hero
       that hides them until there is a number to show is one that withholds the
       controls precisely when they are the only useful thing on the screen. */
    return (
      <Lead
        {...(nothing ? {} : { eyebrow: String(of ?? "") })}
        {...(mark ? { mark: glyphOf(String(mark)) } : {})}
        value={nothing ? hero.nothing.says : (value as number | string)}
        {...(nothing || unit === undefined || unit === null ? {} : { unit: String(unit) })}
        fresh={nothing ? hero.nothing.under : (fresh as React.ReactNode)}
        {...(leadsOn(hero.leads, has))}
      />
    );
  }
  /*
    ⚠️ THE SECOND KIND, AND IT LOOKS NOTHING LIKE THE FIRST — which is the whole
    reason the region takes a kind rather than a shape. A figure is a readout; a
    subject is the thing itself, so the words are a title, the ways onward leave
    the card, and the card is the press.
  */
  if (hero.as === "subject") {
    const name = hero.bind?.["name"] ? drawn(hero.bind["name"], has) : undefined;
    const of = hero.bind?.["of"] ? drawn(hero.bind["of"], has) : undefined;
    const said = hero.bind?.["said"] ? drawn(hero.bind["said"], has) : undefined;
    const when = hero.bind?.["when"] ? drawn(hero.bind["when"], has) : undefined;
    const mark = hero.bind?.["mark"] ? drawn(hero.bind["mark"], has) : undefined;
    /* ⚠️ AN EMPTY VIEW HAS NO FIRST ROW, WHICH IS A TRUTHFUL NOTHING RATHER THAN
       A BLANK. `first` answers `undefined` over no rows — so a new workspace has
       no record to carry on with, and the hero says the app's own sentence about
       that instead of drawing an untitled card. */
    const nothing = name === undefined || name === null || name === "";
    /*
      ⚠️ THE RECORD TO OPEN IS THE ROW THE NAME CAME FROM — see `HeroSpec.goes`.
      The kernel has already refused a `goes` whose name is not read off a row,
      so the view is here to be found; reading the id from anywhere else would
      be a hero whose words are about one record and whose press opens another.
    */
    const from = hero.bind?.["name"]?.from;
    const go = hero.goes ? goOf(hero.goes) : undefined;
    const id = go && from?.of === "first"
      ? firstOf(has, from.view, go.by ?? "id")
      : undefined;
    const opens = go && has.onGo && id !== undefined && id !== null
      ? () => has.onGo?.(go.to, String(id))
      : undefined;
    /*
      ⚠️ THE WAYS ONWARD ARE THE SCREEN'S AND THE CARD IS THE RECORD'S, so they
      are drawn BESIDE each other rather than nested. A row of destinations under
      a title inside one card reads as that record's own menu, which is a claim
      the declaration never made — `leads` on a hero is where the SCREEN goes
      next, and the record has exactly one door, which is the card itself.
    */
    const ways = leadsOn(hero.leads, has).leads;
    return (
      <>
        {nothing
          ? (
            <Resuming
              of={hero.nothing.says}
              name={hero.nothing.under ?? ""}
              {...(mark ? { mark: glyphOf(String(mark)) } : {})}
            />
          )
          : (
            <Resuming
              of={String(of ?? "")}
              name={String(name)}
              {...(said === undefined || said === null ? {} : { said: said as React.ReactNode })}
              {...(when === undefined || when === null ? {} : { when: when as React.ReactNode })}
              {...(mark ? { mark: glyphOf(String(mark)) } : {})}
              {...(opens ? { onOpen: opens } : {})}
            />
          )}
        {ways?.length
          ? (
            <QuickActions
              actions={ways.map((one) => ({
                id: one.id,
                label: one.label,
                icon: one.icon ?? null,
                onDo: one.onDo,
              }))}
            />
          )
          : null}
      </>
    );
  }
  return null;
}

/**
 * ⚠️ THE SAME RESOLUTION A BLOCK'S SHORTCUTS GET, AND IT IS SHARED RATHER THAN
 * COPIED — see `BlockSpec.leads`. The declaration names screens; the words and
 * the mark come from the manifest through `named`, and a screen this person may
 * not open answers `undefined` and is DROPPED. A shortcut to a refusal is a
 * promise the product does not keep, and it costs most at the top of a screen.
 */
function leadsOn(leads: readonly string[] | undefined, has: Has) {
  if (!leads?.length) return {};
  const on = leads
    .map((to) => {
      const said = has.named?.(to);
      if (!said) return null;
      return {
        id: to,
        label: said.label,
        ...(said.icon ? { icon: glyphOf(said.icon) } : {}),
        onDo: () => has.onGo?.(to),
      };
    })
    .filter((one) => one !== null);
  return on.length ? { leads: on } : {};
}

/**
 * WHAT SOMEBODY CAN NARROW THIS SCREEN TO — see `PickSpec`.
 *
 * ⚠️ ABOVE THE BLOCKS AND OUTSIDE THE LAYOUT, because a control that changes
 * what everything below it says belongs where it is read first — and because it
 * is not one of the things being arranged. Put through `Arranged` it would take
 * a grid cell and sit beside the figures it filters.
 *
 * ⚠️ A FEW OPTIONS ARE WORN ON THE SURFACE AND MANY ARE BEHIND A FIELD. Past a
 * dozen, a segmented control is a row that wraps three times; the same rule
 * `Lookup`'s own header states, applied by the number of rows rather than by
 * which declaration produced them.
 */
const WORN_MOST = 4;

/**
 * ⚠️ A CONTROL THAT SIZES ITSELF NEEDS A BASIS, AND WITHOUT ONE THIS ROW GAVE IT
 * ZERO. Every control here fills its box below its own breakpoint and goes
 * content-sized above it — which is `w-full` on the inside, and `w-full`
 * contributes NOTHING to a max-content measurement. So as a bare flex item the
 * wrapper's base size resolved to 0: the segments then overflowed a zero-width
 * box, wrapped one per line, and the library's `justify-center` centred each of
 * them on the box's left edge — a period control drawn as a vertical stack
 * hanging outside the page gutter, with every static check green and both halves
 * internally correct. Photographed on the first screen ever to declare a `pick`.
 *
 * ⚠️ AND IT IS A BASIS RATHER THAN A COLUMN COUNT, so one narrowing fills the
 * row and three share it, with no breakpoint anywhere — the same rule the tile
 * grids follow.
 */
const NARROWING = "grow basis-64";

function Narrowing({ body, has }: BodyProps) {
  const picks = body.picks ?? [];
  if (!picks.length || !has.onPick) return null;
  return (
    <div className={`flex flex-wrap ${SPACE.snug}`}>
      {picks.map((pick) => {
        /* ⚠️ THE ROWS COME FROM THE DOOR AND THE WRITTEN SET FROM THE BODY — see
           `Drawn.picks`. A collection-backed pick whose rows have not arrived
           draws nothing rather than an empty control, which is the same rule
           every region on the screen follows. */
        const options = pick.options
          ? pick.options.map((o) => ({ id: o.value, label: o.label }))
          : (has.picks?.[pick.id] ?? []).map((o) => ({ id: o.id, label: o.label }));
        /* ⚠️ AND "NOT NARROWED" IS AN OPTION WHERE THE PRODUCT SAYS IT IS. A
           control somebody can enter and not leave is a trap; `any` is the way
           back, and its absence means there was never anywhere to go back to. */
        const all = pick.any ? [{ id: "", label: pick.any }, ...options] : options;
        if (!all.length) return null;
        /* ⚠️ THE DEFAULT IS A DECLARATION, NOT THE HEAD OF THE LIST — see
           `opensOn`, which is the kernel's one reading of it and is also what the
           container seeds its held narrowing from. Two answers to "what does this
           open on" is a control that says one period over another's figures. */
        const value = has.picked?.[pick.id] ?? opensOn(pick);
        const onChange = (next: string) => has.onPick?.(pick.id, next);
        return (
          <div key={pick.id} className={NARROWING}>
            {all.length > WORN_MOST
              ? <Lookup label={pick.label} value={value} onChange={onChange} options={all} />
              : <Segmented label={pick.label} value={value} onChange={onChange} options={all} />}
          </div>
        );
      })}
    </div>
  );
}

export type { GroupSpec };
