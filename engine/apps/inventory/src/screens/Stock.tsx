/**
 * STOCK — what is here, and how many.
 *
 * ⚠️ THE ONE QUESTION THIS SCREEN ANSWERS IS "HAVE WE GOT ANY". Everything else
 * a stock list could show — the supplier, the cost, the batch, the last
 * delivery — belongs to the product's own screen, and putting any of it on a row
 * costs the number the width it needs to be read at arm's length in a cold
 * store.
 *
 * ⚠️ SO THE FIGURE IS THE ROW'S SUBJECT AND EVERYTHING ELSE IS THE LABEL.
 * `AmountRow` packs everything after the growing label to the right, which is
 * what gives a column of quantities a shared edge — and a shared edge is the
 * difference between a list somebody scans and a list somebody reads.
 *
 * ⚠️ AND A LINE THAT IS OUT OR LOW SAYS SO IN INK RATHER THAN IN A CHIP. The
 * interface is monochrome and the value is the one channel left, so the number
 * itself carries the state: a chip beside it would be a second thing to look at
 * saying what the first one already says.
 */

import {
  ActionRow, AmountRow, Group, NavRow, Num, Screen, Tree, Unit, glyphOf, useFigures, useGate,
  type Branch, type Loaded,
} from "@engine/design";
import { Button } from "@heroui/react";
import type { Tone } from "@engine/kernel";
import type { Line, Place } from "./sample.js";

export interface StockProps {
  readonly title?: string;
  readonly of: Loaded<readonly Line[]>;
  readonly places: readonly Place[];
  /** Where the reader is in the tree. `null` is the whole workspace. */
  readonly here: string | null;
  /**
   * ⚠️ HOW MANY THERE ARE, WHICH IS NOT `of.length`. A list is a page, and a
   * page that cannot say what it is a page OF is a screen claiming a workspace
   * has fifty products.
   */
  readonly total: number;
  /** ⚠️ Whether there is another page — an answer, never a guess at the count. */
  readonly more: boolean;
  readonly again: () => void;
  readonly onGo: (id: string | null) => void;
  readonly onOpen: (line: Line) => void;
  readonly onAdd: () => void;
  readonly onMore: () => void;
  /**
   * WHAT STOCK IS ABOUT, ASKED FOUR OTHER WAYS.
   *
   * ⚠️ THESE ARE NOT A MENU, THEY ARE THIS SCREEN'S OWN SUBJECT FROM A DIFFERENT
   * ANGLE. What is running out is the shelf narrowed to one question; a
   * spreadsheet and a supplier list are the catalogue BEHIND the rows. Each was
   * a destination in a bar of thirteen and none of them is somewhere anybody
   * navigates BETWEEN — a slot in the bar answers "where am I", and none of
   * these is a place you are.
   *
   * ⚠️ AND THE PLACEMENT SAYS WHICH IS WHICH. "Running out" is above the tree,
   * where the shelf's own state is read; the catalogue's two sit under the last
   * row, where somebody who has finished reading the list already is.
   */
  readonly onDue: () => void;
  readonly onImport: () => void;
  readonly onSuppliers: () => void;
  /**
   * ⚠️ THE GUIDE, WHILE THERE IS ANY OF IT LEFT. It is reached from what is not
   * done yet and it stops being wanted the week it is finished — so this is
   * `null` on an established workspace rather than a permanent row every
   * experienced person carries for ever.
   */
  readonly onStart: (() => void) | null;
  /**
   * ⚠️ WHAT THIS PERSON HOLDS, BECAUSE A ROW THAT LEADS TO A 403 IS A PROMISE
   * THE PRODUCT DOES NOT KEEP. The nav filters itself on the same question; a
   * row inside a screen has nothing filtering it, so it asks here.
   */
  readonly held: ReadonlySet<string>;
}

/**
 * ⚠️ "LAST SEEN" IS THE APP ADMITTING A NUMBER MAY BE FICTION, and it is only
 * said when it is worth saying. Four months is a line nobody has touched since
 * the spring; four minutes is noise on every row of the list. Hiding staleness
 * is how people stop believing a system, and saying it everywhere is how they
 * stop reading it.
 */
const STALE_MS = 60 * 86_400_000;

const stale = (seen: string, now: number) => now - Date.parse(seen) > STALE_MS;

/**
 * ⚠️ THE NUMBER'S OWN INK, BECAUSE THE NUMBER IS WHAT IS WRONG. A monochrome
 * interface has one channel left for "this is the one to look at", and it is the
 * colour of the VALUE — a chip beside the figure would be a second thing to read
 * saying what the first already says.
 *
 * ⚠️ AND IT IS THE ROW'S OWN `tone`, NEVER A SPAN AROUND THE FIGURE. `AmountRow`
 * already puts `data-ink` on the amount; wrapping the number in a second one
 * nests two inks on one value, which renders correctly and is two answers to
 * where a row's state lives.
 */
const toneOf = (line: Line): Tone => {
  if (line.quantity <= 0) return "danger";
  if (line.par !== undefined && line.quantity < line.par) return "warning";
  return "neutral";
};

export function Stock({
  title, of, places, here, total, more, again, onGo, onOpen, onAdd, onMore,
  onDue, onImport, onSuppliers, onStart, held,
}: StockProps) {
  const now = Date.now();
  /*
    ⚠️ THE ROLE AND THE PLAN REFUSE FOR DIFFERENT REASONS, AND ONLY ONE OF THEM
    SHOULD HIDE A ROW. A person whose role does not include the catalogue is
    being told it is not theirs, and a row promising otherwise is a promise the
    product does not keep. A workspace whose PLAN does not include imports is
    being told to buy something — hiding that is a feature nobody can find, so
    the row stands and the screen explains.
  */
  const stops = useGate("product.import");
  const mayImport = held.has("product:write") && stops !== "permission";
  /* ⚠️ THE SAME FIGURE EVERY OTHER NUMBER WEARS. A count built into a string
     with `${}` skips the grouping, so a list of eleven hundred says "1100 of
     2140" under rows that say "1,100". */
  const figures = useFigures();

  return (
    <Screen
      shape="list"
      title={title}
      /* ⚠️ THE ONE ACTION, AND THE SHAPE DECIDES WHERE IT LANDS — docked at the
         thumb on a phone, in the crown on a desktop, inside the empty state when
         there is nothing yet. A screen that placed it would be a screen that
         placed it differently from the next one. */
      does={{ op: "stock.receive", label: "Add stock", onDo: onAdd }}
      of={of}
      again={again}
      isNothing={(lines) => lines.length === 0}
      nothing={{
        icon: glyphOf("box"),
        says: here ? "Nothing here yet" : "Nothing counted yet",
        under: "Scan something, or add it by hand",
        /*
          ⚠️ AN EMPTY WORKSPACE IS THE ONE THAT MOST NEEDS THE SPREADSHEET, AND
          IT IS THE ONE THE LIST'S OWN ROWS NEVER REACH. Everything under `then`
          is drawn beside records; on the first morning there are none, so the
          two ways in that matter on that morning have to be here. Nobody types
          in eight hundred products, and an import somebody can only find once
          they already have stock is an import for a problem they no longer have.

          ⚠️ AND THE SCREEN'S OWN ACT HAS TO BE REDRAWN, because a node here
          REPLACES it (`ScreenProps.nothing`). Dropping it would leave an empty
          workspace offering a spreadsheet and no way to put one thing on a
          shelf.
        */
        does: (
          <div className="flex flex-col items-center gap-2">
            <Button variant="primary" onPress={onAdd}>Add stock</Button>
            {mayImport
              ? <Button variant="ghost" onPress={onImport}>Import a spreadsheet</Button>
              : null}
            {onStart
              ? <Button variant="ghost" onPress={onStart}>Getting started</Button>
              : null}
          </div>
        ),
      }}
      then={(lines) => (
        <>
          {/*
            ⚠️ THE SHELF'S OWN STATE, ABOVE THE SHELF. What is running out is
            the first thing anybody opens this product to find out, and it is
            these same records under one question — a destination beside Stock
            would be Stock twice, and a row at the bottom would be the answer
            filed under the list it is about.

            ⚠️ NO COUNT ON IT, AND THAT IS NOT AN OMISSION. What is loaded here
            is a PAGE; counting the low lines in it would put a confident number
            on the screen that is wrong by however much of the list has not
            arrived — and the number gets smaller the less you have loaded,
            which is the direction nobody checks.
          */}
          <Group>
            <NavRow icon={glyphOf("alert")} label="Running out" onOpen={onDue} />
            {/* ⚠️ WHILE THERE IS ANY OF IT LEFT — see `onStart`. */}
            {onStart
              ? <NavRow icon={glyphOf("star")} label="Getting started" onOpen={onStart} />
              : null}
          </Group>

          {/*
            ⚠️ THE TREE IS ABOVE THE LIST RATHER THAN BESIDE IT, because on a
            phone there is no beside. Descending narrows what is below it, which
            is the same gesture as opening a folder and is the one people already
            know.
          */}
          <Tree
            nodes={places.map((p): Branch => ({
              id: p.id,
              label: p.name,
              /* ⚠️ A FACT, NEVER AN EXPLANATION — the count is what decides
                 whether somebody opens it. */
              under: p.lines === 1 ? "1 line" : `${p.lines} lines`,
              of: p.of,
            }))}
            here={here}
            onGo={onGo}
            root="Everywhere"
            nothing={undefined}
          />

          <Group>
            {lines.map((line) => (
              <AmountRow
                key={line.id}
                label={line.name}
                /* ⚠️ WHERE IT IS, ONLY WHEN THAT IS NOT ALREADY THE HEADING. On
                   a shelf's own screen every row would repeat the shelf's name,
                   which is the heading printed once per row. */
                under={[
                  here ? null : line.whereName,
                  stale(line.seen, now) ? "not seen in a while" : null,
                ].filter(Boolean).join(" · ") || undefined}
                amount={<Num value={line.quantity} />}
                tone={toneOf(line)}
                /* ⚠️ THE UNIT IS ON EVERY ROW OF THIS LIST, which is what makes
                   it an `aside` rather than a `mark` — a marker is by definition
                   the exception, and one that appeared on every row would push
                   every amount left by its own width. Being on every row is not
                   enough on its own: `glove`, `tin` and `ream` are three widths,
                   so `Unit` claims a column of its own. */
                aside={<Unit of={line.unit} />}
                onOpen={() => onOpen(line)}
              />
            ))}
            {/*
              ⚠️ WHAT THIS IS A PAGE OF, SAID WHERE THE PAGE ENDS. A list that
              hands over fifty of two hundred and says nothing is a screen
              claiming a workspace has fifty products — in a product whose entire
              purpose is answering how many there are. It appears only when there
              is more, because "12 of 12" is a sentence about arithmetic.
            */}
            {more
              ? (
                <ActionRow
                  /* ⚠️ NO GLYPH, BECAUSE NOTHING ABOVE IT HAS ONE. A box plate
                     at the foot of six product rows that carry no mark reads as
                     a seventh product — and the glyph it wore was the PRODUCT
                     glyph, so it said the one thing this row is not. */
                  label="Show more"
                  under={`${figures.grouped(lines.length)} of ${figures.grouped(total)}`}
                  onDo={onMore}
                />
              )
              : null}
          </Group>

          {/*
            ⚠️ THE CATALOGUE BEHIND THE ROWS, UNDER THE LAST ROW. A line is a
            product somewhere; the spreadsheet that put the products there and
            the people they are bought from are facts about the catalogue rather
            than about the shelf — so they sit where somebody who has finished
            reading the list already is, rather than competing with the numbers
            at the top of it.

            ⚠️ AND ONLY WHERE THE CATALOGUE IS THIS PERSON'S. Both are
            `product:write`; a row leading to a refusal is a promise the product
            does not keep, which is the same rule the nav applies one level up.
          */}
          {held.has("product:write")
            ? (
              <Group>
                {mayImport
                  ? (
                    <NavRow
                      icon={glyphOf("file")}
                      label="Import a spreadsheet"
                      onOpen={onImport}
                    />
                  )
                  : null}
                <NavRow icon={glyphOf("people")} label="Suppliers" onOpen={onSuppliers} />
              </Group>
            )
            : null}
        </>
      )}
    />
  );
}
