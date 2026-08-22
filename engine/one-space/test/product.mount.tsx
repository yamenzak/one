/**
 * THE COMPOSITION THE DEPLOYMENT MOUNTS, IN A BROWSER.
 *
 * ⚠️ EVERY OTHER HARNESS MOUNTS A GROUND, AND A GROUND IS NOT WHAT SHIPS.
 * `Ground` and every app's own hand `Shell` the manifest's screens unrewritten
 * and the app's own route, so they are internally consistent and never touch the
 * workspace's addressing. The deployment rewrites every screen into `/<app>/…`
 * and has to hand the shell an address in that same space — and when it did not,
 * the shell could not find the screen it was DRAWING, so the page had no title,
 * no nav row, no foot and no sky. Every suite stayed green.
 *
 * ⚠️ THROUGH `shellAt`, WHICH IS THE FUNCTION THE SURFACE USES. Rebuilding the
 * pair here would be the second implementation that was already being tested.
 *
 * ⚠️ AND THE CHILD IS INERT ON PURPOSE. The world is the FRAME's — the shell
 * chooses it and `Page` mounts it, both above whatever a screen draws — so
 * fixturing a product's collections would test the screen and make this suite a
 * second, staler copy of that product's data.
 */

import { createRoot } from "react-dom/client";
import { Shell } from "@engine/design";
import { INVENTORY } from "@engine/inventory";
import { shellAt } from "../src/centre/route.js";

declare global {
  interface Window { __ROUTE?: string }
}

const path = window.__ROUTE ?? "/";
/* ⚠️ The same parse the surface runs, for the same reason: the bare root is the
   address a person with one product lands on, and it is not any screen's route. */
const route = path === `/${INVENTORY.id}` || path === "/"
  ? "/" : path.replace(new RegExp(`^/${INVENTORY.id}`), "");
const { screens, here } = shellAt(
  { kind: "app", app: INVENTORY.id, route }, INVENTORY.screens ?? []);

createRoot(document.getElementById("root") as HTMLElement).render(
  <Shell
    screens={screens}
    hue={INVENTORY.hue}
    here={here}
    held={new Set((INVENTORY.screens ?? [])
      .map((s) => s.permission).filter((p): p is string => !!p))}
    kind="commercial"
    crown={{
      appId: INVENTORY.id, appName: INVENTORY.name, appMark: INVENTORY.mark,
      tenantName: "Harbourside", apps: [], personEmail: "seen@harbour.example",
    }}
    onGo={() => undefined}
  >
    <div style={{ minHeight: "150vh" }} />
  </Shell>,
);
