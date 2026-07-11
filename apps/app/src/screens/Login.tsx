/**
 * Sign in — 100% passwordless (email → OTP). Premium, animated, icon-based.
 */

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Button, Card, Field, Mail, KeyRound, ArrowRight, Sparkles } from "@mossa/ui";
import { api } from "../api.js";
import { useSession } from "../session.js";

export function Login() {
  const { refresh } = useSession();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" });
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 100);
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
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 overflow-hidden px-6">
      {/* ambient brand glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 size-72 -translate-x-1/2 rounded-full bg-primary/25 blur-[100px]" />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl bg-primary text-2xl font-black text-primary-foreground shadow-glow">M</div>
        <h1 className="text-3xl font-bold tracking-tight">Mossa</h1>
        <p className="mt-2 text-muted-foreground">Coaching, organized.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="relative">
        <Card className="space-y-5 p-6">
          {step === "email" ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="size-4" /> No passwords, ever
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
                <p className="mt-1 text-sm text-muted-foreground">We'll email you a 6-digit code.</p>
              </div>
              <Field label="Email" icon={Mail} type="email" autoComplete="email" value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && email.includes("@") && void sendCode()} />
              <Button size="lg" className="w-full" disabled={!email.includes("@") || busy} onClick={() => void sendCode()}>
                {busy ? "Sending…" : "Email me a code"} {!busy && <ArrowRight />}
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-tight">Enter your code</h2>
              <p className="text-sm text-muted-foreground">
                Sent to <span className="font-medium text-foreground">{email}</span>. Expires in 10 min.
              </p>
              <Field ref={otpRef} label="6-digit code" icon={KeyRound} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} className="[&_input]:text-center [&_input]:text-lg [&_input]:tracking-[0.5em]" onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && void verify()} />
              <Button size="lg" className="w-full" disabled={otp.length !== 6 || busy} onClick={() => void verify()}>
                {busy ? "Checking…" : "Sign in"}
              </Button>
              <button className="w-full text-sm text-muted-foreground transition-colors hover:text-foreground" onClick={() => (setStep("email"), setOtp(""))}>
                Use a different email
              </button>
            </>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </Card>
      </motion.div>
    </div>
  );
}
