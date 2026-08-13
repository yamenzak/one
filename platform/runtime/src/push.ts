/**
 * WEB PUSH — a notification that arrives with the tab closed.
 *
 * ⚠️ IT IS WRITTEN AGAINST WEBCRYPTO RATHER THAN AGAINST `web-push`, and that is
 * not purity. The library is Node-shaped: it wants `nodejs_compat`, `crypto`,
 * `https` and a dependency tree, in a package that carries exactly one
 * dependency on purpose. What it actually does is two published algorithms —
 * RFC 8291 for the encryption and RFC 8292 for the signature — and both are
 * WebCrypto primitives a Worker already has.
 *
 * ⚠️ THE PAYLOAD IS ENCRYPTED TO THE DEVICE, NOT TO THE PUSH SERVICE. That is
 * the whole shape of RFC 8291: Google, Mozilla and Microsoft run the endpoints
 * and none of them can read what goes through. A push whose body we handed over
 * in the clear would be one where the sentence "your card was declined" is
 * legible to whoever operates the queue.
 *
 * ⚠️ A DEAD SUBSCRIPTION IS DELETED ON SIGHT, and the push service tells us
 * which: 404 and 410 mean the browser is gone for good. A list nobody prunes is
 * one that grows for ever, and every send pays for every device anybody has ever
 * signed in from.
 *
 * ⚠️ AND A DEPLOYMENT WITH NO KEYS DOES NOT OFFER PUSH. `channelsFor` is handed
 * what this deployment can actually deliver, so an unconfigured one shows no
 * switch — rather than a switch that silently does nothing, which is why the
 * channel was removed from this platform once already.
 */

import type { Instant, SchemaModule, SqlHandle } from "@one/kernel";

/* --------------------------------------------------------------- the keys --- */

/**
 * ⚠️ ONE KEY PAIR PER DEPLOYMENT, IN THE SHARED STORE. A browser binds a
 * subscription to the application server key it was created with, so a key that
 * differed per app would mean a person subscribing once per product — and a key
 * that ROTATED would silently invalidate every subscription in existence, with
 * the only symptom being that push quietly stops.
 */
export const VAPID_PUBLIC = "push.vapid_public";
export const VAPID_PRIVATE = "push.vapid_private";
/** Who a push service should complain to. An address, as `mailto:`. */
export const VAPID_SUBJECT = "push.vapid_subject";

export interface PushKeys {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
}

/**
 * ⚠️ ALL THREE OR NOTHING. A pair with no subject is refused by some push
 * services and accepted by others, which is the worst kind of half-configured:
 * it works in testing and drops a third of the fleet in production.
 */
export function keysFrom(values: Readonly<Record<string, string>>): PushKeys | null {
  const publicKey = (values[VAPID_PUBLIC] ?? "").trim();
  const privateKey = (values[VAPID_PRIVATE] ?? "").trim();
  const subject = (values[VAPID_SUBJECT] ?? "").trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/* -------------------------------------------------------------- the store --- */

/**
 * ⚠️ REGIONAL AND TENANT-SCOPED, LIKE THE INBOX IT DELIVERS. A subscription is
 * how one person is reached about one workspace's business; keeping it in the
 * global store would put a device token for every product in one table and make
 * erasing a workspace unable to reach it.
 *
 * ⚠️ AND THE ENDPOINT IS THE IDENTITY. A browser hands back the same endpoint
 * for the same registration, so subscribing twice from one device has to be one
 * row — or every send is duplicated per re-subscribe, for ever.
 */
export const PUSH_SCHEMA: SchemaModule = {
  id: "push",
  ddl: [
    `CREATE TABLE IF NOT EXISTS push_device (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, PRIMARY KEY (tenant_id, endpoint));`,
    `CREATE INDEX IF NOT EXISTS idx_push_person ON push_device(tenant_id, user_id);`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["push_device"], subjectTables: [{ table: "push_device", column: "user_id" }] },
};

export interface Device {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly label: string;
  readonly at: string;
}

export const rememberDevice = (
  db: SqlHandle, tenantId: string, userId: string, device: Omit<Device, "at">, at: Instant,
): Promise<void> =>
  db.run(
    `INSERT INTO push_device (tenant_id, user_id, endpoint, p256dh, auth, label, at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, at = excluded.at`,
    tenantId, userId, device.endpoint, device.p256dh, device.auth, device.label, at,
  );

export const forgetDevice = (db: SqlHandle, tenantId: string, endpoint: string): Promise<void> =>
  db.run(`DELETE FROM push_device WHERE tenant_id = ? AND endpoint = ?`, tenantId, endpoint);

export async function devicesOf(db: SqlHandle, tenantId: string, userId: string): Promise<readonly Device[]> {
  const rows = await db.all<{ endpoint: string; p256dh: string; auth: string; label: string; at: string }>(
    /* unbounded-read: the browsers one person has signed in from, which they can see and remove. */
    `SELECT endpoint, p256dh, auth, label, at FROM push_device WHERE tenant_id = ? AND user_id = ? ORDER BY at DESC`,
    tenantId, userId,
  ).catch(() => []);
  return rows;
}

/* --------------------------------------------------------------- base64 --- */

/** ⚠️ URL-SAFE AND UNPADDED, which is what every value in this protocol is. */
export function b64urlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

const u32 = (n: number): Uint8Array => new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

/* ---------------------------------------------------------- the signature --- */

/**
 * The VAPID header — RFC 8292.
 *
 * ⚠️ THE AUDIENCE IS THE PUSH SERVICE'S ORIGIN AND NOTHING ELSE. Signing the
 * whole endpoint leaks the subscription into a token, and services reject it;
 * signing nothing makes the token replayable against any service.
 *
 * ⚠️ AND IT EXPIRES. A token good for ever is a token that stays good after the
 * key it proves is rotated — twelve hours is the ceiling every service accepts.
 */
export const TOKEN_LIFETIME_S = 12 * 60 * 60;

export async function vapidHeader(keys: PushKeys, endpoint: string, nowMs: number): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(nowMs / 1000) + TOKEN_LIFETIME_S,
    sub: keys.subject,
  })));
  const signing = new TextEncoder().encode(`${header}.${claims}`);

  /*
    ⚠️ THE PRIVATE KEY IS THE RAW SCALAR, WHICH WEBCRYPTO WILL NOT IMPORT ON ITS
    OWN. `web-push generate-vapid-keys` prints 32 bytes; JWK is the one import
    format that takes them, and it needs the public point beside them — so the
    pair is reassembled here rather than asking an operator to paste a JWK
    nobody's tooling produces.
  */
  const raw = b64urlToBytes(keys.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC", crv: "P-256",
      d: keys.privateKey,
      x: bytesToB64url(raw.slice(1, 33)),
      y: bytesToB64url(raw.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, signing));
  return `vapid t=${header}.${claims}.${bytesToB64url(signature)}, k=${keys.publicKey}`;
}

/* --------------------------------------------------------- the encryption --- */

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, key, length * 8,
  );
  return new Uint8Array(bits);
};

/**
 * One encrypted payload, in `aes128gcm` — RFC 8188 framing, RFC 8291 keys.
 *
 * ⚠️ THE SALT AND THE EPHEMERAL KEY ARE PER MESSAGE. Reusing either across two
 * sends to the same device reuses an AES-GCM nonce, which is the one mistake
 * that turns an encrypted channel into a readable one.
 */
export async function encryptPayload(
  device: { readonly p256dh: string; readonly auth: string },
  plaintext: string,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const theirs = b64urlToBytes(device.p256dh);
  const authSecret = b64urlToBytes(device.auth);

  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ours = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const theirKey = await crypto.subtle.importKey(
    "raw", theirs as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirKey }, pair.privateKey, 256));

  const label = new TextEncoder().encode("WebPush: info\0");
  const prk = await hkdf(authSecret, shared, concat(label, theirs, ours), 32);

  const cek = await hkdf(salt, prk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, prk, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  /*
    ⚠️ THE `0x02` IS THE PADDING DELIMITER AND IT IS NOT OPTIONAL. Without it the
    record is malformed and every browser drops it silently after the push
    service has answered 201 — a delivery that succeeds everywhere except on the
    device.
  */
  const body = concat(new TextEncoder().encode(plaintext), new Uint8Array([0x02]));
  const key = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource }, key, body as BufferSource,
  ));

  /* salt(16) ‖ record size(4) ‖ key length(1) ‖ our public key(65) ‖ ciphertext */
  return concat(salt, u32(4096), new Uint8Array([ours.length]), ours, sealed);
}

/* ---------------------------------------------------------------- sending --- */

export type PushOutcome = "sent" | "gone" | "failed";

export interface PushNote {
  readonly title: string;
  readonly body?: string;
  /** ⚠️ Collapses two notices about the same thing into one on the lock screen. */
  readonly tag?: string;
}

/**
 * ⚠️ `gone` IS ITS OWN ANSWER BECAUSE IT IS THE ONLY ONE WITH AN ACTION. A 404
 * or a 410 means the browser is not coming back, so the row is deleted; anything
 * else is this minute's problem and the device stays.
 */
export async function sendPush(
  keys: PushKeys,
  device: { readonly endpoint: string; readonly p256dh: string; readonly auth: string },
  note: PushNote,
  nowMs: number,
  fetcher: typeof fetch = fetch,
): Promise<PushOutcome> {
  try {
    const payload = await encryptPayload(device, JSON.stringify(note));
    const res = await fetcher(device.endpoint, {
      method: "POST",
      headers: {
        authorization: await vapidHeader(keys, device.endpoint, nowMs),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        /* ⚠️ Four hours. A notification nobody's device collected by then is one
           they will read in the inbox instead, and a queue that holds it for a
           week delivers "your session is tomorrow" on Thursday. */
        ttl: "14400",
      },
      body: payload as BufferSource,
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    /* ⚠️ A push service being unreachable is not an operation failing. The inbox
       row is already written and it is the record. */
    return "failed";
  }
}

/**
 * Push one notification to every browser one person has.
 *
 * ⚠️ EVERY DEVICE, AND THE DEAD ONES PRUNED ON THE WAY PAST. A person signs in
 * from a laptop, a phone and a second browser, and each is a subscription of its
 * own — sending to the newest only is a notification that arrives on whichever
 * device they are not holding.
 */
export async function pushToPerson(
  db: SqlHandle,
  keys: PushKeys,
  tenantId: string,
  userId: string,
  note: PushNote,
  nowMs: number,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  const devices = await devicesOf(db, tenantId, userId);
  let sent = 0;
  for (const device of devices) {
    const out = await sendPush(keys, device, note, nowMs, fetcher);
    if (out === "sent") sent += 1;
    if (out === "gone") await forgetDevice(db, tenantId, device.endpoint).catch(() => undefined);
  }
  return sent;
}
