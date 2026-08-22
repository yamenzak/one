/**
 * ⚠️ A REAL ROOT, BECAUSE A MODAL IS A PORTAL. React Aria mounts the dialog into
 * a layer outside the tree, so `renderToStaticMarkup` produces nothing at all —
 * which reads as "the content was not rendered" rather than as "this cannot be
 * tested that way". The one thing the surface has to do is scroll, and only a
 * mounted, laid-out browser can answer that.
 */

import { createRoot } from "react-dom/client";
import { Over } from "../../src/frame/overlay.js";
import { Band, Page } from "../../src/frame/page.js";

createRoot(document.getElementById("root") as HTMLElement).render(
  <Over open onClose={() => undefined} label="Account and workspaces">
    <Page sky="plain">
      <Band width="read">
        <div>
          {/* ⚠️ AN INLINE HEIGHT, NOT A UTILITY CLASS. The harness's stylesheet is
              built from the package's own source, so a class used only in a test
              fixture is never emitted — and the rows came out 19px each, which
              made a working scroller look like a broken one. */}
          {Array.from({ length: 40 }, (_, i) => (
            <p key={i} style={{ height: 64 }}>Row {i + 1}</p>
          ))}
        </div>
      </Band>
    </Page>
  </Over>,
);
