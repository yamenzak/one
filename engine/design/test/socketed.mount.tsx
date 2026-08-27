/**
 * A SUB-PAGE INSIDE THE SHELL — the composition a customer actually gets.
 *
 * ⚠️ IT IS A SECOND MOUNT BECAUSE IT IS A SECOND CODE PATH, AND THAT IS THE
 * WHOLE POINT OF IT. `handover.mount.tsx` drives `PageCrown`, which draws the
 * name and the row in one component and measures the crossing between them.
 * Nothing a product ships goes through that: inside a `Shell` the row is the
 * shell's, the name is the screen's, and the answer travels back up through the
 * crown socket. Same rule, three files, and a harness that only ever exercised
 * the easy one would report the hand-off working while every screen in every
 * product lost its name.
 *
 * ⚠️ AND `nav: "none"` IS WHAT MAKES IT A SUB-PAGE. A destination has no way out,
 * so the shell's crown keeps the account and never takes a page name; the
 * geometry this measures does not exist on one.
 */

import { createRoot } from "react-dom/client";
import { Shell } from "../src/frame/shell.js";
import { Screen } from "../src/frame/screen.js";
import { Group, NoteRow } from "../src/parts/surfaces.js";

const SCREENS = [
  { id: "stock", route: "/", label: "Stock", nav: "primary" as const, permission: "note:read" },
  { id: "thing", route: "/thing", label: "Product", nav: "none" as const, permission: "note:read" },
];

createRoot(document.getElementById("root") as HTMLElement).render(
  <Shell
    screens={SCREENS}
    here="/thing/p-1"
    held={new Set(["note:read"])}
    onGo={() => undefined}
    crown={{
      appId: "inventory", appName: "OneInventory", appMark: "◇", tenantName: "Acme Corp",
    }}
  >
    {/* ⚠️ THE RECORD'S OWN NAME, WHICH IS WHAT THE DOOR NOW SENDS — see
        `Drawn.name`. Titled by the collection's word instead, this fixture would
        measure the hand-off of a heading that says "Product", which is the
        heading this whole change exists to replace. */}
    <Screen shape="detail" title="Casting resin, clear" under="Product" back={() => undefined}>
      {/* ⚠️ LONG ENOUGH TO SCROLL PAST ITS OWN HEADING, or there is no crossing
          to measure and the harness agrees with any rule at all. */}
      <Group label="Facts">
        <NoteRow>Two and a half litres, on the cold room shelf.</NoteRow>
      </Group>
      <div style={{ minHeight: "220vh" }} />
    </Screen>
  </Shell>,
);
