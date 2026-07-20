/**
 * Sign in / sign up — 100% passwordless (email → OTP). Premium, animated.
 * A tenant that allows self sign-up shows a Log in / Sign up switch; otherwise
 * it's sign-in only and a brand-new email is turned away (invite/existing only).
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button, Card, Field, SegmentedControl, Mail, KeyRound, ArrowRight } from "@mossa/ui";
import { api, ApiError } from "../api.js";
import { useSession } from "../session.js";
import { passkeySupported, signInWithPasskey, conditionalPasskeyAvailable } from "../passkey.js";

/** The `/t/<slug>` this login was opened on, if any — carried to the OTP-send
 *  gate so it can brand + scope eligibility to that tenant. */
function pathSlug(): string | null {
  const m = /^\/t\/([^/?#]+)/.exec(location.pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function Login() {
  const { refresh, host } = useSession();
  const tenant = host?.tenant ?? null;
  const brandName = tenant?.name ?? "Mossa";
  const logoUrl = tenant?.branding?.logoUrl ?? null;
  const login = tenant?.branding?.login ?? null;
  const bgImageUrl = login?.bgImageUrl || null;
  const showPasskey = login?.showPasskey !== false;
  const canSignup = tenant?.allowSignup ?? false;

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  const signup = canSignup && mode === "signup";
  const tagline = login?.tagline?.trim() || "No passwords, ever";
  const headline = login?.headline?.trim() || (tenant ? (signup ? "Create your account to get started." : "Welcome back — sign in to continue.") : "Coaching, organized.");
  const subtext = login?.subtext?.trim() || null;

  // Passkey autofill (WebAuthn conditional UI): arm the browser to offer saved
  // passkeys in the email field's autofill. Non-blocking; the modal button
  // stays as the explicit path. Aborted on unmount so it never leaks.
  useEffect(() => {
    const ctl = new AbortController();
    void conditionalPasskeyAvailable().then((ok) => {
      if (!ok || ctl.signal.aborted) return;
      signInWithPasskey({ conditional: true, signal: ctl.signal })
        .then(() => refresh())
        .catch(() => undefined); // user typed instead / dismissed autofill
    });
    return () => ctl.abort();
  }, [refresh]);

  // Cooldown countdown — ticks the "resend in Ns" state down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in", slug: pathSlug(), intent: mode });
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429 && typeof e.body?.retryAfterSec === "number") {
        setCooldown(e.body.retryAfterSec);
        setError(`Please wait a moment before requesting another code.`);
      } else if (e instanceof ApiError && e.body?.error === "invite_only") {
        setError("This studio is invite-only. Ask your coach to add you, then sign in with that email.");
      } else if (e instanceof ApiError && e.body?.error === "studio_full") {
        setError("This studio isn't taking new members right now.");
      } else if (e instanceof ApiError && e.body?.error === "human_check_failed") {
        setError("Couldn't verify you're human — please try again.");
      } else {
        setError(e instanceof Error ? e.message : "Could not send the code");
      }
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
      {/* Optional full-bleed hero image with a legibility scrim, behind the glow. */}
      {bgImageUrl && (
        <>
          <div className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url(${bgImageUrl})` }} />
          <div className="pointer-events-none fixed inset-0 -z-10 bg-background/80 backdrop-blur-sm" />
        </>
      )}
      {/* ambient brand glow */}
      <div className={`pointer-events-none absolute -top-32 left-1/2 size-72 -translate-x-1/2 rounded-full bg-primary/25 blur-[100px] ${bgImageUrl ? "opacity-60" : ""}`} />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative text-center">
        {logoUrl ? (
          <img src={logoUrl} alt={brandName} className="mx-auto mb-5 h-16 w-auto max-w-[70%] object-contain" />
        ) : (
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl bg-primary text-2xl font-black text-primary-foreground shadow-glow">{brandName.charAt(0).toUpperCase()}</div>
        )}
        <h1 className="text-3xl font-bold tracking-tight">{brandName}</h1>
        <p className="mt-2 text-muted-foreground">{headline}</p>
        {subtext && <p className="mt-1 text-sm text-muted-foreground/80">{subtext}</p>}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="relative">
        <Card className="space-y-5 p-6">
          {step === "email" ? (
            <>
              {/* Log in / Sign up switch — only when this studio allows self sign-up. */}
              {canSignup && (
                <SegmentedControl
                  fill
                  options={[{ value: "login", label: "Log in" }, { value: "signup", label: "Sign up" }]}
                  value={mode}
                  onChange={(v) => { setMode(v); setError(null); }}
                />
              )}
              <div className="text-sm font-medium text-primary">{tagline}</div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{signup ? "Create your account" : "Sign in"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">We'll email you a 6-digit code.</p>
              </div>
              <Field label="Email" icon={Mail} type="email" autoComplete="email webauthn" value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && email.includes("@") && cooldown === 0 && void sendCode()} />
              <Button size="lg" className="w-full" disabled={!email.includes("@") || busy || cooldown > 0} onClick={() => void sendCode()}>
                {busy ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : signup ? "Create my account" : "Email me a code"} {!busy && cooldown === 0 && <ArrowRight />}
              </Button>
              {!signup && showPasskey && passkeySupported() && (
                <button
                  className="flex w-full items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={async () => { setError(null); try { await signInWithPasskey(); await refresh(); } catch { setError("No passkey found on this device."); } }}
                >
                  <KeyRound className="size-4" /> Sign in with a passkey
                </button>
              )}
              {tenant && !canSignup && (
                <p className="text-center text-xs text-muted-foreground">New here? This studio is invite-only — ask your coach to add you.</p>
              )}
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-tight">Enter your code</h2>
              <p className="text-sm text-muted-foreground">
                Sent to <span className="font-medium text-foreground">{email}</span>. Expires in 10 min.
              </p>
              <Field ref={otpRef} label="6-digit code" icon={KeyRound} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} className="[&_input]:text-center [&_input]:text-lg [&_input]:tracking-[0.5em]" onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && void verify()} />
              <Button size="lg" className="w-full" disabled={otp.length !== 6 || busy} onClick={() => void verify()}>
                {busy ? "Checking…" : signup ? "Create account" : "Sign in"}
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
