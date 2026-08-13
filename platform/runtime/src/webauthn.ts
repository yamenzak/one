/**
 * vocabulary-exempt-file(client): WebAuthn names the browser the "client", and
 * `clientDataJSON` is a field on the wire. Renaming it would mean translating a
 * protocol at its boundary, which is a bug factory for no gain.
 *
 * THE PASSKEY CEREMONY.
 *
 * ⚠️ WHAT THIS FILE IS FOR, IN ONE SENTENCE: every check below is the only thing
 * standing between "a browser sent us some bytes" and "this is the person". A
 * skipped one does not fail — it succeeds, for an attacker.
 *
 * The four that carry the weight, and what each stops:
 *
 *   CHALLENGE   ours, single-use, recent. Without it a captured assertion is a
 *               password that never expires.
 *   ORIGIN      from clientDataJSON, matched exactly. This is the anti-phishing
 *               property that makes passkeys worth having; a site that looks
 *               identical cannot produce an assertion naming our origin.
 *   RP ID HASH  from the authenticator, matched against the CREDENTIAL's relying
 *               party rather than the request's. A request cannot nominate the
 *               scope it is verified under.
 *   COUNTER     a signature counter that did not advance is a cloned
 *               authenticator, which is the one failure the protocol can
 *               actually detect for us.
 *
 * No dependencies: WebCrypto and a CBOR reader small enough to read. A library
 * would be one more thing between the bytes and the checks.
 */

/* ------------------------------------------------------------- base64url --- */

/*
  ⚠️ THE KERNEL'S, BECAUSE THE BROWSER USES THE SAME ONE. A challenge is bytes,
  the wire is text, and this side verifies what the other side encoded — two
  copies of an encoder is a pair that can disagree, and base64 against base64url
  disagrees on about one challenge in eight. Re-exported so the callers here read
  as they always did.
*/
export { b64u } from "@one/kernel";
import { b64u } from "@one/kernel";

const sha256 = async (data: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));

/** ⚠️ Constant time. A length-and-loop compare on a challenge leaks it slowly. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/* ------------------------------------------------------------------ CBOR --- */

/**
 * The subset WebAuthn actually uses: unsigned and negative integers, byte and
 * text strings, arrays and maps. Not a general decoder — indefinite lengths,
 * tags and floats are refused rather than half-supported, because a decoder that
 * guesses at input it does not understand is a decoder an attacker writes for.
 */
type Cbor = number | string | Uint8Array | Cbor[] | Map<number | string, Cbor>;

function cborRead(b: Uint8Array, at: number): [Cbor, number] {
  const first = b[at];
  if (first === undefined) throw new Error("cbor: truncated");
  const major = first >> 5;
  const minor = first & 0x1f;
  let i = at + 1;

  const length = (): number => {
    if (minor < 24) return minor;
    if (minor === 24) return b[i++]!;
    if (minor === 25) { const v = (b[i]! << 8) | b[i + 1]!; i += 2; return v; }
    if (minor === 26) { const v = ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0; i += 4; return v; }
    throw new Error("cbor: unsupported length");
  };

  switch (major) {
    case 0: return [length(), i];
    case 1: return [-1 - length(), i];
    case 2: { const n = length(); const v = b.subarray(i, i + n); return [v, i + n]; }
    case 3: { const n = length(); const v = new TextDecoder().decode(b.subarray(i, i + n)); return [v, i + n]; }
    case 4: {
      const n = length();
      const out: Cbor[] = [];
      for (let k = 0; k < n; k++) { const [v, next] = cborRead(b, i); out.push(v); i = next; }
      return [out, i];
    }
    case 5: {
      const n = length();
      const out = new Map<number | string, Cbor>();
      for (let k = 0; k < n; k++) {
        const [key, afterKey] = cborRead(b, i);
        const [val, afterVal] = cborRead(b, afterKey);
        out.set(key as number | string, val);
        i = afterVal;
      }
      return [out, i];
    }
    default: throw new Error(`cbor: unsupported major type ${major}`);
  }
}

export const cborDecode = (b: Uint8Array): Cbor => cborRead(b, 0)[0];

/* ------------------------------------------------------------------ COSE --- */

const ES256 = -7;
const RS256 = -257;

/** A COSE key becomes something WebCrypto will verify with. */
async function importCose(cose: Uint8Array): Promise<{ key: CryptoKey; alg: number }> {
  const map = cborDecode(cose);
  if (!(map instanceof Map)) throw new Error("cose: not a map");
  const alg = map.get(3) as number;

  if (alg === ES256) {
    const x = map.get(-2) as Uint8Array;
    const y = map.get(-3) as Uint8Array;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: b64u.encode(x), y: b64u.encode(y), ext: true },
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
    );
    return { key, alg };
  }
  if (alg === RS256) {
    const n = map.get(-1) as Uint8Array;
    const e = map.get(-2) as Uint8Array;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: b64u.encode(n), e: b64u.encode(e), ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
    return { key, alg };
  }
  /*
    ⚠️ REFUSED, NOT DOWNGRADED. An unknown algorithm is the one place a
    permissive default would be catastrophic — accepting a key we cannot check
    means accepting an assertion we cannot check.
  */
  throw new Error(`cose: unsupported algorithm ${alg}`);
}

/**
 * ECDSA signatures arrive DER-encoded and WebCrypto wants raw `r || s`.
 *
 * ⚠️ EACH HALF IS LEFT-PADDED TO 32 BYTES. DER drops leading zeros, so roughly
 * one signature in 256 has a 31-byte `r` — which verifies fine in testing and
 * fails for one user in two hundred, intermittently, forever.
 */
function derToRaw(der: Uint8Array): Uint8Array {
  let i = 2;
  if (der[1]! & 0x80) i += der[1]! & 0x7f;
  const take = (): Uint8Array => {
    if (der[i++] !== 0x02) throw new Error("ecdsa: not an INTEGER");
    const n = der[i++]!;
    let v = der.subarray(i, i + n);
    i += n;
    while (v.length > 32 && v[0] === 0) v = v.subarray(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = take();
  const s = take();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

/* -------------------------------------------------------------- authData --- */

export interface AuthData {
  readonly rpIdHash: Uint8Array;
  readonly userPresent: boolean;
  readonly userVerified: boolean;
  readonly counter: number;
  readonly credentialId?: Uint8Array;
  readonly publicKey?: Uint8Array;
}

export function parseAuthData(b: Uint8Array): AuthData {
  if (b.length < 37) throw new Error("authData: too short");
  const flags = b[32]!;
  const counter = (b[33]! << 24 | b[34]! << 16 | b[35]! << 8 | b[36]!) >>> 0;
  const base = { rpIdHash: b.subarray(0, 32), userPresent: (flags & 0x01) !== 0, userVerified: (flags & 0x04) !== 0, counter };
  if ((flags & 0x40) === 0) return base; // no attested credential data

  const idLength = (b[53]! << 8) | b[54]!;
  const credentialId = b.subarray(55, 55 + idLength);
  const publicKey = b.subarray(55 + idLength);
  return { ...base, credentialId, publicKey };
}

/* ------------------------------------------------------------- ceremonies --- */

export interface ClientData { type: string; challenge: string; origin: string; crossOrigin?: boolean }

export type CeremonyFailure =
  | "malformed" | "wrong_type" | "wrong_challenge" | "wrong_origin"
  | "wrong_relying_party" | "not_present" | "cloned_authenticator" | "bad_signature";

export type Verified<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly why: CeremonyFailure };

interface Expect {
  /** The challenge WE issued, base64url. Single use — the caller consumes it. */
  readonly challenge: string;
  /** The exact origin, scheme and port included. Not a suffix, not a pattern. */
  readonly origin: string;
  /** ⚠️ The CREDENTIAL's relying party, never one the request nominated. */
  readonly relyingParty: string;
}

async function checkClientData(raw: Uint8Array, type: string, expect: Expect): Promise<CeremonyFailure | null> {
  let data: ClientData;
  try { data = JSON.parse(new TextDecoder().decode(raw)) as ClientData; } catch { return "malformed"; }
  if (data.type !== type) return "wrong_type";
  if (!sameBytes(b64u.decode(data.challenge), b64u.decode(expect.challenge))) return "wrong_challenge";
  /*
    ⚠️ THE ANTI-PHISHING PROPERTY, AND IT IS AN EXACT MATCH. A site that looks
    identical cannot make an authenticator sign OUR origin, so this one string
    comparison is most of what a passkey is worth. Relaxing it to a suffix — for
    a preview deployment, say — gives that away for every user at once.
  */
  if (data.origin !== expect.origin) return "wrong_origin";
  return null;
}

const checkRelyingParty = async (auth: AuthData, rp: string): Promise<boolean> =>
  sameBytes(auth.rpIdHash, await sha256(new TextEncoder().encode(rp)));

export interface Registration {
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
}

export async function verifyRegistration(
  input: { attestationObject: string; clientDataJSON: string }, expect: Expect,
): Promise<Verified<Registration>> {
  const bad = await checkClientData(b64u.decode(input.clientDataJSON), "webauthn.create", expect);
  if (bad) return { ok: false, why: bad };

  let auth: AuthData;
  try {
    const att = cborDecode(b64u.decode(input.attestationObject));
    if (!(att instanceof Map)) return { ok: false, why: "malformed" };
    auth = parseAuthData(att.get("authData") as Uint8Array);
  } catch { return { ok: false, why: "malformed" }; }

  if (!auth.credentialId || !auth.publicKey) return { ok: false, why: "malformed" };
  if (!auth.userPresent) return { ok: false, why: "not_present" };
  if (!(await checkRelyingParty(auth, expect.relyingParty))) return { ok: false, why: "wrong_relying_party" };

  /*
    ⚠️ THE KEY IS IMPORTED HERE, at registration, so an algorithm we cannot
    verify is refused at the door rather than stored and discovered at the first
    sign-in — which would be a credential that can be created and never used.
  */
  try { await importCose(auth.publicKey); } catch { return { ok: false, why: "malformed" }; }

  return {
    ok: true,
    value: { credentialId: b64u.encode(auth.credentialId), publicKey: b64u.encode(auth.publicKey), counter: auth.counter },
  };
}

export async function verifyAssertion(
  input: { authenticatorData: string; clientDataJSON: string; signature: string },
  stored: { publicKey: string; counter: number },
  expect: Expect,
): Promise<Verified<{ counter: number }>> {
  const clientDataRaw = b64u.decode(input.clientDataJSON);
  const bad = await checkClientData(clientDataRaw, "webauthn.get", expect);
  if (bad) return { ok: false, why: bad };

  const authRaw = b64u.decode(input.authenticatorData);
  let auth: AuthData;
  try { auth = parseAuthData(authRaw); } catch { return { ok: false, why: "malformed" }; }

  if (!auth.userPresent) return { ok: false, why: "not_present" };
  if (!(await checkRelyingParty(auth, expect.relyingParty))) return { ok: false, why: "wrong_relying_party" };

  /*
    ⚠️ A COUNTER THAT DID NOT ADVANCE IS A CLONE, and it is the one attack the
    protocol can detect on our behalf. Zero on both sides means the authenticator
    does not keep one — common, and explicitly permitted — so it is not a
    failure; a counter that went BACKWARDS or stood still while claiming to keep
    one is.
  */
  if (!(auth.counter === 0 && stored.counter === 0) && auth.counter <= stored.counter) {
    return { ok: false, why: "cloned_authenticator" };
  }

  let ok = false;
  try {
    const { key, alg } = await importCose(b64u.decode(stored.publicKey));
    const signed = new Uint8Array(authRaw.length + 32);
    signed.set(authRaw, 0);
    signed.set(await sha256(clientDataRaw), authRaw.length);
    const sig = b64u.decode(input.signature);
    ok = alg === ES256
      ? await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(sig) as BufferSource, signed as BufferSource)
      : await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, sig as BufferSource, signed as BufferSource);
  } catch { return { ok: false, why: "malformed" }; }

  return ok ? { ok: true, value: { counter: auth.counter } } : { ok: false, why: "bad_signature" };
}

/*
  There is deliberately no `newChallenge()` here. A challenge is 32 random bytes
  AND a row that can be consumed exactly once, so minting one without storing it
  is an operation with no safe use — the store's `issueChallenge` is the only
  producer, and its primary key IS the challenge.
*/
