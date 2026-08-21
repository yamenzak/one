/**
 * GETTING STARTED — the three books the manifest already carries.
 *
 * ⚠️ NOTHING HERE RESTATES A STEP. `guide`, `milestones` and `help` are declared
 * in `../index.ts`; this screen draws them. A second copy of the steps is the one
 * that goes stale, and it goes stale silently — the manifest is what the events
 * tick, so the copy would be the version nobody's progress ever reaches.
 *
 * ⚠️ AND THE FIRST SCREEN OF AN INVENTORY IS THE ONE PLACE THE LADDER IS
 * EXPLAINED. Somebody arriving has to make one decision before anything else
 * works — how much of this do I want to track — and every other surface in the
 * product assumes it has already been made. Saying it here, once, in the words
 * the product uses everywhere else, is cheaper than a tooltip on every form.
 */

import {
  Faq, Grid, Guide, Help, Milestones, Screen, Section, Stack, StepRow, glyphOf,
} from "@engine/design";
import { INVENTORY } from "../index.js";

/**
 * ⚠️ THE LADDER IN THE ORDER SOMEBODY CLIMBS IT, AND AS INERT ROWS. A `StepRow`
 * is a thing that will happen rather than a thing to press — making these
 * pressable would offer four settings to somebody who has not added a product
 * yet, and the decision is per PRODUCT, so there would be nothing for a press to
 * change.
 */
const LADDER: readonly { readonly id: string; readonly label: string; readonly under: string }[] = [
  { id: "listed", label: "Listed", under: "A thing you keep and never count — a ladder, a drill, a monitor" },
  { id: "counted", label: "Counted", under: "A number per place, and where most things start" },
  { id: "batched", label: "Batched", under: "Deliveries kept apart, because one of them expires first" },
  { id: "itemised", label: "Itemised", under: "One object with a serial number and a service date of its own" },
];

export function Start({ title, done, counts, held, onGo }: {
  readonly title?: string;
  /** What this workspace has actually done — the events that tick a step. */
  readonly done: readonly string[];
  /** How many times each, for a milestone that waits for fifty. */
  readonly counts: Readonly<Record<string, number>>;
  readonly held: ReadonlySet<string>;
  readonly onGo: (route: string) => void;
}) {
  return (
    <Screen shape="board" title={title}>
      <Stack space="roomy">
        {/* ⚠️ NO QUICK-ACTION ROW ABOVE THIS, AND THE FIRST DRAFT HAD ONE. Every
            step below already carries the control that does it, so a row of
            shortcuts over a checklist of the same three things is the screen
            saying everything twice — and the one shortcut that was NOT a step
            went to the workspace's settings, which is OneSpace's and reached
            from the crown on every screen. */}
        <Section label="Your first three things">
          <Guide book={INVENTORY.guide ?? {}} events={done} held={held} onGo={onGo} />
        </Section>

        {/* ⚠️ THE ONE DECISION THE PRODUCT CANNOT MAKE FOR ANYBODY, said before
            the milestones rather than after. A person who has not understood the
            ladder will make every product `counted` and then wonder why the app
            never warns them about an expiry. */}
        <Section label="How much to track">
          <Stack space="roomy">
            {LADDER.map((rung) => (
              <StepRow key={rung.id} icon={glyphOf("box")} label={rung.label} under={rung.under} />
            ))}
          </Stack>
        </Section>

        <Section label="What you have reached">
          <Milestones book={INVENTORY.milestones ?? {}} counts={counts} already={[]} />
        </Section>

        <Grid min="20rem" space="roomy">
          <Section label="About stock">
            {/* ⚠️ KEYED BY SCREEN, FROM THE APP'S OWN BOOK. Help written into a
                page is help nobody can search. */}
            <Help book={INVENTORY.help ?? {}} screen="stock" />
          </Section>
          <Section label="Asked often">
            <Faq items={ASKED} />
          </Section>
        </Grid>
      </Stack>
    </Screen>
  );
}

/**
 * ⚠️ THE THREE THINGS SOMEBODY ASKS IN THE FIRST WEEK, and each one is a real
 * refusal or a real rule this product has rather than a reassurance. A FAQ made
 * of "yes, you can!" is marketing copy in the place people go when something has
 * already confused them.
 */
const ASKED: readonly { readonly id: string; readonly q: string; readonly a: string }[] = [
  {
    id: "why-refuse",
    q: "Why will it not let me take twelve when there are eight?",
    a: "Because one of the two numbers is wrong, and quietly landing on zero would destroy the evidence of which. Count the shelf and correct it — the correction is kept with your name and your reason on it.",
  },
  {
    id: "pack-or-piece",
    q: "Do I count boxes of gloves, or gloves?",
    a: "Whichever you issue. A workshop counts boxes; a ward counts gloves. Set it once per product as what it is counted in, and every number this product ever shows you is in that unit.",
  },
  {
    id: "two-people",
    q: "What happens if two of us count the same shelf?",
    a: "The second one to save is told the number moved and shown what it is now. Nothing is overwritten, and neither person's work is silently lost.",
  },
];
