/**
 * @engine/kernel — the contract layer.
 *
 * ⚠️ PURE. No I/O, no bindings, no React, no imports of ours. Everything here is
 * provable with no fixture at all, which is why the rules live here rather than
 * beside whichever code happened to need them first.
 *
 * ⚠️ AND IT CARRIES NO PRODUCT VOCABULARY. A shared layer that knows what a
 * client, a workout or a coach is has stopped being shared — the vocabulary
 * guard refuses those nouns here.
 */

export * from "./primitives.js";
export * from "./present.js";
export * from "./problem.js";
export * from "./door.js";
export * from "./field.js";
export * from "./collection.js";
export * from "./operation.js";
export * from "./access.js";
export * from "./reach.js";
export * from "./package.js";
export * from "./entitlement.js";
export * from "./gate.js";
export * from "./dunning.js";
export * from "./tenancy.js";
export * from "./infra.js";
export * from "./signin.js";
export * from "./tone.js";

export * from "./surface.js";
export * from "./blocks.js";

export * from "./notify.js";
export * from "./setting.js";
export * from "./flag.js";
export * from "./vault.js";
export * from "./legal.js";
export * from "./job.js";
export * from "./credit.js";
export * from "./brand.js";
export * from "./mark.js";
export * from "./guide.js";
export * from "./ai.js";
export * from "./mcp.js";

/* ⚠️ Last, and that is not alphabetical: the manifest is what composes every
   declaration above into one app, so it imports all of them. */
export * from "./manifest.js";
