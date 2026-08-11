/**
 * THE PREVIEW, IN THE BROWSER.
 *
 * ⚠️ IT RUNS RATHER THAN RENDERS, and it had to start doing so the moment the
 * screen became a presentation. A dialog is a focus trap, a scroll lock, an
 * Escape key and a return of focus; a save is idle, saving, saved and failed; a
 * keyboard covers a sheet — none of which exists in static markup, so a
 * screenshot of any of it proves the CSS and nothing else.
 *
 * ⚠️ THE DIAL IS BACK, AND THE STATES ARE ALSO IN THE URL. It was removed on the
 * argument that a control floating over the screens is one more thing in every
 * picture the product will never have — which is true of a SCREENSHOT and false of
 * a thing being used: haptics and a sound cannot be photographed, and there is no
 * way to feel a save without a switch to turn it on. Closed, the dial is one small
 * round control in a corner; open, it scrolls. `#state=none&save=server` still
 * works, so a state is still a link.
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
import { configureFeedback, feel } from "../src/feedback.js";

/* ⚠️ BAKED AT BUILD TIME BY `dev/page.tsx`, standing in for the route that will
   serve a generated face from a seed. Keyed the way the API will key it: a
   workspace by its id, a person by the name they are known here by. */
declare const __FACES__: Readonly<Record<string, string>>;
const face = (seed: string): string | undefined => __FACES__[seed];

/* ⚠️ ONE PERSON, PLAUSIBLE, WITH A REAL SPREAD ACROSS PRODUCTS. Lorem in a screen
   review is a way of not looking at it: names are what overflows, roles are what
   repeats, and a workspace in trouble is the row the layout exists to surface. */
const FULL = {
  person: { name: "Nadia Haddad", email: "nadia@haddadstrength.com", avatarUrl: face("Nadia Haddad") },
  workspaces: [
    { tenantId: "t1", slug: "haddad", name: "Haddad Strength", product: "kova", role: "Owner", face: face("t1") },
    { tenantId: "t2", slug: "barre", name: "Beirut Barre Collective", product: "kova", role: "Coach", face: face("t2") },
    { tenantId: "t3", slug: "corniche", name: "Corniche Screens", product: "scena", role: "Owner", face: face("t3"), standing: { label: "Payment failed", urgent: true } },
    { tenantId: "t4", slug: "clinic", name: "Haddad Clinic", product: "tessa", role: "Member", face: face("t4"), standing: { label: "Trial · 6 days", urgent: false } },
  ],
} satisfies Pick<AccountHomeProps, "person" | "workspaces">;

/*
  ⚠️ THE STATES ARE REACHABLE, NOT DESCRIBED. Not-answered-yet and
  answered-and-empty are different screens, and the second is the one a product
  ships without ever looking at — it is what a new person sees first.
  `#state=none` · `#state=waiting` · `#state=new`
*/
const CASES = {
  four: FULL,
  none: { ...FULL, workspaces: [] },
  waiting: { ...FULL, workspaces: null },
  new: { person: { email: "b.okonkwo@gmail.com", avatarUrl: face("b.okonkwo@gmail.com") }, workspaces: [] },
} satisfies Record<string, Pick<AccountHomeProps, "person" | "workspaces">>;

/*
  ⚠️ THE FAILURES ARE REAL `Problem`s, not strings pretending. A per-field message
  and a general one are placed differently, read differently and are recovered
  from differently — so a preview that only ever shows one of them is a preview of
  half the design.  `#save=field` · `#save=server`
*/
const OUTCOMES = {
  ok: null,
  field: {
    code: "identity.email_taken", status: 409, retryable: false, ref: "req_8fd12c",
    title: "That address is already in use",
    fields: { email: "Someone already signs in with this address.", name: "That name is not available." },
  },
  server: {
    code: "platform.unavailable", status: 503, retryable: true, ref: "req_31ba07",
    title: "Something went wrong on our side",
    detail: "We could not reach the identity store. Nothing was changed.",
  },
} satisfies Record<string, Problem | null>;

/** Long enough to see the spinner and know it is a wait, not a stutter. */
const ROUND_TRIP_MS = 900;

const asked = new URLSearchParams(location.hash.slice(1));

const ON_OFF = ["on", "off"] as const;
type OnOff = (typeof ON_OFF)[number];

function Preview() {
  const [open, setOpen] = useState(true);
  const [at, setAt] = useState<"home" | "details">("home");
  const [which, setWhich] = useState((asked.get("state") ?? "four") as keyof typeof CASES);
  const [outcome, setOutcome] = useState((asked.get("save") ?? "ok") as keyof typeof OUTCOMES);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  /* ⚠️ SOUND ON HERE AND OFF EVERYWHERE ELSE. This is the one place the note is
     meant to be heard rather than chosen — a preview whose job is showing what a
     save feels like cannot ship with the quiet default. */
  const [haptics, setHaptics] = useState<OnOff>("on");
  const [sound, setSound] = useState<OnOff>("on");
  const [dial, setDial] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    configureFeedback({ haptics: haptics === "on", sound: sound === "on" });
  }, [haptics, sound]);

  const save = async (): Promise<Problem | null> => {
    await new Promise((r) => setTimeout(r, ROUND_TRIP_MS));
    return OUTCOMES[outcome] ?? null;
  };

  const screen = ({ Heading }: { readonly Heading: ElementType }) =>
    at === "home" ? (
      <AccountHome
        {...CASES[which] ?? CASES.four}
        Heading={Heading}
        onGo={(to) => { if (to === "account.profile") setAt("details"); }}
        onClose={() => setOpen(false)}
      />
    ) : (
      <AccountDetails
        person={(CASES[which] ?? CASES.four).person}
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

      <div className="dial" data-open={dial ? "" : undefined} onPointerDown={(e) => e.stopPropagation()}>
        <div className="dial-panel">
          <Group label="screen" value={at} options={["home", "details"] as const} onPick={setAt} />
          <Group label="workspaces" value={which} options={Object.keys(CASES) as (keyof typeof CASES)[]} onPick={setWhich} />
          <Group label="save" value={outcome} options={Object.keys(OUTCOMES) as (keyof typeof OUTCOMES)[]} onPick={setOutcome} />
          <Group label="theme" value={theme} options={["dark", "light"] as const} onPick={setTheme} />
          <Group label="haptics" value={haptics} options={ON_OFF} onPick={setHaptics} />
          <Group label="sound" value={sound} options={ON_OFF} onPick={setSound} />
          {/* ⚠️ A NOTE YOU CANNOT HEAR WITHOUT SAVING SOMETHING IS A NOTE NOBODY
              REVIEWS. Both, side by side, because the whole question is whether
              they are distinguishable. */}
          <div className="dial-group">
            <span>play</span>
            <button type="button" onClick={() => feel("done")}>done</button>
            <button type="button" onClick={() => feel("wrong")}>wrong</button>
          </div>
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
