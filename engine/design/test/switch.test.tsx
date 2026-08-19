/**
 * EVERY SWITCH IN THE PRODUCT IS PRESSABLE WHERE PEOPLE PRESS IT.
 *
 * ⚠️ `Switch.Content` IS THE CONTROL. It renders React Aria's `SwitchButton` — a
 * `<label>` carrying the hidden `<input role="switch">` — and `Switch.Control`
 * and `Switch.Thumb` are plain spans with no behaviour of their own. Composed as
 * SIBLINGS of the content they draw a perfect switch that does nothing: pressing
 * the track is inert and pressing the word beside it works, which is a control
 * that reads as broken to everybody who aims at the obvious target.
 *
 * ⚠️ FOUR COMPONENTS SHIPPED THAT WAY, AND THE LIBRARY'S OWN DOCUMENTATION IS WHY.
 * Its published "Anatomy" snippet puts them side by side; every runnable example
 * on the same page nests them, and the source says so in a comment. Reading the
 * anatomy is the reasonable thing to do, so this cannot be prevented by care.
 *
 * ⚠️ AND NO TEST COULD SEE IT, WHICH IS THE POINT OF THIS FILE. The markup is
 * complete, the classes are right, the input exists, the accessible name exists,
 * the `onChange` is wired. The only thing wrong is WHERE one element sits
 * relative to another — so the assertion has to be about nesting, in rendered
 * markup, rather than about presence.
 *
 * ⚠️ A `<label>` INSIDE THE CONTENT IS THE SAME BUG WEARING A DIFFERENT HAT.
 * `SwitchButton` already is a label; a `<Label>` within it is invalid HTML and a
 * second element competing for the press.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConsentSheet, Field, SettledSwitch, ToggleRow } from "../src/index.js";
import type { Disclosure, FieldSpec } from "@engine/kernel";

/* ------------------------------------------------------------------ shape --- */

/**
 * ⚠️ THE CONTENT IS FOUND BY ITS SLOT, NOT BY ITS TAG. `data-slot="switch-content"`
 * is what the library stamps on the pressable element; matching `<label` would
 * pass the day it becomes a `<button>` and start failing the day an unrelated
 * label appears first.
 */
const pressable = (markup: string): string | null => {
  const at = markup.indexOf(`data-slot="switch-content"`);
  if (at < 0) return null;
  /* The element's own tag opens just before the attribute, and the switch is the
     last thing on these fragments — so from here to the end is the content and
     everything it holds, which is all the nesting question needs. */
  return markup.slice(at);
};

const holdsTrack = (markup: string): boolean =>
  (pressable(markup) ?? "").includes(`data-slot="switch-control"`);

const holdsLabel = (markup: string): boolean =>
  /<label[^>]*data-slot="label"/.test(pressable(markup) ?? "");

/* ------------------------------------------------------------- the four --- */

const FIELD = { id: "on", label: "Send me these", kind: "bool" } as unknown as FieldSpec;

/* ⚠️ NOT REQUIRED, because a required purpose renders its switch disabled — and
   a disabled control is exactly the state where "nothing happens on press" is
   correct, so it would prove nothing. */
const SHOWN: readonly Disclosure[] = [{
  purpose: {
    id: "coaching",
    label: "Coaching",
    why: "So a coach can read what you logged",
    holdings: [],
    retention: null,
  },
  fields: [{ id: "weight", label: "Weight", holding: "health", purposes: ["coaching"] }],
  required: false,
}] as unknown as readonly Disclosure[];

const drawn: Readonly<Record<string, () => string>> = {
  SettledSwitch: () => renderToStaticMarkup(
    <SettledSwitch value onSet={async () => true} />),
  ToggleRow: () => renderToStaticMarkup(
    <ToggleRow label="Notify me" value onChange={() => {}} />),
  "Field(bool)": () => renderToStaticMarkup(
    <Field name="on" spec={FIELD} value onChange={() => {}} />),
  ConsentSheet: () => renderToStaticMarkup(
    <ConsentSheet shown={SHOWN} given={{ coaching: true }} onChange={() => {}} />),
};

describe("every switch is pressable where people press it", () => {
  /*
    ⚠️ THE TRACK IS THE TARGET. Nobody aims at the word — the switch IS the
    affordance, and a track that does nothing is the whole complaint that found
    this: "clicking the switch does nothing, clicking the on or off works".
  */
  it("puts the track inside the thing that carries the input", () => {
    for (const [name, render] of Object.entries(drawn)) {
      const markup = render();
      expect(pressable(markup), `${name} renders no switch at all`).not.toBeNull();
      expect(holdsTrack(markup), `${name}: Switch.Control is outside Switch.Content`)
        .toBe(true);
    }
  });

  /* ⚠️ AND NOTHING INSIDE IT IS A SECOND LABEL. Invalid, and it competes for the
     press with the one that works. */
  it("puts no label inside the label", () => {
    for (const [name, render] of Object.entries(drawn)) {
      expect(holdsLabel(render()), `${name}: a <Label> inside Switch.Content`).toBe(false);
    }
  });

  /* ⚠️ THE INPUT IS STILL THERE, which is the fault this file's ancestor caught:
     a switch written with no `Switch.Content` at all has no input, draws
     correctly, and no press of it does anything. */
  it("still has an input to press", () => {
    for (const [name, render] of Object.entries(drawn)) {
      expect(render(), `${name} has no <input role="switch">`).toMatch(/role="switch"/);
    }
  });
});
