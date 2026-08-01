/**
 * THE CASE GUARD — the one check every route that accepts a `caseId` runs.
 *
 * A case reference is the thread that ties a procedure to what it consumed, and
 * two routes write it: consuming a lot (`stock-routes.ts`) and opening a tray
 * (`pack-routes.ts`). Neither of them is about cases, which is exactly why the
 * check lives here rather than being remembered twice.
 *
 * ── What it prevents, and neither is theoretical ────────────────────────────
 *
 * ANOTHER TENANT'S CASE ID. Nothing stops a caller sending an id they read
 * somewhere else. It leaks nothing on its own — every read is tenant-scoped —
 * but it writes a foreign key into this tenant's ledger that resolves to
 * nothing, so the trace for that procedure is quietly incomplete forever. The
 * failure is invisible at the moment it happens and only shows up when someone
 * needs the record.
 *
 * A CLOSED CASE ABSORBING WRITES. "Closed" has to mean the record of what this
 * procedure used is final, or it means nothing at all. A closed case therefore
 * refuses — and the way back in is to REOPEN it, which is a person's act and is
 * counted, so an amended record is visibly an amended record.
 */

export type CaseRefusal = "unknown_case" | "case_closed";

export interface OpenCase {
  id: string;
  case_ref: string;
  status: string;
}

/**
 * Resolve a case for writing against it.
 *
 * `null` in, `null` out — a route that takes an optional `caseId` should not
 * have to special-case the absent one. An id that IS supplied must resolve.
 */
export async function resolveCase(
  db: D1Database,
  tenantId: string,
  caseId: string | null | undefined,
): Promise<{ ok: true; case: OpenCase | null } | { ok: false; reason: CaseRefusal }> {
  if (!caseId) return { ok: true, case: null };
  const row = await db
    .prepare("SELECT id, case_ref, status FROM cases WHERE id = ? AND tenant_id = ?")
    .bind(caseId, tenantId)
    .first<OpenCase>();
  // Reported as unknown rather than forbidden: whether another tenant has a case
  // by that id is not ours to confirm. Same reasoning as the ledger's
  // `not_found` for a cross-tenant lot.
  if (!row) return { ok: false, reason: "unknown_case" };
  if (row.status !== "open") return { ok: false, reason: "case_closed" };
  return { ok: true, case: row };
}

export const CASE_REFUSAL_TEXT: Record<CaseRefusal, string> = {
  unknown_case: "That case isn't here.",
  case_closed: "That case is closed. Reopen it to add to it.",
};
