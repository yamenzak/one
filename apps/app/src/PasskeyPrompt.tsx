/**
 * Passkey enrollment nudge (SPEC §4). Passwordless works on day one via emailed
 * codes, but a passkey is the one-tap default we want *every* user to hold — so
 * this provider prompts for one on each sign-in until they have at least one,
 * and exposes `promptEnroll()` so other surfaces (the "complete your profile"
 * card) can open the same flow. Once a passkey exists it never nags again.
 *
 * "Every sign-in" = once per app load: the modal opens when signed in with no
 * passkey and stays dismissed for the rest of that session; a fresh sign-in
 * remounts this and asks again.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Button, Dialog, DialogContent, ShieldCheck, KeyRound, Hand, ArrowRight } from "@mossa/ui";
import { passkeySupported, listPasskeys, enrollPasskey, passkeyErrorMessage, deviceLabel } from "./passkey.js";

interface PasskeyState {
  /** This device/browser can do WebAuthn. */
  supported: boolean;
  /** null while loading, then whether the user holds ≥1 passkey. */
  hasPasskey: boolean | null;
  /** Open the enrollment modal on demand (e.g. from the profile card). */
  promptEnroll: () => void;
  /** Re-read the passkey list (after enrolling elsewhere). */
  refresh: () => void;
}

const Ctx = createContext<PasskeyState | null>(null);
export const usePasskey = (): PasskeyState | null => useContext(Ctx);

export function PasskeyProvider({ children }: { children: ReactNode }) {
  const supported = passkeySupported();
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(supported ? null : false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!supported) { setHasPasskey(false); return; }
    void listPasskeys().then((ks) => setHasPasskey(ks.length > 0)).catch(() => setHasPasskey(false));
  }, [supported]);
  useEffect(() => { refresh(); }, [refresh]);

  // Auto-open once we know they have none — until dismissed this session.
  useEffect(() => {
    if (supported && hasPasskey === false && !dismissed) setOpen(true);
  }, [supported, hasPasskey, dismissed]);

  const promptEnroll = useCallback(() => { setMsg(null); setOpen(true); }, []);

  const enroll = async () => {
    setEnrolling(true); setMsg(null);
    try {
      await enrollPasskey(deviceLabel());
      setHasPasskey(true);
      setOpen(false);
    } catch (e) {
      setMsg(passkeyErrorMessage(e));
    } finally {
      setEnrolling(false);
    }
  };

  const close = () => { setDismissed(true); setOpen(false); };

  return (
    <Ctx.Provider value={{ supported, hasPasskey, promptEnroll, refresh }}>
      {children}
      <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent title="Set up one-tap sign-in">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary shadow-glow [&_svg]:size-6"><ShieldCheck /></div>
              <p className="text-sm text-muted-foreground">Add a passkey and sign in with just your face, fingerprint, or device PIN — no codes to wait for. It's more secure, and it stays on this device.</p>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2.5"><Hand className="size-4 shrink-0 text-primary" /> One tap, every time — no emailed code</li>
              <li className="flex items-center gap-2.5"><KeyRound className="size-4 shrink-0 text-primary" /> Phishing-proof; nothing to remember or leak</li>
            </ul>
            <div className="space-y-2">
              <Button size="lg" className="w-full" disabled={enrolling} onClick={() => void enroll()}>
                {enrolling ? "Waiting for your device…" : <>Set up passkey <ArrowRight /></>}
              </Button>
              <Button variant="ghost" className="w-full" onClick={close}>Maybe later</Button>
            </div>
            {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
            <p className="text-center text-xs text-muted-foreground">You can always add one later in Settings → Security.</p>
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
