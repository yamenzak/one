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
 */

export interface SeatVerdict {
  ok: boolean;
  used: number;
  max: number;
  /** Actionable copy: what the owner must do to make room. */
  message: string;
}

export interface SeatConfig {
  /** The role that is NOT a staff seat — the app's end-customer role. */
  customerRole: string;
  /** The tenant's ceiling, and whether `used` is within it. */
  quota: (tenantId: string, used: number) => Promise<{ ok: boolean; max: number }>;
  /** What this app calls a staff seat, singular. Used in the copy. */
  seatNoun?: string;
}

/** Seats consumed right now: every non-customer membership. */
export async function staffSeatsUsed(db: D1Database, tenantId: string, customerRole: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM "member" WHERE organizationId = ? AND role != ?')
    .bind(tenantId, customerRole)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Seats already promised: pending, unexpired, non-customer invitations. */
export async function pendingStaffSeats(db: D1Database, tenantId: string, customerRole: string): Promise<number> {
  const rows = await db
    .prepare("SELECT expiresAt FROM \"invitation\" WHERE organizationId = ? AND status = 'pending' AND role != ?")
    .bind(tenantId, customerRole)
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
  const members = await staffSeatsUsed(db, tenantId, cfg.customerRole);
  const pending = opts.countPending ? await pendingStaffSeats(db, tenantId, cfg.customerRole) : 0;
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
