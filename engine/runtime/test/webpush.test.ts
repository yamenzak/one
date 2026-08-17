/**
 * THE PUSH BODY, DECRYPTED — never merely produced.
 *
 * ⚠️ EVERY WAY THIS CAN BE WRONG PRODUCES BYTES A PUSH SERVICE ACCEPTS. A
 * swapped HKDF salt, a missing `\0` in an info string, `0x00` where the padding
 * delimiter should be `0x02`, a DER signature where JWS wants raw r||s — each
 * one returns 201 from the push service, forwards to the browser, and shows
 * nobody anything. There is no error to see and nothing to log.
 *
 * ⚠️ SO THIS TEST IS THE BROWSER. It performs the receiving half of RFC 8291 —
 * the same ECDH, the same two HKDF rounds, the same AES-GCM — and asserts the
 * plaintext comes back. If the two halves ever disagree, that is the bug, and it
 * is the only place it is visible before somebody's phone.
 */

import { describe, expect, it } from "vitest";
import {
  b64urlOf, fromB64url, newVapid, seal, send, vapidHeader, type Subscription,
} from "../src/webpush.js";

/* ------------------------------------------------------------ a browser --- */

/** ⚠️ A real P-256 pair and a real 16-byte auth secret — what a browser hands
    over when somebody allows notifications. */
async function aBrowser(): Promise<{
  sub: Subscription;
  open: (body: Uint8Array<ArrayBuffer>) => Promise<string>;
}> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)) as Uint8Array<ArrayBuffer>;
  const authSecret = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));

  const sub: Subscription = {
    endpoint: "https://push.example.com/x/abc",
    p256dh: b64urlOf(uaPublic),
    auth: b64urlOf(authSecret),
  };

  /* THE RECEIVING HALF, WRITTEN OUT — see the header. */
  const open = async (body: Uint8Array<ArrayBuffer>): Promise<string> => {
    const salt = body.subarray(0, 16) as Uint8Array<ArrayBuffer>;
    const keyLength = body[20]!;
    const asPublic = body.subarray(21, 21 + keyLength) as Uint8Array<ArrayBuffer>;
    const sealed = body.subarray(21 + keyLength);

    const theirs = await crypto.subtle.importKey(
      "raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "ECDH", public: theirs }, pair.privateKey, 256)) as Uint8Array<ArrayBuffer>;

    const cat = (...p: Uint8Array[]) => {
      const out = new Uint8Array(new ArrayBuffer(p.reduce((n, x) => n + x.length, 0)));
      let at = 0;
      for (const x of p) { out.set(x, at); at += x.length; }
      return out;
    };
    const enc = (s: string) => {
      const raw = new TextEncoder().encode(s);
      const out = new Uint8Array(new ArrayBuffer(raw.length));
      out.set(raw);
      return out;
    };
    const derive = async (
      s: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>,
      info: Uint8Array<ArrayBuffer>, n: number,
    ) => {
      const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
      return new Uint8Array(await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: s, info }, k, n * 8)) as Uint8Array<ArrayBuffer>;
    };

    const prk = await derive(authSecret, shared,
      cat(enc("WebPush: info\0"), uaPublic, asPublic), 32);
    const cek = await derive(salt, prk, enc("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await derive(salt, prk, enc("Content-Encoding: nonce\0"), 12);

    const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce }, key, sealed));

    /* ⚠️ The last byte is the padding delimiter and must be `0x02`. */
    expect(plain[plain.length - 1], "the record does not end with the last-record byte").toBe(0x02);
    return new TextDecoder().decode(plain.subarray(0, plain.length - 1));
  };

  return { sub, open };
}

/* ------------------------------------------------------------------ tests --- */

describe("the sealed body", () => {
  it("comes back out as what went in", async () => {
    const { sub, open } = await aBrowser();
    const said = JSON.stringify({ title: "Northwind Strength", body: "A note was published" });
    expect(await open(await seal(sub, said))).toBe(said);
  });

  /* ⚠️ A KEY STREAM REUSED ACROSS TWO MESSAGES IS THE FAILURE AES-GCM IS LEAST
     FORGIVING OF, so the ephemeral pair must be new every time. */
  it("uses a new ephemeral key for every message", async () => {
    const { sub } = await aBrowser();
    const one = await seal(sub, "same");
    const two = await seal(sub, "same");
    expect(one.subarray(21, 86)).not.toEqual(two.subarray(21, 86));
    expect(Buffer.from(one).equals(Buffer.from(two))).toBe(false);
  });

  it("writes the header the browser reads its parameters out of", async () => {
    const { sub } = await aBrowser();
    const body = await seal(sub, "x");
    /* salt(16) + record size(4) + key length(1) + key(65) */
    expect(body[20]).toBe(65);
    expect([...body.subarray(16, 20)]).toEqual([0, 0, 0x10, 0]);
    expect(body[21], "the ephemeral key is not an uncompressed point").toBe(0x04);
  });

  /* ⚠️ TWO BROWSERS, TWO KEYS. A body sealed to one must not open with the
     other's — which is what makes this encryption rather than encoding. */
  it("cannot be opened by a different browser", async () => {
    const mine = await aBrowser();
    const theirs = await aBrowser();
    await expect(theirs.open(await seal(mine.sub, "private"))).rejects.toThrow();
  });
});

describe("the vapid header", () => {
  it("is a JWS somebody can verify with the public key we send", async () => {
    const { publicKey, privateKey } = await newVapid();
    const header = await vapidHeader(
      { publicKey, privateKey, subject: "mailto:ops@example.com" },
      "https://push.example.com", new Date("2026-08-17T12:00:00Z"));

    const [, token] = /^vapid t=([^,]+), k=(.+)$/.exec(header) ?? [];
    const sent = /k=(.+)$/.exec(header)?.[1];
    expect(sent, "the public key is not sent beside the token").toBe(publicKey);

    const [head, claim, signature] = token!.split(".");
    /* ⚠️ RAW r||s, WHICH IS WHAT JWS WANTS. A DER-wrapped signature is 70-ish
       bytes and verifies nowhere — the usual cause of a header rejected by
       every push service at once. */
    expect(fromB64url(signature!).length).toBe(64);

    const key = await crypto.subtle.importKey("raw", fromB64url(publicKey),
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key,
      fromB64url(signature!), new TextEncoder().encode(`${head}.${claim}`))).toBe(true);
  });

  /* ⚠️ THE AUDIENCE IS THE ORIGIN, NOT THE ENDPOINT. Scoped to the full URL it
     is rejected by every service. */
  it("is scoped to the push service's origin", async () => {
    const { publicKey, privateKey } = await newVapid();
    const header = await vapidHeader(
      { publicKey, privateKey, subject: "mailto:ops@example.com" },
      "https://fcm.googleapis.com", new Date());
    const claim = JSON.parse(new TextDecoder().decode(
      fromB64url(header.split(".")[1]!))) as { aud: string; exp: number; sub: string };
    expect(claim.aud).toBe("https://fcm.googleapis.com");
    expect(claim.sub).toBe("mailto:ops@example.com");
    /* Inside the 24 hours every service caps it at. */
    expect(claim.exp - Math.floor(Date.now() / 1000)).toBeLessThan(24 * 60 * 60);
  });
});

describe("what comes back", () => {
  const vapid = async () => ({ ...(await newVapid()), subject: "mailto:ops@example.com" });
  const to: Subscription = {
    endpoint: "https://push.example.com/x/abc",
    p256dh: "", auth: "",
  };

  /*
    ⚠️ `gone` IS A ROW TO DELETE AND `refused` IS OURS TO LOOK AT, which is why
    this is not a boolean. Treating 410 as a failure retries a dead subscription
    for ever; treating it as success keeps counting somebody as reachable.
  */
  it("reads 404 and 410 as gone, and everything else as refused", async () => {
    const browser = await aBrowser();
    const original = globalThis.fetch;
    try {
      for (const [status, want] of [[404, "gone"], [410, "gone"], [500, "refused"], [201, "sent"]] as const) {
        globalThis.fetch = (async () => new Response(null, { status })) as typeof fetch;
        expect(await send(await vapid(), browser.sub, "x"), `${status}`).toBe(want);
      }
      /* ⚠️ A network that is not there is ours, not the subscriber's. */
      globalThis.fetch = (async () => { throw new Error("no route"); }) as typeof fetch;
      expect(await send(await vapid(), browser.sub, "x")).toBe("refused");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("reads an endpoint that no longer parses as gone rather than throwing", async () => {
    expect(await send(await vapid(), { ...to, endpoint: "not a url" }, "x")).toBe("gone");
  });
});
