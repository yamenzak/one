/**
 * ONEINVENTORY'S PRODUCT HALF — the screens a real workspace opens.
 *
 * ⚠️ SEPARATE FROM `index.tsx`, AND THE SEPARATION IS THE POINT. That file is
 * the ground: every screen over a sample world, so any of them renders with no
 * session and no database. This is the same screens with the workspace's own
 * records behind them — which is what stops a customer's bundle carrying a
 * sample world, and what stops a real screen quietly rendering one.
 *
 * ⚠️ THE SCREEN COMPONENTS ARE UNCHANGED, WHICH IS THE WHOLE CLAIM. A container
 * fetches and hands props; the screen is a function of them.
 *
 * ⚠️ AND THE JOIN IS DONE HERE RATHER THAN BY THE SERVER. `stock.list` answers
 * the balance rows — a product id, a location id and a number — and a row a
 * person can read needs the product's name and the shelf's. Three lists and a
 * lookup is the honest shape while the platform's generated `list` answers a
 * whole collection; the alternative is an operation per screen, which is a query
 * language with extra steps.
 */

import * as React from "react";
import { ready, trouble, waiting, type Loaded } from "@engine/design";
import type { Problem } from "@engine/kernel";
import { INVENTORY } from "../index.js";
import { Scan, type Seen } from "./Scan.js";
import { Stock } from "./Stock.js";
import { Thing, type Batch, type Movement } from "./Thing.js";
import { Where } from "./Where.js";
import { Start } from "./Start.js";
import type { Line, Place, Tracking } from "./sample.js";

/* ------------------------------------------------------------------ seams --- */

/**
 * ⚠️ THE NARROWEST SHAPE THIS FILE NEEDS, declared here rather than imported. A
 * product may not import OneSpace — the arrow points `apps → design → runtime →
 * kernel` — so what crosses the seam is data, and a refusal is a VALUE carrying
 * a sentence written for the person reading it.
 */
export interface Door {
  get<T>(op: string, input?: Record<string, string>): Promise<
    { ok: true; value: T } | { ok: false; problem: Problem }>;
  post<T>(op: string, input?: unknown): Promise<
    { ok: true; value: T } | { ok: false; problem: Problem }>;
}

/** What a mounted screen is handed — see `AppScreen` in OneSpace. */
export interface Mounted {
  readonly app: unknown;
  /** ⚠️ This app's OWN route. The centre adds the prefix. */
  readonly go: (route: string) => void;
  /** The segments past this screen's own route — what the address is about. */
  readonly at: readonly string[];
}

export interface Mounting {
  readonly register: (
    appId: string, route: string, screen: React.ComponentType<Mounted>,
  ) => void;
  readonly api: Door;
}

type Row = Record<string, unknown>;
type Answer<T> = { ok: true; value: T } | { ok: false; problem: Problem };

/* ------------------------------------------------------------------ reads --- */

/**
 * ⚠️ `Loaded` FROM THE FIRST RENDER, NEVER `[]`. An empty array seeded while a
 * request is in flight is a wrong answer wearing a loading state's excuse — the
 * screen draws "nothing counted yet" over a workspace with four hundred lines,
 * and a FAILED load draws the same thing. `waiting()` has no data to seed it
 * with, which is what makes that unwriteable rather than discouraged.
 */
function useAsked<T>(run: () => Promise<Answer<T>>, on: readonly unknown[] = []) {
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
  }, [tick, ...on]);

  return { of, again };
}

/**
 * EVERYTHING THIS PRODUCT'S SCREENS ARE MADE OF — three lists, once.
 *
 * ⚠️ ASKED TOGETHER RATHER THAN IN SEQUENCE. A shelf's name is needed to draw
 * the first row of the stock list, so chaining the two would put a second round
 * trip in front of every screen — and a screen that waits twice on a warehouse
 * phone waits about a second.
 *
 * DEFER(engine-62) stage:62 — the generated `list` answers the fifty most recent
 * rows of a whole collection: no filter, no cursor, no count. A workspace with
 * two hundred products can only ever see fifty of them, and nothing says so.
 * Narrowing to a location and paging past the first page are both that stage.
 */
function useWorld(api: Door) {
  const stock = useAsked<{ items: readonly Row[] }>(() => api.get("stock.list"));
  const places = useAsked<{ items: readonly Row[] }>(() => api.get("location.list"));
  const kinds = useAsked<{ items: readonly Row[] }>(() => api.get("product.list"));

  const again = React.useCallback(() => {
    stock.again(); places.again(); kinds.again();
  }, [stock, places, kinds]);

  return { stock: stock.of, places: places.of, kinds: kinds.of, again };
}

/* ------------------------------------------------------------- the shapes --- */

const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/**
 * ⚠️ THE DEVICE'S OWN CALENDAR DAY, AND IT IS THE ONE PLACE THIS APP READS A
 * CLOCK. Everything downstream takes a `Day` — a shelf life is counted where the
 * shelf is — so the reading happens here, once, rather than in four containers
 * that would each pick a different way of truncating it.
 */
const dayHere = (): string => {
  const at = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

const TRACKING: readonly Tracking[] = ["listed", "counted", "batched", "itemised", "assembled"];
const trackingOf = (v: unknown): Tracking =>
  TRACKING.includes(v as Tracking) ? (v as Tracking) : "counted";

/**
 * ⚠️ A PLACE'S LINE COUNT IS DERIVED, INCLUDING WHAT IS BELOW IT. A tree row
 * offering "41 lines" that turns out to mean only what is directly on the rack —
 * with every shelf under it excluded — is a number that disagrees with the
 * screen it opens.
 */
function placesOf(rows: readonly Row[], stock: readonly Row[]): readonly Place[] {
  const here = new Map<string, number>();
  for (const line of stock) {
    const at = text(line.location);
    here.set(at, (here.get(at) ?? 0) + 1);
  }

  const of = new Map<string, string | null>();
  for (const row of rows) of.set(text(row.id), text(row.within) || null);

  /* Bounded by the row count: a parent pointer written in a circle must not hang
     the screen it is drawn on. */
  const total = new Map<string, number>(here);
  for (const [id] of of) {
    let walk = of.get(id) ?? null;
    for (let step = 0; step < rows.length && walk; step++) {
      total.set(walk, (total.get(walk) ?? 0) + (here.get(id) ?? 0));
      walk = of.get(walk) ?? null;
    }
  }

  return rows.map((row): Place => ({
    id: text(row.id),
    name: text(row.name),
    of: text(row.within) || null,
    kind: text(row.kind) || "shelf",
    lines: total.get(text(row.id)) ?? 0,
    ...(text(row.code) ? { code: text(row.code) } : {}),
  }));
}

function linesOf(
  rows: readonly Row[], places: readonly Place[], kinds: readonly Row[],
): readonly Line[] {
  const named = new Map(places.map((p) => [p.id, p.name]));
  const kind = new Map(kinds.map((k) => [text(k.id), k]));

  return rows.map((row): Line => {
    const of = kind.get(text(row.product));
    return {
      id: text(row.id),
      product: text(row.product),
      /* ⚠️ A LINE WHOSE PRODUCT IS MISSING IS STILL A LINE. It should not
         happen; if it does, "—" beside a real number is honest, and dropping the
         row silently changes a total nobody can then explain. */
      name: of ? text(of.name) : "—",
      brand: of ? text(of.brand) : "",
      where: text(row.location),
      whereName: named.get(text(row.location)) ?? "—",
      quantity: num(row.quantity),
      unit: of ? text(of.unit) || "item" : "item",
      ...(of && of.par !== null && of.par !== undefined ? { par: num(of.par) } : {}),
      tracking: trackingOf(of?.tracking),
      seen: text(row.seen) || text(row.at),
    };
  });
}

const movesOf = (rows: readonly Row[], places: readonly Place[]): readonly Movement[] => {
  const named = new Map(places.map((p) => [p.id, p.name]));
  return rows.map((row): Movement => ({
    id: text(row.id),
    move: (["received", "taken", "adjusted"].includes(text(row.move))
      ? text(row.move) : "adjusted") as Movement["move"],
    delta: num(row.delta),
    at: text(row.at),
    /* ⚠️ AN ACCOUNT ID IS NOT A NAME, and this is the honest state of it. The
       roster is the platform's and a movement carries only who wrote it; until a
       lookup is wired, saying nothing beats printing an identifier at somebody. */
    who: "",
    where: named.get(text(row.location)) ?? "",
    ...(text(row.reason) ? { reason: text(row.reason) } : {}),
    capture: text(row.capture),
  }));
};

/** ⚠️ Everything at or below a place — what a tree row promises when it narrows. */
const under = (places: readonly Place[], here: string | null): ReadonlySet<string> => {
  const held = new Set<string>();
  if (!here) return held;
  held.add(here);
  for (let pass = 0; pass < places.length; pass++) {
    for (const p of places) if (p.of && held.has(p.of)) held.add(p.id);
  }
  return held;
};

/* ---------------------------------------------------------------- mounted --- */

const nameOf = (route: string) =>
  (INVENTORY.screens ?? []).find((s) => s.route === route)?.label;

/** ⚠️ Two loaded values into one, so a screen waits once and fails once. */
function both<A, B, C>(a: Loaded<A>, b: Loaded<B>, join: (a: A, b: B) => C): Loaded<C> {
  if (a.status === "trouble") return a;
  if (b.status === "trouble") return b;
  if (a.status !== "ready" || b.status !== "ready") return waiting();
  return ready(join(a.data, b.data));
}

const STOCK = (api: Door) => function StockHere({ go }: Mounted) {
  const world = useWorld(api);
  /* ⚠️ WHERE THE READER IS IN THE TREE, HELD HERE. It is not in the address on
     purpose: narrowing a list is a filter rather than a destination, and putting
     it in the path would make the back button undo a filter one step at a time
     before it left the screen. */
  const [here, setHere] = React.useState<string | null>(null);

  const places = world.places.status === "ready" && world.stock.status === "ready"
    ? placesOf(world.places.data.items, world.stock.data.items)
    : [];

  const reach = under(places, here);
  const rows = both(world.stock, world.kinds, (stock, kinds) => {
    const all = linesOf(stock.items, places, kinds.items);
    return here ? all.filter((l) => reach.has(l.where)) : all;
  });

  return (
    <Stock
      title={nameOf("/")}
      of={rows}
      places={places}
      here={here}
      again={world.again}
      onGo={setHere}
      onOpen={(line) => go(`/thing/${line.id}`)}
      /* ⚠️ NOT WIRED YET, AND SAYING SO IS THE HONEST STATE. Putting stock on a
         shelf is its own screen with a scanner in it (OI-6); a button that
         silently does nothing is the defect this file exists to avoid. */
      onAdd={() => undefined}
    />
  );
};

const THING = (api: Door) => function ThingHere({ go, at }: Mounted) {
  const id = at[0] ?? "";
  const world = useWorld(api);
  /*
    ⚠️ THE DEVICE'S OWN DAY, SENT WITH THE ASK. A shelf life is counted in local
    days: the server has no way to know what day it is where somebody is
    standing, and its own calendar would call a box expired the evening before
    it is — or, west of Greenwich, current for another few hours after it is not.
  */
  const today = dayHere();
  const dated = useAsked<{ items: readonly Row[] }>(
    () => api.get("batch.due", { product: id, today }), [id, today]);
  /* ⚠️ THE WHOLE HISTORY, FILTERED HERE — see the DEFER above. The generated
     list cannot be asked for one product's movements. */
  const history = useAsked<{ items: readonly Row[] }>(() => api.get("ledger.list"));

  const places = world.places.status === "ready" && world.stock.status === "ready"
    ? placesOf(world.places.data.items, world.stock.data.items)
    : [];

  const line = both(world.stock, world.kinds, (stock, kinds) =>
    linesOf(stock.items, places, kinds.items).find((l) => l.id === id));

  /* ⚠️ THE MOVEMENTS OF THIS PRODUCT, WHEREVER THEY HAPPENED — not of this
     LINE. A line is a product on one shelf; a correction made after somebody
     moved a pallet from A1 to B2 belongs to the product's history, and filtering
     by shelf would hide the half of the story that explains the number. */
  const of = line.status === "ready" ? line.data?.product ?? "" : "";
  const moves: Loaded<readonly Movement[]> = both(history.of, line, (held) =>
    movesOf(held.items.filter((r) => text(r.product) === of), places));

  /* ⚠️ A LINE THAT IS NOT THERE IS NOT AN EMPTY SCREEN. An address that names a
     record this workspace does not have is the platform's own refusal, and
     drawing a blank product would make a wrong link look like a new product. */
  if (line.status === "ready" && !line.data) {
    return (
      <Stock
        title={nameOf("/")}
        of={ready([])}
        places={places}
        here={null}
        again={world.again}
        onGo={() => undefined}
        onOpen={() => undefined}
        onAdd={() => undefined}
      />
    );
  }

  /* ⚠️ THE ARITHMETIC IS ALREADY DONE — see `batch.due`. The screen renders what
     it was told rather than working out which clock won, because the threshold
     for "soon" is a setting a person on the floor cannot read. */
  const batches: readonly Batch[] = dated.of.status === "ready"
    ? dated.of.data.items.map((row): Batch => ({
      id: text(row.id),
      lot: text(row.lot),
      on: text(row.on),
      by: text(row.by),
      standing: text(row.standing),
      days: num(row.days),
      opened: text(row.by) === "opened",
    }))
    : [];

  return (
    <Thing
      line={line.status === "ready" && line.data ? line.data : EMPTY_LINE}
      history={moves}
      batches={batches}
      again={() => { world.again(); history.again(); dated.again(); }}
      back={() => go("/")}
      /* ⚠️ NOT WIRED YET, AND SAYING SO IS THE HONEST STATE. Taking stock is its
         own screen with a quantity and a place in it (OI-6). */
      onTake={() => undefined}
      onOpen={(batch) => {
        void api.post("batch.open", { batch, day: today }).then((got) => {
          /* ⚠️ RE-READ RATHER THAN PATCHED. Opening moves the clock, and the
             clock is what the row is about — so what comes back is the new
             answer rather than this screen's guess at it. */
          if (got.ok) dated.again();
        });
      }}
    />
  );
};

/**
 * ⚠️ WHAT A SCREEN DRAWS WHILE ITS SUBJECT IS STILL ARRIVING. `Thing` takes a
 * line rather than a `Loaded<Line>` because its heading is the product's name —
 * and a heading that flickers from a placeholder to the real name is worse than
 * one that arrives once. The screen's own `of` carries the waiting state.
 */
const EMPTY_LINE: Line = {
  id: "", product: "", name: "", where: "", whereName: "",
  quantity: 0, unit: "", tracking: "counted", seen: "",
};

const WHERE = (api: Door) => function WhereHere({ go, at }: Mounted) {
  const id = at[0] ?? "";
  const world = useWorld(api);

  const places = world.places.status === "ready" && world.stock.status === "ready"
    ? placesOf(world.places.data.items, world.stock.data.items)
    : [];
  /* ⚠️ AN ID OR ONE OF OUR OWN LABELS. A printed shelf label is what the camera
     reads, and it is the only address a person standing in front of a rack has —
     so the screen resolves either rather than making the scanner look a row id
     up first. */
  const place = places.find((p) => p.id === id || p.code === id);

  const rows = both(world.stock, world.kinds, (stock, kinds) =>
    linesOf(stock.items, places, kinds.items).filter((l) => l.where === id));

  return (
    <Where
      place={place ?? { id, name: "—", of: null, kind: "shelf", lines: 0 }}
      places={places}
      of={rows}
      again={world.again}
      back={() => go("/")}
      onGo={(to) => go(to ? `/where/${to}` : "/")}
      onOpen={(line) => go(`/thing/${line.id}`)}
      onLabel={() => undefined}
      onCopy={(value) => { void navigator.clipboard?.writeText(value); }}
    />
  );
};

/**
 * SCANNING — the one screen that both reads and writes on the same gesture.
 *
 * ⚠️ THE RESOLVE IS NOT `useAsked`, AND THAT IS THE WHOLE DIFFERENCE. Every other
 * container here fetches when it mounts; this one fetches when somebody points a
 * camera at something, so what holds the answer is the last read rather than a
 * dependency. Wired as an effect it would re-run on every render and re-resolve
 * a code nobody scanned again.
 *
 * ⚠️ AND THE YEAR GOES WITH THE CODE. A six-digit expiry has its century
 * inferred from a window around now — the DEVICE's now, for the same reason a
 * shelf life is counted in local days.
 */
const SCAN = (api: Door) => function ScanHere({ go }: Mounted) {
  const [of, set] = React.useState<Loaded<Seen | null>>(ready(null));
  const [last, setLast] = React.useState("");
  const kinds = useAsked<{ items: readonly Row[] }>(() => api.get("product.list"));

  const resolve = React.useCallback((raw: string) => {
    setLast(raw);
    set(waiting());
    void api.get<Seen>("code.resolve", {
      raw,
      /* ⚠️ A STRING, BECAUSE THE READ DOOR TAKES A QUERY. The platform coerces
         it against the declared number; sending it as one would be a second
         encoding of the same value. */
      year: String(new Date().getFullYear()),
    }).then((got) => { set(got.ok ? ready(got.value) : trouble(got.problem)); });
  }, [api]);

  const learn = React.useCallback((product: string) => {
    void api.post<{ value: string }>("code.learn", {
      raw: last, year: new Date().getFullYear(), product, source: "scanned",
    }).then((got) => {
      /* ⚠️ RE-RESOLVED RATHER THAN PATCHED IN PLACE. The screen then shows what
         the NEXT scan of this code will show, which is the thing somebody is
         actually checking when they attach one. */
      if (got.ok) resolve(last);
      else set(trouble(got.problem));
    });
  }, [api, last, resolve]);

  const products = kinds.of.status === "ready"
    ? kinds.of.data.items.map((row) => ({ id: text(row.id), label: text(row.name) }))
    : [];

  return (
    <Scan
      title={nameOf("/scan")}
      of={of}
      products={products}
      onRead={resolve}
      onOpen={(product) => go(`/thing/${product}`)}
      /* ⚠️ THE LABEL'S OWN CODE, NOT A ROW ID. The place screen resolves it —
         which is what makes a printed shelf label work on a device that has
         never seen this workspace's location table. */
      onPlace={(code) => go(`/where/${code}`)}
      onLearn={learn}
      again={() => { if (last) resolve(last); }}
    />
  );
};

/**
 * ⚠️ THE GUIDE IS TICKED BY EVENTS THIS WORKSPACE HAS ACTUALLY RAISED, and until
 * the platform answers that question the honest state is nothing crossed off —
 * never a step ticked because a screen guessed.
 *
 * DEFER(engine-63) stage:63 — `guide` and `milestones` are declared per app and
 * rendered from the manifest, but no operation answers "which of these events
 * has this workspace raised, and how many times". Every workspace therefore sees
 * three unticked steps for ever, including one that has done all three.
 */
const START = () => function StartHere({ app, go }: Mounted) {
  /* ⚠️ WHAT THIS PERSON HOLDS COMES WITH THE PRODUCT, NOT FROM A SECOND
     REQUEST. The centre already resolved it to draw the nav; narrowing `app`
     here is the seam working as designed — what crosses it is data, and the
     narrowing is the app's, right where it uses one. */
  const held = (app as { readonly permissions?: readonly string[] }).permissions ?? [];

  return (
    <Start title={nameOf("/start")} done={[]} counts={{}} held={new Set(held)} onGo={go} />
  );
};

/**
 * ⚠️ THE ROUTES COME FROM THE MANIFEST, NOT FROM A LIST HERE. A second list is a
 * second answer to what screens this app has, and they drift in the direction
 * nobody notices — a screen declared and never drawn renders a notice, which
 * reads as unfinished rather than as a mistake.
 */
export function mount({ register, api }: Mounting): void {
  const declared = new Set((INVENTORY.screens ?? []).map((s) => s.route));
  const screens: readonly [string, React.ComponentType<Mounted>][] = [
    ["/", STOCK(api)],
    ["/thing", THING(api)],
    ["/where", WHERE(api)],
    ["/scan", SCAN(api)],
    ["/start", START()],
  ];
  for (const [route, screen] of screens) {
    if (declared.has(route)) register(INVENTORY.id, route, screen);
  }
}
