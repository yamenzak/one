/**
 * YOU — who you are, everywhere.
 *
 * ⚠️ EVERYTHING HERE FOLLOWS THE PERSON RATHER THAN THE WORKSPACE. The address
 * you sign in with, what you have been told, how you want to be told it, the way
 * out of an account — none of them belongs to any one workspace, and filing them
 * under one means visiting four places to change one fact about yourself.
 *
 * ⚠️ THE FACE IS THE SCREEN'S SHAPE, AND THE EMAIL IS THE FACE'S CAPTION. It was
 * a `FieldRow` in a card of its own — a labelled fact about a person, on a screen
 * whose crown already said it was about them. `Identity` says the same thing in
 * the shape every account surface anybody trusts uses, and it gives this screen a
 * silhouette that is not the silhouette of every other screen (DESIGN.md §4).
 *
 * ⚠️ AND SIGNING OUT IS THE LAST ROW OF THE LAST CARD, NOT A CARD OF ITS OWN. A
 * card is a container for a GROUP; one button inside one is a button with a box
 * drawn round it. Every phone anybody owns puts sign-out at the bottom of the
 * account list, after a rule, and there is no reason to be different.
 */

import {
  ActionRow, Confirm, Group, Identity, NavRow, Screen, glyphOf, notice, whoFace,
} from "@engine/design";
import { useSession } from "../session.js";
import { nameOf, type Where } from "./where.js";

export function You({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { me, leave, where } = useSession();
  const person = me && me !== "nobody" ? me : null;

  return (
    /* ⚠️ `detail` — one subject (you), the two places that are yours, and the
       one destructive thing. Signing out is NOT a primary action: a primary is
       what the screen is FOR, and nobody opens their account to leave it. It is
       a card of its own, in the danger voice (DESIGN.md §5). */
    <Screen shape="detail">
      <Identity
        face={person ? whoFace(person.accountId) : undefined}
        name={person?.email ?? "You"}
        under={person?.operator ? "Operator" : undefined}
      />

      <Group>
        {/* ⚠️ AN INBOX BELONGS TO A WORKSPACE, so it is offered where there is
            one to be the inbox OF. `inbox.list` reads `tenantId`, which the
            account door does not have — it answered 404 there, and the screen
            reported that as "Loading…" indefinitely. Offering it here and on
            the home screen made that two dead rows rather than one. */}
        {where?.kind === "tenant"
          ? (
            <NavRow
              icon={glyphOf("inbox")}
              label="Inbox"
              onOpen={() => onGo({ at: "inbox" })}
            />
          )
          : null}
        <NavRow
          icon={glyphOf("bell")}
          label="How you are told"
          onOpen={() => onGo({ at: "told" })}
        />
        {/* ⚠️ YOURS, NOT A WORKSPACE'S. What you prefer follows you into every
            workspace you are in, so it is filed under you rather than under one
            of them — which is exactly the test the inbox above fails. */}
        {/* ⚠️ UNDER YOU, BECAUSE THE WALK BEHIND IT CROSSES EVERY WORKSPACE.
            Filed under one of them it would answer for a fraction of what is
            held and say so in a heading nobody reads. */}
        <NavRow
          icon={glyphOf("shield")}
          label="Your data"
          under="Take a copy of everything we hold, or delete it"
          onOpen={() => onGo({ at: "data" })}
        />
        {/* ⚠️ ABOVE THE PRODUCTS' OWN PREFERENCES, because it governs every one
            of them. A date is written the same way in every product here, and a
            row filed under one of them would say otherwise. */}
        <NavRow
          icon={glyphOf("calendar")}
          label={nameOf({ at: "formats" })}
          under="Dates, times, numbers and measurements, everywhere"
          onOpen={() => onGo({ at: "formats" })}
        />
        <NavRow
          icon={glyphOf("cog")}
          label="Your preferences"
          under="How products behave for you, wherever you are"
          onOpen={() => onGo({ at: "prefs" })}
        />
      </Group>

      {/*
        ⚠️ ITS OWN CARD, BECAUSE IT IS ITS OWN KIND OF THING. Signing out sat as
        the third row of the card holding the two places you go — separated from
        them by a hairline, which is a line asking somebody to notice a
        difference the layout was not making. Two cards make the difference
        structural: these are places, that is an exit, and the gap says so at
        every size with nothing to align.
      */}
      <Group>
        {/*
          ⚠️ DANGER IS A VOICE, NOT A FILL. A filled red control is for the
          confirming button INSIDE the two-step, where somebody is already
          reading carefully; as a row in a list it is an alarm going off on an
          account page.
        */}
        <Confirm
          trigger={<ActionRow label="Sign out" tone="danger" />}
          title="Sign out?"
          act={{
            label: "Sign out",
            onDo: () => {
              void leave().then(() => {
                notice.ok("Signed out.");
                location.assign("/");
              });
            },
          }}
        >
          Your workspaces stay exactly as they are. You will need a new code to come back.
        </Confirm>
      </Group>
    </Screen>
  );
}
