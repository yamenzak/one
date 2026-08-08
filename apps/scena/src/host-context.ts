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
import { stripeCfg, stripeEnabled } from "./stripe.js";
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
 * ⚠️ THIS FUNCTION USED TO SAY THE OPPOSITE, and its own comment predicted this
 * change: "If Scena ever goes B2B-only the way Kova did, this is the function
 * that changes, and `standing.ts` already has the rung." Scena sold a `free`
 * plan — one screen, one channel, indefinitely — so a workspace that never chose
 * anything was a customer rather than an unfinished signup, and holding it
 * read-only would have gated the tier being advertised.
 *
 * There is no free tier now. `free` is the PARKING STATE every brand-new
 * workspace is stamped with (and the fallback a deleted Stripe subscription
 * lands on), so `status` alone said "active" for somebody who had never paid:
 * an owner who abandoned the wizard, was declined, or reloaded mid-checkout got
 * a fully-writable product forever.
 *
 * A workspace with no PAID plan therefore reports `incomplete`, which
 * `resolveHostGate` turns into read-only with billing still writable — gate
 * reason `setup`, which is deliberately not `suspended`: nothing was taken from
 * them and there is no arrears to settle.
 *
 * `comp` is exempt. An operator granting a workspace access is precisely the
 * case where the absence of a payment is intentional.
 */
async function statusOf(env: HasDb & HasPlatformConfig, tenantId: string): Promise<string | null> {
  const row = await env.DB
    .prepare(
      `SELECT s.status, s.comp, p.price_cents
       FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = ?`,
    )
    .bind(tenantId)
    .first<{ status: string | null; comp: number | null; price_cents: number | null }>()
    .catch(() => null);
  if (row?.comp) return row.status ?? null;
  // A paid plan on the row: nothing to decide, and this is the steady state, so
  // it costs one query and stops here. (No row at all counts as unpaid too — the
  // row is written lazily, and a missing plan id is an entitlement set nobody
  // can name.)
  if (Number(row?.price_cents) > 0) return row?.status ?? null;

  /*
    …but only if this deployment can actually TAKE a payment.

    Gating on "has not paid" where there is no payment rail would strand every
    workspace over OUR misconfiguration. A self-host, anything before
    `apps/scena/DEPLOY.md`'s Stripe step, and the whole E2E suite are all in
    exactly that state — `apps/scena-e2e` creates workspaces against a worker
    with no keys. The house rule everywhere else here applies: fail CLOSED on
    their non-payment, fail OPEN on ours.

    Read LAST and only on this branch, so a healthy deployment — which returned
    above with a paid plan — never pays for the extra config read.
  */
  const cfg = await stripeCfg(env).catch(() => null);
  if (!cfg || !stripeEnabled(cfg)) return row?.status ?? null;
  return "incomplete";
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
