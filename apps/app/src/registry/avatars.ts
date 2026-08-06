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
 * ── Staff DO have a photo, when they are also a client ─────────────────────
 *
 * This file used to say the opposite, and the claim was true about the ROUTE
 * (nothing uploads an avatar for a `member` row) while being false about the
 * PERSON. Most staff at a training studio also train there — an owner who lifts,
 * a coach who is coached — so the same human holds a `member` row and a
 * `clients` row, and the photo has been sitting on the client row the whole
 * time. The staff roster simply could not see it: `@4dl/auth`'s roster query
 * joins `member` to `user`, which on a passwordless stack carries a name and an
 * email and nothing else.
 *
 * The result was the fifth instance of this file's own bug, in the file written
 * to prevent it: Business → Staff drew a robot seeded from `userId` while the
 * app bar, two inches above, drew the same person's actual photograph. And even
 * with no photo the two disagreed — `staffAvatar` seeded from `userId`,
 * `meAvatar` from `avatarSeed ?? clientId`, so a staff member who reshuffled
 * their robot got the new one everywhere except the staff list.
 *
 * `decorateMembers` (apps/api/src/staff-routes.ts) now attaches the client
 * row's `avatarUrl` / `avatarSeed` / `clientId` to every roster row, and
 * `staffAvatar` reads them with the SAME precedence as `meAvatar`. The `userId`
 * seed survives as the last resort for genuine staff-only accounts, which is
 * the one case where there is no client row to follow.
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

/** The fields a staff row carries once `decorateMembers` has run. */
export interface StaffFace {
  name?: string | null;
  email?: string | null;
  userId?: string | null;
  /** From the person's own client row, when they have one. */
  clientId?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
}

/**
 * A staff member's face — the same face they wear everywhere else.
 *
 * The precedence is `meAvatar`'s, deliberately and to the letter: photo, then
 * shuffled seed, then the client id, then the user id. Any divergence here is a
 * person with two faces, which is the whole thing this file exists to stop.
 */
export function staffAvatar(s: StaffFace): AvatarProps {
  return {
    name: s.name?.trim() || s.email || "?",
    src: s.avatarUrl ?? null,
    // The email is never a seed: it can be corrected, and a face that changes
    // because somebody fixed a typo is a face nobody recognises.
    seed: s.avatarSeed ?? s.clientId ?? s.userId ?? null,
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
