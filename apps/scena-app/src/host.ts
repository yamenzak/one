/**
 * WHICH DOOR IS THIS?
 *
 * `GET /api/host` is the server's answer, resolved by `@4dl/tenancy`'s
 * `classifyHost` before any of this runs. The client MUST NOT re-derive it: the
 * app does not know `ROOT_DOMAIN`, loopback is deliberately classified against
 * `localhost` whatever the config says, and a custom domain looks like nothing
 * in particular from the browser. Anything the client builds has to agree with
 * what the server resolves, so it asks.
 *
 * Scena had no host layer in the SPA at all, which is why `/admin` was a route
 * inside the Shell on every hostname — rendering the operator console and then
 * 404ing on every call, because `/api/admin/*` answers on the `admin.` door and
 * nowhere else.
 */

import { useEffect, useState } from "react";
import { appStorage, readBootBrand, writeBootBrand } from "@4dl/app-kit";
import { API_BASE } from "./api.js";
import { applyBrandTheme, clearBrandTheme, type WorkspaceBrand } from "./brand-theme.js";

/** The five doors `@4dl/tenancy` classifies into, plus the device door. */
export type DoorRole = "root" | "setup" | "admin" | "device" | "tenant" | "custom";

export interface HostInfo {
  role: DoorRole;
  rootDomain: string;
  setupUrl: string;
  tenant: { tenantId: string; name: string; slug: string; branding?: WorkspaceBrand | null } | null;
}

/*
  THE BRAND ARRIVES WITH THE DOOR, AND IS REMEMBERED FOR THE NEXT BOOT.

  Scena used to fetch the brand kit only after sign-in, from `/api/branding`,
  because it was stored in `app_config` where nothing public could reach it —
  so every operator watched the shipped violet for one authenticated round trip
  before their own colours arrived, on every cold start. `/api/host` is the ONE
  public read the pre-auth client already makes and it has always carried
  `tenant.branding`; the kit just was not there to carry.

  Now it is, and the two halves are:

    THIS BOOT   apply what `/api/host` returns the moment it lands — before the
                session, before any screen mounts.
    NEXT BOOT   remember it against the hostname, and paint from the cache
                before the request is even sent.

  ⚠️ The cache is keyed by HOSTNAME and CLEARED on a door with no workspace
  behind it. One browser visits several workspaces and the operator console;
  skipping the write on a brand-less door would leave the last workspace's
  colours painted over the next one, which looks deliberate and is worse than
  the flash it replaces.

  It is a UI convenience and never an authorization decision — it holds exactly
  what an unauthenticated visitor to that hostname is already shown.
*/
const brandStore = appStorage("scena");

/** Paint the remembered brand for this hostname. Called once, before render. */
export function applyBootBrand(): void {
  const cached = readBootBrand<WorkspaceBrand>(brandStore, location.hostname);
  if (cached?.branding) applyBrandTheme(cached.branding);
}

/**
 * The door, or `null` while it is unknown.
 *
 * ⚠️ `null` is NOT "the tenant door". A caller that treats an unresolved host as
 * a tenant renders the whole studio Shell for the length of a round trip and
 * then replaces it — and on the operator door that means flashing a workspace
 * at somebody who has none. Render nothing until this is known; the answer
 * arrives in one request against the same origin.
 */
export function useHost(): HostInfo | null {
  const [host, setHost] = useState<HostInfo | null>(null);
  useEffect(() => {
    let live = true;
    /*
      A BARE `fetch`, and the one place in this SPA that should stay one.

      `/api/host` is the PUBLIC probe every boot makes before there is a session
      — a 401 here is not an expiry, and routing it through `apiFetch`'s
      unauthorized hook would fire the re-auth on a request whose whole purpose
      is to run without auth. `scripts/scena-fetch-chokepoint.test.mjs` names
      this file for that reason.
    */
    fetch(`${API_BASE}/api/host`)
      .then((r) => (r.ok ? (r.json() as Promise<HostInfo>) : null))
      .then((h) => {
        if (!live || !h) return;
        setHost(h);
        const branding = h.tenant?.branding ?? null;
        if (branding) applyBrandTheme(branding);
        // A door with no workspace behind it forgets, rather than skipping —
        // see the note on `applyBootBrand`. `clearBrandTheme` undoes a stale
        // cache we may already have painted this boot.
        else if (h.tenant === null) clearBrandTheme();
        writeBootBrand<WorkspaceBrand>(
          brandStore,
          h.tenant ? { host: location.hostname, name: h.tenant.name, branding } : null,
        );
      })
      // A failed probe leaves the door unknown rather than guessing one. The
      // app-wide error boundary is what says so; guessing "tenant" here would
      // put a studio on the operator's address.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return host;
}
