/**
 * ONE PRODUCT — what it is, where it is, and what happened to it.
 *
 * ⚠️ THE HISTORY IS THE SCREEN'S SECOND HALF, AND THAT IS THE PRODUCT'S WHOLE
 * CLAIM. A number with no history is a number somebody can only believe; the
 * moment a shelf disagrees with the app, what settles it is a list of movements
 * with a name and a reason on each. Putting that behind a tab would make the
 * evidence something a person has to go and look for.
 *
 * ⚠️ AND A CORRECTION READS DIFFERENTLY FROM A CONSUMPTION, in the one channel a
 * monochrome interface has. "We used 40" and "somebody wrote it down wrong
 * twice" are the two things this list exists to keep apart.
 */

import {
  Group, NoteRow, Screen, Section, Timeline, glyphOf, useShown,
  type Loaded, type Moment,
} from "@engine/design";
import { sayDate, type Instant } from "@engine/kernel";
import type { Line } from "./sample.js";

/** One movement, as the ledger holds it. */
export interface Movement {
  readonly id: string;
  readonly move: "received" | "taken" | "adjusted";
  readonly delta: number;
  readonly at: string;
  readonly who: string;
  readonly where: string;
  readonly reason?: string;
  readonly capture: string;
}

export interface ThingProps {
  readonly line: Line;
  readonly history: Loaded<readonly Movement[]>;
  readonly again: () => void;
  readonly back: () => void;
  readonly onTake: () => void;
}

/* ⚠️ THE VERB, NOT THE KEY. `adjusted` is what the column holds and "Corrected"
   is what a person reads — a wire value printed on a screen is the database's
   spelling shown to somebody who never chose it (DESIGN.md §1.9). */
const SAID: Readonly<Record<Movement["move"], string>> = {
  received: "Received", taken: "Taken", adjusted: "Corrected",
};

/* ⚠️ HOW IT WAS CAPTURED, SAID ONLY WHERE IT IS NOT THE ORDINARY CASE. "Was this
   scanned or typed?" is the question somebody asks when a count looks wrong, and
   a row saying "scanned" on every line answers it for nobody. */
const CAPTURED: Readonly<Record<string, string>> = {
  typed: "typed in", voice: "by voice", "ai-assisted": "read by the camera",
  imported: "imported",
};

export function Thing({ line, history, again, back, onTake }: ThingProps) {
  /* ⚠️ THE READER'S OWN CONVENTIONS. A stored instant printed as it is stored is
     the database's spelling shown to somebody who told us how they write a
     date. */
  const shown = useShown();

  return (
    <Screen
      shape="detail"
      title={line.name}
      /* ⚠️ A FACT UNDER THE NAME, NOT A DESCRIPTION OF THE SCREEN. */
      under={`${line.quantity} ${line.unit} · ${line.whereName}`}
      back={back}
      does={{ label: "Take some", onDo: onTake }}
      of={history}
      again={again}
      then={(moves) => (
        <>
          <Group label="Now">
            <NoteRow>
              {line.brand ? `${line.brand} · ` : ""}
              {line.tracking === "counted" ? "Counted" : SAID_TRACKING[line.tracking]}
            </NoteRow>
            {line.par !== undefined
              ? (
                <NoteRow>
                  {line.quantity < line.par
                    ? <span data-ink="warning">Below the level you asked to be told at</span>
                    : `Told below ${line.par}`}
                </NoteRow>
              )
              : null}
          </Group>

          <Section label="History">
            {moves.length
              ? (
                <Timeline
                  moments={moves.map((m): Moment => ({
                    id: m.id,
                    label: `${SAID[m.move]} ${Math.abs(m.delta)}`,
                    when: sayDate(shown, m.at as Instant, "short"),
                    under: [
                      m.who,
                      m.where,
                      m.reason,
                      CAPTURED[m.capture],
                    ].filter(Boolean).join(" · "),
                  }))}
                />
              )
              /* ⚠️ NOT AN EMPTY STATE FOR THE SCREEN — the screen has plenty on
                 it. A product with no movements is new, and saying so once is
                 the whole of it. */
              : <NoteRow>Nothing has moved yet</NoteRow>}
          </Section>
        </>
      )}
      nothing={{ icon: glyphOf("box"), says: "Nothing has moved yet" }}
    />
  );
}

/* ⚠️ Beside `SAID` rather than inside the component, so the two vocabularies
   this screen prints are read in one place. */
const SAID_TRACKING: Readonly<Record<Line["tracking"], string>> = {
  listed: "Listed — not counted",
  counted: "Counted",
  batched: "Batched — deliveries kept apart",
  itemised: "Itemised — one of a kind",
  assembled: "Assembled from other things",
};
