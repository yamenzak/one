/**
 * THE DOOR, HELD TO WHAT IT PROMISES.
 *
 * ⚠️ EVERY ASSERTION HERE IS ABOUT A DECISION, NOT ABOUT A RENDER. A sign-in
 * screen that renders is not a sign-in screen that works: what matters is which
 * lane a browser is offered, what a dismissal means, what a wrong code does to the
 * screen somebody is standing on, and whether the address they typed can be read
 * back out of an answer. None of that is visible in markup alone.
 *
 * ⚠️ AND THE BROWSER IS A FIXTURE. The whole ceremony module takes its two calls
 * as a parameter precisely so the outcomes can be exercised — a passkey flow that
 * can only be tested by having a fingerprint reader is a passkey flow nobody tests.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Problem } from "@one/kernel";
import { b64u } from "@one/kernel";
import { Door, nextDoor, waitFrom, type DoorAt, type DoorWire } from "../src/door.js";
import { outcomeOf, registerPasskey, signInWithPasskey, type Ceremony } from "../src/passkey.js";
import { needsProof, ProveIt, ProveItBody } from "../src/prove.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node as never);

const REFUSED: Problem = {
  code: "platform.too_many", status: 429, retryable: true, ref: "req_1",
  title: "Too many requests", meta: { retryAfter: 42 },
} as unknown as Problem;

const WIRE: DoorWire = {
  sendCode: async () => null,
  verifyCode: async () => ({ offerPasskey: false }),
  beginPasskey: async () => ({ challenge: b64u.encode(new Uint8Array([1, 2, 3])), relyingParty: "4dl.app", allow: [] }),
  finishPasskey: async () => null,
  beginRegister: async () => ({ challenge: b64u.encode(new Uint8Array([4])), relyingParty: "4dl.app", accountId: "acc_1", exclude: [] }),
  finishRegister: async () => null,
};

/** A browser that can do everything and always says yes. */
const willing = (over: Partial<Ceremony> = {}): Ceremony => ({
  available: async () => true,
  autofill: async () => true,
  create: async () => ({ id: "cred", response: { attestationObject: new Uint8Array([1]).buffer, clientDataJSON: new Uint8Array([2]).buffer } }) as never,
  get: async () => ({ id: "cred", response: { authenticatorData: new Uint8Array([1]).buffer, clientDataJSON: new Uint8Array([2]).buffer, signature: new Uint8Array([3]).buffer } }) as never,
  ...over,
});

/* ------------------------------------------------------------------ state --- */

describe("getting in, as a sequence of steps", () => {
  const address: DoorAt = { at: "address" };

  it("sends somebody to the code screen with the address they typed", () => {
    expect(nextDoor(address, { step: "sent", email: "nadia@example.test" }))
      .toEqual({ at: "code", email: "nadia@example.test" });
  });

  /*
    ⚠️ THE OFFER IS THE SERVER'S ANSWER AND THE SCREEN NEVER GUESSES IT. It knows
    which credentials this person holds and which relying party this door prompts
    for; a screen deciding for itself would nag somebody who already has one, on
    every sign-in, forever.
  */
  it("offers a passkey only when the answer said to", () => {
    const at: DoorAt = { at: "code", email: "n@example.test" };
    expect(nextDoor(at, { step: "verified", email: "n@example.test", offer: true }))
      .toEqual({ at: "offer", email: "n@example.test" });
    expect(nextDoor(at, { step: "verified", email: "n@example.test", offer: false })).toEqual({ at: "in" });
  });

  /* ⚠️ A PASSKEY SIGN-IN NEVER LANDS ON THE OFFER — they just used the thing it
     would be suggesting. */
  it("never offers a passkey to somebody who just used one", () => {
    expect(nextDoor(address, { step: "asserted" })).toEqual({ at: "in" });
    expect(nextDoor({ at: "code", email: "n@example.test" }, { step: "asserted" })).toEqual({ at: "in" });
  });

  /*
    ⚠️ BOTH ANSWERS TO THE OFFER END IN THE SAME PLACE, which is what makes it an
    offer. Somebody standing there is already signed in; a "Not now" that left them
    outside would be a screen taking back a session it had already granted.
  */
  it("lets both answers to the offer through", () => {
    expect(nextDoor({ at: "offer", email: "n@example.test" }, { step: "settled" })).toEqual({ at: "in" });
  });

  it("forgets the address when somebody asks to use another", () => {
    expect(nextDoor({ at: "code", email: "n@example.test" }, { step: "restart" })).toEqual({ at: "address" });
  });
});

/* ---------------------------------------------------------------- cooldown --- */

describe("asking for another code", () => {
  /*
    ⚠️ THE COUNTDOWN IS THE SERVER'S NUMBER. The runtime refuses a second code
    inside a minute and reports what is left; a screen that counted on its own
    would drift out of step with the only clock that decides anything, and the
    button would come back before the endpoint would answer it.
  */
  it("takes the wait from the refusal rather than inventing one", () => {
    expect(waitFrom(REFUSED)).toBe(42);
  });

  it("falls back to nothing when a refusal carries no number", () => {
    expect(waitFrom({ code: "platform.invalid", status: 400, retryable: false, ref: "r", title: "No" } as unknown as Problem)).toBe(0);
  });
});

/* --------------------------------------------------------------- ceremony --- */

describe("what a browser can do to a ceremony", () => {
  /*
    ⚠️ THE DISTINCTION THIS WHOLE MODULE EXISTS FOR. `NotAllowedError` is what a
    browser throws when somebody dismisses the sheet, when the ceremony times out,
    and when a conditional request is superseded — the three most ordinary things
    that can happen. Reported as a failure, the product accuses somebody of a
    mistake they did not make, in red, on the screen where they cannot get in.
  */
  it("reads a dismissal as a dismissal", () => {
    const dismissed = Object.assign(new Error("no"), { name: "NotAllowedError" });
    expect(outcomeOf(dismissed)).toEqual({ at: "cancelled" });
  });

  it("reads our own abort as a dismissal, because that is what it is", () => {
    expect(outcomeOf(Object.assign(new Error("x"), { name: "AbortError" }))).toEqual({ at: "cancelled" });
  });

  /* ⚠️ ALREADY ENROLLED IS SOMETHING SOMEBODY HAS, NOT SOMETHING THEY DID WRONG.
     The authenticator refuses a second credential for the same account, which is
     the exclude list doing its job. */
  it("reads an already-enrolled authenticator as nothing to report", () => {
    expect(outcomeOf(Object.assign(new Error("x"), { name: "InvalidStateError" }))).toEqual({ at: "cancelled" });
  });

  it("keeps a real failure as one", () => {
    expect(outcomeOf(Object.assign(new Error("x"), { name: "SecurityError" })))
      .toEqual({ at: "failed", why: "SecurityError" });
  });

  /*
    ⚠️ A DEVICE THAT CANNOT HOLD A PASSKEY IS ASKED BEFORE IT IS PROMPTED. Calling
    `create` on one throws, and the throw arrives in the middle of an offer
    somebody accepted — so it reads as the product breaking rather than as a
    device that was never going to work.
  */
  it("does not prompt a device that cannot hold a passkey", async () => {
    const create = vi.fn();
    const made = await registerPasskey(
      { challenge: b64u.encode(new Uint8Array([1])), relyingParty: "4dl.app", accountId: "a", exclude: [] },
      { email: "n@example.test" },
      willing({ available: async () => false, create }),
    );
    expect(made).toEqual({ at: "unsupported" });
    expect(create).not.toHaveBeenCalled();
  });

  /*
    ⚠️ THE USER HANDLE IS THE ACCOUNT ID AND THE NAME IS THE ADDRESS, which is the
    one pairing that is easy to write backwards. What goes in `user.id` is stored
    on the authenticator forever and cannot be rewritten by us; an address there is
    a permanent copy of something a person is allowed to change.
  */
  it("puts the account id on the authenticator and the address in front of the person", async () => {
    let asked: CredentialCreationOptions | null = null;
    await registerPasskey(
      { challenge: b64u.encode(new Uint8Array([1])), relyingParty: "4dl.app", accountId: "acc_7", exclude: [] },
      { email: "nadia@example.test" },
      willing({ create: async (options) => { asked = options; return { id: "c", response: { attestationObject: new Uint8Array([1]).buffer, clientDataJSON: new Uint8Array([2]).buffer } } as never; } }),
    );
    const user = (asked as unknown as { publicKey: { user: { id: BufferSource; name: string } } }).publicKey.user;
    expect(new TextDecoder().decode(user.id as Uint8Array)).toBe("acc_7");
    expect(user.name).toBe("nadia@example.test");
  });

  /*
    ⚠️ BOTH ALGORITHMS, AND THE SECOND ONE IS WHY IT WORKS ON WINDOWS. −7 is
    ES256, which every platform authenticator does; −257 is RS256, which is what
    Windows Hello produces. Offering only the first is the reason a product "does
    not work on Windows" and nobody can say why.
  */
  it("offers the algorithm Windows Hello actually produces", async () => {
    let asked: CredentialCreationOptions | null = null;
    await registerPasskey(
      { challenge: b64u.encode(new Uint8Array([1])), relyingParty: "4dl.app", accountId: "a", exclude: [] },
      { email: "n@example.test" },
      willing({ create: async (options) => { asked = options; return { id: "c", response: { attestationObject: new Uint8Array([1]).buffer, clientDataJSON: new Uint8Array([2]).buffer } } as never; } }),
    );
    const algs = (asked as unknown as { publicKey: { pubKeyCredParams: readonly { alg: number }[] } })
      .publicKey.pubKeyCredParams.map((p) => p.alg);
    expect(algs).toContain(-7);
    expect(algs).toContain(-257);
  });

  /*
    ⚠️ AN EMPTY ALLOW LIST IS "ANY CREDENTIAL HERE", WHICH IS WHAT LETS THE DOOR
    OPEN WITH NO ADDRESS TYPED. The server issues a challenge whether or not the
    address exists — anything else is a membership oracle — so a discoverable
    passkey resolves the whole sign-in from an empty field.
  */
  it("asks for any credential when it has been given no address", async () => {
    let asked: CredentialRequestOptions | null = null;
    const got = await signInWithPasskey(
      { challenge: b64u.encode(new Uint8Array([9])), relyingParty: "4dl.app", allow: [] },
      willing({ get: async (options) => { asked = options; return { id: "c", response: { authenticatorData: new Uint8Array([1]).buffer, clientDataJSON: new Uint8Array([2]).buffer, signature: new Uint8Array([3]).buffer } } as never; } }),
    );
    expect(got.at).toBe("ok");
    expect((asked as unknown as { publicKey: { allowCredentials: readonly unknown[] } }).publicKey.allowCredentials).toEqual([]);
  });

  /* ⚠️ CONDITIONAL IS WHAT PUTS THE PASSKEY IN THE ADDRESS FIELD rather than in a
     sheet nobody asked for, and it is a different request to the browser. */
  it("asks for the suggestion lane when it is arming the field", async () => {
    let asked: CredentialRequestOptions | null = null;
    await signInWithPasskey(
      { challenge: b64u.encode(new Uint8Array([9])), relyingParty: "4dl.app", allow: [] },
      willing({ get: async (options) => { asked = options; return null as never; } }),
      { conditional: true },
    );
    expect((asked as unknown as { mediation?: string }).mediation).toBe("conditional");
  });

  /* ⚠️ NOTHING BACK IS A DISMISSAL, NOT A CRASH. A browser may resolve with null
     rather than throwing, and a screen reading `.response` off it would fail with
     a type error in front of somebody trying to sign in. */
  it("treats an empty answer as a dismissal", async () => {
    const got = await signInWithPasskey(
      { challenge: b64u.encode(new Uint8Array([9])), relyingParty: "4dl.app", allow: [] },
      willing({ get: async () => null }),
    );
    expect(got).toEqual({ at: "cancelled" });
  });
});

/* ----------------------------------------------------------------- screen --- */

describe("what the door says", () => {
  const open = (over: Partial<DoorWire> = {}) => html(
    <Door name="Kova" wire={{ ...WIRE, ...over }} onIn={() => undefined} ceremony={willing()} />,
  );

  /*
    ⚠️ NO SIGN-UP, NO "NO ACCOUNT FOUND", NO DIFFERENCE OF ANY KIND. Both
    operations behind this screen answer identically for an address that has an
    account and one that does not, because telling them apart turns a sign-in
    screen into a membership oracle — type an address, learn whether that person
    uses a clinical product. A screen that added the distinction back would hand
    over exactly what the endpoints refuse to.
  */
  it("says nothing about whether an address is known here", () => {
    const out = open();
    expect(out).not.toMatch(/sign up|create an account|no account|not found|already have/i);
  });

  /* ⚠️ THE FIELD CARRIES THE TOKEN THAT MAKES THE PASSKEY LANE EXIST. Without
     `webauthn` in the autocomplete, the conditional request resolves nowhere and
     the whole suggestion lane is silently dead. */
  it("arms the address field for a passkey", () => {
    /* ⚠️ MATCHED WITHOUT REGARD TO CASE, because this renderer emits the property
       name as it was written and HTML attribute names are case-insensitive — what
       reaches the DOM is `autocomplete` either way. Asserting the exact casing
       would be pinning a renderer's habit rather than the behaviour. */
    expect(open()).toMatch(/autocomplete="username webauthn"/i);
  });

  /* ⚠️ IT ASKS FOR AN ADDRESS AND NOTHING ELSE. A password field here would be a
     password this platform does not have, offered to a manager that would then
     save one. */
  it("asks for no password, because there is none", () => {
    const out = open();
    expect(out).not.toContain('type="password"');
    expect(out).not.toMatch(/password/i);
  });
});

/* ------------------------------------------------------------------ proof --- */

describe("proving it is you, again", () => {
  const REFUSAL: Problem = {
    code: "platform.proof_required", status: 401, retryable: false, ref: "r", title: "Confirm it is you",
  } as unknown as Problem;

  /*
    ⚠️ THE SHEET IS RAISED BY A REFUSAL, NEVER GUESSED AT. Which operations ask
    for a recent proof is declared on the operations themselves; a screen deciding
    for itself would be a second copy of that rule, and the copy is the one that
    goes out of date the first time a fourth operation is added.
  */
  it("knows the one refusal a proof resolves", () => {
    expect(needsProof(REFUSAL)).toBe(true);
    expect(needsProof({ ...REFUSAL, code: "platform.forbidden" } as unknown as Problem)).toBe(false);
    expect(needsProof(null)).toBe(false);
  });

  const asked = (over: Partial<DoorWire> = {}) => html(
    <ProveItBody
      email="nadia@example.test" toDo="closing your account"
      wire={{ ...WIRE, ...over }} onProven={() => undefined} ceremony={willing()}
    />,
  );

  /*
    ⚠️ IT NEVER ASKS WHO THEY ARE. This person is signed in and the session knows
    the address; a field demanding it back is a form standing between somebody and
    something they were in the middle of doing.
  */
  it("shows the address rather than asking for it", () => {
    const out = asked();
    expect(out).not.toMatch(/Email address/);
    expect(out).toContain("closing your account");
  });

  /* ⚠️ AND IT SAYS WHAT IT IS FOR. "Confirm it is you" with no object is a
     product being suspicious of somebody for no stated reason. */
  it("names the thing it is asking about", () => {
    expect(asked()).toMatch(/Before closing your account/);
  });

  /* ⚠️ THE BODY IS SEPARATE FROM THE SHEET FOR THE SAME REASON EVERY OTHER ONE
     IS: a portal renders nothing outside a browser, so a body welded to one is a
     body whose words are asserted against an empty string, forever, in a test
     that passes. Closed, the presentation is nothing at all. */
  it("is presented in a sheet, which renders nothing while it is closed", () => {
    expect(html(
      <ProveIt open={false} email="n@example.test" toDo="x" wire={WIRE}
        onProven={() => undefined} onClose={() => undefined} ceremony={willing()} />,
    )).toBe("");
  });
});
