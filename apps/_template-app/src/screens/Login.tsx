/**
 * SIGN IN — passwordless, and ONE screen rather than two.
 *
 * With a one-time code, signing in and signing up are the same act: prove you
 * own the address. There is no login/signup toggle because there is nothing to
 * toggle between. Whether an unknown address is welcomed is a SERVER decision
 * (`otp-guard.ts`'s eligibility rule), not a mode this form picks — and putting
 * it here would be a screen that offers something the server refuses.
 *
 * WHICH tenant this is for comes entirely from the HOSTNAME. No slug is sent,
 * because the OTP-send guard reads the host's tenant — so a code can only ever
 * be issued for the tenant whose address the browser is actually on.
 *
 * The two steps do not navigate. The tenant's name stays put and only the form
 * beneath it swaps, so entering a code reads as continuing rather than as being
 * taken somewhere.
 */

import { useEffect, useState } from "react";
import { api, ApiError, RefreshNote, Turnstile } from "@4dl/app-kit";
import { Button, Callout, Field, KeyRound, Mail, Screen } from "@4dl/ui";
import { useSession } from "../session.js";

export function Login() {
  const { refresh, host } = useSession();
  const tenant = host?.tenant ?? null;
  const brandName = tenant?.name ?? "Template";

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [tsToken, setTsToken] = useState<string | null>(null);

  /**
   * ⚠️ THE BOT CHECK, WHICH WAS ONCE CONFIGURABLE AND ENFORCED NOWHERE.
   *
   * `turnstile.secret`, `turnstile.site_key` and `turnstile.hostnames` are on
   * `SHARED_CONFIG_KEYS` — one widget across the whole apex — so an operator who
   * turns the check on from ANY app's console has every reason to believe the
   * platform's sign-in is covered. It was covered in one app and nowhere else:
   * the other sign-in screens never rendered the widget, so no token existed,
   * and the check was a security control that read as ON and did nothing.
   *
   * `enabled` means a server SECRET is configured, so the server will demand a
   * token. BOTH halves are required before the widget is offered — a site key
   * with no secret gates nothing, and a secret with no key is the combination
   * that locks everybody out, which is why the operator panel warns about it.
   */
  const turnstile = host?.turnstile ?? null;
  const needsTurnstile = Boolean(turnstile?.enabled && turnstile.siteKey);

  /*
    The 30-second per-address cooldown the send guard enforces, counted DOWN
    rather than left as a dead button — the server reflects `retryAfterSec`
    precisely so this can say when, instead of "that didn't work".
  */
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/email-otp/send-verification-otp", { email: email.trim(), type: "sign-in", turnstileToken: tsToken });
      setStep("otp");
    } catch (e) {
      if (e instanceof ApiError && e.status === 429 && typeof e.body?.retryAfterSec === "number") {
        setCooldown(e.body.retryAfterSec);
      }
      /*
        THE SERVER'S OWN SENTENCE WHERE IT HAS ONE. A tenant that does not take
        new members says so ("invite only"), and a deployment with no mail
        provider says THAT — replacing either with "something went wrong" leaves
        somebody retyping a correct address forever, and in the second case
        leaves the operator unable to diagnose their own deploy.
      */
      setError(e instanceof ApiError ? (e.message || "Couldn't send the code.") : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };

  /** Everything the send needs: an address, no request in flight, the cooldown
   *  elapsed, and a token when the platform is demanding one. */
  const canSend = Boolean(email.trim()) && !busy && cooldown === 0 && (!needsTurnstile || Boolean(tsToken));

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/sign-in/email-otp", { email: email.trim(), otp: otp.trim() });
      await refresh();
    } catch {
      setError("That code didn't work. Check it, or ask for a new one.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen center width="narrow">
      <div className="w-full space-y-8 py-12">
        <div className="space-y-2 text-center">
          {/* The anchor is the TENANT, not the form. The first question anybody
              arriving here has is "am I in the right place?". */}
          <h1 className="text-title-1">{brandName}</h1>
          <p className="text-body text-muted-foreground">
            {step === "email" ? "Sign in with a one-time code — no password to remember." : `We sent a code to ${email}.`}
          </p>
        </div>

        {step === "email" ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSend) void send();
            }}
          >
            <Field
              label="Email"
              type="email"
              icon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              /* `webauthn` is what offers a passkey in the autofill dropdown —
                 conditional UI, and the reason a returning user never types a
                 code at all. Dropping it does not break anything visibly. */
              autoComplete="email webauthn"
              placeholder="you@example.com"
              autoFocus
            />
            {needsTurnstile && turnstile!.siteKey && <Turnstile siteKey={turnstile!.siteKey} onToken={setTsToken} />}
            <Button type="submit" className="w-full" disabled={!canSend}>
              {busy ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Continue"}
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
              Use a different address
            </Button>
          </form>
        )}

        {error && <Callout tone="danger" live="alert">{error}</Callout>}

        {/* The escape hatch for a signed-out person stuck behind a stale cached
            shell. It costs one line and is the difference between "reinstall the
            app" and "tap this". */}
        <RefreshNote />
      </div>
    </Screen>
  );
}
