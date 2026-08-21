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
  ActionRow, AmountRow, Group, Num, Screen, Tree, Unit, glyphOf, useFigures,
  type Branch, type Loaded,
} from "@engine/design";
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
}: StockProps) {
  const now = Date.now();
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
      }}
      then={(lines) => (
        <>
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
        </>
      )}
    />
  );
}
