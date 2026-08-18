/**
 * WEB PUSH, FROM A WORKER, WITH NOTHING INSTALLED.
 *
 * ⚠️ THIS IS TWO SPECIFICATIONS AND BOTH ARE LOAD-BEARING. RFC 8292 (VAPID) is
 * how a push service knows the request is from us: a short-lived ES256 JWT
 * signed with our private key, sent beside the public one. RFC 8291 is how the
 * BODY is encrypted: the push service relays bytes it cannot read, so the
 * payload is sealed to a key only that browser holds. Skip the first and every
 * send is rejected; skip the second and there is nothing to send but an empty
 * notification.
 *
 * ⚠️ IT IS WRITTEN OUT RATHER THAN DEPENDED ON, for the reason the PNG encoder
 * is: `web-push` is a Node library built on `crypto`, and a Worker has WebCrypto
 * and no Node. Every primitive this needs — ECDH on P-256, HKDF, AES-GCM,
 * ECDSA — is in WebCrypto already. What is not is the ASSEMBLY, and that is
 * this file.
 *
 * ⚠️ THE ORDER OF THE HKDF STEPS IS THE WHOLE THING, AND GETTING IT WRONG FAILS
 * SILENTLY AT THE OTHER END. A wrong info string, a salt in the wrong place or a
 * missing `0x00` produces a body the push service accepts, forwards and cannot
 * be decrypted by the browser — so the send reports 201 and the person is never
 * told anything. That is why `webpush.test.ts` decrypts what this encrypts
 * rather than checking it ran.
 *
 * ⚠️ AND A GONE SUBSCRIPTION IS A REAL ANSWER, NOT AN ERROR. A browser that was
 * uninstalled or a permission that was revoked answers 404 or 410 for ever;
 * treating that as a failure means retrying it for ever, and treating it as
 * success means keeping a dead row and counting somebody as reachable.
 */

/* ------------------------------------------------------------------ types --- */

/** What a browser hands us when somebody turns push on. */
export interface Subscription {
  readonly endpoint: string;
  /** The browser's public key, base64url — 65 bytes, uncompressed P-256. */
  readonly p256dh: string;
  /** The browser's auth secret, base64url — 16 bytes. */
  readonly auth: string;
}

/**
 * ⚠️ THE KEYPAIR IS THE DEPLOYMENT'S IDENTITY TO EVERY PUSH SERVICE, and
 * rotating it makes every existing subscription undeliverable — the browser
 * subscribed TO this public key. So it is a deployment secret rather than a
 * setting, and the console generates rather than accepts one (`op.push`).
 */
export interface Vapid {
  /** base64url, 65 bytes. Also what the browser subscribes with. */
  readonly publicKey: string;
  /** base64url, 32 bytes. */
  readonly privateKey: string;
  /** ⚠️ Who to contact about a misbehaving sender — a push service may need it. */
  readonly subject: string;
}

export type PushOutcome = "sent" | "gone" | "refused";

/* ----------------------------------------------------------------- base64 --- */

/* ⚠️ URL-SAFE AND UNPADDED, which is what every field in both specifications
   uses. Standard base64 here fails at the far end with no diagnostic. */
export const b64urlOf = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytes = (...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

const utf8 = (s: string): Uint8Array<ArrayBuffer> => {
  const raw = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  out.set(raw);
  return out;
};

/* ------------------------------------------------------------------ vapid --- */

/**
 * A KEYPAIR, GENERATED HERE.
 *
 * ⚠️ GENERATED AND NEVER ACCEPTED, which is what keeps a private key out of the
 * database and out of a text field somebody pastes into. The console shows the
 * pair once, the operator installs it as a secret, and the deployment reports
 * the public half from then on.
 */
export async function newVapid(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)) as Uint8Array<ArrayBuffer>;
  return { publicKey: b64urlOf(pub), privateKey: priv.d as string };
}

/**
 * ⚠️ THE PRIVATE KEY IS RE-JOINED TO ITS PUBLIC HALF TO BE USABLE. WebCrypto
 * will not import a bare `d`; a P-256 JWK needs `x` and `y` too, and they are
 * the two halves of the public point we already hold. Storing a whole JWK
 * instead would be storing the same numbers twice and inviting them to disagree.
 */
const signingKey = async (vapid: Vapid): Promise<CryptoKey> => {
  const point = fromB64url(vapid.publicKey);
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error("the VAPID public key is not an uncompressed P-256 point");
  }
  return crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256",
    x: b64urlOf(point.subarray(1, 33)),
    y: b64urlOf(point.subarray(33, 65)),
    d: vapid.privateKey,
    ext: false,
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
};

/**
 * THE AUTHORIZATION HEADER FOR ONE PUSH SERVICE.
 *
 * ⚠️ `aud` IS THE PUSH SERVICE'S ORIGIN, NOT THE ENDPOINT. A JWT scoped to the
 * full URL is rejected by every service; scoped to the origin it is reusable for
 * every subscription on that service, which is why this takes an origin.
 *
 * ⚠️ AND THE SIGNATURE IS RAW r||s, WHICH IS WHAT WEBCRYPTO PRODUCES AND WHAT
 * JWS WANTS. A DER-wrapped signature is what Node's crypto gives and is the
 * usual cause of a VAPID header that verifies nowhere.
 */
export async function vapidHeader(vapid: Vapid, origin: string, now: Date): Promise<string> {
  const head = b64urlOf(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claim = b64urlOf(utf8(JSON.stringify({
    aud: origin,
    /* ⚠️ Twelve hours. The maximum any service accepts is 24; half of it means a
       clock a little out of step is still inside the window. */
    exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
    sub: vapid.subject,
  })));
  const signed = `${head}.${claim}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, await signingKey(vapid), utf8(signed))) as Uint8Array<ArrayBuffer>;
  return `vapid t=${signed}.${b64urlOf(signature)}, k=${vapid.publicKey}`;
}

/* -------------------------------------------------------------- encryption --- */

/* ⚠️ `<ArrayBuffer>` THROUGHOUT — a view that MIGHT be over shared memory is not
   a `BufferSource`, and WebCrypto takes nothing else. The error lands at the
   call site rather than here, where it reads as unrelated. */
const hkdf = async (
  salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>, length: number,
): Promise<Uint8Array<ArrayBuffer>> => {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const out = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(out);
};

/**
 * THE BODY, SEALED TO ONE BROWSER — `aes128gcm`, RFC 8291.
 *
 * ⚠️ THE PUSH SERVICE RELAYS BYTES IT CANNOT READ, and that is the point of the
 * whole ceremony: what somebody is told travels through Google or Mozilla and is
 * readable only by the browser that subscribed. Sending an unencrypted payload
 * is not an option the protocol offers.
 *
 * ⚠️ THE RECORD ENDS WITH `0x02`, NOT `0x00`. That byte is the padding delimiter
 * and `0x02` means "last record"; `0x00` means "more follows", so a browser
 * waits for a record that never comes and shows nothing.
 */
export async function seal(
  to: Subscription, payload: string, salt?: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = fromB64url(to.p256dh);
  const authSecret = fromB64url(to.auth);

  /* ⚠️ A NEW EPHEMERAL PAIR PER MESSAGE. Reusing one would make two messages to
     the same browser share a key stream, which is the failure AES-GCM is least
     forgiving of. */
  const ours = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ours.publicKey)) as Uint8Array<ArrayBuffer>;

  const theirs = await crypto.subtle.importKey(
    "raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: theirs }, ours.privateKey, 256)) as Uint8Array<ArrayBuffer>;

  /*
    ⚠️ TWO HKDF ROUNDS, AND THE FIRST ONE'S SALT IS THE BROWSER'S AUTH SECRET
    RATHER THAN THE MESSAGE SALT. Swapping them produces a key both sides
    compute differently, which is invisible here and total at the far end.
  */
  const prk = await hkdf(authSecret, shared,
    bytes(utf8("WebPush: info\0"), uaPublic, asPublic), 32);

  const use = salt ?? crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const cek = await hkdf(use, prk, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(use, prk, utf8("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce }, key, bytes(utf8(payload), new Uint8Array([0x02])))) as Uint8Array<ArrayBuffer>;

  /*
    ⚠️ THE HEADER IS PART OF THE BODY, NOT A SET OF HTTP HEADERS. Sixteen bytes
    of salt, a four-byte record size, one byte saying how long the key is, and
    the key itself — then the ciphertext. The browser reads its own decryption
    parameters out of the payload.
  */
  const size = new Uint8Array([0, 0, 0x10, 0]);
  return bytes(use, size, new Uint8Array([asPublic.length]), asPublic, sealed);
}

/* ------------------------------------------------------------------- send --- */

/**
 * ONE NOTIFICATION, TO ONE SUBSCRIPTION.
 *
 * ⚠️ THE THREE OUTCOMES ARE THREE DIFFERENT THINGS TO DO NEXT, which is why this
 * does not return a boolean. `sent` is done; `gone` means DELETE THE ROW — the
 * browser is uninstalled or the permission was revoked, and it will answer that
 * way for ever; `refused` is everything else, which is ours to look at rather
 * than the subscriber's.
 */
export async function send(
  vapid: Vapid, to: Subscription, payload: string, now = new Date(),
): Promise<PushOutcome> {
  let origin: string;
  try {
    origin = new URL(to.endpoint).origin;
  } catch {
    /* ⚠️ A row whose endpoint no longer parses is as dead as a 410, and keeping
       it means throwing on every sweep for ever. */
    return "gone";
  }

  let res: Response;
  try {
    res = await fetch(to.endpoint, {
      method: "POST",
      headers: {
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        /* ⚠️ Four hours. A notification about something that happened is stale
           long before a push service's default of days. */
        ttl: "14400",
        /* ⚠️ `normal` rather than `high`: a high-urgency push wakes a sleeping
           phone, which is for a call, not for a note somebody published. */
        urgency: "normal",
        authorization: await vapidHeader(vapid, origin, now),
      },
      body: await seal(to, payload),
    });
  } catch {
    return "refused";
  }

  if (res.status === 404 || res.status === 410) return "gone";
  return res.ok ? "sent" : "refused";
}
