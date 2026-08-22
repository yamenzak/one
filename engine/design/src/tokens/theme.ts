/**
 * WHAT A COLOUR IS FOR, IN THE ONE PRODUCT-SHAPED VARIABLE AND THE ONE INK ONE.
 *
 * ⚠️ A COLOUR IS THE PRODUCT'S, NEVER THE WORKSPACE'S. It was the workspace's,
 * and being the workspace's is what stopped any screen being designable: the
 * ground behind every page, the wash on every card and the one coloured thing
 * on a screen were all a value somebody picked in ten seconds in a settings
 * card, so nothing above them could be composed against anything. `--brand` is
 * written once, from `AppSpec.hue` where a page declares one and from the
 * deployment's own colour where it does not — and a workspace's brand reaches
 * its NAMEPLATE (the tile, the letterhead) and nothing that draws a component.
 *
 * ⚠️ AND `--accent` IS NOT THIS, EVER. The library paints controls with the
 * accent and the accent is MONOCHROME here (`ground.ts`); a hue lands on the
 * ground those controls sit on. Write a hue into `--accent` and the interface is
 * coloured again, which is the failure `ground.test.mjs` refuses in writing.
 *
 * ⚠️ AND THE SKY IS DERIVED FROM THE SAME TOKEN. A page declares its ambience by
 * NAME — never by colour — so the world behind every screen follows the hue
 * automatically. A page that named a colour would be a page that stops matching
 * the moment the product's own changes.
 */

import type { Tone } from "@engine/kernel";

/* ---------------------------------------------------------------- product --- */

/**
 * A PRODUCT'S OWN COLOUR, AS THE ONE DECLARATION THAT CARRIES IT.
 *
 * ⚠️ ONE BLOCK, ON `:root`, AND ONE VARIABLE IN IT. Anything wider is a
 * stylesheet somebody edits at a distance from the screens it paints; anything
 * narrower and half the ambience misses it. Returned as TEXT rather than
 * applied, because who applies it — a boot writing one style element, a
 * harness measuring the same product a browser would draw — is not this
 * module's business.
 *
 * ⚠️ AND IT IS A FUNCTION RATHER THAN A CONSTANT SO THAT SOURCE ORDER DOES THE
 * WORK. This is appended to `<head>` AFTER the built stylesheet, so it wins on
 * order at equal specificity; a rule written into the stylesheet instead loses
 * to the framework default and changes nothing, visibly, with every check green.
 * A page's own `hue` is narrower still — an inline `--brand` on the page
 * element, which beats both.
 */
export const productCss = (hue: string): string => `:root {\n  --brand: ${hue};\n}`;

/* ------------------------------------------------------------------- tone --- */

/**
 * ⚠️ AND A NEUTRAL CHIP MUST NOT OUT-SHOUT A TONED ONE. Measured in the dark
 * theme: the library's `default` chip label computes to `oklch(0.9911 0 0)` —
 * white — so on a list of nightly jobs the CADENCE ("Daily") was the brightest
 * thing on every row, brighter than the job's own name and brighter than the
 * green chip saying a run had failed. The same inversion put "creating" above
 * "live" on the infrastructure screen.
 *
 * ⚠️ A CHIP IS AN ANNOTATION. It sits beside something and says one more thing
 * about it; a neutral one is by definition the case with nothing to report, so
 * it takes the ink a quiet line takes. The toned chips are untouched — being
 * louder than the neutral is the whole of their job.
 */
const NEUTRAL_CHIP = `
.chip--default.chip--soft { color: var(--muted); }`;

/**
 * WHAT A REPORTED VALUE MEANS, IN THE ONE CHANNEL A MONOCHROME PRODUCT HAS LEFT.
 *
 * ⚠️ THIS EXISTS BECAUSE THE ATTRIBUTE ALREADY DID AND NOTHING STYLED IT.
 * `data-tone` was set in seven places across this package — a job's last run, a
 * wallet row's amount, a figure's good-or-bad — and there was no rule for it
 * anywhere. Measured in the browser: `danger` and `neutral` computed to the
 * SAME colour, so the one screen whose entire purpose is "did the nightly pass
 * run" drew a failure in exactly the grey it drew a success in.
 *
 * ⚠️ AN ATTRIBUTE RATHER THAN A CLASS, AND THAT IS THE CORRECTION. `text-danger`
 * works because something in the product uses it; `text-warning` and
 * `text-success` generate NO CSS AT ALL, because Tailwind emits only what it
 * finds written down and nothing had written them. A component reaching for a
 * utility that does not exist is the same silence one level down.
 *
 * ⚠️ AND IT IS INK, NOT A SURFACE. A tone on a CARD would paint every word
 * inside it; what carries a state here is the VALUE — the amount, the sentence,
 * the figure — so the attribute goes on the thing that says it. `neutral` has no
 * rule on purpose: it is the ink the row already has.
 */
export const TONE_CSS = `
[data-ink="info"] { color: var(--accent); }
[data-ink="success"] { color: var(--success); }
[data-ink="warning"] { color: var(--warning); }
[data-ink="danger"] { color: var(--danger); }
${NEUTRAL_CHIP}`;

/* -------------------------------------------------------------------- sky --- */

/*
  ⚠️ THERE WAS A `SKY_MOTION` HERE AND IT MOVED NOTHING. It sized, repeated and
  drifted a background-image on the `[data-sky]` element — three rules and a
  24-second transition on a property whose value, measured in the browser, is
  `none` on every skyed element in the product. The ground moved to the layer
  under the element (`::before`) when the scene engine was written, and the
  rules that used to drive it stayed behind, still shipping, still passing.

  ⚠️ THE DRIFT IS `one-drift`, IN `ambienceStylesheet`, on the layer that
  actually carries the ground — and it answers both reduced-motion switches
  there. A second drift here would have been two ambient motions on one world;
  what it was instead is a stylesheet nobody could tell was dead, because a rule
  that applies to nothing looks exactly like a rule that applies.
*/

/**
 * ⚠️ OUR TONE, THEIR COLOUR NAME. A declaration says what HAPPENED — five tones,
 * no palette words (see `Tone`) — and this is the one place that becomes a
 * library colour. Screens naming a library colour directly would have to be
 * revisited the day the library renames one, and there are a lot of screens.
 */
export const colorFor = (tone: Tone): "accent" | "default" | "success" | "warning" | "danger" => {
  switch (tone) {
    case "neutral": return "default";
    case "info": return "accent";
    case "success": return "success";
    case "warning": return "warning";
    case "danger": return "danger";
  }
};
