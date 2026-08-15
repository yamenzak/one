/**
 * THE OPERATOR CONSOLE, AS A PLACE INSIDE THE HUB.
 *
 * ⚠️ IT IS NOT A SECOND PRODUCT. It had its own shell, its own nav and its own
 * crown — an operator surface built out of its own chrome, which is a second
 * design nobody maintains and a second place to learn. It is five screens under
 * one row now, reached the same way a workspace is reached, from the same
 * surface, by the same gesture.
 *
 * ⚠️ AND IT ANSWERS ON THE OPERATOR DOOR AND NOWHERE ELSE (D18). The hub's home
 * TRAVELS to `admin.` rather than pushing a path here, because every operation
 * behind these rows is refused anywhere else — a console that rendered on a
 * workspace's address would draw five screens and 403 on all of them, which is
 * exactly what the old `/admin` route did in a product before this one.
 *
 * ⚠️ EVERY SCREEN HERE IS ABOUT US, NOT ABOUT THEM. Tenants and their standing,
 * the flags we switched on, the work nobody watches, the shards and their room,
 * and the switch that closes every door. What a workspace's own people manage
 * lives behind that workspace's own address.
 */

import { Group, NavRow, Nothing, Stack } from "@quad/web";
import { useSession } from "../session.js";
import { Actions } from "../console/Actions.js";
import { Ground } from "../console/Ground.js";
import { Switches } from "../console/Switches.js";
import { Tenants } from "../console/Tenants.js";
import { Works } from "../console/Works.js";
import type { Where } from "./where.js";

export type ConsolePartId = "tenants" | "actions" | "switches" | "works" | "ground";

export function ConsoleHome({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { me } = useSession();
  const person = me && me !== "nobody" ? me : null;

  /* ⚠️ Drawn for an operator only, and the deployment decides who those are —
     never this page. Five rows that all refuse is worse than one sentence. */
  if (person && !person.operator) {
    return (
      <Nothing
        says="The console admits operators only"
        under="Everything you can reach is under Workspaces"
      />
    );
  }

  return (
    <Stack space="roomy">
      {/* ⚠️ Unlabelled: the crown already says where this is, and a heading
          repeating it is the same sentence twice — see `Hub.tsx`. */}
      <Group>
        <NavRow
          label="Tenants"
          under="Every workspace here, what each is on, and what it owes"
          onOpen={() => onGo({ at: "tenants" })}
        />
        <NavRow
          label="Actions"
          under="What each product generates, and the model behind it"
          onOpen={() => onGo({ at: "actions" })}
        />
        <NavRow
          label="Switches"
          under="Ours to turn on, and the one that closes every door"
          onOpen={() => onGo({ at: "switches" })}
        />
        <NavRow
          label="Works"
          under="What runs on its own, and when it last did"
          onOpen={() => onGo({ at: "works" })}
        />
        <NavRow
          label="Ground"
          under="Where records live, and the room left on each"
          onOpen={() => onGo({ at: "ground" })}
        />
      </Group>
    </Stack>
  );
}

/** ⚠️ The bodies are the ones that already existed — this is only the seam. */
export function ConsolePart({ part }: { readonly part: ConsolePartId }) {
  switch (part) {
    case "tenants": return <Tenants />;
    case "actions": return <Actions />;
    case "switches": return <Switches />;
    case "works": return <Works />;
    case "ground": return <Ground />;
  }
}
