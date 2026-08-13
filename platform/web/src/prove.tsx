/**
 * PROVING IT IS YOU, AGAIN — the sheet a refusal turns into.
 *
 * ⚠️ THE THREAT THIS ANSWERS IS NOT A STOLEN PASSWORD; THERE IS NONE. It is a
 * borrowed laptop with an open tab, and against that every check the platform has
 * PASSES: the cookie is genuine, the permission is held, the workspace is in good
 * standing. So three operations — closing an account, removing a credential and
 * exporting everything — ask for a proof no more than ten minutes old, and this is
 * how somebody gives one.
 *
 * ⚠️ IT IS RAISED BY A REFUSAL RATHER THAN GUESSED AT. A screen that decided for
 * itself when to ask would be a second copy of a rule the operations already
 * declare — and the copy is the one that goes out of date. `platform.proof_required`
 * arrives, this opens, and the action is retried.
 *
 * ⚠️ A PASSKEY IS ONE TAP AND THE CODE IS THE WAY BACK. Both lanes end in a new
 * session, which is what "recently proven" means — there is no second timestamp
 * anywhere and nothing to keep in step.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Button } from "./button.js";
import { Field } from "./field.js";
import { Sheet } from "./sheet.js";
import { browserCeremony, signInWithPasskey, type Ceremony } from "./passkey.js";
import { waitFrom, type DoorWire } from "./door.js";

/** ⚠️ The refusal this exists for, by the code the runtime answers with. */
export const NEEDS_PROOF = "platform.proof_required";

/** Whether a refusal is the one a proof resolves. */
export const needsProof = (problem: Problem | null): boolean => problem?.code === NEEDS_PROOF;

export interface ProveItProps {
  readonly open: boolean;
  /** ⚠️ Known already: this person is signed in. Nobody is asked who they are. */
  readonly email: string;
  /** What they were trying to do, so the sheet says why it is asking. */
  readonly toDo: string;
  readonly wire: DoorWire;
  /** ⚠️ Called after a new session exists. The caller retries its own write. */
  readonly onProven: () => void;
  readonly onClose: () => void;
  readonly ceremony?: Ceremony;
}

/**
 * ⚠️ THE ADDRESS IS SHOWN AND NEVER ASKED FOR. Somebody is signed in; a field
 * demanding what the session already knows is a form standing between a person
 * and something they were in the middle of doing.
 */
export function ProveIt({ open, email, toDo, wire, onProven, onClose, ceremony }: ProveItProps): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} dismissible label="Confirm it is you">
      <ProveItBody email={email} toDo={toDo} wire={wire} onProven={onProven} ceremony={ceremony} />
    </Sheet>
  );
}

/**
 * ⚠️ THE BODY IS ITS OWN EXPORT, for the same reason every other sheet's is: a
 * portal renders nothing on a server, so a body welded to one is a body no test
 * can read — and every assertion about what somebody is being asked would be made
 * against an empty string.
 */
export function ProveItBody({ email, toDo, wire, onProven, ceremony }: Omit<ProveItProps, "open" | "onClose">): ReactNode {
  const [how, setHow] = useState<"choose" | "code">("choose");
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [can, setCan] = useState(false);

  const browser = ceremony ?? browserCeremony();
  useEffect(() => { void browser.available().then(setCan); }, [browser]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setWait((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [wait > 0]);

  const byPasskey = async () => {
    setBusy(true);
    setWrong(null);
    const offer = await wire.beginPasskey(email);
    if ("code" in offer) { setBusy(false); setWrong("That did not work. Use a code instead."); return; }
    const got = await signInWithPasskey(offer, browser);
    setBusy(false);
    /* ⚠️ A DISMISSAL LEAVES THE SHEET EXACTLY AS IT WAS. Somebody who changed
       their mind mid-ceremony has not failed at anything. */
    if (got.at !== "ok") { if (got.at === "failed") setWrong("That did not work. Use a code instead."); return; }
    const failed = await wire.finishPasskey(got.value);
    if (failed) { setWrong("That did not work. Use a code instead."); return; }
    onProven();
  };

  const byCode = async () => {
    setBusy(true);
    setWrong(null);
    const failed = await wire.sendCode(email);
    setBusy(false);
    if (failed) { setWait(waitFrom(failed) || 60); }
    else setWait(60);
    setHow("code");
  };

  const check = useCallback(async (entered: string) => {
    setBusy(true);
    const answer = await wire.verifyCode(email, entered);
    setBusy(false);
    if ("code" in answer) { setWrong("That code is not right."); setCode(""); return; }
    onProven();
  }, [email, onProven, wire]);

  return (
    <div className="sheet-body">
      <header className="sheet-top">
        <h2 className="sheet-title">Confirm it is you</h2>
        {/* ⚠️ IT SAYS WHAT IT IS FOR. "Confirm it is you" with no object is a
            product being suspicious of somebody for no stated reason; naming the
            action makes the same sentence a precaution they can agree with. */}
        <p className="lede">Before {toDo}, prove you are still the person who signed in.</p>
      </header>

      {how === "choose" ? (
        <div className="actions">
          {/* ⚠️ THE PASSKEY IS FIRST WHERE THERE IS ONE, because it is one tap and
              needs no other application to be open. */}
          {can ? (
            <Button tone="loud" wide data-state={busy ? "working" : undefined} disabled={busy} onClick={() => void byPasskey()}>
              {busy ? "Waiting for your device" : "Use your passkey"}
            </Button>
          ) : null}
          <Button tone={can ? "quiet" : "loud"} wide disabled={busy} onClick={() => void byCode()}>
            Email me a code
          </Button>
          {wrong ? <p className="note wrong" role="alert">{wrong}</p> : null}
        </div>
      ) : (
        <>
          <p className="note">We sent a six-digit code to {email}.</p>
          <Field
            label="Your code"
            value={code}
            onValue={(next) => {
              const digits = next.replace(/\D/g, "").slice(0, 6);
              setCode(digits);
              setWrong(null);
              if (digits.length === 6 && !busy) void check(digits);
            }}
            wrong={wrong}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
          />
          <div className="actions">
            <Button tone="quiet" wide disabled={wait > 0 || busy} onClick={() => void byCode()}>
              {wait > 0 ? `Send another in ${wait}s` : "Send another code"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
