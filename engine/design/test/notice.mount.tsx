/**
 * ⚠️ THE TOAST, MOUNTED, BECAUSE IT DOES NOT EXIST UNTIL SOMETHING CALLS FOR IT.
 * `notice.ok` puts a row on a queue and the host renders it through a portal, so
 * `renderToStaticMarkup` answers with an empty host and every assertion about
 * what was drawn passes over nothing. What is being proved here is a seam into a
 * library — that a confirmation's ONE control is rendered, reachable and calls
 * back — which is exactly the class of claim a type definition cannot settle.
 */
import { createRoot } from "react-dom/client";
import { Button } from "@heroui/react";
import { NoticeHost, notice } from "../src/frame/overlay.js";

/* ⚠️ A PRESS RATHER THAN A CALL ON LOAD. React 19 mounts the host in an effect,
   and a toast queued before it exists is a toast nothing draws. */
function Board() {
  return (
    <>
      <NoticeHost />
      <Button onPress={() => notice.ok("Took 40 from A3 — flammables", {
        says: "Undo",
        /* ⚠️ THE TITLE, BECAUSE IT SURVIVES THE TOAST BEING DISMISSED. A flag on
           the page is what the press has to be read back from. */
        run: () => { document.title = "undone"; },
      })}
      >
        Take it
      </Button>
      <Button onPress={() => notice.ok("Corrected.")}>Correct it</Button>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Board />);
