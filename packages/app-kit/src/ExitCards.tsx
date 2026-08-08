/**
 * LEAVING — the two surfaces, for every app.
 *
 * `@4dl/tenancy`'s `tenantCloseRoutes` and `@4dl/auth`'s `accountRoutes` are
 * shared: same paths, same two-stage step-up, same states. The SCREENS were
 * not. Kova hand-wrote both (~170 lines in its settings file), Tessa mounted
 * the routes and shipped no way to reach them, and Scena has neither.
 *
 * That is the same gap `PasskeysCard` closed and it deserves the same fix: the
 * layer that owns the mechanism ships the surface too. A route with no door is
 * worse than a missing feature, because it passes every test and reads as
 * present in the changelog.
 *
 * ── Why the copy is injected and the FLOW is not ────────────────────────────
 *
 * What a tenant is called differs per product — a studio, a centre, a workspace
 * — and so does the list of what gets erased. Neither changes the mechanism:
 * ask, email a code, verify it, schedule, and offer the way back until the
 * grace period runs out. So `noun` and `erases` are props and everything else
 * is here.
 *
 * ── The states are not symmetric, and that is the design ────────────────────
 *
 * Closing a tenant is REVERSIBLE until the deletion date, so the card has two
 * resting states and the scheduled one leads with the way out. Deleting an
 * account is not reversible at all, so it has one. A single component with a
 * `reversible` flag would have hidden that difference behind a boolean.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActionResult, AlertTriangle, Button, Card, Field, LogOut, SettingsIndex, Sheet, Spinner, Stagger, Trash2,
} from "@4dl/ui";
import { api } from "./api.js";

const statusOf = (e: unknown): number | undefined => (e as { status?: number } | null)?.status;

/**
 * The two-step confirmation both exits use: read what happens, then type the
 * code that was emailed.
 *
 * ONE THING TO PRESS, ALWAYS IN THE SAME PLACE. The footer follows the step
 * rather than showing both buttons and disabling one — a disabled primary
 * action beside an enabled one is a puzzle, and this is the worst screen in the
 * app on which to make somebody solve one.
 */
function StepUpSheet({ open, onClose, title, intro, confirmLabel, busy, err, onSend, onConfirm }: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: ReactNode;
  confirmLabel: string;
  busy: boolean;
  err: string | null;
  onSend: () => Promise<boolean>;
  onConfirm: (code: string) => void;
}) {
  const [stage, setStage] = useState<"intro" | "code">("intro");
  const [code, setCode] = useState("");

  // Reopening starts at the beginning. Without this, a sheet dismissed on the
  // code step reopens asking for a code that is no longer arriving.
  useEffect(() => { if (open) { setStage("intro"); setCode(""); } }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={stage === "intro" ? (
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void onSend().then((ok) => ok && setStage("code"))}>
          {busy ? <><Spinner /> Sending…</> : "Email me a confirmation code"}
        </Button>
      ) : (
        <Button size="lg" variant="outline" className="w-full border-danger/40 text-danger" disabled={busy || code.length < 6} onClick={() => onConfirm(code.trim())}>
          {busy ? <><Spinner /> …</> : <><Trash2 /> {confirmLabel}</>}
        </Button>
      )}
    >
      {stage === "intro" ? (
        <div className="space-y-4">
          <p className="text-body text-muted-foreground">{intro}</p>
          <ActionResult msg={null} err={err} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-body text-muted-foreground">Enter the 6-digit code we emailed you, then confirm.</p>
          <Field
            label="Confirmation code"
            inputMode="numeric"
            autoFocus
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          />
          <ActionResult msg={null} err={err} />
          {/* In the BODY, not the footer: resending is an escape from the step,
              not the step's action, and the footer holds exactly one thing. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSend()}
            className="w-full text-center text-caption text-muted-foreground hover:underline"
          >
            Resend code
          </button>
        </div>
      )}
    </Sheet>
  );
}

export interface CloseTenantCardProps {
  /** What this product calls a tenant, lower-case: "studio", "centre",
   *  "workspace". Used mid-sentence throughout, so it must not be capitalised. */
  noun: string;
  /** One clause naming what is erased — "every client, plan, log and file".
   *  The generic "all your data" is true of every product and informative about
   *  none, and this is the last screen on which to be vague. */
  erases: string;
  /** Days between scheduling and erasure, as the server actually implements it.
   *  Wrong here is worse than absent: it is a promise about a deadline. */
  graceDays: number;
  /** True when this product bills, so the copy can say billing stops. A
   *  self-hosted deployment with no rail must not claim to cancel one. */
  cancelsBilling?: boolean;
}

/**
 * Close this tenant — the owner's way out, and the reason the standing ladder
 * exempts `/api/tenant/close` from every read-only gate.
 *
 * A suspended tenant is meant to be able to leave rather than only to pay
 * (CLAUDE.md, "paying must be a way out, not the only one"). Tessa's route
 * guard has carried that exemption since it was written while the route it
 * exempted did not exist, and then the route existed while nothing rendered it.
 * The exemption protected nothing in either state.
 */
export function CloseTenantCard({ noun, erases, graceDays, cancelsBilling = true }: CloseTenantCardProps) {
  const [status, setStatus] = useState<{ closing: boolean; deleteAt: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus(await api.get<{ closing: boolean; deleteAt: string | null }>("/api/tenant/close/status").catch(() => ({ closing: false, deleteAt: null })));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sendCode = async (): Promise<boolean> => {
    setBusy(true); setErr(null);
    try { await api.post("/api/tenant/close/request-otp"); return true; }
    catch { setErr("Couldn't send the code. Try again."); return false; }
    finally { setBusy(false); }
  };
  const confirm = async (code: string) => {
    setBusy(true); setErr(null);
    try { await api.post("/api/tenant/close", { code }); setOpen(false); await load(); }
    catch (e) { setErr(statusOf(e) === 403 ? "That code is wrong or has expired." : `Couldn't close the ${noun}. Try again.`); }
    finally { setBusy(false); }
  };
  /*
    The way BACK from a scheduled deletion, so a silent failure here is the
    worst one on this screen: the owner presses "Keep it", the spinner stops,
    the card still says scheduled, and nothing says whether the cancel landed.
    Kova's original had no catch at all.
  */
  const keep = async () => {
    setBusy(true); setErr(null);
    try { await api.post("/api/tenant/close/cancel"); await load(); }
    catch { setErr(`Couldn't cancel the deletion — your ${noun} is still scheduled. Try again.`); }
    finally { setBusy(false); }
  };

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "");

  return (
    <Stagger>
      {status?.closing ? (
        <Card className="space-y-2.5">
          <div className="flex items-center gap-2 font-medium text-danger">
            <AlertTriangle className="size-4" aria-hidden /> Scheduled for deletion
          </div>
          <p className="text-body text-muted-foreground">
            {cancelsBilling ? "Billing is canceled. " : ""}Your {noun} and everything in it will be permanently erased on{" "}
            <span className="font-medium text-foreground">{when(status.deleteAt)}</span>. You can still undo this before then.
          </p>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void keep()}>
            {busy ? <><Spinner /> …</> : `Keep my ${noun}`}
          </Button>
          {/* Out here, not only inside the sheet — a failed cancel happens on
              this card and had nowhere to appear. */}
          <ActionResult msg={null} err={err} />
        </Card>
      ) : (
        <Card className="space-y-2.5">
          <div className="flex items-center gap-2 font-medium text-danger">
            <AlertTriangle className="size-4" aria-hidden /> Close this {noun}
          </div>
          <p className="text-body text-muted-foreground">
            {cancelsBilling ? "Cancels your subscription, then permanently deletes" : "Permanently deletes"} the {noun} and everything
            in it — {erases} — after a {graceDays}-day grace period. This can&apos;t be undone once the grace period passes.
          </p>
          <Button variant="outline" className="w-full border-danger/40 text-danger" onClick={() => { setErr(null); setOpen(true); }}>
            <Trash2 /> Close my {noun}…
          </Button>
        </Card>
      )}

      <StepUpSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Close your ${noun}`}
        intro={`This ${cancelsBilling ? "cancels billing immediately and " : ""}schedules your ${noun} for permanent deletion in ${graceDays} days. We'll email you a confirmation code first.`}
        confirmLabel={`Schedule ${noun} deletion`}
        busy={busy}
        err={err}
        onSend={sendCode}
        onConfirm={(code) => void confirm(code)}
      />
    </Stagger>
  );
}

export interface AccountExitRowsProps {
  /** The address the code goes to — shown so it can be checked before sending. */
  email: string | null;
  /**
   * True when this person owns a tenant, which the server refuses with 409.
   * Passed in rather than discovered from the refusal so the row can say so
   * BEFORE anything is sent: making somebody request a code, open an email and
   * type six digits to be told the attempt was never going to work is a worse
   * failure than the refusal that produces it.
   */
  ownsTenant?: boolean;
  /** Where an owner has to go first — "Studio settings → Danger zone". */
  closeFirstHint?: string;
  onSignOut: () => void | Promise<void>;
  /** Ends the session once the account is gone. Every app has its own. */
  onDeleted: () => void | Promise<void>;
  /** The group header. Defaults to "Account". */
  header?: string;
}

/**
 * THE TWO WAYS OUT, as index rows — because that is what they are.
 *
 * Not a card. Kova arrived at this after shipping the card version: a red
 * "Delete my account" panel with a paragraph of consequences sat directly above
 * a "Sign out" row, which is two spellings of one idea stacked, and the
 * paragraph was two taps early. Both exits are rows in an "Account" group now,
 * and the consequence moved into the confirmation sheet — where a consequence
 * belongs, at the moment you are asked to accept it.
 *
 * Contrast `CloseTenantCard`, which IS a card: it is the only thing on its own
 * danger-zone page, and it has a second resting state to report.
 */
export function AccountExitRows({ email, ownsTenant = false, closeFirstHint, onSignOut, onDeleted, header = "Account" }: AccountExitRowsProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const blocked = ownsTenant
    ? `You own one — close it first${closeFirstHint ? ` in ${closeFirstHint}` : ""}.`
    : null;

  const sendCode = async (): Promise<boolean> => {
    setBusy(true); setErr(null);
    try { await api.post("/api/me/delete/request-otp"); return true; }
    catch (e) { setErr(statusOf(e) === 409 ? (blocked ?? "Close your workspace first.") : "Couldn't send the code. Try again."); return false; }
    finally { setBusy(false); }
  };
  const confirm = async (code: string) => {
    setBusy(true); setErr(null);
    try { await api.post("/api/me/delete", { code }); await onDeleted(); }
    catch (e) {
      const s = statusOf(e);
      setErr(s === 403 ? "That code is wrong or has expired." : s === 409 ? (blocked ?? "Close your workspace first.") : "Couldn't delete your account. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <SettingsIndex
        groups={[{
          header,
          rows: [
            { key: "signout", icon: LogOut, label: "Sign out", tone: "neutral", onClick: () => void onSignOut() },
            {
              key: "delete",
              icon: Trash2,
              label: "Delete my account",
              destructive: true,
              sub: ownsTenant ? (closeFirstHint ? `Close your ${closeFirstHint.split(" ")[0]?.toLowerCase() ?? "workspace"} first` : "Close your workspace first") : "Erases everything, permanently",
              disabled: ownsTenant,
              onClick: () => { setErr(null); setOpen(true); },
            },
          ],
        }]}
      />
      <StepUpSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account"
        intro={<>We&apos;ll email a confirmation code to <span className="font-medium text-foreground">{email ?? "your address"}</span>. Entering it permanently erases your account and all your data. There&apos;s no undo.</>}
        confirmLabel="Permanently delete my account"
        busy={busy}
        err={err}
        onSend={sendCode}
        onConfirm={(code) => void confirm(code)}
      />
    </>
  );
}
