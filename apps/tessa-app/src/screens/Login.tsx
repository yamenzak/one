/**
 * SIGN IN — passwordless, and one screen rather than two.
 *
 * With OTP, signing in and signing up are the same act: prove you own the
 * address. There is no login/signup toggle because there is nothing to toggle
 * between. Whether an unknown address is welcomed is a server decision the host
 * already knows about, not a mode this form picks.
 *
 * WHICH workspace this is for comes entirely from the HOSTNAME. No slug is sent,
 * because the OTP-send gate reads the host's tenant — so a code can only ever be
 * issued for the centre whose address the browser is actually on.
 *
 * The two steps do not navigate. The centre's name stays put and only the form
 * beneath it swaps, so entering a code reads as continuing rather than as being
 * taken somewhere.
 */

import { useState } from "react";
import { api, ApiError, RefreshNote } from "@4dl/app-kit";
import { Button, Callout, Field, KeyRound, Mail, Screen } from "@4dl/ui";
import { useSession } from "../session.js";

export function Login() {
  const { refresh, host } = useSession();
  const tenant = host?.tenant ?? null;
  const brandName = tenant?.name ?? "Tessa";

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/email-otp/send-verification-otp", { email: email.trim(), type: "sign-in" });
      setStep("otp");
    } catch (e) {
      // The server's own sentence where it has one — a centre that does not take
      // new members says so, and replacing that with "something went wrong"
      // would leave someone retyping a correct address forever.
      setError(e instanceof ApiError ? (e.message || "Couldn't send a code.") : "Couldn't send a code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/sign-in/email-otp", { email: email.trim(), otp: otp.trim() });
      await refresh();
    } catch {
      setError("That code didn't work. Check it, or send a new one.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen center width="narrow">
      <div className="w-full space-y-8 py-12">
        <div className="space-y-2 text-center">
          {/* The anchor is the CENTRE, not the form. The first question anyone
              arriving here has is "am I in the right place?". */}
          <h1 className="text-title-1">{brandName}</h1>
          <p className="text-body text-muted-foreground">
            {step === "email" ? "Sign in with your work email." : `We sent a code to ${email}.`}
          </p>
        </div>

        {step === "email" ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) void send();
            }}
          >
            <Field
              label="Email"
              type="email"
              icon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email webauthn"
              placeholder="you@clinic.de"
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={!email.trim() || busy}>
              {busy ? "Sending…" : "Continue"}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (otp.trim()) void verify();
            }}
          >
            <Field
              label="Code"
              icon={KeyRound}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={!otp.trim() || busy}>
              {busy ? "Checking…" : "Sign in"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("email")}>
              Use a different email
            </Button>
          </form>
        )}

        {error && <Callout tone="danger" live="alert">{error}</Callout>}

        {/* The escape hatch for a signed-out person stuck behind a stale cached
            shell. It costs one line and is the difference between "reinstall
            the app" and "tap this". */}
        <RefreshNote />
      </div>
    </Screen>
  );
}
