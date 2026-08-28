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
import { Screen, Shell, ready, whoFace } from "@engine/design";
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
      {/*
        ⚠️ AND A DECLARED BODY IS PUT IN A `Screen`, WHICH IS THE FRAME EVERY
        WRITTEN ONE ALREADY BRINGS. `Body` places blocks and states so — the
        gutter, the reading width, the crown's collapse and the shape's own
        skeleton are the frame's, and mounting a body bare leaves every one of
        them off. Photographed that way both cards ran edge to edge at x=0 while
        every written screen beside them was inset, and the difference read as a
        design decision about heroes rather than as a missing wrapper.
      */}
      {declared
        ? (
          <Screen
            shape={declared.shape}
            title={(G.screens ?? []).find((s) => s.route === route)?.label ?? ""}
          >
            <Body body={declared} has={{ ...SEEN, named: namedIn(G.screens ?? []) }} />
          </Screen>
        )
        : <GroundScreen route={route} />}
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

/*
  ⚠️ THE NARROWED VIEWS ARE NARROWED HERE TOO, RATHER THAN GIVEN A NUMBER. A
  supporting figure is a `count` over a view, so a board that answered each one
  with a plausible integer would photograph a screen whose figures agree with
  nothing — and the one fault this shape exists to prevent is a figure and the
  list behind it disagreeing. Filtering the same sample the list draws is what
  makes the picture check the declaration rather than illustrate it.
*/
const SEEN: Has = {
  /*
    ⚠️ A NO-OP, AND IT IS NOT NOTHING. Every affordance in the renderer is gated
    on the handler being there — a hero opens a record only if something can go
    somewhere — so a board without one photographs a screen with its presses
    silently removed, which looks exactly like a screen that was never given
    them. The hero card drew as a plain panel for one sweep for that reason.
  */
  onGo: () => undefined,
  /*
    ⚠️ THE WORKSPACE'S OWN CURRENCY — see D117. `DRAWN.money` refuses to guess
    which currency's minor units a figure is, so a board that has not been told
    photographs every price as an empty cell: a heading, a mark and no number,
    with every test green. The ground declares no money field today, and that is
    exactly why it is set — the day it declares one, the picture is right rather
    than a blank somebody has to notice.
  */
  currency: "GBP",
  views: {
    "every-note": rows(NOTES),
    "every-person": rows(PEOPLE),
    "pinned-notes": rows(NOTES.filter((n) => n.pinned)),
    "open-questions": rows(NOTES.filter((n) => n.kind === "question")),
    "decisions": rows(NOTES.filter((n) => n.kind === "decision")),
    "ideas": rows(NOTES.filter((n) => n.kind === "idea")),
  },
};

/**
 * ⚠️ WHAT A SHORTCUT SAYS, OUT OF THE MANIFEST — see `Has.named`. Without it
 * every `leads` in every declaration resolves to nothing and is DROPPED, which
 * is correct behaviour (a screen this person may not open has no shortcut) and
 * indistinguishable in a photograph from a row that was never declared. The
 * board went one sweep with a hero declaring three ways onward and drawing none.
 *
 * ⚠️ AND EVERY SCREEN IS NAMED HERE BECAUSE THE GROUND HOLDS EVERY GRANT. A
 * deployment answers `undefined` for one behind a permission the person lacks;
 * a proving ground that did the same would be one where the picture depends on
 * a grant nobody set.
 */
const namedIn = (screens: readonly { id: string; label: string; icon?: string }[]) =>
  (id: string) => {
    const one = screens.find((s) => s.id === id);
    return one ? { label: one.label, ...(one.icon ? { icon: one.icon } : {}) } : undefined;
  };
