/**
 * GETTING STARTED — three books the manifest already had and nothing drew.
 *
 * ⚠️ THIS IS THE "DECLARED AND UNMOUNTED" CLASS, CAUGHT ONCE. `guide`,
 * `milestones` and `help` were in ground's manifest from the first stage; the
 * components that render them shipped with the design system; and no screen
 * anywhere put the two together. Everything passed — a checklist nobody can open
 * is not a failure of anything, it is an absence, and an absence is exactly what
 * a test suite cannot see.
 *
 * ⚠️ AND ALL THREE ARE DRAWN FROM THE BOOKS RATHER THAN FROM COPY HERE. Adding a
 * step to the manifest puts a row on this screen with nothing edited; taking one
 * out removes it. A screen that restated the steps would be a second list, and
 * the second list is always the one that goes stale.
 *
 * ⚠️ WHAT IS DONE COMES FROM EVENTS, NOT FROM A FLAG. A step is ticked because
 * the thing it describes happened — so a workspace that wrote a note before
 * anybody opened this screen arrives with it already crossed off, which is the
 * only version anybody trusts.
 */

import * as React from "react";
import {
  Faq, Grid, Guide, Help, Milestones, OfferRow, QuickActions,
  Screen, Section, SeeAll, Stack, StepRow, TileGrid, glyphOf,
} from "@engine/design";
import type { Raised } from "@engine/kernel";
import { GROUND } from "../index.js";
import { ASKED } from "./sample.js";

export function Start({ title, raised, counts, held, onGo }: {
  readonly title?: string;
  /**
   * What has been raised, on both axes — the workspace's for a step done once
   * for everybody, this person's for a step each pair of hands takes.
   */
  /** ⚠️ `null` until the answer is back — see `Guide`. Empty is a claim. */
  readonly raised: Raised | null;
  /** How many times each, for a milestone that waits for ten. */
  readonly counts: Readonly<Record<string, number>>;
  readonly held: ReadonlySet<string>;
  readonly onGo: (route: string) => void;
}) {
  return (
    <Screen shape="board" title={title}>
      <Stack space="roomy">
        {/* ⚠️ THE FASTEST ROUTE TO EACH THING, AS CONTROLS RATHER THAN PROSE. A
            getting-started screen whose steps are sentences is one somebody
            reads and then goes looking for the button. */}
        <QuickActions
          actions={[
            { id: "write", label: "Write", icon: glyphOf("note"), onDo: () => onGo("/write") },
            { id: "people", label: "Invite", icon: glyphOf("people"), onDo: () => onGo("/people") },
            { id: "reports", label: "Reports", icon: glyphOf("chart"), onDo: () => onGo("/reports") },
            { id: "settings", label: "Settings", icon: glyphOf("cog"), onDo: () => onGo("/settings") },
          ]}
        />

        {/* ⚠️ NO GAUGE ABOVE THIS, AND THE FIRST DRAFT HAD ONE. It read "Set up
            · 2 of 3 done" directly over a `Guide` whose own header says "Getting
            started · 2 of 3 done" with a bar under it — the same fraction, in
            two forms, an inch apart. The checklist already carries its own
            progress; a second picture of it is not emphasis. */}
        <Section label="Your first three things">
          <Guide book={GROUND.guide ?? {}} raised={raised} held={held} onGo={onGo} />
        </Section>

        <Section label="What you have reached">
          <Milestones book={GROUND.milestones ?? {}} counts={counts} already={[]} />
        </Section>

        <Section label="Where things are">
          <Stack space="roomy">
            <TileGrid
              tiles={[
                { id: "notes", label: "Notes", icon: glyphOf("note"), onOpen: () => onGo("/") },
                { id: "people", label: "People", icon: glyphOf("people"), onOpen: () => onGo("/people") },
                { id: "reports", label: "Reports", icon: glyphOf("chart"), onOpen: () => onGo("/reports") },
                { id: "search", label: "Search", icon: glyphOf("search"), onOpen: () => onGo("/search") },
              ]}
            />
            <SeeAll label="See every screen" onOpen={() => onGo("/")} />
          </Stack>
        </Section>

        <Section label="What the plan does not cover">
          <Stack space="roomy">
            {/* ⚠️ AN OFFER ROW IS A LOCKED THING WITH ITS PRICE ON IT, and it is
                shown rather than hidden. Hiding what a plan does not include
                means nobody discovers it exists — and the row that hides it is
                the row that would have sold it. */}
            <OfferRow
              icon={glyphOf("star")}
              label="Publishing"
              under="A draft stays yours until you publish it"
              offer={{ label: "€9 a month", onDo: () => onGo("/settings") }}
            />
            {/* ⚠️ A STEP ROW IS INERT ON PURPOSE — a thing that will happen, not
                a thing to press. Making it pressable is how a "what happens
                next" list becomes four dead links. */}
            <StepRow icon={glyphOf("note")} label="Then everybody here is told once" under="Inbox, and email if they asked for it" />
          </Stack>
        </Section>

        <Grid min="20rem" space="roomy">
          <Section label="About this screen">
            {/* ⚠️ THE HELP IS THE APP'S OWN BOOK, KEYED BY SCREEN. Help written
                into a page is help nobody can search, and a search that misses
                the one page it was written on is worse than none. */}
            <Help book={GROUND.help ?? {}} screen="notes" />
          </Section>
          <Section label="Asked often">
            <Faq items={ASKED.map((a) => ({ id: a.id, q: a.q, a: a.a }))} />
          </Section>
        </Grid>
      </Stack>
    </Screen>
  );
}
