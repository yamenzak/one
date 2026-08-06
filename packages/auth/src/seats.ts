/**
 * STAFF SEATS — how many people who are not end-customers a tenant may have.
 *
 * A staff seat is a `member` row whose role is not the app's customer role — the
 * OWNER INCLUDED. That is a decision worth stating out loud because it surprises
 * people: a one-seat plan is a solo tenant by design, the owner fills the seat,
 * and adding anyone requires an upgrade. It is a ceiling, not a lockout.
 *
 * ── Where the check has to fire ────────────────────────────────────────────
 *
 * Nothing here runs when a tenant is CREATED, when a customer links, or when a
 * staffer moves sideways between staff roles. It fires only where a NEW staff
 * seat is actually claimed, and there are THREE doors to that — inviting,
 * accepting an invitation, and promoting an existing member. Kova shipped with
 * only one of them checked, so the other two were free seats.
 *
 * `countPending` is the subtlety: a pending invitation is a RESERVED seat, so it
 * counts when creating one and must NOT count when accepting one (the invitation
 * being accepted would count itself and refuse the last seat).
 *
 * ── Why the seat-free set is a LIST ────────────────────────────────────────
 *
 * It was one string, `customerRole`, because Kova has exactly one principal that
 * is not staff: a client. Scena has two — a board COORDINATOR and a board
 * STATION, the accounts behind a counter's "call next" button — and they are not
 * one role wearing two hats: a coordinator drives a whole board while a station
 * drives one option of it, and both are provisioned per BOARD, so a clinic with
 * eight rooms mints eight of them. Against a single-string ceiling every one of
 * those counted as a member of staff, and a four-seat plan ran out of room
 * before anybody was hired.
 *
 * So the field is plural. An app with one such role passes a one-element array
 * and nothing changes; an app with none passes a sentinel that matches no role
 * (Tessa does) and every member counts.
 */

export interface SeatVerdict {
  ok: boolean;
  used: number;
  max: number;
  /** Actionable copy: what the owner must do to make room. */
  message: string;
}

export interface SeatConfig {
  /**
   * Every role that does NOT consume a staff seat — the app's end-customers and
   * its device-shaped principals. Empty means "every member is staff".
   */
  seatFreeRoles: readonly string[];
  /** The tenant's ceiling, and whether `used` is within it. */
  quota: (tenantId: string, used: number) => Promise<{ ok: boolean; max: number }>;
  /** What this app calls a staff seat, singular. Used in the copy. */
  seatNoun?: string;
}

/**
 * `role NOT IN (…)` with the right number of placeholders, plus the bindings.
 *
 * An empty list would make `NOT IN ()` a syntax error in SQLite, so it collapses
 * to a tautology instead — which is the correct reading: no seat-free role means
 * every membership is a seat.
 */
function notInSeatFree(roles: readonly string[]): { sql: string; binds: readonly string[] } {
  if (!roles.length) return { sql: "1 = 1", binds: [] };
  return { sql: `role NOT IN (${roles.map(() => "?").join(", ")})`, binds: roles };
}

/** Seats consumed right now: every membership whose role is not seat-free. */
export async function staffSeatsUsed(db: D1Database, tenantId: string, seatFreeRoles: readonly string[]): Promise<number> {
  const { sql, binds } = notInSeatFree(seatFreeRoles);
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM "member" WHERE organizationId = ? AND ${sql}`)
    .bind(tenantId, ...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Seats already promised: pending, unexpired invitations to a staff role. */
export async function pendingStaffSeats(db: D1Database, tenantId: string, seatFreeRoles: readonly string[]): Promise<number> {
  const { sql, binds } = notInSeatFree(seatFreeRoles);
  const rows = await db
    .prepare(`SELECT expiresAt FROM "invitation" WHERE organizationId = ? AND status = 'pending' AND ${sql}`)
    .bind(tenantId, ...binds)
    .all<{ expiresAt: string | number | null }>();
  const now = Date.now();
  return (rows.results ?? []).filter((r) => {
    const exp = r.expiresAt != null ? new Date(r.expiresAt as string).getTime() : NaN;
    return !Number.isFinite(exp) || exp >= now; // an unparseable expiry counts (fail closed)
  }).length;
}

/** Is there room for one more staff seat? */
export async function checkStaffSeat(
  db: D1Database,
  tenantId: string,
  cfg: SeatConfig,
  opts: { countPending?: boolean } = {},
): Promise<SeatVerdict> {
  const noun = cfg.seatNoun ?? "staff seat";
  const members = await staffSeatsUsed(db, tenantId, cfg.seatFreeRoles);
  const pending = opts.countPending ? await pendingStaffSeats(db, tenantId, cfg.seatFreeRoles) : 0;
  const used = members + pending;
  const { ok, max } = await cfg.quota(tenantId, used);
  const seats = `${max} ${noun}${max === 1 ? "" : "s"}`;
  const held = pending > 0 ? `${used} of them ${used === 1 ? "is" : "are"} in use or invited` : `${used} ${used === 1 ? "is" : "are"} in use`;
  const free = pending > 0 ? "Remove someone, cancel a pending invitation," : "Remove someone";
  return {
    ok,
    used,
    max,
    message: ok
      ? `${used} of ${seats} in use.`
      : `Your plan includes ${seats} and ${held}. ${free}${pending > 0 ? "" : ","} or upgrade your plan to add another.`,
  };
}
