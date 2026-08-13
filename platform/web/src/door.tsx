/**
 * THE DOOR — the only screen a person meets before they are anybody.
 *
 * ⚠️ THE SERVER SIDE OF THIS HAS BEEN COMPLETE FOR THREE STAGES AND NOTHING
 * CALLED IT. Four passkey operations and two code operations, written, verified,
 * rate-limited and tested; no surface anywhere, so the only way anyone ever
 * signed into this platform was a test harness. That is the failure this
 * repository has a guard against, on the one flow every other flow is behind.
 *
 * ⚠️ TWO LANES, AND THE ORDER IS A SECURITY DECISION RATHER THAN A PREFERENCE.
 * A passkey is offered first because it is stronger and faster; an emailed code is
 * always reachable because it is the only lane that can prove an address in the
 * first place, and therefore the only way back in when every device is gone. What
 * the door must never do is make the second lane feel like a failure of the
 * first — most people arriving here have no passkey and never will.
 *
 * ⚠️ IT NEVER SAYS WHETHER AN ADDRESS HAS AN ACCOUNT. Both operations behind it
 * answer identically for an address that exists and one that does not — that is a
 * membership oracle the runtime is careful about — and a screen that said "no
 * account found" would hand back exactly what the endpoints refuse to. So there is
 * no "sign up" here and no "unknown address": the code goes out either way, and
 * an address nobody has heard of simply never receives one.
 *
 * ⚠️ AND THERE IS NO SIGN-UP BUTTON, WHICH IS NOT AN OVERSIGHT. An account is
 * created by proving an address, which the code lane already does; a workspace is
 * created at the setup door. A "create account" control here would be a second
 * name for the field above it.
 */

import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Button } from "./button.js";
import { Field } from "./field.js";
import { Edit, Key, Letter } from "./icon.js";
import { Card, Item } from "./list.js";
import { Screen, Section, Title } from "./screen.js";
import { browserCeremony, registerPasskey, signInWithPasskey, type Attempt, type Ceremony, type RegisterOffer, type Registered, type SignInOffer, type Asserted } from "./passkey.js";

/* ------------------------------------------------------------------ state --- */

/**
 * WHERE SOMEBODY IS IN GETTING IN.
 *
 * ⚠️ FOUR STATES, AND `offer` IS THE ONE THAT IS EASY TO LOSE. Somebody who has
 * just proved an address is signed in — the offer that follows is a suggestion,
 * not a step, and every path through it ends in the same place. Modelled as part
 * of the sign-in it would be a gate people are made to pass; modelled as its own
 * state it is a screen with two ways out and no wrong answer.
 */
export type DoorAt =
  | { readonly at: "address" }
  | { readonly at: "code"; readonly email: string }
  | { readonly at: "offer"; readonly email: string }
  | { readonly at: "in" };

export type DoorStep =
  /** A code was sent to this address. */
  | { readonly step: "sent"; readonly email: string }
  /** A code was accepted. `offer` is the server's answer, never the screen's guess. */
  | { readonly step: "verified"; readonly email: string; readonly offer: boolean }
  /** A passkey resolved the whole thing, which skips the offer by definition. */
  | { readonly step: "asserted" }
  /** "Use a different address" — the one way back, and it is not a failure. */
  | { readonly step: "restart" }
  /** The offer was answered, either way. */
  | { readonly step: "settled" };

/**
 * ⚠️ PURE, BECAUSE EVERY INTERESTING PROPERTY OF A SIGN-IN IS A TRANSITION. That
 * a wrong code does not throw somebody back to the address field, that a passkey
 * never lands on the offer, that "use a different address" forgets the address —
 * each is one line here and none of them is visible in a rendering test.
 */
export function nextDoor(at: DoorAt, step: DoorStep): DoorAt {
  switch (step.step) {
    case "sent": return { at: "code", email: step.email };
    /* ⚠️ THE OFFER IS THE SERVER'S CALL. It knows what credentials this person
       holds and which relying party this door prompts for; the screen knows
       neither, and a screen that guessed would nag somebody who already has one. */
    case "verified": return step.offer ? { at: "offer", email: step.email } : { at: "in" };
    /* ⚠️ A PASSKEY SIGN-IN NEVER REACHES THE OFFER. They just used the thing it
       would be offering. */
    case "asserted": return { at: "in" };
    case "restart": return { at: "address" };
    case "settled": return at.at === "offer" ? { at: "in" } : at;
  }
}

/* ------------------------------------------------------------------- wire --- */

/**
 * WHAT THE DOOR NEEDS DONE, AND NOTHING ABOUT HOW.
 *
 * ⚠️ EVERY ONE RESOLVES TO A `Problem` OR TO A VALUE, AND NONE OF THEM THROWS.
 * A rejected promise on this screen is an unhandled rejection in front of
 * somebody who cannot get in, and the one failure that matters here — the resend
 * cooldown — is a structured refusal rather than an error.
 */
export interface DoorWire {
  /** `identity.code.request`. */
  sendCode(email: string): Promise<Problem | null>;
  /** `identity.code.verify`. */
  verifyCode(email: string, code: string): Promise<{ offerPasskey: boolean } | Problem>;
  /** `identity.passkey.begin`. An empty address is deliberate — see `passkey.ts`. */
  beginPasskey(email: string): Promise<SignInOffer | Problem>;
  /** `identity.passkey.finish`. */
  finishPasskey(assertion: Asserted): Promise<Problem | null>;
  /** `identity.passkey.register.begin`, which requires the session just made. */
  beginRegister(): Promise<RegisterOffer | Problem>;
  /** `identity.passkey.register.finish`. */
  finishRegister(registration: Registered): Promise<Problem | null>;
}

const isProblem = (v: unknown): v is Problem =>
  typeof v === "object" && v !== null && "code" in v && "title" in v;

/**
 * ⚠️ HOW LONG BEFORE ANOTHER CODE MAY BE ASKED FOR, AS THE SERVER SAID IT. The
 * runtime refuses a resend inside a minute and reports the remaining seconds in
 * `platform.too_many`; a countdown the screen invented would drift out of step
 * with the only clock that decides anything.
 */
export const waitFrom = (problem: Problem): number => {
  const meta = problem as unknown as { readonly meta?: { readonly retryAfter?: unknown } };
  const seconds = meta.meta?.retryAfter;
  return typeof seconds === "number" && seconds > 0 ? Math.ceil(seconds) : 0;
};

/* ----------------------------------------------------------------- screens --- */

export interface DoorProps {
  /**
   * ⚠️ THE NAME OVER THE DOOR IS THE PLACE, NOT THE PLATFORM. Somebody signing
   * into a studio's own address has never heard of us, and a door that announced
   * the platform there would read as the wrong site — which, on a sign-in screen,
   * reads as phishing.
   */
  readonly name: string;
  /** The lockup or logo, where the place has one. */
  readonly mark?: ReactNode;
  readonly wire: DoorWire;
  /** Called once, when there is a session. The caller owns what happens next. */
  readonly onIn: () => void;
  /** ⚠️ Injected so the ceremony can be driven without a browser. */
  readonly ceremony?: Ceremony;
  readonly Heading?: ElementType;
}

export function Door({ name, mark, wire, onIn, ceremony, Heading = "h1" }: DoorProps): ReactNode {
  const [at, setAt] = useState<DoorAt>({ at: "address" });
  const go = useCallback((step: DoorStep) => setAt((was) => nextDoor(was, step)), []);
  useEffect(() => { if (at.at === "in") onIn(); }, [at.at, onIn]);

  const how = useRef<Ceremony | null>(null);
  if (how.current === null) how.current = ceremony ?? browserCeremony();

  return at.at === "address"
    ? <AddressScreen name={name} mark={mark} wire={wire} ceremony={how.current} go={go} Heading={Heading} />
    : at.at === "code"
      ? <CodeScreen email={at.email} wire={wire} go={go} Heading={Heading} />
      : at.at === "offer"
        ? <OfferScreen email={at.email} wire={wire} ceremony={how.current} go={go} Heading={Heading} />
        /* ⚠️ THE DOOR RENDERS NOTHING ONCE IT IS OPEN. What comes next belongs to
           whatever mounted it, and a "signed in" screen would be a step between
           somebody and the thing they came for. */
        : null;
}

/* ---------------------------------------------------------------- address --- */

/**
 * ⚠️ THE PASSKEY IS ARMED ON ARRIVAL AND NEVER ANNOUNCED. Conditional mediation
 * puts the credential in the address field's own suggestion list, so a person who
 * has one taps it and is in, and a person who does not sees an ordinary field.
 * The alternative — a "sign in with a passkey" button — asks everybody to know
 * what a passkey is in order to find out whether they have one.
 *
 * ⚠️ AND IT IS ABORTED THE MOMENT SOMEBODY TYPES INSTEAD. A conditional request
 * left running while a second ceremony starts makes the browser refuse the second
 * one, which is a sign-in that fails once for no visible reason and then works.
 */
function AddressScreen({ name, mark, wire, ceremony, go, Heading }: {
  readonly name: string; readonly mark?: ReactNode; readonly wire: DoorWire;
  readonly ceremony: Ceremony; readonly go: (step: DoorStep) => void; readonly Heading: ElementType;
}): ReactNode {
  const [email, setEmail] = useState("");
  const [wrong, setWrong] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [sending, setSending] = useState(false);
  const [canPasskey, setCanPasskey] = useState(false);
  const armed = useRef<AbortController | null>(null);

  /* ⚠️ ONE EFFECT, AND ITS CLEANUP IS THE ABORT. Without the cleanup a person who
     leaves this screen while the suggestion is open takes a live ceremony with
     them into the next one. */
  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    armed.current = controller;
    void (async () => {
      const [available, autofill] = await Promise.all([ceremony.available(), ceremony.autofill()]);
      if (stopped) return;
      setCanPasskey(available);
      if (!autofill) return;
      const offer = await wire.beginPasskey("");
      if (stopped || isProblem(offer)) return;
      const got = await signInWithPasskey(offer, ceremony, { conditional: true, signal: controller.signal });
      if (stopped || got.at !== "ok") return;
      const failed = await wire.finishPasskey(got.value);
      if (!stopped && !failed) go({ step: "asserted" });
    })();
    return () => { stopped = true; controller.abort(); };
  }, [ceremony, wire, go]);

  const send = async () => {
    const address = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      /* ⚠️ CHECKED HERE ONLY TO SAVE A ROUND TRIP, and the server checks it
         again. A client-side rule that is the only one is a rule anybody can
         skip; a client-side rule that is the only FAST one is a courtesy. */
      setWrong("That does not look like an email address");
      return;
    }
    setWrong(null);
    setProblem(null);
    setSending(true);
    armed.current?.abort();
    const failed = await wire.sendCode(address);
    setSending(false);
    if (failed) { setProblem(failed); return; }
    go({ step: "sent", email: address });
  };

  return (
    /* ⚠️ THE SAME LIGHT AS THE ACCOUNT CENTRE'S ROOT, because it is the same
       arrival. A door with a sky of its own would be the one screen in the
       platform whose weather nobody chose. */
    <Screen leave="none" name={name} sky="silk"
      title={<Title as={Heading}>{mark ?? name}</Title>}
      lede="Enter your email and we will send you a code."
    >
      <Section>
        <form className="form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <Field
            label="Email address"
            value={email}
            onValue={(next) => { setEmail(next); setWrong(null); }}
            wrong={wrong}
            type="email"
            inputMode="email"
            /* ⚠️ `webauthn` IS WHAT PUTS A PASSKEY IN THIS FIELD'S SUGGESTIONS.
               Without the token the conditional request above resolves nowhere
               and the whole lane is silently dead. */
            autoComplete="username webauthn"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            clearable
          />
          {problem ? <DoorProblem problem={problem} /> : null}
          <div className="actions">
            <Button tone="loud" wide type="submit" data-state={sending ? "working" : undefined} disabled={sending}>
              {sending ? "Sending" : "Continue"}
            </Button>
          </div>
        </form>
      </Section>

      {/* ⚠️ ONLY WHERE A PASSKEY IS POSSIBLE AND CANNOT BE SUGGESTED. On a browser
          with conditional mediation this is a second control for something already
          offered in the field above; on one without it, it is the only way to use
          a credential somebody has. */}
      {canPasskey ? (
        <Section>
          <Card>
            <Item
              icon={<Key />}
              title="Use a passkey"
              detail="If you added one to this device"
              onGo={() => void (async () => {
                const offer = await wire.beginPasskey(email.trim());
                if (isProblem(offer)) { setProblem(offer); return; }
                const got = await signInWithPasskey(offer, ceremony);
                /* ⚠️ A DISMISSAL SAYS NOTHING AT ALL. Somebody who changed their
                   mind is told they changed their mind. */
                if (got.at === "cancelled" || got.at === "unsupported") return;
                if (got.at === "failed") { setWrong("That passkey did not work. Use a code instead."); return; }
                const failed = await wire.finishPasskey(got.value);
                if (failed) { setProblem(failed); return; }
                go({ step: "asserted" });
              })()}
            />
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------- code --- */

/**
 * ⚠️ THE CODE IS SUBMITTED WHEN IT IS COMPLETE. Six digits is a complete answer,
 * and a person who has just pasted one from their mail app should not then have to
 * find a button — every additional press here is a press between somebody and the
 * product they already paid for.
 *
 * ⚠️ AND THE RESEND SAYS WHEN, NOT WHETHER. The runtime refuses a second code
 * inside a minute; a button that simply fails at second forty teaches people to
 * press it repeatedly, which is exactly the deliverability problem the cooldown
 * exists to prevent.
 */
function CodeScreen({ email, wire, go, Heading }: {
  readonly email: string; readonly wire: DoorWire;
  readonly go: (step: DoorStep) => void; readonly Heading: ElementType;
}): ReactNode {
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [checking, setChecking] = useState(false);
  const [wait, setWait] = useState(60);

  /* ⚠️ ONE INTERVAL FOR THE WHOLE SCREEN. A timer per press is a timer per press
     that nothing clears. */
  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setWait((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [wait > 0]);

  const check = useCallback(async (entered: string) => {
    setChecking(true);
    setProblem(null);
    const answer = await wire.verifyCode(email, entered);
    setChecking(false);
    if (isProblem(answer)) {
      /* ⚠️ THE FIELD SAYS IT, NOT A TOAST. The value that was refused is on the
         screen and the message belongs under it — a refusal that travels to a
         corner is read after somebody has already retyped what was wrong. */
      setWrong("That code is not right. Check it, or ask for another.");
      setCode("");
      return;
    }
    go({ step: "verified", email, offer: answer.offerPasskey });
  }, [email, go, wire]);

  const enter = (next: string) => {
    /* ⚠️ DIGITS ONLY, AND A PASTE OF THE WHOLE MAIL IS TRIMMED TO THEM. People
       paste "Your code is 418 205" more often than they paste "418205". */
    const digits = next.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    setWrong(null);
    if (digits.length === 6 && !checking) void check(digits);
  };

  return (
    <Screen leave="none" name="Check your email"
      title={<Title as={Heading}>Check your email</Title>}
      lede={`We sent a six-digit code to ${email}. It is good for ten minutes.`}
    >
      <Section>
        <form className="form" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) void check(code); }}>
          <Field
            label="Your code"
            value={code}
            onValue={enter}
            wrong={wrong}
            inputMode="numeric"
            /* ⚠️ WHAT LETS A PHONE OFFER THE CODE FROM THE NOTIFICATION. Without
               it, the fastest path on the platform most people are on is typing. */
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            enterKeyHint="go"
          />
          {problem ? <DoorProblem problem={problem} /> : null}
          <div className="actions">
            <Button tone="loud" wide type="submit" data-state={checking ? "working" : undefined}
              disabled={checking || code.length !== 6}>
              {checking ? "Checking" : "Continue"}
            </Button>
          </div>
        </form>
      </Section>

      <Section>
        <Card>
          <Item
            icon={<Letter />}
            off={wait > 0}
            title={wait > 0 ? `Send another code in ${wait}s` : "Send another code"}
            detail={wait > 0 ? undefined : "The last one stops working"}
            onGo={wait > 0 ? undefined : () => void (async () => {
              const failed = await wire.sendCode(email);
              /* ⚠️ A REFUSED RESEND IS A COUNTDOWN, NOT A FAILURE. The server
                 knows how long is left; the screen shows what it said. */
              if (failed) { setWait(waitFrom(failed) || 60); return; }
              setWait(60);
              setCode("");
              setWrong(null);
            })()}
          />
          {/* ⚠️ THE PENCIL, NOT THE KEY. This row changes what was typed; the key
              is the passkey's mark, and wearing it here says the one thing this
              row does not do. */}
          <Item
            icon={<Edit />}
            title="Use a different address"
            onGo={() => go({ step: "restart" })}
          />
        </Card>
      </Section>
    </Screen>
  );
}

/* ------------------------------------------------------------------ offer --- */

/**
 * ⚠️ THIS IS AN OFFER AND NOT A STEP, WHICH IS WHY BOTH ANSWERS ARE THE SAME
 * SIZE. Somebody standing here is already signed in; the product has what it
 * needs. A screen that made "Not now" small, grey and secondary would be asking
 * for a decision it has already decided.
 *
 * ⚠️ AND IT IS SHOWN ONCE, WHEN THE SERVER SAYS SO. It knows whether this person
 * holds a credential that works platform-wide; nagging somebody who does is how a
 * good idea becomes the thing people press past.
 */
function OfferScreen({ email, wire, ceremony, go, Heading }: {
  readonly email: string; readonly wire: DoorWire; readonly ceremony: Ceremony;
  readonly go: (step: DoorStep) => void; readonly Heading: ElementType;
}): ReactNode {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [adding, setAdding] = useState(false);

  const add = async () => {
    setAdding(true);
    setProblem(null);
    const offer = await wire.beginRegister();
    if (isProblem(offer)) { setAdding(false); setProblem(offer); return; }
    const made: Attempt<Registered> = await registerPasskey(offer, { email }, ceremony);
    setAdding(false);
    /* ⚠️ EVERY OUTCOME BUT A REAL FAILURE ENDS THE SAME WAY. Dismissed, already
       enrolled, or no authenticator at all — none of those is something to report
       to somebody who is already signed in and did not ask for this. */
    if (made.at === "cancelled" || made.at === "unsupported") { go({ step: "settled" }); return; }
    if (made.at === "failed") { setProblem(null); go({ step: "settled" }); return; }
    const failed = await wire.finishRegister(made.value);
    if (failed) { setProblem(failed); return; }
    go({ step: "settled" });
  };

  return (
    /* ⚠️ THE TITLE IS THE VALUE AND THE BUTTON IS THE ACTION. They were the same
       three words two hundred pixels apart, which is a screen saying one thing
       twice and the reason nothing on it said what it was for. */
    <Screen leave="none" name="Skip the code next time"
      title={<Title as={Heading}>Skip the code next time</Title>}
      lede="Use your face or fingerprint instead. The key is made on this device and never reaches us."
    >
      <Section>
        {problem ? <DoorProblem problem={problem} /> : null}
        <div className="actions">
          <Button tone="loud" wide data-state={adding ? "working" : undefined} disabled={adding} onClick={() => void add()}>
            {adding ? "Waiting for your device" : "Add a passkey"}
          </Button>
          <Button tone="quiet" wide onClick={() => go({ step: "settled" })}>Not now</Button>
        </div>
      </Section>
    </Screen>
  );
}

/* ⚠️ THE SAME SHAPE EVERY OTHER REFUSAL IN THE PRODUCT WEARS, and it is here
   rather than in three copies because a door has three places one can appear. */
const DoorProblem = ({ problem }: { readonly problem: Problem }): ReactNode => (
  <p className="note wrong" role="alert">
    <strong>{problem.title}</strong>
    {problem.detail ? <> {problem.detail}</> : null}
    <span className="note-ref">{problem.ref}</span>
  </p>
);
