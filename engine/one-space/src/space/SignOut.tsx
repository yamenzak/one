/**
 * THE WAY OUT, AND IT IS THE SAME ONE FROM BOTH SCREENS THAT OFFER IT.
 *
 * ⚠️ IT IS ONE COMPONENT BECAUSE IT IS ON TWO SCREENS. The account door's first
 * screen and the drawer of everything about you are both places somebody
 * reaches for the exit, and a second copy is where the two would start
 * disagreeing about the wording of the two-step — which is the one piece of copy
 * on either screen that has to be exactly right.
 *
 * ⚠️ AND IT HAS A MARK LIKE EVERY OTHER ROW. This was the one row in the account
 * centre with an empty lead, which reads as a row whose icon failed to load
 * rather than as a different kind of thing. The card around it is what says it
 * is different; the missing glyph just made it look broken.
 *
 * ⚠️ DANGER IS A VOICE, NOT A FILL. A filled red control is for the confirming
 * button INSIDE the two-step, where somebody is already reading carefully; as a
 * row in a list it is an alarm going off on an account page.
 */

import { ActionRow, Confirm, Group, glyphOf, notice } from "@engine/design";
import { useSession } from "../session.js";

export function SignOut() {
  const { leave } = useSession();
  return (
    /*
      ⚠️ ITS OWN CARD, BECAUSE IT IS ITS OWN KIND OF THING. It sat as the last
      row of the card holding the places you go, separated by a hairline — a line
      asking somebody to notice a difference the layout was not making. Two cards
      make the difference structural, at every size, with nothing to align.
    */
    <Group>
      <Confirm
        trigger={<ActionRow icon={glyphOf("leave")} label="Sign out" tone="danger" />}
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
  );
}
