/**
 * A STAFF MEMBER'S FACE, RESOLVED ONCE FOR EVERY PAYLOAD THAT SHOWS ONE.
 *
 * `registry/avatars.ts` on the app side makes it impossible to assemble a face
 * from the wrong fields. It cannot, however, make a payload CARRY those fields,
 * and that is where the same bug kept coming back: three separate endpoints
 * return staff-shaped rows, each joined `member` → `user`, and `user` on a
 * passwordless stack holds a name and an email and nothing else. So every one of
 * them could only draw initials or a robot seeded from an id — while the app
 * bar, reading the person's CLIENT row, drew their actual photograph.
 *
 * The three, and all three were wrong in the same way:
 *
 *   GET /api/staff     the roster on Business → Staff
 *   GET /api/members   the coach picker and the permissions screen
 *   the assigned-coach list on a client's Manage tab
 *
 * Fixing one and not the others just moves which screen disagrees, so the lookup
 * lives here and each of the three calls it.
 *
 * ── Matched on user_id first, email second ─────────────────────────────────
 *
 * A client record created by an invitation carries the email before the person
 * has ever signed in, so `user_id` is still null on it. Falling back to the
 * email is what makes a newly-invited coach who is already a client show the
 * right face on their first visit rather than after some later link-up.
 */

/**
 * Exactly the three fields `staffAvatar` reads, keyed by user id.
 *
 * A `type` and not an `interface`, deliberately: an interface has NO implicit
 * index signature, so it does not satisfy the `Record<string, unknown>` that
 * `@4dl/auth`'s `decorateMembers` seam declares — the shared package cannot
 * know one app's face shape. A type alias gets the index signature and stays
 * exactly as precise at every call site. (Same rule the entitlements engine
 * documents for `quotas`/`features`.)
 */
export type StaffFaceFields = {
  clientId: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
};

export async function staffFaces(
  db: D1Database,
  tenantId: string,
  people: { userId: string; email: string | null }[],
): Promise<Record<string, StaffFaceFields>> {
  const ids = people.map((p) => p.userId).filter(Boolean);
  const emails = people.map((p) => p.email).filter((e): e is string => !!e);
  if (!ids.length && !emails.length) return {};

  const rows = await db
    .prepare(
      `SELECT id, user_id, email, avatar_url, avatar_seed FROM clients
        WHERE tenant_id = ?
          AND (user_id IN (${ids.map(() => "?").join(",") || "NULL"})
            OR email IN (${emails.map(() => "?").join(",") || "NULL"}))`,
    )
    .bind(tenantId, ...ids, ...emails)
    .all<{ id: string; user_id: string | null; email: string | null; avatar_url: string | null; avatar_seed: string | null }>()
    // A face is decoration over a roster that must still render. A failed
    // lookup costs a photograph; it must never cost the staff screen.
    .catch(() => null);

  const byUser = new Map<string, StaffFaceFields>();
  const byEmail = new Map<string, StaffFaceFields>();
  for (const r of rows?.results ?? []) {
    const face: StaffFaceFields = { clientId: r.id, avatarUrl: r.avatar_url, avatarSeed: r.avatar_seed };
    if (r.user_id) byUser.set(r.user_id, face);
    if (r.email) byEmail.set(r.email.toLowerCase(), face);
  }

  const out: Record<string, StaffFaceFields> = {};
  for (const p of people) {
    const hit = byUser.get(p.userId) ?? (p.email ? byEmail.get(p.email.toLowerCase()) : undefined);
    if (hit) out[p.userId] = hit;
  }
  return out;
}
