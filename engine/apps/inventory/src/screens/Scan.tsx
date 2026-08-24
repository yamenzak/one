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
  Await, FieldRow, Group, Lookup, NoteRow, PickFile, RowsWaiting, Screen, Section,
  Viewfinder, glyphOf, type Loaded,
  shrunk,
} from "@engine/design";
import { Button } from "@heroui/react";
import { MOST_BYTES } from "@engine/kernel";
/* ⚠️ ONE BOX IS ONE CODE — the fold the reader has no way to know. */
import { foldScan } from "../code.js";


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

/**
 * WHAT A MODEL THINKS A THING IS — a suggestion, and the screen says so.
 *
 * ⚠️ NOTHING HERE IS RECORDED UNTIL SOMEBODY PRESSES. A model fills anything and
 * commits nothing that carries consequence: this is a form that arrived filled
 * in, and the person adding the product is the one who agrees to it.
 */
export interface Guess {
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly unit: string;
  readonly pack: number;
  readonly tracking: string;
  /** ⚠️ Why that rung — what makes it a suggestion rather than a magic answer. */
  readonly why: string;
  readonly storage: string;
  readonly hazards: readonly string[];
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
  /**
   * ⚠️ WHAT A MODEL MADE OF IT. `null` until somebody asks — this is never
   * fetched on arrival, because a question costs credits and nobody asked one.
   */
  readonly guess: Loaded<Guess | null>;
  /** Ask what the scanned code is. Absent where the deployment cannot ask. */
  readonly onIdentify?: () => void;
  /** A photograph of a label, as a `data:` URL. */
  readonly onLabel?: (image: string) => void;
  /** Record the suggestion as a new product, with this code attached to it. */
  readonly onAdd: (of: Guess) => void;
  readonly busy?: boolean;
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

/* ⚠️ THE RUNG IN WORDS, AND WHY IT MATTERS THAT IT IS NOT THE COLUMN'S SPELLING.
   "batched" is what the database holds; "Kept per delivery" is what somebody
   agrees or disagrees with, and this row exists to be disagreed with. */
const RUNG: Readonly<Record<string, string>> = {
  listed: "Listed — never counted",
  counted: "Counted — a number per place",
  batched: "Batched — deliveries kept apart",
  itemised: "Itemised — one of a kind",
  assembled: "Assembled from other things",
};

export function Scan({
  title, of, products, onRead, onOpen, onPlace, onLearn, again, paused,
  guess, onIdentify, onLabel, onAdd, busy,
}: ScanProps) {
  /* ⚠️ HELD HERE RATHER THAN ASKED FOR TWICE. The answer to "what is this?" is
     one choice and one press, and a `Lookup` that reset between renders would
     make the second press choose nothing. */
  const [attachTo, setAttachTo] = React.useState<string | null>(null);

  const seen = of.status === "ready" ? of.data : null;
  const said = guess.status === "ready" ? guess.data : null;

  /*
    ⚠️ ONE ACT, CHOSEN BY WHAT WAS SCANNED. `undefined` while there is nothing to
    do about anything — a docked button that does nothing is the one control on
    the screen somebody will press first.

    ⚠️ AND A SUGGESTION TAKES THE DOCK WHEN THERE IS ONE, because it is then the
    thing on the screen: a filled-in product waiting for somebody to agree with
    it. Attaching the code to something that already exists is still there, in
    the card, for the case where the guess is wrong.
  */
  const does = said?.name
    ? {
      op: "stock.receive",
      label: "Add it",
      onDo: () => { onAdd(said); },
      disabled: busy === true,
    }
    : !seen
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
              /* ⚠️ ONE BOX IS ONE CODE — see `foldScan`. A pack carrying an EAN-13
                 and a DataMatrix decodes as both, in an unstable order. */
              fold={foldScan}
        says="Point it at a barcode, or at one of our shelf labels"
        onRead={onRead}
        typed={{
          label: "Or type the code",
          placeholder: "What is printed on it",
          help: "A handheld scanner types here by itself",
        }}
        paused={paused}
      />

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
                  {/*
                    ⚠️ THE ANSWER TO THE ONBOARDING TAX, AND IT IS A BUTTON
                    RATHER THAN AUTOMATIC. Asking costs credits, and asking on
                    every unknown scan would spend them on the codes somebody was
                    only checking. A press is what says the question is wanted.
                  */}
                  {onIdentify
                    ? (
                      <Button variant="secondary" isDisabled={busy} onPress={onIdentify}>
                        Ask what it is
                      </Button>
                    )
                    : null}
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

      {/*
        ⚠️ THE PATH FOR EVERYTHING WITH NO BARCODE, OR ONE THAT WILL NOT SCAN,
        which in a workshop or a kitchen is most of it. It reads the words, the
        pack size and the pictograms — and the pictograms are the fact no
        catalogue lookup carries and nobody ever types in.
      */}
      {onLabel
        ? (
          <Section label="No barcode?">
            <Group>
              <PickFile
                accept={["image/*"]}
                /* ⚠️ A PHONE PHOTOGRAPH IS FOUR MEGABYTES AND A MODEL DOES NOT
                   NEED MORE. The ceiling is here rather than at the door because
                   a file refused after it was uploaded is a wait somebody sat
                   through for nothing. */
                /*
                  ⚠️ THE TRANSPORT'S CEILING, BECAUSE THE PICTURE IS SHRUNK ON THE
                  WAY IN — see `shrunk`. Six megabytes was a guess at what a phone
                  produces, and it refuses the ones that produce more; the reason
                  the number was here at all was that nothing was making the
                  photograph smaller.
                */
                most={MOST_BYTES}
                says="Photograph the label"
                under="It reads the name, the size and the hazard symbols"
                label="Choose a photo"
                busy={busy}
                onPick={(bytes, file) => {
                  void (async () => { onLabel(await shrunk(bytes, file.type)); })();
                }}
              />
            </Group>
          </Section>
        )
        : null}

      {/*
        ⚠️ A SUGGESTION, AND THE SCREEN SAYS SO IN THE HEADING. Every field below
        arrived from a model; nothing is recorded until the docked act is
        pressed. A card headed with the product's name and no other signal is a
        card people read as a record that already exists.
      */}
      <Await
        of={guess}
        again={again}
        waiting={<RowsWaiting rows={4} lead={false} />}
        then={(got) => (got?.name
          ? (
            <Section label="What it looks like">
              <Group>
                <NoteRow icon={glyphOf("model")}>
                  Filled in by a model. Check it before you add it
                </NoteRow>
                <FieldRow label="Name" value={got.name} />
                {got.brand ? <FieldRow label="Brand" value={got.brand} /> : null}
                {got.category ? <FieldRow label="Category" value={got.category} /> : null}
                {got.unit ? <FieldRow label="Counted in" value={got.unit} /> : null}
                {got.pack > 1
                  ? <FieldRow label="This one holds" value={`${got.pack} ${got.unit}`} />
                  : null}
                {/* ⚠️ THE RUNG WITH ITS REASON UNDER IT. "Batched" on its own is
                    a magic answer; "batched — it has an expiry date" is one
                    somebody agrees with, or does not, in half a second. */}
                {got.tracking
                  ? (
                    <FieldRow
                      label="Tracked as"
                      value={RUNG[got.tracking] ?? got.tracking}
                      under={got.why || undefined}
                    />
                  )
                  : null}
                {got.storage ? <FieldRow label="How to store it" value={got.storage} /> : null}
                {/* ⚠️ HAZARDS ARE SHOWN AND NEVER FILLED IN. A wrong class on a
                    printed label is a legal document that is wrong, and the
                    person who printed it answers for it. */}
                {got.hazards.length
                  ? (
                    <NoteRow icon={glyphOf("alert")}>
                      <span data-ink="warning">
                        It may be {got.hazards.join(", ").toLowerCase()} — check the label
                      </span>
                    </NoteRow>
                  )
                  : null}
              </Group>
            </Section>
          )
          : null)}
      />
    </Screen>
  );
}
