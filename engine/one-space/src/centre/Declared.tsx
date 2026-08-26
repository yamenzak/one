/**
 * A SCREEN AN APP DECLARED, FETCHED AND DRAWN — no file in the product.
 *
 * ⚠️ THIS IS THE HALF THAT MAKES THE DECLARED SURFACE REACHABLE. The kernel
 * refuses a body that does not compose, the runtime answers `/api/screen/<id>`
 * with the record and every view the body reads, and `Body` draws it — and
 * between the last two there was nothing, so a perfectly declared screen was a
 * manifest entry a person could not open.
 *
 * ⚠️ ONE ROUND TRIP, MANY REGIONS. The door answers a screen's views TOGETHER,
 * so the wire is one request; what each block waits on is still its own view,
 * because `Has.views` is a map of outcomes and `Region` reads them one at a
 * time. A heading and a note are never held behind the slowest list on the page.
 *
 * ⚠️ AND A DECLARED BODY OUTRANKS A MOUNTED COMPONENT — see `AppSurface`. That
 * order is what makes a port a deletion: a screen gains a `body`, the file that
 * drew it stops being reached, and the day it is removed nothing changes.
 */

import * as React from "react";
import { ready, trouble, waiting, type Loaded } from "@engine/design";
import { Doing, asks, type Ran } from "@engine/design/doing";
/* ⚠️ NOT THROUGH THE BARREL, WHICH IS THE RENDERER'S OWN RULE. `@engine/design`
   re-exports thirty components; the entry chunk carries the contract and this
   page is in the product's, so the deep path is what keeps the two apart. */
import { Body, type Has } from "@engine/design/body";
/* ⚠️ THE PATH AND THE ANSWER SHAPE COME FROM THE KERNEL, NOT THE RUNTIME. The
   runtime is the worker's and importing it here would put a D1 client in a
   browser bundle — so what both ends need is declared once, in the layer both
   are allowed to reach. */
import {
  SCREEN_PATH, fillOf, viewsIn, type Fields, type Fill, type ScreenSpec, type Viewed,
} from "@engine/kernel";
import { api, forget } from "../api.js";
import { useLoad } from "./data.js";

/** What the door answers. */
interface Drawn {
  readonly record: Readonly<Record<string, unknown>> | null;
  readonly views: Readonly<Record<string, Viewed>>;
  /** ⚠️ What each narrowing offers — see `Drawn.picks`. */
  readonly picks: Readonly<Record<string, readonly { id: string; label: string }[]>>;
  /** ⚠️ The acts this body offers, with their input — see `Drawn.acts`. */
  readonly acts: Readonly<Record<string, {
    summary: string; input: Fields; fills?: Readonly<Record<string, Fill>>;
    /** ⚠️ What a `ref` input may be — see `Act.choices`. */
    choices?: Readonly<Record<string, readonly { id: string; label: string }[]>>;
  }>>;
}

/**
 * ⚠️ THE DEVICE'S OWN CALENDAR DAY, AND IT IS READ HERE RATHER THAN SENT. A
 * shelf life is counted where the shelf is: the worker has no way to know what
 * day it is where somebody is standing, and its own calendar would call a box
 * expired the evening before it is — or, west of Greenwich, current for a few
 * more hours after it is not.
 */
const today = (): string => {
  const at = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

/**
 * ⚠️ AN ABSENT VIEW IS EMPTY, NOT MISSING. The door runs only the views a body
 * reads, and it may legitimately answer without one — a view over a collection
 * whose rows were all erased. `undefined` there would make `Region` wait for
 * something already answered, so the screen keeps a skeleton for ever.
 */
const NOTHING: Viewed = { items: [], count: 0 };

const spread = (
  ids: readonly string[], got: Loaded<Drawn>,
): Readonly<Record<string, Loaded<Viewed>>> => Object.fromEntries(ids.map((id) => [
  id,
  got.status === "ready" ? ready(got.data.views[id] ?? NOTHING)
    : got.status === "trouble" ? trouble(got.problem)
      : waiting<Viewed>(),
]));

export function Declared({ screen, screens, at, go, currency }: {
  readonly screen: ScreenSpec;
  /**
   * ⚠️ EVERY SCREEN THIS PRODUCT DECLARES, because `goes` names one by ID and an
   * address is what a browser needs. Turning the id into a route here is what
   * keeps a route out of the manifest: one written there would be a second
   * spelling of an address the manifest already holds, and the two drift the
   * first time a screen moves.
   */
  readonly screens: readonly ScreenSpec[];
  /**
   * ⚠️ THE SEGMENTS PAST THE SCREEN'S OWN ROUTE — see `AppScreen.at`. The first
   * is the record this screen is about, which is what makes a detail screen
   * linkable and reloadable rather than a state somebody navigated into.
   */
  readonly at: readonly string[];
  readonly go: (route: string) => void;
  readonly currency?: string | undefined;
}) {
  /*
    ⚠️ WHICH OPERATION IS BEING ASKED ABOUT, and `null` for none. An operation
    that takes nothing never lands here — it runs on the press, because a sheet
    holding one button to confirm a press somebody already made is a second press
    for nothing.
  */
  const [asking, setAsking] = React.useState<string | null>(null);
  /*
    ⚠️ WHAT SOMEBODY NARROWED THIS SCREEN TO, HELD HERE AND SENT WITH THE READ —
    see `PickSpec`. It is not in the address on purpose: narrowing a list is a
    filter rather than a destination, and putting it in the path would make the
    back gesture undo a filter one step at a time before it left the screen.

    ⚠️ AND CHANGING IT IS A REFETCH, WHICH IS THE WHOLE POINT. The narrowing
    reaches an asked view's input on the worker; held in the browser it would
    move a control and leave the figures under it exactly where they were.
  */
  const [picked, setPicked] = React.useState<Readonly<Record<string, string>>>({});
  const record = at[0];
  /* ⚠️ SENT WITH EVERY SCREEN, NOT ONLY THE ONES THAT ASK. Which views a body
     reads is the manifest's business and the browser does not open it to find
     out; one extra query parameter is cheaper than a second round trip on the
     screens where it turns out to matter, and the value is a constant string per
     day, so it changes nothing about caching within one. */
  const got = useLoad<Drawn>(
    `${SCREEN_PATH}/${screen.id}`,
    {
      today: today(),
      ...(record ? { record } : {}),
      /* ⚠️ PREFIXED, so a pick can never take over `record` or `today` — see the
         door. A product declaring one called `today` would otherwise silently
         replace the device's own calendar day. */
      ...Object.fromEntries(Object.entries(picked)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => [`pick.${k}`, v])),
    },
  );

  /* ⚠️ FROM THE BODY, NOT FROM THE ANSWER. Reading the ids off `views` would
     mean a view the door has not answered yet has no key at all — so the block
     bound to it reads `undefined`, `Region` never waits, and an unfetched list
     draws as an empty one for the length of the request. */
  const body = screen.body;
  const ids = React.useMemo(() => (body ? viewsIn(body) : []), [body]);
  /**
   * ⚠️ THE WRITE HAPPENS HERE AND THE RE-READ IS PART OF IT. A screen that ran an
   * operation and did not ask again shows what was true a moment before the
   * thing somebody just did — which is the one moment they are certain it should
   * have changed. `forget` clears the answers the write made untrue elsewhere;
   * `again` is this screen asking for its own.
   */
  const run = React.useCallback(async (id: string, input: Record<string, unknown>): Promise<Ran> => {
    const said = await api.post(id, input);
    if (!said.ok) return said.problem;
    forget();
    got.again();
    return null;
  }, [got]);

  /*
    ⚠️ AN OPERATION THAT TAKES NOTHING RUNS ON THE PRESS — see `asks`. And one
    this app does not declare does nothing at all rather than throwing: the
    kernel refuses a `does` naming an unknown operation at composition, so
    reaching here means a manifest that never composed.
  */
  const acts = got.of.status === "ready" ? got.of.data.acts : {};

  /**
   * ⚠️ WHAT THE SCREEN SUPPLIES, RESOLVED ONCE PER ACT — see `Fill`. The person
   * is never asked for either of these: the record is the thing they opened, and
   * the day is the one they are standing in. Filling them at the seam rather
   * than inside the form is what makes `asks` able to say "nothing left to ask"
   * and run the act on the press.
   */
  const held = got.of.status === "ready" ? got.of.data.record : null;
  const filled = React.useCallback((id: string): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [name, from] of Object.entries(acts[id]?.fills ?? {})) {
      const source = fillOf(from);
      /* ⚠️ A FILL WITH NOTHING BEHIND IT IS LEFT OUT RATHER THAN SENT EMPTY. A
         detail screen whose address has not resolved has no record, and an empty
         string in a required field is a refusal that says the field is missing
         when the truth is that the screen is not ready. */
      if (source.of === "record" && record) out[name] = record;
      if (source.of === "today") out[name] = today();
      /* ⚠️ A COLUMN ON THE RECORD, WHICH IS NOT THE RECORD'S ID — see `Fill`.
         Carrying stock takes the product and the shelf, and a stock line holds
         both; with only the id the form asked a person to type two identifiers
         they were looking at. */
      if (source.of === "field") {
        const value = held?.[source.field];
        if (value !== undefined && value !== null && value !== "") out[name] = value;
      }
      /* ⚠️ A CONSTANT THE SCREEN SUPPLIES, and it is a literal from the manifest
         rather than a value from anywhere a caller could reach. */
      if (source.of === "says") out[name] = source.says;
    }
    return out;
  }, [acts, record, held]);

  const onDo = React.useCallback((id: string) => {
    const spec = acts[id];
    if (!spec) return;
    const already = filled(id);
    if (asks(spec.input, already)) { setAsking(id); return; }
    void run(id, already);
  }, [acts, filled, run]);

  /**
   * ⚠️ THE ID BECOMES AN ADDRESS HERE, AND THE RECORD GOES WITH IT. `goes` names
   * a screen the kernel has already checked exists; handing that string to a
   * router expecting a route opened `/location` in a product whose route is
   * `/where`, so every row on a declared list led to the app's own not-found.
   *
   * ⚠️ AND A SCREEN THIS PRODUCT DOES NOT DECLARE LEADS NOWHERE RATHER THAN
   * ANYWHERE. `refuseSurface` refuses a `goes` naming an unknown screen at
   * composition, so reaching here means a manifest that never composed —
   * navigating to a guess would be worse than the dead row it replaces.
   */
  const onGo = React.useCallback((id: string, record?: string) => {
    const to = screens.find((s) => s.id === id)?.route;
    if (!to) return;
    go(record ? `${to.replace(/\/$/, "")}/${record}` : to);
  }, [screens, go]);

  const has: Has = React.useMemo(() => ({
    ...(got.of.status === "ready" && got.of.data.record
      ? { record: got.of.data.record }
      : {}),
    views: spread(ids, got.of),
    onGo: onGo,
    onDo,
    picked,
    onPick: (id: string, value: string) =>
      setPicked((was) => ({ ...was, [id]: value })),
    ...(got.of.status === "ready" ? { picks: got.of.data.picks } : {}),
    ...(currency ? { currency } : {}),
  }), [got.of, ids, onGo, onDo, currency, picked]);

  if (!body) return null;
  return (
    <>
      <Body body={body} has={has} />
      {asking && acts[asking] ? (
        <Doing
          id={asking}
          summary={acts[asking]!.summary}
          input={acts[asking]!.input}
          fills={filled(asking)}
          {...(acts[asking]!.choices ? { choices: acts[asking]!.choices } : {})}
          open
          onOpen={(next: boolean) => { if (!next) setAsking(null); }}
          /* ⚠️ THE FILLS LAST, so a field the screen supplies cannot be
             overwritten by a draft — `Doing` does not draw them, and a stale key
             left in the draft from an earlier open would otherwise win. */
          run={(input: Record<string, unknown>) => run(asking, { ...input, ...filled(asking) })}
        />
      ) : null}
    </>
  );
}
