/**
 * @quad/web — the browser half.
 *
 * ⚠️ ROUTER-FREE, ON PURPOSE. A shared shell that imported a router would make
 * every app take that dependency and that version; `onGo` hands the route back
 * and the app decides what a route means.
 *
 * ⚠️ AND NOTHING HERE IS RESTYLED (D7). Consistency comes from using HeroUI as
 * it ships and theming it through tokens — not from every screen making its own
 * choices carefully.
 */

export * from "./tokens/theme.js";
export * from "./tokens/ambience.js";
export * from "./parts/face.js";
export * from "./parts/surfaces.js";
export * from "./parts/state.js";
export * from "./frame/screen.js";
export * from "./parts/tally.js";
export * from "./tokens/appearance.js";
export * from "./tokens/motion.js";
export * from "./tokens/type.js";
export * from "./tokens/ground.js";
export * from "./chart/index.js";
export * from "./frame/layout.js";
export * from "./frame/arrival.js";
export * from "./rendered/field.js";
export * from "./parts/forms.js";
export * from "./parts/listing.js";
export * from "./frame/overlay.js";
export * from "./parts/blocks.js";
export * from "./rendered/settings.js";
export * from "./rendered/policy.js";
export * from "./frame/shell.js";
export * from "./rendered/console.js";
export * from "./rendered/guide.js";
export * from "./rendered/money.js";
export * from "./rendered/inbox.js";
export * from "./rendered/ai.js";
export * from "./rendered/vault.js";
export * from "./rendered/legal.js";
