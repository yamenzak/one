/**
 * TESSA'S THEME — `@4dl/app-kit`'s provider, finally given a branding.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 *
 * `main.tsx` mounted `<ThemeProvider branding={null}>`. Hardcoded. Everything
 * upstream of that line already worked: a centre sets its accent in Settings →
 * Look and feel, `settings-routes.ts` writes `tenant_settings.branding_json`
 * and invalidates the host cache, `resolveHost` re-reads it, and
 * `/api/context` ships it to the browser. The value arrived and was thrown
 * away, so the form saved, said "Saved", and changed nothing anywhere.
 *
 * That is worse than an unimplemented feature: an unimplemented feature has no
 * control, and this one has a control that appears to work. It is also the
 * quietest possible failure — every layer has a test, every layer passes, and
 * the defect lives in the one argument nobody asserts on.
 *
 * ── Why this file exists rather than a prop in `main.tsx` ───────────────────
 *
 * The branding comes from the SESSION, and `main.tsx` mounts the provider
 * outside any component that could call `useSession`. Kova solved this the same
 * way and this is deliberately its shape, minus the parts Tessa does not have
 * (no per-tenant default mode, no wordmark).
 *
 * ── The first frame ─────────────────────────────────────────────────────────
 *
 * The branding arrives over the network and the app paints before it does, so a
 * branded centre opened Tessa's green for a beat and then became itself. The
 * remembered brand below closes that for every visit after the first to a given
 * hostname. A first-ever visit cannot be branded by anything running in the
 * browser and is left alone rather than guessed at.
 */

import { useEffect, type ReactNode } from "react";
import { ThemeProvider as KitThemeProvider, readBootBrand, writeBootBrand } from "@4dl/app-kit";
import { applyBranding, configureTheme, type Branding } from "@4dl/ui";
import { storage, useSession } from "./session.js";

/*
  The names `@4dl/ui` writes into the document and local storage, bound at
  MODULE LOAD — the provider reads the stored mode in its initial state, so a
  `configureTheme` inside a component runs too late and every user sees the
  default once before their choice appears.
*/
configureTheme({ storageKey: "tessa-theme", styleId: "tessa-branding" });

/**
 * This hostname's brand as of the last visit — read AND applied at module load,
 * because `applyBranding` has to precede the first paint and a `useEffect` runs
 * after it.
 */
const bootBrand = typeof localStorage === "undefined" ? null : readBootBrand<Branding>(storage, location.hostname);
if (bootBrand?.branding) applyBranding(bootBrand.branding);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { ctx, host } = useSession();
  /*
    The signed-in centre's branding wins; before sign-in, the HOST's — so the
    sign-in screen is already the centre's colour rather than Tessa's. They are
    the same blob from the same column (`resolveHost` caches `branding_json`),
    reached by two different routes depending on whether there is a session yet.
  */
  const live = ((ctx?.branding ?? host?.tenant?.branding) ?? null) as Branding | null;

  // Remember what the server actually said. CLEARED on a door with no centre,
  // so a closed practice's colours do not outlive it on its old address.
  useEffect(() => {
    if (!host) return;
    writeBootBrand<Branding>(storage, host.tenant ? { host: location.hostname, name: host.tenant.name ?? null, branding: live } : null);
  }, [host, live]);

  return <KitThemeProvider branding={live}>{children}</KitThemeProvider>;
}

export { useTheme } from "@4dl/app-kit";
