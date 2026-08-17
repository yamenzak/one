/**
 * THE OPERATOR CONSOLE, AS A PLACE INSIDE THE SPACE.
 *
 * ⚠️ IT IS NOT A SECOND PRODUCT. It had its own shell, its own nav and its own
 * crown — an operator surface built out of its own chrome, which is a second
 * design nobody maintains and a second place to learn. It is five screens under
 * one row now, reached the same way a workspace is reached, from the same
 * surface, by the same gesture.
 *
 * ⚠️ AND IT ANSWERS ON THE OPERATOR DOOR AND NOWHERE ELSE (D18). The OneSpace's home
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

import { Group, NavRow, Screen, glyphOf } from "@engine/design";
import { useSession } from "../session.js";
import { Actions } from "../console/Actions.js";
import { Footing } from "../console/Footing.js";
import { Ground } from "../console/Ground.js";
import { Switches } from "../console/Switches.js";
import { Tenants } from "../console/Tenants.js";
import { Works } from "../console/Works.js";
import { OF_CONSOLE, nameOf, type ConsolePart, type Where } from "./where.js";

/**
 * ⚠️ THE ADDRESS GRAMMAR'S LIST, NEVER A SECOND ONE. This file had its own — six
 * members in the type, FIVE in the list the rows are drawn from — so `footing`
 * was built, routed, named and reachable from nothing. The order is the list's,
 * and it is reading order: who is here, what they generate, what we have
 * switched on, what runs unattended, where it all sits, and what it stands on.
 */
export type ConsolePartId = ConsolePart;

/* ⚠️ A MARK PER ROW, because a menu with unmarked rows reads as a mistake beside
   every other menu in this product. */
const GLYPH: Readonly<Record<ConsolePartId, string>> = {
  tenants: "workspace",
  actions: "sparkle",
  switches: "settings",
  works: "clock",
  ground: "database",
  footing: "layers",
};

export function ConsoleHome({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { me } = useSession();
  const person = me && me !== "nobody" ? me : null;

  /* ⚠️ Drawn for an operator only, and the deployment decides who those are —
     never this page. Five rows that all refuse is worse than one sentence. */
  if (person && !person.operator) {
    return (
      <Screen
        shape="list"
        refused={{
          says: "The console admits operators only",
          under: "Everything you can reach is under Workspaces",
        }}
      />
    );
  }

  return (
    /* ⚠️ `list`, NOT `board`, AND THE DIFFERENCE IS WHETHER A TILE HAS ANYTHING
       IN IT. Every row here is a name and a glyph by design — the sentence that
       used to sit under each one is what the screen behind it says on arrival
       (`said` in `OneSpace.tsx`), where it is useful and not competing with four
       others. A tile with nothing but a word in it is a large button, and five
       of them is a menu that takes a whole screen to say what a list says in
       five rows. No primary: a console is a way IN to five things, not a place
       where one of them is the point. */
    <Screen shape="list">
      {/* ⚠️ Unlabelled: the crown already says where this is, and a heading
          repeating it is the same sentence twice — see `OneSpace.tsx`. */}
      {/*
        ⚠️ A GLYPH PER ROW AND NO DESCRIPTION, WHICH IS THE WORKSPACE SCREEN'S
        GRAMMAR — see `Workspace.tsx`, where the same fault was fixed. Every row
        here carried a sentence, so five destinations came out as ten lines of
        text: a wall to read where the menu beside it is a list to scan. The
        sentence is what each screen says when somebody arrives on it (`said` in
        `OneSpace.tsx`), which is where it is useful and where it is not competing
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
    </Screen>
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
    case "footing": return <Footing />;
  }
}
