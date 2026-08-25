/**
 * ⚠️ MOUNTED FOR REAL, BECAUSE THE TABLE IS LAZY. See `picking.seen.test.tsx`:
 * a server-rendered string holds the skeleton, and the chunk arrives only in a
 * document that runs.
 *
 * ⚠️ `data-ready` IS THE FIXTURE'S OWN SIGNAL AND NOT A TIMER. The suite waits
 * for the rows to exist rather than for a number of milliseconds — a wait that
 * is long enough on this machine is the fixture racing its own precondition
 * everywhere else.
 */

import * as React from "react";
import { createRoot } from "react-dom/client";
import { Listing, Screen, Stack, glyphOf } from "../../src/index.js";

interface Row { readonly id: string; readonly name: string }

const ROWS: readonly Row[] = [
  { id: "a", name: "Priya Raman" },
  { id: "b", name: "Tomas Novak" },
];

function Ready() {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    /* ⚠️ AFTER A FRAME, so the lazy chunk's own suspense has resolved into rows
       rather than into its fallback. */
    const id = requestAnimationFrame(() => { setOn(true); });
    return () => { cancelAnimationFrame(id); };
  }, []);
  return (
    <Screen shape="list">
      <Stack space="roomy">
        <div {...(on ? { "data-ready": "true" } : {})}>
          <Listing<Row>
            label="People"
            of={{ status: "ready", data: ROWS }}
            rowKey={(r) => r.id}
            asRow={(r) => ({ name: r.name })}
            cols={[{ id: "name", label: "Name", cell: (r) => r.name }]}
            /* ⚠️ THREE MARKED ITEMS, because one bare one is the shape that
               cannot show what a menu looks like. The width floor and the marks
               are both only visible against a real list. */
            acts={() => [
              { id: "open", label: "Open", icon: glyphOf("open"), onDo: () => undefined },
              { id: "rename", label: "Rename", icon: glyphOf("edit"), onDo: () => undefined },
              { id: "x", label: "Remove", icon: glyphOf("remove"), tone: "danger" as const, onDo: () => undefined },
            ]}
            chosen={["a"]}
            onChoose={() => undefined}
            bulk={[{ id: "rm", label: "Remove", onDo: () => undefined }]}
          />
        </div>
      </Stack>
    </Screen>
  );
}

createRoot(document.getElementById("root")!).render(<Ready />);
