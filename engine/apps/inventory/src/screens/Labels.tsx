/**
 * LABELS — the sheet somebody prints and sticks to things.
 *
 * ⚠️ THE DECANT LABEL IS WHY THIS SCREEN EXISTS, and it is the gap in almost
 * every inventory product. Pour solvent from a 20 L drum into a 500 ml bottle
 * and that bottle is a container of a hazardous substance with no label on it —
 * the supplier's stayed on the drum. Nothing else here is difficult; that one is
 * the difference between a workspace that can be inspected and one that cannot.
 *
 * ⚠️ AND THE PLACE LABEL IS THE ONE THAT PAYS FOR ITSELF DAILY. When the camera
 * sees a place it MOVES the session rather than adding stock, which is what
 * turns a two-hour count into forty minutes — and it cannot happen for a shelf
 * nobody has labelled. That is why every location gets one, always.
 *
 * ⚠️ WHAT IS PRINTED IS NOT THE REGULATED PICTOGRAM. The nine GHS marks are
 * published artwork with an exact geometry; an approximation drawn from memory
 * fails an inspection and misleads the person holding the bottle. The diamond
 * carries the hazard's NAME, which is unambiguous, and the sheet says so in
 * words rather than leaving somebody to assume.
 */

import * as React from "react";
import {
  Group, NoteRow, Picks, Screen, Section, Segmented, glyphOf, type Loaded,
} from "@engine/design";
/* ⚠️ A SUBPATH, DELIBERATELY. The QR encoder is Reed-Solomon and mask
   arithmetic that only a printed label needs; in the entry it is weight every
   visitor to every door downloads before anything is drawn. */
import { Code, Label, LabelSheet, LabelText } from "@engine/design/labels";
import { GHS, hazardContradictions, hazardOf, isHazardous } from "../hazard.js";

/** One thing that can be labelled, whatever kind it is. */
export interface Labelled {
  readonly id: string;
  readonly name: string;
  /** ⚠️ Empty where nothing has been minted yet — printing is what mints it. */
  readonly code: string;
  /** The shelf trail, the serial, the brand — whatever a person reads second. */
  readonly under: string;
  /** GHS codes. Empty on anything that is not a substance. */
  readonly hazards: readonly string[];
  readonly signal: "danger" | "warning" | "";
  readonly hazardText: string;
  readonly precautions: string;
}

export type Subject = "place" | "thing" | "item" | "kit";

/** Which template, which is a question about the roll in the printer. */
export type Template = "tag" | "decant" | "opened";

export interface LabelsProps {
  readonly title?: string;
  readonly of: Loaded<readonly Labelled[]>;
  readonly subject: Subject;
  readonly onSubject: (of: Subject) => void;
  readonly picked: readonly string[];
  readonly onPicked: (ids: readonly string[]) => void;
  readonly template: Template;
  readonly onTemplate: (of: Template) => void;
  /** ⚠️ Today, from the device — an opened-on label is a local date. */
  readonly today: string;
  readonly again: () => void;
  readonly onPrint: () => void;
  readonly busy?: boolean;
}

const SUBJECTS: readonly { readonly id: Subject; readonly label: string }[] = [
  { id: "place", label: "Places" },
  { id: "thing", label: "Products" },
  { id: "item", label: "Items" },
  { id: "kit", label: "Kits" },
];

/*
  ⚠️ THREE SHAPES AND THEY ARE SIZES BEFORE THEY ARE DESIGNS. A label is 38 × 21
  because that is the roll in the printer — the layout follows the millimetres,
  never the other way round.
*/
const TEMPLATES: Readonly<Record<Template, {
  readonly label: string; readonly w: number; readonly h: number; readonly code: number;
}>> = {
  tag: { label: "Tag", w: 38, h: 21, code: 17 },
  decant: { label: "Decant", w: 62, h: 45, code: 18 },
  opened: { label: "Opened on", w: 38, h: 21, code: 0 },
};

const SAID_SIGNAL: Readonly<Record<string, string>> = {
  danger: "DANGER", warning: "WARNING",
};

/**
 * ⚠️ AT MOST TWO LINES, BALANCED, BECAUSE A DIAMOND IS WIDEST AT ITS MIDDLE. A
 * phrase set on one line runs out through the red border — the shape narrows to
 * nothing at both points — and a hazard name a reader cannot finish is the one
 * thing this label exists to say.
 */
export const inTwo = (phrase: string): readonly string[] => {
  const words = phrase.split(" ");
  if (words.length < 2) return words;
  let at = 1;
  let closest = Number.POSITIVE_INFINITY;
  for (let cut = 1; cut < words.length; cut++) {
    const gap = Math.abs(
      words.slice(0, cut).join(" ").length - words.slice(cut).join(" ").length);
    if (gap < closest) { closest = gap; at = cut; }
  }
  return [words.slice(0, at).join(" "), words.slice(at).join(" ")];
};

/**
 * THE LARGEST TYPE THAT STAYS INSIDE THE RED BORDER.
 *
 * ⚠️ A RHOMBUS IS NOT A BOX, WHICH IS THE WHOLE ARITHMETIC. It narrows to
 * nothing at both points, so what a line has to satisfy is
 * `|x−50| + |y−50| ≤ 39` at each CORNER of the drawn text — the widest word that
 * fits the square runs out through the border, and a second line has less room
 * than the first because it sits further from the middle.
 *
 * ⚠️ THE THREE RATIOS ARE MEASURED, NOT ASSUMED, and `hazard.screens.test.tsx`
 * is what measures them: it lays every hazard the product knows out in a real
 * browser and reads the box back. A guess at how wide a bold sans runs is a
 * guess that holds for the word it was checked against.
 */
/** How wide a character runs, in ems, in the face this label prints in. */
const RUNS = 0.75;
/** Half the height a line is drawn at, in ems. */
const TALL = 0.6;
/** Line to line, in ems. */
const LEAD = 1.15;
/** The white inside the border, from the middle, in the units it is drawn in. */
const INSIDE = 39;

const fits = (lines: readonly string[]): number => {
  const widest = Math.max(...lines.map((line) => line.length));
  const out = (lines.length - 1) / 2 * LEAD;
  return Math.min(16, INSIDE / (RUNS * widest / 2 + out + TALL));
};

/**
 * ⚠️ THE DIAMOND IS DRAWN, THE PICTOGRAM IS NOT — see the header. A red-bordered
 * square on its point with the hazard named inside it is what GHS labelling
 * looks like at a glance and makes no claim to be the artwork.
 *
 * ⚠️ AND IT IS THE WHOLE NAME. It was the first word, which is not a shorter way
 * of saying the same thing: "Gas under pressure" became "Gas", "Acutely toxic"
 * became "Acutely" and "Health hazard" became "Health" — three diamonds on a
 * real container naming no hazard at all, which is worse than an empty one
 * because it reads as information.
 *
 * ⚠️ THE TYPE IS SIZED TO THE LONGEST LINE rather than fixed. A fixed size fits
 * the word it was chosen for and overruns every longer one, and the overrun is
 * invisible until somebody prints a solvent.
 */
function Diamond({ code }: { readonly code: string }) {
  const of = hazardOf(code);
  const says = of?.says ?? code;
  const lines = inTwo(says);
  const size = fits(lines);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: "11mm", height: "11mm", flex: "0 0 auto",
      }}
    >
      <svg viewBox="0 0 100 100" width="11mm" height="11mm" role="img" aria-label={says}>
        <path d="M50 4 96 50 50 96 4 50Z" fill="#fff" stroke="#d40000" strokeWidth="10" />
        {lines.map((line, i) => (
          <text
            key={line}
            x="50" y={50 + (i - (lines.length - 1) / 2) * size * 1.15}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={size} fontFamily="system-ui, sans-serif" fontWeight="700" fill="#000"
          >
            {line}
          </text>
        ))}
      </svg>
    </span>
  );
}

/** ⚠️ One label, and the TEMPLATE decides what is on it rather than the subject. */
function One({ of, template, today }: {
  readonly of: Labelled; readonly template: Template; readonly today: string;
}) {
  const spec = TEMPLATES[template];

  if (template === "opened") {
    return (
      <Label width={spec.w} height={spec.h}>
        <LabelText mm={3.4} bold lines={2}>{of.name}</LabelText>
        {/* ⚠️ THE DATE IS THE WHOLE LABEL AND IT IS THE BIGGEST THING ON IT. A
            kitchen reads this across a bench; a name in the same size as a date
            makes somebody pick the wrong tub up. */}
        <LabelText mm={5}><strong>Opened {today}</strong></LabelText>
      </Label>
    );
  }

  if (template === "decant") {
    return (
      <Label width={spec.w} height={spec.h}>
        <div style={{ display: "flex", gap: "1.5mm", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <LabelText mm={3.6} bold lines={2}>{of.name}</LabelText>
            {of.signal
              ? <LabelText mm={4.2} bold>{SAID_SIGNAL[of.signal]}</LabelText>
              : null}
            <LabelText mm={2.4}>Decanted {today}</LabelText>
          </div>
          {of.code ? <Code of={of.code} mm={spec.code} title={of.code} /> : null}
        </div>
        {of.hazards.length
          ? (
            <div style={{ display: "flex", gap: "1mm", flexWrap: "wrap" }}>
              {of.hazards.map((code) => <Diamond key={code} code={code} />)}
            </div>
          )
          : null}
        {/* ⚠️ THE STATEMENTS ARE THE EXACT HALF AND THEY ARE TEXT, so they are
            printed verbatim and clamped rather than summarised. A shortened
            hazard statement is a different hazard statement. */}
        <LabelText mm={2.2} lines={3}>{of.hazardText}</LabelText>
        <LabelText mm={2.2} lines={2}>{of.precautions}</LabelText>
      </Label>
    );
  }

  return (
    <Label width={spec.w} height={spec.h}>
      <div style={{ display: "flex", gap: "1.5mm", alignItems: "center", height: "100%" }}>
        {of.code ? <Code of={of.code} mm={spec.code} title={of.code} /> : null}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <LabelText mm={3.2} bold lines={2}>{of.name}</LabelText>
          {of.under ? <LabelText mm={2.2}>{of.under}</LabelText> : null}
          {/* ⚠️ THE CODE IN WORDS AS WELL AS IN THE SYMBOL. A camera fails —
              a cracked lens, a dead battery, a label under frost — and the
              string is what somebody types into the search box instead. */}
          {of.code ? <LabelText mm={2}>{of.code}</LabelText> : null}
        </div>
      </div>
    </Label>
  );
}

export function Labels({
  title, of, subject, onSubject, picked, onPicked, template, onTemplate, today,
  again, onPrint, busy,
}: LabelsProps) {
  const chosen = React.useMemo(() => new Set(picked), [picked]);
  const rows = of.status === "ready" ? of.data : [];

  /* ⚠️ NAMED ONCE PER PRODUCT, because the same contradiction across six bottles
     is one thing to fix and six lines to scroll past. */
  const wrong = React.useMemo(() => {
    const out = new Map<string, string>();
    for (const row of rows) {
      if (!chosen.has(row.id)) continue;
      for (const said of hazardContradictions(row.hazards, row.signal)) {
        out.set(`${row.name}: ${said}`, said);
      }
    }
    return [...out.keys()];
  }, [rows, chosen]);

  return (
    <Screen
      shape="list"
      title={title}
      under="Print what a camera can read, and what a person can read"
      does={{ op: "product.label", label: "Print", onDo: onPrint,
        disabled: busy === true || picked.length === 0 }}
      of={of}
      again={again}
      isNothing={(rows) => rows.length === 0}
      nothing={{
        icon: glyphOf("tag"),
        says: "Nothing to label yet",
        under: "Add a place or a product and it appears here",
      }}
      then={(rows) => (
        <>
          <Group>
            <Segmented
              label="What to label"
              value={subject}
              onChange={(next) => { onSubject(next as Subject); }}
              options={SUBJECTS.map((one) => ({ id: one.id, label: one.label }))}
            />
            {/* ⚠️ THE DECANT SHAPE IS OFFERED FOR PRODUCTS AND NOWHERE ELSE. A
                shelf has no hazard classification and a tool has no statements;
                a template list that offered all three everywhere would produce a
                mostly-empty 62 mm label for a rack. */}
            <Segmented
              label="Template"
              value={template}
              onChange={(next) => { onTemplate(next as Template); }}
              options={(subject === "thing"
                ? (["tag", "decant", "opened"] as const)
                : (["tag"] as const)).map((one) => ({
                id: one, label: TEMPLATES[one].label,
              }))}
            />
          </Group>

          <Section label="Which">
            <Group>
              <Picks
                /* ⚠️ THE NOUN, NOT "CHOOSE". The section above already says
                   Which, so a group headed "Choose" is the screen saying the
                   same thing twice and naming neither list. */
                label={SUBJECTS.find((one) => one.id === subject)?.label ?? "Which"}
                value={[...picked]}
                onChange={(next) => { onPicked(next); }}
                options={rows.map((row) => ({
                  id: row.id,
                  label: row.name,
                  ...(row.under ? { help: row.under } : {}),
                }))}
              />
              {/* ⚠️ SAID BEFORE THE PRINT RATHER THAN AFTER IT. Printing is what
                  mints a code for a place or a product, and somebody choosing
                  four hundred shelves should know that is what the button does
                  before it does it four hundred times. */}
              {subject === "place" || subject === "thing"
                ? <NoteRow>Anything with no label yet gets one when you print</NoteRow>
                : null}
            </Group>
          </Section>

          {/*
            ⚠️ A CONTRADICTION IS REPORTED WHERE THE LABEL IS PRINTED, and this is
            the only surface that can do it. The editor is generated from the
            declaration and knows nothing about GHS precedence; the sheet is
            where somebody is about to stick "harmful" and "acutely toxic" on the
            same bottle, which tells a reader the harm is minor while the diamond
            beside it says it can kill.

            ⚠️ REPORTED, NEVER REFUSED. The person filling this in has the safety
            data sheet and we do not — an app that refused their classification is
            one they work around by writing the hazard in the notes, where nothing
            prints it.
          */}
          {template === "decant" && wrong.length
            ? (
              <Group label="Worth a second look" under="Two things on one label disagree">
                {wrong.map((said) => (
                  <NoteRow key={said} icon={glyphOf("alert")}>
                    <span data-ink="warning">{said}</span>
                  </NoteRow>
                ))}
              </Group>
            )
            : null}

          {template === "decant"
            && rows.some((row) => chosen.has(row.id) && isHazardous(row.hazards, row.signal))
            ? (
              <Group label="About the diamonds" under="What is printed, and what is not">
                <NoteRow icon={glyphOf("alert")}>
                  <span data-ink="warning">
                    The diamond names the hazard. It is not the regulated pictogram —
                    apply the supplier&rsquo;s where one is required
                  </span>
                </NoteRow>
              </Group>
            )
            : null}

          <Section label="The sheet">
            {/* ⚠️ THE PREVIEW IS THE SHEET, not a picture of one. What is on
                screen is the same components at the same millimetres, so nothing
                can look right here and come out of the printer wrong. */}
            <LabelSheet>
              {rows.filter((row) => chosen.has(row.id)).map((row) => (
                <One key={row.id} of={row} template={template} today={today} />
              ))}
            </LabelSheet>
            {picked.length ? null : <NoteRow>Choose something above</NoteRow>}
          </Section>
        </>
      )}
    />
  );
}

/** ⚠️ Exported so the ground can draw one of each without a workspace. */
export { GHS, TEMPLATES };
