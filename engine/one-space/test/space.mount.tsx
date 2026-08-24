/**
 * THE SPACE ITSELF, MOUNTED — the console and the account centre.
 *
 * ⚠️ THE FRAME SWEEP BESIDE THIS MEASURES THE GROUND'S TEN ROUTES, and the
 * ground is a PRODUCT. So what it proves is that the chrome a product wears is
 * sound, and it says nothing at all about the thirty-nine screens the space
 * draws itself: twenty in the operator console, nineteen in the account centre.
 * They are the surfaces with the most controls per page in this deployment and
 * nothing had ever measured one.
 *
 * ⚠️ IT MOUNTS `OneSpace` BY PATH, WHICH IS WHAT THE DEPLOYMENT MOUNTS. The
 * dispatcher inside it is not exported, and reaching for it would be a second
 * answer to which screen an address means — the exact seam `parseStop` exists to
 * be the only one of.
 *
 * ⚠️ AND WHAT IS MEASURED IS THE SCREEN AS IT ARRIVES, WHICH IS ITS WAITING
 * STATE. There is no worker here, so every read is outstanding and every screen
 * draws the skeleton it declared. That is a real screen — it is what an operator
 * sees on every cold open of every one of these, on a phone, on a slow
 * connection — and it is the one this deployment has photographs of and no
 * measurements of. What it is NOT is the populated screen: overflow from a long
 * value, a table that will not fit, a row of eleven chips. Those need a stubbed
 * door, and the honest thing is to say so here rather than to let a green sweep
 * read as coverage of both.
 */

import { createRoot } from "react-dom/client";
import { OneSpace } from "../src/space/OneSpace.js";

declare global {
  interface Window { __ROUTE?: string }
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <OneSpace
    path={window.__ROUTE ?? "/"}
    onGo={() => undefined}
    onClose={() => undefined}
  />,
);
