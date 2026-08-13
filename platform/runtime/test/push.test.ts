/**
 * WEB PUSH, WHERE EVERY MISTAKE IS SILENT.
 *
 * ⚠️ THIS IS THE ONE PLACE IN THE PLATFORM WHERE A BUG PRODUCES A 201. A push
 * service accepts a malformed record, answers success, and the browser drops it
 * — so a wrong salt length, a missing padding delimiter or a JWT signed over the
 * whole endpoint all look exactly like a working deployment where nobody
 * happens to be receiving anything. Nothing downstream can catch that, which is
 * why the framing is asserted byte by byte here.
 */

import { describe, expect, it } from "vitest";
import {
  b64urlToBytes, bytesToB64url, encryptPayload, keysFrom, pushToPerson, sendPush, vapidHeader,
  PUSH_SCHEMA, TOKEN_LIFETIME_S, VAPID_PRIVATE, VAPID_PUBLIC, VAPID_SUBJECT,
  type PushKeys,
} from "../src/push.js";
import type { Instant, SqlHandle } from "@one/kernel";

/* ⚠️ A REAL PAIR, GENERATED HERE. A hardcoded one is a private key in a public
   repository, and a fake one cannot be imported by WebCrypto at all. */
const keyPair = async (): Promise<PushKeys> => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: bytesToB64url(raw), privateKey: jwk.d!, subject: "mailto:ops@example.test" };
};

/** A browser's subscription, as one actually arrives. */
const device = async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    p256dh: bytesToB64url(raw),
    auth: bytesToB64url(crypto.getRandomValues(new Uint8Array(16))),
  };
};

const AT = 1_760_000_000_000;

/* ---------------------------------------------------------------- base64 --- */

describe("the encoding every value in this protocol uses", () => {
  /*
    ⚠️ URL-SAFE AND UNPADDED. A subscription's keys arrive in this alphabet from
    the browser and go back out in a header; decoding them as standard base64
    produces bytes that are wrong rather than an error.
  */
  it("round-trips the alphabet a push subscription is written in", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(65));
    expect(b64urlToBytes(bytesToB64url(bytes))).toEqual(bytes);
    expect(bytesToB64url(bytes)).not.toMatch(/[+/=]/);
  });

  it("reads a value the browser padded and one it did not", () => {
    expect(b64urlToBytes("YWJj")).toEqual(new Uint8Array([97, 98, 99]));
    expect(b64urlToBytes("YWJjZA")).toEqual(new Uint8Array([97, 98, 99, 100]));
  });
});

/* ------------------------------------------------------------ the keys --- */

describe("what a deployment has to have configured", () => {
  /*
    ⚠️ ALL THREE OR NOTHING. A pair with no subject is refused by some push
    services and accepted by others, which is the worst kind of half-configured:
    it works in testing and drops part of the fleet in production.
  */
  it("treats a half-configured deployment as an unconfigured one", () => {
    expect(keysFrom({ [VAPID_PUBLIC]: "a", [VAPID_PRIVATE]: "b", [VAPID_SUBJECT]: "mailto:x@y.z" })).toBeTruthy();
    expect(keysFrom({ [VAPID_PUBLIC]: "a", [VAPID_PRIVATE]: "b" })).toBeNull();
    expect(keysFrom({ [VAPID_PUBLIC]: "a", [VAPID_PRIVATE]: " ", [VAPID_SUBJECT]: "mailto:x@y.z" })).toBeNull();
    expect(keysFrom({})).toBeNull();
  });
});

/* -------------------------------------------------------- the signature --- */

describe("the token a push service checks", () => {
  /*
    ⚠️ THE AUDIENCE IS THE SERVICE'S ORIGIN AND NOTHING ELSE. Signing the whole
    endpoint puts the subscription inside a token — and services reject it, which
    is a deployment where push works nowhere and nothing says why.
  */
  it("signs the push service's origin, never the subscription", async () => {
    const header = await vapidHeader(await keyPair(), "https://fcm.googleapis.com/fcm/send/abc123", AT);
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(header.split(".")[1]!.split(",")[0]!)));
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(header).not.toContain("abc123");
  });

  /* ⚠️ AND IT EXPIRES. A token good for ever is one that stays good after the key
     it proves has been rotated. */
  it("expires, within the ceiling every service accepts", async () => {
    const header = await vapidHeader(await keyPair(), "https://fcm.googleapis.com/fcm/send/x", AT);
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(header.split(".")[1]!.split(",")[0]!)));
    expect(claims.exp).toBe(Math.floor(AT / 1000) + TOKEN_LIFETIME_S);
    expect(TOKEN_LIFETIME_S).toBeLessThanOrEqual(24 * 60 * 60);
  });

  /* ⚠️ The scheme and the public key travel together, or a service has the
     signature and nothing to check it against. */
  it("carries the key the signature is checked with", async () => {
    const keys = await keyPair();
    const header = await vapidHeader(keys, "https://updates.push.services.mozilla.com/wpush/v2/x", AT);
    expect(header.startsWith("vapid t=")).toBe(true);
    expect(header).toContain(`k=${keys.publicKey}`);
  });

  /*
    ⚠️ AND IT VERIFIES. Everything above is about the shape of a token; this is
    the only assertion that says the bytes were actually signed by the key we
    claim to be — which is the half a push service checks and nothing else here
    would notice.
  */
  it("is a signature the public half actually verifies", async () => {
    const keys = await keyPair();
    const header = await vapidHeader(keys, "https://fcm.googleapis.com/fcm/send/x", AT);
    const [token] = header.slice("vapid t=".length).split(",");
    const [h, c, sig] = token!.split(".");
    const raw = b64urlToBytes(keys.publicKey);
    const pub = await crypto.subtle.importKey(
      "raw", raw as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, pub,
      b64urlToBytes(sig!) as BufferSource, new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });
});

/* ------------------------------------------------------- the encryption --- */

describe("the payload the push service cannot read", () => {
  /*
    ⚠️ THE FRAMING IS RFC 8188 AND EVERY FIELD IS FIXED-WIDTH: a 16-byte salt, a
    four-byte record size, a one-byte key length and a 65-byte uncompressed
    public point. Get any of them wrong and the service still answers 201 while
    every browser drops the message.
  */
  it("frames the record exactly as the encoding demands", async () => {
    const body = await encryptPayload(await device(), JSON.stringify({ title: "Hello" }));
    expect(body.length).toBeGreaterThan(16 + 4 + 1 + 65);
    /* The key length byte says 65, and the point that follows is uncompressed. */
    expect(body[20]).toBe(65);
    expect(body[21]).toBe(0x04);
    /* The record size is 4096, big-endian, in the four bytes after the salt. */
    expect([...body.slice(16, 20)]).toEqual([0, 0, 0x10, 0x00]);
  });

  /*
    ⚠️ THE SALT AND THE EPHEMERAL KEY ARE PER MESSAGE. Reusing either across two
    sends to one device reuses an AES-GCM nonce, which is the single mistake that
    turns an encrypted channel into a readable one.
  */
  it("never sends the same salt or the same ephemeral key twice", async () => {
    const to = await device();
    const a = await encryptPayload(to, "one");
    const b = await encryptPayload(to, "one");
    expect(a.slice(0, 16)).not.toEqual(b.slice(0, 16));
    expect(a.slice(21, 86)).not.toEqual(b.slice(21, 86));
  });

  it("puts nothing readable on the wire", async () => {
    const body = await encryptPayload(await device(), JSON.stringify({ title: "Your card was declined" }));
    expect(new TextDecoder().decode(body)).not.toContain("declined");
  });
});

/* ---------------------------------------------------------- the sending --- */

describe("what happens to a subscription that is gone", () => {
  const to = { endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: "", auth: "" };

  /*
    ⚠️ `gone` IS ITS OWN ANSWER BECAUSE IT IS THE ONLY ONE WITH AN ACTION. A list
    nobody prunes grows for ever, and every send afterwards pays for every browser
    anybody has ever signed in from.
  */
  it("tells a browser that is never coming back from a bad minute", async () => {
    const keys = await keyPair();
    const real = await device();
    const answer = (status: number) => async () => new Response(null, { status });
    expect(await sendPush(keys, real, { title: "x" }, AT, answer(201) as never)).toBe("sent");
    expect(await sendPush(keys, real, { title: "x" }, AT, answer(410) as never)).toBe("gone");
    expect(await sendPush(keys, real, { title: "x" }, AT, answer(404) as never)).toBe("gone");
    expect(await sendPush(keys, real, { title: "x" }, AT, answer(500) as never)).toBe("failed");
  });

  /* ⚠️ A push service being unreachable is not an operation failing — the inbox
     row is already written and it is the record. */
  it("answers rather than throwing when the push service is unreachable", async () => {
    const keys = await keyPair();
    const out = await sendPush(keys, to, { title: "x" }, AT, (async () => { throw new Error("down"); }) as never);
    expect(out).toBe("failed");
  });
});

describe("every browser one person has", () => {
  const store = (rows: { endpoint: string; p256dh: string; auth: string; label: string; at: string }[]) => {
    const deleted: string[] = [];
    const db = {
      async run(sql: string, ...p: readonly unknown[]) {
        if (sql.startsWith("DELETE")) deleted.push(String(p[1]));
      },
      async all<T>() { return rows as T[]; },
      async first<T>() { return null as T | null; },
    } as unknown as SqlHandle;
    return { db, deleted };
  };

  /*
    ⚠️ EVERY DEVICE, AND THE DEAD ONES PRUNED ON THE WAY PAST. A person signs in
    from a laptop, a phone and a second browser; sending to the newest only is a
    notification that arrives on whichever one they are not holding.
  */
  it("sends to all of them and forgets the ones that answered gone", async () => {
    const keys = await keyPair();
    const one = await device();
    const two = { ...(await device()), endpoint: "https://fcm.googleapis.com/fcm/send/two" };
    const { db, deleted } = store([
      { ...one, label: "laptop", at: "2026-01-01T00:00:00.000Z" },
      { ...two, label: "phone", at: "2026-01-02T00:00:00.000Z" },
    ]);
    const fetcher = (async (url: string) =>
      new Response(null, { status: String(url).endsWith("two") ? 410 : 201 })) as never;

    expect(await pushToPerson(db, keys, "t", "u", { title: "Hello" }, AT, fetcher)).toBe(1);
    expect(deleted).toEqual([two.endpoint]);
  });
});

/* ------------------------------------------------------------ the store --- */

describe("where a subscription lives", () => {
  /*
    ⚠️ REGIONAL AND SCOPED BOTH WAYS. A device token is how one person is reached
    about one workspace's business, so closing the workspace has to reach it and
    so does erasing the person.
  */
  it("declares its table so both erasures find it", () => {
    expect(PUSH_SCHEMA.scoped?.tenantTables).toEqual(["push_device"]);
    expect(PUSH_SCHEMA.scoped?.subjectTables).toEqual([{ table: "push_device", column: "user_id" }]);
    expect(PUSH_SCHEMA.global).toBeUndefined();
  });

  /* ⚠️ The endpoint is the identity: a browser hands back the same one for the
     same registration, so subscribing twice from one device has to be one row. */
  it("keys a device on the endpoint the browser gave it", () => {
    expect(PUSH_SCHEMA.ddl.join("\n")).toContain("PRIMARY KEY (tenant_id, endpoint)");
  });
});

/* ⚠️ Named so the type is reachable from a proof — an exported shape nothing
   refers to is surface a later stage builds on by mistake. */
const _instant: Instant = "2026-01-01T00:00:00.000Z" as Instant;
void _instant;
