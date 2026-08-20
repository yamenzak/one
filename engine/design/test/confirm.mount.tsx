/**
 * ⚠️ THE SHIPPED `Confirm`, MOUNTED, BECAUSE ITS SHAPE IS ONLY DECIDED WHEN IT
 * OPENS. Rendered to a string it is a trigger and nothing else — the sheet, its
 * role and the order of its buttons all arrive from the library at open time, so
 * a static assertion would pass every version of this, including the centred
 * dialogue it replaced.
 */
import { createRoot } from "react-dom/client";
import { Button } from "@heroui/react";
import { Confirm } from "../src/frame/overlay.js";

createRoot(document.getElementById("root")!).render(
  <Confirm
    trigger={<Button slot="trigger">Open it</Button>}
    title="Delete everything?"
    act={{ label: "Delete", onDo: () => { document.title = "did"; } }}
  >
    What goes, and what does not.
  </Confirm>,
);
