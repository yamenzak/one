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

import type * as React from "react";
import { Group, NavRow, Screen, glyphOf } from "@engine/design";
import { useSession } from "../session.js";
import { useLoad } from "../centre/data.js";
import { Actions } from "../console/Actions.js";
import { Ai } from "../console/Ai.js";
import { Finding } from "../console/Finding.js";
import { Gateway } from "../console/Gateway.js";
import { Models } from "../console/Models.js";
import { Catalogue } from "../console/Catalogue.js";
import { Footing } from "../console/Footing.js";
import { Ground } from "../console/Ground.js";
import { Keys } from "../console/Keys.js";
import { Switches } from "../console/Switches.js";
import { Telling } from "../console/Telling.js";
import { Tenants } from "../console/Tenants.js";
import { Works } from "../console/Works.js";
import { OF_CONSOLE, nameOf, type AiPart, type ConsolePart, type Where } from "./where.js";

/**
 * ⚠️ THE ADDRESS GRAMMAR'S LIST, NEVER A SECOND ONE. This file had its own — six
 * members in the type, FIVE in the list the rows are drawn from — so `footing`
 * was built, routed, named and reachable from nothing. The order is the list's,
 * and it is reading order: who is here, what they generate, what we have
 * switched on, what runs unattended, where it all sits, and what it stands on.
 */
export type ConsolePartId = ConsolePart;

/* ⚠️ A MARK PER ROW, because a menu with unmarked rows reads as a mistake beside
   every other menu in this product — and `key` and `layers` were names nobody had
   mapped, so two of these nine drew the neutral circle on the one screen where
   every other row had a mark. */
const GLYPH: Readonly<Record<ConsolePartId, string>> = {
  tenants: "workspace",
  catalogue: "bank",
  ai: "sparkle",
  keys: "key",
  switches: "settings",
  telling: "bell",
  works: "clock",
  ground: "database",
  footing: "layers",
};

/**
 * WHAT SOMEBODY COMES BACK TO, AND WHAT THEY SET UP ONCE.
 *
 * ⚠️ NINE ROWS IN ONE CARD IS A MENU WITH NO SHAPE, and it is the same fault the
 * workspace screen had: the list an operator opens every day sits in the same run
 * as the push keypair they will generate once, so the frequent one loses its
 * prominence to the rare one (DESIGN.md §3). Three runs, and the gap between them
 * is the whole of the explanation.
 */
const DAILY: readonly ConsolePartId[] = ["tenants", "catalogue", "works"];
const ONCE: readonly ConsolePartId[] = ["keys", "telling"];
/**
 * ⚠️ THE MIDDLE IS WHAT IS LEFT, NEVER A THIRD LIST. Three hand-written lists is
 * three places a new console screen has to be remembered, and the one that
 * forgets makes the screen unreachable from its own menu with nothing failing —
 * which is the fault this file's own header is about, one level up.
 */
const RARELY: readonly ConsolePartId[] =
  OF_CONSOLE.filter((p) => !DAILY.includes(p) && !ONCE.includes(p));

/**
 * ⚠️ WHAT NEEDS SOMEBODY, ON THE ROW THAT LEADS TO IT. Every one of these was
 * knowable and none of it was on the screen an operator opens first: a nightly
 * pass that failed, a payment that arrived and could not be placed, a workspace
 * whose card was declined, a store counting down to deletion. Nine one-word rows
 * with no hint that anything is wrong means somebody finds out by opening all
 * nine — or from the customer.
 */
interface Attention {
  readonly jobs: number;
  readonly parked: number;
  readonly pastDue: number;
  readonly draining: number;
  readonly maintenance: string;
}

const ONE = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * ⚠️ IT WEARS THE TONE, BECAUSE THAT IS THE WHOLE REASON IT IS THERE. A second
 * line in the row's ordinary grey is a description; these are the only lines on
 * the menu, and each one is the reason to open THAT row rather than another. The
 * ink is the one channel a monochrome product has for saying so — see
 * `TONE_CSS`.
 */
const needing = (says: string, ink: "warning" | "danger" = "warning") =>
  <span data-ink={ink}>{says}</span>;

const saidOf = (part: ConsolePartId, at: Attention | null): React.ReactNode => {
  if (!at) return undefined;
  switch (part) {
    case "works": return at.jobs
      ? needing(`${ONE(at.jobs, "job", "jobs")} did not run`) : undefined;
    case "keys": return at.parked
      ? needing(`${ONE(at.parked, "payment", "payments")} could not be placed`) : undefined;
    case "tenants": return at.pastDue
      ? needing(`${ONE(at.pastDue, "workspace", "workspaces")} behind on payment`) : undefined;
    case "footing": return at.draining
      ? needing(`${ONE(at.draining, "store", "stores")} counting down to deletion`) : undefined;
    /* ⚠️ THE ONE THAT IS NOT A COUNT. Leaving the doors shut is the mistake
       nobody makes deliberately and everybody makes once, and it is the only
       item here that is withholding the product from everybody right now. */
    case "switches": return at.maintenance === "readonly" ? needing("Writes are held")
      : at.maintenance === "full" ? needing("Every door but this one is shut", "danger")
        : undefined;
    default: return undefined;
  }
};

export function ConsoleHome({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { me } = useSession();
  const person = me && me !== "nobody" ? me : null;
  /* ⚠️ ONE READ FOR THE WHOLE MENU. Four reads before anything is drawn, on the
     screen that has to be instant, is what asking each destination would cost —
     and a failure to read it leaves nine ordinary rows rather than a broken
     screen, which is why it is not part of the `Screen`'s own outcome. */
  const at = useLoad<Attention>("op.attention");
  const needs = at.of.status === "ready" ? at.of.data : null;

  const rows = (parts: readonly ConsolePartId[]) => parts.map((part) => (
    <NavRow
      key={part}
      icon={glyphOf(GLYPH[part])}
      label={nameOf({ at: part })}
      under={saidOf(part, needs)}
      onOpen={() => onGo({ at: part })}
    />
  ));

  /* ⚠️ Drawn for an operator only, and the deployment decides who those are —
     never this page. Five rows that all refuse is worse than one sentence. */
  if (person && !person.operator) {
    return (
      <Screen
        shape="list"
        refused={{
          icon: glyphOf("shield"),
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
      {/*
        ⚠️ A GLYPH PER ROW AND NO DESCRIPTION, WHICH IS THE WORKSPACE SCREEN'S
        GRAMMAR — see `Workspace.tsx`, where the same fault was fixed. Every row
        here carried a sentence, so nine destinations came out as eighteen lines
        of text: a wall to read where the menu beside it is a list to scan. What
        the screen IS gets said on arrival (`said` in `OneSpace.tsx`).

        ⚠️ THE SECOND LINE IS RESERVED FOR SOMETHING BEING WRONG, and that is why
        it is worth its space here. A description repeated on nine rows is
        texture; a count on the two that need somebody is the reason to open one
        rather than another.
      */}
      <Group>{rows(DAILY)}</Group>
      <Group>{rows(RARELY)}</Group>
      {/* ⚠️ THE ONES SET ONCE, LAST. Neither is opened twice in a year, and both
          are how the deployment reaches anybody at all — so they belong together
          and they belong at the bottom. */}
      <Group>{rows(ONCE)}</Group>
    </Screen>
  );
}

/** ⚠️ The bodies are the ones that already existed — this is only the seam. */
export function ConsolePart({ part, app, onGo }: {
  readonly part: ConsolePartId | AiPart;
  readonly app?: string;
  readonly onGo: (to: Where) => void;
}) {
  switch (part) {
    case "tenants": return <Tenants onGo={(id) => onGo({ at: "tenant", id })} />;
    case "ai": return <Ai onGo={onGo} />;
    case "models": return <Models />;
    case "gateway": return <Gateway />;
    case "finding": return <Finding />;
    case "actions":
      return <Actions app={app} onGo={(id) => onGo({ at: "actions", app: id })} />;
    case "catalogue": return <Catalogue />;
    case "switches": return <Switches />;
    case "telling": return <Telling />;
    case "works": return <Works />;
    case "ground": return <Ground />;
    case "keys": return <Keys />;
    case "footing": return <Footing />;
    /*
      ⚠️ A MISSING BRANCH IS A BUILD FAILURE, NOT A BLANK PAGE. Without this the
      switch simply returns `undefined` for a part nobody wrote a case for, React
      renders nothing, and the row leads to an empty screen with every suite
      green — which is precisely how `/space/console/footing` shipped once. Same
      assertion `Inside` makes over the whole address grammar.
    */
    default: {
      const missing: never = part;
      throw new Error(`no screen for console part ${String(missing)}`);
    }
  }
}
