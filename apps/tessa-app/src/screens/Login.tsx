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

import { useEffect, useState } from "react";
import { api, ApiError, RefreshNote, Turnstile } from "@4dl/app-kit";
import { Button, Callout, Field, KeyRound, Mail, Screen } from "@4dl/ui";
import { useT } from "../i18n.js";
import { useSession } from "../session.js";

export function Login() {
  const { refresh, host } = useSession();
  const t = useT();
  const tenant = host?.tenant ?? null;
  const brandName = tenant?.name ?? t("app.name");

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [tsToken, setTsToken] = useState<string | null>(null);

  /**
   * THE BOT CHECK, WHICH USED TO BE CONFIGURABLE HERE AND ENFORCED NOWHERE.
   *
   * `turnstile.secret`, `turnstile.site_key` and `turnstile.hostnames` are on
   * `SHARED_CONFIG_KEYS` — one widget across the whole apex — so an operator who
   * turns the check on from ANY app's console has every reason to believe the
   * platform's sign-in is covered. It was covered in Kova and nowhere else: this
   * screen never rendered the widget, so no token existed, and the check was a
   * security control that read as ON and did nothing.
   *
   * `enabled` means a server SECRET is configured, so the server will demand a
   * token. Both halves are required before the widget is offered — a site key
   * with no secret gates nothing, and a secret with no key is the combination
   * that locks everybody out, which is why the operator panel warns about it.
   */
  const turnstile = host?.turnstile ?? null;
  const needsTurnstile = Boolean(turnstile?.enabled && turnstile.siteKey);

  // The 30-second per-address cooldown the send guard enforces, counted down
  // rather than left as a dead button — the server reflects `retryAfterSec`
  // precisely so this can say when, instead of "that didn't work".
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/email-otp/send-verification-otp", { email: email.trim(), type: "sign-in", turnstileToken: tsToken });
      setStep("otp");
    } catch (e) {
      // A 429 carries how long to wait. Showing the countdown is the difference
      // between a button that looks broken and one that says when.
      if (e instanceof ApiError && e.status === 429 && typeof e.body?.retryAfterSec === "number") {
        setCooldown(e.body.retryAfterSec);
      }
      // The server's own sentence where it has one — a centre that does not take
      // new members says so, and replacing that with "something went wrong"
      // would leave someone retyping a correct address forever.
      setError(e instanceof ApiError ? (e.message || t("login.sendFailed")) : t("login.sendFailed"));
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
      setError(t("login.codeFailed"));
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
            {step === "email" ? t("login.subtitle") : t("login.sent", { email })}
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
              label={t("login.email")}
              type="email"
              icon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email webauthn"
              placeholder="you@clinic.de"
              autoFocus
            />
            {needsTurnstile && turnstile!.siteKey && <Turnstile siteKey={turnstile!.siteKey} onToken={setTsToken} />}
            <Button type="submit" className="w-full" disabled={!canSend}>
              {busy ? t("login.sending") : cooldown > 0 ? t("login.resendIn", { seconds: String(cooldown) }) : t("login.continue")}
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
              label={t("login.code")}
              icon={KeyRound}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={!otp.trim() || busy}>
              {busy ? t("login.checking") : t("login.signIn")}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("email")}>
              {t("login.otherEmail")}
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
