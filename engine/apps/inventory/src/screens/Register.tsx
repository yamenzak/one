/**
 * REGISTER A PRODUCT — a page, and the camera is the fast lane.
 *
 * ⚠️ THE ONBOARDING TAX IS WHY PEOPLE ABANDON INVENTORY APPS. Eight hundred
 * products typed in by hand is a project nobody finishes, so the first thing on
 * this sheet is a camera: six photographs of a thing on a bench come back named,
 * described, categorised and with a rung suggested. Everything under it is the
 * same form somebody can fill in by hand, always, with nothing hidden behind a
 * mode.
 *
 * ⚠️ ONE FORM RATHER THAN TWO LANES, AND THAT IS THE DESIGN. "From a photo" and
 * "by hand" as a choice at the top is a decision somebody has to make before
 * they know what either does, and it doubles every field's home. The photographs
 * FILL the form; the form is the product either way. Nothing on it is disabled
 * because a model has not run.
 *
 * ⚠️ AND A GUESS FILLS ONLY WHAT IS EMPTY. Somebody who typed a name and then
 * took photographs meant the name; a model overwriting it is the app arguing
 * with the person holding the box.
 *
 * ⚠️ A PAGE RATHER THAN A DRAWER, AND THE LENGTH IS THE ARGUMENT. This is
 * photographs, a name, tags, several barcodes, how it is counted, how it keeps
 * and who it is bought from. A drawer is the right shape for a question the size
 * of what it asks — a confirmation, one field, a supplier's three. Put a form
 * this long in one and the height, the scroll and the keyboard fight each other
 * on the device it is most used on.
 *
 * ⚠️ AND AN ADDRESS IS THE HALF A DRAWER CANNOT HAVE. Home's first action, a
 * checklist step, an empty catalogue and a scan that resolved to nothing all
 * want to send somebody HERE — and a page survives a reload, a shared link and
 * the back gesture, landing where they came from rather than nowhere.
 *
 * ⚠️ FOUR STEPS, BECAUSE TWENTY-ODD FIELDS ON ONE PAGE IS A PAGE NOBODY FINISHES.
 * As one scroll this was seven headings deep and every field looked equally
 * required, so the two that actually are — a name and a unit — were somewhere in
 * the middle of eighteen that are not. The steps are the natural joints of the
 * thing rather than an arbitrary quartering: what it LOOKS like, what it IS, how
 * it is COUNTED, and how it is KEPT and BOUGHT. Each one fits a phone without
 * scrolling much, and each one can be answered without knowing the next.
 *
 * ⚠️ AND THE FIRST STEP IS THE FORK, NOT A QUESTION ABOUT THE FORK. "Photograph
 * it or type it in" as a screen of its own is a decision somebody makes before
 * they have seen either, and then has to remake. Step one IS the camera, with
 * its own action saying `Next` — so photographing is the default path and
 * skipping it is one press, which is the same choice without the extra screen.
 */

import * as React from "react";
import {
  ActionRow, Await, Bars, Group, NoteRow, NumberInput, PickFile, Row,
  RowsWaiting, SAYS_KIND, Screen, Section, Segmented, Spacer, Stack, Steps, Tags,
  Lookup, TextInput, ToggleRow, Viewfinder, Written, kindOf,
  glyphOf, shrunk, useTelling, type Loaded, type Option,
} from "@engine/design";
import { Button } from "@heroui/react";
import { MOST_BYTES } from "@engine/kernel";
/* ⚠️ ONE BOX IS ONE CODE — the fold the reader has no way to know. */
import { foldScan } from "../code.js";

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

/** Everything the sheet sends. One write — see `product.register`. */
export interface Registering {
  readonly name: string;
  readonly brand: string;
  readonly description: string;
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
  /** Where the back arrow goes. */
  readonly back: () => void;
  /**
   * ⚠️ THE WORDS THIS WORKSPACE ALREADY FILES THINGS UNDER. Sent with the
   * photographs so a model CHOOSES from them, and offered under the tag field so
   * a person does too — one vocabulary, reached two ways.
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
  offering it here would be a rung nothing behind this sheet can honour.
*/
const RUNGS: readonly Option[] = [
  { id: "listed", label: "Listed", help: "A thing you never count" },
  { id: "counted", label: "Counted", help: "A number on a shelf" },
  { id: "batched", label: "Batched", help: "Deliveries kept apart" },
  { id: "itemised", label: "Itemised", help: "Each one is its own" },
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

/**
 * ⚠️ THE JOINTS OF THE THING, NOT AN ARBITRARY QUARTERING. What it looks like,
 * what it is, how it is counted, how it is kept — each answerable without
 * knowing the next, which is the property that makes a step a step rather than a
 * page break.
 *
 * ⚠️ AND THE LABELS ARE ONE WORD WHERE THEY CAN BE. Four of them share a phone's
 * width with four numbers and three rules; `Steps` hides all but the current one
 * below `sm`, and a word that would be truncated there is a word doing nothing.
 */
const STEPS = [
  { id: "photos", label: "Photos" },
  { id: "what", label: "What it is" },
  { id: "counting", label: "Barcodes" },
  { id: "keeping", label: "Keeping" },
] as const;

type Where = (typeof STEPS)[number]["id"];

/**
 * ⚠️ ONE LINE PER STEP, so the screen's subtitle says what THIS one wants.
 *
 * ⚠️ AND EACH IS SHORT ENOUGH FOR A PHONE'S HEM, WHICH IS A MEASUREMENT RATHER
 * THAN A FEELING. The first draft of the photos line ran 51px past the chrome on
 * a 390px viewport — legible on the machine it was written on and cut on every
 * phone. `geometry.seen` reads the real box in a real browser, which is the only
 * place a sentence's width is a fact.
 */
const UNDER: Readonly<Record<Where, string>> = {
  photos: "Photograph it and the rest fills itself",
  what: "What it is called, and what makes it that one",
  counting: "Its barcodes, and what a number means",
  keeping: "How long it keeps, and where more comes from",
};

export function Register({
  title, back, knownTags, knownUnits, suppliers, resembles, onLook, onIdentify,
  guessed, onRegister, busy, again,
}: RegisterProps) {
  /* ⚠️ THE ONE CHANNEL — see `telling.tsx`. Promoting a photograph reorders a
     list somebody is looking at, which is a change they made and should hear. */
  const tell = useTelling();
  const [photos, setPhotos] = React.useState<readonly string[]>([]);
  const [name, setName] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [tracking, setTracking] = React.useState("counted");
  const [whole, setWhole] = React.useState(true);
  const [par, setPar] = React.useState<number | null>(null);
  const [storage, setStorage] = React.useState("");
  const [handling, setHandling] = React.useState("");
  const [shelfDays, setShelfDays] = React.useState<number | null>(null);
  const [openDays, setOpenDays] = React.useState<number | null>(null);
  const [tags, setTags] = React.useState<readonly string[]>([]);
  const [word, setWord] = React.useState("");
  /* ⚠️ EMPTY, NOT ONE BLANK ROW. A row with no code in it was a card with no
     barcode on it and a pack size for a thing nobody had named. */
  const [codes, setCodes] = React.useState<readonly CodeRow[]>([]);
  const [sources, setSources] = React.useState<readonly SourceRow[]>([]);
  const [supplier, setSupplier] = React.useState("");
  const [reorder, setReorder] = React.useState(false);
  const [reorderQty, setReorderQty] = React.useState<number | null>(null);
  const [anyway, setAnyway] = React.useState(false);
  const [where, setWhere] = React.useState<Where>("photos");

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
      photographs is a button whose whole effect is somewhere else: the fields it
      wrote are a step away, and the only thing that changed here is a line of
      small print. It lands on the first step the answer actually touched, with
      the values in place, which is also where they have to be checked.
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
    /* ⚠️ THE PACK GOES ON THE FIRST BARCODE, NOT ON THE PRODUCT. "It holds 100"
       is a fact about the box the code is printed on — a product counted in
       gloves has no pack of its own, and a carton and an inner both do. */
    if (answer.pack > 1) {
      setCodes((held) => held.map((row, i) => (i === 0 && row.pack === 1
        ? { ...row, pack: answer.pack } : row)));
    }
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

  /*
    ⚠️ THE REFUSAL IS PER STEP, AND THAT IS WHAT MAKES THE STEPS WORTH HAVING. One
    sentence at the foot of the whole form told somebody on the last screen that
    something three screens back was missing, and left them to find it. Held
    against the step that owns the field, it appears where the fix is — and a
    step whose own fields are fine goes forward even though the form as a whole
    is not finished, which is the entire point of dividing it.

    ⚠️ AND THE RESEMBLANCE BELONGS TO `what` BECAUSE THE NAME DOES. It is raised
    while somebody is typing the name that caused it, in front of the list of
    what already looks like that, with the answer beside it.
  */
  const missing: Readonly<Record<Where, string | undefined>> = {
    photos: undefined,
    what: !name.trim() ? "Give it a name"
      /* ⚠️ THE RESEMBLANCE IS NOT A REFUSAL UNTIL IT IS THE STRONG KIND, and even
         then it is answerable in place. A form somebody fills in completely and
         is then told to throw away is how people learn to press past a warning
         without reading it. */
      : strong && !anyway ? "Say it is a different thing, or open the one you have"
        : undefined,
    counting: !unit.trim() ? "Say what it is counted in" : undefined,
    keeping: undefined,
  };

  /* ⚠️ THE LAST STEP ANSWERS FOR THE WHOLE FORM, because it is the one holding
     the button that writes. A step somebody skipped forward past is still a
     missing name, and the sentence has to say which step to go back to. */
  const short = missing[where]
    ?? (where === "keeping"
      ? STEPS.map((s) => missing[s.id]).find(Boolean)
      : undefined);

  const send = () => {
    onRegister({
      name: name.trim(), brand: brand.trim(), description: description.trim(),
      unit: unit.trim(), tracking, whole, par,
      storage: storage.trim(), handling: handling.trim(),
      shelfDays, openDays,
      supplier, reorder, reorderQty,
      codes: codes.filter((one) => one.value.trim().length > 0),
      tags, sources, photos, anyway,
    });
  };

  const setCode = (at: number, next: Partial<CodeRow>) => {
    setCodes((held) => held.map((row, i) => (i === at ? { ...row, ...next } : row)));
  };

  const at = STEPS.findIndex((one) => one.id === where);
  const last = at === STEPS.length - 1;
  const go = (to: number) => {
    setWhere(STEPS[Math.min(STEPS.length - 1, Math.max(0, to))]!.id);
  };

  /*
    ⚠️ THE PHONE'S OWN BACK IS THE SAME AFFORDANCE AS THE ARROW, AND IT WAS NOT
    WIRED. `Screen`'s `back` catches the arrow in the chrome; the browser's
    button and an Android swipe go to the router, which knows nothing about a
    step — so somebody on step three who made the gesture that means "undo the
    last thing" lost four steps of typing and every photograph. There is no
    warning available that is worth having here: the gesture is not a mistake,
    the destination was.

    ⚠️ SO EACH STEP PUSHES A HISTORY ENTRY AND `popstate` READS IT BACK. The
    entry is a `state` marker rather than a URL, because the four steps are one
    screen — a URL per step would make each one shareable, bookmarkable and
    reloadable into a form with nothing in it.

    ⚠️ AND THE FIRST STEP PUSHES NOTHING, so Back from there leaves the screen,
    which is what it should do. `at > 0` is the whole condition: N steps forward
    is N entries, and the Nth Back is the one that leaves.
  */
  const stepped = React.useRef(where);
  React.useEffect(() => {
    if (stepped.current === where) return;
    const wasAt = STEPS.findIndex((one) => one.id === stepped.current);
    stepped.current = where;
    /* ⚠️ FORWARD ONLY. Going BACK is what consumed an entry; pushing one there
       would make the next Back land on the step just left. */
    if (at > wasAt) globalThis.history.pushState({ step: where }, "");
  }, [where, at]);

  React.useEffect(() => {
    const back = () => {
      setWhere((held) => {
        const i = STEPS.findIndex((one) => one.id === held);
        /* ⚠️ AT THE FIRST STEP THERE IS NOTHING OF OURS LEFT ON THE STACK, so
           this entry belongs to whatever came before the screen and the default
           behaviour is correct. */
        return i > 0 ? STEPS[i - 1]!.id : held;
      });
    };
    globalThis.addEventListener("popstate", back);
    return () => { globalThis.removeEventListener("popstate", back); };
  }, []);

  return (
    <Screen
      shape="form"
      title={title}
      /*
        ⚠️ BACK IS A STEP BACK UNTIL THERE IS NO STEP TO GO BACK TO. The arrow in
        the chrome and the phone's own gesture are the same affordance to
        somebody using this, so an arrow that left the page from step three
        would throw away three screens of typing on the press that means "undo
        the last one".
      */
      back={at === 0 ? back : () => { go(at - 1); }}
      under={UNDER[where]}
      /*
        ⚠️ THE ACT IS THE SCREEN'S, WHICH IS WHAT MAKES IT A PAGE. `does` puts it
        where every other primary action in the product lives — the bar on a
        phone, the crown on a desk — rather than in a footer only this surface
        has (DESIGN.md §4).

        ⚠️ AND EVERY STEP NAMES `product.register`, INCLUDING THE THREE THAT DO
        NOT CALL IT. `Next` calls nothing, so the first draft left its `op` off —
        and that is the offer-and-refuse failure spread over four screens instead
        of one. Somebody without `product:write` would photograph a box, name it,
        scan three barcodes and be refused by the fourth button. Naming the
        operation the whole form exists to reach means the gate answers on step
        one, which is where it costs nobody anything.
      */
      does={last
        ? {
          op: "product.register",
          /* ⚠️ THE NOUN, BECAUSE "IT" IS ONLY OBVIOUS TO WHOEVER WROTE IT. Four
             steps and a scroll later, the last button on the screen says what it
             adds — and "Add it" reads as a fragment of a sentence the interface
             started somewhere the person cannot see. */
          label: "Add product",
          onDo: send,
          disabled: busy === true || Boolean(short),
        }
        : {
          op: "product.register",
          label: "Next",
          onDo: () => { go(at + 1); },
          disabled: busy === true || Boolean(short),
        }}
    >
      <Stack>
        <Steps at={where} steps={STEPS as unknown as readonly { id: string; label: string }[]} />

        {/*
          ⚠️ THE CAMERA IS FIRST BECAUSE IT IS THE FAST LANE. Somebody who knows
          what they are adding presses Next past it.

          ⚠️ EVERY SECTION KEEPS ITS HEADING, AND THE DUPLICATION WAS FIXED AT THE
          OTHER END. The step's name appeared three times over the first field —
          in the progress chip, in the screen's subtitle and in this `h2` — and
          the first draft of the fix deleted the `h2`. That is the wrong one of
          the three: the browser reading then found a step with nothing on it
          outranking body text, because on a form the section heading IS the
          hierarchy. `Steps` carries numbers now (see there); the words stayed.
        */}
        {where === "photos" ? (
        <Section label="Photos">
            <PickFile
              accept={["image/*"]}
              /*
                ⚠️ THE TRANSPORT'S OWN CEILING, NOT A NUMBER PICKED HERE. This was
                two megabytes, which refuses every photograph a phone has taken
                since about 2015 — chosen because `product.see` caps a batch at
                eight and nothing was making the pictures smaller. `shrunk` is
                what was missing; with it, six photographs off any phone come to
                well under that, and the only ceiling left is what `media.upload`
                will actually accept.
              */
              most={MOST_BYTES}
              says={photos.length ? "Add another angle" : "Take a photo of the product"}
              /*
                ⚠️ THE LABEL IS NAMED, BECAUSE IT IS THE PICTURE THAT PAYS. Net
                contents, the printed name, the storage line and the shelf life
                are on the label and nowhere else on the packaging — somebody
                who photographs three sides of a box and not the back gets a
                worse answer and never learns why.
              */
              under={photos.length
                ? `${photos.length} of ${MOST_PHOTOS}. The first one is the one people check against`
                : "The front, the back and the label. The label is where the detail is"}
              label="Take a photo"
              busy={busy}
              /*
                ⚠️ AS MANY AS THERE IS ROOM FOR, IN ONE TRIP. The six a person
                takes of a box are adjacent in their camera roll a minute later,
                and six trips through the picker to fetch six adjacent files was
                the control charging somebody for a limit nobody had decided.
                `MOST_PHOTOS − held` rather than `MOST_PHOTOS`, so the ceiling is
                what may still be added rather than what may ever be.
              */
              atOnce={Math.max(1, MOST_PHOTOS - photos.length)}
              /*
                ⚠️ SHRUNK ON THE WAY IN, ONCE, RATHER THAN ON THE WAY OUT. Held at
                full size the six would be forty megabytes in React state on a
                phone — and the two places that send them (the upload and the
                model) would each have to remember to reduce, which is two chances
                to forget and one of them is the one that costs credits.
              */
              onPick={(bytes, file) => {
                void (async () => {
                  const small = await shrunk(bytes, file.type);
                  setPhotos((held) => (held.length >= MOST_PHOTOS ? held : [...held, small]));
                })();
              }}
            />

            {/*
              ⚠️ THE PHOTOGRAPHS, AS PHOTOGRAPHS. This was a list of rows saying
              "The picture of record" and "Angle 2" — words about pictures, on the
              one screen where the pictures are already in hand. Somebody who has
              just taken six shots of a box wants to see which six; a row of names
              makes them remember, and the whole point of taking them was not to
              have to.

              ⚠️ THE FIRST ONE IS BIGGER, because it is a different thing. It
              becomes `product.photo` — what somebody checks the thing in their
              hand against — and the rest are the gallery. A caption saying so on
              every tile is texture; one tile at twice the size says it without a
              word, and it is also the one they will want to look at.
            */}
            {photos.length ? (
              /*
                ⚠️ A STRIP THAT SCROLLS, NOT A GRID THAT REFLOWS. A grid on a
                phone spends the width it has on however many tiles happen to
                exist, so six photographs are six thumbnails too small to check
                and the button that uses them is below the fold. A strip gives
                each one a size that does not change with the count, and the
                gesture for "what else did I take" is the one a phone already
                teaches.

                ⚠️ THE FIRST TILE IS WIDER, because it is a different thing. It
                becomes `product.photo` — what somebody checks the thing in their
                hand against — and the rest are the gallery. It is also first in
                the strip, so "which one is it" needs no caption.

                ⚠️ AND IT BLEEDS PAST THE GUTTER. A strip that stops at the
                column's edge looks like a row that happens to be too long; one
                that runs off the screen says there is more, which is the whole
                affordance.
              */
              <div className="-mx-4 overflow-x-auto px-4">
                <div className="flex w-max gap-2">
                  {photos.map((one, at) => (
                    <div
                      key={one.slice(-24)}
                      className={`relative shrink-0 overflow-hidden rounded-xl ${at === 0 ? "w-40" : "w-28"}`}
                    >
                      <img
                        src={one}
                        alt={at === 0 ? "The picture of record" : `Angle ${at + 1}`}
                        className="aspect-square h-full w-full object-cover"
                      />
                      {/* ⚠️ ON THE TILE, NOT IN A ROW UNDER IT. A remove that is
                          not on the thing it removes is a remove somebody has to
                          count tiles to trust. */}
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
                        ⚠️ AND PROMOTING ONE IS A MOVE, NOT A FLAG. Which
                        photograph is the picture of record is decided by ORDER —
                        the first is the one — so "use this one" puts it first
                        rather than setting a field beside it. One fact, one
                        place: a `primary` flag alongside an ordered list is two
                        answers to the same question, and they disagree the first
                        time somebody deletes the flagged one.

                        ⚠️ OFFERED ONLY WHERE IT WOULD DO SOMETHING. On the tile
                        that is already first it is a control that changes
                        nothing, which is read as broken.
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
                </div>
              </div>
            ) : null}

            {/*
              ⚠️ ONE PRESS, AND IT SAYS WHAT IT COSTS BY SAYING WHAT IT DOES.
              Identifying reserves credits, so it never runs on its own — a sheet
              that asked a model every time somebody opened the camera would bill
              a workspace for photographs nobody finished taking.
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
              then={(of) => {
                if (!of) return null;
                /* ⚠️ SAID ONCE, NOT PER FIELD. A badge on every row a model
                   touched is texture; one line above the form is the sentence. */
                return (
                  <NoteRow icon={glyphOf("model")}>
                    {of.why
                      ? `Filled in by a model — ${of.why.toLowerCase()}. Check it before you add it`
                      : "Filled in by a model. Check it before you add it"}
                  </NoteRow>
                );
              }}
            />
        </Section>
        ) : null}

        {where === "what" ? (
        <>
        <Section label="What it is">
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
              BRIEF. A model reading six photographs writes real prose here —
              what it is, what size, what form, what it is not — and drawn at the
              default height it arrived in a box one line tall, so what came back
              looked like a fragment and what people typed was a fragment.
            */}
            <Written
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="What it is, what size, what form"
              rows={5}
            />

            {/*
              ⚠️ WHAT ALREADY LOOKS LIKE THIS, UNDER THE NAME THAT CAUSED IT. A
              list of near-duplicates at the foot of a long sheet is a list
              nobody scrolls to, and the decision it informs is being made here.
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
        </Section>

        {/*
          ⚠️ A VOCABULARY RATHER THAN FREE TEXT, WHICH IS WHY WHAT EXISTS IS
          SHOWN. "Cleaning", "Cleaning products" and "Janitorial" across three
          mornings are all defensible and leave the catalogue unfilterable by the
          thing it was filed under — so the words already in use are one press
          away and a new one takes typing.
        */}
        <Section label="Kinds">
            <Tags
              label="Filed under"
              items={tags.map((t) => ({ id: t, label: t }))}
              onRemove={(id) => { setTags((held) => held.filter((t) => t !== id)); }}
            />
            <TextInput
              label="Add a kind"
              value={word}
              onChange={setWord}
              placeholder="Type a word and press Add"
              name="tag"
            />
            <Button
              variant="secondary"
              isDisabled={!word.trim()}
              onPress={() => {
                const said = word.trim();
                setTags((held) => (held.some((t) => t.toLowerCase() === said.toLowerCase())
                  ? held : [...held, said]));
                setWord("");
              }}
            >
              Add
            </Button>

            {knownTags.length
              ? (
                <>
                  <NoteRow>Words this workspace already uses</NoteRow>
                  {knownTags
                    .filter((o) => !tags.some((t) => t.toLowerCase() === o.label.toLowerCase()))
                    .slice(0, 8)
                    .map((o) => (
                      <ActionRow
                        key={o.id}
                        label={o.label}
                        onDo={() => { setTags((held) => [...held, o.label]); }}
                      />
                    ))}
                </>
              )
              : null}
        </Section>
        </>
        ) : null}

        {where === "counting" ? (
        <>
        {/*
          ⚠️ AS MANY BARCODES AS THE THING HAS, AND THE PACK IS WHY. A box of a
          hundred gloves and one glove are one product with two codes, and
          scanning the carton to record a single item is the commonest wrong
          number in inventory work — the code already knew, if somebody said so
          here.
        */}
        <Section label="Barcodes">
            {/*
              ⚠️ ONE WAY IN, AND IT WAS TWO. `Viewfinder` carries its own typed
              field — that is the shape of the control, so every scanning surface
              has a keyboard route whether or not whoever wrote it thought about
              the camera failing. This screen then drew a SECOND text field per
              code row, so the step had two boxes asking for the same digits one
              above the other, and neither said which one the scan would fill.

              ⚠️ AND A CODE ALREADY ON THE LIST IS IGNORED RATHER THAN ADDED
              TWICE. A label sits in front of a lens for a second and decodes
              thirty times; `Viewfinder` collapses that into one read, and this
              is what stops the second deliberate scan of the same box from
              making a duplicate row nobody asked for.
            */}
            <Viewfinder
              says="Hold each barcode up in turn"
              /*
                ⚠️ WHAT IS ALREADY ON THE LIST, SO A SECOND LOOK SAYS SO. Without
                it the reader compares against the last thing it saw, and two
                boxes on a bench alternating in front of a lens each look new
                every time the other one intervenes.
              */
              held={codes.map((one) => one.value)}
              /* ⚠️ ONE BOX IS ONE CODE — see `foldScan`. This pack carries an
                 EAN-13 and a DataMatrix, and without this it registered as two
                 products. */
              fold={foldScan}
              typed={{
                label: "Or type a code",
                placeholder: "What is printed under the bars",
                help: "The item, the inner box and the carton can all be added",
              }}
              onRead={(code) => {
                const said = code.trim();
                if (!said) return;
                setCodes((held) => (held.some((one) => one.value === said)
                  ? held : [...held, { value: said, kind: namespaceOf(said), pack: 1 }]));
              }}
            />

            {/*
              ⚠️ WHAT WAS SCANNED, SHOWN AS WHAT IT IS. Every code used to be a
              text field, a four-way "what kind" and a number — twelve controls
              for three barcodes, on a phone, to record something the camera had
              already read. A code that has been read is a FACT: it is drawn, it
              is named, and the one thing nobody can know from looking at it is
              how many the pack holds.

              ⚠️ AND THEY SCROLL SIDEWAYS RATHER THAN STACKING. Three of these
              down the page is the step's whole height for its least important
              part; in a row they are one glance, and the barcode itself is what
              somebody checks against the box.
            */}
            {codes.length ? (
              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
                {/* ⚠️ THE SIZING IS OUTSIDE THE CARD AND THE COLUMN IS THE CARD'S.
                    A `Stack` inside a `Group` is a second column in something that
                    is already one — a second inset and a second gap, which is what
                    "double padding" means (`rhythm`). The div carries a width and
                    nothing else. */}
                {codes.map((row, at) => (
                  <div key={row.value || at} className="w-60 shrink-0 snap-start">
                    <Group label={sayKind(row.value)}>
                        {/*
                          ⚠️ DRAWN WHERE IT CAN BE, AND ONLY THERE. `Bars` answers
                          nothing for a Code-128 or a number somebody typed — a
                          convincing picture of the wrong symbology scans as the
                          wrong product, which is worse than no picture at all.
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
              </div>
            ) : null}
        </Section>

        <Section label="Counting">
            {/*
              ⚠️ WHAT THIS WORKSPACE ALREADY COUNTS IN, OFFERED RATHER THAN
              REMEMBERED. Typed free, one catalogue ends up with `box`, `Box`,
              `boxes` and `BX` — four units that are one unit, on four products
              that can never be compared or totalled. `Lookup` still takes
              anything typed, so a new unit costs nothing; it just stops the
              fifth spelling of an old one being the path of least resistance.
            */}
            <Lookup
              label="Counted in"
              value={unit}
              onChange={setUnit}
              options={knownUnits}
              placeholder="glove, box, kg"
              help="Shown beside every number this product ever reports"
              name="unit"
            />
            <Segmented label="Tracked as" value={tracking} onChange={setTracking} options={RUNGS} />
            <ToggleRow
              label="Whole units only"
              under="Off where a half is a real quantity"
              value={whole}
              onChange={setWhole}
            />
            {/*
              ⚠️ WHEN TO SAY SOMETHING, NOT WHEN TO REFUSE. Running out is a fact
              about the world; an app that refused a take because a number went
              under a line is an app people work around.
            */}
            <NumberInput
              label="Running low at"
              value={numberOr(par)}
              onChange={(next) => { setPar(next > 0 ? next : null); }}
              min={0}
              help="Zero means never"
            />
        </Section>
        </>
        ) : null}

        {where === "keeping" ? (
        <>
        <Section label="Keeping it">
            {/*
              ⚠️ THE TWO FIELDS `Written` WAS BUILT FOR. Storage and handling are
              where a model writes headed paragraphs and a list of what a thing
              must not sit beside — and this is read at a shelf by somebody
              holding a box, which is the one place a wall of grey is useless.
              Markdown in, structure out.
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
              ⚠️ HOW LONG IT KEEPS IS THE PRODUCT'S; WHEN THIS ONE EXPIRES IS THE
              DELIVERY'S. Two boxes of the same thing made in March and in
              September go off six months apart — so this sheet asks for the
              DURATION and never for a date, and the date is read off each box
              as it arrives. A field here holding "expires 2027-03-31" would put
              one delivery's date on every future one.
            */}
            <NumberInput
              label="Shelf life"
              value={numberOr(shelfDays)}
              onChange={(next) => { setShelfDays(next > 0 ? next : null); }}
              min={0}
              help={shelfDays
                ? `About ${Math.round(shelfDays / 30)} months from the day it was made`
                : "Days from the day it was made. 730 is two years. Zero never expires"}
            />
            <NumberInput
              label="Once opened"
              value={numberOr(openDays)}
              onChange={(next) => { setOpenDays(next > 0 ? next : null); }}
              min={0}
              help="The open-jar symbol on the label — 12M is 365 days"
            />

            {/*
              ⚠️ A PICTOGRAM WAS SEEN, AND SAYING SO IS THE WHOLE VALUE. Which
              class an orange diamond declares is a legal statement the label
              reader makes against a photograph of the printed label, where the
              words are legible — but a sheet that stayed silent would let
              somebody register a solvent as though it were shampoo and find out
              the first time they decant it.
            */}
            {answer?.hazardous
              ? (
                <NoteRow icon={glyphOf("alert")}>
                  There is a hazard symbol on this. Read its label from the
                  product page — a class has to come off the printed words
                </NoteRow>
              )
              : (
                <NoteRow>
                  Hazard classes are read off the label, on the product itself
                </NoteRow>
              )}
        </Section>

        <Section label="Getting more">
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
                            addressed to somebody the catalogue does not say
                            sells it is an order nobody can explain — so removing
                            a supplier clears the preference it held, and the
                            first one added takes it.
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
        </Section>
        </>
        ) : null}

        {/* ⚠️ UNDER THE STEP IT BELONGS TO, which is why it is outside the four
            groups above rather than inside each of them. `short` already resolves
            to this step's own refusal — or, on the last one, to whichever earlier
            step is still short. */}
        {short ? <NoteRow icon={glyphOf("alert")}>{short}</NoteRow> : null}
      </Stack>
    </Screen>
  );
}
