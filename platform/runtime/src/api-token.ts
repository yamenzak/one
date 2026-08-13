/**
 * A TOKEN A PERSON HOLDS, FOR ONE WORKSPACE.
 *
 * ⚠️ IT IS THE PERSON'S REACH, NEVER A COPY OF IT. A token stores no permissions
 * at all: it names an account and a workspace, and every request through it
 * resolves that member's permissions LIVE, exactly as a browser session does.
 * The alternative — a scope list frozen at issue — is the shape where somebody
 * loses a role and their token keeps it, silently, until an audit finds a
 * machine doing what its owner no longer may.
 *
 * ⚠️ AND IT PROVES NOTHING RECENT, EVER. `proof: "recent"` exists because the
 * realistic threat to an account is a borrowed laptop with an open tab, and the
 * answer is "type the code we just sent you". A machine cannot do that, and a
 * token that satisfied the gate anyway would be the one way past it — so closing
 * an account or moving money stays a thing a person does in front of a screen.
 *
 * ⚠️ THE SECRET IS SHOWN ONCE AND STORED AS A HASH. A console that can display a
 * live credential leaks one through a screen share, a support session or any
 * read of the database — and the whole reason a token exists rather than a
 * password is that it can be destroyed without disturbing the person.
 *
 * ⚠️ THE STORE IS GLOBAL, and it has to be: the token is what RESOLVES the
 * caller, so it is read before a region is known. It is `account` scope in the
 * sense `SchemaModule.global` means — a credential belonging to a person, which
 * outlives any one workspace they are in.
 */

import type { Instant, SchemaModule, SqlHandle } from "@one/kernel";

export const API_TOKEN_SCHEMA: SchemaModule = {
  /** ⚠️ Global: a token is what resolves the caller, so it is read before a region is. */
  global: "account",
  id: "api_token",
  ddl: [
    /*
      ⚠️ NO SCOPE COLUMN, AND THAT IS THE DESIGN. What a token may do is what its
      owner may do at the moment it is used — see the header. A `scopes` column
      here would be a second answer to "what may this person do", and the two
      would disagree the first time somebody's role changed.
    */
    `CREATE TABLE IF NOT EXISTS api_token (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, app_id TEXT NOT NULL, tenant_id TEXT NOT NULL, name TEXT NOT NULL, hash TEXT NOT NULL, hint TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT, expires_at TEXT, revoked_at TEXT);`,
    /* ⚠️ The lookup a request makes, and it is by HASH: the secret never appears
       in a query, a query plan or a slow-query log. */
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_api_token_hash ON api_token(hash);`,
    `CREATE INDEX IF NOT EXISTS idx_api_token_account ON api_token(account_id, app_id);`,
  ],
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["api_token"],
    subjectTables: [{ table: "api_token", column: "account_id" }],
  },
};

/** ⚠️ Recognisable in a log and in a leak scanner, and never mistakable for anything else. */
export const TOKEN_PREFIX = "one_";

export interface TokenRow {
  readonly id: string;
  readonly accountId: string;
  readonly appId: string;
  readonly tenantId: string;
  readonly name: string;
  /** ⚠️ The last four characters, so a person can tell two tokens apart. Never more. */
  readonly hint: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

/**
 * ⚠️ SHA-256 AND NOT A PASSWORD HASH, deliberately.
 *
 * A password is short, chosen by a person and guessable, which is what bcrypt's
 * work factor defends against. This is 32 random bytes: brute force is not on
 * the table, and a slow hash on the read path would put ~100ms on every API
 * request to defend against an attack that cannot happen. What a fast hash still
 * buys is the thing that matters — the database holds nothing usable.
 */
export async function hashToken(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** ⚠️ 32 bytes from the platform's own source of randomness, never from a counter. */
export const mintSecret = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return TOKEN_PREFIX + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

export interface Minted {
  readonly row: TokenRow;
  /** ⚠️ The only time this exists. Not stored, not recoverable, not shown twice. */
  readonly secret: string;
}

export async function issueToken(
  db: SqlHandle,
  input: {
    readonly accountId: string; readonly appId: string; readonly tenantId: string;
    readonly name: string; readonly expiresAt?: string | null;
  },
  at: Instant,
): Promise<Minted> {
  const secret = mintSecret();
  const id = `tok_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const row: TokenRow = {
    id, accountId: input.accountId, appId: input.appId, tenantId: input.tenantId,
    name: input.name, hint: secret.slice(-4),
    createdAt: at, lastUsedAt: null, expiresAt: input.expiresAt ?? null, revokedAt: null,
  };
  await db.run(
    `INSERT INTO api_token (id, account_id, app_id, tenant_id, name, hash, hint, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id, row.accountId, row.appId, row.tenantId, row.name,
    await hashToken(secret), row.hint, at, row.expiresAt,
  );
  return { row, secret };
}

const COLUMNS = `id, account_id, app_id, tenant_id, name, hint, created_at, last_used_at, expires_at, revoked_at`;

interface Raw {
  id: string; account_id: string; app_id: string; tenant_id: string; name: string; hint: string;
  created_at: string; last_used_at: string | null; expires_at: string | null; revoked_at: string | null;
}

const shape = (r: Raw): TokenRow => ({
  id: r.id, accountId: r.account_id, appId: r.app_id, tenantId: r.tenant_id,
  name: r.name, hint: r.hint, createdAt: r.created_at,
  lastUsedAt: r.last_used_at, expiresAt: r.expires_at, revokedAt: r.revoked_at,
});

/**
 * Every token this person holds, across every product.
 *
 * ⚠️ ACROSS PRODUCTS, because that is the question somebody actually has. A list
 * per app is a list you have to visit four places to read, which is how a
 * forgotten credential stays live — and the hub is where a person already goes
 * to see everywhere they belong.
 */
export async function tokensOf(db: SqlHandle, accountId: string): Promise<readonly TokenRow[]> {
  const rows = await db.all<Raw>(
    /* unbounded-read: one person's own credentials, which they created by hand. */
    `SELECT ${COLUMNS} FROM api_token WHERE account_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
    accountId,
  ).catch(() => []);
  return rows.map(shape);
}

export type TokenRefusal = "unknown" | "revoked" | "expired";

export type Resolved =
  | { readonly ok: true; readonly row: TokenRow }
  | { readonly ok: false; readonly why: TokenRefusal };

/**
 * Who is calling, from what they presented.
 *
 * ⚠️ EVERY REFUSAL IS THE SAME TO THE CALLER AND DIFFERENT IN THE LOG. Telling
 * an unknown token from a revoked one, out loud, turns this into an oracle for
 * which strings were ever real. The runtime answers 401 for all three; the
 * reason is for whoever is reading the logs afterwards.
 *
 * ⚠️ AND EXPIRY IS CHECKED HERE RATHER THAN SWEPT. A token that expires at
 * midnight must stop working at midnight, not at whatever time a job next runs —
 * and an expired row that is still readable is what lets somebody see when their
 * own credential lapsed.
 */
export async function resolveToken(db: SqlHandle, presented: string, at: Instant): Promise<Resolved> {
  const row = await db.first<Raw>(
    `SELECT ${COLUMNS} FROM api_token WHERE hash = ?`, await hashToken(presented),
  ).catch(() => null);
  if (!row) return { ok: false, why: "unknown" };
  if (row.revoked_at) return { ok: false, why: "revoked" };
  if (row.expires_at && row.expires_at <= at) return { ok: false, why: "expired" };
  return { ok: true, row: shape(row) };
}

/**
 * ⚠️ WHEN IT WAS LAST USED, WHICH IS THE ONLY WAY ANYBODY EVER RETIRES ONE. A
 * list of credentials with no last-used column is a list nobody dares prune, so
 * it grows forever and every entry stays live.
 *
 * ⚠️ TO THE DAY, NOT THE SECOND. A write per request would make every API call
 * two writes and turn one row into the busiest in the deployment, to answer a
 * question nobody asks more precisely than "recently".
 */
export async function noteTokenUse(db: SqlHandle, id: string, at: Instant): Promise<void> {
  await db.run(
    `UPDATE api_token SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)`,
    at, id, `${at.slice(0, 10)}T00:00:00.000Z`,
  ).catch(() => undefined);
}

/**
 * ⚠️ REVOKED, NEVER DELETED. The row is what answers "what was this thing doing
 * in our logs last Tuesday", and a person who has just revoked a leaked
 * credential is exactly who needs to read that.
 */
export async function revokeToken(db: SqlHandle, accountId: string, id: string, at: Instant): Promise<boolean> {
  const found = await db.first<{ id: string }>(
    /* ⚠️ Bound to the OWNER. Without the account in the where-clause this is a
       revoke-anybody's-token endpoint that takes an id. */
    `SELECT id FROM api_token WHERE id = ? AND account_id = ? AND revoked_at IS NULL`, id, accountId,
  ).catch(() => null);
  if (!found) return false;
  await db.run(`UPDATE api_token SET revoked_at = ? WHERE id = ?`, at, id);
  return true;
}
