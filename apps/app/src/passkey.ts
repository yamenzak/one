/**
 * Passkey (WebAuthn) client (SPEC §4) — enroll + sign-in against Better Auth's
 * passkey plugin endpoints. Better Auth returns the PublicKeyCredential options;
 * we run the browser ceremony and post the result back.
 */

import { api } from "./api.js";

export const passkeySupported = (): boolean =>
  typeof window !== "undefined" && !!window.PublicKeyCredential;

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
  const options = await api.post<PublicKeyCredentialCreationOptionsJSON>(
    "/api/auth/passkey/generate-register-options",
    {},
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
