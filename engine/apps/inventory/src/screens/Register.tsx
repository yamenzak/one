/**
 * REGISTER A PRODUCT — a story told one question at a time.
 *
 * ⚠️ THE ONBOARDING TAX IS WHY PEOPLE ABANDON INVENTORY APPS. Eight hundred
 * products typed in by hand is a project nobody finishes, so the first thing
 * here is a camera: six photographs of a thing on a bench come back named,
 * described, categorised and with a rung suggested. Everything after it is the
 * same set of questions somebody can answer by hand, always, with nothing hidden
 * behind a mode.
 *
 * ⚠️ AND THE SECOND TAX IS TRAINING, WHICH IS THE ONE THIS REWRITE IS ABOUT.
 * The four steps this replaces were four HEADINGS over groups of fields —
 * "What it is", "Barcodes", "Counting", "Keeping" — and a heading names the area
 * of the database being written. `Tracked as: [Listed] [Counted] [Batched]
 * [Itemised]` is four words nobody can choose between without being taught, and
 * taught is an induction, a wiki page, and a person in the warehouse who knows.
 * Every one of those is a cost this product pays forever, per customer, per new
 * employee.
 *
 * ⚠️ SO EVERY STEP IS A QUESTION WITH AN ANSWER SAID BACK IN THE SAME WORDS. "How
 * closely do you follow it?" — and the moment somebody chooses, the screen says
 * *"Each delivery is kept apart, so you can expire one or recall one"*. The
 * sentences are `saying.ts`, pure and tested, because a sentence assembled
 * inline reads "1 tablets in a box" on the path nobody clicked.
 *
 * ⚠️ THE ORDER IS THE ORDER SOMEBODY DESCRIBES A THING IN, NOT THE ORDER THE
 * TABLE'S COLUMNS ARE IN. What it looks like, what it is, what kind of thing it
 * is, how closely you follow it, what you count it in, what it comes inside,
 * what is printed on it, how long it keeps, where more comes from.
 *
 * ⚠️ AND A STEP THAT DOES NOT APPLY IS NOT ASKED. A product you never count has
 * no packaging question — how many are in a box is a fact with no consequence
 * when nothing is counting them. `Story` takes it out of the flow entirely
 * rather than greying it out.
 *
 * ⚠️ A PAGE RATHER THAN A DRAWER, AND AN ADDRESS IS THE HALF A DRAWER CANNOT
 * HAVE. Home's first action, a checklist step, an empty catalogue and a scan
 * that resolved to nothing all want to send somebody HERE — and a page survives
 * a reload, a shared link and the back gesture.
 *
 * ⚠️ EVERYTHING ELSE — the steps, the dots, the recap, the dock's Back and Next,
 * the phone's own back gesture — IS `Story`'s, in `@engine/design`. This file is
 * nine questions and their sentences.
 */

import * as React from "react";
import {
  ActionRow, Await, Bars, Group, NoteRow, NumberInput, OneOf, PickFile, Row,
  RowsWaiting, SAYS_KIND, Segmented, Spacer, Story, Words,
  Lookup, Rail, TextInput, ToggleRow, Viewfinder, Written, kindOf,
  glyphOf, shrunk, useShown, useTelling, type Ask, type Loaded, type Option,
} from "@engine/design";
import { Button } from "@heroui/react";
import { MOST_BYTES, sayList } from "@engine/kernel";
/* ⚠️ ONE BOX IS ONE CODE — the fold the reader has no way to know. */
import { foldScan } from "../code.js";
import {
  sayCodes, sayCounting, sayGettingMore, sayKeeping, sayNamed, sayPacking, sayPhotos,
  sayTracking,
} from "../saying.js";
import { Ladder, type Rung } from "./Ladder.js";

/** ⚠️ Up to six — see `product.see`: past that the answer stops improving. */
export const MOST_PHOTOS = 6;

/** What a model made of the photographs. Every field is a suggestion. */
export interface Guessed {
  readonly name: string;
  readonly brand: string;
  readonly description: string;
  readonly unit: string;
  readonly pack: number;
  readonly tracking: string;
  readonly why: string;
  readonly storage: string;
  readonly handling: string;
  readonly tags: readonly string[];
  /** ⚠️ Durations, never dates — a printed expiry belongs to one delivery. */
  readonly shelfDays: number;
  readonly openDays: number;
  /**
   * ⚠️ THE DATE ON THIS BOX, WHICH IS NOT A SHELF LIFE AND IS REPORTED SO THE
   * SCREEN CAN SAY WHY IT LEFT ONE BLANK. A pharmaceutical carton prints "use
   * by 08/2029" and no manufacturing date, so no duration can be worked out —
   * the model is right to answer zero, and a person who has just photographed a
   * date sitting beside an empty "Shelf life" reasonably reads that as a
   * failure. It is also the wrong FIELD: this date belongs to one delivery, and
   * is captured from the batch when the box is received.
   */
  readonly labelExpiry: string;
  /** ⚠️ A pictogram was SEEN. Which class it declares is the label reader's. */
  readonly hazardous: boolean;
}

/** Something already in the catalogue that looks like the one being typed. */
export interface Match {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
  /** `same code` · `same name and brand` · `similar name` — see `product.resembling`. */
  readonly why: string;
}

export interface CodeRow {
  readonly value: string;
  readonly kind: string;
  /** ⚠️ How many base units the thing this code is printed on holds. */
  readonly pack: number;
}

export interface SourceRow {
  readonly supplier: string;
  readonly ref: string;
  readonly leadDays: number | null;
}

/** Everything the flow sends. One write — see `product.register`. */
export interface Registering {
  readonly name: string;
  readonly brand: string;
  readonly description: string;
  /** ⚠️ How it is packaged. Empty for most things — see `Ladder`. */
  readonly levels: readonly Rung[];
  readonly unit: string;
  readonly tracking: string;
  readonly whole: boolean;
  readonly par: number | null;
  readonly storage: string;
  readonly handling: string;
  readonly shelfDays: number | null;
  readonly openDays: number | null;
  readonly supplier: string;
  readonly reorder: boolean;
  readonly reorderQty: number | null;
  readonly codes: readonly CodeRow[];
  readonly tags: readonly string[];
  readonly sources: readonly SourceRow[];
  readonly photos: readonly string[];
  readonly anyway: boolean;
}

export interface RegisterProps {
  /** ⚠️ The manifest's, not this file's — see every other screen here. */
  readonly title?: string;
  /** Where the back arrow goes from the first question. */
  readonly back: () => void;
  /**
   * ⚠️ THE WORDS THIS WORKSPACE ALREADY FILES THINGS UNDER. Sent with the
   * photographs so a model CHOOSES from them, and offered in the `Words` control
   * so a person does too — one vocabulary, reached two ways.
   */
  readonly knownTags: readonly Option[];
  /**
   * ⚠️ THE UNITS THIS WORKSPACE ALREADY COUNTS IN. Same argument as the tags one
   * word over: typed free, a catalogue collects `box`, `Box`, `boxes` and `BX`
   * as four units that are one, on products that can then never be totalled.
   * Offered rather than enforced — anything typed is still accepted.
   */
  readonly knownUnits: readonly Option[];
  readonly suppliers: readonly Option[];
  /**
   * ⚠️ WHAT ALREADY LOOKS LIKE THIS, WHILE IT IS STILL BEING TYPED. `null` means
   * nothing has been asked yet, which is not the same as "nothing matched" —
   * an empty list under a name is a claim, and it is the claim that makes
   * somebody stop looking.
   */
  readonly resembles: Loaded<readonly Match[] | null>;
  readonly onLook: (of: { name: string; brand: string }) => void;
  /**
   * ⚠️ ABSENT WHERE THE DEPLOYMENT CANNOT ASK A MODEL, and then the camera block
   * is a plain uploader. A button that reserves credits nobody has is worse than
   * no button.
   */
  readonly onIdentify?: (photos: readonly string[]) => void;
  /** ⚠️ `null` until somebody asks — identifying costs credits and nobody has. */
  readonly guessed: Loaded<Guessed | null>;
  readonly onRegister: (of: Registering) => void;
  readonly busy?: boolean;
  readonly again: () => void;
}

/*
  ⚠️ THE LADDER, IN THE ORDER SOMEBODY CLIMBS IT, and `assembled` is absent on
  purpose. A kit is made out of other products rather than declared as one, so
  offering it here would be a rung nothing behind this flow can honour.

  ⚠️ AND THE HELP IS THE CONTROL'S REASON FOR EXISTING, WHICH `Segmented` DROPS.
  This was a segmented control and `Segmented` renders `o.label` and nothing
  else — so every one of these sentences was written, committed, and reached
  nobody. Its own header says segments are "for a choice worn on the surface —
  a view, a period, a mode — never for data entry", which this is: the single
  most consequential field on the product record.
*/
const RUNGS: readonly Option[] = [
  { id: "listed", label: "Not counted", help: "It is on the catalogue and you never count it" },
  { id: "counted", label: "Counted", help: "You keep a running number of how many there are" },
  { id: "batched", label: "By delivery", help: "Each delivery stays separate — for expiry dates and recalls" },
  { id: "itemised", label: "One by one", help: "Every single one is followed by its own serial number" },
];

/** ⚠️ It comes as it is, or it comes inside something — see the packing step. */
const PACKED: readonly Option[] = [
  { id: "loose", label: "As it is" },
  { id: "packed", label: "Inside packaging" },
];

/**
 * ⚠️ WHAT A CODE IS, WORKED OUT RATHER THAN ASKED. The step used to offer four
 * options — Barcode, QR, Square code, Other — and every one of them was a
 * SYMBOLOGY, which is not what the field holds. `CODE_KINDS` is what a code
 * NAMES: a retail GTIN, a supplier's part number, one of our own labels. The
 * control was asking a question about the picture and storing the answer in a
 * column about the namespace.
 *
 * ⚠️ AND BOTH ARE KNOWABLE WITHOUT ASKING. Eight, twelve or thirteen digits
 * whose last one is the weighted sum of the rest is a GTIN and nothing else is;
 * the camera hands back the symbology it decoded. A form asking a person to
 * re-state what the machine read is a form nobody can get right more often than
 * the machine.
 */
const namespaceOf = (value: string): string =>
  (kindOf(value) === "other" ? "other" : "gtin");

/** ⚠️ The symbology, which is what a person recognises the picture by. */
const sayKind = (value: string): string => SAYS_KIND[kindOf(value)];

/* ⚠️ A NUMBER FIELD THAT IS ALLOWED TO BE UNANSWERED. `0` and "nobody said" are
   different facts about a threshold: the first tells you at nothing left, the
   second tells you never. */
const numberOr = (of: number | null): number => (of === null ? 0 : of);

export function Register({
  title, back, knownTags, knownUnits, suppliers, resembles, onLook, onIdentify,
  guessed, onRegister, busy, again,
}: RegisterProps) {
  /* ⚠️ THE ONE CHANNEL — see `telling.tsx`. Promoting a photograph reorders a
     list somebody is looking at, which is a change they made and should hear. */
  const tell = useTelling();
  /* ⚠️ "gloves, masks and gowns" is the locale's word for `and` — see `sayList`. */
  const shown = useShown();
  const [photos, setPhotos] = React.useState<readonly string[]>([]);
  const [name, setName] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [unit, setUnit] = React.useState("");
  /* ⚠️ HOW IT IS PACKAGED — see `Ladder` and `packing.ts`. Empty for most
     things, which is why the editor draws one blank row and no more. */
  const [levels, setLevels] = React.useState<readonly Rung[]>([]);
  const [packed, setPacked] = React.useState("loose");
  const [tracking, setTracking] = React.useState("counted");
  const [whole, setWhole] = React.useState(true);
  const [par, setPar] = React.useState<number | null>(null);
  const [storage, setStorage] = React.useState("");
  const [handling, setHandling] = React.useState("");
  const [shelfDays, setShelfDays] = React.useState<number | null>(null);
  const [openDays, setOpenDays] = React.useState<number | null>(null);
  const [tags, setTags] = React.useState<readonly string[]>([]);
  /* ⚠️ EMPTY, NOT ONE BLANK ROW. A row with no code in it was a card with no
     barcode on it and a pack size for a thing nobody had named. */
  const [codes, setCodes] = React.useState<readonly CodeRow[]>([]);
  /* ⚠️ WHAT THE MODEL READ OFF THE BOX, WAITING FOR A BARCODE TO BELONG TO —
     see the extraction below. */
  const [readPack, setReadPack] = React.useState<number | null>(null);
  const [sources, setSources] = React.useState<readonly SourceRow[]>([]);
  const [supplier, setSupplier] = React.useState("");
  const [reorder, setReorder] = React.useState(false);
  const [reorderQty, setReorderQty] = React.useState<number | null>(null);
  const [anyway, setAnyway] = React.useState(false);
  const [where, setWhere] = React.useState("photos");

  /*
    ⚠️ FILLS WHAT IS EMPTY AND ARGUES WITH NOTHING. Somebody who typed a name and
    then photographed the box meant the name they typed — see the header. The
    tags are a UNION for the same reason: a word somebody chose is not a word a
    model gets to remove.
  */
  const answer = guessed.status === "ready" ? guessed.data : null;
  React.useEffect(() => {
    if (!answer) return;
    /*
      ⚠️ AN ANSWER MOVES SOMEBODY ON, RATHER THAN FILLING IN A SCREEN THEY ARE NOT
      LOOKING AT. Pressing "fill this in from the photographs" and staying on the
      photographs is a button whose whole effect is somewhere else. It lands on
      the first question the answer actually touched, with the values in place —
      and the recap above every question after it is the check.
    */
    setWhere((held) => (held === "photos" ? "what" : held));
    setName((held) => held || answer.name);
    setBrand((held) => held || answer.brand);
    setDescription((held) => held || answer.description);
    setUnit((held) => held || answer.unit);
    setStorage((held) => held || answer.storage);
    setHandling((held) => held || answer.handling);
    /* ⚠️ ZERO IS "NOTHING SAID SO", NOT A SHELF LIFE OF NONE — see the field. */
    if (answer.shelfDays > 0) setShelfDays((held) => held ?? answer.shelfDays);
    if (answer.openDays > 0) setOpenDays((held) => held ?? answer.openDays);
    if (answer.tracking) setTracking((held) => (held === "counted" ? answer.tracking : held));
    setTags((held) => {
      const seen = new Set(held.map((t) => t.toLowerCase()));
      return [...held, ...answer.tags.filter((t: string) => !seen.has(t.toLowerCase()))];
    });
    /*
      ⚠️ THE PACK GOES ON THE FIRST BARCODE, NOT ON THE PRODUCT. "It holds 30" is
      a fact about the box the code is printed on — a product counted in gloves
      has no pack of its own, and a carton and an inner both do.

      ⚠️ AND IT IS REMEMBERED RATHER THAN WRITTEN, WHICH IS THE WHOLE FIX. This
      mapped over `codes` — which is EMPTY when the answer arrives, because the
      photographs are the first question and the barcodes are the seventh.
      `[].map()` is `[]`, so a model that had correctly read "30 Filmtabletten"
      off the box had its answer dropped without a word, every time. Held here,
      it becomes the first scanned code's pack when there is finally a code to
      put it on.
    */
    if (answer.pack > 1) setReadPack(answer.pack);
  }, [answer]);

  /*
    ⚠️ ASKED AS THEY TYPE, SETTLED BEFORE THEY SAVE. A catalogue fills with
    duplicates one careful person at a time — somebody searches "gloves nitrile"
    in a hurry, finds nothing, and adds a second row that half the stock then
    lives under. The moment to say so is while the name is being typed.

    ⚠️ AND IT IS DEBOUNCED RATHER THAN PER KEYSTROKE. A read on every letter of
    "nitrile gloves" is fourteen round trips for one answer, and the one that
    matters is the last.
  */
  React.useEffect(() => {
    if (name.trim().length < 3) return undefined;
    const at = setTimeout(() => { onLook({ name, brand }); }, 400);
    return () => { clearTimeout(at); };
  }, [name, brand, onLook]);

  const matches = resembles.status === "ready" ? resembles.data : null;
  const strong = (matches ?? []).some((m: Match) => m.why !== "similar name");

  const setCode = (at: number, next: Partial<CodeRow>) => {
    setCodes((held) => held.map((row, i) => (i === at ? { ...row, ...next } : row)));
  };

  /* ⚠️ ONLY THE ROWS SOMEBODY FINISHED. A half-typed rung — a name with no
     number — is refused at the door, so sending it would turn an unfinished line
     into a refusal about a field the person had not got to yet. */
  const rungs = levels.filter((one) => one.name.trim() && one.per > 1);

  const send = () => {
    onRegister({
      name: name.trim(), brand: brand.trim(), description: description.trim(),
      unit: unit.trim(), tracking, whole, par,
      /* ⚠️ "As it is" MEANS NO LADDER, WHATEVER WAS TYPED BEFORE IT WAS CHOSEN.
         Somebody who filled in two rungs and then said the thing comes loose has
         changed their mind, and sending the rungs anyway would register a
         packaging they had just told the screen it does not have. */
      levels: packed === "packed" ? rungs : [],
      storage: storage.trim(), handling: handling.trim(),
      shelfDays, openDays,
      supplier, reorder, reorderQty,
      codes: codes.filter((one) => one.value.trim().length > 0),
      tags, sources, photos, anyway,
    });
  };

  const orderedFrom = suppliers.find((one) => one.id === supplier)?.label ?? null;

  /*
    ⚠️ NINE QUESTIONS, EACH ANSWERABLE WITHOUT KNOWING THE NEXT — which is the
    property that makes a step a step rather than a page break. Every one fits a
    phone without scrolling, and every one carries the sentence its answer makes.
  */
  const ASKS: readonly Ask[] = [
    {
      id: "photos",
      ask: "Start with a photo?",
      under: "Photograph it and the rest fills itself in",
      says: sayPhotos(photos.length, Boolean(answer)),
      children: (
        <>
          <PickFile
            accept={["image/*"]}
            /*
              ⚠️ THE TRANSPORT'S OWN CEILING, NOT A NUMBER PICKED HERE. This was
              two megabytes, which refuses every photograph a phone has taken
              since about 2015 — chosen because `product.see` caps a batch at
              eight and nothing was making the pictures smaller. `shrunk` is what
              was missing; with it, six photographs off any phone come to well
              under that, and the only ceiling left is what `media.upload` will
              actually accept.
            */
            most={MOST_BYTES}
            says={photos.length ? "Add another angle" : "Take a photo of the product"}
            /*
              ⚠️ THE LABEL IS NAMED, BECAUSE IT IS THE PICTURE THAT PAYS. Net
              contents, the printed name, the storage line and the shelf life are
              on the label and nowhere else on the packaging — somebody who
              photographs three sides of a box and not the back gets a worse
              answer and never learns why.
            */
            under={photos.length
              ? `${photos.length} of ${MOST_PHOTOS}. The first one is the one people check against`
              : "The front, the back and the label. The label is where the detail is"}
            label="Take a photo"
            busy={busy}
            /*
              ⚠️ AS MANY AS THERE IS ROOM FOR, IN ONE TRIP. The six a person takes
              of a box are adjacent in their camera roll a minute later, and six
              trips through the picker to fetch six adjacent files was the control
              charging somebody for a limit nobody had decided.
            */
            atOnce={Math.max(1, MOST_PHOTOS - photos.length)}
            /*
              ⚠️ SHRUNK ON THE WAY IN, ONCE, RATHER THAN ON THE WAY OUT. Held at
              full size the six would be forty megabytes in React state on a
              phone — and the two places that send them (the upload and the model)
              would each have to remember to reduce, which is two chances to
              forget and one of them is the one that costs credits.
            */
            onPick={(bytes, file) => {
              void (async () => {
                const small = await shrunk(bytes, file.type);
                setPhotos((held) => (held.length >= MOST_PHOTOS ? held : [...held, small]));
              })();
            }}
          />

          {/*
            ⚠️ A STRIP THAT SCROLLS, NOT A GRID THAT REFLOWS. A grid on a phone
            spends the width it has on however many tiles happen to exist, so six
            photographs are six thumbnails too small to check. A strip gives each
            one a size that does not change with the count, and the gesture for
            "what else did I take" is the one a phone already teaches.

            ⚠️ THE FIRST TILE IS FIRST, AND THAT IS ALL THE MARKING IT NEEDS. It
            becomes `product.photo` — what somebody checks the thing in their hand
            against — and a caption saying so on every tile is texture.
          */}
          {photos.length ? (
            <Rail wide="tile" space="tight">
              {photos.map((one, at) => (
                <div key={one.slice(-24)} className="relative overflow-hidden rounded-xl">
                  <img
                    src={one}
                    alt={at === 0 ? "The picture of record" : `Angle ${at + 1}`}
                    className="aspect-square h-full w-full object-cover"
                  />
                  {/* ⚠️ ON THE TILE, NOT IN A ROW UNDER IT. A remove that is not
                      on the thing it removes is a remove somebody has to count
                      tiles to trust. */}
                  <div className="absolute right-1 top-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={at === 0 ? "Remove the picture of record" : `Remove angle ${at + 1}`}
                      onPress={() => { setPhotos((held) => held.filter((_, i) => i !== at)); }}
                    >
                      ✕
                    </Button>
                  </div>
                  {/*
                    ⚠️ AND PROMOTING ONE IS A MOVE, NOT A FLAG. Which photograph is
                    the picture of record is decided by ORDER — the first is the
                    one — so "use this one" puts it first rather than setting a
                    field beside it. One fact, one place: a `primary` flag
                    alongside an ordered list is two answers to the same question,
                    and they disagree the first time somebody deletes the flagged
                    one.

                    ⚠️ OFFERED ONLY WHERE IT WOULD DO SOMETHING. On the tile that
                    is already first it is a control that changes nothing, which
                    is read as broken.
                  */}
                  {at === 0 ? null : (
                    <div className="absolute inset-x-1 bottom-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Make angle ${at + 1} the picture of record`}
                        onPress={() => {
                          setPhotos((held) => [
                            held[at] as string,
                            ...held.filter((_, i) => i !== at),
                          ]);
                          tell.did("Now the picture of record");
                        }}
                      >
                        Use this
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </Rail>
          ) : null}

          {/*
            ⚠️ ONE PRESS, AND IT SAYS WHAT IT COSTS BY SAYING WHAT IT DOES.
            Identifying reserves credits, so it never runs on its own — a screen
            that asked a model every time somebody opened the camera would bill a
            workspace for photographs nobody finished taking.
          */}
          {onIdentify && photos.length
            ? (
              <Button
                variant="secondary"
                isDisabled={busy === true || guessed.status === "waiting"}
                onPress={() => { onIdentify(photos); }}
              >
                {guessed.status === "waiting" ? "Looking…" : "Fill this in from the photos"}
              </Button>
            )
            : null}

          <Await
            of={guessed}
            again={again}
            waiting={<RowsWaiting rows={2} lead={false} />}
            then={() => null}
          />
        </>
      ),
    },

    {
      id: "what",
      ask: "What is it?",
      under: "The name somebody would call it on a shelf",
      says: sayNamed(brand, name),
      short: !name.trim()
        ? "Give it a name"
        /* ⚠️ THE RESEMBLANCE IS NOT A REFUSAL UNTIL IT IS THE STRONG KIND, and
           even then it is answerable in place. A form somebody fills in
           completely and is then told to throw away is how people learn to press
           past a warning without reading it. */
        : strong && !anyway
          ? "Say it is a different thing, or open the one you have"
          : undefined,
      children: (
        <>
          <TextInput
            label="Name"
            value={name}
            onChange={setName}
            placeholder="What somebody calls it on a shelf"
            name="name"
            autoFocus
          />
          <TextInput label="Brand" value={brand} onChange={setBrand} name="brand" />
          {/*
            ⚠️ `Written` RATHER THAN A ONE-LINE FIELD, AND THE CONTROL IS THE
            BRIEF. A model reading six photographs writes real prose here — what
            it is, what size, what form, what it is not — and drawn at the default
            height it arrived in a box one line tall, so what came back looked
            like a fragment and what people typed was a fragment.
          */}
          <Written
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="What it is, what size, what form"
            rows={5}
          />

          {/*
            ⚠️ WHAT ALREADY LOOKS LIKE THIS, UNDER THE NAME THAT CAUSED IT. A list
            of near-duplicates at the foot of a long sheet is a list nobody
            scrolls to, and the decision it informs is being made here.
          */}
          {matches?.length
            ? (
              <>
                <NoteRow icon={glyphOf("alert")}>
                  {matches.length === 1
                    ? "You may already have this one"
                    : `${matches.length} things here look like this`}
                </NoteRow>
                {matches.map((one: Match) => (
                  <ActionRow
                    key={one.id}
                    label={[one.brand, one.name].filter(Boolean).join(" · ")}
                    under={one.why === "same code" ? "Has the barcode you typed"
                      : one.why === "same name and brand" ? "The same name and brand"
                        : "A similar name"}
                    tone={one.why === "similar name" ? "neutral" : "warning"}
                  />
                ))}
                {strong
                  ? (
                    <ToggleRow
                      label="This is a different thing"
                      under="Two brands can make the same product"
                      value={anyway}
                      onChange={setAnyway}
                    />
                  )
                  : null}
              </>
            )
            : null}
        </>
      ),
    },

    {
      id: "kinds",
      ask: "What kind of thing is it?",
      under: "So it can be found by what it is, not only by its name",
      says: tags.length ? `Filed under ${sayList(shown, [...tags])}` : null,
      children: (
        /*
          ⚠️ ONE CONTROL, AND IT WAS FOUR. A `Tags` display, a text field, an Add
          button and a stack of rows listing the workspace's own words — a third
          of a phone screen for one question. `Words` is all of it, and the words
          already in use narrow as you type rather than showing an arbitrary
          eight.
        */
        <Words
          label="Filed under"
          value={tags}
          onChange={setTags}
          known={knownTags}
          placeholder="antibiotics, refrigerated, prescription"
          help="Words this workspace already uses appear as you type"
        />
      ),
    },

    {
      id: "tracking",
      ask: "How closely do you follow it?",
      under: "This decides what you are asked when a delivery arrives",
      says: sayTracking(tracking),
      children: (
        /* ⚠️ RADIOS, NOT SEGMENTS — see `RUNGS`. Four consequences that have to be
           readable BEFORE the choice; `Segmented` draws labels only. */
        <OneOf label="Following it" value={tracking} onChange={setTracking} options={RUNGS} />
      ),
    },

    {
      id: "counting",
      ask: "What do you count it in?",
      under: "The unit shown beside every number this product ever reports",
      says: sayCounting(unit, whole),
      short: !unit.trim() ? "Say what it is counted in" : undefined,
      children: (
        <>
          {/*
            ⚠️ WHAT THIS WORKSPACE ALREADY COUNTS IN, OFFERED RATHER THAN
            REMEMBERED. Typed free, one catalogue ends up with `box`, `Box`,
            `boxes` and `BX` — four units that are one unit, on four products that
            can never be compared or totalled. `Lookup` still takes anything
            typed, so a new unit costs nothing; it just stops the fifth spelling
            of an old one being the path of least resistance.
          */}
          <Lookup
            label="Counted in"
            value={unit}
            onChange={setUnit}
            options={knownUnits}
            placeholder="glove, box, kg"
            help="One of these, or type your own"
            name="unit"
          />
          <ToggleRow
            label="Whole units only"
            under="Off where a half is a real quantity"
            value={whole}
            onChange={setWhole}
          />
        </>
      ),
    },

    {
      id: "packing",
      ask: "Does it come inside something?",
      under: "A carton of boxes of sheets — as deep as it really goes",
      /*
        ⚠️ NOT ASKED OF A THING NOBODY COUNTS. How many are in a box is a fact
        with no consequence when nothing is counting them, and a question with no
        consequence is a question that teaches people to press past questions.
      */
      when: tracking !== "listed",
      /* ⚠️ "As it is" MEANS NO LADDER WHATEVER WAS TYPED BEFORE IT WAS CHOSEN,
         and the clause has to agree with what will be SENT — see `send`. Read
         off `rungs` regardless, somebody who filled in two rungs and then said
         the thing comes loose would be told it comes in a box of ten. */
      says: sayPacking(packed === "packed" ? rungs : [], unit),
      children: (
        <>
          <Segmented label="How it arrives" value={packed} onChange={setPacked} options={PACKED} />
          {/*
            ⚠️ THE SHELF IS STILL COUNTED IN ONE UNIT. A rung is a NAMED
            MULTIPLIER — the way somebody says "two boxes" while holding two
            boxes, and the way a number reads back in the words they think in.
            Nothing here changes what the balance is in.

            ⚠️ AND IT IS THE ONLY PLACE A BLISTER SHEET CAN EXIST. A sheet inside
            a box carries no barcode, so it can never be a code; before this there
            was nowhere to put it and anybody issuing by the sheet typed 10 every
            time and hoped.
          */}
          {packed === "packed"
            ? <Ladder unit={unit} levels={levels} onChange={setLevels} />
            : null}
        </>
      ),
    },

    {
      id: "codes",
      ask: "What is printed on it?",
      under: "Every barcode it carries — the item, the inner and the carton",
      says: sayCodes(codes, unit),
      children: (
        <>
          {/*
            ⚠️ ONE WAY IN, AND IT WAS TWO. `Viewfinder` carries its own typed
            field — that is the shape of the control, so every scanning surface
            has a keyboard route whether or not whoever wrote it thought about the
            camera failing. This step then drew a SECOND text field per code row,
            so it had two boxes asking for the same digits one above the other,
            and neither said which one the scan would fill.

            ⚠️ AND A CODE ALREADY ON THE LIST IS IGNORED RATHER THAN ADDED TWICE.
            A label sits in front of a lens for a second and decodes thirty times;
            `Viewfinder` collapses that into one read, and this is what stops the
            second deliberate scan of the same box from making a duplicate row
            nobody asked for.
          */}
          <Viewfinder
            says="Hold each barcode up in turn"
            /*
              ⚠️ WHAT IS ALREADY ON THE LIST, SO A SECOND LOOK SAYS SO. Without it
              the reader compares against the last thing it saw, and two boxes on
              a bench alternating in front of a lens each look new every time the
              other one intervenes.
            */
            held={codes.map((one) => one.value)}
            /* ⚠️ ONE BOX IS ONE CODE — see `foldScan`. This pack carries an EAN-13
               and a DataMatrix, and without this it registered as two products. */
            fold={foldScan}
            typed={{
              label: "Or type a code",
              placeholder: "What is printed under the bars",
              help: "The item, the inner box and the carton can all be added",
            }}
            onRead={(code) => {
              const said = code.trim();
              if (!said) return;
              setCodes((held) => {
                if (held.some((one) => one.value === said)) return held;
                /*
                  ⚠️ THE MODEL'S COUNT LANDS ON THE FIRST CODE AND NOWHERE ELSE.
                  "30 per box" was read off the box the first barcode is printed
                  on; the second code is the carton or the inner, and giving it
                  the same number would say the carton holds thirty too. It is a
                  starting value on one row, editable like any other.
                */
                const pack = held.length === 0 && readPack ? readPack : 1;
                return [...held, { value: said, kind: namespaceOf(said), pack }];
              });
            }}
          />

          {/*
            ⚠️ WHAT WAS SCANNED, SHOWN AS WHAT IT IS. Every code used to be a text
            field, a four-way "what kind" and a number — twelve controls for three
            barcodes, on a phone, to record something the camera had already read.
            A code that has been read is a FACT: it is drawn, it is named, and the
            one thing nobody can know from looking at it is how many the pack
            holds.

            ⚠️ AND THEY SCROLL SIDEWAYS RATHER THAN STACKING. Three of these down
            the page is the step's whole height for its least important part; in a
            row they are one glance, and the barcode itself is what somebody
            checks against the box.
          */}
          {codes.length ? (
            <Rail wide="panel">
              {/* ⚠️ THE SIZING IS OUTSIDE THE CARD AND THE COLUMN IS THE CARD'S.
                  A `Stack` inside a `Group` is a second column in something that
                  is already one — a second inset and a second gap, which is what
                  "double padding" means (`rhythm`). The div carries a width and
                  nothing else. */}
              {codes.map((row, at) => (
                <div key={row.value || at}>
                  <Group label={sayKind(row.value)}>
                    {/*
                      ⚠️ DRAWN WHERE IT CAN BE, AND ONLY THERE. `Bars` answers
                      nothing for a Code-128 or a number somebody typed — a
                      convincing picture of the wrong symbology scans as the wrong
                      product, which is worse than no picture at all.
                    */}
                    <Bars of={row.value} onScreen />
                    <Row space="tight">
                      <span className="tabular-nums truncate">{row.value}</span>
                      <Spacer />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${row.value}`}
                        onPress={() => {
                          setCodes((held) => held.filter((_, i) => i !== at));
                        }}
                      >
                        Remove
                      </Button>
                    </Row>
                    <NumberInput
                      label="How many it holds"
                      value={row.pack}
                      onChange={(next) => { setCode(at, { pack: Math.max(1, next) }); }}
                      min={1}
                      help={unit ? `In ${unit}. One for a single item` : "One for a single item"}
                    />
                  </Group>
                </div>
              ))}
            </Rail>
          ) : null}
        </>
      ),
    },

    {
      id: "keeping",
      ask: "How long does it keep?",
      under: "How long the product lasts, never one delivery's printed date",
      says: sayKeeping(shelfDays, openDays),
      children: (
        <>
          {/*
            ⚠️ HOW LONG IT KEEPS IS THE PRODUCT'S; WHEN THIS ONE EXPIRES IS THE
            DELIVERY'S. Two boxes of the same thing made in March and in September
            go off six months apart — so this asks for the DURATION and never for
            a date, and the date is read off each box as it arrives. A field here
            holding "expires 2027-03-31" would put one delivery's date on every
            future one.
          */}
          <NumberInput
            label="Shelf life"
            value={numberOr(shelfDays)}
            onChange={(next) => { setShelfDays(next > 0 ? next : null); }}
            min={0}
            help="Days from the day it was made. 730 is two years. Zero never expires"
          />
          {/*
            ⚠️ WHY IT IS EMPTY, WHERE IT IS EMPTY, AND ONLY WHEN A DATE WAS
            ACTUALLY SEEN. A shelf life is a DURATION and a carton prints a DATE —
            with no manufacturing date beside it nothing can work one out, so
            leaving this blank is the model being right. Somebody who has just
            photographed "verwendbar bis 08 2029" and finds the field empty reads
            that as the reading having failed, and either types a number they
            guessed or stops trusting the extraction.
          */}
          {!shelfDays && answer?.labelExpiry
            ? (
              <NoteRow icon={glyphOf("model")}>
                {`The label says ${answer.labelExpiry}. That is this box's date, `
                  + "not how long the product keeps — it is recorded when you receive it."}
              </NoteRow>
            )
            : null}
          <NumberInput
            label="Once opened"
            value={numberOr(openDays)}
            onChange={(next) => { setOpenDays(next > 0 ? next : null); }}
            min={0}
            help="The open-jar symbol on the label — 12M is 365 days"
          />

          {/*
            ⚠️ THE TWO FIELDS `Written` WAS BUILT FOR. Storage and handling are
            where a model writes headed paragraphs and a list of what a thing must
            not sit beside — and this is read at a shelf by somebody holding a
            box, which is the one place a wall of grey is useless. Markdown in,
            structure out.
          */}
          <Written
            label="How to store it"
            value={storage}
            onChange={setStorage}
            placeholder="Cool, dry, upright — and what it must not sit beside"
            rows={6}
          />
          <Written
            label="How to handle it"
            value={handling}
            onChange={setHandling}
            placeholder="Gloves, two people, keep flat"
            rows={6}
          />

          {/*
            ⚠️ A PICTOGRAM WAS SEEN, AND SAYING SO IS THE WHOLE VALUE. Which class
            an orange diamond declares is a legal statement the label reader makes
            against a photograph of the printed label, where the words are legible
            — but a screen that stayed silent would let somebody register a
            solvent as though it were shampoo and find out the first time they
            decant it.
          */}
          {answer?.hazardous
            ? (
              <NoteRow icon={glyphOf("alert")}>
                There is a hazard symbol on this. Read its label from the
                product page — a class has to come off the printed words
              </NoteRow>
            )
            : null}
        </>
      ),
    },

    {
      id: "more",
      ask: "Where does more come from?",
      under: "Nothing is ordered and nobody is emailed — this is a list",
      says: sayGettingMore(orderedFrom, par, unit),
      children: (
        <>
          {suppliers.length
            ? (
              <>
                {suppliers.map((one) => {
                  const listed = sources.some((s) => s.supplier === one.id);
                  return (
                    <ToggleRow
                      key={one.id}
                      label={one.label}
                      under={supplier === one.id ? "Orders go here" : undefined}
                      value={listed}
                      onChange={(next) => {
                        setSources((held) => (next
                          ? [...held, { supplier: one.id, ref: "", leadDays: null }]
                          : held.filter((s) => s.supplier !== one.id)));
                        /*
                          ⚠️ THE PREFERRED ONE MUST BE AMONG THEM. An order
                          addressed to somebody the catalogue does not say sells it
                          is an order nobody can explain — so removing a supplier
                          clears the preference it held, and the first one added
                          takes it.
                        */
                        if (!next && supplier === one.id) setSupplier("");
                        if (next && !supplier) setSupplier(one.id);
                      }}
                    />
                  );
                })}
                {sources.length > 1
                  ? (
                    <Segmented
                      label="Order from"
                      value={supplier}
                      onChange={setSupplier}
                      options={sources.map((s) => ({
                        id: s.supplier,
                        label: suppliers.find((o) => o.id === s.supplier)?.label ?? s.supplier,
                      }))}
                    />
                  )
                  : null}
              </>
            )
            : <NoteRow>No suppliers yet. You can add them later</NoteRow>}

          {/*
            ⚠️ WHEN TO SAY SOMETHING, NOT WHEN TO REFUSE. Running out is a fact
            about the world; an app that refused a take because a number went
            under a line is an app people work around.

            ⚠️ AND IT IS HERE RATHER THAN WITH THE COUNTING, because "running low"
            is a question about getting more. Beside the unit it read as part of
            the arithmetic; beside the supplier it reads as what it is for.
          */}
          <NumberInput
            label="Running low at"
            value={numberOr(par)}
            onChange={(next) => { setPar(next > 0 ? next : null); }}
            min={0}
            help={unit ? `In ${unit}. Zero means never` : "Zero means never"}
          />
          {/*
            ⚠️ IT JOINS A LIST; IT DOES NOT SEND ANYTHING. The email to the
            supplier is not built — `DEFER(inventory-reorder)` — and a switch
            whose label promises one is worse than no switch, so the label says
            what it actually does.
          */}
          <ToggleRow
            label="Put it on the reorder list"
            under="It joins Reports · To reorder. Nothing is ordered and nobody is emailed"
            value={reorder}
            onChange={setReorder}
          />
          {reorder
            ? (
              <NumberInput
                label="How many to order"
                value={numberOr(reorderQty)}
                onChange={(next) => { setReorderQty(next > 0 ? next : null); }}
                min={0}
                help={unit ? `In ${unit}` : undefined}
              />
            )
            : null}
        </>
      ),
    },
  ];

  return (
    <Story
      title={title}
      asks={ASKS}
      at={where}
      onGo={setWhere}
      leave={back}
      /* ⚠️ SAID ONCE, OVER THE RECAP — not a badge on every field a model
         touched. The recap is what makes it checkable; this is what makes it
         worth checking. */
      note={answer
        ? (
          <NoteRow icon={glyphOf("model")}>
            {answer.why
              ? `Filled in by a model — ${answer.why.toLowerCase()}. Check each line before you add it`
              : "Filled in by a model. Check each line before you add it"}
          </NoteRow>
        )
        : undefined}
      does={{
        /*
          ⚠️ THE NOUN, BECAUSE "IT" IS ONLY OBVIOUS TO WHOEVER WROTE IT. Nine
          questions later, the last control on the screen says what it adds — and
          "Add it" reads as a fragment of a sentence the interface started
          somewhere the person cannot see.
        */
        op: "product.register",
        label: "Add product",
        onDo: send,
        disabled: busy === true,
      }}
    />
  );
}
