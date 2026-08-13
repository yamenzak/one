/**
 * vocabulary-exempt-file(client): the WebAuthn field names crossing this surface.
 * They are the browser's API, not ours to rename — and renaming them here would
 * mean a translation layer between two things that already agree.
 *
 * THE CEREMONY, IN THE BROWSER — the other half of `runtime/webauthn.ts`.
 *
 * ⚠️ THE SERVER HALF HAS EXISTED FOR THREE STAGES AND NOTHING EVER CALLED IT.
 * `identity.passkey.register.begin`, `.finish`, `.begin` and `.finish` are
 * written, verified and tested; no screen anywhere invoked them, because there
 * was no sign-in surface at all. That is the shape this platform has a guard
 * against — a mechanism with no surface — and it is what this file and `door.tsx`
 * close.
 *
 * ⚠️ THE ENCODER IS THE KERNEL'S. A challenge is bytes and the wire is text; the
 * server verifies what this encodes, so a second copy of base64url here is a pair
 * that can disagree — and base64 against base64url disagrees on roughly one
 * challenge in eight, which reads as "sign-in is flaky" rather than as a bug.
 *
 * ⚠️ A CANCELLED CEREMONY IS NOT A FAILURE, AND THIS IS THE DISTINCTION EVERY
 * NAIVE IMPLEMENTATION LOSES. `NotAllowedError` is what a browser throws when
 * somebody dismisses the sheet, when the ceremony times out, and when a
 * conditional request is superseded — three of the most ordinary things that can
 * happen. Rendered as an error, the product accuses somebody of a mistake they
 * did not make, in red, on the screen where they are trying to get in.
 *
 * ⚠️ AND THE BROWSER IS INJECTED RATHER THAN REACHED FOR. Every rule above is a
 * decision about outcomes, and a module that read `navigator` directly could only
 * be tested by having one. What it takes is two functions.
 */

import { b64u } from "@one/kernel";

/* ------------------------------------------------------------- the browser --- */

/**
 * ⚠️ WHAT THIS NEEDS FROM A BROWSER, AND NOTHING ELSE. Two calls and two
 * capability questions — so a test supplies four functions and a screen supplies
 * the real thing.
 */
export interface Ceremony {
  create(options: CredentialCreationOptions): Promise<Credential | null>;
  get(options: CredentialRequestOptions): Promise<Credential | null>;
  /** Whether this device can hold a passkey at all. */
  available(): Promise<boolean>;
  /**
   * Whether a credential can be offered IN THE ADDRESS FIELD rather than in a
   * modal sheet — the difference between "sign in with a passkey" as a button
   * somebody has to know to press and as a suggestion that is simply there.
   */
  autofill(): Promise<boolean>;
}

/**
 * ⚠️ FEATURE DETECTION THAT ANSWERS `false` RATHER THAN THROWING. Every one of
 * these is absent on some shipping browser — `PublicKeyCredential` on old Safari,
 * the two static methods on Firefox for years — and a door that throws while
 * deciding whether to offer a passkey is a door that does not open at all.
 */
export function browserCeremony(): Ceremony {
  const has = (): boolean => typeof PublicKeyCredential !== "undefined";
  const able = (name: "isUserVerifyingPlatformAuthenticatorAvailable" | "isConditionalMediationAvailable") =>
    async (): Promise<boolean> => {
      try {
        const api = PublicKeyCredential as unknown as Record<string, undefined | (() => Promise<boolean>)>;
        return has() && typeof api[name] === "function" ? await api[name]!() : false;
      } catch { return false; }
    };
  return {
    create: (options) => navigator.credentials.create(options),
    get: (options) => navigator.credentials.get(options),
    available: able("isUserVerifyingPlatformAuthenticatorAvailable"),
    autofill: able("isConditionalMediationAvailable"),
  };
}

/* ---------------------------------------------------------------- outcomes --- */

/**
 * ⚠️ FOUR OUTCOMES, AND THREE OF THEM ARE NOT ERRORS. A screen that only has
 * "worked" and "failed" has to render a dismissal as a failure — which is how
 * every passkey flow that annoys people is built.
 */
export type Attempt<T> =
  | { readonly at: "ok"; readonly value: T }
  /** Dismissed, timed out, or superseded. Say nothing; leave the door as it was. */
  | { readonly at: "cancelled" }
  /** No authenticator here. Offer the code lane instead, without apologising. */
  | { readonly at: "unsupported" }
  /** Something genuinely went wrong, and `why` is for a log rather than a person. */
  | { readonly at: "failed"; readonly why: string };

/**
 * ⚠️ THE ONE PLACE A THROWN `DOMException` IS READ. Everything a browser can
 * raise arrives here, and the mapping is the whole difference between a door that
 * blames somebody and one that does not:
 *
 *   NotAllowedError   dismissed, timed out, or a conditional request superseded
 *   AbortError        we cancelled it ourselves, which is the lane switch below
 *   InvalidStateError this authenticator already holds a credential for us —
 *                     which is a SUCCESS somebody already has, not a fault
 *   SecurityError     the relying party does not match the origin: a real defect,
 *                     and one that no amount of retrying will fix
 */
export const outcomeOf = (error: unknown): Attempt<never> => {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return { at: "cancelled" };
  if (name === "InvalidStateError") return { at: "cancelled" };
  if (name === "NotSupportedError") return { at: "unsupported" };
  return { at: "failed", why: name || String(error) };
};

/* ------------------------------------------------------------- registering --- */

/** Exactly what `identity.passkey.register.begin` answers with. */
export interface RegisterOffer {
  readonly challenge: string;
  readonly relyingParty: string;
  readonly accountId: string;
  readonly exclude: readonly string[];
}

/** Exactly what `identity.passkey.register.finish` takes. */
export interface Registered {
  readonly challenge: string;
  readonly attestationObject: string;
  readonly clientDataJSON: string;
  readonly label?: string;
}

/**
 * ⚠️ THE ACCOUNT ID IS THE USER HANDLE, AND IT IS NEVER THE EMAIL. What goes into
 * `user.id` is stored on the authenticator forever and shown in a password
 * manager's list; an address there is a permanent copy of something a person is
 * allowed to change, in a place we cannot reach to update it.
 *
 * ⚠️ AND `name` IS WHAT A PASSWORD MANAGER SHOWS. It is the one string a person
 * reads when choosing between three saved keys, so it is the address rather than
 * an id — the exact opposite of the field above it, for the exact same reason.
 */
export async function registerPasskey(
  offer: RegisterOffer,
  who: { readonly email: string; readonly name?: string },
  ceremony: Ceremony,
  label?: string,
): Promise<Attempt<Registered>> {
  if (!(await ceremony.available())) return { at: "unsupported" };
  try {
    const created = await ceremony.create({
      publicKey: {
        challenge: b64u.decode(offer.challenge) as BufferSource,
        rp: { id: offer.relyingParty, name: who.name ?? offer.relyingParty },
        user: {
          id: new TextEncoder().encode(offer.accountId) as BufferSource,
          name: who.email,
          displayName: who.name ?? who.email,
        },
        /*
          ⚠️ TWO ALGORITHMS, AND BOTH ARE REQUIRED RATHER THAN PREFERRED. −7 is
          ES256, which every platform authenticator does; −257 is RS256, which is
          what Windows Hello produces. Offering only the first is the reason a
          product "does not work on Windows".
        */
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        /* ⚠️ SO AN AUTHENTICATOR CAN REFUSE TO ENROL ITSELF TWICE, which it
           reports as InvalidStateError — read above as "already done". */
        excludeCredentials: offer.exclude.map((id) => ({ id: b64u.decode(id) as BufferSource, type: "public-key" as const })),
        authenticatorSelection: {
          /* ⚠️ DISCOVERABLE, WHICH IS WHAT MAKES THE ADDRESS FIELD OPTIONAL. A
             non-discoverable credential can only be offered to somebody who has
             already told us who they are, so the passkey lane would begin by
             asking for the thing the passkey exists to avoid typing. */
          residentKey: "preferred",
          userVerification: "preferred",
        },
        timeout: 120_000,
      },
    });
    const credential = created as PublicKeyCredential | null;
    const response = credential?.response as AuthenticatorAttestationResponse | undefined;
    if (!credential || !response) return { at: "cancelled" };
    return {
      at: "ok",
      value: {
        challenge: offer.challenge,
        attestationObject: b64u.encode(new Uint8Array(response.attestationObject)),
        clientDataJSON: b64u.encode(new Uint8Array(response.clientDataJSON)),
        ...(label ? { label } : {}),
      },
    };
  } catch (error) {
    return outcomeOf(error);
  }
}

/* ---------------------------------------------------------------- signing --- */

/** Exactly what `identity.passkey.begin` answers with. */
export interface SignInOffer {
  readonly challenge: string;
  readonly relyingParty: string;
  /** ⚠️ EMPTY IS "ANY", NOT "NONE" — see `signInWithPasskey`. */
  readonly allow: readonly string[];
}

/** Exactly what `identity.passkey.finish` takes. */
export interface Asserted {
  readonly challenge: string;
  readonly credentialId: string;
  readonly authenticatorData: string;
  readonly clientDataJSON: string;
  readonly signature: string;
}

export interface SignInWith {
  /**
   * ⚠️ CONDITIONAL PUTS THE PASSKEY IN THE ADDRESS FIELD instead of in a sheet
   * nobody asked for. It resolves only if somebody picks one, so it is started on
   * arrival and simply left running.
   */
  readonly conditional?: boolean;
  /** ⚠️ Required for a conditional request — see the note on the lane switch. */
  readonly signal?: AbortSignal;
}

/**
 * ⚠️ AN EMPTY ALLOW LIST IS "ANY CREDENTIAL FOR THIS RELYING PARTY", WHICH IS THE
 * WHOLE POINT. The server issues a challenge whether or not the address it was
 * given exists — an endpoint that answered differently would report who uses the
 * product to anybody who asked — so the door can begin a passkey sign-in with no
 * address at all, and a discoverable credential resolves it.
 */
export async function signInWithPasskey(
  offer: SignInOffer,
  ceremony: Ceremony,
  how: SignInWith = {},
): Promise<Attempt<Asserted>> {
  try {
    const got = await ceremony.get({
      publicKey: {
        challenge: b64u.decode(offer.challenge) as BufferSource,
        rpId: offer.relyingParty,
        allowCredentials: offer.allow.map((id) => ({ id: b64u.decode(id) as BufferSource, type: "public-key" as const })),
        userVerification: "preferred",
        timeout: 120_000,
      },
      ...(how.conditional ? { mediation: "conditional" as CredentialMediationRequirement } : {}),
      ...(how.signal ? { signal: how.signal } : {}),
    });
    const credential = got as PublicKeyCredential | null;
    const response = credential?.response as AuthenticatorAssertionResponse | undefined;
    if (!credential || !response) return { at: "cancelled" };
    return {
      at: "ok",
      value: {
        challenge: offer.challenge,
        /* ⚠️ THE ID AS THE SERVER STORED IT. `credential.id` is already base64url
           of the raw id, and re-encoding `rawId` by hand is where a second
           encoder would get its chance to disagree. */
        credentialId: credential.id,
        authenticatorData: b64u.encode(new Uint8Array(response.authenticatorData)),
        clientDataJSON: b64u.encode(new Uint8Array(response.clientDataJSON)),
        signature: b64u.encode(new Uint8Array(response.signature)),
      },
    };
  } catch (error) {
    return outcomeOf(error);
  }
}
