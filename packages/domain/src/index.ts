export * from "./entitlements.js";
export * from "./perms.js";
// The access-economy math moved to @4dl/commerce. `./budgets.js` binds Kova's
// scopes to it AND re-exports the rest, so this is the only line needed — adding
// `export * from "@4dl/commerce/model"` beside it makes `buildBudgetsForPurchase`
// ambiguous (two star exports offering one name). TypeScript tolerates that by
// silently dropping the name; esbuild refuses to bundle it, so the failure only
// appears at `vite build` — which is how the E2E suite found it and `pnpm
// typecheck` did not.
export * from "./budgets.js";
export * from "./clientFlags.js";
export * from "./lapse.js";
export * from "./nutrition.js";
export * from "./body.js";
export * from "./bodyfat.js";
export * from "./bodymodel.js";
export * from "./units.js";
export * from "./activity.js";
export * from "./workout.js";
export * from "./progress.js";
export * from "./wellness.js";
export * from "./notifications.js";
export * from "./features.js";
export * from "./audit.js";
export * from "./coaching.js";
export * from "./settings.js";
export * from "./attention.js";
