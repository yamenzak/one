/**
 * ⚠️ THE ENTRY THE HARNESS BUNDLES, AND IT IS A REAL FILE ON PURPOSE. A virtual
 * module would be one plugin's worth of cleverness for a page that has to be
 * readable when the sweep it serves goes wrong — and rollup will not take one as
 * a library entry anyway.
 */
import { createRoot } from "react-dom/client";
import { Board } from "./board.js";

declare global { interface Window { __ROUTE?: string } }

createRoot(document.getElementById("root") as HTMLElement)
  .render(<Board route={window.__ROUTE ?? "/"} />);
