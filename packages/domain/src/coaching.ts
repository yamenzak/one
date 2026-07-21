/**
 * Multi-coach model (SPEC §6) — the pure rules for who may act on a client.
 *
 * A client can have several coaches. The assignment set lives in `client_trainers`
 * (tenant, client, coach, is_primary); exactly one assignment is the PRIMARY — the
 * default recipient of that client's activity notifications. Access follows the
 * role:
 *   - owner + assistant  → the whole tenant roster;
 *   - coach (trainer)    → only clients assigned to them, plus their own linked
 *                          client record if they also train at the studio;
 *   - client             → only their own record.
 *
 * The API fetches the assignment facts (is this client assigned to me? is this my
 * own record?) and applies these pure decisions, so the row-level security rule —
 * the security invariant behind `requireClientAccess` — is expressed and tested in
 * exactly one place instead of being restated in SQL at every route.
 */

export type CoachRole = "owner" | "assistant" | "trainer" | "client" | "member";

/** Roles that see the ENTIRE tenant roster (not scoped to assignments). */
export function seesWholeRoster(role: string): boolean {
  return role === "owner" || role === "assistant";
}

/** THE client-access decision. Given the caller's role and two facts the API
 *  resolves — whether the client is assigned to this coach, and whether it's the
 *  caller's own linked record — return whether access is allowed. */
export function canAccessClient(
  role: string,
  facts: { isAssignedCoach: boolean; isOwnRecord: boolean },
): boolean {
  if (seesWholeRoster(role)) return true;
  if (role === "trainer") return facts.isAssignedCoach || facts.isOwnRecord;
  if (role === "client") return facts.isOwnRecord;
  return false;
}

/** A coach assignment for a client. */
export interface CoachAssignment {
  trainerUserId: string;
  isPrimary: boolean;
}

/**
 * The PRIMARY coach of a client from its assignment set — the one flagged
 * `is_primary`, else the first assignment, else null. The primary is the default
 * recipient of the client's activity notifications (check-ins, labs, body-fat…),
 * so every "notify the coach" path resolves through this rule.
 */
export function primaryCoach<T extends CoachAssignment>(assignments: readonly T[]): T | null {
  if (!assignments.length) return null;
  return assignments.find((a) => a.isPrimary) ?? assignments[0]!;
}
