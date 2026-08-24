/**
 * CARRYING SOME OF A SHELF TO ANOTHER SHELF.
 *
 * ⚠️ IT IS REACHED FROM THE LINE RATHER THAN FROM THE NAV, and that is what
 * makes it three fields instead of a session. Somebody moving stock is already
 * looking at what they are moving: the product and the shelf it is on are facts
 * the screen arrived with, so the only questions left are where to and how many.
 * A destination of its own would ask all four again, in order, to somebody
 * holding the box.
 *
 * ⚠️ AND MOVING IS NOT TAKING. Recorded as a take plus a receive — which is what
 * everybody does when there is no move — the whole carton enters the usage
 * report, so "we used 600 tablets this month" becomes a sentence about a
 * trolley. `stock.move` writes both halves as one movement, and the button here
 * names it.
 *
 * ⚠️ THE NUMBER IS IN THE RUNG BESIDE IT, NEVER IN BASE UNITS. "Two boxes" is
 * what somebody carrying two boxes can say; the multiplication happens once, on
 * the server, against the ladder the product declares NOW — so the sentence under
 * the field is this screen showing its working, not deciding anything.
 */

import * as React from "react";
import {
  Choice, FieldRow, Group, NoteRow, NumberInput, Screen, Section,
  useFigures,
} from "@engine/design";
import type { Line } from "./sample.js";
import { rungsOf } from "./Receive.js";

/** One rung of the product's ladder — see `packing.ts`. */
export interface Rung {
  readonly name: string;
  readonly per: number;
}

export interface Shelf {
  readonly id: string;
  readonly name: string;
}

export interface MoveProps {
  /** What is being carried, and the shelf it is leaving. */
  readonly line: Line;
  /** How the product is packaged. Empty for most things. */
  readonly levels: readonly Rung[];
  /**
   * ⚠️ EVERYWHERE ELSE IT COULD GO — and the shelf it is ON is not among them.
   * A move to where it already is writes two rows that cancel: the balance would
   * be right, which is exactly why it must not be offered. The door refuses it
   * too, because a screen's rule is a courtesy.
   */
  readonly shelves: readonly Shelf[];
  readonly onMove: (of: { to: string; quantity: number; rung: string }) => void;
  readonly busy?: boolean;
  readonly back: () => void;
}

/**
 * HOW MANY BASE UNITS ONE ENTRY MEANS, on the screen's side.
 *
 * ⚠️ IT IS THE SAME RULE THE SERVER APPLIES AND NOT THE AUTHORITY FOR IT. The
 * screen says what it is about to do so nobody has to trust a multiplier they
 * cannot see; the server resolves the rung name again against what the product
 * declares now, and its answer is the one that lands.
 */
export const carrying = (
  many: number, rung: string, levels: readonly Rung[],
): number => {
  if (!rung) return many;
  let factor = 1;
  for (const one of levels) {
    factor *= one.per;
    if (one.name === rung) return many * factor;
  }
  /* ⚠️ A RUNG THE LADDER LOST IS SHOWN AS ITSELF, never as a guess. The server
     refuses it by name, and a screen that quietly multiplied by one would have
     promised a number the refusal then contradicts. */
  return many;
};

export function Move({ line, levels, shelves, onMove, busy, back }: MoveProps) {
  /* ⚠️ THE SAME FIGURES THE LIST DREW. A quantity built with `${}` skips the
     grouping every other number wears, so a shelf that said "1,200" opens onto a
     page saying "1200" — which reads as two values rather than one. */
  const figures = useFigures();

  const [to, setTo] = React.useState("");
  const [many, setMany] = React.useState(1);
  const [rung, setRung] = React.useState("");

  const base = carrying(many, rung, levels);
  /* ⚠️ REFUSED HERE AND AT THE DOOR. Carrying more than is there is the ordinary
     way this fails, and saying so under the number beats a toast over a form. */
  const short = base > line.quantity
    ? `There ${line.quantity === 1 ? "is" : "are"} only ${figures.grouped(line.quantity)}`
    : undefined;

  return (
    <Screen
      shape="form"
      title="Move it"
      /* ⚠️ THE FACT UNDER THE NAME IS WHAT IS BEING MOVED AND FROM WHERE, because
         both are things somebody arrived with rather than chose here. */
      under={`${line.name} · ${line.whereName}`}
      back={back}
      does={{
        op: "stock.move",
        label: "Move it",
        onDo: () => { onMove({ to, quantity: many, rung }); },
        disabled: busy === true || !to || many <= 0 || Boolean(short),
      }}
    >
      <Section label="From here to there">
        <Group>
          <FieldRow
            label="On this shelf"
            value={`${figures.grouped(line.quantity)} ${line.unit}`}
            under={line.whereName}
          />

          {shelves.length
            ? (
              <Choice
                label="Move it to"
                value={to}
                onChange={setTo}
                options={shelves.map((one) => ({ id: one.id, label: one.name }))}
                placeholder="Which shelf"
              />
            )
            : (
              <NoteRow>
                There is nowhere else to put it yet. Make a second location first.
              </NoteRow>
            )}

          {/* ⚠️ ONLY WHERE THERE IS SOMETHING TO CHOOSE. A product with no ladder
              has exactly one answer, and a picker with one entry is a control
              asking a question it has already answered. */}
          {levels.length
            ? (
              <Choice
                label="Counted in"
                value={rung}
                onChange={setRung}
                options={[...rungsOf(line.unit, levels)]}
                help="What you are carrying, not what the shelf counts"
              />
            )
            : null}

          <NumberInput
            label={rung ? `How many ${rung}` : `How many ${line.unit}`}
            value={many}
            onChange={setMany}
            min={0}
            error={short}
            /* ⚠️ THE ARITHMETIC OUT LOUD, and only where it says something the
               field does not. "40 items" under a field reading 40 is a second
               line repeating the first, which is how a screen teaches somebody
               to stop reading it. */
            help={rung && many > 0 ? `${figures.grouped(base)} ${line.unit}` : undefined}
          />
        </Group>
      </Section>
    </Screen>
  );
}
