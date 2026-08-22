/**
 * A PAGE INSIDE A SCROLLER WHOSE OVERFLOW ARRIVES LATE, FROM SOMETHING THE PAGE
 * CANNOT SEE.
 *
 * ⚠️ THIS IS THE SHAPE OF A DIALOG OPENING. `scrolling.ts` resolves what scrolls
 * by walking up for an ancestor that is ALREADY overflowing, and re-resolves when
 * the page's own box or the document changes size. Both of those are things the
 * PAGE does. What a dialog does is change its own body's height while the page
 * inside it stays exactly as it was — so if the walk came up empty at mount, and
 * a frame later, nothing ever asks again and every reading falls back to the
 * window, which inside a dialog never moves at all.
 *
 * ⚠️ SO THE SIBLING IS THE POINT. The tall content is a sibling of the page,
 * inside the same scroller: the container overflows, the page's own box never
 * changes, and no observer the frame holds can fire. A fixture that grows the
 * page's own content instead recovers by accident and reports green.
 */

import * as React from "react";
import { createRoot } from "react-dom/client";
import { Page } from "../src/frame/page.js";
import { PageCrown } from "../src/frame/crown.js";

function Late() {
  const [tall, setTall] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setTall(true), 200);
    return () => clearTimeout(t);
  }, []);
  return <div style={{ height: tall ? "300vh" : "0" }} />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <div id="scroller" style={{ height: "100vh", overflowY: "auto" }}>
    <Page sky="glow">
      <PageCrown title="Acme Corp" back={() => undefined} also={[]} />
    </Page>
    <Late />
  </div>,
);
