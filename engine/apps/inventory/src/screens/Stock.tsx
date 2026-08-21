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
  AmountRow, Group, Num, Screen, Tree, Unit, glyphOf,
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
  readonly again: () => void;
  readonly onGo: (id: string | null) => void;
  readonly onOpen: (line: Line) => void;
  readonly onAdd: () => void;
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
  title, of, places, here, again, onGo, onOpen, onAdd,
}: StockProps) {
  const now = Date.now();

  return (
    <Screen
      shape="list"
      title={title}
      /* ⚠️ THE ONE ACTION, AND THE SHAPE DECIDES WHERE IT LANDS — docked at the
         thumb on a phone, in the crown on a desktop, inside the empty state when
         there is nothing yet. A screen that placed it would be a screen that
         placed it differently from the next one. */
      does={{ label: "Add stock", onDo: onAdd }}
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
                   every amount left by its own width. */
                aside={<Unit of={line.unit} />}
                onOpen={() => onOpen(line)}
              />
            ))}
          </Group>
        </>
      )}
    />
  );
}
