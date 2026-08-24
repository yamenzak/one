/**
 * ONEINVENTORY IN THE CHROME A PERSON ACTUALLY SEES IT THROUGH.
 *
 * ⚠️ A SCREEN ON ITS OWN LEAVES OUT THE HALF A PRODUCT CANNOT OPT OUT OF.
 * `Shell` picks the world and `Page` mounts it: the scene, the grain, the
 * vignette, the hem, the nav, the crown and the room reserved for the island. A
 * photograph of the screen alone is a photograph of a component; a screen that
 * fits at 390 by itself can still be pushed sideways by what surrounds it.
 *
 * ⚠️ EVERYTHING IS HELD AND EVERY FEATURE IS SOLD, BECAUSE THE GROUND EXISTS TO
 * REACH EVERY SCREEN. What a permission hides and what a plan withholds are both
 * real behaviour with their own tests — `reachable` and `publicFace` — and a
 * ground holding half the grants would be a ground where half the screens are
 * unreachable and nothing says which.
 *
 * ⚠️ AND IT IS THE SAME `Shell` CALL THE DEPLOYMENT MAKES. An app that brought
 * its own chrome would be an app that could get it wrong.
 */

import * as React from "react";
import { Shell, whoFace } from "@engine/design";
import { INVENTORY } from "../index.js";
import { InventoryScreen, InventorySurface } from "./index.js";

/** ⚠️ Every permission a screen names, so none of them is undrawable here. */
const EVERYTHING = new Set([
  "product:read", "product:write", "location:read", "location:write",
  "stock:read", "stock:move", "stock:adjust", "ledger:read",
  "process:read", "process:write",
]);

/**
 * ⚠️ EVERY GATED SCREEN'S KEY, ON. `/work`, `/run`, `/case` and `/import` are
 * gated on what the plan includes, and a ground on the floor tier could not draw
 * four of nineteen screens.
 */
const SOLD = ["processes", "jobs", "imports"];

export function InventoryGround({ route, onGo }: {
  readonly route: string;
  /** ⚠️ Absent on the ground, where there is no router to go anywhere with. */
  readonly onGo?: (route: string) => void;
}) {
  const go = onGo ?? (() => undefined);
  const screens = (INVENTORY.screens ?? []).filter(
    (s) => !s.features?.length || s.features.some((f) => SOLD.includes(f)));

  return (
    <Shell
      screens={screens}
      /* ⚠️ THE MANIFEST'S, NOT A LITERAL. A specimen board that named its own
         colour would photograph a product nobody ships. */
      hue={INVENTORY.hue}
      here={route}
      held={EVERYTHING}
      kind="commercial"
      crown={{
        appId: INVENTORY.id,
        appName: INVENTORY.name,
        appMark: INVENTORY.mark,
        tenantName: "Harbour Works",
        unread: 3,
        personEmail: "sam@harbourworks.example",
        personFace: whoFace("harbour"),
      }}
      onGo={go}
    >
      {/*
        ⚠️ A SURFACE IS ASKED FOR THROUGH THE SAME STRING A ROUTE IS, and the
        prefix is what keeps it one parameter. The harness passes one route down
        a chain four deep — page, mount, ground, screen — and a second argument
        for "or a sheet" would have to be threaded through every one of them and
        defaulted at each, which is four places to forget it.

        ⚠️ AND THE SCREEN BEHIND IT IS HOME, BECAUSE A SHEET IS OVER SOMETHING.
        Measured against a blank page a drawer has no scrim to be legible over
        and no page under it to push sideways — which is not the thing that
        ships.
      */}
      <InventoryScreen route={route.startsWith("surface:") ? "/" : route} onGo={go} />
      {route.startsWith("surface:")
        ? <InventorySurface id={route.slice("surface:".length)} />
        : null}
    </Shell>
  );
}
