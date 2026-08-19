/**
 * WHAT THE DEPLOYMENT WAS TOLD — the credentials and addresses an operator sets,
 * and the one place they are kept.
 *
 * ⚠️ THE DIRECTORY, NOT A WORKER SECRET, AND THE REASON IS THAT SOMEBODY ROTATES
 * THESE. A Worker cannot write its own secrets, so a secret is a value only a
 * deploy can change — which means rotating a Stripe key is a code push, and a
 * key that has to wait for a code push is a key that stays live after it should
 * have stopped. The two that genuinely belong in secrets stay there, and both
 * are the same shape: nothing rotates them from a console. `AUTH_SECRET` and
 * `VAULT_SECRET` are the keys everything else is protected WITH, and the API
 * token is what creates the store all of this lives in.
 *
 * ⚠️ AND NOT A DURABLE OBJECT, WHICH IS THE THING PEOPLE EXPECT HERE. A DO's
 * storage is read by the same Worker in the same plaintext as D1's; what a DO
 * adds is single-threaded consistency, not secrecy. The threat is a copy of the
 * store — a backup, an export, a query somebody should not have been able to
 * run — and a DO answers none of it.
 *
 * ⚠️ SO THE VALUE IS ENVELOPE-ENCRYPTED, and that is what actually moves. The
 * ciphertext is in D1 and the key is derived from `CONFIG_SECRET`, which D1 has
 * never seen: a dump yields no usable credential. Same construction as the
 * vault, different secret on purpose — rotating THIS one costs a re-paste, and
 * rotating the vault's destroys every health record on the deployment. One name
 * for both would make an ordinary security action a catastrophe.
 *
 * ⚠️ A VALUE STORED UNDER AN OLD SECRET READS AS `set` AND `unreadable`, NEVER AS
 * ABSENT. "Nothing is configured" and "this cannot be decrypted any more" want
 * different actions from the person looking, and reporting the second as the
 * first sends them to re-enter a key while the deployment goes on failing for a
 * reason the screen denied.
 *
 * ⚠️ AND A SECRET IS NEVER READ BACK OVER THE WIRE. The console shows whether
 * one is set; the only path that decrypts is the code about to USE it. There is
 * no route that answers with a live key, which is what stops the console being a
 * way to exfiltrate one.
 */

import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const CONFIG_SCHEMA: SchemaModule = {
  id: "config",
  statements: [
    /* ⚠️ `salt` AND `iv` ARE NULL FOR A PLAIN VALUE, which is what distinguishes
       the two kinds in the row rather than in a list somebody keeps beside it. */
    `CREATE TABLE IF NOT EXISTS deployment_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, salt TEXT, iv TEXT, at TEXT NOT NULL);`,
  ],
};

/* ------------------------------------------------------------- the keys --- */

export interface CredentialDef {
  readonly id: string;
  readonly label: string;
  /** What stops working without it — the sentence the console shows. */
  readonly said: string;
  /**
   * ⚠️ A SECRET IS ENCRYPTED AND NEVER ANSWERED. A publishable key, a sender
   * address and a webhook URL are none of those things, and encrypting them
   * would only mean the console cannot show an operator what it is set to.
   */
  readonly secret: boolean;
  /** ⚠️ Grouped in the console, so a lane's keys are set together or not at all. */
  readonly lane: "email" | "stripe";
}

const def = (d: CredentialDef): CredentialDef => d;

/**
 * A LANE IS SET WHOLE OR IT DOES NOT RUN, AND HALF-SET IS THE DANGEROUS ONE.
 *
 * ⚠️ THE CONSOLE CAN SEE WHICH ROWS ARE SET AND CANNOT KNOW WHAT THE COMBINATION
 * DOES. Nothing configured is a deployment that has not started taking payments;
 * half configured is one that takes them and never hears that they landed — the
 * same two rows, opposite verdicts. So the sentence lives beside the keys, where
 * whoever adds the third one is standing.
 *
 * ⚠️ KEYED BY THE LANE UNION, so a new lane is a compile failure here rather than
 * a screen falling back to a sentence that says nothing about it.
 */
export interface LaneDef {
  readonly id: CredentialDef["lane"];
  readonly name: string;
  /** What is true while some of it is set and some is not. */
  readonly half: string;
  /** What is true while none of it is. */
  readonly off: string;
  /**
   * ⚠️ WHETHER "OFF" IS A PROBLEM OR A CHOICE. A deployment that takes no money
   * is a deployment; one that sends no mail cannot let anybody in, because the
   * sign-in code goes by post. Only the first is allowed to be quiet.
   */
  readonly needed: boolean;
}

export const LANES: Readonly<Record<CredentialDef["lane"], LaneDef>> = {
  email: {
    id: "email", name: "Email", needed: true,
    half: "Mail needs both of these, so none is going out",
    off: "No mail leaves here, so nobody can be sent a sign-in code",
  },
  stripe: {
    id: "stripe", name: "Payments", needed: false,
    half: "A key with no signing secret takes money and never hears that it landed",
    off: "Nothing can be bought here yet",
  },
};

/**
 * ⚠️ AN EXPLICIT REGISTRY, AND THE WRITE IS CHECKED AGAINST IT. A free-text key
 * store is one where a typo is a value that saves, reads back, and is looked for
 * under the name somebody meant — and the console could not render itself,
 * because nothing would say what a key is for or whether it is a secret.
 */
export const CREDENTIALS: Readonly<Record<string, CredentialDef>> = {
  "email.from": def({
    id: "email.from", lane: "email", secret: false,
    label: "Sender address",
    said: "What a sign-in code is sent from. It must be a verified sender on this account.",
  }),
  "email.provider": def({
    id: "email.provider", lane: "email", secret: false,
    label: "How mail leaves",
    said: "`cloudflare` sends through this Worker's binding. `off` refuses rather than pretending.",
  }),
  "stripe.secret_key": def({
    id: "stripe.secret_key", lane: "stripe", secret: true,
    label: "Secret key",
    said: "Charges nothing on its own. Without it, no workspace can start a subscription.",
  }),
  "stripe.webhook_secret": def({
    id: "stripe.webhook_secret", lane: "stripe", secret: true,
    label: "Webhook signing secret",
    said: "Without it every webhook is refused — an unsigned one is anybody claiming a payment landed.",
  }),
};

/* ------------------------------------------------------------------ crypto --- */

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

/* ⚠️ An `ArrayBuffer` view rather than a bare `Uint8Array`: the Workers types
   accept a `SharedArrayBuffer`-backed array nowhere, and the difference is
   invisible until the first `crypto.subtle` call refuses to compile. */
const unb64 = (text: string): Uint8Array<ArrayBuffer> => {
  const raw = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

/**
 * ⚠️ THE `info` STRING IS KEY MATERIAL, NOT A LABEL. Editing it derives a
 * different key from the same secret and salt, so every credential already
 * stored becomes unreadable — recoverable here by re-entering them, which is
 * exactly why this secret is not the vault's.
 */
async function keyFor(secret: string, salt: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: unb64(salt), info: enc.encode("one.config") },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/* ------------------------------------------------------------------ store --- */

export type ConfigRefusal = "no_such_key" | "no_secret_bound";

/**
 * ⚠️ NO `CONFIG_SECRET` IS A REFUSAL FOR A SECRET AND NOT FOR THE REST. Storing
 * a Stripe key in plaintext because the deployment forgot to bind a secret is
 * the failure this whole module is built against, and it would look exactly like
 * a successful save.
 */
export async function setConfig(
  db: Db, secret: string | undefined, key: string, value: string, now = new Date(),
): Promise<null | ConfigRefusal> {
  const it = CREDENTIALS[key];
  if (!it) return "no_such_key";

  /* ⚠️ Clearing is deleting the row, never storing "". A blank ciphertext would
     read back as a value that decrypts to nothing. */
  if (!value.trim()) {
    await db.prepare(`DELETE FROM deployment_config WHERE key = ?`).bind(key).run();
    return null;
  }

  if (!it.secret) {
    await db.prepare(
      `INSERT INTO deployment_config (key, value, salt, iv, at) VALUES (?, ?, NULL, NULL, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, salt = NULL, iv = NULL, at = excluded.at`)
      .bind(key, value.trim(), now.toISOString()).run();
    return null;
  }

  if (!secret) return "no_secret_bound";

  const salt = b64(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32))));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, await keyFor(secret, salt), enc.encode(value.trim()));

  await db.prepare(
    `INSERT INTO deployment_config (key, value, salt, iv, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, salt = excluded.salt, iv = excluded.iv, at = excluded.at`)
    .bind(key, b64(new Uint8Array(cipher)), salt, b64(iv), now.toISOString()).run();
  return null;
}

interface Row {
  readonly key: string;
  readonly value: string;
  readonly salt: string | null;
  readonly iv: string | null;
}

const rowFor = (db: Db, key: string): Promise<Row | null> =>
  db.prepare(`SELECT key, value, salt, iv FROM deployment_config WHERE key = ?`)
    .bind(key).first<Row>();

/**
 * THE VALUE, DECRYPTED — for the code that is about to use it and nothing else.
 *
 * ⚠️ AN UNREADABLE ROW ANSWERS `null`, THE SAME AS AN ABSENT ONE, because every
 * caller here has exactly one correct behaviour for both: refuse to pretend. The
 * DIFFERENCE is reported to the console (`configState`), which is where somebody
 * can act on it.
 */
export async function configOf(
  db: Db, secret: string | undefined, key: string,
): Promise<string | null> {
  const row = await rowFor(db, key).catch(() => null);
  if (!row) return null;
  if (!row.salt || !row.iv) return row.value;
  if (!secret) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(row.iv) }, await keyFor(secret, row.salt), unb64(row.value));
    return dec.decode(plain);
  } catch {
    /* ⚠️ Wrong secret, or a rotated one. Never a throw: a credential that cannot
       be read is a lane that is off, not a request that fails. */
    return null;
  }
}

export interface ConfigState {
  readonly id: string;
  readonly label: string;
  readonly said: string;
  readonly secret: boolean;
  readonly lane: CredentialDef["lane"];
  readonly set: boolean;
  /** ⚠️ A plain value is shown; a secret is never answered — see the header. */
  readonly value: string | null;
  /**
   * ⚠️ `false` MEANS STORED AND UNDECRYPTABLE — a rotated or missing
   * `CONFIG_SECRET`. Reporting it as absent would send somebody to re-enter a
   * key while the deployment goes on failing for a reason the screen denied.
   */
  readonly readable: boolean;
}

/** Every declared credential and what the deployment holds for it. */
export async function configState(
  db: Db, secret: string | undefined,
): Promise<readonly ConfigState[]> {
  const out: ConfigState[] = [];
  for (const it of Object.values(CREDENTIALS)) {
    const row = await rowFor(db, it.id).catch(() => null);
    const readable = !row ? true
      : !row.salt ? true
        : (await configOf(db, secret, it.id)) !== null;
    out.push({
      ...it,
      set: !!row,
      value: row && !it.secret ? row.value : null,
      readable,
    });
  }
  return out;
}
