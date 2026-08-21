/**
 * HELLO'S PRODUCT HALF — the screens a real workspace opens, over its own records.
 *
 * ⚠️ SEPARATE FROM `index.tsx`, AND THE SEPARATION IS THE POINT. That file is the
 * test ground: every screen takes its data as props over a sample world written
 * down in `sample.ts`, so any of them renders with no session, no worker and no
 * database. This file is the same screens with the workspace's own records
 * behind them — and keeping the two apart is what stops a customer's bundle
 * carrying a sample world, and what stops a real screen quietly rendering one.
 *
 * ⚠️ THE SCREEN COMPONENTS ARE UNCHANGED, WHICH IS THE WHOLE CLAIM. A container
 * fetches and hands props; the screen is a function of them. That is why the
 * ground can photograph a chosen state at all, and it is the pattern the next
 * app copies: fetch out here, render in there, and never a screen that owns its
 * own request.
 *
 * ⚠️ AND THE DOOR IS HANDED OVER, NEVER IMPORTED. An app importing OneSpace's
 * `api` would point the dependency arrow backwards; `mount` receives it, so a
 * product never writes its own fetch and never has to learn what an expired
 * session looks like.
 *
 * ⚠️ A SCREEN THIS FILE DOES NOT REGISTER IS NOT BROKEN. `AppSurface` draws an
 * honest notice for a declared screen with nothing mounted, which is the state
 * of every screen before its container is written — and it reads as unfinished
 * rather than as a page that failed to load.
 */

import * as React from "react";
import { ready, trouble, waiting, type Loaded } from "@engine/design";
import { dayOf, valueOf, type Instant, type Problem } from "@engine/kernel";
import { HELLO } from "../index.js";
import { Notes } from "./Notes.js";
import type { Note as Shown } from "./sample.js";

/* ------------------------------------------------------------------ seams --- */

/**
 * ⚠️ THE NARROWEST SHAPE THIS FILE NEEDS, declared here rather than imported.
 * The page owns the door; what a product depends on is that it can ask and be
 * answered — and a refusal is a VALUE carrying a sentence written for the person
 * reading it, never a rejection somebody may forget to catch.
 */
export interface Door {
  get<T>(op: string, input?: Record<string, string>): Promise<
    { ok: true; value: T } | { ok: false; problem: Problem }>;
  post<T>(op: string, input?: unknown): Promise<
    { ok: true; value: T } | { ok: false; problem: Problem }>;
}

/**
 * ⚠️ WHAT A MOUNTED SCREEN IS HANDED. `go` takes this app's OWN route — the
 * centre adds the prefix, so a product never learns where it was mounted.
 */
export interface Mounted {
  readonly app: unknown;
  readonly go: (route: string) => void;
  /** The segments past this screen's own route — what the address is about. */
  readonly at: readonly string[];
}

export interface Mounting {
  readonly register: (
    appId: string, route: string,
    screen: React.ComponentType<Mounted>,
  ) => void;
  readonly api: Door;
}

/* ------------------------------------------------------------------ reads --- */

/**
 * ⚠️ `Loaded` FROM THE FIRST RENDER, NEVER `[]`. An empty array seeded while a
 * request is in flight is a wrong answer wearing a loading state's excuse — the
 * screen draws "no notes yet" over a workspace with forty, and a FAILED load
 * draws the same thing. `waiting()` has no data to seed it with, which is what
 * makes that unwriteable rather than merely discouraged.
 */
function useAsked<T>(run: () => Promise<{ ok: true; value: T } | { ok: false; problem: Problem }>) {
  const [of, set] = React.useState<Loaded<T>>(waiting());
  const [tick, again] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    let live = true;
    set(waiting());
    void run().then((got) => {
      if (!live) return;
      set(got.ok ? ready(got.value) : trouble(got.problem));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { of, again };
}

/**
 * ⚠️ THE ROW SHAPE IS THE SCREEN'S, AND THE RECORD IS THE COLLECTION'S. A
 * generated `note.list` answers the declared columns; the screen wants a first
 * line to show and a kind it can colour. Mapping here is what keeps the screen a
 * pure function of its props — and what keeps the ground and the product drawing
 * the same component.
 */
const asShown = (row: Record<string, unknown>): Shown => ({
  id: String(row.id ?? ""),
  title: String(row.title ?? ""),
  said: String(row.body ?? "").split("\n")[0] ?? "",
  body: String(row.body ?? ""),
  /* ⚠️ THE DAY, NOT THE INSTANT. The column is headed "Written" and the row's
     foot reads "12 min · <this>", so a full ISO timestamp with milliseconds on
     it is four times the width of the thing beside it and answers a question
     nobody asked. Caught in a photograph — every suite passed it, because a
     string is a string.

     ⚠️ AND IT IS THE KERNEL'S `dayOf`, NOT A SLICE. `slice(0, 10)` is correct
     and looks arbitrary, which is how it gets copied with a different length. */
  at: row.at ? dayOf(String(row.at) as Instant) : "",
  published: row.pinned === 1 || row.pinned === true,
  pinned: row.pinned === 1 || row.pinned === true,
  kind: (["idea", "decision", "question", "record"].includes(String(row.kind))
    ? String(row.kind) : "idea") as Shown["kind"],
  happened: String(row.happened ?? ""),
  minutes: Number(row.minutes ?? 0),
  cost: Number(row.cost ?? 0),
  colour: String(row.colour ?? ""),
  link: String(row.link ?? ""),
  ask: String(row.ask ?? ""),
} as Shown);

/* ----------------------------------------------------------------- mounted --- */

/**
 * ⚠️ A SETTING IS READ WHERE IT IS DRAWN, and this is the half no handler could
 * do. `notes.density` changes how much of each row is shown, so there is nothing
 * a route could withhold — and while nothing read it, somebody could set it,
 * watch it save, and go on seeing the same list.
 *
 * ⚠️ AND THE FALLBACK IS THE KERNEL'S, NEVER A `??` HERE. A screen inventing its
 * own default is how a screen and a handler come to disagree about what somebody
 * switched on, with the declaration agreeing with neither.
 */
function useDensity(api: Door) {
  const { of } = useAsked<{ person: Record<string, { value?: unknown }> }>(
    () => api.get("setting.read"));
  const def = HELLO.settings?.["notes.density"];
  if (!def || of.status !== "ready") return undefined;
  const stored = Object.fromEntries(
    Object.entries(of.data.person ?? {}).map(([id, held]) => [id, held?.value]));
  return valueOf(def, stored) as "comfortable" | "compact";
}

const LIST = (api: Door) => function NotesHere({ go }: Mounted) {
  const { of, again } = useAsked<{ items: readonly Record<string, unknown>[] }>(
    () => api.get("note.list"));
  const density = useDensity(api);

  const rows: Loaded<readonly Shown[]> = of.status === "ready"
    ? ready(of.data.items.map(asShown))
    : of;

  return (
    <Notes
      title={(HELLO.screens ?? []).find((s) => s.route === "/")?.label}
      of={rows}
      again={again}
      density={density}
      /* ⚠️ THE ROUTE IS THIS APP'S OWN, NEVER `/hello/write`. The centre adds
         its prefix (`AppScreen.go`), so a product cannot hard-code where it was
         mounted — and the day that address changes, nothing here has to. */
      onNew={() => go("/write")}
      /* ⚠️ WHAT THE SCREEN IS ABOUT GOES IN THE ADDRESS — see `beneath`. A note
         opened into component state shares one address with the list it came
         from: nobody can link to it, a reload loses it, and the back button
         leaves the product rather than going up one level. */
      onOpen={(note) => go(`/note/${note.id}`)}
    />
  );
};

/**
 * ⚠️ THE ROUTES COME FROM THE MANIFEST, NOT FROM A LIST HERE. A second list is a
 * second answer to what screens this app has, and they drift in the direction
 * nobody notices.
 */
export function mount({ register, api }: Mounting): void {
  const declared = new Set((HELLO.screens ?? []).map((s) => s.route));
  if (declared.has("/")) {
    register(HELLO.id, "/", LIST(api));
  }
}
