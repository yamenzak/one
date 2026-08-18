/**
 * WHICH WORKSPACE — the account door's answer for a setting that lives in one.
 *
 * ⚠️ SOME SETTINGS FOLLOW THE PERSON AND SOME ONLY LOOK AS IF THEY DO, and the
 * account door is where the difference shows. How you read a date is yours
 * everywhere (`Formats`). How you are told, and how a product behaves for you,
 * are declared by APPS — so they exist per workspace, because which apps you
 * have does. Offered on `id.` they called a member operation with no tenancy to
 * answer for and rendered as a title over "That is not here".
 *
 * ⚠️ AND MERGING THEM ONTO THIS DOOR IS NOT AVAILABLE EITHER. A push
 * subscription belongs to the ORIGIN it was made at — a browser rule, not ours —
 * so "show notifications on this device" is genuinely a different answer per
 * workspace. A merged screen would drop that switch or show one for an origin
 * that is not any workspace.
 *
 * ⚠️ SO THIS SAYS WHERE AND THE WORKSPACE SAYS HOW, and it costs no round trip:
 * every workspace this account is in already arrived with `me.who`, which the
 * session holds. It is a projection of something loaded, not a second read.
 *
 * ⚠️ IT IS ONE COMPONENT BECAUSE THERE WERE TWO OF THESE. `told` and `prefs` are
 * the same sentence with a different noun, and the second copy is where the two
 * would start disagreeing about what a workspace row looks like.
 */

import { Group, Nothing, PersonRow, Screen, glyphOf, placeFace } from "@engine/design";
import { useSession } from "../session.js";
import { isHere, spaceAt, tenantUrl } from "../door.js";
import { pathOf, type Where } from "./where.js";

export function PickWorkspace({ to, under, empty, onGo }: {
  /** Where in the chosen workspace this is asking to go. */
  readonly to: Where;
  /** ⚠️ Why there is a list here — see `Group.under`. */
  readonly under: string;
  readonly empty: string;
  readonly onGo: (to: Where) => void;
}) {
  const { me, where } = useSession();
  const person = me && me !== "nobody" ? me : null;
  const belongs = person?.tenants ?? null;

  /*
    ⚠️ A WORKSPACE IS MANAGED AT ITS OWN ADDRESS, so choosing one TRAVELS —
    the same rule `Workspaces` follows, because the records and the operations
    behind the next screen are at the other origin.
  */
  const open = (slug: string) => {
    if (!where) return;
    if (isHere(slug, where)) { onGo(to); return; }
    location.assign(spaceAt(tenantUrl(slug, where, location), pathOf(to)));
  };

  return (
    <Screen shape="list">
      {/* ⚠️ `null` IS NOT "NONE" — the list is unknown until `me.who` lands, and
          an empty state drawn over a pending read is a wrong answer wearing a
          loading state's excuse. */}
      {belongs && belongs.length === 0
        ? <Nothing icon={glyphOf("workspace")} says="You are not in a workspace yet" under={empty} />
        : (
          <Group label="Choose a workspace" under={under}>
            {(belongs ?? []).map((w) => (
              <PersonRow
                key={w.slug}
                goes
                face={placeFace(w.slug)}
                name={w.name}
                onOpen={() => open(w.slug)}
              />
            ))}
          </Group>
        )}
    </Screen>
  );
}
