/**
 * THE HUB'S HOME — three places, and nothing else on the page.
 *
 * ⚠️ IT WAS A LIST ONCE AND THE LIST HAD NO SUBJECT. Your address, your
 * workspaces, a bill, a roster, a retention policy and the button that closes
 * everything, in one column — so "change how you are told about things" and
 * "run a business" were adjacent rows, and somebody arriving had to read the
 * whole page to find out what kind of place they were in.
 *
 * ⚠️ SO IT IS PLACES. What you ARE, what you BELONG TO, and — for the few who
 * hold it — what you RUN. Each is somewhere to go rather than something to set,
 * which is exactly what a place says and exactly what a row does not, and the
 * page is scanned in one pass rather than read.
 *
 * ⚠️ AND A PLACE IS NEVER DRAWN OVER NOTHING. The console is absent for
 * everybody who is not an operator — which is everybody — because a named place
 * with nothing behind it is a promise the next screen takes back.
 */

import { Place, Stack } from "@quad/web";
import type { Me } from "../api.js";
import { useSession } from "../session.js";
import { hubAt, operatorUrl } from "../door.js";
import { pathOf, type Where } from "./where.js";

export function HubHome({ person, onGo }: {
  readonly person: Me | null;
  readonly onGo: (to: Where) => void;
}) {
  const { where } = useSession();

  /* ⚠️ The console answers on the operator door and nowhere else (D18), so
     from anywhere else this travels — see `hubAt`. */
  const console_ = () => {
    if (where?.kind === "operator") { onGo({ at: "console" }); return; }
    if (where) location.assign(hubAt(operatorUrl(where, location), pathOf({ at: "console" })));
  };
  /* ⚠️ `null` until the answer arrives, and each foot says so — somebody with
     four workspaces told "None yet" for the length of a round trip is a wrong
     answer wearing a loading state's excuse. */
  const workspaces = person?.tenants ?? null;
  const needing = workspaces?.filter((t) => t.attention).length ?? 0;

  return (
    <Stack space="roomy">
      {/* ⚠️ The name of this place is the crown's, not a second heading three
          lines under it — see `Hub.tsx`. */}
      <Stack space="snug">
        <Place
          at={0}
          tone="neutral"
          name="You"
          said="Your details, how you sign in, and what is held about you"
          foot={person ? (person.email ?? "Signed in") : null}
          onOpen={() => onGo({ at: "you" })}
        />

        <Place
          at={1}
          tone="info"
          name="Workspaces"
          said="Everywhere you belong, across every product"
          foot={workspaces === null
            ? null
            : /* ⚠️ THE PROBLEM WINS THE LINE. A count is a fact; one that needs
                 attention is a reason, and only one of the two is worth the
                 outside of the card. */
            needing > 0
              ? `${needing} ${needing === 1 ? "needs" : "need"} attention`
              : workspaces.length === 0
                ? "None yet"
                : `${workspaces.length} ${workspaces.length === 1 ? "workspace" : "workspaces"}`}
          onOpen={() => onGo({ at: "workspaces" })}
        />

        {person?.operator ? (
          <Place
            at={2}
            tone="warning"
            name="Operator"
            said="The deployment itself — tenants, switches, the work that runs alone"
            foot="Everything here"
            onOpen={console_}
          />
        ) : null}
      </Stack>
    </Stack>
  );
}
