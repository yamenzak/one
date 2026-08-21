/**
 * ⚠️ THE ENTRY THE HARNESS BUNDLES, AND IT IS A REAL FILE ON PURPOSE. A virtual
 * module would be one plugin's worth of cleverness for a page that has to be
 * readable when the sweep it serves goes wrong — and rollup will not take one as
 * a library entry anyway.
 *
 * ⚠️ IT MOUNTS THE SHIPPED SCREEN, not a copy of it. Everything the browser then
 * does is the product's own code: the crown socket a sub-page publishes into,
 * the shape it recalls, the scroll listener the hem is driven by. Rendered to a
 * string instead, none of those exist — and the six screens somebody navigates
 * INTO photograph with nothing saying where they are.
 *
 * ⚠️ THE ROUTE ARRIVES ON `window`, WRITTEN INTO THE PAGE ABOVE THIS SCRIPT.
 * One bundle, nineteen screens: rebuilding per route would be nineteen vite
 * builds per sweep for a module that does not change.
 */

import { createRoot } from "react-dom/client";
import { InventoryGround } from "../src/screens/ground.js";

declare global {
  interface Window { __ROUTE?: string }
}

createRoot(document.getElementById("root") as HTMLElement)
  .render(<InventoryGround route={window.__ROUTE ?? "/"} />);
