/**
 * A PAGE PRESENTED OVER A PRODUCT, WHICH IS WHERE THE ACCOUNT CENTRE LIVES.
 *
 * ⚠️ THE REAL `Over`, BECAUSE BOTH FAULTS BELOW ARE THE DIALOG'S. What a page
 * inherits and where its top edge lands are decided by the library's own body,
 * so a hand-made stand-in agrees with whatever the frame happens to do.
 */

import * as React from "react";
import { createRoot } from "react-dom/client";
import { Page } from "../src/frame/page.js";
import { PageCrown } from "../src/frame/crown.js";
import { Over } from "../src/frame/overlay.js";

function Presented() {
  const [open, setOpen] = React.useState(true);
  return (
    <Page sky="glow">
      <div style={{ minHeight: "150vh" }} />
      <Over open={open} onClose={() => setOpen(false)} label="Account">
        <Page sky="glow">
          <PageCrown title="Acme Corp" under={<>Hello · Inventory · Owner</>}
            back={() => undefined} also={[]} />
          <div style={{ minHeight: "260vh" }} />
        </Page>
      </Over>
    </Page>
  );
}
createRoot(document.getElementById("root") as HTMLElement).render(<Presented />);
