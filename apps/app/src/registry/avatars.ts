/**
 * ONE FACE PER PERSON, EVERYWHERE.
 *
 * `Avatar` takes three props — `name`, `src`, `seed` — and every surface used to
 * assemble them by hand. Each did it slightly differently, and the result is the
 * defect this file exists to make impossible: the SAME person wearing a
 * different face depending on which screen you were on.
 *
 * The three fields, and why all three have to travel together:
 *
 *   `avatar_url`   the photo they uploaded. `POST /clients/:id/avatar` writes it
 *                  and NULLs the seed, because a photo supersedes a generated
 *                  face rather than sitting beside it.
 *   `avatar_seed`  the shuffled DiceBear seed, for someone who has no photo but
 *                  reshuffled until they liked the robot. Writing it NULLs the
 *                  url, for the same reason in reverse.
 *   the id         the seed of last resort. NOT the email — see below.
 *
 * Drop any one of them and the face changes. These were the four found in a
 * sweep, all of them the same shape and none of them visible without putting two
 * screens side by side:
 *
 *   the coach's TODAY      passed `seed={clientId}` and ignored `avatarSeed`, so
 *                          a client who reshuffled was a different robot here
 *                          than on the roster two taps away.
 *   SESSIONS               passed neither `src` nor `avatarSeed` — it already had
 *                          the whole roster loaded and used only the name, so an
 *                          uploaded photo never appeared on a booking.
 *   the client's own       passed `seed={avatarSeed}` with no id fallback, so a
 *   PROFILE                client with neither photo nor shuffle saw INITIALS of
 *                          themselves while their coach saw a robot.
 *   ACCOUNT settings       seeded from the EMAIL and passed no `src` at all — the
 *                          exact bug the app bar was fixed for and the settings
 *                          header was not, so the two disagreed about the face of
 *                          the person looking at them.
 *
 * ── Why the id and never the email ─────────────────────────────────────────
 *
 * `user.image` is Better Auth's own field and is never set on this passwordless
 * stack, and the email is not a stable identity for a face either: a client
 * whose address is corrected gets a brand-new robot, and the same human as a
 * staff member and as a client would be seeded from one string in one place and
 * another elsewhere. The CLIENT ROW is where the photo and the shuffle live, so
 * the client id is what the fallback follows.
 *
 * ── Staff have no photo, and that is a product fact rather than a gap ───────
 *
 * Nothing uploads an avatar for a staff member — there is no route for it — so
 * `staffAvatar` deliberately has no `src`. It is a separate function rather than
 * an option because "did you remember to pass the photo" is exactly the question
 * this file removes.
 */

/** Exactly what `Avatar` takes. Spread it: `<Avatar {...clientAvatar(c)} />`. */
export interface AvatarProps {
  name: string;
  src?: string | null;
  seed?: string | null;
}

/** The fields any client-shaped row must carry for its face to be right. */
export interface ClientFace {
  id: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
}

/**
 * A client's face, from any row that carries the four fields.
 *
 * Every caller passes the whole row rather than picked fields, which is the
 * point: a payload that forgot `avatarSeed` fails to typecheck here instead of
 * rendering a different robot.
 */
export function clientAvatar(c: ClientFace): AvatarProps {
  return {
    // Never blank: `Avatar` derives initials from this, and `""` renders an
    // empty circle rather than falling through to anything.
    name: c.displayName?.trim() || "Client",
    src: c.avatarUrl ?? null,
    seed: c.avatarSeed ?? c.id,
  };
}

/** A staff member's face. No photo exists to pass — see the header. */
export function staffAvatar(s: { name?: string | null; email?: string | null; userId?: string | null }): AvatarProps {
  return {
    name: s.name?.trim() || s.email || "?",
    // The user id first: an email can be corrected, and a face that changes
    // because someone fixed a typo is a face nobody recognises.
    seed: s.userId ?? s.email ?? null,
  };
}

/**
 * The signed-in person's own face.
 *
 * Staff-only personas have no client row and fall back to initials, which is
 * honest — there is nothing to draw. A staff member who ALSO trains at the
 * studio has one, and then they wear the same face their coach sees, which is
 * the whole point of resolving this from the persona rather than the account.
 */
export function meAvatar(
  user: { name?: string | null; email?: string | null },
  persona: { clientId?: string | null; avatarUrl?: string | null; avatarSeed?: string | null } | null | undefined,
): AvatarProps {
  return {
    name: user.name?.trim() || user.email || "?",
    src: persona?.avatarUrl ?? null,
    // No client record means no face to fall back to. Deliberately NOT the
    // email: initials beat a robot that disagrees with every other surface.
    seed: persona?.avatarSeed ?? persona?.clientId ?? null,
  };
}
