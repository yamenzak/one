/**
 * Passkey (WebAuthn) client (SPEC §4) — enroll + sign-in against Better Auth's
 * passkey plugin endpoints. Better Auth returns the PublicKeyCredential options;
 * we run the browser ceremony and post the result back.
 */

import { api } from "./api.js";

export const passkeySupported = (): boolean =>
  typeof window !== "undefined" && !!window.PublicKeyCredential;

/** Turn a passkey enroll/sign-in failure into a message that says WHY, so the
 *  user knows whether they cancelled, need HTTPS, or already have one. */
export function passkeyErrorMessage(e: unknown, action: "enroll" | "signin" = "enroll"): string {
  const name = e instanceof DOMException ? e.name : "";
  switch (name) {
    case "NotAllowedError":
      return "Cancelled, or the prompt timed out — try again when you're ready.";
    case "InvalidStateError":
      return "This device already has a passkey for your account — you're all set.";
    case "SecurityError":
      return "Passkeys need a secure (https) connection on a matching domain.";
    case "NotSupportedError":
      return "This device can't create a passkey — you'll keep using email codes.";
    case "AbortError":
      return "The request was interrupted — try again.";
  }
  return action === "enroll"
    ? "Couldn't finish setting up the passkey — please try again."
    : "Couldn't sign in with a passkey — try an email code.";
}

/**
 * Conditional-UI (autofill) support — lets the browser surface passkeys in the
 * email field's autofill dropdown (SPEC §4 "passkey autofill on the login
 * screen"). Guarded because not every browser implements it.
 */
export async function conditionalPasskeyAvailable(): Promise<boolean> {
  try {
    const PK = window.PublicKeyCredential as unknown as { isConditionalMediationAvailable?: () => Promise<boolean> };
    return passkeySupported() && typeof PK.isConditionalMediationAvailable === "function" && (await PK.isConditionalMediationAvailable());
  } catch {
    return false;
  }
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBuf(s: string): ArrayBuffer {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const base = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/** Enroll a new passkey for the signed-in user. */
export async function enrollPasskey(name: string): Promise<void> {
  // Better Auth serves the options as a GET (POST 404s) — the challenge is
  // minted per request and bound to the session cookie.
  const options = await api.get<PublicKeyCredentialCreationOptionsJSON>(
    "/api/auth/passkey/generate-register-options",
  );
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...(options as unknown as PublicKeyCredentialCreationOptions),
    challenge: b64urlToBuf(options.challenge),
    user: {
      ...options.user,
      id: b64urlToBuf(options.user.id),
    },
    excludeCredentials: options.excludeCredentials?.map((c) => ({ ...c, id: b64urlToBuf(c.id) })) as PublicKeyCredentialDescriptor[] | undefined,
  };
  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error("passkey creation cancelled");
  const resp = cred.response as AuthenticatorAttestationResponse;
  await api.post("/api/auth/passkey/verify-registration", {
    name,
    response: {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: bufToB64url(resp.clientDataJSON),
        attestationObject: bufToB64url(resp.attestationObject),
      },
    },
  });
}

interface PublicKeyCredentialCreationOptionsJSON {
  challenge: string;
  user: { id: string; name: string; displayName: string };
  excludeCredentials?: { id: string; type: string }[];
  [k: string]: unknown;
}

export async function listPasskeys(): Promise<{ id: string; name: string | null; createdAt: string }[]> {
  const r = await api.get<{ passkeys?: { id: string; name: string | null; createdAt: string }[] }>("/api/auth/passkey/list-user-passkeys").catch(() => ({ passkeys: [] }));
  return r.passkeys ?? [];
}

interface RequestOptionsJSON {
  challenge: string;
  allowCredentials?: { id: string; type: string; transports?: string[] }[];
  rpId?: string;
  userVerification?: string;
  timeout?: number;
}

/**
 * Sign in with an existing passkey (WebAuthn get ceremony). With
 * `conditional`, runs as autofill UI — non-modal, resolves only when the user
 * picks a passkey from the field dropdown; pass an AbortSignal to cancel it.
 */
export async function signInWithPasskey(opts?: { conditional?: boolean; signal?: AbortSignal }): Promise<void> {
  // GET, like register-options (a POST 404s); this one also works pre-auth so
  // the login screen's passkey button + autofill can call it.
  const options = await api.get<RequestOptionsJSON>("/api/auth/passkey/generate-authenticate-options");
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: b64urlToBuf(options.challenge),
    rpId: options.rpId,
    userVerification: (options.userVerification as UserVerificationRequirement) ?? "preferred",
    timeout: options.timeout,
    allowCredentials: options.allowCredentials?.map((c) => ({ id: b64urlToBuf(c.id), type: "public-key" as const, transports: c.transports as AuthenticatorTransport[] | undefined })),
  };
  const cred = (await navigator.credentials.get({
    publicKey,
    ...(opts?.conditional ? { mediation: "conditional" as CredentialMediationRequirement } : {}),
    signal: opts?.signal,
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("passkey sign-in cancelled");
  const resp = cred.response as AuthenticatorAssertionResponse;
  await api.post("/api/auth/passkey/verify-authentication", {
    response: {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: bufToB64url(resp.clientDataJSON),
        authenticatorData: bufToB64url(resp.authenticatorData),
        signature: bufToB64url(resp.signature),
        userHandle: resp.userHandle ? bufToB64url(resp.userHandle) : undefined,
      },
    },
  });
}
