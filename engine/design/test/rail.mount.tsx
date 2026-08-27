/**
 * THE DESKTOP RAIL, WITH THE MOST DESTINATIONS A PRODUCT MAY HAVE.
 *
 * ⚠️ IT IS `Shell` RATHER THAN `Island`, AND THAT IS THE WHOLE REASON THIS
 * FIXTURE EXISTS BESIDE `bar.mount`. The bar at the foot of a phone is a
 * COMPONENT; the rail is markup inside the shell, built there because it is the
 * same five destinations in the same grammar at another width — so a fixture
 * that drew an `Island` in a column would be checking a shape the product does
 * not ship.
 *
 * ⚠️ FIVE, BECAUSE THE FAULT IS ABOUT THE PLATE'S PROPORTIONS. A pill is a pill
 * only while the box is wide, and the rail's box grows with the destination
 * count — so the tallest legal rail is the one where a radius meant for a
 * horizontal capsule does the most damage.
 */

import { createRoot } from "react-dom/client";
import { Shell } from "../src/frame/shell.js";
import type { ScreenSpec } from "@engine/kernel";

const SCREENS = [
  { id: "stock", route: "/", label: "Stock", nav: "primary", icon: "box", permission: "a:read" },
  { id: "reports", route: "/reports", label: "Reports", nav: "primary", icon: "chart",
    permission: "a:read" },
  { id: "products", route: "/products", label: "Products", nav: "primary", icon: "tag",
    permission: "a:read" },
  { id: "places", route: "/places", label: "Places", nav: "primary", icon: "workspace",
    permission: "a:read" },
  { id: "people", route: "/people", label: "People", nav: "primary", icon: "person",
    permission: "a:read" },
] as unknown as ScreenSpec[];

createRoot(document.getElementById("root") as HTMLElement).render(
  <Shell
    screens={SCREENS}
    hue="oklch(0.79 0.16 68)"
    here="/"
    held={new Set(["a:read"])}
    kind="commercial"
    crown={{
      appId: "probe", appName: "Probe", appMark: "◆",
      tenantName: "Harbour Works", unread: 0,
      personEmail: "sam@harbourworks.example",
    }}
    onGo={() => undefined}
  >
    <div style={{ height: "1200px" }} />
  </Shell>,
);
