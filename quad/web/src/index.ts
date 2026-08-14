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

export * from "./theme.js";
export * from "./ambience.js";
export * from "./surfaces.js";
export * from "./state.js";
export * from "./appearance.js";
export * from "./motion.js";
export * from "./type.js";
export * from "./ground.js";
export * from "./chart/index.js";
export * from "./layout.js";
export * from "./field.js";
export * from "./settings.js";
export * from "./policy.js";
export * from "./shell.js";
export * from "./console.js";
export * from "./guide.js";
export * from "./money.js";
export * from "./inbox.js";
export * from "./ai.js";
export * from "./vault.js";
export * from "./legal.js";
