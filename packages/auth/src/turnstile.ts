/**
 * Cloudflare Turnstile — a config-driven human check on the OTP-send path.
 *
 * The platform admin stores a widget's `turnstile.site_key` (public, handed to
 * the login screen) + `turnstile.secret` (server-only) in app_config. Until a
 * secret is set this is a no-op, so local dev and pre-setup deployments send
 * codes without a challenge.
 *
 * ── A widget only works on hostnames it was registered for ──────────────────
 *
 * This is the part that a multi-tenant product with CUSTOM DOMAINS has to model
 * explicitly, and the cost of not modelling it is total.
 *
 * A Turnstile widget carries an allow-list of hostnames. Listing one authorizes
 * its subdomains too, so the whole platform is covered by a single entry — but a
 * tenant's own domain is a different registrable domain and is covered by
 * nothing. Loaded there, the widget refuses to render and shows "Unable to
 * connect to website". No widget means no token; a configured secret means the
 * server demands one; and on a passwordless platform "no sign-in code" is
 * "nobody can sign in". So a studio that pointed its own domain at us got a
 * working app that could not admit a single person — at the one address it
 * actually advertises.
 *
 * Cloudflare's own answer is the **Any Hostname** widget option, which is
 * Enterprise-only. Below that, hostnames are added by hand and a widget holds
 * on the order of 10–15 of them, so "add every tenant's domain" is not a
 * mechanism either — it is a queue with a ceiling, and it needs an operator
 * between a customer and a working sign-in.
 *
 * So the check is scoped to where it can actually run. `turnstile.hostnames`
 * lists what the widget is registered for (defaulting to the platform root,
 * which is always covered because that is where the widget was made), and on a
 * host outside that list the widget is not offered and no token is demanded.
 *
 * ── Why that is not a hole ──────────────────────────────────────────────────
 *
 * It reads like a bypass and is not, for two reasons.
 *
 * It is decided by the SERVER from the request's own hostname, never by the
 * client. A caller cannot claim to be uncovered; only actually being on an
 * uncovered host does that, and the set of those hosts is the operator's list.
 *
 * And Turnstile is one of four controls on this endpoint. The 30-second
 * per-address cooldown, the per-IP hourly ceiling and invite-only eligibility
 * all still apply on a custom domain — those are what bound the abuse that
 * matters here (burning email credits, probing for known addresses). The honest
 * trade is a weaker check on tenant domains rather than a product that does not
 * work on them, and an operator who wants the check everywhere can add the
 * domain to the widget and to this list.
 */

import type { ConfigSource, HasDb, HasPlatformConfig } from "@4dl/core";
import { getConfig } from "@4dl/core";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Hostnames the widget is registered for. Comma/whitespace separated. */
export const TURNSTILE_HOSTNAMES_KEY = "turnstile.hostnames";

/**
 * Cloudflare's documented ceiling per widget, near enough to be worth saying.
 *
 * Reported by the console rather than enforced here: the real limit lives at
 * Cloudflare and moves with the plan, so treating our copy as authoritative
 * would eventually refuse a hostname the account would have accepted.
 */
export const TURNSTILE_HOSTNAME_LIMIT = 15;

/** Split an operator's list. Tolerant of commas, newlines and stray spaces. */
export function parseHostnames(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((h) => h.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
}

/**
 * Is `host` covered by the widget's hostname list?
 *
 * Cloudflare's rule, matched exactly: an entry authorizes that hostname AND
 * every subdomain of it, and wildcards are not a thing. `4dl.app` therefore
 * covers `kova.4dl.app` and `studio.kova.4dl.app`, and covers `not4dl.app`
 * never — hence the leading dot on the suffix test rather than `endsWith`.
 *
 * An EMPTY list means "we do not know what the widget covers", which must not
 * become "nothing is covered" — that would switch the bot check off everywhere
 * the moment this shipped. Callers pass the platform root as the fallback, so
 * the default is exactly the behaviour that existed before: enforced across the
 * platform, and only stood down on a genuinely foreign domain.
 */
export function hostCovered(host: string, hostnames: readonly string[]): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return false;
  return hostnames.some((entry) => h === entry || h.endsWith(`.${entry}`));
}

export interface TurnstileScope {
  /** The host being served. Omit to skip the coverage test entirely. */
  host?: string;
  /** The platform root, used when `turnstile.hostnames` is unset. */
  rootDomain?: string;
}

/** The hostname list in force: the operator's, or the platform root. */
function coveredFor(cfg: Record<string, string>, scope: TurnstileScope | undefined): string[] {
  const listed = parseHostnames(cfg[TURNSTILE_HOSTNAMES_KEY]);
  if (listed.length) return listed;
  const root = scope?.rootDomain?.trim().toLowerCase();
  return root ? [root] : [];
}

/**
 * Does the check apply on this host?
 *
 * True when a secret is configured AND the host is covered. With no `host` in
 * scope the coverage test is skipped — a caller that does not know where it is
 * gets the old, stricter answer.
 */
function appliesOn(cfg: Record<string, string>, scope: TurnstileScope | undefined): boolean {
  if (!cfg["turnstile.secret"]) return false;
  if (!scope?.host) return true;
  const covered = coveredFor(cfg, scope);
  // No list and no root to fall back on: we cannot tell, so we do not weaken.
  return covered.length === 0 || hostCovered(scope.host, covered);
}

export interface TurnstileConfig {
  siteKey: string | null;
  /** True once a server secret is configured AND this host is covered. */
  enabled: boolean;
}

/**
 * Public Turnstile config for the login screen (never leaks the secret).
 *
 * The site key is withheld on an uncovered host as well as the flag, because
 * the login screen renders the widget on `siteKey && enabled` and a widget that
 * renders only to say "Unable to connect to website" is worse than no widget:
 * it is a broken-looking box on the sign-in screen of a studio's own domain,
 * about a control that is not being applied there anyway.
 */
export async function turnstileConfig(src: ConfigSource, scope?: TurnstileScope): Promise<TurnstileConfig> {
  const cfg = await getConfig(src).catch(() => ({}) as Record<string, string>);
  const enabled = appliesOn(cfg, scope);
  return { siteKey: enabled ? cfg["turnstile.site_key"] || null : null, enabled };
}

export interface TurnstileResult {
  ok: boolean;
  hostname?: string;
  /** True when the check did not apply here — the host is outside the widget. */
  skipped?: boolean;
}

/**
 * Verify a Turnstile token. Returns `{ ok: true }` when Turnstile isn't
 * configured (disabled) so nothing is blocked before setup. When configured, a
 * missing/failed/host-mismatched token yields `{ ok: false }`.
 */
export async function verifyTurnstile(
  env: HasDb & HasPlatformConfig,
  token: string | null,
  ip: string | undefined,
  host: string,
  scope?: Omit<TurnstileScope, "host">,
): Promise<TurnstileResult> {
  const cfg = await getConfig(env).catch(() => ({}) as Record<string, string>);
  if (!cfg["turnstile.secret"]) return { ok: true }; // disabled → pass
  // The host is outside the widget, so no token could have been produced here.
  // Demanding one is not a check, it is a closed door.
  if (!appliesOn(cfg, { ...scope, host })) return { ok: true, skipped: true };
  if (!token) return { ok: false };

  try {
    const form = new FormData();
    form.set("secret", cfg["turnstile.secret"]!);
    form.set("response", token);
    if (ip) form.set("remoteip", ip);
    const res = await fetch(SITEVERIFY, { method: "POST", body: form });
    const data = (await res.json().catch(() => null)) as { success?: boolean; hostname?: string } | null;
    if (!data?.success) return { ok: false };
    // Localhost dev (if a secret were set) and the serving host must match what
    // the token was solved on — the app only serves on our hosts.
    if (data.hostname && host && data.hostname !== host) return { ok: false, hostname: data.hostname };
    return { ok: true, hostname: data.hostname };
  } catch {
    // A siteverify outage must not lock everyone out — fail open on transport
    // errors (the token itself was still Cloudflare-issued to reach us).
    return { ok: true };
  }
}
