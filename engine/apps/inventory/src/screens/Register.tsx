/**
 * REGISTER A THING — a quiz about the object in your hand.
 *
 * ⚠️ TWO TAXES, AND THIS FILE IS ABOUT THE SECOND ONE. The first is typing: eight
 * hundred things entered by hand is a project nobody finishes, which is why the
 * camera is the first question. The second is TRAINING, and it is the one that
 * never appears in a diff — a screen headed "Counting" with `Tracked as: [Listed]
 * [Counted] [Batched] [Itemised]` under it needs an induction, a wiki page and a
 * person in the warehouse who knows. All three are paid for per customer, per new
 * employee, forever.
 *
 * ⚠️ SO EVERY STEP IS ONE QUESTION IN PLAIN WORDS, AND EVERY ANSWER IS SAID BACK.
 * "How much do you need to know about each one?" — and the four options are
 * *That we have it* / *How many we have* / *Which delivery it came from* /
 * *Every single one*, each with the kind of thing it suits underneath. Nobody has
 * to be told what those mean. The clauses are `saying.ts`, pure and tested.
 *
 * ⚠️ AND IT HAS TO WORK FOR A BASEMENT SHELF AND A DISTRIBUTOR. The thing being
 * described is a tin of paint, a box of screws, a pallet of drinks, a surgical
 * tray or a laptop — so every example given here spans that range on purpose, and
 * no question assumes a warehouse or a pharmacy.
 *
 * ⚠️ EVERY LABEL AND PLACEHOLDER IS BUILT FROM THE ANSWERS ALREADY GIVEN. Say you
 * count in metres and the next screen asks whether you can have half A METRE, the
 * one after that asks how many METRES are in a box, and the barcode asks how many
 * METRES it covers. A wizard whose wording does not move when you change your
 * mind is a form with a progress bar on it.
 *
 * ⚠️ AND AN ANSWER REMOVES THE QUESTIONS IT CONTRADICTS. "That we have it"
 * means nothing is ever counted — so packs, barcodes and expiry dates are not
 * asked at all, and the flow is six screens instead of ten. "Every single one"
 * means each has its own number, so a pack size is meaningless and that step goes
 * too. Skipped, never greyed out: a disabled step is a question somebody has to
 * work out they are not being asked.
 *
 * ⚠️ THE SUMMARY IS THE LAST STEP AND IT IS THE FRAME'S. Every screen here is the
 * question and nothing else; `Story` appends the review, where the whole story
 * reads as a list of short sentences with every line one press from the step that
 * wrote it. That is what makes the camera's answer checkable.
 *
 * ⚠️ A PAGE RATHER THAN A DRAWER, AND AN ADDRESS IS THE HALF A DRAWER CANNOT
 * HAVE. Home's first action, a checklist step, an empty catalogue and a scan that
 * resolved to nothing all want to send somebody HERE.
 */

import * as React from "react";
import {
  ActionRow, Await, Bars, Fills, Group, NoteRow, NumberInput, OneOf, PickFile, Row,
  RowsWaiting, SAYS_KIND, Segmented, Spacer, Story, Words,
  Lookup, Rail, TextInput, ToggleRow, Viewfinder, Written, kindOf,
  glyphOf, shrunk, useShown, useTelling, type Ask, type Loaded, type Option,
} from "@engine/design";
import { Button } from "@heroui/react";
import { MOST_BYTES, sayList } from "@engine/kernel";
/* ⚠️ ONE BOX IS ONE CODE — the fold the reader has no way to know. */
import { foldScan } from "../code.js";
import { factors } from "../packing.js";
import {
  detailOptions, one, sayCodes, sayDates, sayDetail, sayMore, sayPacks, sayThing, sayUnit, some,
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
   * SCREEN CAN SAY WHY IT LEFT ONE BLANK. A carton prints "use by 08/2029" and
   * no manufacturing date, so no duration can be worked out — the model is right
   * to answer zero, and a person who has just photographed a date sitting beside
   * an empty field reasonably reads that as a failure. It is also the wrong
   * FIELD: this date belongs to one delivery, and is captured on arrival.
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
  /** ⚠️ How many single units the thing this code is printed on holds. */
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
  /** ⚠️ How it arrives packed. Empty for most things — see `Ladder`. */
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
   * ⚠️ THE WORDS THIS WORKSPACE ALREADY USES. Sent with the photographs so a
   * model CHOOSES from them, and offered in the `Words` control so a person does
   * too — one vocabulary, reached two ways.
   */
  readonly knownTags: readonly Option[];
  /**
   * ⚠️ THE UNITS THIS WORKSPACE ALREADY COUNTS IN. Typed free, a catalogue
   * collects `box`, `Box`, `boxes` and `BX` as four units that are one, on things
   * that can then never be totalled. Offered rather than enforced.
   */
  readonly knownUnits: readonly Option[];
  readonly suppliers: readonly Option[];
  /**
   * ⚠️ WHAT ALREADY LOOKS LIKE THIS, WHILE IT IS STILL BEING TYPED. `null` means
   * nothing has been asked yet, which is not the same as "nothing matched" — an
   * empty list under a name is a claim, and it is the claim that makes somebody
   * stop looking.
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

/**
 * ⚠️ WHAT A CODE IS, WORKED OUT RATHER THAN ASKED. The step used to offer four
 * options — Barcode, QR, Square code, Other — and every one of them was a
 * SYMBOLOGY, which is not what the field holds. What a code NAMES is a retail
 * GTIN, a supplier's part number, or one of our own labels. The control was
 * asking about the picture and storing the answer in a column about the
 * namespace.
 *
 * ⚠️ AND BOTH ARE KNOWABLE WITHOUT ASKING. Eight, twelve or thirteen digits whose
 * last one is the weighted sum of the rest is a GTIN and nothing else is; the
 * camera hands back the symbology it decoded. A form asking a person to re-state
 * what the machine read is a form nobody can get right more often than the
 * machine.
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
  const [levels, setLevels] = React.useState<readonly Rung[]>([]);
  const [packed, setPacked] = React.useState("loose");
  const [detail, setDetail] = React.useState("counted");
  const [whole, setWhole] = React.useState(true);
  const [par, setPar] = React.useState<number | null>(null);
  const [storage, setStorage] = React.useState("");
  const [handling, setHandling] = React.useState("");
  /*
    ⚠️ A QUESTION OF ITS OWN, AND IT USED TO BE TWO EMPTY NUMBER FIELDS. "Shelf
    life: 0" and "nobody has said whether this goes off" are different facts, and
    a blank field cannot tell them apart — so a thing that genuinely never
    expires was indistinguishable from a step somebody skipped, on the screen and
    in the record.
  */
  const [expires, setExpires] = React.useState(false);
  const [shelfDays, setShelfDays] = React.useState<number | null>(null);
  const [openDays, setOpenDays] = React.useState<number | null>(null);
  const [tags, setTags] = React.useState<readonly string[]>([]);
  /* ⚠️ EMPTY, NOT ONE BLANK ROW. A row with no code in it was a card with no
     barcode on it and a pack size for a thing nobody had named. */
  const [codes, setCodes] = React.useState<readonly CodeRow[]>([]);
  /* ⚠️ WHAT THE MODEL READ OFF THE BOX, WAITING FOR A BARCODE TO BELONG TO. */
  const [readPack, setReadPack] = React.useState<number | null>(null);
  const [sources, setSources] = React.useState<readonly SourceRow[]>([]);
  const [supplier, setSupplier] = React.useState("");
  const [reorder, setReorder] = React.useState(false);
  const [reorderQty, setReorderQty] = React.useState<number | null>(null);
  const [anyway, setAnyway] = React.useState(false);
  const [where, setWhere] = React.useState("photos");

  /*
    ⚠️ FILLS WHAT IS EMPTY AND ARGUES WITH NOTHING. Somebody who typed a name and
    then photographed the box meant the name they typed. The words are a UNION
    for the same reason: one somebody chose is not one a model gets to remove.
  */
  const answer = guessed.status === "ready" ? guessed.data : null;
  React.useEffect(() => {
    if (!answer) return;
    /* ⚠️ AN ANSWER MOVES SOMEBODY ON rather than filling in a screen they are not
       looking at. It lands on the first question the answer touched, and the
       review at the end is the check. */
    setWhere((held) => (held === "photos" ? "what" : held));
    setName((held) => held || answer.name);
    setBrand((held) => held || answer.brand);
    setDescription((held) => held || answer.description);
    setUnit((held) => held || answer.unit);
    setStorage((held) => held || answer.storage);
    setHandling((held) => held || answer.handling);
    /* ⚠️ A DURATION IS ALSO THE ANSWER TO "DOES IT GO OFF", so reading one off
       the label answers the question before it is asked rather than leaving
       somebody to set a switch the model has already decided. */
    if (answer.shelfDays > 0) {
      setShelfDays((held) => held ?? answer.shelfDays);
      setExpires(true);
    }
    if (answer.openDays > 0) {
      setOpenDays((held) => held ?? answer.openDays);
      setExpires(true);
    }
    if (answer.labelExpiry) setExpires(true);
    if (answer.tracking) setDetail((held) => (held === "counted" ? answer.tracking : held));
    setTags((held) => {
      const seen = new Set(held.map((word) => word.toLowerCase()));
      return [...held, ...answer.tags.filter((word: string) => !seen.has(word.toLowerCase()))];
    });
    /*
      ⚠️ THE PACK GOES ON THE FIRST BARCODE, NOT ON THE THING. "It holds 30" is a
      fact about the box the code is printed on — something counted in gloves has
      no pack of its own, and an outer case and an inner both do.

      ⚠️ AND IT IS REMEMBERED RATHER THAN WRITTEN. This mapped over `codes` —
      which is EMPTY when the answer arrives, because photographs are the first
      question and barcodes are the seventh. `[].map()` is `[]`, so a model that
      had correctly read "30 Filmtabletten" off the box had its answer dropped
      without a word, every time.
    */
    if (answer.pack > 1) setReadPack(answer.pack);
  }, [answer]);

  /*
    ⚠️ ASKED AS THEY TYPE, SETTLED BEFORE THEY SAVE. A catalogue fills with
    duplicates one careful person at a time — somebody searches "gloves nitrile"
    in a hurry, finds nothing, and adds a second row that half the stock then
    lives under.

    ⚠️ AND IT IS DEBOUNCED RATHER THAN PER KEYSTROKE. A read on every letter of
    "nitrile gloves" is fourteen round trips for one answer.
  */
  React.useEffect(() => {
    if (name.trim().length < 3) return undefined;
    const at = setTimeout(() => { onLook({ name, brand }); }, 400);
    return () => { clearTimeout(at); };
  }, [name, brand, onLook]);

  const matches = resembles.status === "ready" ? resembles.data : null;
  const strong = (matches ?? []).some((match: Match) => match.why !== "similar name");

  const setCode = (at: number, next: Partial<CodeRow>) => {
    setCodes((held) => held.map((row, i) => (i === at ? { ...row, ...next } : row)));
  };

  /* ⚠️ ONLY THE ROWS SOMEBODY FINISHED. A half-typed pack — a name with no
     number — is refused at the door, so sending it would turn an unfinished line
     into a refusal about a field the person had not got to yet. */
  const rungs = levels.filter((rung) => rung.name.trim() && rung.per > 1);

  /*
    ⚠️ A CODE SCANNED ON A PACK GOES IN THE ONE LIST OF CODES, with the number it
    covers DERIVED. Somebody holding a case of 4 boxes of 10 has already said
    both numbers on this screen; asking again on the barcode step is asking them
    to multiply — and the whole reason a pack is a named multiplier is so nobody
    has to. `factors` is the same arithmetic the worker does (`packing.ts`).

    ⚠️ AND THE PACK IS RE-DERIVED WHENEVER THE LADDER MOVES, because the ladder
    is what it means. Stored as a number typed once, editing "10 per box" to 12
    would leave the case's code still covering forty — a stale multiplier on a
    barcode nobody would think to re-check.
  */
  const perRung = React.useMemo(() => factors(levels).map((rung) => rung.per), [levels]);
  const codeOnRung = (at: number): string | null => {
    const per = perRung[at];
    if (!per) return null;
    return codes.find((row) => row.pack === per)?.value ?? null;
  };
  const scanRung = (at: number, code: string) => {
    const said = code.trim();
    const per = perRung[at];
    if (!said || !per) return;
    setCodes((held) => (held.some((row) => row.value === said)
      ? held.map((row) => (row.value === said ? { ...row, pack: per } : row))
      : [...held, { value: said, kind: namespaceOf(said), pack: per }]));
  };
  const unscanRung = (at: number) => {
    const per = perRung[at];
    if (!per) return;
    setCodes((held) => held.filter((row) => row.pack !== per));
  };
  /* ⚠️ NOTHING IS COUNTED, SO NOTHING BELOW DEPENDS ON A COUNT — see the header.
     This is the one answer that removes whole questions. */
  const counts = detail !== "listed";

  const send = () => {
    onRegister({
      name: name.trim(), brand: brand.trim(), description: description.trim(),
      unit: unit.trim(), tracking: detail, whole, par,
      /* ⚠️ EVERY ELIMINATED ANSWER IS DROPPED HERE, and that is what makes the
         skipping honest. Somebody who filled in packs and then chose "every
         single one" has changed their mind; sending the packs anyway would
         register a shape they had just told the screen it does not have. */
      levels: counts && packed === "packed" ? rungs : [],
      storage: storage.trim(), handling: handling.trim(),
      shelfDays: counts && expires ? shelfDays : null,
      openDays: counts && expires ? openDays : null,
      supplier, reorder, reorderQty,
      codes: counts ? codes.filter((code) => code.value.trim().length > 0) : [],
      tags, sources, photos, anyway,
    });
  };

  const orderedFrom = suppliers.find((row) => row.id === supplier)?.label ?? null;
  const noted = [storage.trim() ? "storing it" : "", handling.trim() ? "handling it" : ""]
    .filter(Boolean);

  const ASKS: readonly Ask[] = [
    /*
      ⚠️ THE CAMERA AND THE NAME ARE ONE QUESTION, AND SPLITTING THEM COST THE
      CAMERA ITS POINT. Asked on a screen of its own, "start with a photo?" is a
      question about a feature — and the honest answer from somebody who has not
      seen the form yet is "I don't know, what will it do". Put the shutter above
      the name it fills in and the offer explains itself: press it, and the
      fields under it are already written.

      ⚠️ AND IT REMOVES THE ONE STEP SOMEBODY COULD ONLY SAY NO TO. A step whose
      whole content is optional is a screen most people press Next on, which
      teaches them that pressing Next is what this flow is.
    */
    {
      id: "what",
      ask: "What is it?",
      under: "Photograph it and the rest fills itself in",
      says: sayThing(brand, name, photos.length, Boolean(answer)),
      part: { lead: "This is", said: name.trim() || null },
      short: !name.trim()
        ? "Give it a name"
        /* ⚠️ NOT A REFUSAL UNTIL IT IS THE STRONG KIND, and even then it is
           answerable in place. A form somebody fills in completely and is then
           told to throw away is how people learn to press past a warning. */
        : strong && !anyway
          ? "Say it is a different thing, or open the one you have"
          : undefined,
      children: (
        <>
          <PickFile
            accept={["image/*"]}
            /*
              ⚠️ THE TRANSPORT'S OWN CEILING, NOT A NUMBER PICKED HERE. This was
              two megabytes, which refuses every photograph a phone has taken
              since about 2015. `shrunk` is what was missing.
            */
            most={MOST_BYTES}
            says={photos.length ? "Add another angle" : "Take a photo"}
            /*
              ⚠️ THE LABEL IS NAMED, BECAUSE IT IS THE PICTURE THAT PAYS. The
              contents, the printed name, the storage line and the shelf life are
              on the label and nowhere else — somebody who photographs three
              sides of a box and not the back gets a worse answer and never
              learns why.
            */
            under={photos.length
              ? `${photos.length} of ${MOST_PHOTOS}. The first one is what people check against`
              : "The front, the back, and the label. The label is where the detail is"}
            label="Take a photo"
            busy={busy}
            /* ⚠️ AS MANY AS THERE IS ROOM FOR, IN ONE TRIP. Six photographs are
               adjacent in a camera roll a minute later, and six trips through
               the picker to fetch six adjacent files was a limit nobody had
               decided. */
            atOnce={Math.max(1, MOST_PHOTOS - photos.length)}
            /* ⚠️ SHRUNK ON THE WAY IN, ONCE. Held at full size the six would be
               forty megabytes in React state on a phone — and the two places
               that send them would each have to remember to reduce, which is two
               chances to forget and one of them costs credits. */
            onPick={(bytes, file) => {
              void (async () => {
                const small = await shrunk(bytes, file.type);
                setPhotos((held) => (held.length >= MOST_PHOTOS ? held : [...held, small]));
              })();
            }}
          />

          {/*
            ⚠️ A STRIP THAT SCROLLS, NOT A GRID THAT REFLOWS. A grid on a phone
            spends the width it has on however many tiles exist, so six photos
            are six thumbnails too small to check. A strip gives each one a size
            that does not change with the count.
          */}
          {photos.length ? (
            <Rail wide="tile" space="tight">
              {photos.map((shot, at) => (
                <div key={shot.slice(-24)} className="relative overflow-hidden rounded-xl">
                  <img
                    src={shot}
                    alt={at === 0 ? "The main picture" : `Angle ${at + 1}`}
                    className="aspect-square h-full w-full object-cover"
                  />
                  {/* ⚠️ ON THE TILE, NOT IN A ROW UNDER IT. A remove that is not
                      on the thing it removes is a remove somebody has to count
                      tiles to trust. */}
                  <div className="absolute right-1 top-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={at === 0 ? "Remove the main picture" : `Remove angle ${at + 1}`}
                      onPress={() => { setPhotos((held) => held.filter((_, i) => i !== at)); }}
                    >
                      ✕
                    </Button>
                  </div>
                  {/*
                    ⚠️ PROMOTING ONE IS A MOVE, NOT A FLAG. Which photograph is
                    the main one is decided by ORDER, so "use this one" puts it
                    first rather than setting a field beside it. A `primary` flag
                    alongside an ordered list is two answers to one question, and
                    they disagree the first time somebody deletes the flagged one.
                  */}
                  {at === 0 ? null : (
                    <div className="absolute inset-x-1 bottom-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Make angle ${at + 1} the main picture`}
                        onPress={() => {
                          setPhotos((held) => [
                            held[at] as string,
                            ...held.filter((_, i) => i !== at),
                          ]);
                          tell.did("Now the main picture");
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

          {/* ⚠️ ONE PRESS, AND IT SAYS WHAT IT COSTS BY SAYING WHAT IT DOES.
              Reading the photos reserves credits, so it never runs on its own —
              a screen that asked a model every time somebody opened the camera
              would bill a workspace for photographs nobody finished taking. */}
          {onIdentify && photos.length
            ? (
              <Button
                variant="secondary"
                isDisabled={busy === true || guessed.status === "waiting"}
                onPress={() => { onIdentify(photos); }}
              >
                {guessed.status === "waiting" ? "Reading…" : "Read the photos"}
              </Button>
            )
            : null}

          <Await of={guessed} again={again} waiting={<RowsWaiting rows={2} lead={false} />} then={() => null} />

          <TextInput
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Nitrile gloves, medium"
            name="name"
            autoFocus
          />
          <TextInput
            label="Brand or maker"
            value={brand}
            onChange={setBrand}
            placeholder="Ansell"
            help="Leave it empty if it has none"
            name="brand"
          />
          {/* ⚠️ `Written` RATHER THAN A ONE-LINE FIELD, AND THE CONTROL IS THE
              BRIEF. A model reading six photographs writes real prose here, and
              drawn one line tall what came back looked like a fragment — so what
              people typed was a fragment too. */}
          <Written
            label="Anything else worth knowing"
            value={description}
            onChange={setDescription}
            placeholder="Powder-free, blue, 100 to a box"
            rows={5}
          />

          {/* ⚠️ WHAT ALREADY LOOKS LIKE THIS, UNDER THE NAME THAT CAUSED IT. A
              list of near-duplicates at the foot of a long sheet is a list
              nobody scrolls to, and the decision it informs is made here. */}
          {matches?.length
            ? (
              <>
                <NoteRow icon={glyphOf("alert")}>
                  {matches.length === 1
                    ? "You may already have this one"
                    : `${matches.length} things here look like this`}
                </NoteRow>
                {matches.map((match: Match) => (
                  <ActionRow
                    key={match.id}
                    label={[match.brand, match.name].filter(Boolean).join(" · ")}
                    under={match.why === "same code" ? "Has the barcode you typed"
                      : match.why === "same name and brand" ? "The same name and brand"
                        : "A similar name"}
                    tone={match.why === "similar name" ? "neutral" : "warning"}
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
      id: "finding",
      ask: "How would you look for it later?",
      under: "Words that group it with everything like it",
      says: tags.length ? `Filed under ${sayList(shown, [...tags])}` : "Not filed under anything",
      children: (
        /*
          ⚠️ ONE CONTROL, AND IT WAS FOUR. A tag display, a text field, an Add
          button and a stack of rows listing the workspace's own words — a third
          of a phone screen for one question. `Words` is all of it, and what is
          already in use narrows as you type instead of showing an arbitrary
          eight.
        */
        <Words
          label="Words to find it by"
          value={tags}
          onChange={setTags}
          known={knownTags}
          placeholder="gloves, ppe, consumables"
          help="Words already used here appear as you type"
        />
      ),
    },

    {
      id: "unit",
      ask: "What is one of them?",
      says: sayUnit(unit, whole),
      part: { lead: "counted in", said: unit.trim() ? some(unit) : null },
      short: !unit.trim() ? "Say what one of them is called" : undefined,
      children: (
        <>
          {/*
            ⚠️ THE QUESTION IS THE SENTENCE THE ANSWER ENDS UP IN — see `Fills`.
            Asked as a field called "One is called", this got `Nitrile gloves`
            typed into it, or `Box of 100`, or the product name again: all
            reasonable answers to a label, none of them a unit. Set in the line
            it will be read in, the shape of the right answer is visible before
            anybody types — and the wrong ones are audibly wrong.
          */}
          <Fills
            before="We have twelve"
            blank={unit.trim() ? some(unit) : ""}
            after={name.trim() ? `of ${name.trim()}` : "of it"}
            waiting="……"
          >
            {/*
              ⚠️ WHAT THIS WORKSPACE ALREADY COUNTS IN, OFFERED RATHER THAN
              REMEMBERED. Typed free, one catalogue ends up with `box`, `Box`,
              `boxes` and `BX` — four units that are one unit, on four things
              that can never be compared or totalled. `own` is what lets a word
              nobody has used before be given at all; the list is what stops the
              fifth spelling of an old one being the path of least resistance.
            */}
            <Lookup
              label="One is called"
              value={unit}
              onChange={setUnit}
              options={knownUnits}
              own
              placeholder="piece, box, kg, litre, roll, metre"
              help="One of these, or type your own"
              name="unit"
            />
          </Fills>
          {/*
            ⚠️ THE HALF IS ASKED AS THE SENTENCE IT WOULD PRODUCE, for the same
            reason. "Whole units only: off" is a setting somebody has to reason
            about; a stock line reading *three and a half boxes of nitrile
            gloves* answers itself, and it answers itself differently for paint
            and for gloves, which is the whole distinction being drawn.
          */}
          <ToggleRow
            label={`Can you have half ${one(unit)}?`}
            under={`Could you say “three and a half ${some(unit)}${
              name.trim() ? ` of ${name.trim()}` : ""}”?`}
            value={!whole}
            onChange={(half) => { setWhole(!half); }}
          />
        </>
      ),
    },

    {
      id: "detail",
      ask: "How much do you need to know about each one?",
      under: "This decides what you are asked every time some arrives",
      says: sayDetail(detail),
      part: { lead: "and what you will know is", said: sayDetail(detail)?.toLowerCase() ?? null },
      children: (
        /* ⚠️ RADIOS, NOT SEGMENTS — see `detailOptions`. Four consequences that have to
           be readable BEFORE the choice; `Segmented` draws labels only, which is
           how four carefully written explanations reached nobody for a month. */
        <OneOf
          label="How much detail"
          value={detail}
          onChange={setDetail}
          /* ⚠️ IN THE WORDS OF THE THING IN FRONT OF THEM — see `detailOptions`.
             "Deliveries stay apart" is a rule to apply; "deliveries of
             amoxicillin stay apart" is the rule already applied. */
          options={detailOptions(unit, name)}
        />
      ),
    },

    {
      id: "packs",
      ask: "Do they arrive packed?",
      under: "A box of 10, a case of 4 boxes — however deep it goes",
      /*
        ⚠️ NOT ASKED WHERE IT COULD NOT MATTER. Nothing is counted on `listed`, so
        a pack size has nothing to multiply; on `itemised` each one is followed
        separately, so a pack is a delivery detail rather than a property of the
        thing. Both are questions with no consequence, and a question with no
        consequence teaches people to press past questions.
      */
      when: detail === "counted" || detail === "batched",
      says: sayPacks(packed === "packed" ? rungs : [], unit),
      children: (
        <>
          <Segmented
            label="How they arrive"
            value={packed}
            onChange={setPacked}
            options={[
              /* ⚠️ THE UNIT THEY TYPED, not the word "loose". "Single metres" and
                 "single cans" both read; "loose" reads for neither. */
              { id: "loose", label: `Single ${some(unit)}` },
              { id: "packed", label: "In packs" },
            ]}
          />
          {/*
            ⚠️ THE TOTAL IS STILL IN ONE UNIT. A pack is a named multiplier — the
            way somebody says "two cases" while holding two cases — and nothing
            here changes what a shelf is counted in.

            ⚠️ AND IT IS THE ONLY PLACE A BLISTER SHEET OR AN INNER TRAY CAN
            EXIST. Something inside a box carries no barcode, so it can never be
            a code; before this there was nowhere to put it and anybody issuing
            by the sheet typed 10 every time and hoped.
          */}
          {packed === "packed"
            ? (
              <Ladder
                unit={unit}
                levels={levels}
                onChange={setLevels}
                /* ⚠️ THE CASE'S BARCODE, SCANNED WHERE THE CASE IS DESCRIBED —
                   see `LadderProps.onCode`. It lands in the same list the
                   barcode step writes, with the multiplier the ladder implies. */
                codeAt={codeOnRung}
                onCode={scanRung}
                onUncode={unscanRung}
              />
            )
            : null}
        </>
      ),
    },

    {
      id: "codes",
      ask: "Is there a barcode on it?",
      under: "Scan every one it carries — the item, the inner and the case",
      when: counts,
      says: sayCodes(codes, unit),
      children: (
        <>
          {/*
            ⚠️ ONE WAY IN, AND IT WAS TWO. `Viewfinder` carries its own typed
            field — that is the shape of the control, so every scanning surface
            has a keyboard route. This step then drew a SECOND text field per
            row, so it had two boxes asking for the same digits one above the
            other and neither said which one the scan would fill.

            ⚠️ AND A CODE ALREADY ON THE LIST IS IGNORED RATHER THAN ADDED TWICE.
            A label sits in front of a lens for a second and decodes thirty
            times; `Viewfinder` collapses that into one read, and this is what
            stops the second deliberate scan of the same box making a duplicate.
          */}
          <Viewfinder
            says="Hold each barcode up in turn"
            /* ⚠️ WHAT IS ALREADY ON THE LIST, SO A SECOND LOOK SAYS SO. Without
               it the reader compares against the last thing it saw, and two
               boxes alternating in front of a lens each look new every time. */
            held={codes.map((code) => code.value)}
            /* ⚠️ ONE BOX IS ONE CODE — see `foldScan`. A pack carrying an EAN-13
               and a DataMatrix registered as two things without this. */
            fold={foldScan}
            typed={{
              label: "Or type the number",
              placeholder: "The digits printed under the bars",
              help: "Add the item, the inner box and the outer case",
            }}
            onRead={(code) => {
              const said = code.trim();
              if (!said) return;
              setCodes((held) => {
                if (held.some((row) => row.value === said)) return held;
                /* ⚠️ THE MODEL'S COUNT LANDS ON THE FIRST CODE AND NOWHERE ELSE.
                   "30 per box" was read off the box the first barcode is printed
                   on; the second code is the case or the inner, and giving it
                   the same number would say the case holds thirty too. */
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
            one thing nobody can know from looking at it is how many it covers.
          */}
          {codes.length ? (
            <Rail wide="panel">
              {/* ⚠️ THE SIZING IS OUTSIDE THE CARD AND THE COLUMN IS THE CARD'S.
                  A `Stack` inside a `Group` is a second column in something that
                  is already one — a second inset and a second gap, which is what
                  "double padding" means. */}
              {codes.map((row, at) => (
                <div key={row.value || at}>
                  <Group label={sayKind(row.value)}>
                    {/* ⚠️ DRAWN WHERE IT CAN BE, AND ONLY THERE. A convincing
                        picture of the wrong symbology scans as the wrong thing,
                        which is worse than no picture at all. */}
                    <Bars of={row.value} onScreen />
                    <Row space="tight">
                      <span className="tabular-nums truncate">{row.value}</span>
                      <Spacer />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${row.value}`}
                        onPress={() => { setCodes((held) => held.filter((_, i) => i !== at)); }}
                      >
                        Remove
                      </Button>
                    </Row>
                    <NumberInput
                      /* ⚠️ IN THE UNIT THEY TYPED, ON EVERY ROW. "How many does
                         this cover" is unanswerable without knowing what it is
                         counting, and the answer is three screens back. */
                      label={`How many ${some(unit)} does this cover?`}
                      value={row.pack}
                      onChange={(next) => { setCode(at, { pack: Math.max(1, next) }); }}
                      min={1}
                      help={`1 for ${one(unit)} on its own. 24 for a case of 24`}
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
      id: "dates",
      ask: "Does it go out of date?",
      under: "Food, medicine, chemicals, adhesives — anything with a printed date",
      when: counts,
      says: sayDates(expires, shelfDays, openDays),
      part: { lead: "it", said: expires ? "goes out of date" : "does not go out of date" },
      children: (
        <>
          <Segmented
            label="Goes out of date"
            value={expires ? "yes" : "no"}
            onChange={(said) => { setExpires(said === "yes"); }}
            options={[{ id: "no", label: "No" }, { id: "yes", label: "Yes" }]}
          />

          {expires ? (
            <>
              {/*
                ⚠️ HOW LONG IT LASTS IS THE THING'S; WHEN THIS ONE EXPIRES IS THE
                DELIVERY'S. Two boxes of the same thing made in March and in
                September go off six months apart — so this asks for the LENGTH
                and never for a date, and the date is read off each box as it
                arrives. A field here holding "expires 2027-03-31" would put one
                delivery's date on every future one.
              */}
              <NumberInput
                label="How long does it last?"
                value={numberOr(shelfDays)}
                onChange={(next) => { setShelfDays(next > 0 ? next : null); }}
                min={0}
                help="Days from the day it was made. 730 is two years. Leave it at zero if only the printed date matters"
              />
              <NumberInput
                label="And once it is opened?"
                value={numberOr(openDays)}
                onChange={(next) => { setOpenDays(next > 0 ? next : null); }}
                min={0}
                help="The open-jar symbol on the label. 12M is 365 days"
              />
              {/*
                ⚠️ WHY A FIELD IS EMPTY, WHERE IT IS EMPTY, AND ONLY WHEN A DATE
                WAS ACTUALLY SEEN. A length is a duration and a carton prints a
                DATE — with no manufacturing date beside it nothing can work one
                out, so leaving this blank is the model being right. Somebody who
                has just photographed "verwendbar bis 08 2029" and finds the
                field empty reads that as the reading having failed.
              */}
              {!shelfDays && answer?.labelExpiry
                ? (
                  <NoteRow icon={glyphOf("model")}>
                    {`The label says ${answer.labelExpiry}. That is this box's date, `
                      + "not how long the thing lasts — it is recorded when you receive it."}
                  </NoteRow>
                )
                : null}
            </>
          ) : null}
        </>
      ),
    },

    {
      id: "care",
      ask: "Anything special about keeping it?",
      under: "What somebody standing at the shelf needs to know",
      when: counts,
      says: noted.length ? `Notes on ${sayList(shown, noted)}` : "Nothing special to remember",
      /* ⚠️ THE STORING LINE, WHICH IS THE ONE SOMEBODY AT THE SHELF NEEDS. The
         handling note is for whoever picks it up and belongs on the label, not
         in a sentence about what this thing is. */
      part: { lead: "keep it", said: storage.trim() || null },
      children: (
        <>
          {/* ⚠️ THE TWO FIELDS `Written` WAS BUILT FOR. A model writes headed
              paragraphs and a list of what a thing must not sit beside — and
              this is read at a shelf by somebody holding a box, which is the one
              place a wall of grey is useless. Markdown in, structure out. */}
          <Written
            label="How to store it"
            value={storage}
            onChange={setStorage}
            placeholder="Cool, dry, upright. Not next to food"
            rows={5}
          />
          <Written
            label="How to handle it"
            value={handling}
            onChange={setHandling}
            placeholder="Gloves. Two people. Keep flat"
            rows={5}
          />

          {/* ⚠️ A PICTOGRAM WAS SEEN, AND SAYING SO IS THE WHOLE VALUE. Which
              class an orange diamond declares is a legal statement the label
              reader makes against the printed words — but a screen that stayed
              silent would let somebody register a solvent as though it were
              shampoo and find out the first time they decant it. */}
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
      ask: "Where do you get more?",
      under: "Nothing is ordered and nobody is emailed — this is a list",
      says: sayMore(orderedFrom, par, unit),
      children: (
        <>
          {suppliers.length
            ? (
              <>
                {suppliers.map((row) => {
                  const listed = sources.some((source) => source.supplier === row.id);
                  return (
                    <ToggleRow
                      key={row.id}
                      label={row.label}
                      under={supplier === row.id ? "Orders go here" : undefined}
                      value={listed}
                      onChange={(next) => {
                        setSources((held) => (next
                          ? [...held, { supplier: row.id, ref: "", leadDays: null }]
                          : held.filter((source) => source.supplier !== row.id)));
                        /* ⚠️ THE PREFERRED ONE MUST BE AMONG THEM. An order
                           addressed to somebody the catalogue does not say sells
                           it is an order nobody can explain. */
                        if (!next && supplier === row.id) setSupplier("");
                        if (next && !supplier) setSupplier(row.id);
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
                      options={sources.map((source) => ({
                        id: source.supplier,
                        label: suppliers.find((row) => row.id === source.supplier)?.label
                          ?? source.supplier,
                      }))}
                    />
                  )
                  : null}
              </>
            )
            : <NoteRow>No suppliers here yet. You can add them later</NoteRow>}

          {/*
            ⚠️ WHEN TO SAY SOMETHING, NOT WHEN TO REFUSE. Running out is a fact
            about the world; an app that refused a take because a number went
            under a line is an app people work around.

            ⚠️ AND IT IS HERE RATHER THAN WITH THE UNIT, because "running low" is
            a question about getting more. Beside the unit it read as part of the
            arithmetic; beside the supplier it reads as what it is for.
          */}
          {counts
            ? (
              <NumberInput
                label="Tell you when it drops to"
                value={numberOr(par)}
                onChange={(next) => { setPar(next > 0 ? next : null); }}
                min={0}
                help={`In ${some(unit)}. Zero means never`}
              />
            )
            : null}
          {/* ⚠️ IT JOINS A LIST; IT DOES NOT SEND ANYTHING. The email to the
              supplier is not built — `DEFER(inventory-reorder)` — and a switch
              whose label promises one is worse than no switch. */}
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
                help={`In ${some(unit)}`}
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
      review={{
        ask: "Does this look right?",
        under: "Press any word to change it",
        /* ⚠️ THE PICTURE FIRST, BECAUSE IT IS THE FASTEST CHECK ON THE SCREEN.
           Ten questions in, somebody recognises the wrong box before they have
           read a word — and the photograph is also the thing a model's answers
           were read OFF, so it is what the sentence under it is checked against. */
        lead: photos[0]
          ? (
            <img
              src={photos[0]}
              alt="The main picture"
              className="aspect-square w-32 rounded-xl object-cover"
            />
          )
          : undefined,
      }}
      does={{
        /* ⚠️ THE NOUN, BECAUSE "IT" IS ONLY OBVIOUS TO WHOEVER WROTE IT. Ten
           questions later, the last control says what it adds. */
        op: "product.register",
        label: "Add it",
        onDo: send,
        disabled: busy === true,
      }}
    />
  );
}
