/**
 * Scena's theme — `@4dl/app-kit`'s provider, given Scena's brand applier.
 *
 * ── What this file used to be ───────────────────────────────────────────────
 *
 * ~110 lines: its own `localStorage` read, its own `matchMedia` listener, its own
 * attribute write, its own `useForcedDark`. All of it existed to add ONE thing
 * the platform did not have — a third mode state, "follow the system" — and
 * having it meant Scena could not mount `ThemeProvider` at all, so it also went
 * without the browser-chrome white-labelling, the theme-color meta and the
 * branding preview that provider carries.
 *
 * The platform has all three states now (`ThemeChoice` in `@4dl/ui`), so this is
 * a binding. Two things are still the app's, and both are here:
 *
 *   the NAMES     what `@4dl/ui` writes into the document and local storage,
 *                 plus what "never chosen" means for this product. Bound at
 *                 MODULE LOAD, before anything reads the stored choice.
 *
 *   the APPLIER   `applyBrandTheme`, not the shared `applyBranding`. Scena emits
 *                 a second style element (`--font-sans` and the `--w-*` widget
 *                 block a television reads) and `applyBranding` rewrites its own
 *                 element wholesale on every preview keystroke, so the two
 *                 cannot share one. `ThemeProvider`'s `applyBrand` seam exists
 *                 for exactly this.
 *
 * ⚠️ `defaultChoice: "system"` PRESERVES Scena's behaviour. Kova and Tessa fall
 * back to dark; Scena has always followed the OS when nobody had chosen. Picking
 * one answer for the whole platform would have silently reskinned a live product
 * on upgrade, which is worse than carrying a parameter.
 */

import { type ReactNode } from "react";
import { ThemeProvider as KitThemeProvider } from "@4dl/app-kit";
import { configureTheme, initMode, type Branding } from "@4dl/ui";
import { applyBrandTheme } from "./brand-theme.js";

/**
 * Where a person's light/dark/system choice lives.
 *
 * Load-bearing: it is the one thing a preference survives a sign-out in, so
 * renaming it after launch resets every device. `brand-theme.ts` imports it
 * rather than restating it, so `@4dl/ui` cannot end up configured with a
 * different one.
 */
export const THEME_STORAGE_KEY = "scena.theme";

configureTheme({ storageKey: THEME_STORAGE_KEY, styleId: "scena-brand", defaultChoice: "system" });

/**
 * Paint the stored choice before the first frame.
 *
 * Not optional for this app the way it is for a dark-defaulting one: under
 * `"system"` on a light OS, the provider's effect runs AFTER the first paint, so
 * without this every cold start flashes the dark palette for a frame. `main.tsx`
 * calls it at module load.
 */
export { initMode as initTheme };

export { useTheme, useForcedDark } from "@4dl/app-kit";

export function ThemeProvider({ branding, children }: { branding: Branding | null; children: ReactNode }) {
  return (
    <KitThemeProvider branding={branding} applyBrand={applyBrandTheme as (b: Branding | null) => void}>
      {children}
    </KitThemeProvider>
  );
}
