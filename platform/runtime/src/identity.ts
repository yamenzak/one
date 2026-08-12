/**
 * IDENTITY, STORED — the global half and the regional half, kept apart.
 *
 * ⚠️ THE SPLIT IS THE WHOLE REASON A SINGLE GLOBAL IDENTITY STORE IS AFFORDABLE:
 *
 *   GLOBAL, read at SIGN-IN     accounts, credentials, challenges
 *   REGIONAL, read PER REQUEST  sessions, carrying a snapshot of the account
 *
 * Put sessions in the global store and every request in the platform crosses a
 * region to validate one. The snapshot is what buys that back, and its cost is
 * bounded staleness — a renamed person shows their old name until they sign in
 * again, which is the correct trade and not an oversight.
 */

import type { Account, AccountSnapshot, Credential, Instant, Locale, SchemaModule, Session, SqlHandle, UserId } from "@one/kernel";
import { credentialsFor, snapshotOf } from "@one/kernel";
import { b64u } from "./webauthn.js";

/* ---------------------------------------------------------------- schema --- */

export const IDENTITY_SCHEMA: SchemaModule = {
  id: "identity",
  ddl: [
    `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0, name TEXT, avatar_url TEXT, locale TEXT NOT NULL DEFAULT 'en', created_at TEXT NOT NULL, profile_version INTEGER NOT NULL DEFAULT 1);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);`,
    /*
      ⚠️ `relying_party` IS PER CREDENTIAL, and that one column is the whole
      migration. A passkey works exactly where it was registered; raising the
      relying party to the root makes NEW credentials work everywhere while every
      existing one keeps working where it always did. A single global constant
      would have made the change a flag day with a lockout at the end of it.
    */
    `CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, relying_party TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, label TEXT);`,
    `CREATE INDEX IF NOT EXISTS idx_credentials_account ON credentials(account_id);`,
    /*
      A challenge is single-use and short-lived. It is stored rather than signed
      into a cookie because "has this one been used" is a question a stateless
      token cannot answer, and replay is the thing a challenge exists to stop.
    */
    `CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, purpose TEXT NOT NULL, account_id TEXT, origin TEXT NOT NULL, expires_at TEXT NOT NULL);`,
  ],
  /*
    ⚠️ AN ALTER, BECAUSE THE TABLE PREDATES THE COLUMN ON EVERY LIVE DEPLOYMENT.
    A `CREATE TABLE IF NOT EXISTS` carrying it is a statement that does nothing
    at all where the table is already there — which is a column that exists on
    fresh databases and nowhere else, and a read that returns undefined for
    everybody who was already here.

    ⚠️ HOW ONE PERSON READS THINGS, AND IT IS THEIRS RATHER THAN A WORKSPACE'S. A
    coach who thinks in kilograms and a client who thinks in pounds are both
    right, in the same studio, about the same barbell — so a workspace-level
    choice is one that is wrong for somebody by construction. It travels with the
    ACCOUNT rather than the membership: somebody in two studios does not change
    how they read a weight when they switch.
  */
  alters: [
    `ALTER TABLE accounts ADD COLUMN units TEXT NOT NULL DEFAULT '';`,
    /*
      ⚠️ `''` IS "FOLLOW THIS DEVICE" AND IT IS THE DEFAULT, not an unset value
      somebody has to interpret. A person who has never chosen a theme wants the
      one their phone is already in, and a stored `light` would override a
      device that went dark at sunset.
    */
    `ALTER TABLE accounts ADD COLUMN theme TEXT NOT NULL DEFAULT '';`,
    /*
      ⚠️ HAPTICS ON, SOUND OFF, AS COLUMN DEFAULTS — so every reader agrees
      without any of them applying a default of its own. An interface that makes
      a noise nobody chose is the most complained-about behaviour there is; a
      tick you feel is silent and is what every native app already does.
    */
    `ALTER TABLE accounts ADD COLUMN sound INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE accounts ADD COLUMN haptics INTEGER NOT NULL DEFAULT 1;`,
    /*
      ⚠️ WHAT THIS PERSON WANTS TO SEE FIRST, and it is theirs rather than the
      workspace's for the same reason units are: two coaches in one studio check
      different things hourly, and a shared order is one that is wrong for
      whoever did not set it.
    */
    `ALTER TABLE accounts ADD COLUMN layout TEXT NOT NULL DEFAULT '';`,
  ],
};

/**
 * ⚠️ REGIONAL, and it holds a COPY of the account rather than a reference. A
 * foreign key here would be a cross-region join on the hot path of every
 * request, which is the cost the whole design exists to avoid.
 */
/**
 * WHERE A PERSON IS SIGNED IN, ACROSS EVERY PRODUCT.
 *
 * ⚠️ GLOBAL, AND IT IS AN INDEX RATHER THAN AN AUTHORITY. The session itself
 * stays regional and is read per request with no cross-region hop — that split
 * is what makes a single identity store affordable and it is not being undone.
 * What this adds is the one question the regional store structurally cannot
 * answer: "where am I signed in", which spans apps and regions by definition.
 *
 * ⚠️ AND IT IS WHAT MAKES REVOCATION REACH ANOTHER PRODUCT. Signing a device out
 * from the account centre cannot delete a row in an app's regional store — the
 * account centre is not that app and may not be in that region. So it deletes
 * the row HERE, and each app re-checks against this table on a bounded interval.
 * See `SESSION_RECHECK_MS` for the size of that bound and what it costs.
 */
export const SESSION_DIRECTORY_SCHEMA: SchemaModule = {
  id: "session_directory",
  after: ["identity"],
  ddl: [
    `CREATE TABLE IF NOT EXISTS session_directory (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, app_id TEXT NOT NULL, origin TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, agent TEXT NOT NULL DEFAULT '');`,
    `CREATE INDEX IF NOT EXISTS idx_session_directory_account ON session_directory(account_id, created_at DESC);`,
  ],
  scoped: { tenantColumn: "account_id", tenantTables: ["session_directory"] },
};

/**
 * ⚠️ HOW LONG A REVOKED SESSION MAY SURVIVE IN ANOTHER PRODUCT, AND THE NUMBER
 * IS A TRADE RATHER THAN A DEFAULT.
 *
 * Checking the directory per request would put a cross-region read on the hot
 * path of every request in the platform, which is the one cost this whole design
 * exists to avoid. Checking never would make "sign this device out" a promise
 * that comes true at the next sign-in, which is not what anybody means by it.
 *
 * Five minutes is the window. It is stated here rather than tuned in three
 * places, and the account centre says so where somebody signs a device out — a
 * security control whose delay is a surprise is worse than one that is honest
 * about it.
 */
export const SESSION_RECHECK_MS = 5 * 60_000;

export const SESSION_SCHEMA: SchemaModule = {
  id: "sessions",
  ddl: [
    `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, origin TEXT NOT NULL, app_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, email TEXT NOT NULL, name TEXT, avatar_url TEXT, locale TEXT NOT NULL, profile_version INTEGER NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);`,
  ],
  /*
    ⚠️ WHEN THIS ROW WAS LAST WEIGHED AGAINST THE DIRECTORY. Without it every
    request either pays a cross-region read or a revoked session lives until it
    expires — and the second is what "sign out this device" would quietly mean.
  */
  alters: [`ALTER TABLE sessions ADD COLUMN checked_at TEXT NOT NULL DEFAULT '';`],
  scoped: { tenantColumn: "account_id", tenantTables: [] },
};

/* --------------------------------------------------------------- accounts --- */

interface AccountRow {
  id: string; email: string; email_verified: number; name: string | null;
  avatar_url: string | null; locale: string; created_at: string; profile_version: number;
}

const toAccount = (r: AccountRow): Account => ({
  id: r.id as UserId,
  email: r.email,
  emailVerified: r.email_verified === 1,
  name: r.name,
  avatarUrl: r.avatar_url,
  locale: r.locale as Locale,
  createdAt: r.created_at as Instant,
  profileVersion: r.profile_version,
});

export interface IdentityStore {
  byEmail(email: string): Promise<Account | null>;
  byId(id: UserId): Promise<Account | null>;
  ensure(email: string, now: Instant): Promise<Account>;
  credentials(accountId: UserId): Promise<readonly Credential[]>;
  /** Which of a person's credentials THIS door may prompt for. */
  offerable(accountId: UserId, relyingParty: string): Promise<readonly Credential[]>;
  addCredential(c: Credential): Promise<void>;
  /**
   * ⚠️ SCOPED TO THE ACCOUNT IN THE STATEMENT, not checked by the caller. A
   * read-then-delete is two statements with a window between them, and the
   * window is where somebody else's credential id gets removed by a caller who
   * guessed one.
   */
  removeCredential(id: string, accountId: UserId): Promise<void>;
  advanceCounter(credentialId: string, counter: number): Promise<void>;
  issueChallenge(purpose: string, origin: string, accountId: UserId | null, now: Instant): Promise<string>;
  /** ⚠️ Reads AND deletes. A challenge that survives its use is not a challenge. */
  consumeChallenge(id: string, purpose: string, origin: string, now: Instant): Promise<boolean>;
}

/** ⚠️ Lower-cased on the way in, so one person is one row rather than three. */
const normalise = (email: string): string => email.trim().toLowerCase();

export function identityStore(db: SqlHandle): IdentityStore {
  const ACCOUNT = `SELECT id, email, email_verified, name, avatar_url, locale, created_at, profile_version FROM accounts`;
  return {
    async byEmail(email) {
      const r = await db.first<AccountRow>(`${ACCOUNT} WHERE email = ?`, normalise(email));
      return r ? toAccount(r) : null;
    },
    async byId(id) {
      const r = await db.first<AccountRow>(`${ACCOUNT} WHERE id = ?`, id);
      return r ? toAccount(r) : null;
    },
    async ensure(email, now) {
      const existing = await this.byEmail(email);
      if (existing) return existing;
      const account: Account = {
        id: `u_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}` as UserId,
        email: normalise(email), emailVerified: false, name: null, avatarUrl: null,
        locale: "en" as Locale, createdAt: now, profileVersion: 1,
      };
      await db.run(
        `INSERT INTO accounts (id, email, email_verified, name, avatar_url, locale, created_at, profile_version)
         VALUES (?, ?, 0, NULL, NULL, ?, ?, 1) ON CONFLICT(email) DO NOTHING`,
        account.id, account.email, account.locale, account.createdAt,
      );
      // A concurrent first sign-in may have won; the row that exists is the one.
      return (await this.byEmail(email)) ?? account;
    },
    async credentials(accountId) {
      const rows = await db.all<{ id: string; account_id: string; relying_party: string; public_key: string; counter: number; created_at: string; label: string | null }>(
        `SELECT id, account_id, relying_party, public_key, counter, created_at, label FROM credentials WHERE account_id = ?`,
        accountId,
      );
      return rows.map((r) => ({
        id: r.id, accountId: r.account_id as UserId, relyingParty: r.relying_party,
        publicKey: r.public_key, counter: r.counter, createdAt: r.created_at as Instant, label: r.label,
      }));
    },
    async offerable(accountId, relyingParty) {
      return credentialsFor(await this.credentials(accountId), relyingParty);
    },
    async addCredential(c) {
      await db.run(
        `INSERT INTO credentials (id, account_id, relying_party, public_key, counter, created_at, label) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        c.id, c.accountId, c.relyingParty, c.publicKey, c.counter, c.createdAt, c.label,
      );
    },
    async removeCredential(id, accountId) {
      await db.run(`DELETE FROM credentials WHERE id = ? AND account_id = ?`, id, accountId);
    },
    async advanceCounter(credentialId, counter) {
      await db.run(`UPDATE credentials SET counter = ? WHERE id = ?`, counter, credentialId);
    },
    async issueChallenge(purpose, origin, accountId, now) {
      const id = b64u.encode(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = new Date(Date.parse(now) + 5 * 60_000).toISOString();
      await db.run(
        `INSERT INTO challenges (id, purpose, account_id, origin, expires_at) VALUES (?, ?, ?, ?, ?)`,
        id, purpose, accountId, origin, expiresAt,
      );
      return id;
    },
    async consumeChallenge(id, purpose, origin, now) {
      /*
        ⚠️ DELETE FIRST, THEN JUDGE. Reading, checking and deleting leaves a
        window where two requests both read the same unused challenge — which is
        precisely the replay a challenge exists to prevent, arrived at by being
        careful in the wrong order. The delete is the claim; what it returns is
        the verdict.
      */
      const row = await db.first<{ purpose: string; origin: string; expires_at: string }>(
        `DELETE FROM challenges WHERE id = ? RETURNING purpose, origin, expires_at`, id,
      );
      if (!row) return false;
      return row.purpose === purpose && row.origin === origin && row.expires_at > now;
    },
  };
}

/* --------------------------------------------------------------- sessions --- */

export interface SessionStore {
  create(account: Account, at: { origin: string; appId: string; agent?: string }, now: Instant, days: number): Promise<Session>;
  /**
   * ⚠️ `now` IS REQUIRED, because reading a session is also where it is weighed
   * against the directory. A signature without it is one where the recheck is a
   * separate call somebody has to remember — and the request that forgets is a
   * request serving a session somebody signed out.
   */
  read(id: string, now?: Instant): Promise<Session | null>;
  revoke(id: string): Promise<void>;
  /**
   * ⚠️ THE ONE A PERSON'S OWN "SIGN THIS DEVICE OUT" MUST USE, and the account
   * in the statement is the whole of the check.
   *
   * `revoke` takes an id alone because its callers already know whose it is —
   * a sign-out ends the session in the cookie. A surface that lets somebody name
   * an id has no such guarantee, and pairing an account-scoped delete on one
   * store with an unscoped one on the other is a check that half applies: the
   * row a caller may not see stays listed and stops working.
   */
  revokeOwn(id: string, accountId: UserId): Promise<void>;
  revokeAllFor(accountId: UserId): Promise<void>;
}

interface SessionRow {
  id: string; account_id: string; origin: string; app_id: string;
  created_at: string; expires_at: string; checked_at?: string;
  email: string; name: string | null; avatar_url: string | null; locale: string; profile_version: number;
}

const toSession = (r: SessionRow): Session => ({
  id: r.id, accountId: r.account_id as UserId, origin: r.origin, appId: r.app_id,
  createdAt: r.created_at as Instant, expiresAt: r.expires_at as Instant,
  snapshot: {
    email: r.email, name: r.name, avatarUrl: r.avatar_url,
    locale: r.locale as Locale, profileVersion: r.profile_version,
  },
});

/**
 * @param directory the GLOBAL store. ⚠️ Optional so a caller with no global
 * handle still works — a suite driving one region, a job — and absent means the
 * directory is neither written nor consulted. It is passed everywhere it exists,
 * and `runtime.ts` is the one place that matters.
 */
export function sessionStore(db: SqlHandle, directory?: SqlHandle): SessionStore {
  return {
    async create(account, at, now, days) {
      const snapshot: AccountSnapshot = snapshotOf(account);
      const session: Session = {
        id: b64u.encode(crypto.getRandomValues(new Uint8Array(32))),
        accountId: account.id, origin: at.origin, appId: at.appId,
        createdAt: now, expiresAt: new Date(Date.parse(now) + days * 86_400_000).toISOString() as Instant,
        snapshot,
      };
      await db.run(
        `INSERT INTO sessions (id, account_id, origin, app_id, created_at, expires_at, email, name, avatar_url, locale, profile_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        session.id, session.accountId, session.origin, session.appId, session.createdAt, session.expiresAt,
        snapshot.email, snapshot.name, snapshot.avatarUrl, snapshot.locale, snapshot.profileVersion,
      );
      /*
        ⚠️ AND IT IS INDEXED GLOBALLY, IN THE SAME BREATH. Not `.catch(() =>
        undefined)`: a directory write that failed silently would produce a
        session this app honours and the account centre cannot see — invisible in
        "where you are signed in" and unrevokable from there, which is exactly
        the session somebody would most want to end.
      */
      if (directory) {
        await directory.run(
          `INSERT INTO session_directory (id, account_id, app_id, origin, created_at, expires_at, agent) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
          session.id, session.accountId, session.appId, session.origin, session.createdAt, session.expiresAt,
          at.agent ?? "",
        );
      }
      return session;
    },
    async read(id, now) {
      const r = await db.first<SessionRow>(
        `SELECT id, account_id, origin, app_id, created_at, expires_at, email, name, avatar_url, locale, profile_version, checked_at FROM sessions WHERE id = ?`,
        id,
      );
      if (!r) return null;
      const session = toSession(r);
      if (!directory || !now) return session;

      /*
        ⚠️ THE RECHECK, AND IT IS SKIPPED ON ALMOST EVERY REQUEST. A session
        weighed less than `SESSION_RECHECK_MS` ago is served from the regional
        row alone, which is the hot path staying local. Only the first request
        after the window pays for a cross-region read.
      */
      const last = Date.parse(r.checked_at ?? "");
      if (Number.isFinite(last) && Date.parse(now) - last < SESSION_RECHECK_MS) return session;

      const listed = await directory
        .first<{ id: string }>(`SELECT id FROM session_directory WHERE id = ?`, id)
        /*
          ⚠️ AN UNREACHABLE DIRECTORY LEAVES THE SESSION ALONE. Failing closed
          here would sign every person on the platform out of every product the
          moment one cross-region read failed — a far larger harm than a revoked
          session surviving a few more minutes, and one nobody could act on.
          The bound is what makes that trade acceptable rather than open-ended.
        */
        .catch(() => ({ id }));
      if (!listed) {
        await db.run(`DELETE FROM sessions WHERE id = ?`, id).catch(() => undefined);
        return null;
      }
      await db.run(`UPDATE sessions SET checked_at = ? WHERE id = ?`, now, id).catch(() => undefined);
      return session;
    },
    async revoke(id) {
      await db.run(`DELETE FROM sessions WHERE id = ?`, id);
      if (directory) await directory.run(`DELETE FROM session_directory WHERE id = ?`, id).catch(() => undefined);
    },
    async revokeOwn(id, accountId) {
      await db.run(`DELETE FROM sessions WHERE id = ? AND account_id = ?`, id, accountId);
      if (directory) {
        await directory.run(
          `DELETE FROM session_directory WHERE id = ? AND account_id = ?`, id, accountId,
        ).catch(() => undefined);
      }
    },
    async revokeAllFor(accountId) {
      await db.run(`DELETE FROM sessions WHERE account_id = ?`, accountId);
      /*
        ⚠️ THE DIRECTORY IS CLEARED FOR EVERY APP, not only this one. "Sign out
        everywhere" said from inside one product means everywhere — and the other
        products learn about it on their next recheck, which is the whole reason
        the directory is the thing being written.
      */
      if (directory) {
        await directory.run(`DELETE FROM session_directory WHERE account_id = ?`, accountId).catch(() => undefined);
      }
    },
  };
}

/* ---------------------------------------------------------------- cookie --- */

export const SESSION_COOKIE = "one_session";

/**
 * ⚠️ `Domain` COMES FROM `cookieDomainFor`, WHICH RETURNS NULL MORE OFTEN THAN
 * IT LOOKS. A custom domain gets none (there is no shared parent, and a tenant's
 * own domain must not carry a session usable elsewhere); a dotless root gets
 * none because browsers refuse one; and a host ABOVE the app root gets none
 * because a host may only widen to a suffix of itself.
 *
 * A `Set-Cookie` a browser drops is a sign-in that reports success and leaves no
 * session — indistinguishable, to whoever is trying, from a wrong code.
 */
export function sessionCookie(id: string, domain: string | null, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${id}`,
    `Path=/`,
    `HttpOnly`,
    // Lax rather than Strict: a person following a link from their email into
    // the app must arrive signed in, or the link is broken for the one case it
    // exists for.
    `SameSite=Lax`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (domain) parts.push(`Domain=${domain}`);
  if (secure) parts.push(`Secure`);
  return parts.join("; ");
}

export const clearedCookie = (domain: string | null, secure: boolean): string =>
  sessionCookie("", domain, 0, secure);

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}
