/**
 * `app_config` — the platform's own runtime-tunable settings.
 *
 * One flat key/value table, read whole. It holds the things an operator must be
 * able to change on a running deployment without a redeploy: API credentials for
 * third parties, the schema markers, catalog version stamps. NOT a tenant's
 * settings (those are per-tenant rows) and NOT a place for anything a package
 * could hold in code.
 *
 * Keys are namespaced by the package that owns them — `stripe.*`, `cf.saas.*`,
 * `google.*`, `schema:*` — so `getConfig` can be read once per request and
 * dereferenced by several packages without each one paying its own query.
 *
 * Owned by core because core creates the table: the schema runner bootstraps
 * `app_config` before it can read a single marker, so anything else claiming it
 * would be claiming a table it did not create.
 *
 * ── The SHARED layer ────────────────────────────────────────────────────────
 *
 * One Cloudflare account, one Google account, one Stripe account, one Turnstile
 * widget — and, before this, one copy of each credential per app, entered by
 * hand on each app's `admin.` door. Every new product multiplied the
 * configuration rather than inheriting it, and a rotated key had to be re-pasted
 * N times or one app silently kept using the old one.
 *
 * So there is a second, OPTIONAL store underneath the table: a single KV
 * namespace (`PLATFORM_CONFIG`) bound with the SAME id into every 4DL worker,
 * holding one JSON object. `getConfig` reads the app's own row first and falls
 * back to it.
 *
 *     app_config row (non-empty)  →  wins, always
 *     shared blob                 →  the fallback
 *     neither                     →  unset, exactly as before
 *
 * Three properties this shape has and a cross-worker config API does not:
 *
 *  1. **No worker writes another worker's database.** The alternative the design
 *     started from — a central admin that pushes config into each app — is a
 *     privileged config-write HTTP endpoint in every app, authenticated by a
 *     machine token, accepting Stripe secret keys. That is strictly worse than
 *     the passkey-and-OTP human session guarding the doors today.
 *  2. **Backwards compatible by construction.** Existing rows keep winning, no
 *     migration runs, and an app that needs its own value for a shared key just
 *     sets it locally.
 *  3. **It degrades to nothing.** No binding, no behaviour change — which is
 *     what every `wrangler dev`, the whole test suite and any deployment that
 *     has not provisioned the namespace actually run.
 *
 * ── "Non-empty wins", and why not "present wins" ────────────────────────────
 *
 * Every consumer of these keys already treats `""` as unconfigured — `if
 * (!apiToken)`, `.trim()` then a falsy check, `Boolean(cfg["turnstile.secret"])`.
 * If a present-but-empty row won, clearing a key on one app's console would mask
 * the shared value with nothing anywhere naming why: the panel shows a
 * configured key and the app reports "not configured". So an empty local row
 * falls THROUGH. The cost is real and worth stating — you cannot switch a shared
 * key off for one app by blanking it. You give that app its own value, or you do
 * not share the key.
 *
 * ── What may be shared ──────────────────────────────────────────────────────
 *
 * An explicit allow-list, not "any key". A shared store that accepted
 * `schema:kova` or `platform.maintenance` would let one console's typo take down
 * every product at once, and blast radius is the whole argument against the
 * cross-worker design in the first place. `isSharedConfigKey` is the gate: the
 * write path refuses anything else, and the read path drops anything else even
 * if it reached the namespace by hand.
 */

import type { HasDb, HasPlatformConfig } from "./bindings.js";

const READ_ALL = "SELECT key, value FROM app_config";
const UPSERT =
  "INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";

/** The one KV key the shared blob lives under. */
export const SHARED_CONFIG_KEY = "platform:config";

/**
 * How long a colo may serve the shared blob from cache.
 *
 * KV is eventually consistent anyway (up to ~60s to propagate a write globally),
 * so a shorter TTL buys nothing real and costs a read on every `getConfig` —
 * which runs several times inside a single AI request. Operator config is not a
 * value anything reads in a loop expecting to watch a write land.
 */
const CACHE_TTL = 60;

/**
 * Keys whose value is a fact about the PLATFORM, not about one app.
 *
 * The test for membership is "would two apps ever legitimately hold different
 * values?". Where the answer is yes the key stays app-local, and four of those
 * are worth naming because they look shareable and are not:
 *
 *   `email.from`               carries the app's display NAME — `Kova <…>` vs
 *                              `Tessa <…>`. The address is shared (one verified
 *                              sender for the platform); the sender line is the
 *                              product's.
 *   `stripe.*.webhook_secret`  a signing secret per Stripe ENDPOINT, and each
 *                              app has its own webhook URL. Sharing it makes
 *                              every incoming event fail verification.
 *   `cf.saas.worker_name`      the script a custom hostname's route points at.
 *                              The zone and the CNAME target ARE shared (every
 *                              4DL app is under one apex), but this is per-app
 *                              by definition — and it is the one value whose
 *                              wrong setting fails SILENTLY.
 *   `platform.maintenance*`    closing Kova is not closing Tessa. That one is
 *                              the whole reason this is an allow-list.
 *
 * Also absent, and not by oversight: `schema:*` (per-database migration
 * markers), `plans.catalog_version` (the app's own catalog) and
 * `stripe.catalog_stash.*` (the app's own parked price ids). Sharing any of the
 * three corrupts state rather than merely misconfiguring it.
 */
export const SHARED_CONFIG_KEYS: readonly string[] = [
  // One Google account.
  "google.gemini_key",
  // The dev lane — read by `generate()` on every call.
  "ai.mock",
  /**
   * The credit markup — the platform DEFAULT, not the authority.
   *
   * Worth spelling out, because it was briefly listed here while doing nothing
   * at all. Metering reads `ai_models.markup`, a per-row column, so a shared
   * config value only ever reaches rows at the moment they are written: the
   * catalog sync binds it into every INSERT. That is now a real effect (the
   * sync reads the MERGED config), and it is the right one — a per-model markup
   * an operator set on one app's AI panel must not be overwritten by a platform
   * default, and existing rows keep whatever they hold.
   *
   * So: this decides what NEW models cost across the platform. Changing what
   * existing ones cost is each app's AI panel, which is where per-model pricing
   * lives.
   */
  "ai.markup",
  /**
   * One AI Gateway in front of every provider call, platform-wide. The value
   * is the gateway URL from the Cloudflare dashboard
   * (https://gateway.ai.cloudflare.com/v1/<account>/<gateway>). Set, every
   * Gemini call re-bases onto the gateway's google-ai-studio route and the
   * Workers AI binding names the gateway — per-request logs, token counts and
   * cost attribution with no auth or payload change. Unset, calls go direct
   * and nothing differs; that is what makes this a config decision rather
   * than a migration. See `geminiBaseFrom` in @4dl/ai.
   */
  "ai.gateway_base",
  // One Turnstile widget, hostname-scoped across the whole apex.
  "turnstile.secret",
  "turnstile.hostnames",
  "turnstile.site_key",
  // The mail LANE and the platform's own sender. `email.from` is per-app.
  "email.provider",
  "email.platform_from",
  "email.credits_per_email",
  // Cloudflare for SaaS. All 4DL apps live under ONE apex, so they share one
  // zone and one fallback origin — a tenant's custom hostname is registered in
  // the same zone and CNAMEs to the same target whichever product it belongs
  // to. What sends it to the right worker is the per-hostname worker ROUTE, and
  // `cf.saas.worker_name` names the script that route points at. That one is
  // genuinely per-app, and it is the value whose wrong setting fails silently:
  // the route is created, the certificate issues, the domain reports active,
  // and every request lands on a script that is not there. So it stays out.
  "cf.saas.api_token",
  "cf.saas.zone_id",
  "cf.saas.cname_target",
  // ONE STRIPE ACCOUNT, MANY APPS — see @4dl/billing-rail. The lane and the
  // account credentials are common; the per-endpoint webhook secret is not.
  // Both the lane-scoped names and the pre-lane legacy pair are listed, because
  // `resolveStripeConfig` still honours the legacy fallback.
  "stripe.mode",
  "stripe.platform_fee_bps",
  "stripe.secret_key",
  "stripe.publishable_key",
  "stripe.test.secret_key",
  "stripe.test.publishable_key",
  "stripe.live.secret_key",
  "stripe.live.publishable_key",
];

const SHARED = new Set(SHARED_CONFIG_KEYS);

/** May this key live in the shared store? Enforced on both read and write. */
export const isSharedConfigKey = (key: string): boolean => SHARED.has(key);

/**
 * Shared keys whose VALUE must never leave the worker.
 *
 * The operator console is allowed to say a credential is set and to show its
 * last four characters — enough to tell two keys apart, and to see that a
 * rotation landed. It is not allowed to read one back: the console is an
 * ordinary authenticated page, so a returned secret is a secret in a browser
 * cache, in a bug report's HAR file, and in whatever screenshotted the tab.
 *
 * Everything NOT on this list is deliberately readable, because a mode, a
 * markup, a sender and a publishable key are all things an operator needs to
 * see in full to know what the platform is doing.
 */
const SECRET = new Set([
  "google.gemini_key",
  "turnstile.secret",
  "turnstile.hostnames",
  "cf.saas.api_token",
  "stripe.secret_key",
  "stripe.test.secret_key",
  "stripe.live.secret_key",
]);

/** Is this a credential the console may confirm but never read back? */
export const isSecretConfigKey = (key: string): boolean => SECRET.has(key);

/**
 * Where `getConfig` reads from.
 *
 * The union is what makes this a non-breaking change across two dozen call
 * sites: a bare `D1Database` still works and simply never consults the shared
 * layer, which is the right answer for the readers that only ever want an
 * app-local key (the schema runner's markers, Stripe's parked catalog ids). A
 * caller holding its `env` passes the env and gets the fallback.
 */
export type ConfigSource = D1Database | (HasDb & HasPlatformConfig);

const isDb = (src: ConfigSource): src is D1Database => typeof (src as D1Database).prepare === "function";

/**
 * The shared blob, or `{}`.
 *
 * NEVER throws. A KV failure must degrade to "this key is not configured" — the
 * same state as a fresh deployment, which every consumer already handles — and
 * not to a 500 on every route of every app at once.
 */
export async function readSharedConfig(kv: KVNamespace): Promise<Record<string, string>> {
  const raw = await kv
    .get<Record<string, unknown>>(SHARED_CONFIG_KEY, { type: "json", cacheTtl: CACHE_TTL })
    .catch(() => null);
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isSharedConfigKey(k) && typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

/**
 * Merge `patch` into the shared blob. Returns what the store now holds.
 *
 * Read-modify-write on ONE key, so two operators saving different panels in the
 * same second can lose one of the two writes. Accepted rather than unnoticed:
 * the store is written from an operator console by the handful of people holding
 * a platform-admin session, and the panel re-reads after every save. The
 * alternative — a KV key per setting — makes the READ path, which runs on every
 * request of every app, pay a `list` for a write conflict that has never
 * happened.
 *
 * An empty string DELETES the key rather than storing a blank, because a blank
 * shared value and an absent one mean the same thing to every consumer and only
 * one of the two can be reported honestly.
 */
export async function writeSharedConfig(
  kv: KVNamespace,
  patch: Record<string, string>,
): Promise<Record<string, string>> {
  const next = await readSharedConfig(kv);
  for (const [k, v] of Object.entries(patch)) {
    if (!isSharedConfigKey(k)) continue;
    if (v === "") delete next[k];
    else next[k] = v;
  }
  await kv.put(SHARED_CONFIG_KEY, JSON.stringify(next));
  return next;
}

/**
 * Every setting, as one object. Cheap enough to read per request.
 *
 * The app's own row wins wherever it holds a non-empty value; the shared store
 * fills the rest. See the header for why "non-empty" and not "present".
 */
export async function getConfig(src: ConfigSource): Promise<Record<string, string>> {
  const db = isDb(src) ? src : src.DB;
  const kv = isDb(src) ? undefined : src.PLATFORM_CONFIG;

  const local = await readLocalConfig(db);
  if (!kv) return local;

  const out = await readSharedConfig(kv);
  for (const [k, v] of Object.entries(local)) {
    if (v !== "" || !(k in out)) out[k] = v;
  }
  return out;
}

async function readLocalConfig(db: D1Database): Promise<Record<string, string>> {
  const r = await db.prepare(READ_ALL).all<{ key: string; value: string }>();
  return Object.fromEntries((r.results ?? []).map((row) => [row.key, row.value]));
}

/**
 * Write one APP-LOCAL setting.
 *
 * Deliberately takes a `D1Database` and not a `ConfigSource`: this writes the
 * layer that OVERRIDES the shared one, and a writer that accepted either store
 * would eventually be handed the wrong one. The shared store has its own writer
 * above, with its own allow-list.
 */
export async function setConfig(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare(UPSERT).bind(key, value).run();
}
