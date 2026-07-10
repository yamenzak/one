/**
 * Sign in (SPEC §4): email → 6-digit OTP → in. 100% passwordless.
 * Passkey one-tap lands with the passkey-client phase; OTP is the bootstrap.
 */

import { useState } from "react";
import { Button, Card, Field } from "@mossa/ui";
import { api } from "../api.js";
import { useSession } from "../session.js";

export function Login() {
  const { refresh } = useSession();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" });
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/sign-in/email-otp", { email, otp });
      await refresh();
    } catch {
      setError("That code didn't work. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6">
      <div className="text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-[38%] bg-activity-container text-3xl font-black text-activity">
          M
        </div>
        <h1 className="text-3xl font-bold">Mossa</h1>
        <p className="mt-2 text-fg-muted">Coaching, organized.</p>
      </div>

      <Card className="space-y-4 p-6">
        {step === "email" ? (
          <>
            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="text-sm text-fg-muted">
              No passwords here — we'll email you a 6-digit code.
            </p>
            <Field
              label="Email"
              icon="✉️"
              type="email"
              autoComplete="email"
              value={email}
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email.includes("@") && void sendCode()}
            />
            <Button size="lg" className="w-full" disabled={!email.includes("@") || busy} onClick={() => void sendCode()}>
              {busy ? "Sending…" : "Email me a code"}
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold">Enter your code</h2>
            <p className="text-sm text-fg-muted">
              Sent to <span className="text-fg">{email}</span>. It expires in 10 minutes.
            </p>
            <Field
              label="6-digit code"
              icon="🔑"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && void verify()}
            />
            <Button size="lg" className="w-full" disabled={otp.length !== 6 || busy} onClick={() => void verify()}>
              {busy ? "Checking…" : "Sign in"}
            </Button>
            <button className="w-full text-sm text-fg-muted hover:text-fg" onClick={() => setStep("email")}>
              Use a different email
            </button>
          </>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
      </Card>
    </div>
  );
}
