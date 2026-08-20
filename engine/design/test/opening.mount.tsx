/**
 * ⚠️ THE ENTRY THE HARNESS BUNDLES, AND IT IS A REAL FILE ON PURPOSE. A virtual
 * module would be one plugin's worth of cleverness for a page that has to be
 * readable when the test it serves goes red — and rollup will not take one as a
 * library entry anyway.
 *
 * ⚠️ IT MOUNTS THE SHIPPED COMPONENT, not a copy of it. Everything the browser
 * then does — the hold, the fade, the swap, the reduced-motion stand-down — is
 * the product's own code answering the product's own timers.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import { Opening } from "../src/parts/opening.js";

const lines = JSON.parse(document.getElementById("lines")!.textContent ?? "[]");
createRoot(document.getElementById("root")!).render(<Opening says={lines} />);
