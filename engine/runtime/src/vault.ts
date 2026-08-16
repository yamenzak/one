/**
 * THE FACTS THAT ARE NOT AN APP'S TO KEEP (D11).
 *
 * ⚠️ ERASURE IS CRYPTO-SHREDDING, AND THAT IS WHY THE SALT IS PER SUBJECT. One
 * write destroys somebody's salt and every ciphertext about them becomes noise —
 * everywhere, including in whatever backup already left the building. Deleting
 * rows cannot make that claim, and "we deleted your data" is a claim somebody
 * may one day have to stand behind in front of a regulator.
 *
 * ⚠️ ENCRYPTED ROWS IN THE SHARD, NOT A DURABLE OBJECT. The deciding property is
 * that erasure and export must be PROVABLE FROM DECLARATIONS: a guard has to be
 * able to walk every app and show that every sensitive fact is here. A DO holds
 * state a script cannot enumerate, so a fact left out of it would look exactly
 * like a fact that was never collected.
 *
 * ⚠️ AND EVERY READ IS RECORDED, UNCONDITIONALLY. This is the one place in the
 * framework with no opt-out: "who looked at my health record, and when" is the
 * question the whole design exists to be able to answer.
 */

import type { AccountId, TenantId, VaultBook } from "@engine/kernel";
import { newId, refuseRead, type Consent, type VaultGrant } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const VAULT_SCHEMA: SchemaModule = {
  id: "vault",
  statements: [
    /* ⚠️ ONE SALT PER SUBJECT, AND DESTROYING IT IS THE ERASURE. */
    `CREATE TABLE IF NOT EXISTS vault_subject (subject_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, salt TEXT, at TEXT NOT NULL, shredded_at TEXT);`,
    `CREATE TABLE IF NOT EXISTS vault_fact (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL, field TEXT NOT NULL, cipher TEXT NOT NULL, iv TEXT NOT NULL, at TEXT NOT NULL);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ix_vault_fact_one ON vault_fact (subject_id, field);`,
    `CREATE TABLE IF NOT EXISTS vault_consent (subject_id TEXT NOT NULL, tenant_id TEXT NOT NULL, purpose TEXT NOT NULL, given_at TEXT, withdrawn_at TEXT, PRIMARY KEY (subject_id, purpose));`,
    `CREATE TABLE IF NOT EXISTS vault_grant (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL, grantee TEXT NOT NULL, purpose TEXT NOT NULL, fields TEXT NOT NULL, until TEXT NOT NULL, at TEXT NOT NULL, revoked_at TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_vault_grant_subject ON vault_grant (subject_id, grantee);`,
    /* ⚠️ No opt-out here — see the header. */
    `CREATE TABLE IF NOT EXISTS vault_look (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL, grantee TEXT NOT NULL, field TEXT NOT NULL, purpose TEXT NOT NULL, at TEXT NOT NULL, refused TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_vault_look_subject ON vault_look (subject_id, at);`,
  ],
};

/* ------------------------------------------------------------------ crypto --- */

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
/* ⚠️ Typed as an `ArrayBuffer` view rather than a bare `Uint8Array`: the Workers
   types accept a `SharedArrayBuffer`-backed array nowhere, and the difference is
   invisible until the first `crypto.subtle` call refuses to compile. */
const unb64 = (text: string): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(new ArrayBuffer(text.length ? atob(text).length : 0));
  const raw = atob(text);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

/**
 * ⚠️ THE KEY IS DERIVED FROM THE DEPLOYMENT SECRET AND THE SUBJECT'S SALT, so
 * neither alone is enough. A stolen database without the secret is noise; a
 * leaked secret without the row is noise; and destroying the salt makes that
 * subject's rows noise even to us.
 *
 * ⚠️ THE `info` STRING IS KEY MATERIAL, NOT A LABEL. Editing it derives a
 * different key from the same secret and salt, so every row already stored
 * becomes undecryptable — with no error until somebody reads one. It is not a
 * name to keep tidy alongside the others.
 */
async function keyFor(secret: string, salt: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: unb64(salt), info: enc.encode("one.vault") },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/* ---------------------------------------------------------------- subjects --- */

export async function openSubject(
  db: Db, tenantId: TenantId, subject: AccountId, now = new Date(),
): Promise<string> {
  const found = await db.prepare(`SELECT salt FROM vault_subject WHERE subject_id = ?`)
    .bind(subject).first<{ salt: string | null }>();
  if (found?.salt) return found.salt;
  /* ⚠️ A shredded subject is never re-opened with a new salt: that would make
     erasure a pause, and the facts written after it a second collection nobody
     consented to. */
  if (found && !found.salt) throw new Error("this subject was erased and cannot be reopened");

  const salt = b64(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32))));
  await db.prepare(
    `INSERT INTO vault_subject (subject_id, tenant_id, salt, at, shredded_at) VALUES (?, ?, ?, ?, NULL)`)
    .bind(subject, tenantId, salt, now.toISOString()).run();
  return salt;
}

/**
 * ⚠️ ONE WRITE ERASES EVERYTHING ABOUT THEM. The rows are left in place
 * deliberately — they are noise now, and deleting them as well would make the
 * count of what was held unverifiable afterwards. What is destroyed is the only
 * thing that could ever turn them back into facts.
 */
export async function shred(
  db: Db, subject: AccountId, now = new Date(),
): Promise<void> {
  await db.prepare(`UPDATE vault_subject SET salt = NULL, shredded_at = ? WHERE subject_id = ?`)
    .bind(now.toISOString(), subject).run();
}

export const shredded = async (db: Db, subject: AccountId): Promise<boolean> => {
  const row = await db.prepare(`SELECT salt FROM vault_subject WHERE subject_id = ?`)
    .bind(subject).first<{ salt: string | null }>();
  return !!row && row.salt === null;
};

/* ------------------------------------------------------------------- facts --- */

export async function keep(
  db: Db, secret: string, tenantId: TenantId, subject: AccountId,
  field: string, value: string, now = new Date(),
): Promise<void> {
  const salt = await openSubject(db, tenantId, subject, now);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, await keyFor(secret, salt), enc.encode(value));

  await db.prepare(
    `INSERT INTO vault_fact (id, tenant_id, subject_id, field, cipher, iv, at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(subject_id, field) DO UPDATE SET cipher = excluded.cipher, iv = excluded.iv, at = excluded.at`)
    .bind(newId("vlt", now), tenantId, subject, field,
      b64(new Uint8Array(cipher)), b64(iv), now.toISOString()).run();
}

export type LookRefusal = "no_consent" | "no_grant" | "grant_expired" | "outside_purpose"
  | "field_not_granted" | "unknown_field" | "erased" | "nothing_kept";

/**
 * Read one fact, if everything says you may.
 *
 * ⚠️ THE LOOK IS RECORDED WHETHER IT SUCCEEDED OR WAS REFUSED. An audit of only
 * the successful reads answers "did anybody try to look at this" with silence,
 * which is the question actually asked after something goes wrong.
 *
 * ⚠️ AND NO REFUSAL IS "NOT FOUND". Answering "no such fact" when the truth is
 * "you have no grant" teaches whoever is reading that the subject has nothing,
 * and buries an access failure inside an ordinary empty result.
 */
export async function look(
  db: Db, secret: string, book: VaultBook,
  ask: { tenantId: TenantId; subject: AccountId; field: string; purpose: string; grantee: string },
  now = new Date(),
): Promise<{ readonly value: string } | LookRefusal> {
  const at = now.toISOString();
  const record = async (refused: LookRefusal | null) => {
    await db.prepare(
      `INSERT INTO vault_look (id, tenant_id, subject_id, grantee, field, purpose, at, refused)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(newId("look", now), ask.tenantId, ask.subject, ask.grantee, ask.field, ask.purpose,
        at, refused).run();
  };

  const consents = await consentsOf(db, ask.subject);
  const grants = await grantsOf(db, ask.subject, ask.grantee);
  const refusal = refuseRead(book,
    { field: ask.field, purpose: ask.purpose, to: ask.grantee, now: at as never }, consents, grants);
  if (refusal) { await record(refusal); return refusal; }

  const subject = await db.prepare(`SELECT salt FROM vault_subject WHERE subject_id = ?`)
    .bind(ask.subject).first<{ salt: string | null }>();
  if (!subject || subject.salt === null) { await record("erased"); return "erased"; }

  const row = await db.prepare(`SELECT cipher, iv FROM vault_fact WHERE subject_id = ? AND field = ?`)
    .bind(ask.subject, ask.field).first<{ cipher: string; iv: string }>();
  if (!row) { await record("nothing_kept"); return "nothing_kept"; }

  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(row.iv) }, await keyFor(secret, subject.salt), unb64(row.cipher));
  await record(null);
  return { value: dec.decode(plain) };
}

/* --------------------------------------------------------- consent & grant --- */

export async function consentsOf(db: Db, subject: AccountId): Promise<readonly Consent[]> {
  const rows = await db.prepare(
    `SELECT subject_id, purpose, given_at, withdrawn_at FROM vault_consent WHERE subject_id = ?`)
    .bind(subject).all<{ subject_id: string; purpose: string; given_at: string | null; withdrawn_at: string | null }>();
  return rows.results.map((r) => ({
    subject: r.subject_id as AccountId, purpose: r.purpose,
    givenAt: (r.given_at as never) ?? null, withdrawnAt: (r.withdrawn_at as never) ?? null,
  }));
}

/**
 * ⚠️ WITHDRAWING IS A TIMESTAMP, NOT A DELETED ROW. "They agreed on Tuesday and
 * withdrew on Friday" is the record; deleting it leaves no evidence that the
 * reads before Friday were lawful, which is the half a deletion cannot restore.
 */
export async function consent(
  db: Db, tenantId: TenantId, subject: AccountId, purpose: string, given: boolean, now = new Date(),
): Promise<void> {
  const at = now.toISOString();
  await db.prepare(
    `INSERT INTO vault_consent (subject_id, tenant_id, purpose, given_at, withdrawn_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(subject_id, purpose) DO UPDATE SET
       given_at = CASE WHEN ? THEN COALESCE(vault_consent.given_at, ?) ELSE vault_consent.given_at END,
       withdrawn_at = CASE WHEN ? THEN NULL ELSE ? END`)
    .bind(subject, tenantId, purpose, given ? at : null, given ? 1 : 0, at, given ? 1 : 0, at).run();
}

export async function grantsOf(
  db: Db, subject: AccountId, grantee: string,
): Promise<readonly VaultGrant[]> {
  const rows = await db.prepare(
    `SELECT * FROM vault_grant WHERE subject_id = ? AND grantee = ?`).bind(subject, grantee).all();
  return rows.results.map((r) => ({
    subject: r.subject_id as AccountId,
    to: r.grantee as string,
    purpose: r.purpose as string,
    fields: JSON.parse(r.fields as string) as string[],
    until: r.until as never,
    grantedAt: r.at as never,
    ...(r.revoked_at ? { revokedAt: r.revoked_at as never } : {}),
  }));
}

/**
 * ⚠️ A GRANT EXPIRES, AND `until` IS REQUIRED. Access given for a task outlives
 * the task by default; the expiry is what makes "somebody looked at this two
 * years after they stopped working here" impossible rather than unlikely.
 */
export async function grant(
  db: Db, tenantId: TenantId, subject: AccountId,
  to: string, purpose: string, fields: readonly string[], until: Date, now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO vault_grant (id, tenant_id, subject_id, grantee, purpose, fields, until, at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
    .bind(newId("grn", now), tenantId, subject, to, purpose, JSON.stringify(fields),
      until.toISOString(), now.toISOString()).run();
}

export async function revoke(
  db: Db, subject: AccountId, to: string, now = new Date(),
): Promise<void> {
  await db.prepare(
    `UPDATE vault_grant SET revoked_at = ? WHERE subject_id = ? AND grantee = ? AND revoked_at IS NULL`)
    .bind(now.toISOString(), subject, to).run();
}

/* ------------------------------------------------------------------ export --- */

export interface Looked {
  readonly grantee: string;
  readonly field: string;
  readonly purpose: string;
  readonly at: string;
  readonly refused: string | null;
}

/**
 * ⚠️ WHO LOOKED AT WHAT, FOR THE SUBJECT'S OWN EYES. This is the half of a vault
 * that makes it worth having: not that access is controlled — every database
 * claims that — but that the person it is about can see who used it.
 */
export async function looksAt(db: Db, subject: AccountId): Promise<readonly Looked[]> {
  const rows = await db.prepare(
    `SELECT grantee, field, purpose, at, refused FROM vault_look WHERE subject_id = ? ORDER BY at DESC`)
    .bind(subject).all<{ grantee: string; field: string; purpose: string; at: string; refused: string | null }>();
  return rows.results;
}

/**
 * Everything held about somebody, in the clear, for them.
 *
 * ⚠️ AN EXPORT THAT SKIPS THE VAULT IS AN EXPORT THAT OMITS THE MOST SENSITIVE
 * HALF — and it is the half a portability request is usually about. It is walked
 * from the declarations rather than from a list, so a fact added today is in the
 * export today.
 */
export async function exportFor(
  db: Db, secret: string, book: VaultBook, subject: AccountId,
): Promise<Readonly<Record<string, string>> | "erased"> {
  const row = await db.prepare(`SELECT salt FROM vault_subject WHERE subject_id = ?`)
    .bind(subject).first<{ salt: string | null }>();
  if (!row || row.salt === null) return "erased";

  const key = await keyFor(secret, row.salt);
  const facts = await db.prepare(`SELECT field, cipher, iv FROM vault_fact WHERE subject_id = ?`)
    .bind(subject).all<{ field: string; cipher: string; iv: string }>();

  const out: Record<string, string> = {};
  for (const fact of facts.results) {
    if (!(fact.field in book)) continue;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(fact.iv) }, key, unb64(fact.cipher));
    out[fact.field] = dec.decode(plain);
  }
  return out;
}
