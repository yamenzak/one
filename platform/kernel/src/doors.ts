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
  /**
   * THE ACCOUNT CENTRE, AT `id.<platformRoot>`.
   *
   * ⚠️ IT IS A DESTINATION, NOT AN IDENTITY PROVIDER, and the difference is the
   * reason it exists at all. An IdP is a place a product SENDS you to sign in
   * and then sends you back — machinery, a redirect, somebody else's branding
   * mid-ceremony. Nothing here does that: sign-in runs on each product's own
   * origin against a credential scoped to the platform root, which is what the
   * relying-party design buys.
   *
   * What this door is for is the other half of "one account": a person's
   * relationship with their own data does not end when they stop using a
   * product. Their facts, their grants, their credentials, their history of who
   * read what — all of it belongs to the account rather than to any app, so
   * there has to be an address for it that no app owns.
   *
   * ⚠️ IT HANGS OFF THE PLATFORM ROOT, NOT AN APP ROOT, and that is what makes
   * it reachable with no product at all. `id.kova.4dl.app` would be Kova's
   * account screen wearing a platform name.
   */
  | "identity"
  /** A tenant, at `<slug>.<app-root>`. */
  | "tenant"
  /** A tenant's own domain. Same tenant, different trust boundary. */
  | "custom"
  /** A paired device. Resolves NO tenant from its host — the claim carries it. */
  | "device"
  /** Under our root, well-formed, and nobody's. Not a 404 for the app to render. */
  | "unclaimed"
  | "invalid";

/**
 * ANOTHER DOMAIN OF OURS, AND WHAT IT DOES.
 *
 * ⚠️ THE DEFAULT IS `redirect` AND IT SHOULD STAY THAT WAY FOR ALMOST EVERY
 * ALIAS. One canonical origin means one credential scope, one cookie jar, one
 * address in a password manager and one thing to explain. A second serving
 * origin buys a nicer-looking URL and costs a person a second passkey.
 */
export interface AliasRoot {
  /** The registrable domain — `fourdegreelabs.com`. No scheme, no path. */
  readonly root: string;
  readonly mode:
    /**
     * Answers, and sends every request to the same path under the canonical
     * root. Nothing is served, so nothing needs a credential.
     */
    | "redirect"
    /**
     * Serves for real, with its OWN relying party and its own session.
     *
     * ⚠️ CHOOSING THIS MEANS A PERSON'S PASSKEYS DO NOT WORK HERE, and the
     * `why` below is where somebody says they know that. It is not a warning
     * the platform can suppress: the sign-in screen on an alias origin has to
     * offer the emailed code first, because the passkey it would otherwise
     * offer resolves to nothing and reads as a broken product.
     */
    | "origin";
  /** ⚠️ Required for `origin`. `doors-alias-origin-is-argued` refuses an empty one. */
  readonly why?: string;
}

/**
 * ⚠️ HOW A HOSTNAME UNDER AN ALIAS IS ANSWERED, and both halves matter.
 *
 * `canonical` is where a redirect sends somebody: the same label under the
 * canonical root, so `id.fourdegreelabs.com/account` lands on
 * `id.4dl.app/account` rather than on a home page.
 */
export interface AliasShape {
  readonly alias: AliasRoot;
  /** The equivalent hostname under the canonical platform root. */
  readonly canonical: string;
}

export interface HostShape {
  readonly hostname: string;
  readonly door: Door;
  /** This app's root — `kova.4dl.app`. Scopes the SESSION. */
  readonly appRoot: string;
  /** The platform root — `4dl.app`. Scopes the CREDENTIAL. */
  readonly platformRoot: string;
  readonly underRoot: boolean;
  readonly slug: string | null;
  /**
   * Set where this hostname arrived on a domain of ours that is not the
   * canonical root. ⚠️ Absent on every ordinary request, so a caller that
   * ignores it behaves exactly as before.
   */
  readonly alias?: AliasShape;
}

export interface DoorConfig {
  readonly appRoot: string;
  readonly platformRoot: string;
  /** Opt-in per app: `play` is a slug an ordinary tenant could otherwise hold. */
  readonly deviceDoor?: string;
  readonly reserved: readonly string[];
  /**
   * OTHER REGISTRABLE DOMAINS THAT ARE ALSO OURS.
   *
   * ⚠️ A SECOND DOMAIN CANNOT SHARE A CREDENTIAL, AND NO CONFIGURATION CHANGES
   * THAT. WebAuthn binds a credential to a relying party that must be a
   * registrable-domain suffix of the origin — `4dl.app` is not a suffix of
   * `fourdegreelabs.com`, so a passkey created under one is never offered at the
   * other. This is the specification rather than a limitation of this platform,
   * and pretending otherwise produces the worst available failure: a sign-in
   * screen that offers a passkey the browser will not find, on a domain the
   * person believes is the same product.
   *
   * So an alias declares what it IS, and there are only two honest answers.
   */
  readonly aliases?: readonly AliasRoot[];
  /**
   * ⚠️ WHICH DOORS THIS APP ACTUALLY HAS, AND IT IS REQUIRED.
   *
   * A manifest has always declared this and nothing read it, so every app had
   * every door: one that declared no `setup` still created workspaces there, and
   * one that declared no `custom` still resolved anybody's own domain through
   * the custom-domain lookup. A declared restriction that is not applied is
   * worse than no declaration, because somebody has read it and believes it.
   *
   * Optional would have been the compatible choice and the wrong one — an
   * absent list would mean "all of them", which is the behaviour being fixed.
   */
  readonly doors: readonly Door[];
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

/**
 * The label the account centre answers on, under the platform root.
 *
 * ⚠️ A CONSTANT RATHER THAN A CONFIGURATION, because it is already reserved on
 * every product by `UNIVERSAL_RESERVED` — and the two would have to be kept in
 * step by hand. A configurable label is one a tenant could be holding.
 */
export const IDENTITY_LABEL = "id";

/**
 * Which of our other domains this hostname is under, if any.
 *
 * ⚠️ THE LONGEST MATCH WINS, so an alias that is a subdomain of another alias
 * resolves to the more specific one rather than to whichever was declared first.
 */
export function aliasFor(hostname: string, cfg: DoorConfig): AliasShape | null {
  let best: AliasRoot | null = null;
  for (const a of cfg.aliases ?? []) {
    const root = a.root.toLowerCase();
    if (hostname !== root && !hostname.endsWith(`.${root}`)) continue;
    if (!best || root.length > best.root.length) best = a;
  }
  if (!best) return null;
  const label = hostname === best.root ? "" : hostname.slice(0, -(best.root.length + 1));
  return { alias: best, canonical: label ? `${label}.${cfg.platformRoot}` : cfg.platformRoot };
}

/** Classify a hostname. Pure, total, and the input to everything else. */
export function classifyHost(hostnameRaw: string, cfg: DoorConfig): HostShape {
  const hostname = hostnameRaw.toLowerCase().split(":")[0] ?? "";
  const base = { hostname, appRoot: cfg.appRoot, platformRoot: cfg.platformRoot };

  if (!hostname) return { ...base, door: "invalid", underRoot: false, slug: null };

  /*
    ⚠️ AN ALIAS IS CLASSIFIED BEFORE ANYTHING ELSE AND NEVER FALLS THROUGH TO
    `custom`. Another domain of ours is not under our root, so without this it
    would reach the custom-domain lookup — which resolves a hostname to whichever
    TENANT claimed it. A domain we own being answerable by a tenant's claim is
    the sharpest version of the takeover the reserved list exists to prevent.

    A `redirect` alias resolves to the door its canonical hostname would be, so
    the redirect goes somewhere real rather than to a home page; a caller sends
    the redirect on the strength of `alias.mode` and never on the door.
  */
  const alias = aliasFor(hostname, cfg);
  if (alias) {
    const asCanonical = classifyHost(alias.canonical, { ...cfg, aliases: [] });
    /*
      ⚠️ AN ALIAS THAT SERVES IS NOT UNDER OUR ROOT FOR CREDENTIAL PURPOSES, and
      that one field carries both consequences correctly. `relyingPartyFor` then
      returns this hostname rather than the platform root — which is the truth,
      because `4dl.app` is not a registrable-domain suffix of another registrable
      domain and a browser will not offer a credential across the two — and
      `cookieDomainFor` returns null, giving this origin its own jar, which is
      also right: two origins that cannot share a credential must not share a
      session either.

      A REDIRECTING alias keeps the canonical answer because nothing is served
      there at all; there is no ceremony to scope and no cookie to set.
    */
    const underRoot = alias.alias.mode === "origin" ? false : asCanonical.underRoot;
    return { ...asCanonical, hostname, underRoot, alias };
  }

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
    /*
      ⚠️ UNDER THE PLATFORM ROOT BUT NOT UNDER THIS APP'S — which is where the
      account centre lives, and where every OTHER product's root lives too.
      Without this branch both fell through to the custom-domain lookup below,
      so `id.4dl.app` and `tessa.4dl.app` were resolved by asking which TENANT
      had claimed them. A hostname we own being answerable by somebody's claim is
      the sharpest form of the takeover the reserved list exists to prevent.
    */
    const under = label(hostname, cfg.platformRoot);
    if (under !== null) {
      if (under === IDENTITY_LABEL && cfg.doors.includes("identity")) {
        /* ⚠️ `underRoot` is true: the relying party here is the platform, which
           is the entire reason one credential reaches this door. */
        return { ...base, door: "identity", underRoot: true, slug: null };
      }
      return { ...base, door: "unclaimed", underRoot: true, slug: null };
    }
    /*
      Not under our root at all: somebody's own domain, resolved by lookup.

      ⚠️ AND AN APP THAT DECLARED NO CUSTOM DOOR DOES NOT DO THE LOOKUP. `invalid`
      rather than `unclaimed`, because this hostname is not under our root and
      never could have been ours — there is nothing here to claim.
    */
    return cfg.doors.includes("custom")
      ? { ...base, door: "custom", underRoot: false, slug: null }
      : { ...base, door: "invalid", underRoot: false, slug: null };
  }
  // A dotted label is a sub-subdomain. We serve one level; anything deeper is
  // not a tenant that could have been created, so it is malformed rather than
  // merely unknown.
  if (l.includes(".") || l === "") return { ...base, door: "invalid", underRoot: true, slug: null };

  /*
    ⚠️ A DOOR THIS APP DID NOT DECLARE IS `unclaimed`, NOT ITS OWN KIND. It is a
    well-formed label under our root that belongs to nobody — which is exactly
    what it is — and answering that way tells an outsider probing for names
    nothing they could not have guessed.
  */
  const has = (door: Door) => cfg.doors.includes(door);
  if (l === "setup") return { ...base, door: has("setup") ? "setup" : "unclaimed", underRoot: true, slug: null };
  if (l === "admin") return { ...base, door: has("admin") ? "admin" : "unclaimed", underRoot: true, slug: null };
  if (cfg.deviceDoor && l === cfg.deviceDoor) {
    return { ...base, door: has("device") ? "device" : "unclaimed", underRoot: true, slug: null };
  }
  if (cfg.reserved.includes(l) || UNIVERSAL_RESERVED.includes(l)) {
    return { ...base, door: "unclaimed", underRoot: true, slug: null };
  }
  /* ⚠️ And an app with no tenant door has no tenants to serve at a subdomain. */
  return has("tenant")
    ? { ...base, door: "tenant", underRoot: true, slug: l }
    : { ...base, door: "unclaimed", underRoot: true, slug: null };
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
export function cookieDomainFor(shape: HostShape, scope: "origin" | "host" = "origin"): string | null {
  /*
    ⚠️ `host` IS NO DOMAIN AT ALL, which is a host-only cookie: this hostname and
    nothing under it. An app declaring it wants every workspace to have its own
    jar, and a widened cookie would quietly give a person signed into one a
    session in the next.
  */
  if (scope === "host") return null;
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
/*
  ⚠️ `identity` IS HERE, AND IT IS THE POINT OF THE DOOR. The account centre
  answers about a PERSON, and a person is not inside a workspace — so resolving a
  tenant to serve it would make the whole surface unreachable for exactly the
  people it is for: somebody who has left every workspace they were in, and
  somebody who never joined one.
*/
export const TENANTLESS_DOORS: readonly Door[] = ["root", "setup", "admin", "identity", "device", "unclaimed", "invalid"];

/** Where a request with no tenant reads from. Routing data only. */
export const DIRECTORY_REGION: RegionId = "eu";
