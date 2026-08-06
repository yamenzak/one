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
import { API_BASE } from "./api.js";

/** The five doors `@4dl/tenancy` classifies into, plus the device door. */
export type DoorRole = "root" | "setup" | "admin" | "device" | "tenant" | "custom";

export interface HostInfo {
  role: DoorRole;
  rootDomain: string;
  setupUrl: string;
  tenant: { tenantId: string; name: string; slug: string } | null;
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
    fetch(`${API_BASE}/api/host`)
      .then((r) => (r.ok ? (r.json() as Promise<HostInfo>) : null))
      .then((h) => {
        if (!live || !h) return;
        setHost(h);
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
