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

import { Button } from "@heroui/react";
import { Confirm, FieldRow, Group, NavRow, Stack, notice } from "@quad/web";
import { useSession } from "../session.js";
import type { Where } from "./where.js";

export function You({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { me, leave } = useSession();
  const person = me && me !== "nobody" ? me : null;

  return (
    <Stack space="roomy">
      {/* ⚠️ A FACT, NOT A DESTINATION. It was a disabled `NavRow`, which draws a
          chevron — a promise that something is behind it, greyed out, with
          nothing anywhere saying why it cannot be pressed. */}
      <Group
        label="How you sign in"
        under="A code goes here every time — no password to lose"
      >
        <FieldRow label="Email" value={person?.email ?? "Your address"} />
      </Group>

      <Group label="What you were told" under="It follows you across every product">
        <NavRow
          label="Inbox"
          under="Everything anywhere has told you"
          onOpen={() => onGo({ at: "inbox" })}
        />
      </Group>

      <Group
        label="Leaving"
        under="Signing out ends this session everywhere on this device"
      >
        <div className="py-3">
          <Confirm
            trigger={<Button variant="danger-soft">Sign out</Button>}
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
        </div>
      </Group>
    </Stack>
  );
}
