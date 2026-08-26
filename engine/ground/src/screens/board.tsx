/**
 * THE GROUND IN THE CHROME A PERSON ACTUALLY SEES IT THROUGH.
 *
 * ⚠️ A SCREEN ON ITS OWN LEAVES OUT THE HALF A PRODUCT CANNOT OPT OUT OF. The
 * crown, the dock, the hem, the scene and the room reserved for the island are
 * what every screen sits inside, and none of them is in a screen's own render —
 * so a suite that mounts one bare is measuring a component. A screen that fits
 * at 390 by itself can still be pushed sideways by what surrounds it.
 *
 * ⚠️ AND IT IS THE SAME `Shell` CALL THE DEPLOYMENT MAKES, which is what makes
 * this worth having at all: a change to the chrome shows up here, in a browser,
 * on real screens, without a product needing to exist. An app that brought its
 * own chrome would be an app that could get it wrong.
 *
 * ⚠️ EVERYTHING IS HELD, BECAUSE THE GROUND EXISTS TO REACH EVERY SCREEN. What a
 * permission hides is real behaviour with its own tests; a ground holding half
 * the grants would be one where half the screens are unreachable and nothing
 * says which.
 */

import * as React from "react";
import { Shell, ready, whoFace } from "@engine/design";
import { Body, type Has } from "@engine/design/body";
import { ground as GROUND } from "../index.js";
import { GroundScreen } from "./index.js";
import { NOTES, PEOPLE } from "./sample.js";

const EVERYTHING = new Set(["note:read", "note:write", "check-in:read", "check-in:write", "people:read"]);

export function Board({ route }: { readonly route: string }) {
  const G = GROUND();
  const declared = (G.screens ?? []).find((s) => s.route === route)?.body;
  return (
    <Shell
      screens={G.screens ?? []}
      hue={G.hue}
      here={route}
      held={EVERYTHING}
      kind="commercial"
      crown={{
        appId: G.id, appName: G.name, appMark: G.mark,
        tenantName: "Harbour Works", unread: 3,
        personEmail: "sam@harbourworks.example", personFace: whoFace("harbour"),
      }}
      onGo={() => undefined}
    >
      {/*
        ⚠️ A DECLARED SCREEN IS DRAWN THROUGH THE RENDERER, AND A WRITTEN ONE
        THROUGH ITS FILE — which is the difference between a photograph OF the
        screen and a photograph of a file that shares its name. The board used to
        hand every route to the hand-written component, so a screen ported to a
        declaration went on being pictured as the code the product no longer
        runs: the heading it used to have instead of the hero it now leads with,
        under the same name, with the sweep reporting green.

        ⚠️ AND THE SAMPLE WORLD IS THE SAME ONE THE WRITTEN SCREENS USE. Two
        fixtures would mean a declared screen and a written one disagreeing about
        what this workspace contains, and every comparison between them being
        about the data rather than about the drawing.
      */}
      {declared ? <Body body={declared} has={SEEN} /> : <GroundScreen route={route} />}
    </Shell>
  );
}

/**
 * THE SAMPLE WORLD A DECLARED SCREEN READS.
 *
 * ⚠️ EVERY VIEW ANSWERED AND NONE OF THEM WAITING, because a board exists to
 * show what a screen looks like when it has something to show. The waiting and
 * empty states are worth photographing too and they are a different picture —
 * one this can take by handing over `waiting()` — rather than something to leave
 * to chance in the picture of the ordinary case.
 */
/* ⚠️ A ROW IS A BAG OF VALUES TO THE RENDERER — see `Viewed`. The sample's own
   types are narrower, which is correct where they are read by a written screen's
   props and irrelevant here: a declaration names fields by string, so what
   crosses this seam is what any read answers with. */
const rows = (of: readonly object[]) =>
  ready({ items: of as readonly Readonly<Record<string, unknown>>[], count: of.length });

const SEEN: Has = {
  views: {
    "every-note": rows(NOTES),
    "every-person": rows(PEOPLE),
  },
};
