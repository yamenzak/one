/**
 * SIGNING IN — an address, then a code.
 *
 * ⚠️ NO PASSWORD, EVER. There is no password field to phish, no hash to leak and
 * no reset flow to take over — and the code is the reset flow, so a product with
 * both has the weaker of the two as its real front door.
 *
 * ⚠️ THE NUMBER OF BOXES IS THE KERNEL'S. A form drawing six against a server
 * issuing eight refuses every valid code and blames the person while doing it.
 */

import { useState } from "react";
import { Button, Form, InputOTP, Label, REGEXP_ONLY_DIGITS, TextField, Input } from "@heroui/react";
import type { Problem } from "@quad/kernel";
import { CODE_DIGITS } from "@quad/kernel";
import { useSession } from "../session.js";
import { Refusal, Sheet } from "../ui.js";

export function SignIn({ lead }: { readonly lead: string }) {
  const { askForCode, enter } = useSession();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  /* ⚠️ Which step we are on is a fact about this attempt, not about the email
     field being non-empty — going back to change a typo must not lose the code
     that was already sent. */
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const send = async () => {
    setBusy(true);
    setProblem(null);
    const out = await askForCode(email.trim().toLowerCase());
    setBusy(false);
    if (!out.ok) return setProblem(out.problem);
    setSent(true);
  };

  const finish = async () => {
    setBusy(true);
    setProblem(null);
    const out = await enter(email.trim().toLowerCase(), code);
    setBusy(false);
    /* ⚠️ On success nothing happens HERE — the session provider now knows who
       this is, and the app re-renders around it. A redirect written into this
       screen would be a second answer to "where do you go after signing in". */
    if (!out.ok) { setProblem(out.problem); setCode(""); }
  };

  return (
    <Sheet title="Sign in to One" lead={lead}>
      {problem ? <Refusal problem={problem} /> : null}

      {sent
        ? (
          <Form
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); void finish(); }}
          >
            <div className="flex flex-col gap-2">
              <Label>The code we sent to {email}</Label>
              <InputOTP
                autoFocus
                maxLength={CODE_DIGITS}
                pattern={REGEXP_ONLY_DIGITS}
                value={code}
                onChange={setCode}
                onComplete={() => { void finish(); }}
                isDisabled={busy}
              >
                <InputOTP.Group>
                  <InputOTP.Slot index={0} />
                  <InputOTP.Slot index={1} />
                  <InputOTP.Slot index={2} />
                </InputOTP.Group>
                <InputOTP.Separator />
                <InputOTP.Group>
                  <InputOTP.Slot index={3} />
                  <InputOTP.Slot index={4} />
                  <InputOTP.Slot index={5} />
                </InputOTP.Group>
              </InputOTP>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="primary"
                isPending={busy}
                isDisabled={code.length !== CODE_DIGITS}
              >
                Sign in
              </Button>
              {/* ⚠️ A way back. Without one, a typo in the address is a dead end
                  somebody escapes by reloading the page. */}
              <Button variant="ghost" isDisabled={busy} onPress={() => { setSent(false); setCode(""); }}>
                Use a different address
              </Button>
            </div>
          </Form>
        )
        : (
          <Form
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <TextField
              isRequired
              fullWidth
              name="email"
              type="email"
              value={email}
              onChange={setEmail}
              isDisabled={busy}
            >
              <Label>Your email address</Label>
              <Input autoFocus placeholder="you@example.com" />
            </TextField>
            <Button type="submit" variant="primary" isPending={busy} isDisabled={!email.trim()}>
              Send me a code
            </Button>
          </Form>
        )}
    </Sheet>
  );
}
