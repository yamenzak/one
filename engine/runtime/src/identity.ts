/**
 * WHO IS ASKING, AND HOW THEY PROVED IT.
 *
 * ⚠️ EMAIL CODES TODAY, AND NOT PASSKEYS — that is not built, and nothing here
 * pretends otherwise.
 *
 * ⚠️ PASSWORDLESS, AND NOT AS A FEATURE. There is no password column, so there
 * is nothing to leak, nothing to reuse from another breach, nothing to phish
 * that stays useful, and no reset flow — which is itself the most attacked path
 * in most products. A code to an inbox and a key on a device are what somebody
 * actually has.
 *
 * ⚠️ THE SESSION ID IS A RANDOM VALUE LOOKED UP IN THE DIRECTORY, NOT A SIGNED
 * CLAIM. A signed token cannot be revoked before it expires; a row can, which is
 * what "sign out everywhere" and "we suspended that account" have to mean. The
 * cost is a read per request and the read is on the store every request already
 * touches.
 *
 * ⚠️ AND A CODE IS STORED AS A HASH. It is a six-digit secret with a five-minute
 * life, which is exactly the thing somebody with a copy of the database would
 * use in the two minutes before anybody knew.
 */

import type { AccountId } from "@engine/kernel";
import {
  CODE_COOLDOWN_MS, CODE_DIGITS, CODE_LIFE_MS, CODE_TRIES, newSessionId,
} from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const IDENTITY_SCHEMA: SchemaModule = {
  id: "identity",
  statements: [
    `CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, at TEXT NOT NULL, seen_at TEXT NOT NULL, expires_at TEXT NOT NULL, proven_at TEXT, ended_at TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_session_account ON session (account_id);`,
    `CREATE TABLE IF NOT EXISTS code (id TEXT PRIMARY KEY, email TEXT NOT NULL, hash TEXT NOT NULL, at TEXT NOT NULL, expires_at TEXT NOT NULL, tries INTEGER NOT NULL, used_at TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_code_email ON code (email, at);`,
    /* ⚠️ NO `credential` TABLE UNTIL THERE IS A CEREMONY TO FILL IT. A table
       nothing writes, behind a capability nothing implements, is the exact
       shape this framework exists to refuse — it reads as built, it passes
       every test, and the first person to look for passkeys finds a schema. */
    /* ⚠️ A TOKEN IS AN ACCOUNT'S, NEVER A WORKSPACE'S. What it may do in any
       workspace is the account's membership there, resolved per request — so
       revoking a role revokes it for the token on the very next call, and a
       token found in a leak grants nothing its owner could not already do. */
    `CREATE TABLE IF NOT EXISTS api_token (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, label TEXT NOT NULL, hash TEXT NOT NULL, at TEXT NOT NULL, expires_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_api_token_hash ON api_token (hash);`,
    `CREATE INDEX IF NOT EXISTS ix_api_token_account ON api_token (account_id);`,
  ],
};

/* ------------------------------------------------------------------ codes --- */

/**
 * ⚠️ THE FOUR NUMBERS ARE THE KERNEL'S, because the page reads them too — a form
 * drawing six boxes against a server issuing eight refuses every valid code, and
 * says "that code is wrong" while doing it. Re-exported here so the callers that
 * issue and spend read them from the module that does the work.
 */
export { CODE_COOLDOWN_MS, CODE_DIGITS, CODE_LIFE_MS, CODE_TRIES };

const digits = (n: number): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  /* ⚠️ Modulo of a byte over ten is very slightly biased; over a six-digit code
     with five attempts that is not the attack anybody uses, and rejection
     sampling here would be complexity with no threat behind it. */
  return [...bytes].map((b) => String(b % 10)).join("");
};

async function hash(value: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const out = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(out)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type CodeRefusal = "too_soon" | "no_such_code" | "expired" | "wrong" | "spent";

export interface Issued {
  readonly id: string;
  /** ⚠️ Returned once, to be sent. It is never stored and never read back. */
  readonly code: string;
}

/**
 * ⚠️ THE COOLDOWN IS PER ADDRESS, and it is what stops this endpoint being a
 * way to send somebody a hundred emails. It refuses rather than silently
 * dropping, because a person who did not receive the first one needs to know why
 * pressing again does nothing.
 */
export async function issueCode(
  db: Db, email: string, secret: string, now = new Date(),
): Promise<Issued | "too_soon"> {
  const recent = await db.prepare(
    `SELECT at FROM code WHERE email = ? ORDER BY at DESC LIMIT 1`).bind(email).first<{ at: string }>();
  if (recent && now.getTime() - Date.parse(recent.at) < CODE_COOLDOWN_MS) return "too_soon";

  const code = digits(CODE_DIGITS);
  const id = `cod_${crypto.randomUUID()}`;
  await db.prepare(
    `INSERT INTO code (id, email, hash, at, expires_at, tries, used_at) VALUES (?, ?, ?, ?, ?, 0, NULL)`)
    .bind(id, email, await hash(code, secret), now.toISOString(),
      new Date(now.getTime() + CODE_LIFE_MS).toISOString()).run();
  return { id, code };
}

/**
 * ⚠️ A CODE THAT COULD NOT BE SENT MUST NOT HOLD THE COOLDOWN. The row is
 * written before the send is attempted — it has to be, or a code could be
 * delivered that we never recorded — so a send that fails leaves somebody
 * waiting a minute for a code that does not exist, and the sentence they are
 * shown is about sending too often. Undoing the issue is what makes "try again"
 * true.
 */
export async function forgetCode(db: Db, id: string): Promise<void> {
  await db.prepare(`DELETE FROM code WHERE id = ?`).bind(id).run();
}

/**
 * ⚠️ ONE CODE IS SPENT WHETHER IT WAS RIGHT OR WRONG, up to the ceiling. A code
 * that survives a wrong guess is a code somebody can grind; counting the attempt
 * before checking the value is what makes the ceiling mean anything.
 *
 * ⚠️ AND THE REFUSALS ARE DISTINCT DELIBERATELY. "That code has expired" and
 * "that code is wrong" send a person to different actions, and neither tells an
 * attacker anything they could not learn by waiting five minutes.
 */
export async function spendCode(
  db: Db, email: string, given: string, secret: string, now = new Date(),
): Promise<null | CodeRefusal> {
  const row = await db.prepare(
    `SELECT id, hash, expires_at, tries, used_at FROM code WHERE email = ? ORDER BY at DESC LIMIT 1`)
    .bind(email).first<{ id: string; hash: string; expires_at: string; tries: number; used_at: string | null }>();
  if (!row) return "no_such_code";
  if (row.used_at) return "spent";
  if (Date.parse(row.expires_at) < now.getTime()) return "expired";
  if (row.tries >= CODE_TRIES) return "spent";

  await db.prepare(`UPDATE code SET tries = tries + 1 WHERE id = ?`).bind(row.id).run();
  if (await hash(given, secret) !== row.hash) return "wrong";

  await db.prepare(`UPDATE code SET used_at = ? WHERE id = ?`).bind(now.toISOString(), row.id).run();
  return null;
}

/* --------------------------------------------------------------- sessions --- */

export const SESSION_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "one_session";

export interface Session {
  readonly id: string;
  readonly accountId: AccountId;
  readonly provenAt: string | null;
}

export async function startSession(
  db: Db, accountId: AccountId, now = new Date(), proven = true,
): Promise<Session> {
  const id = newSessionId(now);
  await db.prepare(
    `INSERT INTO session (id, account_id, at, seen_at, expires_at, proven_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`)
    .bind(id, accountId, now.toISOString(), now.toISOString(),
      new Date(now.getTime() + SESSION_LIFE_MS).toISOString(), proven ? now.toISOString() : null).run();
  return { id, accountId, provenAt: proven ? now.toISOString() : null };
}

/**
 * ⚠️ AN ENDED OR EXPIRED SESSION IS NOBODY, NOT AN ERROR. A request with a stale
 * cookie is the ordinary case — a laptop that was closed for a month — and
 * treating it as a fault produces a screen that says something went wrong when
 * what happened is that somebody needs to sign in.
 */
export async function readSession(db: Db, id: string, now = new Date()): Promise<Session | null> {
  const row = await db.prepare(
    `SELECT id, account_id, expires_at, proven_at, ended_at FROM session WHERE id = ?`)
    .bind(id).first<{ id: string; account_id: string; expires_at: string; proven_at: string | null; ended_at: string | null }>();
  if (!row || row.ended_at) return null;
  if (Date.parse(row.expires_at) < now.getTime()) return null;
  return { id: row.id, accountId: row.account_id as AccountId, provenAt: row.proven_at };
}

export async function endSession(db: Db, id: string, now = new Date()): Promise<void> {
  await db.prepare(`UPDATE session SET ended_at = ? WHERE id = ?`).bind(now.toISOString(), id).run();
}

/** ⚠️ Every session, because "sign out everywhere" is the reason a session is a
    row rather than a signed claim. */
export async function endEverySession(db: Db, accountId: AccountId, now = new Date()): Promise<void> {
  await db.prepare(`UPDATE session SET ended_at = ? WHERE account_id = ? AND ended_at IS NULL`)
    .bind(now.toISOString(), accountId).run();
}

/**
 * ⚠️ PROVING IT IS YOU AGAIN IS A STAMP ON THE SESSION, NOT A SECOND SESSION.
 * The threat this answers is a borrowed laptop with an open tab, so what has to
 * be recent is the confirmation rather than the sign-in.
 */
export async function noteProof(db: Db, id: string, now = new Date()): Promise<void> {
  await db.prepare(`UPDATE session SET proven_at = ? WHERE id = ?`).bind(now.toISOString(), id).run();
}

/* --------------------------------------------------------------- the cookie --- */

/**
 * ⚠️ ONE COOKIE FOR THE WHOLE ROOT, so one sign-in covers every door and every
 * workspace. `Domain=localhost` is rejected by browsers, so loopback gets a
 * host-only cookie and each `*.localhost` has its own jar — an honest
 * development difference rather than a bug, and it is why a test that carries a
 * session between hosts carries the cookie itself.
 */
export const cookieDomainFor = (root: string): string | null =>
  root === "localhost" || root.endsWith(".localhost") || root === "127.0.0.1" ? null : `.${root}`;

export function setCookie(id: string, root: string, maxAgeMs = SESSION_LIFE_MS): string {
  const domain = cookieDomainFor(root);
  return [
    `${SESSION_COOKIE}=${id}`,
    "Path=/",
    /* ⚠️ Not readable from script, not sent cross-site, not sent in the clear. */
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    ...(domain ? [`Domain=${domain}`] : []),
  ].join("; ");
}

export const clearCookie = (root: string): string => {
  const domain = cookieDomainFor(root);
  return [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Secure", "Max-Age=0",
    ...(domain ? [`Domain=${domain}`] : [])].join("; ");
};

/* ----------------------------------------------------------------- tokens --- */

/**
 * ⚠️ A TOKEN IS FOR A MACHINE, AND EVERYTHING ABOUT IT SAYS SO. It is shown
 * once and stored as a hash — a copy of the database holds nothing usable. It
 * expires in ninety days rather than never, because a long-lived key broadly
 * scoped is the shape every post-incident review finds at the bottom. And it
 * can never satisfy the `recent` proof gate: anything a machine can hold must
 * not stand in for a person in front of a screen, which is that gate's whole
 * reason to exist.
 */
export const TOKEN_LIFE_MS = 90 * 24 * 60 * 60 * 1000;
const TOKEN_PREFIX = "qtk_";

export interface MintedToken {
  readonly id: string;
  /** ⚠️ Returned once, to be copied. It is never stored and never read back. */
  readonly token: string;
  readonly expiresAt: string;
}

export interface TokenRow {
  readonly id: string;
  readonly label: string;
  readonly at: string;
  readonly expiresAt: string;
  readonly lastUsedAt: string | null;
  readonly revoked: boolean;
}

export async function mintToken(
  db: Db, accountId: AccountId, label: string, secret: string, now = new Date(),
): Promise<MintedToken> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = TOKEN_PREFIX + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const id = `tok_${crypto.randomUUID()}`;
  const expiresAt = new Date(now.getTime() + TOKEN_LIFE_MS).toISOString();
  await db.prepare(
    `INSERT INTO api_token (id, account_id, label, hash, at, expires_at, last_used_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`)
    .bind(id, accountId, label, await hash(token, secret), now.toISOString(), expiresAt).run();
  return { id, token, expiresAt };
}

export async function tokensOf(db: Db, accountId: AccountId): Promise<readonly TokenRow[]> {
  const rows = await db.prepare(
    `SELECT id, label, at, expires_at, last_used_at, revoked_at FROM api_token
     WHERE account_id = ? ORDER BY at DESC`).bind(accountId).all<{
      id: string; label: string; at: string; expires_at: string;
      last_used_at: string | null; revoked_at: string | null;
    }>();
  return (rows.results ?? []).map((r) => ({
    id: r.id, label: r.label, at: r.at, expiresAt: r.expires_at,
    lastUsedAt: r.last_used_at, revoked: r.revoked_at !== null,
  }));
}

/** ⚠️ Only the owner's — a token id is not a capability to revoke it. */
export async function revokeToken(
  db: Db, accountId: AccountId, id: string, now = new Date(),
): Promise<boolean> {
  const out = await db.prepare(
    `UPDATE api_token SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL`)
    .bind(now.toISOString(), id, accountId).run();
  return (out.meta?.changes ?? 0) > 0;
}

/**
 * The account behind a presented token, or nothing.
 *
 * ⚠️ EXPIRY AND REVOCATION ARE CHECKED HERE, ON EVERY USE — a token is a row,
 * not a claim, for the same reason a session is: revoking one has to mean it
 * stops working now, not when it expires.
 */
export async function accountOfToken(
  db: Db, presented: string, secret: string, now = new Date(),
): Promise<AccountId | null> {
  if (!presented.startsWith(TOKEN_PREFIX)) return null;
  const row = await db.prepare(
    `SELECT id, account_id, expires_at, revoked_at FROM api_token WHERE hash = ?`)
    .bind(await hash(presented, secret))
    .first<{ id: string; account_id: string; expires_at: string; revoked_at: string | null }>();
  if (!row) return null;
  if (row.revoked_at !== null) return null;
  if (Date.parse(row.expires_at) <= now.getTime()) return null;
  await db.prepare(`UPDATE api_token SET last_used_at = ? WHERE id = ?`)
    .bind(now.toISOString(), row.id).run();
  return row.account_id as AccountId;
}

/** The bearer token on a request, if one was presented. */
export function bearerFrom(request: Request): string | null {
  const given = request.headers.get("authorization");
  if (!given) return null;
  const [scheme, ...rest] = given.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer") return null;
  return rest.join("") || null;
}

export function sessionIdFrom(request: Request): string | null {
  const jar = request.headers.get("cookie");
  if (!jar) return null;
  for (const part of jar.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}
