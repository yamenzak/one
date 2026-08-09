/**
 * THE DOORS — a hostname is not routing information, it is the tenancy.
 *
 * Layer 1. Imports primitives only.
 *
 * Every request is classified before a session is read, so a session pointed at
 * the wrong tenant grants nothing. The classification is pure: a hostname and a
 * configuration in, a shape out, no I/O — which is what lets the whole door
 * topology be tested without a worker.
 */

import type { RegionId } from "./primitives.js";

export type Door =
  /** The bare product domain. A signpost: it is not an app and holds no tenant. */
  | "root"
  /** The ONLY place a tenant is created. */
  | "setup"
  /** The operator console. `/admin/*` answers here and nowhere else. */
  | "admin"
  /** A tenant, at `<slug>.<app-root>`. */
  | "tenant"
  /** A tenant's own domain. Same tenant, different trust boundary. */
  | "custom"
  /** A paired device. Resolves NO tenant from its host — the claim carries it. */
  | "device"
  /** Under our root, well-formed, and nobody's. Not a 404 for the app to render. */
  | "unclaimed"
  | "invalid";

export interface HostShape {
  readonly hostname: string;
  readonly door: Door;
  /** This app's root — `kova.4dl.app`. Scopes the SESSION. */
  readonly appRoot: string;
  /** The platform root — `4dl.app`. Scopes the CREDENTIAL. */
  readonly platformRoot: string;
  readonly underRoot: boolean;
  readonly slug: string | null;
}

export interface DoorConfig {
  readonly appRoot: string;
  readonly platformRoot: string;
  /** Opt-in per app: `play` is a slug an ordinary tenant could otherwise hold. */
  readonly deviceDoor?: string;
  readonly reserved: readonly string[];
}

/**
 * Labels no tenant may take, on any product.
 *
 * ⚠️ This is a security control, not tidiness. A tenant at `admin` would own the
 * operator console's origin; one at `autodiscover` or `_acme-challenge` would
 * intercept mail configuration or a certificate challenge. An app adds its own
 * brand words on top; these are the ones that are dangerous everywhere.
 */
export const UNIVERSAL_RESERVED: readonly string[] = [
  "admin", "setup", "api", "www", "app", "auth", "id", "account", "accounts",
  "mail", "smtp", "imap", "mx", "autodiscover", "autoconfig",
  "_acme-challenge", "_domainkey", "dmarc", "spf",
  // vocabulary-exempt: money words a tenant may not take as a hostname. A slug
  // that reads as a payment page is a phishing surface, whatever the app sells.
  "billing", "pay", "payment", "payments", "invoice", "checkout",
  "status", "health", "static", "assets", "cdn", "media",
  "help", "support", "docs", "blog", "legal", "privacy", "terms",
];

const label = (hostname: string, root: string): string | null => {
  if (!hostname.endsWith(`.${root}`)) return null;
  return hostname.slice(0, -(root.length + 1));
};

/** Classify a hostname. Pure, total, and the input to everything else. */
export function classifyHost(hostnameRaw: string, cfg: DoorConfig): HostShape {
  const hostname = hostnameRaw.toLowerCase().split(":")[0] ?? "";
  const base = { hostname, appRoot: cfg.appRoot, platformRoot: cfg.platformRoot };

  if (!hostname) return { ...base, door: "invalid", underRoot: false, slug: null };
  if (hostname === cfg.appRoot) return { ...base, door: "root", underRoot: true, slug: null };

  /*
    ⚠️ THE PLATFORM ROOT IS OURS AND IS NOBODY'S, and it has to be said before
    the custom-domain fallthrough. It is not this app's root, so the label test
    below does not match it — and everything that does not match falls through
    to `custom`, which means a lookup in the CUSTOM-DOMAIN directory. A tenant
    holding the platform root as a custom domain would then be served at the
    address every product's credentials are scoped to.

    `underRoot` is true because it is literally our root: the relying party is
    the platform, not this hostname.
  */
  if (hostname === cfg.platformRoot) return { ...base, door: "unclaimed", underRoot: true, slug: null };

  const l = label(hostname, cfg.appRoot);
  if (l === null) {
    // Not under our root at all: somebody's own domain, resolved by lookup.
    return { ...base, door: "custom", underRoot: false, slug: null };
  }
  // A dotted label is a sub-subdomain. We serve one level; anything deeper is
  // not a tenant that could have been created, so it is malformed rather than
  // merely unknown.
  if (l.includes(".") || l === "") return { ...base, door: "invalid", underRoot: true, slug: null };

  if (l === "setup") return { ...base, door: "setup", underRoot: true, slug: null };
  if (l === "admin") return { ...base, door: "admin", underRoot: true, slug: null };
  if (cfg.deviceDoor && l === cfg.deviceDoor) return { ...base, door: "device", underRoot: true, slug: null };
  if (cfg.reserved.includes(l) || UNIVERSAL_RESERVED.includes(l)) {
    return { ...base, door: "unclaimed", underRoot: true, slug: null };
  }
  return { ...base, door: "tenant", underRoot: true, slug: l };
}

/* --------------------------------------------------------------- identity --- */

/**
 * ⚠️ THE CREDENTIAL IS SCOPED TO THE PLATFORM ROOT. THE SESSION IS NOT.
 *
 * These two functions return DIFFERENT scopes on purpose, and the difference is
 * the entire SSO design.
 *
 * WebAuthn permits a relying party id that is any registrable-domain suffix of
 * the origin, so a credential bound to `4dl.app` can be used from
 * `gym.kova.4dl.app` — on that origin, with that product's own branding, with no
 * redirect anywhere. One passkey, every product, nothing to hide.
 *
 * A session widened the same way would mean a script injected into any one
 * product acts as that person in all of them. So the cookie stops at the app's
 * own root: an account shared across products is a feature, a session shared
 * across them is a blast radius.
 *
 * The consequence of raising the RP, stated once: nothing third-party may ever
 * be hosted under the platform root, because anything there could assert this
 * relying party and be offered these credentials.
 */
export function relyingPartyFor(shape: HostShape): string {
  return shape.underRoot ? shape.platformRoot : shape.hostname;
}

/**
 * The cookie `Domain`, or null to leave it host-only.
 *
 * A custom domain gets null twice over: there is no shared parent to widen to,
 * and a tenant's own domain must not carry a session usable anywhere else. A
 * root with no dot (`localhost`) gets null because browsers refuse a `Domain`
 * for it — which is why a local `*.localhost` signs in per host and production
 * does not.
 */
export function cookieDomainFor(shape: HostShape): string | null {
  if (!shape.underRoot) return null;
  if (!shape.appRoot.includes(".")) return null;
  /*
    ⚠️ A HOST MAY ONLY WIDEN A COOKIE TO A SUFFIX OF ITSELF. The platform root is
    under our control but ABOVE the app root, so widening to the app root there
    is a `Set-Cookie` every browser silently drops — a sign-in that reports
    success and leaves no session, which is indistinguishable from a wrong code.
  */
  if (shape.hostname !== shape.appRoot && !shape.hostname.endsWith(`.${shape.appRoot}`)) return null;
  return `.${shape.appRoot}`;
}

/* ----------------------------------------------------------------- region --- */

/** Doors that resolve a tenant, and therefore a region, from the hostname. */
export const TENANT_DOORS: readonly Door[] = ["tenant", "custom"];

/**
 * Doors served without a tenant, and so without a regional store.
 *
 * ⚠️ `device` is here and it is the interesting one: a screen resolves NO tenant
 * from its host. One pinned URL, cached for months, re-pairable — the tenant
 * arrives from the pairing claim, so a tenant subdomain would give every
 * workspace's screens a different address and orphan the cache on re-pairing.
 */
export const TENANTLESS_DOORS: readonly Door[] = ["root", "setup", "admin", "device", "unclaimed", "invalid"];

/** Where a request with no tenant reads from. Routing data only. */
export const DIRECTORY_REGION: RegionId = "eu";
