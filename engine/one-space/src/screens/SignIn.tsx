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
import { Button, Form } from "@heroui/react";
import type { Problem } from "@engine/kernel";
/* ⚠️ ALIASED, because these screens hold their current refusal in a state
   called `problem` — the constructor and the value want the same word, and the
   shadow would make a module-scope call and an in-component call mean different
   things while reading identically. */
import { CODE_DIGITS, problem as raise, refusedOn } from "@engine/kernel";
import { PROBLEMS } from "../problems.js";
import { useSession } from "../session.js";
import { here, setupUrl } from "../door.js";
import { Arrival, AsideRoute, CodeEntry, SPACE, TextInput, Trouble } from "@engine/design";

/* ⚠️ Checked here rather than by `isRequired`, which draws a red asterisk on the
   only field on the screen — a required marker beside the one thing there is to
   fill in is noise that teaches somebody to stop reading markers. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/*
  ⚠️ A FIELD'S OWN MESSAGE RIDES IN `fields`, WHICH IS WHAT IT IS FOR. Both of
  these were object literals stamped `platform.invalid` and carrying their own
  title — so one code meant three different sentences across the hub, and the
  sentence appeared in a banner above the form rather than against the input it
  was about. The code says WHAT KIND of refusal it is; `fields` says which input,
  in words, where somebody is already looking.
*/
const notAnAddress = (): Problem => raise(PROBLEMS, "platform.invalid", {}, {
  fields: { email: "That does not look like an email address" },
});

const shortCode = (): Problem => raise(PROBLEMS, "platform.invalid", {}, {
  fields: { code: `The code is ${CODE_DIGITS} digits` },
});

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
    if (!EMAIL.test(address)) { setProblem(notAnAddress()); return; }
    setBusy(true);
    setProblem(null);
    const out = await askForCode(address);
    setBusy(false);
    if (!out.ok) return setProblem(out.problem);
    setSent(true);
  };

  const finish = async () => {
    if (code.length !== CODE_DIGITS) { setProblem(shortCode()); return; }
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
      /* ⚠️ THE DOOR IS WHERE THE LOGO IS THE SUBJECT — see `Arrival.brand`. */
      brand={{ of: "space", name: ["One", "Space"] }}
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
          {/* ⚠️ THE BOXES ARE COUNTED FROM `CODE_DIGITS`, NOT WRITTEN OUT. This
              was six hand-written slots under the header sentence saying they
              must not be — see `CodeEntry`. */}
          <CodeEntry
            autoFocus
            digits={CODE_DIGITS}
            value={code}
            onChange={setCode}
            onDone={() => { void finish(); }}
            disabled={busy}
            error={refusedOn(problem, "code")}
          />

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
      /* ⚠️ THE DOOR IS WHERE THE LOGO IS THE SUBJECT — see `Arrival.brand`. */
      brand={{ of: "space", name: ["One", "Space"] }}
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
        <TextInput
          label="Email"
          name="email"
          kind="email"
          value={email}
          onChange={setEmail}
          disabled={busy}
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          error={refusedOn(problem, "email")}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth isPending={busy}>
          Send me a code
        </Button>
      </Form>
    </Arrival>
  );
}
