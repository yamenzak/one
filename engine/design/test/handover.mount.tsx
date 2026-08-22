/**
 * A TITLE CARD WITH A SUBJECT, MOUNTED AND SCROLLABLE.
 *
 * ⚠️ IT HAS TO BE A REAL HERO, BECAUSE THE FAULT LIVES IN THE GEOMETRY OF ONE.
 * A subject's name is CENTRED in a card as tall as the picture behind it, and a
 * line under the name and the card's own bottom padding sit below it — so the
 * name's block clears the crown long after the name does. Fixtured without a
 * face, every one of those distances collapses to nothing and the harness agrees
 * with any rule at all.
 */

import { createRoot } from "react-dom/client";
import { Page } from "../src/frame/page.js";
import { PageCrown } from "../src/frame/crown.js";

createRoot(document.getElementById("root") as HTMLElement).render(
  <Page sky="glow">
    <PageCrown
      title="Acme Corp"
      face={{ kind: "workspace", seed: "acme-corp" }}
      /* ⚠️ The line under the name is the half that made the block outlast it. */
      under={<span>Hello · Inventory · Owner</span>}
      back={() => undefined}
      also={[]}
    />
    <div style={{ minHeight: "220vh" }} />
  </Page>,
);
