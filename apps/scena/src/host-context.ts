/**
 * THE TENANCY ADAPTER — where `@4dl/tenancy` learns which app it is.
 *
 * ── What this replaces ─────────────────────────────────────────────────────
 *
 * Nothing. Scena had NO host model: one origin, and the tenant came from the
 * session's active organization. That works until a person belongs to two
 * workspaces, at which point they can enter through either address and have
 * every call scoped to whichever one their session was stamped with — the right
 * brand over the wrong tenancy, with nothing on screen to show it.
 *
 * The Host header is the tenancy now. `<slug>.scena.4dl.app` IS that workspace,
 * the session merely proves identity, and a session pointed at a workspace the
 * caller does not belong to resolves `tenantId: null` — signed in, with no
 * scope.
 *
 * ── The SIXTH door, which is Scena's alone ─────────────────────────────────
 *
 * `play.scena.4dl.app` is the DEVICE door: one fixed origin that resolves no
 * tenant, for screens whose tenancy arrives from their pairing claim. It exists
 * because a screen is not a user session — it is a device with a pinned URL and
 * a Service-Worker cache that runs for months offline. Putting it on a tenant
 * subdomain would give every workspace's screens a different address, so
 * re-pairing would orphan the cache; putting it on custom domains would multiply
 * certificates by the size of the fleet. See `DEFAULT_DEVICE_LABEL` in
 * `@4dl/tenancy` for the full argument, including why the door is opt-in.
 *
 * Everything is re-exported PRE-BOUND, so call sites never see the config.
 */

import type { HasDb, HasPlatformConfig } from "@4dl/core";
import type { Branding as StoredBranding } from "./branding-store.js";
import {
  DEFAULT_DEVICE_LABEL,
  canonicalHost as tCanonicalHost,
  invalidateTenantHosts as tInvalidateTenantHosts,
  provisionSubdomain as tProvisionSubdomain,
  resolveHost as tResolveHost,
  rootDomain as tRootDomain,
  shapeOf as tShapeOf,
  type HostContext,
  type HostTenant,
  type RootDomainEnv,
  type TenancyBindings,
  type TenancyConfig,
} from "@4dl/tenancy";

export { hostnameOf, invalidateHostCache, isPlatformDoor, resolveSlugTenant } from "@4dl/tenancy";
export { DEFAULT_DEVICE_LABEL };

/**
 * Scena's brand kit, as stored in `tenant_settings.branding_json` — the SAME
 * blob `branding-store.ts` reads and writes.
 *
 * It used to be a third, disagreeing shape (`{primary, logoUrl, name}`) that
 * nothing ever wrote, because the kit lived in `app_config` instead. So
 * `host.tenant.branding` was permanently null and the pre-auth client had
 * nothing to paint with — hence the flash of default violet before the
 * authenticated `/api/branding` read landed. One home, one type, and the boot
 * paint is correct for free.
 */
export type Branding = StoredBranding | null;
export type AppHostTenant = HostTenant<Branding>;
export type AppHostContext = HostContext<Branding>;
export type { AppHostTenant as HostTenant, AppHostContext as HostContext };

/** Where Scena lives when nothing is configured. */
const DEFAULT_ROOT = "scena.4dl.app";

/**
 * The label the whole fleet is pinned to. Every screen's manifest, asset and
 * status request goes here, forever — changing it strands every device that has
 * already cached the old origin, which is not a deploy, it is a site visit.
 */
export const DEVICE_LABEL = DEFAULT_DEVICE_LABEL;

/**
 * Labels reserved because they are the PRODUCT's.
 *
 * Cheap to add, expensive to remove: releasing one later changes a live tenant's
 * URL and breaks its passkeys (WebAuthn binds to the origin). `play` is NOT
 * here — it is reserved by being declared as the device door below, which keeps
 * one fact in one place.
 */
export const APP_RESERVED_LABELS: ReadonlySet<string> = new Set([
  "scena", "scenaapp", "4dl", "labs", "fourdegreelabs",
  // Scena's own vocabulary, which a workspace at that address would shadow.
  "screen", "screens", "player", "players", "display", "displays", "signage",
  "board", "boards", "kiosk", "kiosks", "station", "stations", "channel", "channels",
  /*
    `tv` is the one a person actually types.

    The player BUNDLE is served at `tv.4dl.app` — a label on the zone apex, not
    under this root, so a workspace at `tv.<root>` collides with nothing
    technically. It is reserved because of what it would look like: the address a
    screen is pointed at and the address a workspace is served at differing only
    by which domain they sit under is a support call waiting to happen, and
    somebody typing `tv.` expecting a player would get somebody's dashboard.
    `cast` and `wall` for the same reason — both are words a signage operator
    reaches for, and neither is a name a workspace needs.
  */
  "tv", "cast", "wall",
]);

/**
 * The workspace's standing with the platform — the injected half of the host
 * gate, and the reason `@4dl/tenancy` does not depend on billing.
 *
 * A primary-key point lookup on every request, never cached.
 *
 * ⚠️ Unlike Kova and Tessa, this does NOT synthesise an `incomplete` rung for a
 * workspace that never chose a plan. Scena's `free` plan is a real tier with
 * real (small) entitlements that the product is designed to be usable on — one
 * screen, one channel — not a parking state. Holding a free workspace read-only
 * would gate the tier we advertise. If Scena ever goes B2B-only the way Kova
 * did, this is the function that changes, and `standing.ts` already has the rung.
 */
async function statusOf(env: HasDb & HasPlatformConfig, tenantId: string): Promise<string | null> {
  const row = await env.DB
    .prepare("SELECT status FROM subscriptions WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ status: string | null }>()
    .catch(() => null);
  return row?.status ?? null;
}

export const rootDomain = (env: RootDomainEnv): string => tRootDomain(env) || DEFAULT_ROOT;

export const tenancyConfig = (env: RootDomainEnv): TenancyConfig => ({
  root: rootDomain(env),
  reserved: APP_RESERVED_LABELS,
  deviceLabel: DEVICE_LABEL,
  statusOf,
});

type HostEnv = TenancyBindings & RootDomainEnv;

export const shapeOf = (hostname: string, env: RootDomainEnv) => tShapeOf(hostname, tenancyConfig(env));

export const resolveHost = (db: D1Database, hostname: string, env: HostEnv): Promise<AppHostContext> =>
  tResolveHost<Branding>({ ...env, DB: db }, hostname, tenancyConfig(env));

export const provisionSubdomain = (
  env: HostEnv,
  db: D1Database,
  tenantId: string,
  slug: string,
  createdBy?: string | null,
): Promise<string> => tProvisionSubdomain({ ...env, DB: db }, tenantId, slug, tenancyConfig(env), createdBy);

export const canonicalHost = (env: HostEnv, db: D1Database, tenantId: string): Promise<string> =>
  tCanonicalHost({ ...env, DB: db }, tenantId, tenancyConfig(env));

/**
 * Drop every cached host resolution for a tenant — its subdomain AND each of its
 * custom domains.
 *
 * ⚠️ Not `invalidateHostCache`, which takes a HOSTNAME. Handing it a tenant id
 * typechecks (both are strings), deletes a key that was never written, and
 * reports success.
 */
export const invalidateTenantHosts = (env: HostEnv, tenantId: string): Promise<void> =>
  tInvalidateTenantHosts(env, tenantId, tenancyConfig(env));
