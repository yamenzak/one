/**
 * Auth screens shown before the operator Shell (§auth). Two populations:
 *
 *   • **Owners + platform admins** sign in with an **email code (OTP)** — never a
 *     password. Provisioning a workspace is the same OTP flow + naming the org.
 *   • **Everyone else** — staff (operator/receptionist/viewer) and board-scoped
 *     users (desks, referees, door tablets) — sign in with **username + password**
 *     only, no email. Globally-unique usernames mean there's no workspace to type.
 *
 * So the default view is username + password (the everyday staff login) with a
 * secondary **"Log in with email"** OTP path for owners/admins, and **Create a
 * workspace** (also OTP) for a brand-new owner.
 */
import { useState } from "react";
import { Loader2, Mail, ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { ScenaMascot } from "@scena/ui";
import { authClient, signIn, emailOtp } from "../auth-client.js";
import { resolveUsername } from "../api.js";
import { LegalDialog, LegalLinks, type LegalDoc } from "../legal/content.js";

function Shell({ children }: { children: React.ReactNode }) {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  return (
    <div className="relative min-h-screen overflow-hidden bg-muted/30">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12%] size-[38rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]" />
        <div className="absolute -bottom-24 -right-16 size-[26rem] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/0 to-background/40" />
      </div>
      <div className="grid min-h-screen place-items-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          <div className="mb-7 flex flex-col items-center gap-2">
            <ScenaMascot mood="idle" size={92} />
            <div className="text-2xl font-extrabold tracking-tight">Scena</div>
          </div>
          <div className="rounded-3xl border bg-card/80 p-8 shadow-xl shadow-primary/5 backdrop-blur-sm">{children}</div>
          <p className="mt-6 text-center text-xs text-muted-foreground">Digital signage & live boards, beautifully simple.</p>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            By continuing, you agree to our <LegalLinks onOpen={setDoc} />.
          </p>
          <p className="mt-1 text-center text-[11px] text-muted-foreground/60">© 2026 Four Degree Labs · Scena</p>
        </div>
      </div>
      <LegalDialog doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

function ErrLine({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{children}</div>;
}

type View = "password" | "email" | "create";

export function LoginScreen({ onDone }: { onDone: () => void }) {
  const [view, setView] = useState<View>("password");
  return (
    <Shell>
      {view === "create" ? (
        <CreateWorkspace onDone={onDone} onBack={() => setView("password")} />
      ) : view === "email" ? (
        <EmailSignIn onDone={onDone} onBack={() => setView("password")} />
      ) : (
        <PasswordSignIn onDone={onDone} onEmail={() => setView("email")} onCreate={() => setView("create")} />
      )}
    </Shell>
  );
}

/** Default: username + password. Resolves the global username → login email, then
 *  signs in through the normal email+password provider. */
function PasswordSignIn({ onDone, onEmail, onCreate }: { onDone: () => void; onEmail: () => void; onCreate: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const email = await resolveUsername(username.trim());
      if (!email) throw new Error("Wrong username or password.");
      const res = await signIn.email({ email, password });
      if (res.error) throw new Error("Wrong username or password.");
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1 className="text-lg font-semibold">Sign in to Scena</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Enter your username and password.</p>
      <div className="mb-3">
        <Label htmlFor="uname">Username</Label>
        <Input id="uname" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="frontdesk" autoCapitalize="none" autoComplete="username" autoFocus required className="mt-1.5" />
      </div>
      <div className="mb-1">
        <Label htmlFor="pass">Password</Label>
        <Input id="pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required className="mt-1.5" />
      </div>
      {err && <ErrLine>{err}</ErrLine>}
      <Button type="submit" disabled={busy || !username.trim() || !password} className="mt-4 w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
      </Button>
      <button type="button" onClick={onEmail} className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <Mail className="size-3.5" /> Log in with email instead
      </button>
      <div className="mt-5 border-t pt-4 text-center text-sm text-muted-foreground">
        New to Scena?{" "}
        <button type="button" onClick={onCreate} className="font-medium text-primary hover:underline">Create a workspace</button>
      </div>
    </form>
  );
}

/** Secondary: email → 6-digit OTP (owner passwordless + recovery). */
function EmailSignIn({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim()) return setErr("Enter your email first");
    setBusy(true);
    setErr(null);
    try {
      const res = await emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
      if (res.error) throw new Error(res.error.message || "Could not send code");
      setStep("otp");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await signIn.emailOtp({ email: email.trim(), otp: otp.trim() });
      if (res.error) throw new Error(res.error.message || "Invalid or expired code");
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  if (step === "otp") {
    return (
      <form onSubmit={verify}>
        <h1 className="text-lg font-semibold">Enter your code</h1>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.</p>
        <Label htmlFor="otp">Verification code</Label>
        <Input id="otp" value={otp} onChange={(ev) => setOtp(ev.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" autoFocus className="mt-1.5 text-center text-lg tracking-[0.4em]" />
        {err && <ErrLine>{err}</ErrLine>}
        <Button type="submit" disabled={busy || otp.length < 6} className="mt-4 w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & sign in"}</Button>
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <button type="button" className="hover:text-foreground" onClick={() => { setStep("email"); setOtp(""); setErr(null); }}>← Change email</button>
          <button type="button" className="hover:text-foreground" onClick={() => sendCode()} disabled={busy}>Resend code</button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode}>
      <h1 className="text-lg font-semibold">Log in with email</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">We'll email you a one-time code — no password to remember.</p>
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" autoFocus required className="mt-1.5" />
      {err && <ErrLine>{err}</ErrLine>}
      <Button type="submit" disabled={busy} className="mt-4 w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Mail className="mr-2 h-4 w-4" /> Email me a code</>)}</Button>
      <button type="button" onClick={onBack} className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to username & password
      </button>
    </form>
  );
}

/** Create a workspace (owner provisioning). Owners — like platform admins —
 *  always sign in with an **email code**, never a password (§auth); only staff
 *  and board users use username + password. So this collects a workspace name +
 *  email, verifies an OTP (which creates + signs in the owner), then creates the
 *  organization. */
function CreateWorkspace({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState<"form" | "otp">("form");
  const [workspace, setWorkspace] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!workspace.trim()) return setErr("Name your workspace first");
    if (!email.trim()) return setErr("Enter your email");
    setBusy(true);
    setErr(null);
    try {
      const res = await emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
      if (res.error) throw new Error(res.error.message || "Could not send code");
      setStep("otp");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await signIn.emailOtp({ email: email.trim(), otp: otp.trim() });
      if (res.error) throw new Error(res.error.message || "Invalid or expired code");
      const ws = workspace.trim() || "My workspace";
      const slug = `${slugify(ws) || "org"}-${Math.abs(hash(ws)).toString(36).slice(0, 4)}`;
      const org = await authClient.organization.create({ name: ws, slug });
      if (org.error) throw new Error(org.error.message);
      if (org.data?.id) await authClient.organization.setActive({ organizationId: org.data.id });
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  if (step === "otp") {
    return (
      <form onSubmit={verify}>
        <h1 className="text-lg font-semibold">Enter your code</h1>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span> to set up <span className="font-medium text-foreground">{workspace}</span>.</p>
        <Label htmlFor="cw-otp">Verification code</Label>
        <Input id="cw-otp" value={otp} onChange={(ev) => setOtp(ev.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" autoFocus className="mt-1.5 text-center text-lg tracking-[0.4em]" />
        {err && <ErrLine>{err}</ErrLine>}
        <Button type="submit" disabled={busy || otp.length < 6} className="mt-4 w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & create workspace"}</Button>
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <button type="button" className="hover:text-foreground" onClick={() => { setStep("form"); setOtp(""); setErr(null); }}>← Back</button>
          <button type="button" className="hover:text-foreground" onClick={() => sendCode()} disabled={busy}>Resend code</button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode}>
      <h1 className="text-lg font-semibold">Create your workspace</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Screens, channels, boards, staff, and billing all live under it. You'll sign in with an email code — no password to manage.</p>
      <div className="mb-3"><Label htmlFor="cw-ws">Workspace name</Label><Input id="cw-ws" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="Acme Clinic" autoFocus required className="mt-1.5" /></div>
      <div><Label htmlFor="cw-email">Your email</Label><Input id="cw-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required className="mt-1.5" /></div>
      {err && <ErrLine>{err}</ErrLine>}
      <Button type="submit" disabled={busy} className="mt-4 w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Mail className="mr-2 h-4 w-4" /> Email me a code</>)}</Button>
      <button type="button" onClick={onBack} className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to sign in
      </button>
    </form>
  );
}

/** First-run for an authenticated owner with no organization (they signed in via
 *  the email OTP path): name the workspace. Owners sign in with an email code, so
 *  there's no username/password to set here (§auth). */
export function OrgOnboard({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const ws = name.trim() || "My workspace";
      const slug = `${slugify(ws) || "org"}-${Math.abs(hash(ws)).toString(36).slice(0, 4)}`;
      const created = await authClient.organization.create({ name: ws, slug });
      if (created.error) throw new Error(created.error.message);
      if (created.data?.id) await authClient.organization.setActive({ organizationId: created.data.id });
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <form onSubmit={create}>
        <h1 className="text-lg font-semibold">Name your workspace</h1>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">Screens, channels, boards, staff, and billing all live under it.</p>
        <div className="mb-1"><Label htmlFor="org">Organization name</Label><Input id="org" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Clinic" autoFocus className="mt-1.5" required /></div>
        {err && <ErrLine>{err}</ErrLine>}
        <Button type="submit" disabled={busy} className="mt-4 w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create workspace"}</Button>
        <button type="button" onClick={onSignOut} className="mt-4 block w-full text-center text-xs text-muted-foreground hover:text-foreground">Sign out</button>
      </form>
    </Shell>
  );
}

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h + 1;
}
