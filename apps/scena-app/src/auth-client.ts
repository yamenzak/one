/**
 * Better Auth browser client. Same-origin with the API (one worker in prod, a
 * Vite proxy in dev), so the session cookie is sent automatically. Exposes
 * email/password + magic-link + Google sign-in and the organization plugin
 * (create / list / set-active) — an organization is a Scena tenant.
 *
 * The client's full inferred type reaches into Better Auth internals that TS
 * can't name portably (TS2742), so we cast to a minimal surface of exactly the
 * calls the dashboard uses. Runtime behavior is unchanged.
 */
import { createAuthClient } from "better-auth/react";
import { organizationClient, magicLinkClient, emailOTPClient } from "better-auth/client/plugins";

type Res = { data?: unknown; error?: { message?: string } | null };
type OrgRes = { data?: { id?: string } | null; error?: { message?: string } | null };

interface AuthClient {
  signIn: {
    email: (a: { email: string; password: string }) => Promise<Res>;
    magicLink: (a: { email: string; callbackURL?: string }) => Promise<Res>;
    social: (a: { provider: string; callbackURL?: string }) => Promise<Res>;
    /** Verify an emailed OTP code and sign in (owner flow). */
    emailOtp: (a: { email: string; otp: string }) => Promise<Res>;
  };
  signUp: { email: (a: { email: string; password: string; name: string }) => Promise<Res> };
  signOut: () => Promise<Res>;
  /** Send a sign-in OTP to an email (type "sign-in" creates the account on first use). */
  emailOtp: { sendVerificationOtp: (a: { email: string; type: "sign-in" }) => Promise<Res> };
  organization: {
    create: (a: { name: string; slug: string }) => Promise<OrgRes>;
    setActive: (a: { organizationId: string }) => Promise<Res>;
    list: () => Promise<Res>;
  };
}

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
  plugins: [organizationClient(), magicLinkClient(), emailOTPClient()],
}) as unknown as AuthClient;

export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const emailOtp = authClient.emailOtp;
