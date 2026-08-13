/**
 * MAINTENANCE — the standing gate one level up.
 *
 * ⚠️ THIS IS ABOUT US, AND THAT CHANGES EVERY DECISION IN THE FILE.
 *
 * The standing ladder closes ONE workspace over ONE workspace's bill, and the
 * person seeing it can do something: pay, or leave. Maintenance closes every
 * door because an operator said so. Nobody reading it did anything, nobody can
 * pay to end it, and the only thing they can do is come back later — so the copy
 * is different, the exemptions are different, and the two must never share a
 * code path that could confuse one for the other.
 */

import type { Instant, SqlHandle } from "@one/kernel";

/**
 * ⚠️ TWO MODES, AND THE DIFFERENCE IS WHETHER READS SURVIVE.
 *
 * `readonly` is a migration: everything is still visible, writes are refused,
 * and nobody is signed out. `full` is an incident: the product is withheld and
 * sign-in is disabled, because letting somebody in to see a broken thing costs
 * more than the door being shut.
 */
export type MaintenanceMode = "off" | "readonly" | "full";

export interface Maintenance {
  readonly mode: MaintenanceMode;
  /** Shown to whoever is turned away. Ours, and never a stack trace. */
  readonly message: string;
  /** When it is expected to end. Absent is honest; a wrong one is not. */
  readonly until?: Instant;
}

export const OPEN: Maintenance = { mode: "off", message: "" };

/**
 * ⚠️ WHAT SURVIVES MAINTENANCE, AND NONE OF IT IS OPTIONAL.
 *
 * `health` because a deployment nobody can probe is one nobody can tell has
 * recovered. `webhook` because a payment provider retries into a closed door and
 * eventually gives up, and the event it gives up on is money. Both are machine
 * lanes with no person behind them, which is why closing them buys nothing.
 *
 * ⚠️ `identity` IS DELIBERATELY ABSENT. A `full` stop disables sign-in, and that
 * is the feature rather than an oversight: the alternative is letting somebody
 * authenticate into a product that is not there, which spends their trust to
 * save them nothing.
 */
export const SURVIVES_MAINTENANCE: readonly string[] = ["health", "webhook"];

/**
 * ⚠️ IT DOES NOT STAND DOWN IN DEVELOPMENT.
 *
 * The standing gate's operator-door restriction does, because development has a
 * single root and therefore no separate door. This one must not: sparing every
 * request in development spares the whole test suite too, so the switch would
 * appear to work while withholding nothing — which is exactly the state a
 * maintenance switch must never be in.
 */
export function refuses(state: Maintenance, lane: string, mutates: boolean, isOperator: boolean): boolean {
  if (state.mode === "off") return false;
  if (isOperator) return false;
  if (SURVIVES_MAINTENANCE.includes(lane)) return false;
  return state.mode === "full" ? true : mutates;
}

/* --------------------------------------------------------------- storage --- */

/**
 * ⚠️ THE GLOBAL STORE, because maintenance is deployment-wide and is read before
 * a region is known. It is also the one thing an operator needs to be able to
 * set when a region is exactly what is broken.
 */
export const PLATFORM_STATE_SCHEMA = {
  /** ⚠️ Global: one switch, every door — a maintenance mode that half-applied would be worse than none. */
  global: "deployment" as const,
  id: "platform_state",
  /*
    ⚠️ deployment-wide: the maintenance switch closes EVERY door because an
    operator said so, which is one decision about one deployment rather than
    something each product answers separately. Keying it per app would buy the
    ability to take one product down and cost the property the switch exists
    for — one row, read once per request, that cannot half-apply.
  */
  ddl: [`CREATE TABLE IF NOT EXISTS platform_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, at TEXT NOT NULL);`],
};

const KEY = "maintenance";

export async function readMaintenance(db: SqlHandle): Promise<Maintenance> {
  const row = await db.first<{ value: string }>(`SELECT value FROM platform_state WHERE key = ?`, KEY).catch(() => null);
  if (!row) return OPEN;
  try {
    const parsed = JSON.parse(row.value) as Maintenance;
    /*
      ⚠️ AN UNREADABLE ROW MEANS OPEN, NOT CLOSED. Failing closed here would take
      an entire deployment down over a malformed string — and the operator's way
      to fix it is a request, which would be refused.
    */
    return parsed.mode === "readonly" || parsed.mode === "full" ? parsed : OPEN;
  } catch {
    return OPEN;
  }
}

export const setMaintenance = (db: SqlHandle, state: Maintenance, at: Instant): Promise<void> =>
  db.run(
    `INSERT INTO platform_state (key, value, at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, at = excluded.at`,
    KEY, JSON.stringify(state), at,
  );
