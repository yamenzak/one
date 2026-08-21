/**
 * ⚠️ THE ENTRY THE HARNESS BUNDLES, AND IT IS A REAL FILE ON PURPOSE. A virtual
 * module would be one plugin's worth of cleverness for a page that has to be
 * readable when the sweep it serves goes red — and rollup will not take one as a
 * library entry anyway.
 *
 * ⚠️ IT MOUNTS `Ground`, WHICH IS WHAT THE DEPLOYMENT MOUNTS. Rendered to a
 * string instead, the shell's crown never receives what a sub-page publishes
 * into it from a layout effect — so the one bar that is on every screen is
 * measured on none of them.
 */

import { createRoot } from "react-dom/client";
import { Ground } from "../src/Ground.js";

declare global {
  interface Window { __ROUTE?: string }
}

createRoot(document.getElementById("root") as HTMLElement)
  .render(<Ground route={window.__ROUTE ?? "/"} />);
