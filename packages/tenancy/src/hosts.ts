/**
 * HOSTS — what a hostname *is*, decided in one pure place.
 *
 * 4DL apps are subdomain-first: a tenant is not a path inside a shared app, it is
 * its own origin. `acme.<root>` IS Acme's workspace, and the bare root is nothing
 * at all. That single decision is what buys the three properties a `/t/<slug>`
 * model could never have:
 *
 *   • **One passkey, every studio.** WebAuthn lets `rpID` be any ancestor of the
 *     origin down to (not including) the public suffix, so every tenant host
 *     under the root can share `rpID = kova.4dl.app` — one credential works in
 *     all of a user's studios, and a *sibling app* on `4dl.app` cannot touch it
 *     (`kova.4dl.app` is not a suffix of `otherapp.4dl.app`). See `rpIdFor`.
 *   • **Real isolation.** The tenant comes from the Host header, not the session,
 *     so pointing a session at the wrong studio grants nothing. `/t/<slug>` could
 *     only *brand* a login; it could not pin a tenancy, and the platform host's
 *     `activeOrganizationId` decided scope behind whatever brand was showing.
 *   • **A suspension has somewhere to land.** "This studio is closed" is a
 *     property of a host, so it can be enforced once at the edge instead of being
 *     re-derived by every route (see `standing.ts`).
 *
 * ── The five doors ──────────────────────────────────────────────────────────
 *
 *   root     kova.4dl.app            a dead end. Deliberately not an app, not a
 *                                    signup form, not a login. Nobody's studio
 *                                    lives here, so there is nothing to render
 *                                    but a signpost.
 *   setup    setup.kova.4dl.app      the ONLY place a studio is created.
 *   admin    admin.kova.4dl.app      the platform-operator console.
 *   tenant   <slug>.kova.4dl.app     a studio. `slug` is carried out.
 *   custom   coaching.byshujaa.com   a studio on its own domain (resolved from
 *                                    `tenant_domains`, not from the name).
 *
 * and one non-door:
 *
 *   invalid  api.kova.4dl.app        under the root but reserved, or nested
 *            a.b.kova.4dl.app        deeper than one label. Serves nothing.
 *
 * `invalid` is a distinct answer from `custom` on purpose. A hostname under our
 * own root that we do not serve must NOT fall through to the custom-domain
 * lookup: that lookup is keyed on a hostname column an owner can write to, and
 * treating `api.kova.4dl.app` as a candidate custom domain would let a tenant
 * claim an infrastructure host by typing it into the domains form.
 *
 * ── Dev ─────────────────────────────────────────────────────────────────────
 *
 * `*.localhost` resolves to 127.0.0.1 in every current browser, so dev and E2E
 * get the real topology rather than a simulation of it: `localhost:8787` is the
 * dead end, `setup.localhost:8787` creates a studio, `acme.localhost:8787` is
 * Acme. The only thing that cannot be faithful is the cookie domain — see
 * `cookieDomainFor`.
 */

/** Which kind of door a hostname is. Total: every hostname classifies. */
export type HostRole = "root" | "setup" | "admin" | "device" | "tenant" | "custom" | "invalid";

export interface HostShape {
  role: HostRole;
  /** The hostname, normalised (lowercased, no port, no trailing dot). */
  hostname: string;
  /** The subdomain label, for `role === "tenant"`. Null for every other role. */
  slug: string | null;
  /** The root domain this was classified against (the apex, or `localhost`). */
  root: string;
  /** True when the host sits inside our own root domain (any role but `custom`). */
  underRoot: boolean;
}

/** The setup door's label — where tenants are created, and nowhere else. */
export const SETUP_LABEL = "setup";
/** The platform-operator console's label. */
export const ADMIN_LABEL = "admin";

/**
 * THE DEVICE DOOR — opt-in, because most products do not have devices.
 *
 * A screen bolted to a wall is not a person and not a tenant. It has one pinned
 * URL, a Service-Worker cache, and it runs for months without anybody signing
 * in. Which tenant it belongs to arrives from its PAIRING CLAIM, not from its
 * hostname — and that difference is the whole reason this door exists:
 *
 *   • A tenant subdomain would give every tenant's screens a DIFFERENT address,
 *     so re-pairing a screen to another tenant would orphan its cache and it
 *     would boot to nothing until someone cleared the device by hand.
 *   • Custom domains would multiply certificates by the size of the fleet.
 *   • The host gate must not reach it. A screen in a public waiting room going
 *     dark because its owner's card expired is a different decision from a
 *     dashboard going read-only, and it is the app's to make in its own copy —
 *     not the edge's to make by refusing the request.
 *
 * So: one fixed origin, no tenant resolved, exempt from the gate. It is the same
 * shape as the `admin.` exemption, one door along.
 *
 * ⚠️ OPT-IN VIA `SlugOptions.deviceLabel`, and it must stay that way. Making
 * `play` a universal door would silently reclassify `play.<root>` in every app
 * on this platform — a hostname a tenant can hold today, since it is not in
 * `RESERVED_LABELS`. An app that wants the door names its label; an app that
 * does not is unchanged.
 */
export const DEFAULT_DEVICE_LABEL = "play";

/**
 * Labels a studio may never claim, because something else already answers there
 * or will need to.
 *
 * This list is a security control, not a style guide. A studio slug becomes a
 * DNS label and therefore an origin, and an origin is a trust boundary: a studio
 * that claimed `admin` would be served the operator console's URL, one that
 * claimed `setup` would intercept every new studio's first visit, and one that
 * claimed `_acme-challenge` or `autodiscover` would interfere with certificate
 * issuance and mail autoconfiguration for the whole zone.
 *
 * It does NOT include the product's or company's own names — those differ per
 * app and arrive through `checkSlug`'s `reserved` option. Everything here is
 * true for any multi-tenant product on any zone.
 *
 * It is deliberately over-broad. The cost of reserving a label a tenant wanted
 * is one extra character in their slug; the cost of releasing one we later need
 * is a migration that changes a live tenant's URL, breaks their passkeys (rpID
 * is per-host for custom domains) and invalidates every link their clients have.
 * Cheap to add, expensive to remove — so err toward reserving.
 */
export const RESERVED_LABELS: ReadonlySet<string> = new Set([
  // The other doors. Claiming one of these is a takeover, not a name clash.
  SETUP_LABEL, ADMIN_LABEL, "administrator", "console", "operator", "platform", "root", "system",
  // Web infrastructure conventions.
  "www", "www1", "www2", "web", "api", "apis", "app", "apps", "cdn", "cdn-cgi", "static",
  "assets", "media", "img", "images", "files", "file", "download", "downloads", "upload",
  "uploads", "public", "private", "internal", "proxy", "gateway", "edge", "origin", "lb",
  // Mail, and the names a mail client probes for. Squatting `autodiscover` or
  // `autoconfig` is a credential-phishing primitive against the whole zone.
  "mail", "email", "smtp", "imap", "pop", "pop3", "mx", "mx1", "mx2", "webmail",
  "autodiscover", "autoconfig", "postmaster", "hostmaster", "webmaster", "abuse", "noc",
  // DNS + certificate validation. `_acme-challenge` cannot be a slug anyway (the
  // underscore fails the shape check) but it is listed so the intent is explicit.
  // NB: bare `acme` is deliberately NOT reserved. The ACME protocol's record is
  // `_acme-challenge`, which is underscore-prefixed and sits at a different level;
  // a studio at `acme.<root>` collides with nothing, and "Acme" is a name a real
  // gym might actually use.
  "ns", "ns1", "ns2", "ns3", "ns4", "dns", "dns1", "dns2", "_acme-challenge",
  "wpad", "localhost", "localdomain",
  // Cloudflare for SaaS plumbing. `saas`/`ssl` are the conventional names for the
  // fallback origin and the CNAME target tenants point their own domain at, and
  // `cname`/`fallback` are the names an operator reaches for next. They normally
  // live on the zone APEX rather than under the root, but reserving them costs a
  // studio one character and stops a studio slug from ever shadowing the record
  // custom-domain issuance depends on.
  "ssl", "tls", "saas", "cname", "fallback", "custom", "customer", "tenant", "tenants",
  // Auth and account surfaces. A studio at `login.kova.4dl.app` would look more
  // official than the real thing.
  "auth", "oauth", "sso", "login", "signin", "sign-in", "signup", "sign-up", "register",
  "logout", "signout", "password", "passkey", "passkeys", "verify", "session", "sessions",
  "account", "accounts", "profile", "me", "my", "user", "users", "identity",
  // Money. Anything a client might mistake for a payment surface.
  "pay", "payment", "payments", "billing", "invoice", "invoices", "checkout", "subscribe",
  "subscription", "subscriptions", "stripe", "connect", "refund", "refunds", "pricing",
  // Ops, environments and anything we might stand up later.
  "status", "health", "healthz", "ready", "readyz", "metrics", "monitor", "monitoring",
  "uptime", "logs", "log", "trace", "traces", "grafana", "prometheus", "kibana", "sentry",
  "dev", "development", "test", "testing", "tests", "stage", "staging", "preview", "demo",
  "sandbox", "beta", "alpha", "canary", "next", "old", "legacy", "tmp", "temp", "backup",
  "ci", "cd", "build", "builds", "deploy", "git", "repo", "vpn", "ssh", "ftp", "sftp",
  // Protocol + versioning prefixes that would read as API surface.
  "ws", "wss", "socket", "sockets", "graphql", "grpc", "rest", "rpc", "webhook", "webhooks",
  "v0", "v1", "v2", "v3",
  // Content surfaces the platform itself publishes.
  "blog", "news", "press", "docs", "doc", "documentation", "help", "support", "faq",
  "about", "legal", "terms", "privacy", "security", "brand", "marketing", "go", "link",
  "links", "share", "invite", "invites", "referral", "shop", "store", "marketplace",
  "dashboard", "portal", "home", "index", "search", "static-assets",
]);

/** DNS labels are capped at 63 octets; slugs are capped shorter so there is
 *  headroom for prefixes and so a hostname stays readable in an address bar. */
export const SLUG_MAX = 40;
/** Two characters is a squattable namespace and reads as a country code or an
 *  abbreviation of ours; three is the floor for something that looks like a name. */
export const SLUG_MIN = 3;

export type SlugRejection =
  | "empty"
  | "too_short"
  | "too_long"
  | "bad_charset"
  | "edge_hyphen"
  | "punycode"
  | "reserved";

export type SlugCheck = { ok: true; slug: string } | { ok: false; reason: SlugRejection };

export interface SlugOptions {
  /**
   * Labels this APP reserves on top of the universal list — its product name,
   * its company, anything it publishes under. Kept out of the shared constant
   * because "kova" means nothing to a warehouse app, and a shared list that
   * accumulates every app's brand names is a list nobody can safely edit.
   */
  reserved?: ReadonlySet<string>;
  /**
   * The label this app serves DEVICES on, if it has any (Scena: `play`).
   * Unset — the default — means the app has no device door and the label is an
   * ordinary slug, exactly as before. See `DEFAULT_DEVICE_LABEL`.
   *
   * Passing it also RESERVES the label: `checkSlug` refuses it, so a tenant
   * cannot claim the origin the whole fleet is pinned to.
   */
  deviceLabel?: string;
}

/**
 * Is this string usable as a tenant's DNS label?
 *
 * Enforced on the SERVER, at the one place a slug is set. A client may slugify as
 * a convenience, but the create call is a plain HTTP POST stored as sent — so
 * shape validation in the browser is a hint, not a control.
 */
export function checkSlug(raw: string | null | undefined, opts: SlugOptions = {}): SlugCheck {
  const slug = (raw ?? "").trim().toLowerCase();
  if (!slug) return { ok: false, reason: "empty" };
  if (slug.length < SLUG_MIN) return { ok: false, reason: "too_short" };
  if (slug.length > SLUG_MAX) return { ok: false, reason: "too_long" };
  // Letters, digits and inner hyphens only. This is what rejects a dot (which
  // would let one slug span two DNS levels), an underscore, and every form of
  // Unicode homoglyph — a studio named with Cyrillic `а` must not become a
  // hostname that renders identically to a Latin one.
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, reason: "bad_charset" };
  if (slug.startsWith("-") || slug.endsWith("-")) return { ok: false, reason: "edge_hyphen" };
  // RFC 5891 reserves hyphens in the 3rd and 4th positions for IDN encodings.
  // `xn--` is the live one; the rest are reserved for future use, and a label
  // shaped like an encoding can be re-interpreted by intermediaries.
  if (slug.length >= 4 && slug[2] === "-" && slug[3] === "-") return { ok: false, reason: "punycode" };
  // The device door is a door, so it cannot also be a tenant. Checked here and
  // not only in `classifyHost` because a slug is validated at CREATE time, which
  // is the only moment refusing it is cheap.
  if (RESERVED_LABELS.has(slug) || opts.reserved?.has(slug) || slug === opts.deviceLabel) {
    return { ok: false, reason: "reserved" };
  }
  return { ok: true, slug };
}

/**
 * Human-readable reason a slug was refused, for the owner who typed it.
 *
 * `noun` is what this app calls a tenant — "studio", "warehouse", "workspace".
 * Only the empty case needs it, but it is the case an owner sees first.
 */
export function slugRejectionMessage(reason: SlugRejection, noun = "workspace"): string {
  switch (reason) {
    case "empty": return `Pick an address for your ${noun}.`;
    case "too_short": return `Use at least ${SLUG_MIN} characters.`;
    case "too_long": return `Use at most ${SLUG_MAX} characters.`;
    case "bad_charset": return "Use lowercase letters, numbers and hyphens only.";
    case "edge_hyphen": return "Can't start or end with a hyphen.";
    case "punycode": return "Can't have hyphens in the third and fourth position.";
    case "reserved": return "That address is reserved. Try adding your city or specialty.";
  }
}

/** Strip the port, the trailing dot and the case from a Host value. */
export function normalizeHostname(raw: string): string {
  let h = (raw || "").trim().toLowerCase();
  // An IPv6 literal arrives bracketed (`[::1]:8787`); take what's in the brackets.
  const v6 = /^\[([^\]]+)\]/.exec(h);
  if (v6?.[1]) return v6[1];
  h = h.split(":")[0] ?? "";
  if (h.endsWith(".")) h = h.slice(0, -1);
  return h;
}

/** True for the loopback names dev and the test suite run on. */
function isLoopback(h: string): boolean {
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost");
}

/**
 * Classify a hostname against our root domain.
 *
 * Loopback hostnames are always classified against `localhost` regardless of the
 * configured root, so `pnpm dev` and the integration suite exercise the real
 * topology (`setup.localhost`, `acme.localhost`) without needing a deployed zone.
 */
export function classifyHost(rawHostname: string, rawRoot: string, opts: SlugOptions = {}): HostShape {
  const hostname = normalizeHostname(rawHostname);
  const configuredRoot = normalizeHostname(rawRoot);
  const root = isLoopback(hostname) ? "localhost" : configuredRoot;

  const base = { hostname, root };

  if (!hostname) return { ...base, role: "invalid", slug: null, underRoot: false };

  // The bare loopback IPs are the dead end, same as the bare root domain.
  if (hostname === "127.0.0.1" || hostname === "::1") {
    return { ...base, role: "root", slug: null, underRoot: true };
  }
  if (hostname === root) return { ...base, role: "root", slug: null, underRoot: true };

  if (!root || !hostname.endsWith(`.${root}`)) {
    // Not ours — a tenant's own domain, to be resolved from `tenant_domains`.
    return { ...base, role: "custom", slug: null, underRoot: false };
  }

  const label = hostname.slice(0, -(root.length + 1));

  // Nested deeper than one label. Nothing serves these: the wildcard certificate
  // covers exactly one level, so they cannot even complete a TLS handshake.
  if (label.includes(".")) return { ...base, role: "invalid", slug: null, underRoot: true };

  if (label === SETUP_LABEL) return { ...base, role: "setup", slug: null, underRoot: true };
  if (label === ADMIN_LABEL) return { ...base, role: "admin", slug: null, underRoot: true };
  // Only when the app declared one — see `DEFAULT_DEVICE_LABEL`.
  if (opts.deviceLabel && label === opts.deviceLabel) {
    return { ...base, role: "device", slug: null, underRoot: true };
  }

  // A reserved label under our root is NOT a candidate custom domain — see the
  // module header. It serves nothing.
  const check = checkSlug(label, opts);
  if (!check.ok) return { ...base, role: "invalid", slug: null, underRoot: true };

  return { ...base, role: "tenant", slug: check.slug, underRoot: true };
}

/** The hostname a tenant with this slug is served at. */
export function tenantHostname(slug: string, root: string): string {
  return `${slug.toLowerCase()}.${normalizeHostname(root)}`;
}

/** The setup door's full hostname. */
export function setupHostname(root: string): string {
  return `${SETUP_LABEL}.${normalizeHostname(root)}`;
}

/** The operator console's full hostname. */
export function adminHostname(root: string): string {
  return `${ADMIN_LABEL}.${normalizeHostname(root)}`;
}

/** The device door's full hostname — the ONE origin a whole fleet is pinned to. */
export function deviceHostname(root: string, label = DEFAULT_DEVICE_LABEL): string {
  return `${label}.${normalizeHostname(root)}`;
}

/**
 * The WebAuthn Relying Party ID for a host.
 *
 * Under our own root every door shares `rpID = <root>`, so ONE passkey works at
 * `setup.`, at `admin.`, and at every studio a person belongs to. This is exactly
 * what WebAuthn permits — the RP ID may be any registrable-domain suffix of the
 * origin — and it is the whole reason cross-tenant identity works here at all.
 *
 * Two properties worth being explicit about, because both are load-bearing:
 *
 *  1. **It does not leak sideways.** `kova.4dl.app` is not a suffix of
 *     `otherapp.4dl.app`, so an unrelated app sharing the `4dl.app` zone cannot
 *     assert this RP ID and cannot be offered these credentials.
 *  2. **A custom domain cannot join.** `coaching.byshujaa.com` has no suffix
 *     relationship with our root, so it gets a host-scoped RP ID and its own
 *     passkey. That is a WebAuthn invariant, not a limitation we chose, and it is
 *     why the UI has to say "add a passkey here too" on a custom domain.
 */
export function rpIdFor(shape: HostShape): string {
  return shape.underRoot ? shape.root : shape.hostname;
}

/**
 * The cookie `Domain` for a host, or null to leave the cookie host-only.
 *
 * Under our root we widen to `.<root>` so one sign-in covers every studio and the
 * studio switcher can move between subdomains without re-authenticating. The
 * cookie is not sent to `otherapp.4dl.app` (a `Domain` of `kova.4dl.app` only
 * matches that name and its subdomains), so this shares a session across our own
 * doors and nothing else.
 *
 * Two cases stay host-only, both deliberately:
 *
 *  • **Custom domains.** There is no shared parent to widen to, and a tenant's
 *    own domain must not carry a session usable anywhere else.
 *  • **`localhost`.** A root with no dot is not a registrable domain, and
 *    browsers refuse a `Domain` attribute for it — so dev keeps per-subdomain
 *    sessions. Worth knowing when testing the switcher locally: it will make you
 *    sign in again at each `*.localhost`, where production will not.
 *
 * The trade-off being accepted: a widened cookie is delivered to every studio
 * subdomain, so an XSS on any one of them can act as that user in all of their
 * studios. It is HttpOnly (script cannot read it) and one worker serves every
 * host (so there is no third-party origin to compromise), which is what makes
 * this acceptable — but it is strictly wider than a host-only cookie, and it is
 * the reason `RESERVED_LABELS` is treated as a security control above.
 */
export function cookieDomainFor(shape: HostShape): string | null {
  if (!shape.underRoot) return null;
  if (!shape.root.includes(".")) return null;
  return shape.root;
}

/**
 * True when this host was classified against a dev root (`localhost`) rather than
 * a real registrable domain.
 *
 * Used where a control has to be strict in production but cannot be in dev,
 * because dev has only one root and therefore no separate doors to be strict
 * about — chiefly the operator-console lane, which production restricts to
 * `admin.<root>` while `pnpm dev` and the integration suite reach it on plain
 * `localhost`. Derived from the shape rather than an env var so the two can never
 * disagree: the same predicate that decides the cookie domain decides this.
 */
export function isDevRoot(shape: HostShape): boolean {
  return !shape.root.includes(".");
}

/** Every role, for exhaustive enumeration in tests. */
export const HOST_ROLES: readonly HostRole[] = ["root", "setup", "admin", "tenant", "custom", "invalid"];
