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

import type { HasDb } from "@4dl/core";
import {
  canonicalHost as tCanonicalHost,
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
const DEFAULT_ROOT = "template.4dl.app";

/**
 * Labels reserved because they are the PRODUCT's.
 *
 * Cheap to add, expensive to remove: releasing one later changes a live
 * tenant's URL and breaks its passkeys (WebAuthn binds to the origin).
 */
export const APP_RESERVED_LABELS: ReadonlySet<string> = new Set(["template", "4dl", "labs"]);

/**
 * The tenant's live subscription status — the injected half of the host gate.
 *
 * A primary-key point lookup on every request, never cached. **Delete this
 * function** (and drop it from the config below) if the app does not bill its
 * tenants; the gate then resolves `ok` and nothing else changes.
 */
async function statusOf(env: HasDb, tenantId: string): Promise<string | null> {
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
