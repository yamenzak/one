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
import { reached, type Raised } from "@engine/kernel";
import { INVENTORY } from "../index.js";
import { LADDER, type Tracking } from "../ledger.js";

/**
 * ⚠️ THE LADDER IN THE ORDER SOMEBODY CLIMBS IT, AND AS INERT ROWS. A `StepRow`
 * is a thing that will happen rather than a thing to press — making these
 * pressable would offer four settings to somebody who has not added a product
 * yet, and the decision is per PRODUCT, so there would be nothing for a press to
 * change.
 */
/*
  ⚠️ ALL FIVE RUNGS, AND THIS BLOCK IS THE ONLY PLACE THE LADDER IS EXPLAINED.
  It shipped with four: `assembled` was missing, which is the rung nobody would
  guess exists and the one that cannot be reached afterwards — the moment
  identity is created is the moment a thing arrives, so a workspace that read
  this list and chose `itemised` for its kits has no second chance at it.

  ⚠️ A MARK EACH, AND THEY ARE THE MARKS THE REST OF THE PRODUCT ALREADY USES
  FOR THE SAME NOUNS. Five rungs under one `box` is five identical glyphs down
  the side of the one block that exists to tell them apart — the neutral circle's
  failure with an extra step. A kit is `layers` and an item is `tag` in the
  manifest's own screen list, so those two are taken; a batch wears `calendar`,
  because a delivery kept apart from the next one is a date before it is
  anything else.
*/
/*
  ⚠️ KEYED BY THE LADDER ITSELF, SO A SIXTH RUNG CANNOT SHIP UNEXPLAINED. This
  was a hand-written list beside `ledger.ts`'s — two constants named LADDER, one
  the truth and one the account of it — and it fell a rung behind. A `Record`
  over `Tracking` makes the omission a type error in the file that owes the
  sentence.
*/
const SAID: Readonly<Record<Tracking, {
  readonly label: string; readonly icon: string; readonly under: string;
}>> = {
  listed: { label: "Listed", icon: "list",
    under: "A thing you keep and never count — a ladder, a drill, a monitor" },
  counted: { label: "Counted", icon: "box",
    under: "A number per place, and where most things start" },
  batched: { label: "Batched", icon: "calendar",
    under: "Deliveries kept apart, because one of them expires first" },
  itemised: { label: "Itemised", icon: "tag",
    under: "One object with a serial number and a service date of its own" },
  assembled: { label: "Assembled", icon: "layers",
    under: "A kit made of itemised things, checked against the list it was built to" },
};

export function Start({ title, said, raised, counts, already, held, onGo }: {
  readonly title?: string;
  /**
   * ⚠️ WHAT THIS WORKSPACE IS FOR, IN ITS OWN WORDS — the profile, made visible.
   * A setting that changed only what a form defaults to is one nobody can tell
   * they set; this is the line that says a clinic is reading a clinic's product
   * rather than somebody else's, and it is the first thing on the first screen.
   */
  readonly said: string;
  /**
   * What has actually been done — the events that tick a step, on both axes.
   * A setup step is the workspace's; learning to scan is each person's.
   */
  /** ⚠️ `null` until the answer is back — see `Guide`. Empty is a claim. */
  readonly raised: Raised | null;
  /** How many times each, for a milestone that waits for fifty. */
  readonly counts: Readonly<Record<string, number>>;
  /**
   * ⚠️ WHICH CONGRATULATIONS HAVE ALREADY BEEN SAID. Recognition repeated on
   * every load is not recognition, it is furniture — so a milestone shown once
   * is recorded and never drawn again.
   */
  readonly already: readonly string[];
  readonly held: ReadonlySet<string>;
  readonly onGo: (route: string) => void;
}) {
  return (
    /* ⚠️ THE PROFILE'S OWN LINE IS THE SCREEN'S `under`, which is where a FACT
       about the subject goes. A setting that changed only what a form defaults
       to is one nobody can tell they set; this is what says a clinic is reading
       a clinic's product rather than somebody else's. */
    <Screen shape="board" title={title} under={said}>
      <Stack space="roomy">
        {/* ⚠️ NO QUICK-ACTION ROW ABOVE THIS, AND THE FIRST DRAFT HAD ONE. Every
            step below already carries the control that does it, so a row of
            shortcuts over a checklist of the same three things is the screen
            saying everything twice — and the one shortcut that was NOT a step
            went to the workspace's settings, which is OneSpace's and reached
            from the crown on every screen. */}
        <Section label="Your first three things">
          <Guide book={INVENTORY.guide ?? {}} raised={raised} held={held} onGo={onGo} />
        </Section>

        {/* ⚠️ THE ONE DECISION THE PRODUCT CANNOT MAKE FOR ANYBODY, said before
            the milestones rather than after. A person who has not understood the
            ladder will make every product `counted` and then wonder why the app
            never warns them about an expiry. */}
        <Section label="How much to track">
          <Stack space="roomy">
            {LADDER.map((rung) => (
              <StepRow
                key={rung}
                icon={glyphOf(SAID[rung].icon)}
                label={SAID[rung].label}
                under={SAID[rung].under}
              />
            ))}
          </Stack>
        </Section>

        {/* ⚠️ AND THE SECTION GOES WITH IT. `Milestones` draws nothing when
            there is nothing fresh, and a heading over nothing is a promise the
            page does not keep — which is most of the time, because most of the
            time nobody has just reached anything. */}
        {reached(INVENTORY.milestones ?? {}, counts, already).length ? (
          <Section label="What you have reached">
            <Milestones book={INVENTORY.milestones ?? {}} counts={counts} already={already} />
          </Section>
        ) : null}

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
