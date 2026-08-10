/**
 * CONFIGURATION — two layers, and the app's own wins.
 *
 * Layer 1. Imports nothing.
 *
 * There is one Google account, one Stripe account, one Cloudflare account and
 * one Turnstile widget behind every product. Holding a copy per app means a
 * rotated key must be re-pasted per app, or one app quietly keeps the old one
 * and fails in a way nobody attributes to the rotation.
 *
 * So a key resolves from this app's own store first and falls through to a
 * shared one. The store is SHARED; no app writes another app's configuration.
 * The alternative — a central service pushing config into each product — is a
 * privileged config-write endpoint in every app, authenticated by a machine
 * token, accepting secret keys. Strictly worse than a human session on a door.
 */

/**
 * ⚠️ SHARING IS OPT-IN AND A REFUSAL MUST EXPLAIN ITSELF.
 *
 * `shared: false` is the interesting case, and it comes in two flavours that
 * look alike and are not. A key that is genuinely per-app — an email display
 * name, a per-endpoint webhook secret — merely misconfigures if shared. A key
 * like a schema marker or a catalog version CORRUPTS STATE if shared, because
 * two apps would be reading and writing each other's migration progress.
 *
 * Requiring `why` on every unshared key is what forces that distinction to be
 * written down at the declaration, where the next person adding a key will read
 * it, rather than discovered when two products disagree about which migrations
 * have run.
 */
export type ConfigKeySpec =
  | { readonly shared: true; readonly secret: boolean }
  | { readonly shared: false; readonly secret: boolean; readonly why: string };

export type ConfigRegistry = Readonly<Record<string, ConfigKeySpec>>;

export function declareConfig<const R extends ConfigRegistry>(registry: R): R {
  return registry;
}

/**
 * Resolve one key across the two layers.
 *
 * ⚠️ NON-EMPTY WINS, NOT PRESENT WINS, and the difference is load-bearing.
 *
 * Every consumer already reads `""` as unconfigured, so a blank local row must
 * fall THROUGH to the shared value rather than mask it — otherwise an operator
 * who opens a settings screen and saves it, without typing anything, silently
 * switches off a key that was working.
 *
 * The consequence, and it is a real one: you cannot turn a shared key OFF for
 * one app by blanking it. Give that app its own value, or do not share the key.
 */
export function resolveKey(key: string, local: Readonly<Record<string, string>>, shared: Readonly<Record<string, string>>, registry: ConfigRegistry): string {
  const own = local[key] ?? "";
  if (own !== "") return own;
  const spec = registry[key];
  if (!spec?.shared) return "";
  return shared[key] ?? "";
}

/** Resolve every declared key. Unknown keys are not resolved — see `writable`. */
export function resolveConfig(local: Readonly<Record<string, string>>, shared: Readonly<Record<string, string>>, registry: ConfigRegistry): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(registry)) out[key] = resolveKey(key, local, shared, registry);
  return out;
}

/**
 * ⚠️ WHETHER A KEY MAY BE WRITTEN TO THE SHARED STORE — enforced on WRITE as
 * well as on read.
 *
 * Checking only on read is the shape that looks safe and is not: an unshared key
 * written into the shared store is invisible until a second app resolves it,
 * and by then it is another product's problem with no trace of where it came
 * from. Refusing at the door keeps the blast radius at one bad request.
 */
export function writableToShared(key: string, registry: ConfigRegistry): boolean {
  return registry[key]?.shared === true;
}

/**
 * What a console may be shown.
 *
 * ⚠️ A SECRET IS WRITE-ONLY. It can be set, and whether it is set can be seen —
 * that is what an operator actually needs, since "is Stripe configured" is the
 * real question. Its VALUE never goes back over the wire, because a console that
 * can display a secret key is a console that leaks one through any read
 * vulnerability, a screen share, or a support session.
 */
export function redactConfig(values: Readonly<Record<string, string>>, registry: ConfigRegistry): Readonly<Record<string, string | boolean>> {
  const out: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = registry[key]?.secret ? value !== "" : value;
  }
  return out;
}

/**
 * Keys every deployment has, whatever it sells.
 *
 * ⚠️ `email.from` is deliberately NOT shared, and it is the one people try to
 * share. One verified sending address serves the whole platform, but the display
 * name in front of it is per-product — sharing the key means the last app to
 * save it renames the sender for every other one.
 */
export const PLATFORM_CONFIG = declareConfig({
  "stripe.mode": { shared: true, secret: false },
  "stripe.test.secret_key": { shared: true, secret: true },
  "stripe.live.secret_key": { shared: true, secret: true },
  "stripe.test.publishable_key": { shared: true, secret: false },
  "stripe.live.publishable_key": { shared: true, secret: false },
  "stripe.webhook_secret": {
    shared: false, secret: true,
    why: "Per ENDPOINT, not per account. Each app registers its own webhook and gets its own signing secret; sharing one makes every app fail verification but the one that saved it last.",
  },
  "google.gemini_key": { shared: true, secret: true },
  "turnstile.site_key": { shared: true, secret: false },
  "turnstile.secret_key": { shared: true, secret: true },
  "email.provider": { shared: true, secret: false },
  "email.brevo.key": { shared: true, secret: true },
  "email.resend.key": { shared: true, secret: true },
  "email.from": {
    shared: false, secret: false,
    why: "One verified address serves the platform, but the display name in front of it is the product's. Shared, the last app to save renames the sender for all of them.",
  },
  "platform.maintenance": {
    shared: false, secret: false,
    why: "Closing every door of one product is an operator decision about THAT product. Shared, one app's maintenance window takes the others down with it.",
  },
});
