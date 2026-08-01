/**
 * Kova's tenancy adapter — the ONE place `@4dl/tenancy` learns it is Kova.
 *
 * The package is deliberately ignorant of three things, and this file supplies
 * all of them:
 *
 *   root       the apex studios are served under. `@4dl/tenancy` returns "" when
 *              neither `ROOT_DOMAIN` nor `BETTER_AUTH_URL` is set, on purpose: a
 *              shared package guessing a hostname is how every studio 404s. The
 *              shipped default belongs to the app that ships it.
 *   reserved   the brand labels a studio may never claim. `RESERVED_LABELS` in
 *              the package covers what is true of any product on any zone (the
 *              other doors, mail autoconfig, ACME, Workers plumbing); "kova" and
 *              "4dl" mean nothing to a warehouse app and are ours to add.
 *   statusOf   the studio's standing with Kova, which lives in `subscriptions` —
 *              a BILLING table tenancy must not read. An app with no billing
 *              omits this and every gate resolves `ok`.
 *
 * Every function is re-exported pre-bound, so the ~40 call sites across the
 * worker keep the signatures they always had and none of them has to know the
 * config exists.
 */

import type { SessionContext } from "@kova/protocol";
import {
  canonicalHost as tCanonicalHost,
  invalidateTenantHosts as tInvalidateTenantHosts,
  moveSubdomain as tMoveSubdomain,
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

export {
  hostnameOf,
  invalidateHostCache,
  isPlatformDoor,
  resolveSlugTenant,
  resolveTenantDoor,
} from "@4dl/tenancy";

/** Kova's branding blob, as the app and the protocol already model it. */
export type Branding = SessionContext["branding"];
export type KovaHostTenant = HostTenant<Branding>;
export type KovaHostContext = HostContext<Branding>;

/** Kept as the exported names the rest of the worker imports. */
export type { KovaHostTenant as HostTenant, KovaHostContext as HostContext };

/** Where Kova lives when nothing is configured. See DEPLOY.md §2. */
const DEFAULT_ROOT = "kova.4dl.app";

/**
 * Labels reserved because they are OURS — the product and the company, in every
 * form we might publish under. The universal reservations (other doors, mail,
 * ACME, Cloudflare plumbing, money words) are in `@4dl/tenancy`.
 *
 * Same economics as that list: cheap to add, expensive to remove, because
 * releasing one later changes a live studio's URL and breaks its passkeys.
 */
export const KOVA_RESERVED_LABELS: ReadonlySet<string> = new Set([
  "kova", "mossa", "fourdegrees", "fourdegreelabs", "4dl", "labs",
]);

/**
 * The studio's live subscription status.
 *
 * This is the injected half of the host gate, and it is why `@4dl/tenancy` can be
 * used by an app that never takes a payment. A primary-key point lookup, run on
 * every request — never cached. The reasoning is in `resolveHost`'s header.
 *
 * ── Why this reads the PLAN and not just the status ─────────────────────────
 *
 * `getSubscription` stamps every brand-new tenant `plan_id = 'free', status =
 * 'active'`, and `customer.subscription.deleted` falls back to the same pair. So
 * `status` alone said "active" for a studio that had never paid a cent — an
 * owner who abandoned the wizard, was declined at the first attempt, or reloaded
 * mid-checkout got a fully-writable app on the free row's quotas, indefinitely,
 * with nothing but a soft notice on the billing screen.
 *
 * That was the whole "we take them to a free base plan, which is weird" problem,
 * and it was worse than weird: the free row carried MORE clients than the
 * cheapest paid tier, so not paying was the better deal.
 *
 * A tenant with no PAID plan therefore reports `incomplete`, which
 * `resolveHostGate` turns into read-only + billing-writable. `comp` is exempt —
 * an operator granting a studio access is precisely the case where the absence
 * of a payment is intentional.
 */
async function statusOf(db: D1Database, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT s.status, s.comp, p.price_usd_month
       FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = ?`,
    )
    .bind(tenantId)
    .first<{ status: string | null; comp: number | null; price_usd_month: number | null }>()
    .catch(() => null);
  // No row at all: the tenant predates its subscription row (it is written
  // lazily). Treat as unconfigured — it is, and the alternative is the old
  // fully-served default.
  if (!row) return "incomplete";
  if (row.comp) return row.status ?? null;
  // A missing plan row (a deleted or renamed id) counts as unpaid too: an
  // entitlement set nobody can name is not one to serve an app on.
  if (!(Number(row.price_usd_month) > 0)) return "incomplete";
  return row.status ?? null;
}

/** The apex we serve studios under, with Kova's shipped fallback. */
export function rootDomain(env: RootDomainEnv): string {
  return tRootDomain(env) || DEFAULT_ROOT;
}

/** Kova's tenancy configuration for one request's environment. */
export function tenancyConfig(env: RootDomainEnv): TenancyConfig {
  return { root: rootDomain(env), reserved: KOVA_RESERVED_LABELS, statusOf };
}

type HostEnv = TenancyBindings & RootDomainEnv;

export const shapeOf = (hostname: string, env: RootDomainEnv) => tShapeOf(hostname, tenancyConfig(env));

export const resolveHost = (db: D1Database, hostname: string, env: HostEnv): Promise<KovaHostContext> =>
  tResolveHost<Branding>({ ...env, DB: db }, hostname, tenancyConfig(env));

export const invalidateTenantHosts = (env: HostEnv, db: D1Database, tenantId: string): Promise<void> =>
  tInvalidateTenantHosts({ ...env, DB: db }, tenantId, tenancyConfig(env));

export const provisionSubdomain = (
  env: HostEnv,
  db: D1Database,
  tenantId: string,
  slug: string,
  createdBy?: string | null,
): Promise<string> => tProvisionSubdomain({ ...env, DB: db }, tenantId, slug, tenancyConfig(env), createdBy);

export const moveSubdomain = (env: HostEnv, db: D1Database, tenantId: string, nextSlug: string): Promise<string> =>
  tMoveSubdomain({ ...env, DB: db }, tenantId, nextSlug, tenancyConfig(env));

export const canonicalHost = (
  env: HostEnv,
  db: D1Database,
  tenantId: string,
  rootOverride?: string,
): Promise<string> => tCanonicalHost({ ...env, DB: db }, tenantId, tenancyConfig(env), rootOverride);
