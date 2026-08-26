/**
 * THE BLOCKS A STEP MAY BE, AS COMPONENTS — the other half of `ASKS`.
 *
 * ⚠️ THE KERNEL HOLDS WHAT THEY ARE AND THIS HOLDS WHAT THEY DRAW, exactly as
 * `BLOCKS` and `PARTS` split for a body. The registry is the checkable half: an
 * id, its skeleton, and which of the write's inputs it answers. This is the half
 * that cannot live in the kernel, because the kernel draws nothing.
 *
 * ⚠️ AND EVERY ONE IS LAZY, WHICH IS THE WHOLE REASON THIS FILE EXISTS RATHER
 * THAN AN IMPORT IN EACH PRODUCT. What belongs here is what a FIELD cannot be —
 * a camera, a viewfinder, a packing editor — which is to say the heaviest things
 * in the product. Imported eagerly they would be in the module graph of every
 * screen that can draw a flow; imported per app they would be a line in each
 * product, and a line in each product is where the hand-written screen starts
 * growing back.
 *
 * ⚠️ ONE ENTRY, AND THAT IS THE HONEST STATE OF IT. The photo strip is what the
 * create flow was designed around. A registry seeded with five speculative
 * entries would be five claims no screen has made good; they arrive as products
 * need them, and `ASKS` refuses a step naming one that is not here.
 */

import * as React from "react";
import { Skeleton } from "@heroui/react";
import { SPACE } from "../tokens/metrics.js";
import type { Asking } from "./create.js";

/** ⚠️ What every asking block takes, and the only prop any of them may. */
export type AskingBlock = React.ComponentType<{ readonly asking: Asking }>;

const Strip = React.lazy(() =>
  import("../parts/shots.js").then((m) => ({ default: m.Shots })));

/**
 * ⚠️ THE SHAPE OF WHAT IS COMING, NOT A SPINNER — see `Bones`. The entry says
 * `tiles`, so what stands in for it while its code arrives is a row of tiles: a
 * step that occupies no room until its chunk lands makes the dock jump under
 * somebody's thumb.
 */
const Arriving = () => (
  <div className={`flex ${SPACE.tight}`} role="status" aria-label="Loading">
    {[0, 1, 2].map((n) => <Skeleton key={n} className="size-20 rounded-xl" />)}
  </div>
);

/**
 * ⚠️ THE STRIP IS THE BLOCK AND THE FLOW IS WHAT IT ANSWERS INTO. `Shots` itself
 * knows nothing about steps, fills or reviews — it holds pictures and hands them
 * back — so it stays usable by a screen that is not a flow at all.
 */
const ShotsStep: AskingBlock = ({ asking }) => {
  /* ⚠️ WHAT IS HELD MAY BE ANYTHING, because a flow's answers are whatever the
     write's input types allow and `shots` is `json`. A cast would draw a strip
     over a string and throw inside `map`. */
  const held = Array.isArray(asking.held["shots"])
    ? (asking.held["shots"] as readonly string[])
    : [];
  return (
    <React.Suspense fallback={<Arriving />}>
      <Strip
        held={held}
        onSet={(shots) => { asking.onAnswer({ shots }); }}
      />
    </React.Suspense>
  );
};

export const ASKING: Readonly<Record<string, AskingBlock>> = {
  Shots: ShotsStep,
};
