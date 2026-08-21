/**
 * ONE'S OWN COLOUR, AND IT IS THE DEPLOYMENT'S RATHER THAN THE FRAMEWORK'S.
 *
 * ⚠️ A TRUE NEUTRAL, SO NOTHING DERIVED FROM IT CARRIES A HUE. Every tier, every
 * surface and the ambience behind every screen are `color-mix`es with `--brand`,
 * so one value makes the whole interface graphite without a single component
 * knowing there was a decision.
 *
 * ⚠️ ZERO CHROMA RATHER THAN A NEAR-GREY. A full-bleed gradient is where a hue
 * nobody asked for shows up first, and at the size of a phone screen "almost
 * neutral" reads as a colour chosen badly rather than as monochrome.
 *
 * ⚠️ ITS OWN MODULE BECAUSE THE HARNESS READS IT TOO. `@engine/design`'s
 * measuring cannot IMPORT it — the deployment depends on every app, so an app's
 * sweep importing the deployment would be a cycle — and a second copy of the
 * value is how a photograph of the product comes to be a photograph of the
 * framework default. It reads this file and refuses if the line is not here.
 */
export const ONE_ACCENT = "oklch(0.62 0 0)";
