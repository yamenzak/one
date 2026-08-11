/**
 * THE PREVIEW, IN THE BROWSER.
 *
 * ⚠️ IT RUNS RATHER THAN RENDERS, and it had to start doing so the moment the
 * screen became a presentation. A dialog is a focus trap, a scroll lock, an
 * Escape key and a return of focus — none of which exist in static markup, so a
 * screenshot of it proves the CSS and nothing else. Every judgement about how it
 * BEHAVES needed a page that behaves.
 *
 * ⚠️ AND IT IS STILL ONE FILE. The bundle, the sheets and the fonts are inlined
 * into a single document — there is nowhere beside it to put anything, and an
 * external reference there does not fail loudly, it silently falls back.
 *
 * ⚠️ NOT SHIPPED CODE. Nothing in `src` may import this.
 */

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AccountCenter } from "../src/account/center.js";
import type { AccountHomeProps } from "../src/account/home.js";
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

function Preview() {
  const [open, setOpen] = useState(true);
  const [which, setWhich] = useState<CaseName>("four");
  const [sky, setSky] = useState<Sky>("silk");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [dial, setDial] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  return (
    <>
      {/* ⚠️ SOMETHING TO BE PRESENTED OVER. Judging a modal route against a blank
          page hides the whole question the presentation answers — whether it
          reads as laid over an app or as having navigated away from one. */}
      <div className="host">
        <p>the app the person was in</p>
        <button type="button" onClick={() => setOpen(true)}>Open the account centre</button>
      </div>

      <AccountCenter
        open={open}
        sky={sky}
        {...CASES[which]}
        onGo={() => undefined}
        onClose={() => setOpen(false)}
      />

      <div className="dial" data-open={dial ? "" : undefined}>
        <div className="dial-panel">
          <Group label="state" value={which} options={Object.keys(CASES) as CaseName[]} onPick={setWhich} />
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
