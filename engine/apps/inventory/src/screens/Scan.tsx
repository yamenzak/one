/**
 * SCAN — point the camera at a thing and the app says what it is.
 *
 * ⚠️ THE CAMERA NEVER UNMOUNTS WHILE THE ANSWER LOADS, and that is why this
 * screen does not hand its `of` to `Screen`. A shape's waiting state replaces
 * the content, so a resolve between scans would tear the video down and ask for
 * the camera again — a black flash and a permission prompt, twice a second, in
 * the middle of somebody's work. The frame stays; what changes is the card under
 * it.
 *
 * ⚠️ WHAT THE CODE TURNED OUT TO BE DECIDES THE WHOLE SCREEN, and the three
 * outcomes are genuinely different acts. One of OUR labels names a shelf, so the
 * session GOES there. A known product is a thing to open. An unknown code is a
 * question — "what is this?" — and answering it teaches the catalogue for ever,
 * which is the feature that makes eight hundred products enterable at all.
 *
 * ⚠️ AND THE ACT IS IN THE CROWN RATHER THAN IN THE CARD. Whatever the scan
 * turned out to be, there is exactly one thing to do about it — so it lands
 * where every other screen's one thing lands, docked at the thumb on a phone.
 * Three cards each carrying their own button would be three different places to
 * look for the same gesture.
 *
 * ⚠️ AND A SCAN NEVER MOVES STOCK FROM HERE. Receiving and counting are their
 * own screens with their own quantity and their own capture provenance; a scan
 * surface that silently added one of something would be the fastest way in the
 * product to record a number nobody meant.
 */

import * as React from "react";
import {
  Await, FieldRow, Group, Lookup, NoteRow, RowsWaiting, Screen, Section,
  TextInput, Viewfinder, type Loaded,
} from "@engine/design";

/** What `code.resolve` answered — the app's shape, narrowed at the point of use. */
export interface Seen {
  readonly found: boolean;
  readonly kind: string;
  readonly value: string;
  /** ⚠️ Set only for one of our own labels: a shelf, a batch, a unit. */
  readonly ours: string;
  readonly product: string;
  readonly name: string;
  readonly tracking: string;
  readonly unit: string;
  readonly pack: number;
  readonly lot: string;
  readonly expiry: string;
  /** ⚠️ What the screen must still ask for, decided by the resolver. */
  readonly needs: string;
}

export interface ScanProps {
  readonly title?: string;
  /** The last thing scanned. `null` before anything has been. */
  readonly of: Loaded<Seen | null>;
  /** The catalogue, for attaching an unknown code to something. */
  readonly products: readonly { readonly id: string; readonly label: string }[];
  readonly onRead: (code: string) => void;
  readonly onOpen: (product: string) => void;
  /** ⚠️ One of our own shelf labels — the session goes there. */
  readonly onPlace: (code: string) => void;
  readonly onLearn: (product: string) => void;
  readonly again: () => void;
  /** The camera stands down without the screen unmounting. */
  readonly paused?: boolean;
}

/* ⚠️ THE KIND, IN WORDS SOMEBODY DID NOT HAVE TO LEARN. `gs1` on a screen is the
   standards body's name for a symbology, shown to a storeman. */
const SAID: Readonly<Record<string, string>> = {
  gtin: "Barcode", gs1: "Barcode with a lot and a date",
  national: "National code", part: "Part number",
  ours: "One of ours", other: "Code",
};

const OURS: Readonly<Record<string, string>> = {
  location: "a place", batch: "a batch", unit: "one object", product: "a product",
};

export function Scan({
  title, of, products, onRead, onOpen, onPlace, onLearn, again, paused,
}: ScanProps) {
  /*
    ⚠️ THE FIELD IS ALWAYS ON THE SCREEN, NOT BEHIND THE CAMERA'S FAILURE. Two
    reasons, and the second is the one that pays: a code somebody reads off a
    box is faster to type than to line up, and MOST WAREHOUSE SCANNERS ARE
    KEYBOARD WEDGES — they type into whatever has the caret and press Enter. A
    visible field that answers Enter is a hardware integration nobody had to
    write; the same field hidden behind "the camera did not work" is a device
    that appears to be broken.
  */
  const [typed, setTyped] = React.useState("");
  const at = React.useRef<HTMLDivElement>(null);

  const look = () => {
    const code = typed.trim();
    if (!code) return;
    onRead(code);
    setTyped("");
  };
  /* ⚠️ HELD HERE RATHER THAN ASKED FOR TWICE. The answer to "what is this?" is
     one choice and one press, and a `Lookup` that reset between renders would
     make the second press choose nothing. */
  const [attachTo, setAttachTo] = React.useState<string | null>(null);

  const seen = of.status === "ready" ? of.data : null;

  /*
    ⚠️ ONE ACT, CHOSEN BY WHAT WAS SCANNED. `undefined` while there is nothing to
    do about anything — a docked button that does nothing is the one control on
    the screen somebody will press first.
  */
  const does = !seen
    ? undefined
    : seen.ours === "location"
      ? { label: "Go to this place", onDo: () => { onPlace(seen.value); } }
      : seen.ours
        ? undefined
        : seen.found
          ? { label: "Open it", onDo: () => { onOpen(seen.product); } }
          : {
            label: "Attach this code",
            onDo: () => { if (attachTo) onLearn(attachTo); },
            disabled: !attachTo,
          };

  return (
    <Screen shape="detail" title={title} does={does}>
      <Viewfinder
        says="Point it at a barcode, or at one of our shelf labels"
        onRead={onRead}
        onType={() => at.current?.querySelector("input")?.focus()}
        typeLabel="Type it below"
        paused={paused}
      />

      <div ref={at}>
        <TextInput
          label="Or type the code"
          value={typed}
          onChange={setTyped}
          onSubmit={look}
          placeholder="What is printed on it"
          help="A handheld scanner types here by itself"
          name="code"
        />
      </div>

      <Await
        of={of}
        again={again}
        /* ⚠️ SHAPED LIKE THE CARD THAT IS COMING, and small — the camera above is
           still live, so a full-screen skeleton here would be a page pretending
           to load over a working viewfinder. */
        waiting={<RowsWaiting rows={2} lead={false} />}
        then={(got) => {
          /* ⚠️ NOTHING SCANNED YET IS NOT AN EMPTY STATE. The camera above is
             the whole screen at this moment, and a "nothing here" card under a
             live viewfinder reads as a fault rather than as a beginning. */
          if (!got) return <NoteRow>Whatever you scan will appear here</NoteRow>;

          if (got.ours) {
            return (
              <Group label={`This is ${OURS[got.ours] ?? "one of ours"}`}>
                <FieldRow label="Label" value={got.value} />
                {/* ⚠️ SAID RATHER THAN OFFERED. A batch label and a unit label
                    are real and their screens are not built yet — a button that
                    did nothing would be worse than a sentence that is true. */}
                {got.ours === "location" ? null : <NoteRow>Its own screen is not built yet</NoteRow>}
              </Group>
            );
          }

          if (!got.found) {
            /* ⚠️ THE QUESTION THAT BUILDS THE CATALOGUE. Nobody types in eight
               hundred barcodes; they scan what they are holding, say what it is
               once, and the second scan is instant. */
            return (
              <Section label="What is this?">
                <Group>
                  <FieldRow label="Code" value={got.value} />
                  <FieldRow label="Kind" value={SAID[got.kind] ?? "Code"} />
                  <NoteRow>Nothing here has this code yet</NoteRow>
                  <Lookup
                    label="It belongs to"
                    value={attachTo}
                    onChange={setAttachTo}
                    options={products}
                    placeholder="Find the product"
                  />
                </Group>
              </Section>
            );
          }

          const needs = got.needs ? got.needs.split(",").filter(Boolean) : [];
          return (
            <Group label={got.name}>
              <FieldRow label="Code" value={got.value} />
              {/* ⚠️ THE PACK LEVEL IS SAID ONLY WHERE IT IS NOT ONE, because on
                  a single box it is noise on every row — and where it is ten it
                  is the difference between a right number and a wrong one. */}
              {got.pack > 1
                ? <FieldRow label="This one holds" value={`${got.pack} ${got.unit}`} />
                : null}
              {got.lot ? <FieldRow label="Lot" value={got.lot} /> : null}
              {got.expiry ? <FieldRow label="Expires" value={got.expiry} /> : null}
              {/* ⚠️ WHAT THE LABEL DID NOT CARRY, SAID RATHER THAN ASKED FOR
                  HERE. Receiving is its own screen; this one is telling somebody
                  what they will be asked when they get there. */}
              {needs.length
                ? (
                  <NoteRow>
                    <span data-ink="warning">
                      This label does not carry the {needs.join(" or the ")}
                    </span>
                  </NoteRow>
                )
                : null}
            </Group>
          );
        }}
      />
    </Screen>
  );
}
