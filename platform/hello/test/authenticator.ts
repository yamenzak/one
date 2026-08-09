/**
 * A SYNTHETIC AUTHENTICATOR — enough of one to be verified by the real code.
 *
 * ⚠️ IT IS DELIBERATELY CAPABLE OF LYING. Every check in the ceremony is only
 * worth what its failing case proves, so this can be told to sign the wrong
 * origin, hash the wrong relying party, or replay a counter — and each of those
 * is a test. A fixture that could only behave correctly would prove that correct
 * input is accepted, which is the half nobody gets wrong.
 */

import { b64u } from "@one/runtime";

const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource));
const utf8 = (s: string) => new TextEncoder().encode(s);

/** CBOR, write side: just the two shapes an authenticator emits. */
function cborBytes(b: Uint8Array): Uint8Array {
  const head = b.length < 24 ? [0x40 | b.length]
    : b.length < 256 ? [0x58, b.length]
    : [0x59, b.length >> 8, b.length & 0xff];
  return new Uint8Array([...head, ...b]);
}
const cborText = (s: string): Uint8Array => {
  const b = utf8(s);
  return new Uint8Array([...(b.length < 24 ? [0x60 | b.length] : [0x78, b.length]), ...b]);
};
const cborInt = (n: number): Uint8Array =>
  n >= 0 ? new Uint8Array(n < 24 ? [n] : [0x18, n]) : new Uint8Array(-n - 1 < 24 ? [0x20 | (-n - 1)] : [0x38, -n - 1]);
const cborMap = (entries: [Uint8Array, Uint8Array][]): Uint8Array =>
  new Uint8Array([0xa0 | entries.length, ...entries.flatMap(([k, v]) => [...k, ...v])]);

export interface Fake {
  readonly credentialId: string;
  register(o: { challenge: string; origin: string; rpId: string }): Promise<{ challenge: string; attestationObject: string; clientDataJSON: string }>;
  assert(o: { challenge: string; origin: string; rpId: string; counter?: number; type?: string }): Promise<{ challenge: string; credentialId: string; authenticatorData: string; clientDataJSON: string; signature: string }>;
}

export async function authenticator(): Promise<Fake> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  // COSE ES256: {1: 2 (EC2), 3: -7, -1: 1 (P-256), -2: x, -3: y}
  const cose = cborMap([
    [cborInt(1), cborInt(2)], [cborInt(3), cborInt(-7)], [cborInt(-1), cborInt(1)],
    [cborInt(-2), cborBytes(b64u.decode(jwk.x!))], [cborInt(-3), cborBytes(b64u.decode(jwk.y!))],
  ]);
  const rawId = crypto.getRandomValues(new Uint8Array(16));
  let signCount = 0;

  const authData = async (rpId: string, counter: number, withCredential: boolean) => {
    const hash = await sha256(utf8(rpId));
    const flags = withCredential ? 0x45 : 0x05; // UP | UV | (AT)
    const head = new Uint8Array([...hash, flags, counter >> 24 & 255, counter >> 16 & 255, counter >> 8 & 255, counter & 255]);
    if (!withCredential) return head;
    const attested = new Uint8Array([...new Uint8Array(16), rawId.length >> 8, rawId.length & 255, ...rawId, ...cose]);
    return new Uint8Array([...head, ...attested]);
  };

  const clientData = (type: string, challenge: string, origin: string) =>
    utf8(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    credentialId: b64u.encode(rawId),
    async register({ challenge, origin, rpId }) {
      const att = cborMap([
        [cborText("fmt"), cborText("none")],
        [cborText("attStmt"), new Uint8Array([0xa0])],
        [cborText("authData"), cborBytes(await authData(rpId, 0, true))],
      ]);
      return {
        challenge,
        attestationObject: b64u.encode(att),
        clientDataJSON: b64u.encode(clientData("webauthn.create", challenge, origin)),
      };
    },
    async assert({ challenge, origin, rpId, counter, type }) {
      const c = counter ?? ++signCount;
      const auth = await authData(rpId, c, false);
      const client = clientData(type ?? "webauthn.get", challenge, origin);
      const signed = new Uint8Array([...auth, ...(await sha256(client))]);
      const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, signed as BufferSource));
      return {
        challenge,
        credentialId: b64u.encode(rawId),
        authenticatorData: b64u.encode(auth),
        clientDataJSON: b64u.encode(client),
        // WebAuthn signatures are DER; WebCrypto produces raw r||s.
        signature: b64u.encode(rawToDer(raw)),
      };
    },
  };
}

function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const v = b.subarray(i);
    const body = v[0]! & 0x80 ? new Uint8Array([0, ...v]) : v;
    return new Uint8Array([0x02, body.length, ...body]);
  };
  const r = int(raw.subarray(0, 32));
  const s = int(raw.subarray(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}
