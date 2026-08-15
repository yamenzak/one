/**
 * YOU — who you are, everywhere.
 *
 * ⚠️ EVERYTHING HERE FOLLOWS THE PERSON RATHER THAN THE WORKSPACE. The address
 * you sign in with, what you have been told, the tokens you minted, the way
 * out of an account — none of them belongs to any one workspace, and filing
 * them under one means visiting four places to change one fact about yourself.
 *
 * ⚠️ AND SIGNING OUT IS HERE BECAUSE IT IS ABOUT YOU. It sat in an avatar menu
 * in a workspace's chrome, which is the one place it reads as leaving THAT
 * workspace rather than leaving.
 */

import {
  ActionRow, Confirm, FieldRow, Group, NavRow, Stack, glyphOf, notice,
} from "@quad/web";
import { useSession } from "../session.js";
import type { Where } from "./where.js";

export function You({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { me, leave } = useSession();
  const person = me && me !== "nobody" ? me : null;

  return (
    /*
      ⚠️ THREE CARDS AND NO HEADINGS, BECAUSE THE GAP ALREADY SAYS IT. Each of
      these was a `Group` with a label AND a line under it — six lines of chrome
      over three rows of content, on a screen whose crown had already said what
      it was. A gap between two cards says "these are different kinds of thing"
      (`surfaces.tsx`); a heading over each says it a second time.

      ⚠️ AND THE LINE ABOUT PASSWORDS IS GONE. "A code goes here every time — no
      password to lose" is marketing, on a screen a person opened to change
      their address. They are already signed in; there is nothing to sell.
    */
    <Stack space="roomy">
      {/* ⚠️ A FACT, NOT A DESTINATION. It was a disabled `NavRow`, which draws a
          chevron — a promise that something is behind it, greyed out, with
          nothing anywhere saying why it cannot be pressed. */}
      <Group>
        <FieldRow label="Email" value={person?.email ?? "Your address"} />
      </Group>

      <Group>
        <NavRow
          icon={glyphOf("inbox")}
          label="Inbox"
          under="Everything anywhere has told you"
          onOpen={() => onGo({ at: "inbox" })}
        />
      </Group>

      <Group>
        {/*
          ⚠️ DANGER IS A VOICE, NOT A FILL — `surfaces.tsx` says so and this was
          the screen breaking it. A soft-red pill sitting alone in a card is an
          alarm going off on an account page; the destructive ROW is the ordinary
          row shape in the danger tone, and the two-step it opens is where the
          red button belongs.
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
    </Stack>
  );
}
