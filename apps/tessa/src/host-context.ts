/**
 * THE TENANCY ADAPTER — where `@4dl/tenancy` learns which app it is.
 *
 * The package classifies every hostname into five doors and refuses to guess
 * three things. This file supplies all three:
 *
 *   root       the apex tenants are served under. The package returns "" when
 *              neither ROOT_DOMAIN nor BETTER_AUTH_URL is set, deliberately: a
 *              shared package inventing a hostname is how every tenant 404s.
 *   reserved   the labels a tenant may never claim, because they are YOURS. The
 *              universal ones (the other doors, mail autoconfig, ACME, Workers
 *              plumbing, money words) are already in `RESERVED_LABELS`; your
 *              brand names mean nothing to another app and belong here.
 *   statusOf   the tenant's standing with the PLATFORM, which lives in a billing
 *              table tenancy must not read. Omit it and every gate resolves
 *              `ok` — which is exactly right for an app that never bills.
 *
 * Everything is re-exported PRE-BOUND, so call sites never see the config.
 */

import { stripeConfig, stripeEnabled } from "@4dl/billing";
import {
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

/** Whatever this app's branding blob is. `never` if it has none. */
export type Branding = { primary?: string; logoUrl?: string } | null;
export type AppHostTenant = HostTenant<Branding>;
export type AppHostContext = HostContext<Branding>;
export type { AppHostTenant as HostTenant, AppHostContext as HostContext };

/** Where this app lives when nothing is configured. Change it. */
const DEFAULT_ROOT = "tessa.4dl.app";

/**
 * Labels reserved because they are the PRODUCT's.
 *
 * Cheap to add, expensive to remove: releasing one later changes a live
 * tenant's URL and breaks its passkeys (WebAuthn binds to the origin).
 */
export const APP_RESERVED_LABELS: ReadonlySet<string> = new Set(["tessa", "tessera", "4dl", "labs"]);

/**
 * The tenant's live subscription status — the injected half of the host gate.
 *
 * A primary-key point lookup on every request, never cached. **Delete this
 * function** (and drop it from the config below) if the app does not bill its
 * tenants; the gate then resolves `ok` and nothing else changes.
 */
/**
 * The centre's standing with the platform.
 *
 * ⚠️ **NO ROW IS NOT `ok`.** The subscription row is written lazily — the first
 * time anything opens `/api/billing` — so a centre that has never looked at
 * billing has none at all, and `resolveHostGate(null)` falls through every
 * branch to full service. The `incomplete` rung, which exists precisely to hold
 * an unconfigured centre read-only until it chooses a plan, could therefore
 * never fire: the paywall was open for exactly the centres it is for.
 *
 * Found by an integration test that suspended a centre and watched an ordinary
 * write succeed anyway. A missing row and "never chose a plan" are the same
 * fact, so they resolve to the same status.
 *
 * ── …but only where a payment can actually be TAKEN ─────────────────────────
 *
 * Gating on "has not paid" when this deployment has no payment rail configured
 * would strand every centre over OUR misconfiguration — a self-host, anything
 * before the Stripe step in DEPLOY.md, and the whole integration suite. The
 * house rule, the same one Kova states at length: fail CLOSED on their
 * non-payment, fail OPEN on ours.
 */
async function statusOf(db: D1Database, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT s.status, s.comp, p.price_usd_month FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ?")
    .bind(tenantId)
    .first<{ status: string | null; comp: number | null; price_usd_month: number | null }>()
    .catch(() => null);
  // Comped, or on a paid plan: nothing to decide. The steady state, so it stops
  // here and the config read below never touches the hot path.
  if (row?.comp) return row.status ?? null;
  if (Number(row?.price_usd_month) > 0) return row?.status ?? null;
  const cfg = await stripeConfig(db).catch(() => null);
  if (!cfg || !stripeEnabled(cfg)) return row?.status ?? null;
  return "incomplete";
}

export const rootDomain = (env: RootDomainEnv): string => tRootDomain(env) || DEFAULT_ROOT;

export const tenancyConfig = (env: RootDomainEnv): TenancyConfig => ({
  root: rootDomain(env),
  reserved: APP_RESERVED_LABELS,
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
 * Call it on any change that alters what a host SERVES: branding, self-signup,
 * a domain going live. `resolveHost` caches `branding_json` in KV, so without
 * this a centre changes its accent, sees the save succeed, and the sign-in
 * screen keeps the old one until the cache happens to expire.
 *
 * ⚠️ Not `invalidateHostCache` — that one takes a HOSTNAME. Handing it a tenant
 * id type-checks (both are strings), deletes a key that was never written, and
 * reports success.
 */
export const invalidateTenantHosts = (env: HostEnv, tenantId: string): Promise<void> =>
  tInvalidateTenantHosts(env, tenantId, tenancyConfig(env));
