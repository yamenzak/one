/**
 * ── PLATFORM MAINTENANCE ────────────────────────────────────────────────────
 *
 * The host gate one level up.
 *
 * `standing.ts` answers "does THIS TENANT's host serve a working app" from that
 * tenant's own subscription. This answers the same question about the whole
 * deployment, from an operator's switch: during a migration, a schema change
 * that cannot be applied live, or an incident, every door but the operator's
 * stops serving — for everyone, on every hostname, at once.
 *
 * It lives beside the host gate rather than in the app because it is the same
 * shape of decision, enforced in the same place (one middleware, not ~200
 * handlers), and because every 4DL app needs it for the same reasons. Nothing
 * here knows what the app sells.
 *
 * ── The two levels, and why there are exactly two ───────────────────────────
 *
 *   readonly  The app still works. Reads are served, writes are refused. This is
 *             the level for a data migration: people can look things up, nobody
 *             can move the ground under the migration, and the blast radius is a
 *             refused save rather than an outage.
 *   full      The app is withheld and SIGNING IN IS DISABLED. This is the level
 *             for a schema change or an incident, where a half-served app is
 *             worse than an honest closed sign. Turning it on also ends every
 *             live session, because leaving people holding a session against a
 *             deployment that is refusing them is just a slower, more confusing
 *             version of the same thing.
 *
 * There is no third level between them, on purpose. "Read-only except for X" is
 * how a maintenance switch becomes a second permission system.
 *
 * ── THE WAY BACK OUT ────────────────────────────────────────────────────────
 *
 * A maintenance switch that can lock out the person who has to turn it off is
 * not a feature, it is a trap — the same class of bootstrap deadlock as a
 * deployment that cannot send the sign-in code needed to configure its own
 * mailer. So the exemptions are part of the model, not an afterthought:
 *
 *   • the OPERATOR DOOR (`admin.<root>`) is never in maintenance,
 *   • a platform admin is exempt everywhere, on every door,
 *   • `/health` and the host probe always answer, so uptime checks keep working
 *     and the app can render the notice instead of a blank error,
 *   • signature-verified provider webhooks are exempt, for the same reason they
 *     are exempt from the read-only host gate: dropping them loses money that no
 *     retry recovers.
 *
 * Those four are enforced by the route guard (`@4dl/auth`), which is where the
 * request's identity and door are known. This module owns the state and the
 * level→method rule, which is the part worth testing on its own.
 */

/** How much of the deployment is withheld. */
export type MaintenanceLevel = "off" | "readonly" | "full";

export interface Maintenance {
  level: MaintenanceLevel;
  /**
   * What the operator wants people to read — shown verbatim on the notice.
   *
   * Free text, and it should be: "back at 14:00 UTC" is worth more to the person
   * staring at it than any wording a package could pick in advance. Null when the
   * operator did not write one, and the app falls back to its own copy.
   */
  message: string | null;
  /** When the current level was set (ISO). Null when off. */
  since: string | null;
}

/** The state of a deployment nobody has touched. */
export const MAINTENANCE_OFF: Maintenance = { level: "off", message: null, since: null };

/**
 * The `app_config` keys this state lives in.
 *
 * Namespaced `platform.*` because it is the DEPLOYMENT's, not a tenant's and not
 * any one package's — the only row in `app_config` that is about the whole thing
 * rather than one integration.
 */
export const MAINTENANCE_KEYS = {
  level: "platform.maintenance",
  message: "platform.maintenance.message",
  since: "platform.maintenance.since",
} as const;

/** How long an operator's message may be. Long enough for a sentence and a time,
 *  short enough that it cannot be used to store a page. */
export const MAINTENANCE_MESSAGE_MAX = 300;

const LEVELS: readonly MaintenanceLevel[] = ["off", "readonly", "full"];

export function isMaintenanceLevel(v: unknown): v is MaintenanceLevel {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v);
}

/**
 * Read the state out of an `app_config` map.
 *
 * **Unknown values resolve to `off`**, which is the one direction this must fail
 * in. A typo'd or half-written row taking the whole deployment down — with the
 * fix being to edit the row that is causing the lockout — is exactly the failure
 * the exemptions above exist to prevent, and it would arrive without anyone
 * having chosen it.
 */
export function parseMaintenance(cfg: Record<string, string | undefined>): Maintenance {
  const raw = (cfg[MAINTENANCE_KEYS.level] ?? "").trim();
  if (!isMaintenanceLevel(raw) || raw === "off") return MAINTENANCE_OFF;
  const message = (cfg[MAINTENANCE_KEYS.message] ?? "").trim();
  return {
    level: raw,
    message: message ? message.slice(0, MAINTENANCE_MESSAGE_MAX) : null,
    since: (cfg[MAINTENANCE_KEYS.since] ?? "").trim() || null,
  };
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Does this level refuse a request made with this method?
 *
 * The whole level→method rule, in one testable function. WHO is exempt and WHICH
 * paths always answer are the guard's business, because only the guard knows the
 * door and the caller; this knows only that `readonly` is about writes and `full`
 * is about everything.
 *
 * OPTIONS never reaches here (the guard returns early on preflight), and GET/HEAD
 * pass under `readonly` by the same principle the host gate holds to: withholding
 * the product is one thing, withholding someone's own records is another.
 */
export function maintenanceRefuses(level: MaintenanceLevel, method: string): boolean {
  if (level === "full") return true;
  if (level === "readonly") return WRITE_METHODS.has(method.toUpperCase());
  return false;
}
