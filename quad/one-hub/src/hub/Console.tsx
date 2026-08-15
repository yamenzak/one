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

import { Group, NavRow, Nothing, Stack, glyphOf } from "@quad/web";
import { useSession } from "../session.js";
import { Actions } from "../console/Actions.js";
import { Ground } from "../console/Ground.js";
import { Switches } from "../console/Switches.js";
import { Tenants } from "../console/Tenants.js";
import { Works } from "../console/Works.js";
import { nameOf, type Where } from "./where.js";

export type ConsolePartId = "tenants" | "actions" | "switches" | "works" | "ground";

/* ⚠️ ONE ORDER, AND IT IS READING ORDER: who is here, what they generate, what
   we have switched on, what runs unattended, and where it all sits. */
const OF_CONSOLE: readonly ConsolePartId[] = ["tenants", "actions", "switches", "works", "ground"];

/* ⚠️ A MARK PER ROW, because a menu with unmarked rows reads as a mistake beside
   every other menu in this product. */
const GLYPH: Readonly<Record<ConsolePartId, string>> = {
  tenants: "workspace",
  actions: "sparkle",
  switches: "settings",
  works: "clock",
  ground: "database",
};

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
      {/*
        ⚠️ A GLYPH PER ROW AND NO DESCRIPTION, WHICH IS THE WORKSPACE SCREEN'S
        GRAMMAR — see `Workspace.tsx`, where the same fault was fixed. Every row
        here carried a sentence, so five destinations came out as ten lines of
        text: a wall to read where the menu beside it is a list to scan. The
        sentence is what each screen says when somebody arrives on it (`said` in
        `Hub.tsx`), which is where it is useful and where it is not competing
        with four others.
      */}
      <Group>
        {OF_CONSOLE.map((part) => (
          <NavRow
            key={part}
            icon={glyphOf(GLYPH[part])}
            label={nameOf({ at: part })}
            onOpen={() => onGo({ at: part })}
          />
        ))}
      </Group>
    </Stack>
  );
}

/** ⚠️ The bodies are the ones that already existed — this is only the seam. */
export function ConsolePart({ part, app, onGo }: {
  readonly part: ConsolePartId;
  readonly app?: string;
  readonly onGo: (to: Where) => void;
}) {
  switch (part) {
    case "tenants": return <Tenants onGo={(id) => onGo({ at: "tenant", id })} />;
    case "actions":
      return <Actions app={app} onGo={(id) => onGo({ at: "actions", app: id })} />;
    case "switches": return <Switches />;
    case "works": return <Works />;
    case "ground": return <Ground />;
  }
}
