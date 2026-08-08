/**
 * SIGN IN — 100% passwordless, and now built out of the same pieces Kova's is.
 *
 * ── What this replaced, and why it mattered ──────────────────────────────────
 *
 * A hand-rolled card: a `min-h-screen` grid, two blurred gradient blobs, a
 * `rounded-3xl border bg-card/80 shadow-xl backdrop-blur-sm` panel, and its own
 * `<h1 className="text-body-lg">` inside it. None of that is in the design
 * language, so Scena's front door looked like a different product from Kova's
 * front door — which is the one screen where "these are the same platform" has
 * to be true at a glance, because it is the only screen most people ever see
 * twice.
 *
 * It is `Screen` + `TierAnchor` + `Field` + `Button` now, exactly as
 * `apps/app/src/screens/Login.tsx` is. **The anchor is the WORKSPACE, not the
 * form.** Somebody arriving has one question before any other — "am I in the
 * right place?" — and the answer should be the biggest thing on the screen. The
 * two steps are ONE screen: the anchor never moves between them, so entering a
 * code feels like continuing rather than navigating.
 *
 * ── Two populations, and the split is DEVICES vs PEOPLE ──────────────────────
 *
 *   • **People** — owners, operators, front desk, viewers, platform admins —
 *     sign in with an **email code**. There is no password.
 *   • **Stations** — the shared tablet at a counter, the referee's phone, the
 *     door screen — sign in with the **handle + code** an owner provisioned on
 *     the Live Boards screen. They have no inbox and the device is shared, so a
 *     one-time code emailed to nobody is not a control, it is a locked door.
 *
 * The station lane builds its own address (`<handle>@bd.scena`) rather than
 * asking the server to resolve one, because asking meant a public endpoint that
 * would confirm whether any given handle existed on the platform.
 *
 * ── There is no "create a workspace" here any more ───────────────────────────
 *
 * ⚠️ This screen used to carry a THIRD lane that collected a workspace name,
 * verified a code and created the organization — and it was offered on every
 * host, so a person who followed a colleague's link to `acme.scena.4dl.app` was
 * invited, on Acme's own branded sign-in, to start a SECOND workspace instead of
 * joining the one they were sent to.
 *
 * It is gone, and not merely moved: it skipped the plan step entirely, so every
 * workspace it made landed on the `free` parking row that `statusOf` now gates
 * read-only. Creating a workspace is `Onboarding.tsx`'s three-step wizard, on
 * the setup door, after this screen. `canCreate` is what this file keeps of the
 * distinction, and it now changes only the COPY — signing in and signing up are
 * the same act with a one-time code, so there is nothing else to switch.
 */

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Button,
  Callout,
  Field,
  KeyRound,
  Mail,
  MonitorSmartphone,
  Screen,
  TierAnchor,
  TierContent,
  brandMark,
  hasWordmark,
} from "@4dl/ui";
import { Turnstile } from "@4dl/app-kit";
import { ScenaMascot } from "../brand.js";
import { authClient, signIn } from "../auth-client.js";
import { API_BASE, apiFetch } from "../api.js";

/**
 * What `otpSendGuard` refuses with, in words a person can act on.
 *
 * The server answers a machine-readable `error` on purpose — the bodies are
 * deliberately NEUTRAL, so "invite only" never says whether the address is
 * known — and turning that into a sentence is the client's job.
 */
const SEND_ERRORS: Record<string, string> = {
  invite_only: "This workspace is invite-only. Ask an owner to send you an invitation.",
  wrong_door: "Sign in at your workspace's own address.",
  human_check_failed: "The bot check didn't pass. Try again.",
  cooldown: "Give it a moment before asking for another code.",
  too_many_requests: "Too many codes requested from here. Try again later.",
  email_not_configured: "This deployment can't send email yet, so no code went out.",
};
import { useTheme } from "../theme.js";
import { LegalDialog, LegalLinks, type LegalDoc } from "../legal/content.js";
import type { HostInfo } from "../host.js";

/** The non-routable suffix every station account carries. Mirrors
 *  `STATION_DOMAIN` in the worker's `auth.ts`; they must not drift. */
const STATION_DOMAIN = "@bd.scena";

/**
 * The sign-in surface.
 *
 * `canCreate` comes from the DOOR (`host.role === "setup"`) and is the only
 * thing that differs between the setup door and a workspace's own address:
 *
 *   root        a signpost, not a login — the server refuses to send a code
 *               here, and its one action points at setup.
 *   setup       "Create your workspace." The same email field; the wizard
 *               after it does the naming and the plan.
 *   <slug>      "Sign in to <workspace>." No create lane at all.
 *   admin       the operator console. Never a signup surface.
 */
export function LoginScreen({
  onDone,
  host,
  canCreate = false,
}: {
  onDone: () => void;
  host: HostInfo | null;
  canCreate?: boolean;
}) {
  const [station, setStation] = useState(false);
  const [doc, setDoc] = useState<LegalDoc | null>(null);

  const tenant = host?.tenant ?? null;
  const { mode } = useTheme();
  const brandName = tenant?.name ?? "Scena";
  const logoUrl = brandMark(tenant?.branding, mode, "logo");
  /*
    A wordmark already contains the workspace's name, so writing it underneath
    prints the name twice. When there is one the heading goes visually hidden
    rather than away: it is this page's `h1` and the only thing that gives the
    screen a name in the document outline. The image then carries an empty alt,
    so the name is announced once, by the heading.
  */
  const wordmark = Boolean(logoUrl) && hasWordmark(tenant?.branding, mode);

  return (
    <Screen center width="narrow">
      {/* T1 — whose door this is. */}
      <TierAnchor className="flex flex-col items-center gap-3 pb-8 text-center">
        {logoUrl ? (
          <img src={logoUrl} alt={wordmark ? "" : brandName} className="h-14 w-auto max-w-[70%] object-contain" />
        ) : (
          <ScenaMascot mood="idle" size={72} />
        )}
        <h1 className={wordmark ? "sr-only" : "text-title-1"}>{brandName}</h1>
        <p className="text-body text-muted-foreground">
          {station
            ? "Sign in this station"
            : canCreate
              ? "Create your workspace"
              : tenant
                ? "Sign in to continue"
                : "Digital signage & live boards"}
        </p>
      </TierAnchor>

      {station ? (
        <StationSignIn onDone={onDone} onBack={() => setStation(false)} />
      ) : (
        <EmailSignIn onDone={onDone} onStation={() => setStation(true)} canCreate={canCreate} turnstile={host?.turnstile ?? null} />
      )}

      <TierContent className="space-y-1 pt-8 text-center">
        <p className="text-caption leading-relaxed text-muted-foreground">
          By continuing, you agree to our <LegalLinks onOpen={setDoc} />.
        </p>
        <p className="text-caption text-muted-foreground/60">© 2026 Four Degree Labs · Scena</p>
      </TierContent>

      <LegalDialog doc={doc} onClose={() => setDoc(null)} />
    </Screen>
  );
}

/**
 * The STATION lane: the handle and code from the Live Boards screen.
 *
 * The refusal is deliberately one sentence for both halves. "No such station"
 * and "wrong code" are two different answers to somebody guessing.
 */
function StationSignIn({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const email = `${handle.trim().toLowerCase()}${STATION_DOMAIN}`;
      const res = await signIn.email({ email, password: code });
      if (res.error) throw new Error("That handle and code don't match.");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = Boolean(handle.trim() && code) && !busy;

  return (
    <div className="space-y-3">
      <Field
        label="Handle"
        icon={MonitorSmartphone}
        value={handle}
        placeholder="k7m2xp"
        autoCapitalize="none"
        autoComplete="username"
        autoFocus
        className="[&_input]:font-mono"
        onChange={(e) => setHandle(e.target.value)}
        hint="From the Live Boards screen. Ask an owner to regenerate one if you've lost it."
      />
      <Field
        label="Code"
        icon={KeyRound}
        type="password"
        value={code}
        placeholder="••••••"
        autoComplete="current-password"
        className="[&_input]:font-mono"
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && canSubmit && void submit()}
      />
      {err && <Callout tone="danger" live="alert">{err}</Callout>}
      <Button size="lg" className="w-full" disabled={!canSubmit} onClick={() => void submit()}>
        {busy ? "Signing in…" : "Sign in"}
        {!busy && <ArrowRight aria-hidden />}
      </Button>
      <button
        className="min-h-12 w-full text-caption text-muted-foreground transition-colors hover:text-foreground"
        onClick={onBack}
      >
        I&rsquo;m a person, not a station
      </button>
    </div>
  );
}

/**
 * The default: email → 6-digit code. Everyone who is a person signs in here.
 *
 * One "Continue", no login/signup mode: with a one-time code, signing in and
 * signing up are the same act (prove you own the email). What differs by door is
 * only what happens AFTER — the setup door hands you the wizard, a workspace
 * address hands you the workspace.
 */
function EmailSignIn({
  onDone,
  onStation,
  canCreate,
  turnstile,
}: {
  onDone: () => void;
  onStation: () => void;
  canCreate: boolean;
  turnstile: { siteKey: string | null; enabled: boolean } | null;
}) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [tsToken, setTsToken] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  /**
   * THE BOT CHECK, WHICH USED TO BE CONFIGURABLE HERE AND ENFORCED NOWHERE.
   *
   * `turnstile.secret`, `turnstile.site_key` and `turnstile.hostnames` are on
   * `SHARED_CONFIG_KEYS` — one widget across the whole apex — so an operator who
   * switches the check on from ANY app's console has every reason to think the
   * platform's sign-in is covered. It was covered in Kova and nowhere else: this
   * screen never rendered a widget, so no token existed and the control read as
   * ON while doing nothing.
   *
   * `enabled` means a server SECRET is set, so the server will demand a token.
   * Both halves are required before the widget is offered — a site key with no
   * secret gates nothing, and a secret with no key is the combination that locks
   * everybody out, which is why the operator panel warns about it.
   */
  const needsTurnstile = Boolean(turnstile?.enabled && turnstile.siteKey);

  // Focus the code field the moment it appears — the alternative is a screen
  // that has just asked for six digits and put the caret nowhere.
  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
  }, [step]);

  // The send guard's 30-second per-address cooldown, counted down rather than
  // left as a dead button. The server reflects `retryAfterSec` precisely so this
  // can say WHEN instead of "that didn't work".
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    setBusy(true);
    setErr(null);
    try {
      /*
        POSTED DIRECTLY RATHER THAN THROUGH THE BETTER AUTH CLIENT.

        The client sends `{ email, type }` and nothing else, and `otpSendGuard`
        needs `turnstileToken` in the body. This is our own endpoint answering
        our own guard — the response carries no session, so the client bought
        nothing here anyway — and `apiFetch` is the SPA's one door to the API,
        which `scripts/scena-fetch-chokepoint.test.mjs` requires.
      */
      const res = await apiFetch(`${API_BASE}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), type: "sign-in", turnstileToken: tsToken }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; retryAfterSec?: number };
        // A 429 carries how long to wait; showing it is the difference between a
        // button that looks broken and one that says when.
        if (res.status === 429 && typeof body.retryAfterSec === "number") setCooldown(body.retryAfterSec);
        throw new Error(body.detail || SEND_ERRORS[body.error ?? ""] || "Could not send code");
      }
      setStep("otp");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await authClient.signIn.emailOtp({ email: email.trim(), otp: otp.trim() });
      if (res.error) throw new Error(res.error.message || "Invalid or expired code");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  const canSend = email.includes("@") && !busy && cooldown === 0 && (!needsTurnstile || Boolean(tsToken));

  return (
    <div className="space-y-3">
      {step === "email" ? (
        <>
          <Field
            label="Email"
            icon={Mail}
            type="email"
            value={email}
            placeholder="you@company.com"
            autoComplete="email"
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSend && void sendCode()}
            hint={
              canCreate
                ? "We'll email you a 6-digit code, then you'll name your workspace."
                : "New or returning — we'll email you a 6-digit code."
            }
          />
          {needsTurnstile && turnstile!.siteKey && <Turnstile siteKey={turnstile!.siteKey} onToken={setTsToken} />}
          {err && <Callout tone="danger" live="alert">{err}</Callout>}
          <Button size="lg" className="w-full" disabled={!canSend} onClick={() => void sendCode()}>
            {busy ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Email me a code"}
            {!busy && cooldown === 0 && <ArrowRight aria-hidden />}
          </Button>
          <button
            className="flex min-h-12 w-full items-center justify-center gap-2 text-caption text-muted-foreground transition-colors hover:text-foreground"
            onClick={onStation}
          >
            <MonitorSmartphone className="size-3.5" aria-hidden /> Sign in a station instead
          </button>
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
          {err && <Callout tone="danger" live="alert">{err}</Callout>}
          <Button size="lg" className="w-full" disabled={otp.length !== 6 || busy} onClick={() => void verify()}>
            {busy ? "Checking…" : "Continue"}
          </Button>
          <div className="flex items-center justify-between text-caption text-muted-foreground">
            <button className="min-h-12 transition-colors hover:text-foreground" onClick={() => { setStep("email"); setOtp(""); setErr(null); }}>
              Use a different email
            </button>
            <button className="min-h-12 transition-colors hover:text-foreground disabled:opacity-60" disabled={busy} onClick={() => void sendCode()}>
              Resend code
            </button>
          </div>
        </>
      )}
    </div>
  );
}
