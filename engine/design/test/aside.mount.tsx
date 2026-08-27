/**
 * ⚠️ THE SHIPPED `PutAside`, MOUNTED, BECAUSE ITS QUESTION CHANGES IN PLACE.
 * Rendered to a string it is a trigger and nothing else — and the thing worth
 * checking is the one that has no static form at all: pressing "Keep it, but out
 * of the way" replaces the title, the sentences and the button without closing
 * anything, and a string render sees none of the three.
 */
import { createRoot } from "react-dom/client";
import { Button, Drawer } from "@heroui/react";
import { PutAside } from "../src/parts/aside.js";

createRoot(document.getElementById("root")!).render(
  <PutAside
    trigger={<Drawer.Trigger><Button>Delete</Button></Drawer.Trigger>}
    name="Casting resin, clear"
    of="product"
    onBin={() => { document.title = "binned"; }}
    onFreeze={() => { document.title = "frozen"; }}
  />,
);
