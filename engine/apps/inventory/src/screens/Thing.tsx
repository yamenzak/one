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
  AmountRow, FieldRow, Group, NavRow, NoteRow, Screen, Section, Timeline, useFigures, useShown,
  type Loaded, type Moment,
} from "@engine/design";
import { Button } from "@heroui/react";
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

/**
 * ONE DELIVERY, WITH ITS ARITHMETIC ALREADY DONE — see `batch.due`.
 *
 * ⚠️ THE SCREEN DOES NOT WORK THIS OUT. Which clock won and how near it is are
 * decided where the workspace's own threshold can be read, so a floor user and
 * a manager see the same list rather than the screen guessing at thirty days.
 */
export interface Batch {
  readonly id: string;
  readonly lot: string;
  readonly on: string;
  readonly by: string;
  readonly standing: string;
  readonly days: number;
  /** Whether the second clock has already been started. */
  readonly opened: boolean;
}

/**
 * ONE NAMED THING OF THIS PRODUCT — an item, or a kit.
 *
 * ⚠️ ONE SHAPE FOR BOTH, BECAUSE THE ROW IS THE SAME ROW. An itemised product's
 * objects and an assembled one's kits are both "the individual ones of this",
 * and a product is never both — the rung decides which list this is, so a second
 * component would be the same component with a different heading.
 */
export interface Piece {
  readonly id: string;
  /** Our own label, which is what somebody reads off the thing in their hand. */
  readonly label: string;
  readonly under: string;
}

export interface ThingProps {
  readonly line: Line;
  readonly history: Loaded<readonly Movement[]>;
  /** ⚠️ Empty for anything that is not `batched` — most products. */
  readonly batches: readonly Batch[];
  /** ⚠️ Empty unless the product is `itemised` or `assembled`. */
  readonly pieces: readonly Piece[];
  readonly again: () => void;
  readonly back: () => void;
  readonly onTake: () => void;
  readonly onOpen: (batch: string) => void;
  readonly onPiece: (id: string) => void;
  /** ⚠️ Offered only on an `assembled` product — see `kit.assemble`. */
  readonly onAssemble?: () => void;
}

/*
  ⚠️ WHICH CLOCK RAN OUT FIRST, IN WORDS. "printed" is the column's spelling; a
  person reads "on the box". Saying it is the point of the row — a shelf that
  says "expires Tuesday" and cannot say why is a shelf nobody trusts, and the
  answer surprises people often enough to matter.
*/
const BY: Readonly<Record<string, string>> = {
  printed: "the date on the box",
  opened: "when it was opened",
  processed: "when it was processed",
};

/* ⚠️ HOW NEAR, IN THE ONE CHANNEL A MONOCHROME INTERFACE HAS LEFT. */
const INK: Readonly<Record<string, "danger" | "warning" | undefined>> = {
  gone: "danger", soon: "warning", fine: undefined,
};

/** ⚠️ Signed, and said the way somebody would say it out loud. */
const saysDays = (days: number): string =>
  days < 0 ? `${Math.abs(days)} days ago`
    : days === 0 ? "today"
      : days === 1 ? "tomorrow"
        : `in ${days} days`;

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

export function Thing({
  line, history, batches, pieces, again, back, onTake, onOpen, onPiece, onAssemble,
}: ThingProps) {
  /* ⚠️ THE READER'S OWN CONVENTIONS. A stored instant printed as it is stored is
     the database's spelling shown to somebody who told us how they write a
     date. */
  const shown = useShown();
  /* ⚠️ THE SAME FIGURE THE LIST DREW. A quantity built into a string with `${}`
     skips the grouping every other number in the product wears, so the shelf
     that said "1,200" opens onto a page that says "1200" — which reads as two
     values rather than as one badly formatted. */
  const figures = useFigures();

  return (
    <Screen
      shape="detail"
      title={line.name}
      /* ⚠️ A FACT UNDER THE NAME, NOT A DESCRIPTION OF THE SCREEN. */
      under={`${figures.grouped(line.quantity)} ${line.unit} · ${line.whereName}`}
      back={back}
      does={{ op: "stock.take", label: "Take some", onDo: onTake }}
      of={history}
      again={again}
      /*
        ⚠️ AN EMPTY HISTORY IS NEVER THIS SCREEN'S NOTHING, and without saying so
        the default takes the page. `of` is the MOVEMENTS, so a product somebody
        added five minutes ago — no receipts yet — rendered an empty state where
        its name, its level, its deliveries and its ladder rung should be. The
        screen has plenty on it; what is empty is one section, and it says so in
        one line below.
      */
      isNothing={() => false}
      then={(moves) => (
        <>
          {/*
            ⚠️ FACTS WITH THEIR NAMES ON, NOT TWO GREY SENTENCES. These are the
            three things somebody came to this screen to check — who makes it,
            how it is tracked, and the level it is watched against — and drawn
            as notes they wore the ink the interface uses for asides, on the one
            card that is the subject. A note explains a fact; it is not one.

            ⚠️ AND THE LEVEL KEEPS THE NAME IT WAS ENTERED UNDER. The field is
            "Tell me below" everywhere it is typed, so a row reading "Told below
            400" was the same setting under a second name — recognisable only to
            whoever wrote both.
          */}
          <Group label="Now">
            {line.brand ? <FieldRow label="Brand" value={line.brand} /> : null}
            <FieldRow
              label="Tracking"
              value={line.tracking === "counted" ? "Counted" : SAID_TRACKING[line.tracking]}
            />
            {line.par !== undefined
              ? (
                <FieldRow
                  label="Tell me below"
                  value={line.par}
                  {...(line.quantity < line.par
                    ? { under: <span data-ink="warning">There is less than that on the shelf</span> }
                    : {})}
                />
              )
              : null}
          </Group>

          {/* ⚠️ BEFORE THE HISTORY, BECAUSE IT IS ABOUT WHAT HAPPENS NEXT. The
              history explains a number; this is the thing somebody has to act
              on, and a list nobody scrolls to is a list nobody acts on. */}
          {batches.length
            ? (
              <Section label="Deliveries">
                <Group>
                  {batches.map((b) => (
                    <AmountRow
                      key={b.id}
                      label={b.lot ? `Lot ${b.lot}` : "No lot number"}
                      /* ⚠️ WHICH CLOCK, ON EVERY ROW. It is the difference
                         between a date somebody believes and one they check. */
                      under={BY[b.by] ?? b.by}
                      amount={<span data-ink={INK[b.standing]}>{saysDays(b.days)}</span>}
                      /*
                        ⚠️ OPENING IS OFFERED ONCE AND THEN SAID, AND THE SLOT
                        STAYS EITHER WAY. `AmountRow`'s own contract is that a
                        control is on every row of its list or on none — because
                        everything after the label packs right, so a row missing
                        its control has its DATE where the others have a button.
                        Dropping it on opened rows made the middle column jump,
                        on the one list where three dates are read against each
                        other.

                        ⚠️ AND THE LABEL IS THE VERB. "Opened" on a button that
                        opens is the state written on the control that leaves it
                        — the one place a person cannot tell whether they are
                        reading a fact or pressing one.
                      */
                      aside={(
                        <Button
                          size="sm"
                          variant="ghost"
                          isDisabled={b.opened}
                          onPress={() => { onOpen(b.id); }}
                        >
                          {b.opened ? "Opened" : "Open"}
                        </Button>
                      )}
                    />
                  ))}
                </Group>
              </Section>
            )
            : null}

          {/*
            ⚠️ THE NAMED ONES, WHERE THERE ARE ANY. A counted product has a
            number and nothing else to show; an itemised one has objects with
            lives, and this is the only door to them — so the section is absent
            rather than empty on everything below that rung.
          */}
          {pieces.length || onAssemble
            ? (
              <Section label={line.tracking === "assembled" ? "Kits" : "Items"}>
                <Group
                  does={onAssemble
                    ? <Button variant="secondary" onPress={onAssemble}>Start a kit</Button>
                    : undefined}
                >
                  {pieces.map((piece) => (
                    <NavRow
                      key={piece.id}
                      label={piece.label}
                      under={piece.under}
                      onOpen={() => { onPiece(piece.id); }}
                    />
                  ))}
                  {pieces.length ? null : <NoteRow>None of them yet</NoteRow>}
                </Group>
              </Section>
            )
            : null}

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
