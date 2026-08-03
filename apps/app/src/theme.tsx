/**
 * Kova's theme — `@4dl/app-kit`'s provider, given Kova's branding.
 *
 * Two things are the app's and both are here:
 *
 *   the NAMES     what `@4dl/ui` writes into the document and local storage.
 *                 Bound at MODULE LOAD, before anything calls `resolveMode` —
 *                 the provider reads the stored mode in its initial state, so a
 *                 `configureTheme` inside a component would run too late and
 *                 every user would see the default once.
 *
 *                 `kova-theme` is load-bearing: it is the key a user's
 *                 light/dark choice survives sign-out in (session.tsx's
 *                 keep-list names it too), so changing it would silently reset
 *                 the preference for everyone.
 *
 *   the BRANDING  where it comes from. Signed-in tenant branding wins; before
 *                 sign-in on a custom domain, fall back to that domain's tenant
 *                 so the login screen is already branded. Only the app knows the
 *                 shape of its own context payload, which is why the kit takes
 *                 this as a prop.
 *
 * ── The first frame ─────────────────────────────────────────────────────────
 *
 * Both of those sources arrive over the network, and the app paints before
 * either does. So a white-labelled studio opened Kova's colours and Kova's mark
 * for a beat and then became itself — on the boot screen, which is the one
 * screen every single session begins with. The remembered brand below closes
 * that for every visit after the first to a given hostname (see `BRAND_CACHE`);
 * the first-ever visit still cannot be branded by anything running in the
 * browser, and is left honest rather than papered over — `BootSplash` shows a
 * neutral mark instead of the wrong one.
 */

import { useEffect, type ReactNode } from "react";
import { ThemeProvider as KitThemeProvider, readBootBrand, writeBootBrand } from "@4dl/app-kit";
import { applyBranding, configureTheme } from "@4dl/ui";
import type { Branding } from "@4dl/ui";
import { store, useSession } from "./session.js";

configureTheme({ storageKey: "kova-theme", styleId: "kova-branding" });

/**
 * This hostname's brand as of the last visit — read and APPLIED at module load.
 *
 * Both halves have to happen here rather than in an effect. The read has to
 * precede the first render so `resolveMode` sees the studio's default mode; the
 * `applyBranding` has to precede the first PAINT, and a `useEffect` runs after
 * it — which would put the flash back, one frame shorter.
 *
 * Exported because `BootSplash` needs the remembered NAME too, and there is
 * nowhere earlier to put it: the splash renders before the session has anything.
 */
export const bootBrand =
  typeof localStorage === "undefined" ? null : readBootBrand<Branding>(store, location.hostname);
if (bootBrand?.branding) applyBranding(bootBrand.branding);

export { useTheme } from "@4dl/app-kit";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { ctx, host } = useSession();
  const live = ((ctx?.branding ?? host?.tenant?.branding) ?? null) as Branding | null;
  const name = host?.tenant?.name ?? null;

  // Remember what the server actually said, once it has said it. Keyed on the
  // resolved host — and CLEARED on a door with no studio, so a closed studio's
  // colours do not outlive it on the address that used to serve it.
  useEffect(() => {
    if (!host) return;
    writeBootBrand<Branding>(store, host.tenant ? { host: location.hostname, name, branding: live } : null);
  }, [host, name, live]);

  return <KitThemeProvider branding={live ?? bootBrand?.branding ?? null}>{children}</KitThemeProvider>;
}
