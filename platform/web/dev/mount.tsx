/**
 * THE PREVIEW, IN THE BROWSER.
 *
 * ⚠️ IT RUNS RATHER THAN RENDERS, and it had to start doing so the moment the
 * screen became a presentation. A dialog is a focus trap, a scroll lock, an
 * Escape key and a return of focus; a save is idle, saving, saved and failed —
 * none of which exists in static markup, so a screenshot of any of it proves the
 * CSS and nothing else.
 *
 * ⚠️ AND IT IS STILL ONE FILE. The bundle, the sheets and the fonts are inlined
 * into a single document — there is nowhere beside it to put anything, and an
 * external reference there does not fail loudly, it silently falls back.
 *
 * ⚠️ NOT SHIPPED CODE. Nothing in `src` may import this.
 */

import { useEffect, useState, type ElementType } from "react";
import { createRoot } from "react-dom/client";
import type { Problem } from "@one/kernel";
import { AccountCenter } from "../src/account/center.js";
import { AccountDetails } from "../src/account/details.js";
import { AccountHome, type AccountHomeProps } from "../src/account/home.js";
import { SKIES, type Sky } from "../src/sky.css.js";

/* ⚠️ ONE PERSON, PLAUSIBLE, WITH A REAL SPREAD ACROSS PRODUCTS. Lorem in a screen
   review is a way of not looking at it: names are what overflows, roles are what
   repeats, and a workspace in trouble is the row the layout exists to surface. */
const FULL = {
  person: { name: "Nadia Haddad", email: "nadia@haddadstrength.com" },
  workspaces: [
    { tenantId: "t1", slug: "haddad", name: "Haddad Strength", product: "kova", role: "Owner" },
    { tenantId: "t2", slug: "barre", name: "Beirut Barre Collective", product: "kova", role: "Coach" },
    { tenantId: "t3", slug: "corniche", name: "Corniche Screens", product: "scena", role: "Owner", standing: { label: "Payment failed", urgent: true } },
    { tenantId: "t4", slug: "clinic", name: "Haddad Clinic", product: "tessa", role: "Member", standing: { label: "Trial · 6 days", urgent: false } },
  ],
} satisfies Pick<AccountHomeProps, "person" | "workspaces">;

/*
  ⚠️ THE STATES ARE ON THE PAGE, NOT DESCRIBED BESIDE IT. Not-answered-yet and
  answered-and-empty are different screens, and the second is the one a product
  ships without ever looking at — it is what a new person sees first.
*/
const CASES = {
  four: FULL,
  none: { ...FULL, workspaces: [] },
  waiting: { ...FULL, workspaces: null },
  new: { person: { email: "b.okonkwo@gmail.com" }, workspaces: [] },
} satisfies Record<string, Pick<AccountHomeProps, "person" | "workspaces">>;

type CaseName = keyof typeof CASES;

/*
  ⚠️ THE FAILURES ARE REAL `Problem`s, not strings pretending. A per-field message
  and a general one are placed differently, read differently and are recovered
  from differently — so a preview that only ever shows one of them is a preview of
  half the design.
*/
const OUTCOMES = {
  saves: null,
  "field says no": {
    code: "identity.email_taken", status: 409, retryable: false, ref: "req_8fd12c",
    title: "That address is already in use",
    fields: { email: "Someone already signs in with this address.", name: "That name is not available." },
  },
  "server says no": {
    code: "platform.unavailable", status: 503, retryable: true, ref: "req_31ba07",
    title: "Something went wrong on our side",
    detail: "We could not reach the identity store. Nothing was changed.",
  },
} satisfies Record<string, Problem | null>;

type OutcomeName = keyof typeof OUTCOMES;

/** Long enough to see the spinner and know it is a wait, not a stutter. */
const ROUND_TRIP_MS = 900;

function Preview() {
  const [open, setOpen] = useState(true);
  const [at, setAt] = useState<"home" | "details">("home");
  const [which, setWhich] = useState<CaseName>("four");
  const [sky, setSky] = useState<Sky>("silk");
  const [outcome, setOutcome] = useState<OutcomeName>("saves");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [dial, setDial] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const save = async (): Promise<Problem | null> => {
    await new Promise((r) => setTimeout(r, ROUND_TRIP_MS));
    return OUTCOMES[outcome];
  };

  const screen = ({ Heading }: { readonly Heading: ElementType }) =>
    at === "home" ? (
      <AccountHome
        {...CASES[which]}
        sky={sky}
        Heading={Heading}
        onGo={(to) => { if (to === "account.profile") setAt("details"); }}
        onClose={() => setOpen(false)}
      />
    ) : (
      <AccountDetails
        person={CASES[which].person}
        since="4 March 2024"
        emailVerified
        Heading={Heading}
        onSave={save}
        onPickPhoto={() => undefined}
        onBack={() => setAt("home")}
      />
    );

  return (
    <>
      {/* ⚠️ SOMETHING TO BE PRESENTED OVER. Judging a modal route against a blank
          page hides the whole question the presentation answers — whether it reads
          as laid over an app or as having navigated away from one. */}
      <div className="host">
        <p>the app the person was in</p>
        <button type="button" onClick={() => setOpen(true)}>Open the account centre</button>
      </div>

      <AccountCenter open={open} onClose={() => { setOpen(false); setAt("home"); }}>
        {screen}
      </AccountCenter>

      {/* ⚠️ IT HAS TO SURVIVE A MODAL, and that costs two lines. A modal dialog
          turns off pointer events on the whole body and dismisses on any pointer
          down outside itself — correct for a dialog, and it made the controls
          unreachable for as long as the thing being reviewed was on screen. */}
      <div className="dial" data-open={dial ? "" : undefined} onPointerDown={(e) => e.stopPropagation()}>
        <div className="dial-panel">
          <Group label="screen" value={at} options={["home", "details"] as const} onPick={setAt} />
          <Group label="state" value={which} options={Object.keys(CASES) as CaseName[]} onPick={setWhich} />
          <Group label="save" value={outcome} options={Object.keys(OUTCOMES) as OutcomeName[]} onPick={setOutcome} />
          <Group label="sky" value={sky} options={[...SKIES]} onPick={setSky} />
          <Group label="theme" value={theme} options={["dark", "light"] as const} onPick={setTheme} />
        </div>
        <button className="dial-toggle" type="button" aria-label="Preview controls"
          aria-expanded={dial} onClick={() => setDial((d) => !d)}>⚙</button>
      </div>
    </>
  );
}

function Group<T extends string>({ label, value, options, onPick }: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly T[];
  readonly onPick: (v: T) => void;
}) {
  return (
    <div className="dial-group">
      <span>{label}</span>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={o === value} onClick={() => onPick(o)}>{o}</button>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
