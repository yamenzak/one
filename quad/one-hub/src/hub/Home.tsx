/**
 * THE HUB'S HOME — who you are, then everywhere you can go.
 *
 * ⚠️ IT WAS THREE ENORMOUS CARDS AND THAT WAS THE WRONG DENSITY FOR A DAILY
 * SURFACE. Each place carried a name, a sentence describing it and a fact —
 * three paragraphs' worth of card for what amounts to three destinations, so
 * the whole screen was one scroll for a list somebody wants to scan and leave.
 * A place card is right where a screen offers two or three WORLDS to enter; it
 * is wrong as a menu.
 *
 * ⚠️ SO IT IS A FACE AND A LIST. Every account surface anybody trusts is built
 * this way: the person at the top, then rows with a glyph, a name, and the one
 * number that says whether the row needs them. The description each place
 * carried is what a row's own screen says on arrival.
 *
 * ⚠️ AND THE COUNTS ARE ON THE ROWS, WHICH IS THE POINT OF HAVING THEM. Unread
 * mail and a workspace that stopped paying are the two reasons anybody opens
 * this screen at all; buried as the third line of a card they were something to
 * read rather than something to see.
 *
 * ⚠️ A PLACE IS NEVER DRAWN OVER NOTHING. The console is absent for everybody
 * who is not an operator — which is everybody — because a named destination
 * with nothing behind it is a promise the next screen takes back.
 */

import { Chip } from "@heroui/react";
import { Group, Identity, NavRow, Stack, glyphOf } from "@quad/web";
import type { Me } from "../api.js";
import { useLoad, type InboxView } from "../centre/data.js";
import { useSession } from "../session.js";
import { hubAt, operatorUrl } from "../door.js";
import { nameOf, pathOf, type Where } from "./where.js";

export function HubHome({ person, onGo }: {
  readonly person: Me | null;
  readonly onGo: (to: Where) => void;
}) {
  const { where } = useSession();
  const inbox = useLoad<InboxView>("inbox.list");

  /* ⚠️ The console answers on the operator door and nowhere else (D18), so
     from anywhere else this travels — see `hubAt`. */
  const console_ = () => {
    if (where?.kind === "operator") { onGo({ at: "console" }); return; }
    if (where) location.assign(hubAt(operatorUrl(where, location), pathOf({ at: "console" })));
  };

  /* ⚠️ `null` until the answer arrives, and nothing is claimed in the meantime —
     somebody with four workspaces shown "None yet" for the length of a round
     trip is a wrong answer wearing a loading state's excuse. */
  const workspaces = person?.tenants ?? null;
  const needing = workspaces?.filter((t) => t.attention).length ?? 0;
  const unread = inbox.of.status === "ready" ? inbox.of.data.unseen : 0;

  return (
    <Stack space="roomy">
      <Identity
        name={person?.email ?? "You"}
        under={workspaces === null
          ? undefined
          : workspaces.length === 1 ? "1 workspace" : `${workspaces.length} workspaces`}
        /* ⚠️ NO OPERATOR CHIP. It was `warning` amber — the one hue on a
           monochrome screen, for a standing rather than a problem — and it said
           the same word as the only row an operator gets, four rows below it. A
           badge that repeats a destination is a badge doing nothing. */
      />

      <Group>
        <NavRow
          icon={glyphOf("workspace")}
          label="Workspaces"
          /* ⚠️ THE PROBLEM WINS THE BADGE. A count of workspaces is a fact the
             line under the face already gives; one that needs attention is a
             reason, and only one of the two is worth a mark on the row. */
          aside={needing > 0
            ? <Chip color="warning" variant="soft"><Chip.Label>{needing}</Chip.Label></Chip>
            : undefined}
          onOpen={() => onGo({ at: "workspaces" })}
        />
        <NavRow
          icon={glyphOf("inbox")}
          label="Inbox"
          /* ⚠️ Zero is texture, never a badge saying nothing happened. */
          aside={unread > 0
            ? <Chip color="accent" variant="soft"><Chip.Label>{unread}</Chip.Label></Chip>
            : undefined}
          onOpen={() => onGo({ at: "inbox" })}
        />
        <NavRow
          icon={glyphOf("person")}
          /* ⚠️ THE ROW IS NAMED BY WHERE IT GOES, not by a synonym. It said
             "Your details" and the screen it opens is called "You" — a name
             changing under somebody mid-tap is the smallest kind of lie a menu
             can tell, and `nameOf` is where that name already lives. */
          label={nameOf({ at: "you" })}
          onOpen={() => onGo({ at: "you" })}
        />
      </Group>

      {person?.operator ? (
        <Group>
          {/* ⚠️ One line, like every other row here. A description on one row of
              a menu makes that row a different shape from its neighbours, which
              reads as the odd one out rather than as the important one — and the
              screen behind it says what it is on arrival. */}
          <NavRow icon={glyphOf("shield")} label="Operator" onOpen={console_} />
        </Group>
      ) : null}
    </Stack>
  );
}
