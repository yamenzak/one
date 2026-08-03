/**
 * AcceptInvite — the staff invitation deep-link target (SPEC §4). The branded
 * invite email links here as /accept-invitation/:invitationId. Because the
 * invitee usually isn't signed in yet, this screen renders BEFORE the normal
 * session gate (wired in main.tsx by path) and drives the full flow:
 *
 *   not signed in  → email → 6-digit OTP → verify (same passwordless act as
 *                    Login); on sign-in /api/context auto-accepts every pending
 *                    invite addressed to that email (the belt-and-suspenders
 *                    server path), so the membership is minted automatically.
 *   signed in      → also POST accept-invitation for this specific id (covers a
 *                    seat that just freed up), then continue into the studio.
 *
 * On success we hard-navigate to "/" so the app re-boots with the new persona.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "motion/react";
import { Button, Card, Field, Mail, KeyRound, ArrowRight, Check, Spinner, DUR, brandMark } from "@4dl/ui";
import { api, ApiError } from "../api.js";
import { useSession } from "../session.js";
import { useTheme } from "../theme.js";
import { Turnstile } from "../Turnstile.js";

export function AcceptInvite() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const { ctx, loading, refresh, host } = useSession();
  const tenant = host?.tenant ?? null;
  const brandName = tenant?.name ?? "the studio";
  const { mode } = useTheme();
  const logoUrl = brandMark(tenant?.branding, mode, "logo");
  const turnstile = host?.turnstile ?? null;
  const needsTurnstile = Boolean(turnstile?.enabled && turnstile.siteKey);

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);
  // Guard so the signed-in accept runs once per mounted session, not every render.
  const acceptedFor = useRef<string | null>(null);

  // Cooldown countdown — ticks the "resend in Ns" state down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Once a session exists (either the invitee was already signed in, or they
  // just verified their OTP), claim this specific invitation and continue. The
  // server also auto-accepts on /api/context, so an "already a member" / expired
  // error here is non-fatal — we still re-boot into whatever memberships exist.
  useEffect(() => {
    if (loading || !ctx || !invitationId || acceptedFor.current === invitationId) return;
    acceptedFor.current = invitationId;
    setAccepting(true);
    void api
      .post("/api/auth/organization/accept-invitation", { invitationId })
      .catch(() => undefined)
      .then(() => refresh())
      .catch(() => undefined)
      .finally(() => {
        setAccepting(false);
        setDone(true);
      });
  }, [loading, ctx, invitationId, refresh]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in", slug: tenant?.slug ?? null, turnstileToken: tsToken });
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429 && typeof e.body?.retryAfterSec === "number") {
        setCooldown(e.body.retryAfterSec);
        setError("Please wait a moment before requesting another code.");
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
      // Session now exists → the accept effect runs and re-boots the app.
      await refresh();
    } catch {
      setError("That code didn't work. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!invitationId) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-muted-foreground">
        This invitation link is invalid or incomplete.
      </div>
    );
  }

  // A session exists — accepting, or accepted and ready to enter the studio.
  if (ctx) {
    return (
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6">
        <div className="pointer-events-none absolute -top-32 left-1/2 size-72 -translate-x-1/2 rounded-full bg-primary/25 blur-[100px]" />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.slow }} className="relative">
          <Card className="space-y-5 p-6 text-center">
            {accepting || !done ? (
              <>
                <Spinner className="mx-auto" />
                <p className="text-sm text-muted-foreground">Setting up your access…</p>
              </>
            ) : (
              <>
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success [&_svg]:size-7"><Check /></div>
                <div>
                  <h2 className="text-title-3">You're in</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Your invitation to {brandName} is accepted.</p>
                </div>
                <Button size="lg" className="w-full" onClick={() => window.location.assign("/")}>
                  Go to {brandName} <ArrowRight />
                </Button>
              </>
            )}
          </Card>
        </motion.div>
      </div>
    );
  }

  // No session yet — sign in with the email the invitation was sent to.
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 overflow-hidden px-6">
      <div className="pointer-events-none absolute -top-32 left-1/2 size-72 -translate-x-1/2 rounded-full bg-primary/25 blur-[100px]" />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.slow }} className="relative text-center">
        {logoUrl ? (
          <img src={logoUrl} alt={brandName} className="mx-auto mb-5 h-16 w-auto max-w-[70%] object-contain" />
        ) : (
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl bg-primary text-2xl font-black text-primary-foreground shadow-glow">{brandName.charAt(0).toUpperCase()}</div>
        )}
        <h1 className="text-3xl font-bold tracking-tight">You're invited</h1>
        <p className="mt-2 text-muted-foreground">Join the {brandName} team — sign in with the email your invite was sent to.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.slow, delay: 0.1 }} className="relative">
        <Card className="space-y-5 p-6">
          {step === "email" ? (
            <>
              <div>
                <h2 className="text-title-3">Continue with email</h2>
                <p className="mt-1 text-sm text-muted-foreground">We'll email you a 6-digit code — no password to create.</p>
              </div>
              <Field label="Email" icon={Mail} type="email" autoComplete="email" value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && email.includes("@") && cooldown === 0 && (!needsTurnstile || tsToken) && void sendCode()} />
              {needsTurnstile && turnstile!.siteKey && <Turnstile siteKey={turnstile!.siteKey} onToken={setTsToken} />}
              <Button size="lg" className="w-full" disabled={!email.includes("@") || busy || cooldown > 0 || (needsTurnstile && !tsToken)} onClick={() => void sendCode()}>
                {busy ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Continue with email"} {!busy && cooldown === 0 && <ArrowRight />}
              </Button>
              <p className="text-center text-xs text-muted-foreground">Use the same email address that received the invitation.</p>
            </>
          ) : (
            <>
              <h2 className="text-title-3">Enter your code</h2>
              <p className="text-sm text-muted-foreground">
                Sent to <span className="font-medium text-foreground">{email}</span>. Expires in 10 min.
              </p>
              <Field ref={otpRef} label="6-digit code" icon={KeyRound} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} className="[&_input]:text-center [&_input]:text-lg [&_input]:tracking-[0.5em]" onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && void verify()} />
              <Button size="lg" className="w-full" disabled={otp.length !== 6 || busy} onClick={() => void verify()}>
                {busy ? "Checking…" : "Accept invitation"}
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
