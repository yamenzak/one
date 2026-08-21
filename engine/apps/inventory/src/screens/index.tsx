/**
 * ONEINVENTORY'S BROWSER HALF — the screens, and the ground they are looked at on.
 *
 * ⚠️ SEPARATE FROM THE MANIFEST ON PURPOSE. `../index.ts` is imported by the
 * WORKER, and a worker that imported React would pay for it in startup CPU on
 * every cold start (D3). The manifest declares the screens; this is what draws
 * them, and only a browser ever loads it.
 *
 * ⚠️ EVERY SCREEN TAKES ITS DATA AS PROPS, WHICH IS WHAT MAKES THIS A GROUND.
 * Nothing here fetches, so any screen renders with no session, no worker and no
 * database — which is how anybody looks at the interface at all. An inventory is
 * the hardest product in this repo to photograph any other way: the interesting
 * states are a line that ran out, one nobody has touched since spring, and a
 * shelf somebody labelled and never filled, and reaching all three through a
 * real database means four hours of data entry before the first screenshot.
 *
 * ⚠️ AND THE STATE LIVES HERE RATHER THAN IN THE SCREENS. A screen that owned
 * its own place-in-the-tree could not be rendered into a chosen one, and
 * rendering a chosen state is the whole reason this file exists.
 */

import * as React from "react";
import { ready, type Loaded } from "@engine/design";
import { INVENTORY } from "../index.js";
import { LINES, PLACES, EMPTY_PLACE, type Line, type Place } from "./sample.js";
import { Start } from "./Start.js";
import { Stock } from "./Stock.js";
import { Thing, type Movement } from "./Thing.js";
import { Where } from "./Where.js";

export { Start, Stock, Thing, Where };
export * from "./sample.js";
export type { Movement };

const nothing = () => undefined;

/**
 * ⚠️ THE ROUTES COME FROM THE MANIFEST, NOT FROM A LIST HERE. A second list is a
 * second answer to "what screens does this app have", and they drift in the
 * direction nobody notices — a screen declared and never drawn renders a notice,
 * which reads as unfinished rather than as a mistake.
 */
export const INVENTORY_ROUTES: readonly string[] =
  (INVENTORY.screens ?? []).map((s) => s.route);

/** What ticks the guide, and how many times. Sample, like everything else here. */
const DONE = ["location.created", "product.created"];
const COUNTS = { "product.created": 12, "stock.received": 40 };
const HELD = new Set([
  "product:read", "product:write", "location:read", "location:write",
  "stock:read", "stock:move", "stock:adjust", "ledger:read",
]);

/**
 * ⚠️ ONE PRODUCT'S HISTORY, AND IT IS A DISAGREEMENT RATHER THAN A TIDY LIST.
 * Two receipts, a take, and a correction that says why — because the pair the
 * screen exists to keep apart is "we used forty" against "somebody wrote it down
 * wrong", and a history made only of receipts shows neither.
 */
const HISTORY: readonly Movement[] = [
  { id: "m4", move: "adjusted", delta: -60, at: "2026-08-20T09:12:00.000Z",
    who: "Dana", where: "A1", reason: "Counted the shelf — two boxes were never received",
    capture: "typed" },
  { id: "m3", move: "taken", delta: -400, at: "2026-08-14T07:05:00.000Z",
    who: "Ruth", where: "A1", capture: "scanned" },
  { id: "m2", move: "received", delta: 800, at: "2026-08-02T13:40:00.000Z",
    who: "Dana", where: "A1", capture: "scanned" },
  { id: "m1", move: "received", delta: 860, at: "2026-07-19T10:15:00.000Z",
    who: "Dana", where: "A1", capture: "ai-assisted" },
];

/** ⚠️ Everything at or below a place, which is what a tree row promises. */
const under = (places: readonly Place[], here: string | null): ReadonlySet<string> => {
  const held = new Set<string>();
  if (!here) return held;
  held.add(here);
  /* Bounded by the node count: a parent pointer somebody typed in a circle must
     not hang the screen it is drawn on. */
  for (let pass = 0; pass < places.length; pass++) {
    for (const p of places) {
      if (p.of && held.has(p.of)) held.add(p.id);
    }
  }
  return held;
};

/**
 * Every screen with the sample world behind it, keyed by its declared route.
 * This is what the test ground renders and what a screenshot sweep walks.
 */
export function InventoryScreen({ route, onGo }: {
  readonly route: string;
  /** ⚠️ Absent on the ground, where there is no router to go anywhere with. */
  readonly onGo?: (route: string) => void;
}) {
  /* ⚠️ WHERE THE READER IS IN THE TREE — an address in the real app and state
     here, because this file is the ground rather than a router. */
  const [here, setHere] = React.useState<string | null>(null);
  const go = onGo ?? nothing;

  /* ⚠️ THE NAME COMES FROM THE MANIFEST. A screen titled by its own file is a
     screen whose name and whose nav entry are two facts that can disagree. */
  const title = (INVENTORY.screens ?? []).find((sc) => sc.route === route)?.label;

  const reach = under(PLACES, here);
  const lines: Loaded<readonly Line[]> = ready(
    here ? LINES.filter((l) => reach.has(l.where)) : LINES);

  switch (route) {
    /* ⚠️ THE SHELF NOBODY HAS FILLED, WHICH IS THE SECOND SCREEN ANYBODY SEES.
       A place with a name and nothing on it is a real state rather than an
       omission, and the ground would never reach it by accident. */
    case "/where": {
      const place = PLACES.find((p) => p.id === EMPTY_PLACE) ?? PLACES[0] as Place;
      return (
        <Where
          place={place}
          places={PLACES}
          of={ready(LINES.filter((l) => l.where === place.id))}
          again={nothing}
          back={() => go("/")}
          onGo={setHere}
          onOpen={() => go("/thing")}
          onLabel={nothing}
          onCopy={nothing}
        />
      );
    }
    /* ⚠️ THE LINE WITH THE MOST HISTORY, because the history is the half of this
       screen worth looking at — a product with one receipt on it photographs as
       a heading and a row. */
    case "/thing":
      return (
        <Thing
          line={LINES[0] as Line}
          history={ready(HISTORY)}
          again={nothing}
          back={() => go("/")}
          onTake={nothing}
        />
      );
    case "/start":
      return <Start title={title} done={DONE} counts={COUNTS} held={HELD} onGo={go} />;
    /* ⚠️ THE DEFAULT IS THE APP'S FIRST DECLARED SCREEN, not a blank. An
       unrecognised route rendering nothing is the same picture as a page that
       failed to load, and only one of them gets reported. */
    default:
      return (
        <Stock
          title={title ?? "Stock"}
          of={lines}
          places={PLACES}
          here={here}
          again={nothing}
          onGo={setHere}
          onOpen={() => go("/thing")}
          onAdd={nothing}
        />
      );
  }
}
