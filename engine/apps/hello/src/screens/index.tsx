/**
 * HELLO'S BROWSER HALF — five screens, and the UI test ground.
 *
 * ⚠️ SEPARATE FROM THE MANIFEST ON PURPOSE. `../index.ts` is imported by the
 * WORKER, and a worker that imported React would pay for it in startup CPU on
 * every cold start — which is the whole of D3. The manifest declares the
 * screens; this file is what draws them, and only a browser ever loads it.
 *
 * ⚠️ EVERY SCREEN TAKES ITS DATA AS PROPS, WHICH IS WHAT MAKES THIS A TEST
 * GROUND. Nothing here fetches, so any screen renders with no session, no
 * worker and no database — which is how a person looks at the interface at all.
 * Four defects that every suite passed were caught by photographing a screen;
 * none of them would have been reachable behind a sign-in.
 *
 * ⚠️ AND THE SAMPLE WORLD IS THE APP'S OWN CONTENT, not a fixture. Hello is the
 * mock app — it has no customers and no database — so what it shows is written
 * down in `sample.ts` where anybody can read it.
 */

import * as React from "react";
import { ready, type Loaded, type PeriodId } from "@engine/design";
import { HELLO } from "../index.js";
import { NOTES, PEOPLE, READ, WRITTEN, type Note } from "./sample.js";
import { Notes } from "./Notes.js";
import { People } from "./People.js";
import { Reports } from "./Reports.js";
import { Search } from "./Search.js";
import { Settings } from "./Settings.js";

export { Notes, People, Reports, Search, Settings };
export * from "./sample.js";

const nothing = () => undefined;

/**
 * ⚠️ THE ROUTES COME FROM THE MANIFEST, NOT FROM A LIST HERE. A second list is a
 * second answer to "what screens does this app have", and the two drift in the
 * direction nobody notices — a screen declared and never drawn renders a notice,
 * which reads as unfinished rather than as a mistake.
 */
export const HELLO_ROUTES: readonly string[] =
  (HELLO.screens ?? []).map((s) => s.route);

/**
 * Every screen with the sample world behind it, keyed by its declared route.
 * This is what the test ground renders and what a screenshot sweep walks.
 */
export function HelloScreen({ route }: { readonly route: string }) {
  const [q, setQ] = React.useState("");
  const [period, setPeriod] = React.useState<PeriodId>("30d");

  /* ⚠️ THE NAME COMES FROM THE MANIFEST, NOT FROM A STRING HERE. A screen titled
     by its own file is a screen whose name and whose nav entry are two facts
     that can disagree — and the one somebody reports is whichever they saw
     second. */
  const title = (HELLO.screens ?? []).find((sc) => sc.route === route)?.label;

  const notes: Loaded<readonly Note[]> = ready(NOTES);
  const matches: Loaded<readonly Note[]> = ready(
    q.trim()
      ? NOTES.filter((n) => `${n.title} ${n.said}`.toLowerCase().includes(q.trim().toLowerCase()))
      : NOTES,
  );

  switch (route) {
    case "/people": return <People title={title} of={ready(PEOPLE)} onInvite={nothing} onOpen={nothing} />;
    case "/settings": return (
      <Settings
        title={title}
        level="tenant"
        held={new Set(["tenant:manage", "note:read", "note:write"])}
        stored={{}}
        onChange={nothing}
      />
    );
    case "/search": return <Search title={title} q={q} onQ={setQ} of={matches} />;
    case "/reports": return (
      <Reports
        title={title}
        written={WRITTEN}
        read={READ}
        today="2026-08-16"
        period={period}
        onPeriod={(id) => setPeriod(id)}
      />
    );
    /* ⚠️ THE DEFAULT IS THE APP'S FIRST DECLARED SCREEN, not a blank. An
       unrecognised route rendering nothing is the same picture as a page that
       failed to load, and only one of them gets reported. */
    default: return <Notes title={title ?? "Notes"} of={notes} onNew={nothing} onOpen={nothing} />;
  }
}
