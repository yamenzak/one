/**
 * RECEIVE — scan, how many, done.
 *
 * ⚠️ THE WORST OUTCOME IN THIS PRODUCT IS SOMEBODY NOT RECORDING SOMETHING
 * because a form demanded a field they did not have. Every decision below falls
 * out of that: the place is remembered between scans, the quantity opens at one
 * of whatever was scanned, the questions a good label already answered are not
 * asked, and the whole thing is one press away from being taken back.
 *
 * ⚠️ THE PLACE IS SET ONCE AND KEPT, WHICH IS THE WHOLE SPEED OF IT. Point at a
 * shelf, scan, scan, scan, point at the next shelf. Asking "where?" after every
 * item is what turns forty minutes back into two hours — so a location code
 * MOVES the session and a product code fills the row.
 *
 * ⚠️ AND THE PACK LEVEL IS APPLIED WITHOUT BEING ASKED ABOUT. A carton's barcode
 * says it holds ten; scanning it and recording one is the commonest wrong number
 * in inventory work, and the code on the box already knew.
 */

import * as React from "react";
import {
  AmountRow, Await, Group, FieldRow, NoteRow, Num, NumberInput, PickFile, RowsWaiting,
  Screen, Section, Steps, TextInput, Viewfinder, glyphOf, useShown, notice,
  type Loaded, type Step,
  shrunk,
} from "@engine/design";
import { MOST_BYTES, sayDate, type Instant } from "@engine/kernel";
import { Button } from "@heroui/react";
import type { Seen } from "./Scan.js";
/* ⚠️ ONE BOX IS ONE CODE — the fold the reader has no way to know. */
import { foldScan } from "../code.js";


/**
 * ONE LINE A DELIVERY NOTE APPEARS TO CARRY.
 *
 * ⚠️ IT IS A WORKLIST AND NOT A WRITE. One photograph instead of thirty scans is
 * the whole value at a goods-in desk — and a quantity read off a creased page is
 * exactly the consequence a model may not commit. So a line FILLS the row above
 * it and the ordinary "Add it" records it: every line confirmed, by the gesture
 * somebody already knows, with no second way to receive anything.
 */
export interface Noted {
  readonly code: string;
  readonly name: string;
  readonly quantity: number;
  readonly lot: string;
  readonly expiry: string;
}

/*
  ⚠️ THREE STEPS, AND THE PROGRESS ROW IS HONEST ABOUT WHICH. It is a sequence of
  states on ONE page rather than three pages — but unlike a form, the steps here
  are not visible at once: a viewfinder replaces a number field replaces a
  summary, so somebody who cannot see what is coming needs telling.
*/
const STEPS: readonly Step[] = [
  { id: "where", label: "Where" },
  { id: "what", label: "What" },
  { id: "many", label: "How many" },
];

export interface Place {
  readonly id: string;
  readonly name: string;
}

export interface ReceiveProps {
  readonly title?: string;
  /** Where this session is putting things. `null` until a shelf is scanned. */
  readonly place: Place | null;
  /** The last code resolved. `null` while waiting for the next scan. */
  readonly seen: Seen | null;
  readonly onRead: (code: string) => void;
  /** Scanned something that is not a product and not a shelf. */
  readonly onForget: () => void;
  readonly onReceive: (of: { quantity: number; lot: string; expiry: string }) => void;
  /** ⚠️ Absent once there is nothing left to take back — see `stock.undo`. */
  readonly onUndo?: () => void;
  readonly busy?: boolean;
  /**
   * ⚠️ WHAT A PHOTOGRAPHED DELIVERY NOTE SAID. `null` until one is taken — this
   * is never fetched on arrival, because reading a page costs credits and
   * nobody asked.
   */
  readonly note: Loaded<readonly Noted[] | null>;
  /** Read a delivery note. Absent where the deployment cannot ask a model. */
  readonly onNote?: (image: string) => void;
  /** Put one of its lines into the row above. */
  readonly onLine: (line: Noted) => void;
  /** ⚠️ Which lines have been recorded, so the list is a worklist. */
  readonly done: ReadonlySet<string>;
  readonly again: () => void;
}

/* ⚠️ A LINE HAS NO ID BECAUSE A PAGE HAS NO IDS, so what identifies one is what
   it says. Two identical lines on one note are two deliveries of the same thing
   and would tick together — which is honest: the person adds one, sees both
   ticked, and looks. A counter keyed on position would tick the wrong one the
   moment a re-read returned the lines in another order. */
export const keyOf = (line: Noted): string =>
  `${line.code}\u0000${line.name}\u0000${line.quantity}\u0000${line.lot}`;

/**
 * ⚠️ THE TWO HALVES OF THE PACK MULTIPLIER, WRITTEN ONCE, BECAUSE THEY WERE BOTH
 * WRONG AT THE SAME TIME. `stock.arrive` multiplies the quantity it is sent by
 * the scanned code's `pack`, so this screen counts THE THING SCANNED and the
 * operation turns it into base units. Seeding the field with the pack applied
 * the multiplier twice — a carton of thirty went onto the shelf as nine hundred,
 * with the number the person expected showing on screen the whole time.
 *
 * ⚠️ AND THE INVARIANT IS THE COMPOSITION, WHICH IS WHY THESE ARE ONE PAIR:
 * scanning a carton once and pressing the only button puts exactly one carton
 * away. Either half on its own reads as reasonable.
 */
export const startingQuantity = (): number => 1;

/** How many base units a quantity of the scanned thing lands as. */
export const onShelf = (many: number, pack: number | undefined): number =>
  many * Math.max(1, pack ?? 1);

export function Receive({
  title, place, seen, onRead, onForget, onReceive, onUndo, busy,
  note, onNote, onLine, done, again,
}: ReceiveProps) {
  /* ⚠️ The reader's own calendar — see the expiry in the list below. */
  const shown = useShown();
  /*
    ⚠️ THE QUANTITY IS HOW MANY OF THE SCANNED THING, WHICH IS ONE. `stock.arrive`
    multiplies by the code's pack — one carton is `1` here and thirty on the
    shelf — so seeding this with the pack multiplies it twice: scanning a carton
    of thirty and pressing the only button put NINE HUNDRED tablets away, and the
    number on screen was the one the person expected.

    ⚠️ AND IT IS RE-SEEDED PER SCAN. A field holding the last item's number is how
    somebody receives eleven of the next thing — so the key of this state is the
    code, not the screen.
  */
  const [many, setMany] = React.useState(0);
  const [lot, setLot] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const code = seen?.value ?? "";

  React.useEffect(() => {
    setMany(seen ? startingQuantity() : 0);
    setLot(seen?.lot ?? "");
    setExpiry(seen?.expiry ?? "");
  }, [code, seen]);

  const at = !place ? "where" : !seen ? "what" : "many";
  const needs = seen?.needs ? seen.needs.split(",").filter(Boolean) : [];
  /* ⚠️ REFUSED HERE AND AT THE HANDLER. A batched delivery with no lot is a
     delivery nobody can recall; the door checks it too, because a screen's rule
     is a courtesy and never a control. */
  const short = needs.includes("lot") && !lot.trim()
    ? "A batched delivery needs its lot number"
    : undefined;

  return (
    <Screen
      shape="form"
      title={title}
      /* ⚠️ THE PLACE UNDER THE NAME, BECAUSE IT IS THE ONE FACT EVERYTHING ELSE
         ON THIS SCREEN DEPENDS ON. Somebody who has walked to the next rack and
         not re-scanned is about to put twenty things on the wrong shelf. */
      under={place ? place.name : "Scan a shelf label to begin"}
      does={seen
        ? {
          op: "stock.receive",
          label: "Add it",
          onDo: () => { onReceive({ quantity: many, lot, expiry }); },
          disabled: busy === true || many <= 0 || Boolean(short),
        }
        : undefined}
    >
      <Steps at={at} steps={STEPS} />

      {/* ⚠️ THE CAMERA STAYS UP THROUGH THE WHOLE FLOW. Tearing it down to ask
          for a number and putting it back for the next item is a permission
          prompt and a black flash per item — see `Scan`. */}
      <Viewfinder
              /* ⚠️ ONE BOX IS ONE CODE — see `foldScan`. A pack carrying an EAN-13
                 and a DataMatrix decodes as both, in an unstable order. */
              fold={foldScan}
        says={place ? "Scan the next thing, or another shelf" : "Scan the shelf you are standing at"}
        onRead={onRead}
        typed={{
          label: "Or type the code",
          placeholder: "What is printed on it",
          help: "A shelf label works here too",
        }}
      />

      {!place
        ? (
          <NoteRow>
            Every shelf has a label. Scanning one puts everything after it there.
          </NoteRow>
        )
        : null}

      {place && !seen
        ? (
          <Group label="On this shelf">
            <FieldRow label="Where" value={place.name} />
            <NoteRow>Scan a barcode, and it will appear here</NoteRow>
          </Group>
        )
        : null}

      {place && seen
        ? (
          <Section label={seen.found ? seen.name : "Something new"}>
            <Group>
              <FieldRow label="Where" value={place.name} />
              {/* ⚠️ TAKE IT NOW, NAME IT LATER. An unknown code is received
                  against its own string rather than refused — the thing is
                  physically on the shelf whether or not the catalogue knows what
                  it is, and a screen that insisted on a name first is a screen
                  that loses the delivery. */}
              {seen.found ? null : (
                <>
                  <FieldRow label="Code" value={seen.value} />
                  <NoteRow>
                    Nobody has said what this is yet. Put it away now and name it later.
                  </NoteRow>
                </>
              )}
              {seen.pack > 1
                ? (
                  <FieldRow
                    label="This one holds"
                    value={`${seen.pack} ${seen.unit}`}
                    under="Count the packs — the shelf gets that many times more"
                  />
                )
                : null}

              {/* ⚠️ THE NUMBER IS IN WHAT WAS SCANNED, NOT IN THE BASE UNIT, and
                  the label has to say which — "How many tablets" over a field
                  that counts cartons is how a right number is typed into the
                  wrong question. The line under it does the arithmetic out loud
                  so nobody has to trust the multiplier they cannot see. */}
              <NumberInput
                label={seen.pack > 1
                  ? "How many of these"
                  : seen.unit ? `How many ${seen.unit}` : "How many"}
                help={seen.pack > 1 && many > 0
                  ? `${onShelf(many, seen.pack)} ${seen.unit} onto the shelf`
                  : undefined}
                value={many}
                onChange={setMany}
                min={0}
              />

              {/* ⚠️ ONLY WHAT THE LABEL DID NOT CARRY. A DataMatrix arrives with
                  both of these and asking again would make the good label
                  worthless; a plain barcode arrives with neither. */}
              {needs.includes("lot")
                ? (
                  <TextInput
                    label="Lot"
                    value={lot}
                    onChange={setLot}
                    error={short}
                    help="It is on the box, near the date"
                    name="lot"
                  />
                )
                : null}
              {needs.includes("expiry")
                ? (
                  <TextInput
                    label="Expires"
                    value={expiry}
                    onChange={setExpiry}
                    placeholder="2027-03-31"
                    help="Leave it empty if the box does not say"
                    name="expiry"
                  />
                )
                : null}

              {/* ⚠️ SECONDARY, NOT GHOST. This is the way out of a wrong scan,
                  and the person reaching for it is already holding the wrong
                  thing — a ghost at the foot of a card of fields reads as one
                  more sentence, which is the one moment a control must not. */}
              <Button variant="secondary" onPress={() => { onForget(); notice.ok("Cleared."); }}>
                Not that one
              </Button>
            </Group>
          </Section>
        )
        : null}

      {/*
        ⚠️ ONE PHOTOGRAPH INSTEAD OF THIRTY SCANS, which at a goods-in desk is
        where the time actually goes. What comes back is a WORKLIST: pressing a
        line fills the row above, and the ordinary "Add it" records it — so every
        line is confirmed by the gesture somebody already knows, and there is no
        second way to receive anything.
      */}
      {onNote && place
        ? (
          <Section label="From a delivery note">
            <Group>
              <PickFile
                accept={["image/*"]}
                /*
                  ⚠️ THE TRANSPORT'S CEILING, BECAUSE THE PICTURE IS SHRUNK ON THE
                  WAY IN — see `shrunk`. Six megabytes was a guess at what a phone
                  produces, and it refuses the ones that produce more; the reason
                  the number was here at all was that nothing was making the
                  photograph smaller.
                */
                most={MOST_BYTES}
                says="Photograph the delivery note"
                under="Its lines become a list to work through"
                label="Choose a photo"
                busy={busy}
                onPick={(bytes, file) => {
                  void (async () => { onNote(await shrunk(bytes, file.type)); })();
                }}
              />

              <Await
                of={note}
                again={again}
                waiting={<RowsWaiting rows={4} lead={false} />}
                then={(lines) => {
                  if (!lines) return null;
                  /* ⚠️ AN EMPTY LIST IS A CORRECT ANSWER — a photograph of a
                     wall, or a page nothing could be read off. Saying so beats a
                     card that simply is not there. */
                  if (!lines.length) return <NoteRow>Nothing could be read off that</NoteRow>;
                  return (
                    <>
                      <NoteRow icon={glyphOf("model")}>
                        Read by a model. Check each line before you add it
                      </NoteRow>
                      {lines.map((line) => {
                        const at = keyOf(line);
                        return (
                          <AmountRow
                            key={at}
                            label={line.name || line.code}
                            under={[
                              line.lot ? `Lot ${line.lot}` : "",
                              /* ⚠️ SAID, NOT STORED. `line.expiry` is an ISO day
                                 because that is what a date is in a record; put
                                 straight into the row it made this list the one
                                 place in the product that writes a date the
                                 reader's own calendar does not. */
                              line.expiry ? sayDate(shown, line.expiry as Instant, "short") : "",
                              /* ⚠️ THE TICK IS THE POINT OF THE LIST. Thirty
                                 lines with no record of which are done is a page
                                 somebody loses their place in. */
                              done.has(at) ? "Added" : "",
                            ].filter(Boolean).join(" · ") || undefined}
                            amount={<Num value={line.quantity} />}
                            aside={done.has(at)
                              ? undefined
                              : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  isDisabled={busy}
                                  onPress={() => { onLine(line); }}
                                >
                                  Use it
                                </Button>
                              )}
                          />
                        );
                      })}
                    </>
                  );
                }}
              />
            </Group>
          </Section>
        )
        : null}

      {/*
        ⚠️ UNDO IS ON THIS SCREEN RATHER THAN IN A HISTORY, and that is what makes
        recording feel free. Somebody who cannot take back a mis-scan without
        finding a manager is somebody who stops scanning — and the offer
        disappears the moment it is no longer honest, because the operation
        refuses anything but the last thing you just did.
      */}
      {onUndo
        ? (
          <Group label="The last one">
            <Button variant="secondary" onPress={onUndo}>Take back the last one</Button>
          </Group>
        )
        : null}
    </Screen>
  );
}
