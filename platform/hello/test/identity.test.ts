/**
 * SIGNING IN — the emailed code, the passkey, and every refusal that matters.
 *
 * ⚠️ THE ASSERTIONS WORTH READING ARE THE NEGATIVE ONES. A ceremony that accepts
 * a correct assertion is the half nobody gets wrong; what a passkey is worth is
 * entirely in what it refuses, and each refusal below is a check that produces
 * a valid-looking success when it is missing.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker, { delivered } from "../src/worker.js";
import { authenticator } from "./authenticator.js";
import { post, SETUP, signIn } from "./session.js";

const ORIGIN = "https://acme.hello.4dl.app";
/** Under our own root the relying party is the PLATFORM root, not the app's. */
const RP = "4dl.app";

let cookie = "";
const call = async (path: string, body?: unknown, o: { origin?: string; cookie?: string } = {}) => {
  const res = await worker.fetch(
    new Request(`${o.origin ?? ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(o.cookie ?? cookie ? { cookie: o.cookie ?? cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  const set = res.headers.get("set-cookie");
  if (set && o.cookie === undefined) cookie = set.split(";")[0]!;
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

/** Through the real ceremony, and it sets the ambient cookie the way a browser would. */
const signInHere = async (email: string) => {
  await call("/api/identity.code.request", { email });
  return call("/api/identity.code.verify", { email, code: delivered.get(email) });
};

beforeAll(async () => {
  // The workspace has to exist before any request can resolve to its origin —
  // and creating one now needs a session, which is the point of the whole file.
  const staff = await signIn("setup@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "acme" }, staff);
});

/* ------------------------------------------------------------------ code --- */

describe("the emailed code, which is what proves an address", () => {
  it("issues a session", async () => {
    const r = await signInHere("ada@example.test");
    expect(r.status).toBe(200);
    expect(r.body.accountId).toMatch(/^u_/);
    const me = await call("/api/identity.session.read");
    expect(me.body).toMatchObject({ signedIn: true, email: "ada@example.test" });
  });

  /*
    ⚠️ THE SAME ANSWER WHETHER OR NOT THE ADDRESS HAS AN ACCOUNT. Telling them
    apart turns this into a membership oracle: type an address, learn whether
    that person uses the product. For a clinical product that is a disclosure on
    its own.
  */
  it("answers a stranger exactly as it answers a member", async () => {
    const known = await call("/api/identity.code.request", { email: "ada@example.test" }, { cookie: "" });
    const unknown = await call("/api/identity.code.request", { email: "nobody@example.test" }, { cookie: "" });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  });

  it("refuses a wrong code, and stops counting after a few", async () => {
    await call("/api/identity.code.request", { email: "grace@example.test" });
    for (let i = 0; i < 5; i++) {
      expect((await call("/api/identity.code.verify", { email: "grace@example.test", code: "000000" })).status).toBe(400);
    }
    // Six digits is a number an attacker counts to. The row is discarded rather
    // than locked — a lockout here is a denial of service aimed at any address.
    const real = delivered.get("grace@example.test")!;
    expect((await call("/api/identity.code.verify", { email: "grace@example.test", code: real })).status).toBe(400);
  });

  it("consumes the code, so it cannot be used twice", async () => {
    await call("/api/identity.code.request", { email: "linus@example.test" });
    const code = delivered.get("linus@example.test")!;
    expect((await call("/api/identity.code.verify", { email: "linus@example.test", code })).status).toBe(200);
    expect((await call("/api/identity.code.verify", { email: "linus@example.test", code })).status).toBe(400);
  });

  /*
    ⚠️ A DELIVERABILITY CONTROL AS MUCH AS A SECURITY ONE. An address receiving
    ten codes a minute marks the sender as spam for every other recipient on the
    domain, and that damage is not per-tenant.
  */
  it("refuses a second send inside the cooldown", async () => {
    await call("/api/identity.code.request", { email: "edsger@example.test" });
    const again = await call("/api/identity.code.request", { email: "edsger@example.test" });
    expect(again.status).toBe(429);
    expect(again.body.meta).toMatchObject({ retryAfter: expect.any(Number) });
  });
});

/* --------------------------------------------------------------- passkey --- */

describe("the passkey ceremony", () => {
  let fake: Awaited<ReturnType<typeof authenticator>>;

  beforeAll(async () => {
    fake = await authenticator();
    await signInHere("alan@example.test");
  });

  const begin = () => call("/api/identity.passkey.register.begin", {});

  /*
    ⚠️ THE LINE THAT MAKES THE PASSKEY LANE SAFE. Without a session behind
    registration, anybody who can type an address attaches a credential to it —
    and the strongest factor in the product becomes the cheapest way to take an
    account over.
  */
  it("refuses to register a passkey with no session", async () => {
    expect((await call("/api/identity.passkey.register.begin", {}, { cookie: "" })).status).toBe(403);
  });

  it("registers one, at the PLATFORM root rather than this app's host", async () => {
    const started = await begin();
    expect(started.body.relyingParty).toBe(RP);
    const made = await fake.register({ challenge: started.body.challenge as string, origin: ORIGIN, rpId: RP });
    const done = await call("/api/identity.passkey.register.finish", made);
    expect(done.status).toBe(200);
    // Recorded as the door's relying party and never rewritten: what a credential
    // is good for is decided once, at creation.
    expect(done.body.relyingParty).toBe(RP);
  });

  it("signs in with it", async () => {
    const started = await call("/api/identity.passkey.begin", { email: "alan@example.test" }, { cookie: "" });
    expect(started.body.allow).toContain(fake.credentialId);
    const assertion = await fake.assert({ challenge: started.body.challenge as string, origin: ORIGIN, rpId: RP });
    const done = await call("/api/identity.passkey.finish", assertion, { cookie: "" });
    expect(done.status).toBe(200);
  });

  /*
    ⚠️ THE ANTI-PHISHING PROPERTY. A site that looks identical cannot make an
    authenticator sign OUR origin, so this one comparison is most of what a
    passkey is worth. Relaxing it to a suffix gives that away for every user.
  */
  it("refuses an assertion signed for another origin", async () => {
    const started = await call("/api/identity.passkey.begin", { email: "alan@example.test" }, { cookie: "" });
    const assertion = await fake.assert({
      challenge: started.body.challenge as string, origin: "https://hello.4dl.app.evil.test", rpId: RP,
    });
    expect((await call("/api/identity.passkey.finish", assertion, { cookie: "" })).status).toBe(400);
  });

  it("refuses an assertion whose relying party is not ours", async () => {
    const started = await call("/api/identity.passkey.begin", { email: "alan@example.test" }, { cookie: "" });
    const assertion = await fake.assert({ challenge: started.body.challenge as string, origin: ORIGIN, rpId: "evil.test" });
    expect((await call("/api/identity.passkey.finish", assertion, { cookie: "" })).status).toBe(400);
  });

  /*
    ⚠️ A CHALLENGE THAT SURVIVES ITS USE IS NOT A CHALLENGE. Without single use,
    a captured assertion is a password that never expires.
  */
  it("refuses a replayed assertion", async () => {
    const started = await call("/api/identity.passkey.begin", { email: "alan@example.test" }, { cookie: "" });
    const assertion = await fake.assert({ challenge: started.body.challenge as string, origin: ORIGIN, rpId: RP });
    expect((await call("/api/identity.passkey.finish", assertion, { cookie: "" })).status).toBe(200);
    expect((await call("/api/identity.passkey.finish", assertion, { cookie: "" })).status).toBe(400);
  });

  it("refuses a challenge nobody issued", async () => {
    const assertion = await fake.assert({ challenge: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", origin: ORIGIN, rpId: RP });
    expect((await call("/api/identity.passkey.finish", assertion, { cookie: "" })).status).toBe(400);
  });

  /*
    ⚠️ A SIGNATURE COUNTER THAT DID NOT ADVANCE IS A CLONE, and it is the one
    attack the protocol can detect on our behalf.
  */
  it("refuses a counter that went backwards", async () => {
    const started = await call("/api/identity.passkey.begin", { email: "alan@example.test" }, { cookie: "" });
    const assertion = await fake.assert({ challenge: started.body.challenge as string, origin: ORIGIN, rpId: RP, counter: 1 });
    expect((await call("/api/identity.passkey.finish", assertion, { cookie: "" })).status).toBe(400);
  });

  it("refuses a ceremony of the wrong kind", async () => {
    // A registration response replayed into sign-in, or the reverse.
    const started = await call("/api/identity.passkey.begin", { email: "alan@example.test" }, { cookie: "" });
    const assertion = await fake.assert({
      challenge: started.body.challenge as string, origin: ORIGIN, rpId: RP, type: "webauthn.create",
    });
    expect((await call("/api/identity.passkey.finish", assertion, { cookie: "" })).status).toBe(400);
  });
});

/* --------------------------------------------------------------- session --- */

describe("a session belongs to one origin", () => {
  /*
    ⚠️ AN ACCOUNT IS SHARED ACROSS PRODUCTS; A SESSION IS NOT. One credential
    everywhere is a feature. One bearer token everywhere means a script injected
    into any product acts as that person in all of them.
  */
  it("is refused at an origin it was not issued for", async () => {
    const r = await signInHere("barbara@example.test");
    expect(r.status).toBe(200);
    // The setup door, which resolves no tenant and is therefore always reachable
    // — so this asserts the origin rule rather than a workspace's existence.
    const elsewhere = await call("/api/identity.session.read", undefined, { origin: SETUP });
    expect(elsewhere.body).toEqual({ signedIn: false });
  });

  it("ends on sign-out, and the cookie with it", async () => {
    await signInHere("katherine@example.test");
    expect((await call("/api/identity.session.read")).body).toMatchObject({ signedIn: true });
    const out = await call("/api/identity.signout", {});
    expect(out.status).toBe(200);
    expect((await call("/api/identity.session.read")).body).toEqual({ signedIn: false });
  });
});

/* --------------------------------------------------------- custom domain --- */

describe("a credential is spent only where it was made", () => {
  const OWN = "https://notes.byshujaa.test";

  beforeAll(async () => {
    const staff = await signIn("domains@example.test", SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug: "shujaa" }, staff);
    /*
      Written directly because custom-domain onboarding is a later stage. What is
      being asserted here is not how a domain is added — it is what happens to a
      credential once one exists.
    */
    await (env as { DIRECTORY: { prepare(s: string): { bind(...a: unknown[]): { run(): Promise<unknown> } } } }).DIRECTORY
      .prepare(`INSERT OR REPLACE INTO tenant_domains (hostname, tenant_id) VALUES (?, ?)`)
      .bind("notes.byshujaa.test", made.body.tenantId).run();
  });

  /*
    ⚠️ A TENANT'S OWN DOMAIN GETS ITS OWN RELYING PARTY, and that is a WebAuthn
    invariant rather than a policy — there is no registrable-domain suffix
    relationship to our root. It is also exactly what whitelabel demands: a
    studio's customer is never bounced to a domain they do not recognise, which
    would read as phishing.
  */
  it("uses the hostname itself as the relying party on a tenant's own domain", async () => {
    const started = await post(OWN, "/api/identity.passkey.begin", { email: "ada@example.test" });
    expect(started.body.relyingParty).toBe("notes.byshujaa.test");
  });

  /*
    ⚠️ THE CHECK THAT MAKES THE SCOPE MEAN SOMETHING. A credential registered
    under our root is offered beneath it and nowhere else; one registered on a
    tenant's own domain never leaves that domain. Without this, a passkey created
    on any origin could be spent on every other one the platform serves.
  */
  it("refuses a credential whose relying party does not cover this door", async () => {
    const cookie = await signIn("scoped@example.test", OWN);
    const own = await authenticator();
    const started = await post(OWN, "/api/identity.passkey.register.begin", {}, cookie);
    const made = await own.register({ challenge: started.body.challenge as string, origin: OWN, rpId: "notes.byshujaa.test" });
    expect((await post(OWN, "/api/identity.passkey.register.finish", made, cookie)).res.status).toBe(200);

    // The same credential, offered at a door under our own root, is not ours to spend.
    const elsewhere = await post(ORIGIN, "/api/identity.passkey.begin", { email: "scoped@example.test" });
    expect(elsewhere.body.allow).not.toContain(own.credentialId);

    const assertion = await own.assert({
      challenge: elsewhere.body.challenge as string, origin: ORIGIN, rpId: "notes.byshujaa.test",
    });
    expect((await post(ORIGIN, "/api/identity.passkey.finish", assertion)).res.status).toBe(400);
  });
});
