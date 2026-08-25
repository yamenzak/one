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
import type {
  Binding, BlockSpec, Format, GroupSpec, Layout, Placed, Presence, Read, SurfaceSpec, Viewed,
} from "@engine/kernel";
import { BLOCKS, isGroup } from "@engine/kernel";
import { Arranged, spanning } from "../parts/arrange.js";
import { Group } from "../parts/surfaces.js";
import { Region, ready, type Loaded } from "../parts/state.js";
import { Num, Size, Unit, When } from "../parts/said.js";
import { Money } from "../parts/surfaces.js";
import { Tally } from "../parts/tally.js";
import { PARTS } from "./parts.js";

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
  /** Where a `goes` leads. */
  readonly onGo?: ((screen: string) => void) | undefined;
  /** What a `does` runs. */
  readonly onDo?: ((operation: string) => void) | undefined;
  /**
   * ⚠️ THE WORKSPACE'S CURRENCY, WHICH A DECLARATION CANNOT KNOW AND MUST NOT
   * GUESS. `money` says the number is minor units; which currency's minor units
   * is a fact about the workspace, and a default here would draw one workspace's
   * prices in another's symbol — right to the penny and wrong by a factor.
   */
  readonly currency?: string | undefined;
}

/* ------------------------------------------------------------- the values --- */

/**
 * ⚠️ ONE FORMATTER PER `Format`, AND THE SET IS CLOSED IN THE KERNEL. A screen
 * cannot reach past this: `present.test.mjs` refuses a value formatted anywhere
 * but here, and the declaration cannot even name a format that is not one of
 * seven. That is the guard's `refused: format_wrong` answer made good.
 */
const DRAWN: Record<Format, (v: unknown, has: Has) => React.ReactNode> = {
  plain: (v) => (v === null || v === undefined ? null : String(v)),
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

const rowsOf = (has: Has, view: string) => {
  const held = has.views[view];
  return held?.status === "ready" ? held.data.items : undefined;
};

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
    const value = drawn(binding, has);
    if (slot === "children") children = value as React.ReactNode;
    else props[slot] = value;
  }
  if (block.label !== undefined && !("label" in props)) props["label"] = block.label;
  /* ⚠️ COLUMNS ARE A PROJECTION, NOT A BINDING — see `BlockSpec.shows`. `at` is
     the accessor the grid calls per row; the kernel has already refused a field
     the collection does not have, so this reads rather than checks. */
  if (block.shows?.length) {
    props["cols"] = block.shows.map((col) => ({
      id: col.field,
      label: col.label,
      cell: (row: Readonly<Record<string, unknown>>) => row[col.field] as React.ReactNode,
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
    props["asRow"] = (row: Readonly<Record<string, unknown>>) => ({
      name: String(row[first!.field] ?? ""),
      ...(second ? { under: String(row[second.field] ?? "") } : {}),
      ...(third ? { aside: row[third.field] as React.ReactNode } : {}),
    });
  }
  if (block.goes && has.onGo) props["onOpen"] = () => has.onGo?.(block.goes as string);
  /* ⚠️ `does` IS A LIST AND THE FIRST IS THE ROW'S OWN ACT. A row draws one
     control; the rest of the list is what a screen offers ELSEWHERE about the
     same thing, which is the shape `ActionRow` and the crown share. Handing all
     of them to one press would run several operations from one tap. */
  const act = block.does?.[0];
  if (act && has.onDo) props["onPress"] = () => has.onDo?.(act);

  return (
    <Region
      bones={entry.bones}
      of={owns ? ready(true) : outcomeFor(block, has)}
      {...(owns ? {} : { isNothing: () => isNothing(block, has) })}
      /* ⚠️ THE APP'S OWN SENTENCE — the kernel refuses a list-reading block that
         does not carry one (`nothing_unsaid`), so the fallback here is only ever
         reached by a block that cannot be empty. */
      nothing={block.nothing ?? { says: block.label ?? "" }}
      then={() => <Part {...props}>{children}</Part>}
    />
  );
}

/* ---------------------------------------------------------------- the body --- */

const wrap = (placed: Placed, has: Has, key: number, layout: Layout) => {
  if (!("when" in placed) || !placed.when || holds(placed.when, has)) {
    const inner = isGroup(placed)
      ? (
        <Group label={placed.group ?? undefined}>
          {placed.of.map((b, i) => <Placed key={i} block={b} has={has} />)}
        </Group>
      )
      : <Placed block={placed} has={has} />;
    /* ⚠️ A SPAN IS ONLY EVER A GRID'S, and the kernel refuses one anywhere else
       (`span_without_a_grid`) — so this reads the layout rather than trusting it. */
    const style = layout.as === "grid" ? spanning(placed.span?.cells) : {};
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
    <Arranged
      layout={body.layout}
      aside={beside ? wrap(beside, has, -1, body.layout) : undefined}
    >
      {rest.map((p, i) => wrap(p, has, i, body.layout))}
    </Arranged>
  );
}

export type { GroupSpec };
