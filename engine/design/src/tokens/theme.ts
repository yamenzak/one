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
/**
 * ⚠️ AND A TONED SOFT CHIP IS THE ONE PLACE THE LIBRARY PAINTS BOTH HALVES, so
 * it is the one place `data-ink` cannot reach. Measured in light: a success chip
 * is `rgb(43,119,69)` on its own `rgb(188,215,201)` fill — **3.58:1** at 12px,
 * which is the smallest type in the product on the shortest contrast in it. The
 * library already pulls its own soft foreground toward the text colour and does
 * not pull it far enough; this composes with that value rather than replacing
 * it, so their tuning survives and only the shortfall is made up. Written as a
 * REPLACEMENT it came out at 2.24 — worse than the fault, because `--success` is
 * the fill's colour and `--success-soft-foreground` was already the considered
 * one.
 *
 * ⚠️ LIGHT ONLY, AND ON `body` FOR THE SELF-REFERENCE REASON BELOW. Dark
 * measures above the floor on every toned chip.
 */
const TONED_CHIPS = `
:root {
  --accent-soft-ink: color-mix(in oklab, var(--accent-soft-foreground) 72%, var(--foreground));
  --success-soft-ink: color-mix(in oklab, var(--success-soft-foreground) 72%, var(--foreground));
  --warning-soft-ink: color-mix(in oklab, var(--warning-soft-foreground) 72%, var(--foreground));
  --danger-soft-ink: color-mix(in oklab, var(--danger-soft-foreground) 72%, var(--foreground));
}
:root:not([data-theme="dark"]) body {
  --accent-soft-foreground: var(--accent-soft-ink);
  --success-soft-foreground: var(--success-soft-ink);
  --warning-soft-foreground: var(--warning-soft-ink);
  --danger-soft-foreground: var(--danger-soft-ink);
}`;

/**
 * EVERY CONTROL THAT IS ON, AND THE ONE THAT IS THE ACTION.
 *
 * ⚠️ THE INK IS DARK IN BOTH THEMES BECAUSE THE FILL IS LIGHT IN BOTH. `--on` is
 * the product's hue at a value chosen to be nearer the viewer than the track it
 * sits in, which in light means down from white and in dark means well up from
 * the control tier; the ink follows the fill rather than the theme. It is a bet
 * on the hue being mid-to-bright — the same bet every tier in `ground.ts` makes —
 * and the grey left in the mix is a floor rather than a guarantee. CSS cannot
 * decide this properly until `contrast-color()` ships.
 *
 * ⚠️ AND "ON" IS NOT "THE ACTION", WHICH IS THE DISTINCTION THE LIBRARY DOES NOT
 * DRAW. HeroUI paints a checked switch, a ticked box, a chosen radio, an open tab
 * and a slider's travelled part with `--accent` — the same token as the primary
 * button. That is defensible in a coloured theme and wrong in this one: our
 * `--accent` is MONO, deliberately, because the near-white "Next" at the foot of
 * a screen is the one call to action and has to be unmissable. Sharing the token
 * meant every one of those states inherited the mono rule and came out grey.
 *
 * ⚠️ AND THE MONO RULE IS THE ARGUMENT FOR SPLITTING THEM, NOT AGAINST. It says
 * the interface is values SO THAT colour becomes information — and "this is on"
 * is information, in the most literal sense the product has. A switch nobody can
 * tell the state of at a glance is the whole failure that rule exists to prevent,
 * reached by obeying it too far.
 *
 * ⚠️ BY SELECTOR, BECAUSE THE LIBRARY SETS THESE INSIDE ITS OWN COMPONENT RULES.
 * `--chip-fg`, `--badge-fg` and the checked fills are declared on
 * `.chip--accent.chip--soft` and friends; a `:root` declaration of the same name
 * resolves, computes, and changes nothing — the shape of bug this package keeps
 * finding. Where the library DOES expose a token on a component root
 * (`--switch-control-bg-checked`, `--input-bg-focus`) the token is set instead,
 * which is the sanctioned half of D7.
 */
const ON_STATE = `
.toggle-button[data-selected="true"] { --toggle-button-fg-selected: var(--on-ink); }
.chip--accent.chip--soft { --chip-fg: var(--on-ink); }
.badge--soft.badge--accent { --badge-fg: var(--on-ink); }

.switch { --switch-control-bg-checked: var(--on); --switch-control-bg-checked-hover: var(--on); }

.checkbox[aria-checked="true"] .checkbox__control::before,
.checkbox[data-selected="true"] .checkbox__control::before,
.checkbox[data-indeterminate="true"] .checkbox__control::before { background-color: var(--on); }
.checkbox[aria-checked="true"] .checkbox__control,
.checkbox[data-selected="true"] .checkbox__control { color: var(--on-ink); }

.radio[data-selected] .radio__control,
.radio:has([data-slot="radio-content"][aria-checked="true"]) .radio__control,
.radio:has(input:checked) .radio__control { background-color: var(--on); }

.tabs--secondary > .tabs__list-container .tabs__indicator { background-color: var(--on); }
.slider .slider__fill { background-color: var(--on); }
.slider[data-orientation="horizontal"] .slider__track[data-fill-start="true"] { border-inline-start-color: var(--on); }
.slider[data-orientation="horizontal"] .slider__track[data-fill-end="true"] { border-inline-end-color: var(--on); }

.input--secondary { --input-bg-focus: var(--on-lit); }
.select--secondary .select__trigger { --select-trigger-bg-focus: var(--on-lit); }
.input-otp-slot { --input-otp-slot-bg-focus: var(--on-lit); }
.autocomplete__trigger { --autocomplete-trigger-bg-focus: var(--on-lit); }
.input-group { --input-group-bg-focus: var(--on-lit); --color-input-group-bg-focus: var(--on-lit); }
.date-input-group { --date-input-group-bg-focus: var(--on-lit); }
.number-field-group { --number-field-group-bg-focus: var(--on-lit); }
.textarea--secondary:focus, .textarea--secondary[data-focused="true"] { background-color: var(--on-lit); }`;

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
/**
 * ⚠️ AND A TONE AS INK IS NOT THE SAME VALUE AS A TONE AS A FILL, WHICH IS THE
 * WHOLE OF THIS BLOCK. The library's `--warning` is tuned to be a surface with
 * white on it; used as INK on a card it is amber on near-white, and measured in
 * a browser that is **1.94:1** — against a floor of 4.5. The sentence it was
 * carrying on the screen where it was found read "It may be flammable liquid,
 * serious eye damage". `--danger` measured 3.39 in light and 3.65 in dark, on
 * every expiry date, every recall and every shortfall in the product.
 *
 * ⚠️ SO THE INK IS THE TONE PULLED TOWARD THE TEXT COLOUR, and it is expressed
 * as a mix rather than as a value for two reasons. A hand-picked hex is a colour
 * that stops matching the day the library retunes its palette — and it would
 * need to be picked TWICE, because the direction is opposite in the two themes.
 * `--foreground` is near-black in light and near-white in dark, so one
 * expression darkens where it must darken and lightens where it must lighten.
 *
 * ⚠️ THE FILLS ARE UNTOUCHED. A danger BUTTON wants the library's own strong
 * colour with white on it, and pulling that toward the foreground would break
 * the contrast in the other direction. What is overridden here is the ink
 * channel and nothing else.
 *
 * ⚠️ AND THE PERCENTAGES ARE NOT TASTE — they are the smallest pull that clears
 * the floor on the worst surface each tone actually lands on, read off the
 * rendered page. `contrast.seen.test.tsx` is what says they still do.
 */
const INK_PULL = { info: 65, success: 50, warning: 45, danger: 55 } as const;

/**
 * ⚠️ AND THE QUIET INK ITSELF IS SHORT, WHICH IS THE ONE THAT IS EVERYWHERE.
 * `--muted` carries every second line, every hint and every caption in the
 * product. Measured: **3.46:1** on the page's own ground in light, and
 * **3.83:1** on a raised surface in dark. Neither was visible from a palette —
 * each clears the floor on the surfaces it is usually looked at on and misses it
 * on one that is used less often, which is exactly the shape a reviewer cannot
 * catch.
 *
 * ⚠️ TWO NAMES, AND THAT IS NOT STYLE — A CUSTOM PROPERTY MAY NOT REFERENCE
 * ITSELF. `--muted: … var(--muted) …` is a cycle wherever it is written,
 * INCLUDING on a descendant that also declares it: the browser does not fall
 * back to the inherited value, it throws the property away entirely, and
 * `color: var(--muted)` lands on the initial colour. Written that way it
 * measured PURE BLACK on every light surface — passing contrast triumphantly
 * while destroying the one distinction the token exists to draw. The reading is
 * what caught it; nothing else could have.
 *
 * So `--quiet-ink` is computed at `:root`, where `var(--muted)` still means the
 * library's own value, and `--muted` is re-pointed at it one element down.
 *
 * ⚠️ AND `--field-placeholder` HAS TO BE RE-POINTED TOO, because it is
 * `var(--muted)` resolved at `:root` — before the override, permanently. It is
 * the only other token in the library's sheet defined that way, and it is what a
 * picker says before anybody has chosen: "Choose one", measured at 3.83 in dark
 * and 4.05 in light. A sweep over one product would have missed it; the frame
 * sweep is what has a picker on it.
 */
const QUIET_INK = `
:root {
  --quiet-ink: color-mix(in oklab, var(--muted) 68%, var(--foreground));
}
:root body { --muted: var(--quiet-ink); --field-placeholder: var(--quiet-ink); }`;

export const TONE_CSS = `${QUIET_INK}
[data-ink="info"] { color: color-mix(in oklab, var(--accent) ${INK_PULL.info}%, var(--foreground)); }
[data-ink="success"] { color: color-mix(in oklab, var(--success) ${INK_PULL.success}%, var(--foreground)); }
[data-ink="warning"] { color: color-mix(in oklab, var(--warning) ${INK_PULL.warning}%, var(--foreground)); }
[data-ink="danger"] { color: color-mix(in oklab, var(--danger) ${INK_PULL.danger}%, var(--foreground)); }
${TONED_CHIPS}
${NEUTRAL_CHIP}
${ON_STATE}`;

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
