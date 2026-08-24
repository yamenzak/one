/**
 * THE NAV, WITH THREE, FOUR AND FIVE DESTINATIONS IN IT.
 *
 * ⚠️ THE COUNT IS NOT THE DESIGN'S TO ASSUME. Five is the ceiling, and a product
 * legitimately draws fewer: a destination whose feature the plan does not include
 * is withheld by the server, so the same product is a five-item bar on one plan
 * and a four-item bar on another. Rendered together, in one document, because
 * what is under test is that all three look like a bar somebody drew rather than
 * like one bar with items taken out of it.
 */
import { createRoot } from "react-dom/client";
import { House, Package, ClipboardList } from "lucide-react";
import { ScanMark, TallyMark } from "../src/parts/marks.js";
import { Island } from "../src/frame/chrome.js";
import { Page } from "../src/frame/page.js";

const ALL = [
  { id: "home", label: "Home", icon: <House />, route: "/" },
  { id: "stock", label: "Stock", icon: <Package />, route: "/stock" },
  { id: "scan", label: "Scan", icon: <ScanMark />, route: "/scan" },
  { id: "count", label: "Count", icon: <TallyMark />, route: "/count" },
  { id: "work", label: "Work", icon: <ClipboardList />, route: "/work" },
];

/* ⚠️ A REAL PRODUCT'S HUE, AND IT IS A COLOUR RATHER THAN AN OKLCH TRIPLE.
   `--brand` is consumed by `color-mix`, so a bare `0.79 0.16 68` makes the whole
   declaration invalid and the light under the active mark simply is not drawn —
   silently, with the rest of the bar correct. Written wrong here once. */
createRoot(document.getElementById("root") as HTMLElement).render(
  <Page hue="oklch(0.79 0.16 68)">
    <div style={{ display: "flex", flexDirection: "column" }}>
      {[5, 4, 3].map((n) => (
        <Island key={n} items={ALL.slice(0, n)} here="/" onGo={() => undefined} />
      ))}
    </div>
  </Page>,
);
