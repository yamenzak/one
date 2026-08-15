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
  ActionRow, Confirm, Group, Identity, NavRow, RowRule, Screen, glyphOf, notice,
} from "@quad/web";
import { useSession } from "../session.js";
import type { Where } from "./where.js";

export function You({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { me, leave } = useSession();
  const person = me && me !== "nobody" ? me : null;

  return (
    /* ⚠️ `detail` — one subject (you), the two places that are yours, and the
       one destructive thing. Signing out is NOT a primary action: a primary is
       what the screen is FOR, and nobody opens their account to leave it. It
       stays the last row, after a rule, in the danger voice (DESIGN.md §5). */
    <Screen shape="detail">
      <Identity name={person?.email ?? "You"} under={person?.operator ? "Operator" : undefined} />

      <Group>
        <NavRow
          icon={glyphOf("inbox")}
          label="Inbox"
          onOpen={() => onGo({ at: "inbox" })}
        />
        <RowRule />
        <NavRow
          icon={glyphOf("bell")}
          label="How you are told"
          onOpen={() => onGo({ at: "told" })}
        />
        {/* ⚠️ The rules are placed by hand here, which is what tells `Group` to
            stop interleaving its own — one card, two runs. */}
        <RowRule />
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
