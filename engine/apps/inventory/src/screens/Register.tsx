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
  ActionRow, Await, LongText, NoteRow, NumberInput, PickFile, RowsWaiting, Screen,
  Section, Segmented, Stack, Steps, Tags, TextInput, ToggleRow, Viewfinder,
  asDataUrl, glyphOf, type Loaded, type Option,
} from "@engine/design";
import { Button } from "@heroui/react";

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

const KINDS: readonly Option[] = [
  { id: "gtin", label: "Barcode" },
  { id: "qr", label: "QR" },
  { id: "datamatrix", label: "Square code" },
  { id: "other", label: "Other" },
];

const EMPTY_CODE: CodeRow = { value: "", kind: "gtin", pack: 1 };

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
  { id: "counting", label: "Counting" },
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
  title, back, knownTags, suppliers, resembles, onLook, onIdentify,
  guessed, onRegister, busy, again,
}: RegisterProps) {
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
  const [codes, setCodes] = React.useState<readonly CodeRow[]>([EMPTY_CODE]);
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
          label: "Add it",
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
          ⚠️ THE CAMERA IS FIRST BECAUSE IT IS THE FAST LANE, and it is a section
          rather than a step: nothing below it waits for it. Somebody who knows
          what they are adding scrolls past.
        */}
        {where === "photos" ? (
        <Section label="Photos">
            <PickFile
              accept={["image/*"]}
              most={2 * 1024 * 1024}
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
              onPick={(bytes, file) => {
                setPhotos((held) => (held.length >= MOST_PHOTOS
                  ? held : [...held, asDataUrl(bytes, file.type)]));
              }}
            />

            {photos.map((one, at) => (
              <ActionRow
                key={one.slice(-24)}
                label={at === 0 ? "The picture of record" : `Angle ${at + 1}`}
                under={at === 0 ? "What somebody checks the thing in their hand against" : undefined}
                onDo={() => { setPhotos((held) => held.filter((_, i) => i !== at)); }}
              />
            ))}

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
                  <NoteRow icon={glyphOf("sparkle")}>
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
            <LongText
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="What it is, what size, what form"
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
              ⚠️ SCANNED, NOT TYPED, BECAUSE A BARCODE IS FOURTEEN DIGITS AND
              NOBODY TYPES FOURTEEN DIGITS TWICE. A product often has two or
              three — the item, the inner, the carton — and the way to record
              them is to hold each one up in turn, which is the same gesture
              Receive and Count already use. Every scan appends a row; the
              typed field under the frame is the way that always works.

              ⚠️ AND A CODE ALREADY ON THE LIST IS IGNORED RATHER THAN ADDED
              TWICE. A label sits in front of a lens for a second and decodes
              thirty times; `Viewfinder` collapses that into one read, and this
              is what stops the second deliberate scan of the same box from
              making a duplicate row nobody asked for.
            */}
            <Viewfinder
              says="Hold each barcode up in turn"
              /* ⚠️ THE READ IS HEARD, WHICH IS WHY THIS SURFACE NEEDS NO CHANGE
                 FOR IT — `Viewfinder` beeps for a read, a repeat and a refusal.
                 A caller that turned it off here would be the one place in the
                 product where scanning is silent. */
              typed={{
                label: "Or type a code",
                placeholder: "What is printed under the bars",
                help: "The item, the inner box and the carton can all be added",
              }}
              onRead={(code) => {
                const said = code.trim();
                if (!said) return;
                setCodes((held) => (held.some((one) => one.value === said)
                  ? held
                  /* ⚠️ INTO THE FIRST EMPTY ROW BEFORE APPENDING, so the row the
                     sheet opens with is the one that fills rather than being
                     left blank above the scan. */
                  : held.some((one) => !one.value.trim())
                    ? held.map((one) => (one.value.trim() ? one : { ...one, value: said }))
                    : [...held, { ...EMPTY_CODE, value: said }]));
              }}
            />

            {codes.map((row, at) => (
              <React.Fragment key={at}>
                <TextInput
                  label={at === 0 ? "Code" : `Code ${at + 1}`}
                  value={row.value}
                  onChange={(next) => { setCode(at, { value: next }); }}
                  placeholder="Scan it above, or type what is printed"
                  name={`code-${at}`}
                />
                <Segmented
                  label="What kind"
                  value={row.kind}
                  onChange={(next) => { setCode(at, { kind: next }); }}
                  options={KINDS}
                />
                <NumberInput
                  label="This one holds"
                  value={row.pack}
                  onChange={(next) => { setCode(at, { pack: Math.max(1, next) }); }}
                  min={1}
                  help={unit ? `In ${unit}. One for a single item, more for a carton` : undefined}
                />
                {codes.length > 1
                  ? (
                    <Button
                      variant="secondary"
                      onPress={() => {
                        setCodes((held) => held.filter((_, i) => i !== at));
                      }}
                    >
                      Remove this code
                    </Button>
                  )
                  : null}
              </React.Fragment>
            ))}
            <Button
              variant="secondary"
              onPress={() => { setCodes((held) => [...held, EMPTY_CODE]); }}
            >
              Another barcode
            </Button>
        </Section>

        <Section label="Counting">
            <TextInput
              label="Counted in"
              value={unit}
              onChange={setUnit}
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
              label="Tell me below"
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
            <LongText
              label="How to store it"
              value={storage}
              onChange={setStorage}
              placeholder="Cool, dry, upright"
            />
            <LongText
              label="How to handle it"
              value={handling}
              onChange={setHandling}
              placeholder="Gloves, two people, keep flat"
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
              label="Keeps for, from making"
              value={numberOr(shelfDays)}
              onChange={(next) => { setShelfDays(next > 0 ? next : null); }}
              min={0}
              help={shelfDays ? `About ${Math.round(shelfDays / 30)} months. Zero means it does not expire`
                : "In days. 730 is two years. Zero means it does not expire"}
            />
            <NumberInput
              label="Keeps for, once opened"
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
              under="Nothing is sent — the list is somewhere to work from"
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
