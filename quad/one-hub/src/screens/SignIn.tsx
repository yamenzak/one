/**
 * SIGNING IN — an address, then a code.
 *
 * ⚠️ NO PASSWORD, EVER. There is no password field to phish, no hash to leak and
 * no reset flow to take over — and the code is the reset flow, so a product with
 * both has the weaker of the two as its real front door.
 *
 * ⚠️ THE NUMBER OF BOXES IS THE KERNEL'S. A form drawing six against a server
 * issuing eight refuses every valid code and blames the person while doing it.
 *
 * ⚠️ THE PRIMARY IS NEVER DEAD AT REST. It was disabled until the field had
 * something in it, so the first thing anybody saw on the product's front door
 * was a grey slab — indistinguishable from a control that is broken, at the one
 * moment there is nothing else on the screen to judge it by. It stays live and
 * says what is missing when it is pressed, which is also the only version that
 * works for somebody who submits with the keyboard.
 *
 * ⚠️ AND THE SCREEN'S NAME CHANGES WITH THE STEP. "Sign in to One" over a code
 * field is the heading for the previous screen: the address has been given, the
 * code is somewhere else, and what the person needs told is which inbox.
 */

import { useState } from "react";
import { Button, Form, InputOTP, Label, REGEXP_ONLY_DIGITS, TextField, Input } from "@heroui/react";
import type { Problem } from "@quad/kernel";
import { CODE_DIGITS } from "@quad/kernel";
import { useSession } from "../session.js";
import { here, setupUrl } from "../door.js";
import { Arrival, AsideRoute, SPACE, Trouble } from "@quad/web";

/* ⚠️ Checked here rather than by `isRequired`, which draws a red asterisk on the
   only field on the screen — a required marker beside the one thing there is to
   fill in is noise that teaches somebody to stop reading markers. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const NOT_AN_ADDRESS: Problem = {
  code: "platform.invalid",
  status: 400,
  title: "That does not look like an email address",
  retryable: false,
  tone: "warning",
};

const SHORT_CODE: Problem = {
  code: "platform.invalid",
  status: 400,
  title: `The code is ${CODE_DIGITS} digits`,
  retryable: false,
  tone: "warning",
};

export function SignIn({ lead }: { readonly lead?: string }) {
  const { askForCode, enter, where, face } = useSession();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  /* ⚠️ Which step we are on is a fact about this attempt, not about the email
     field being non-empty — going back to change a typo must not lose the code
     that was already sent. */
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const send = async () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) { setProblem(NOT_AN_ADDRESS); return; }
    setBusy(true);
    setProblem(null);
    const out = await askForCode(address);
    setBusy(false);
    if (!out.ok) return setProblem(out.problem);
    setSent(true);
  };

  const finish = async () => {
    if (code.length !== CODE_DIGITS) { setProblem(SHORT_CODE); return; }
    setBusy(true);
    setProblem(null);
    const out = await enter(email.trim().toLowerCase(), code);
    setBusy(false);
    /* ⚠️ On success nothing happens HERE — the session provider now knows who
       this is, and the app re-renders around it. A redirect written into this
       screen would be a second answer to "where do you go after signing in". */
    if (!out.ok) { setProblem(out.problem); setCode(""); }
  };

  if (sent) {
    return (
      <Arrival
        name="Check your email"
        claim={`Code sent to ${email}`}
        aside={(
          <AsideRoute
            says="Wrong address?"
            label="Use a different one"
            isDisabled={busy}
            onDo={() => { setSent(false); setCode(""); }}
          />
        )}
      >
        {problem ? <Trouble problem={problem} /> : null}
        <Form
          className={`flex flex-col ${SPACE.snug}`}
          onSubmit={(e) => { e.preventDefault(); void finish(); }}
        >
          {/* ⚠️ The label is `sr-only`: the claim above already says what this
              is, in a sentence, and a second "the code we sent to …" over the
              boxes is the same fact twice. It stays in the accessibility tree,
              because the boxes on their own are six unnamed inputs. */}
          <Label className="sr-only">Your code</Label>
          {/* ⚠️ THE BOXES SPAN THE FORM, LIKE EVERY OTHER CONTROL ON IT. At
              their intrinsic size they sat two thirds of the way across, under
              a full-width button and over a full-width one — a row that stops
              short reads as a control that failed to size itself rather than as
              a decision. The groups grow and the slots share them, so six boxes
              divide the width instead of a seventh being invented for it. */}
          <InputOTP
            autoFocus
            maxLength={CODE_DIGITS}
            pattern={REGEXP_ONLY_DIGITS}
            value={code}
            onChange={setCode}
            onComplete={() => { void finish(); }}
            isDisabled={busy}
            className="w-full"
          >
            <InputOTP.Group className="grow">
              <InputOTP.Slot index={0} className="grow" />
              <InputOTP.Slot index={1} className="grow" />
              <InputOTP.Slot index={2} className="grow" />
            </InputOTP.Group>
            <InputOTP.Separator />
            <InputOTP.Group className="grow">
              <InputOTP.Slot index={3} className="grow" />
              <InputOTP.Slot index={4} className="grow" />
              <InputOTP.Slot index={5} className="grow" />
            </InputOTP.Group>
          </InputOTP>

          {/* ⚠️ Live at rest here too. `onComplete` submits the moment the
              sixth digit lands, so this is the fallback — and a fallback that
              is grey until the form no longer needs it helps nobody. */}
          <Button type="submit" variant="primary" size="lg" fullWidth isPending={busy}>
            Sign in
          </Button>
        </Form>
      </Arrival>
    );
  }

  /* ⚠️ THE OTHER ROUTE LIVES HERE NOW, BECAUSE THE SIGNPOST DOES NOT. It is
     offered on the account door only: from the setup door you are already
     there, and from a workspace's own address starting a second one is the
     invitation a previous platform shipped by accident. */
  const start = face === "hub" && where ? setupUrl(where, here()) : null;

  return (
    <Arrival
      name="Sign in"
      claim={lead}
      aside={start
        ? <AsideRoute says="New here?" label="Start a workspace" href={start} />
        : undefined}
    >
      {problem ? <Trouble problem={problem} /> : null}
      <Form
        className={`flex flex-col ${SPACE.snug}`}
        onSubmit={(e) => { e.preventDefault(); void send(); }}
      >
        <TextField
          fullWidth
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          isDisabled={busy}
        >
          <Label>Email</Label>
          <Input autoFocus autoComplete="email" placeholder="you@example.com" />
        </TextField>
        <Button type="submit" variant="primary" size="lg" fullWidth isPending={busy}>
          Send me a code
        </Button>
      </Form>
    </Arrival>
  );
}
