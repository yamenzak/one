/**
 * Sign in — 100% passwordless (email → OTP).
 *
 * With OTP, signing in and signing up are the same act (prove you own the
 * email), so there's one "Continue" — no login/signup mode. The real gate lives
 * server-side: a studio that doesn't allow self sign-up turns a brand-new email
 * away (invite/existing only); here we just note that.
 *
 * Which studio this is for is decided entirely by the HOSTNAME. There is no slug
 * to send any more — the OTP-send gate reads the host tenant, so a code can only
 * ever be issued for the studio whose address the browser is actually on.
 *
 * ── Design notes (UI-LANGUAGE) ──────────────────────────────────────────────
 *
 * The anchor is the STUDIO, not the form. Someone arriving here has one question
 * before any other — "am I in the right place?" — and the old screen answered it
 * with a 16px logo above a card that shouted "Continue with email". Now the
 * studio's name is the largest thing on the screen and the form is a quiet group
 * beneath it, which is both the correct hierarchy and the correct reassurance.
 *
 * The two steps are one screen, not two: the anchor never moves between them, so
 * entering a code feels like continuing rather than navigating. Only the group
 * swaps, and it swaps by settling (§8) rather than sliding.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  ArrowRight,
  Button,
  Callout,
  DUR,
  EASE_OUT,
  Field,
  KeyRound,
  Mail,
  Screen,
  TierAnchor,
  TierContent,
  motion,
  brandMark,
} from "@4dl/ui";
import { RefreshNote, useTheme } from "@4dl/app-kit";
import { api, ApiError } from "../api.js";
import { useSession } from "../session.js";
import { passkeySupported, signInWithPasskey, conditionalPasskeyAvailable } from "../passkey.js";
import { Turnstile } from "../Turnstile.js";

export function Login() {
  const { refresh, host } = useSession();
  const tenant = host?.tenant ?? null;
  const brandName = tenant?.name ?? "Kova";
  const { mode } = useTheme();
  const logoUrl = brandMark(tenant?.branding, mode, "logo");
  const login = tenant?.branding?.login ?? null;
  const bgImageUrl = login?.bgImageUrl || null;
  const showPasskey = login?.showPasskey !== false;
  // Whether this studio takes new members. Not a mode switch — with passwordless,
  // signing in and signing up are the same action (prove you own the email); it
  // only decides whether an unknown email is welcomed or turned away.
  const canSignup = tenant?.allowSignup ?? false;

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [tsToken, setTsToken] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  const turnstile = host?.turnstile ?? null;
  const needsTurnstile = Boolean(turnstile?.enabled && turnstile.siteKey);

  const tagline = login?.tagline?.trim() || null;
  const headline = login?.headline?.trim() || (tenant ? "Sign in to continue" : "Coaching, organised");
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
      await api.post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in", turnstileToken: tsToken });
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
      } else if (e instanceof ApiError && e.body?.error === "email_not_configured") {
        // Never advance to the code screen here: the server has told us it cannot
        // deliver, so a code is definitely not coming. Say so plainly rather than
        // leaving someone waiting on a message that will never arrive.
        setError("Sign-in email isn't set up for this studio yet, so we couldn't send your code. Please contact support — this needs fixing on our side, not yours.");
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

  const canSend = email.includes("@") && !busy && cooldown === 0 && (!needsTurnstile || Boolean(tsToken));

  return (
    <Screen center width="narrow">
      {/* Optional full-bleed hero image with a legibility scrim. Sits under the
          atmosphere, which keeps the studio's brand colour present even when a
          photograph is doing the talking. */}
      {bgImageUrl && (
        <>
          <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: `url(${bgImageUrl})` }} />
          <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 bg-background/80 backdrop-blur-sm" />
        </>
      )}

      {/* T1 — the studio. The first question anyone has here is "am I in the
          right place", and the answer should be the biggest thing on screen. */}
      <TierAnchor className="flex flex-col items-center gap-3 pb-8 text-center">
        {logoUrl ? (
          <img src={logoUrl} alt={brandName} className="h-14 w-auto max-w-[70%] object-contain" />
        ) : (
          <span aria-hidden className="grid size-14 place-items-center rounded-xl bg-primary text-title-2 font-black text-primary-foreground shadow-glow">
            {brandName.charAt(0).toUpperCase()}
          </span>
        )}
        <h1 className="text-title-1">{brandName}</h1>
        {(headline || tagline) && <p className="text-body text-muted-foreground">{headline ?? tagline}</p>}
        {subtext && <p className="text-caption text-muted-foreground/80">{subtext}</p>}
      </TierAnchor>

      {/* T3 — the form. One group, one primary action, everything else quiet.
          `mode="wait"` so the two steps never overlap: a code field appearing
          on top of an email field is the one transition here that reads as a
          glitch rather than a change. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.99 }}
          transition={{ duration: DUR.base, ease: EASE_OUT }}
          className="space-y-3"
        >
          {step === "email" ? (
            <>
              <Field
                label="Email"
                icon={Mail}
                type="email"
                autoComplete="email webauthn"
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canSend && void sendCode()}
                hint={canSignup ? "New or returning — we'll email you a 6-digit code." : "We'll email you a 6-digit code."}
              />
              {needsTurnstile && turnstile!.siteKey && <Turnstile siteKey={turnstile!.siteKey} onToken={setTsToken} />}
              <Button size="lg" className="w-full" disabled={!canSend} onClick={() => void sendCode()}>
                {busy ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Email me a code"}
                {!busy && cooldown === 0 && <ArrowRight aria-hidden />}
              </Button>
            </>
          ) : (
            <>
              <Field
                ref={otpRef}
                label="Your code"
                icon={KeyRound}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                className="[&_input]:text-center [&_input]:text-title-3 [&_input]:tracking-[0.5em]"
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && void verify()}
                hint={`Sent to ${email}. It expires in 10 minutes.`}
              />
              <Button size="lg" className="w-full" disabled={otp.length !== 6 || busy} onClick={() => void verify()}>
                {busy ? "Checking…" : "Continue"}
              </Button>
              <button
                className="min-h-12 w-full text-caption text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => (setStep("email"), setOtp(""), setError(null))}
              >
                Use a different email
              </button>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {error && (
        <TierContent className="pt-3">
          <Callout tone="danger" live="alert">{error}</Callout>
        </TierContent>
      )}

      {step === "email" && showPasskey && passkeySupported() && (
        <TierContent className="pt-2">
          <button
            className="flex min-h-12 w-full items-center justify-center gap-2 text-caption font-medium text-muted-foreground transition-colors hover:text-foreground"
            // A passkey is bound to the DOMAIN it was created on (WebAuthn
            // rpID = this origin), not to your account or your studio. So
            // "no passkey on this device" is wrong and misleading on a
            // studio's custom domain: you may well have one, just registered
            // at a different address. Say what is actually true, and point at
            // the way in that always works.
            onClick={async () => {
              setError(null);
              try {
                await signInWithPasskey();
                await refresh();
              } catch {
                setError(`No passkey saved for ${location.hostname}. Passkeys are tied to the address you set them up on — sign in with an email code, then add one here.`);
              }
            }}
          >
            <KeyRound aria-hidden className="size-4" /> Use a passkey instead
          </button>
        </TierContent>
      )}

      {step === "email" && tenant && !canSignup && (
        <TierContent>
          <p className="pt-1 text-center text-caption text-muted-foreground">
            New here? This studio is invite-only — ask your coach to add you.
          </p>
        </TierContent>
      )}

      {/* The last resort, and the reason it is on the LOGIN specifically: this is
          the screen a signed-out visitor sits on, and until now the only route to
          `hardRefresh` was the avatar menu inside the shell — which needs a
          session. Someone held on a stale bundle could not reach the one control
          that would free them. Only on step one: mid-code is not the moment to
          offer someone a reload that discards the code they are typing. */}
      {step === "email" && <RefreshNote className="pt-6" />}
    </Screen>
  );
}
