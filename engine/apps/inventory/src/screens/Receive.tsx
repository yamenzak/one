/**
 * RECEIVE — scan, how many, done.
 *
 * ⚠️ THE WORST OUTCOME IN THIS PRODUCT IS SOMEBODY NOT RECORDING SOMETHING
 * because a form demanded a field they did not have. Every decision below falls
 * out of that: the place is remembered between scans, the quantity starts at the
 * number the code implies, the questions a good label already answered are not
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
  Group, FieldRow, NoteRow, NumberInput, Screen, Section, Steps, TextInput,
  Viewfinder, notice, type Step,
} from "@engine/design";
import { Button } from "@heroui/react";
import type { Seen } from "./Scan.js";

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
}

export function Receive({
  title, place, seen, onRead, onForget, onReceive, onUndo, busy,
}: ReceiveProps) {
  /*
    ⚠️ THE QUANTITY STARTS AT WHAT THE CODE IMPLIES AND IS RE-SEEDED PER SCAN. A
    field holding the last item's number is how somebody receives eleven of the
    next thing — so the key of this state is the code, not the screen.
  */
  const [many, setMany] = React.useState(0);
  const [lot, setLot] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const code = seen?.value ?? "";

  React.useEffect(() => {
    setMany(seen ? Math.max(1, seen.pack) : 0);
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
        says={place ? "Scan the next thing, or another shelf" : "Scan the shelf you are standing at"}
        onRead={onRead}
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
                    under="Scanning it adds that many"
                  />
                )
                : null}

              <NumberInput
                label={seen.unit ? `How many ${seen.unit}` : "How many"}
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

              <Button variant="ghost" onPress={() => { onForget(); notice.ok("Cleared."); }}>
                Not that one
              </Button>
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
