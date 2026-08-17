/**
 * HELLO'S BROWSER HALF — eight screens, and the UI test ground.
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
 *
 * ⚠️ THE STATE LIVES HERE RATHER THAN IN THE SCREENS. A screen that owned its
 * own period, query and filters would be a screen nobody could render into a
 * chosen state — and photographing a chosen state is the whole reason this
 * exists. One holder, and every screen below it is a function of its props.
 */

import * as React from "react";
import { ready, type Loaded, type PeriodId } from "@engine/design";
import { HELLO } from "../index.js";
import { NOTES, PEOPLE, READ, WRITTEN, type Note as OneNote } from "./sample.js";
import { Brand, type BrandTheme } from "./Brand.js";
import { Note } from "./Note.js";
import { Notes } from "./Notes.js";
import { People } from "./People.js";
import { Reports } from "./Reports.js";
import { Search } from "./Search.js";
import { Settings } from "./Settings.js";
import { Start } from "./Start.js";
import { Write } from "./Write.js";

export { Brand, Note, Notes, People, Reports, Search, Settings, Start, Write };
export * from "./sample.js";

const nothing = () => undefined;

/* ⚠️ WHAT THE APPS HERE ACTUALLY HAVE, not the platform's closed set — a surface
   a workspace can switch on that no app offers is a toggle that changes nothing
   and says nothing. Hello declares `shell` and `email`. */
const SURFACES_HERE = [
  { id: "shell", label: "The app itself", under: "Colour, and your mark in the corner" },
  { id: "email", label: "Email", under: "Anything sent from here" },
];

/**
 * ⚠️ THE ROUTES COME FROM THE MANIFEST, NOT FROM A LIST HERE. A second list is a
 * second answer to "what screens does this app have", and the two drift in the
 * direction nobody notices — a screen declared and never drawn renders a notice,
 * which reads as unfinished rather than as a mistake.
 */
export const HELLO_ROUTES: readonly string[] =
  (HELLO.screens ?? []).map((s) => s.route);

/** What ticks the guide, and how many times. Sample, like everything else here. */
const DONE = ["note.created", "note.drafted"];
const COUNTS = { "note.created": 6, "note.published": 3, "note.drafted": 2 };
const HELD = new Set(["tenant:manage", "note:read", "note:write", "member:read"]);

/**
 * Every screen with the sample world behind it, keyed by its declared route.
 * This is what the test ground renders and what a screenshot sweep walks.
 */
export function HelloScreen({ route, onGo }: {
  readonly route: string;
  /** ⚠️ Absent on the ground, where there is no router to go anywhere with. */
  readonly onGo?: (route: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [recent, setRecent] = React.useState<readonly string[]>(["pricing", "onboarding"]);
  const [period, setPeriod] = React.useState<PeriodId>("30d");
  /* ⚠️ THE GROUND CAN BE EITHER KIND, because both are real screens and only one
     of them was ever going to get looked at. Pressing the offer switches it,
     which is the closest a router-free ground gets to the real transition. */
  const [kind, setKind] = React.useState<"personal" | "commercial">("personal");
  const [theme, setTheme] = React.useState<BrandTheme>({});
  const [surfaces, setSurfaces] = React.useState<readonly string[]>(["shell"]);
  const go = onGo ?? nothing;

  /* ⚠️ THE NAME COMES FROM THE MANIFEST, NOT FROM A STRING HERE. A screen titled
     by its own file is a screen whose name and whose nav entry are two facts
     that can disagree — and the one somebody reports is whichever they saw
     second. */
  const title = (HELLO.screens ?? []).find((sc) => sc.route === route)?.label;

  const notes: Loaded<readonly OneNote[]> = ready(NOTES);
  const matches: Loaded<readonly OneNote[]> = ready(
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
        held={HELD}
        stored={{}}
        onChange={nothing}
      />
    );
    case "/search": return (
      <Search
        title={title}
        q={q}
        onQ={setQ}
        of={matches}
        recent={recent}
        onRecent={(drop) => setRecent((was) => was.filter((r) => r !== drop))}
      />
    );
    case "/reports": return (
      <Reports
        title={title}
        of={ready({ written: WRITTEN, read: READ })}
        today="2026-08-16"
        period={period}
        onPeriod={(id) => setPeriod(id)}
      />
    );
    /* ⚠️ THE FIRST NOTE, BECAUSE THE GROUND HAS NO ROUTER TO CARRY AN ID. On a
       real deployment this route takes one; here it is the note the sample world
       leads with, which is what makes the screen photographable at all. */
    case "/note": return (
      <Note title={title} note={NOTES[0] as OneNote} onBack={() => go("/")} onPublish={nothing} onOpen={nothing} />
    );
    case "/write": return <Write title={title} onBack={() => go("/")} onSave={nothing} />;
    /* ⚠️ PERSONAL ON THE GROUND, WHICH IS THE HARDER HALF TO GET RIGHT. The
       ground photographs what somebody actually meets, and what most workspaces
       meet here is the offer rather than the editor. */
    case "/brand": return (
      <Brand
        title={title}
        name="The test ground"
        kind={kind}
        theme={theme}
        surfaces={new Set(surfaces)}
        offered={SURFACES_HERE}
        onTheme={(key, value) => setTheme((was) => ({ ...was, [key]: String(value ?? "") }))}
        onSurface={(id, on) => setSurfaces((was) =>
          on ? [...was, id] : was.filter((s) => s !== id))}
        onBecome={() => setKind("commercial")}
      />
    );
    case "/start": return (
      <Start title={title} done={DONE} counts={COUNTS} held={HELD} onGo={go} />
    );
    /* ⚠️ THE DEFAULT IS THE APP'S FIRST DECLARED SCREEN, not a blank. An
       unrecognised route rendering nothing is the same picture as a page that
       failed to load, and only one of them gets reported. */
    default: return (
      <Notes title={title ?? "Notes"} of={notes} onNew={() => go("/write")} onOpen={() => go("/note")} />
    );
  }
}
