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
import { SCREEN_PATH, viewsIn, type Fields, type ScreenSpec, type Viewed } from "@engine/kernel";
import { api, forget } from "../api.js";
import { useLoad } from "./data.js";

/** What the door answers. */
interface Drawn {
  readonly record: Readonly<Record<string, unknown>> | null;
  readonly views: Readonly<Record<string, Viewed>>;
  /** ⚠️ The acts this body offers, with their input — see `Drawn.acts`. */
  readonly acts: Readonly<Record<string, { summary: string; input: Fields }>>;
}

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

export function Declared({ screen, at, go, currency }: {
  readonly screen: ScreenSpec;
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
  const record = at[0];
  const got = useLoad<Drawn>(
    `${SCREEN_PATH}/${screen.id}`,
    record ? { record } : undefined,
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
  const onDo = React.useCallback((id: string) => {
    const spec = acts[id];
    if (!spec) return;
    if (asks(spec.input)) { setAsking(id); return; }
    void run(id, {});
  }, [acts, run]);

  const has: Has = React.useMemo(() => ({
    ...(got.of.status === "ready" && got.of.data.record
      ? { record: got.of.data.record }
      : {}),
    views: spread(ids, got.of),
    onGo: go,
    onDo,
    ...(currency ? { currency } : {}),
  }), [got.of, ids, go, onDo, currency]);

  if (!body) return null;
  return (
    <>
      <Body body={body} has={has} />
      {asking && acts[asking] ? (
        <Doing
          id={asking}
          summary={acts[asking]!.summary}
          input={acts[asking]!.input}
          open
          onOpen={(next: boolean) => { if (!next) setAsking(null); }}
          run={(input: Record<string, unknown>) => run(asking, input)}
        />
      ) : null}
    </>
  );
}
