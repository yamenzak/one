/**
 * WHAT A SCREEN MAY DECLARE — the index of registered blocks.
 *
 * ⚠️ THIS FILE IS THE SEAM AND NOT THE ANSWER. The index is GENERATED from the
 * design package's own components, refusing rather than skipping, the same way
 * the module inventory and the guard ledger are: a hand-kept list of what can be
 * declared is a list missing whatever was added last, and the failure it
 * produces is a manifest refused for naming a component that plainly exists.
 *
 * ⚠️ AND IT IS IN THE KERNEL DESPITE BEING ABOUT COMPONENTS, because the kernel
 * is where a manifest is refused. `defineApp` is the last cheap place a screen
 * naming a block that is not there can be caught; after it, the cost is a blank
 * region on a page in production.
 *
 * DEFER(engine-91) stage:91 — EMPTY, SO EVERY DECLARED BLOCK IS REFUSED. That is
 * the correct behaviour for a registry that does not exist yet: a screen may not
 * name what nothing registers, and an index that let unknown names through would
 * be worse than no index at all. Stage 91 generates it.
 *
 * Layer 3. Imports surface.
 */

import type { BlockIndex } from "./surface.js";

export const BLOCKS: BlockIndex = {};
