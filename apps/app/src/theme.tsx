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
 */

import type { ReactNode } from "react";
import { ThemeProvider as KitThemeProvider } from "@4dl/app-kit";
import { configureTheme } from "@4dl/ui";
import type { Branding } from "@4dl/ui";
import { useSession } from "./session.js";

configureTheme({ storageKey: "kova-theme", styleId: "kova-branding" });

export { useTheme } from "@4dl/app-kit";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { ctx, host } = useSession();
  const branding = ((ctx?.branding ?? host?.tenant?.branding) ?? null) as Branding | null;
  return <KitThemeProvider branding={branding}>{children}</KitThemeProvider>;
}
