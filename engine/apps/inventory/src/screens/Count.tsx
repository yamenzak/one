/**
 * COUNTING A SHELF — scan everything on it, then settle what disagrees.
 *
 * ⚠️ THE SESSION IS THE SCOPE AND THE SHELF IS THE SESSION. Everything scanned
 * while this is open belongs here, and the same code thirty times is thirty
 * items — you do not count a shelf twice for the reason you never did on paper,
 * because you ticked the shelf off.
 *
 * ⚠️ BLIND IS CHOSEN BEFORE COUNTING AND NOT AFTER, which is the only point at
 * which the choice means anything. Hiding the expected number gives better data
 * and catches errors an informed count reads straight past; showing it is
 * faster. Offering the switch mid-count would let somebody peek and then say
 * they had not.
 *
 * ⚠️ AND CLOSING IS READ BEFORE IT IS DONE. Everything the count did not find
 * goes to zero — which is what counting IS, and is also how a session somebody
 * abandoned half way through empties a rack. Nothing but a person looking at the
 * differences can tell those two apart.
 */

import {
  AmountRow, Agree, Confirm, FieldRow, Group, NavRow, NoteRow, Num, Screen,
  Section, Unit, Viewfinder, glyphOf, type Loaded,
} from "@engine/design";
import { Button } from "@heroui/react";
/* ⚠️ ONE BOX IS ONE CODE — the fold the reader has no way to know. */
import { foldScan } from "../code.js";


/** What the session has found so far — one row per thing. */
export interface Counted {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly found: number;
  /** ⚠️ Withheld on a blind count — see the header. `null` means "not shown". */
  readonly expected: number | null;
}

/** A shelf and how long since anybody counted it — see `coverage`. */
export interface Uncovered {
  readonly location: string;
  readonly name: string;
  /** ⚠️ `null` is NEVER, which is a different problem from "a long time ago". */
  readonly days: number | null;
}

/** One disagreement a close would correct — see `settleCount`. */
export interface Change {
  readonly product: string;
  readonly name: string;
  readonly was: number;
  readonly found: number;
  readonly delta: number;
}

export interface CountProps {
  readonly title?: string;
  /** The shelf being counted. `null` before one is scanned. */
  readonly place: { readonly id: string; readonly name: string } | null;
  /** ⚠️ Chosen before counting starts, and fixed once it has. */
  readonly blind: boolean;
  readonly onBlind: (blind: boolean) => void;
  readonly counting: boolean;
  readonly of: Loaded<readonly Counted[]>;
  readonly changes: readonly Change[];
  /** Said when the same code lands three times in two seconds. */
  readonly stutter?: string;
  /**
   * ⚠️ WHICH SHELVES NOBODY HAS COUNTED — the half of a stocktake nobody builds,
   * and the one that matters more. Missing a shelf entirely is far commoner than
   * counting one twice and much more damaging: its number is simply the last one
   * anybody wrote down, and it goes on being trusted.
   */
  readonly uncounted: readonly Uncovered[];
  readonly onGo: (location: string) => void;
  readonly onRead: (code: string) => void;
  readonly onStart: () => void;
  readonly onClose: () => void;
  readonly again: () => void;
}

export function Count({
  title, place, blind, onBlind, counting, of, changes, stutter, uncounted,
  onRead, onStart, onClose, onGo, again,
}: CountProps) {
  return (
    <Screen
      shape="list"
      title={title}
      under={place ? place.name : "Scan the shelf you are counting"}
      /* ⚠️ THE DOCKED ACT IS THE ONE THAT ADDS. Starting a count is safe and
         belongs under the thumb; CLOSING one takes numbers away, so it lives in
         its own card behind a confirmation that shows the differences — see
         below. A docked button that destroyed a shelf's numbers on one press is
         the control somebody hits with a glove on. */
      does={place && !counting
        ? { op: "count.open", label: "Start counting", onDo: onStart }
        : undefined}
      of={of}
      again={again}
      isNothing={(rows) => counting && rows.length === 0}
      nothing={{
        icon: glyphOf("box"),
        says: "Nothing counted yet",
        under: "Scan what is on the shelf",
      }}
      then={(rows) => (
        <>
          <Viewfinder
              /* ⚠️ ONE BOX IS ONE CODE — see `foldScan`. A pack carrying an EAN-13
                 and a DataMatrix decodes as both, in an unstable order. */
              fold={foldScan}
            says={counting ? "Scan what is on the shelf" : "Scan the shelf label"}
            onRead={onRead}
            typed={{
              label: counting ? "Or type the code" : "Or type the shelf label",
              placeholder: "What is printed on it",
            }}
          />

          {/* ⚠️ SAID, NEVER BLOCKED. A trigger held against a pallet of identical
              boxes is also three reads in two seconds, and it is three boxes. */}
          {stutter ? <NoteRow icon={glyphOf("alert")}>{stutter}</NoteRow> : null}

          {!counting
            ? (
              <Group label="Before you start">
                <FieldRow label="Shelf" value={place ? place.name : "Not scanned yet"} />
                <Agree
                  label="Count blind"
                  value={blind}
                  onChange={onBlind}
                  help="Hides what we think is there. Better data, and it cannot be changed once you start"
                />
              </Group>
            )
            : null}

          {/*
            ⚠️ SHOWN BEFORE A SESSION STARTS AND NOT DURING ONE. It is what
            somebody decides WHICH shelf to count from, and a list of other
            shelves in front of a person mid-count is the one thing that could
            make them walk away from the one they are on.
          */}
          {!counting && uncounted.length
            ? (
              <Section label="Nobody has counted these">
                <Group>
                  {uncounted.map((shelf) => (
                    <NavRow
                      key={shelf.location}
                      label={shelf.name}
                      under={shelf.days === null
                        ? "Never counted"
                        : shelf.days === 0
                          ? "Counted today"
                          : `Counted ${shelf.days} days ago`}
                      onOpen={() => { onGo(shelf.location); }}
                    />
                  ))}
                </Group>
              </Section>
            )
            : null}

          {counting
            ? (
              <Section label="Found so far">
                <Group>
                  {rows.map((row) => (
                    <AmountRow
                      key={row.id}
                      label={row.name}
                      /* ⚠️ THE EXPECTED NUMBER IS ABSENT ON A BLIND COUNT RATHER
                         THAN HIDDEN BEHIND A CONTROL. A "reveal" is a blind count
                         somebody can stop being blind about. */
                      under={row.expected === null
                        ? undefined
                        /* ⚠️ THROUGH `Num`, LIKE THE FIGURE BESIDE IT. Written
                           into the string it prints "1200" against a counted
                           "1,200" — two numbers on one row in two different
                           number systems, which is the one place a reader
                           compares hardest. */
                        : <>We think <Num value={row.expected} /></>}
                      amount={<Num value={row.found} />}
                      aside={<Unit of={row.unit} />}
                    />
                  ))}
                </Group>
              </Section>
            )
            : null}

          {/*
            ⚠️ THE DIFFERENCES ARE THE CARD, AND THE CONFIRMATION IS THE SENTENCE.
            "Are you sure?" over a list of four numbers is a question somebody can
            actually answer; over nothing it is a formality people learn to press
            through. So the list is on the page and the sheet says only what the
            press will do.
          */}
          {counting
            ? (
              <Group
                label="Closing the shelf"
                under="Everything not counted goes to zero"
                does={(
                  <Confirm
                    trigger={
                      <Button variant="secondary">Close the shelf</Button>
                    }
                    title="Close the shelf?"
                    /* ⚠️ `danger`, BECAUSE THIS IS THE ONE GESTURE IN THE PRODUCT
                       THAT TAKES NUMBERS AWAY. Everything the count did not find
                       goes to zero, and no other write here can say that. */
                    act={{ op: "count.close", label: "Close it", tone: "danger", onDo: onClose }}
                  >
                    {changes.length
                      ? `${changes.length} line${changes.length === 1 ? "" : "s"} will be corrected, and anything on this shelf the count did not find goes to zero.`
                      : "Nothing disagrees with what was counted. The shelf will be marked counted."}
                  </Confirm>
                )}
              >
                {changes.length
                  ? changes.map((change) => (
                    <AmountRow
                      key={change.product}
                      label={change.name}
                      under={(
                        <>
                          We thought <Num value={change.was} />, counted <Num value={change.found} />
                        </>
                      )}
                      amount={(
                        /* ⚠️ THE SIGN IS THE POINT, and `Num` does not carry one
                           — a plus in front of a grouped figure is what says the
                           shelf had MORE than anybody thought. */
                        <span data-ink={change.delta < 0 ? "danger" : "warning"}>
                          {change.delta > 0 ? "+" : "−"}<Num value={Math.abs(change.delta)} />
                        </span>
                      )}
                    />
                  ))
                  : <NoteRow>Everything counted so far agrees</NoteRow>}
              </Group>
            )
            : null}
        </>
      )}
    />
  );
}
