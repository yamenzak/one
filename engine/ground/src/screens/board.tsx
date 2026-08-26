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
import { Shell, whoFace } from "@engine/design";
import { ground as GROUND } from "../index.js";
import { GroundScreen } from "./index.js";

const EVERYTHING = new Set(["note:read", "note:write", "check-in:read", "check-in:write", "people:read"]);

export function Board({ route }: { readonly route: string }) {
  const G = GROUND();
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
      <GroundScreen route={route} />
    </Shell>
  );
}
