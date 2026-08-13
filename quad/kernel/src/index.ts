/**
 * @quad/kernel — the contract layer.
 *
 * ⚠️ PURE. No I/O, no bindings, no React, no imports of ours. Everything here is
 * provable with no fixture at all, which is why the rules live here rather than
 * beside the code that happens to need them first.
 *
 * ⚠️ AND IT CARRIES NO PRODUCT VOCABULARY. A shared layer that knows what a
 * client, a workout or a screen-in-a-shop-window is has stopped being shared —
 * the vocabulary guard refuses those nouns here.
 */

export * from "./tenancy.js";
