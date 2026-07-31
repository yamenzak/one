/**
 * Passkey (WebAuthn) client (SPEC §4) — enroll + sign-in against Better Auth's
 * passkey plugin. The browser ceremony runs through @simplewebauthn/browser
 * (the same lib Better Auth's own client uses), so the request/response JSON is
 * exactly what the server's verifier expects — no hand-rolled base64url or
 * partial response shapes (which silently failed verify-registration before).
 *
 * The option endpoints are GETs; the challenge is minted per request and bound
 * to a signed cookie the verify POST sends back. verify-{registration,
 * authentication} take `{ response }` (the credential minus its extension
 * results), matching Better Auth's schema.
 */

import { startRegistration, startAuthentication, browserSupportsWebAuthnAutofill, WebAuthnError } from "@simplewebauthn/browser";
import { api } from "./api.js";

type RegisterOptions = Parameters<typeof startRegistration>[0]["optionsJSON"];
type AuthenticateOptions = Parameters<typeof startAuthentication>[0]["optionsJSON"];

export const passkeySupported = (): boolean =>
  typeof window !== "undefined" && !!window.PublicKeyCredential;

/** A human device label for a new passkey — "Chrome · macOS", "Safari · iPhone".
 *  `navigator.platform` (what we used before) is deprecated and returns opaque
 *  values like "MacIntel" / "Win32" / "" — so the stored names read wrong. This
 *  prefers the modern userAgentData, then falls back to parsing the UA. */
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Passkey";
  const ua = navigator.userAgent || "";
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const os =
    uaData?.platform ||
    (/iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "");
  const browser =
    /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  const label = [browser, os].filter(Boolean).join(" · ");
  return label || "Passkey";
}

/** Conditional-UI (autofill) support — lets the browser surface passkeys in the
 *  email field's autofill dropdown. */
export async function conditionalPasskeyAvailable(): Promise<boolean> {
  try {
    return passkeySupported() && (await browserSupportsWebAuthnAutofill());
  } catch {
    return false;
  }
}

/** Turn a passkey enroll/sign-in failure into a message that says WHY. */
export function passkeyErrorMessage(e: unknown, action: "enroll" | "signin" = "enroll"): string {
  if (e instanceof WebAuthnError && e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return "This device already has a passkey for your account — you're all set.";
  }
  const dom = e instanceof DOMException ? e : e instanceof WebAuthnError && e.cause instanceof DOMException ? e.cause : null;
  switch (dom?.name) {
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

/** Enroll a new passkey for the signed-in user. */
export async function enrollPasskey(name: string): Promise<void> {
  const optionsJSON = await api.get<RegisterOptions>("/api/auth/passkey/generate-register-options");
  const res = await startRegistration({ optionsJSON });
  const { clientExtensionResults, ...response } = res;
  void clientExtensionResults;
  await api.post("/api/auth/passkey/verify-registration", { response, name });
}

/** Unregister a passkey (removes this device/credential from the account). */
export async function removePasskey(id: string): Promise<void> {
  await api.post("/api/auth/passkey/delete-passkey", { id });
}

export async function listPasskeys(): Promise<{ id: string; name: string | null; createdAt: string }[]> {
  const r = await api.get<{ passkeys?: { id: string; name: string | null; createdAt: string }[] } | { id: string; name: string | null; createdAt: string }[]>("/api/auth/passkey/list-user-passkeys").catch(() => []);
  return Array.isArray(r) ? r : r.passkeys ?? [];
}

/**
 * Sign in with an existing passkey (WebAuthn get ceremony). With `conditional`,
 * runs as autofill UI — non-modal, resolving only when the user picks a passkey
 * from the field dropdown. (@simplewebauthn self-manages aborting a pending
 * conditional request when the next ceremony starts.)
 */
export async function signInWithPasskey(opts?: { conditional?: boolean; signal?: AbortSignal }): Promise<void> {
  const optionsJSON = await api.get<AuthenticateOptions>("/api/auth/passkey/generate-authenticate-options");
  const res = await startAuthentication({ optionsJSON, useBrowserAutofill: opts?.conditional });
  const { clientExtensionResults, ...response } = res;
  void clientExtensionResults;
  await api.post("/api/auth/passkey/verify-authentication", { response });
}
