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
import { dayPlus, type Day, type Problem } from "@engine/kernel";
import { INVENTORY } from "../index.js";
import { hazardsIn, signalIn } from "../hazard.js";
import { coverage, stuttering } from "../count.js";
import { Count, type Change, type Counted, type Uncovered } from "./Count.js";
import { Item, SAID, type Kept } from "./Item.js";
import { Kit, KIT_SAID, type Member, type Missing } from "./Kit.js";
import { Receive, keyOf, type Noted } from "./Receive.js";
import { Ask, type Answer } from "./Ask.js";
import { Case, type Used } from "./Case.js";
import { Run, type Covered } from "./Run.js";
import { Work, type Jobs, type Runs } from "./Work.js";
import { Scan, type Guess, type Seen } from "./Scan.js";
import { Stock } from "./Stock.js";
import { Due, type Dated } from "./Due.js";
import { Labels, type Labelled, type Subject, type Template } from "./Labels.js";
import { Reports, type Reported, type Span } from "./Reports.js";
import { Thing, type Batch, type Movement, type Piece } from "./Thing.js";
import { Where } from "./Where.js";
import { Start } from "./Start.js";
/* ⚠️ `Seen` IS TAKEN BY THE SCAN SCREEN, so the import's is renamed at the door.
   Two meanings of one word in one file is a rename waiting to pick the wrong
   one — the same reason `Got` is not called `Answer` above. */
import { Import, MAPPABLE, type Done, type Seen as Seeing } from "./Import.js";
import { NOBODY, Suppliers, type Supplier as SupplierLine } from "./Suppliers.js";
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
/* ⚠️ `Got` RATHER THAN `Answer`, because `Answer` is what the Ask screen calls
   the thing a model said. Two meanings of one word in one file is a rename
   waiting to pick the wrong one. */
type Got<T> = { ok: true; value: T } | { ok: false; problem: Problem };

/* ------------------------------------------------------------------ reads --- */

/**
 * ⚠️ `Loaded` FROM THE FIRST RENDER, NEVER `[]`. An empty array seeded while a
 * request is in flight is a wrong answer wearing a loading state's excuse — the
 * screen draws "nothing counted yet" over a workspace with four hundred lines,
 * and a FAILED load draws the same thing. `waiting()` has no data to seed it
 * with, which is what makes that unwriteable rather than discouraged.
 */
function useAsked<T>(run: () => Promise<Got<T>>, on: readonly unknown[] = []) {
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
 * ⚠️ THE SHELF PAGES AND THE OTHER TWO DO NOT, AND THAT IS A DECISION. A
 * workspace has thousands of stock lines and tens of places; the tree has to be
 * whole to be drawn at all, and the catalogue is read to turn a product id into
 * a name on a row. Both are bounded by what a plan sells, and the shelf is the
 * one that is not.
 */
/**
 * A LIST THAT KNOWS IT IS A PAGE.
 *
 * ⚠️ THE ROWS ACCUMULATE AND THE TOTAL DOES NOT. Asking for the next page
 * REPLACING what is on screen is a list that scrolls backwards; asking for it
 * and adding to the count is a total that grows as somebody reads. What is
 * accumulated is the rows; `total` is the collection's, answered fresh by every
 * page and identical on all of them.
 *
 * ⚠️ AND A NARROWING RESETS THE WALK. A cursor is a position in one ordering of
 * one filter — carried across a change of filter it points into a list that no
 * longer exists, and the second page comes back empty. `on` is the effect's
 * dependency AND the reset, which is what stops those two drifting apart.
 */
interface Page { readonly items: readonly Row[]; readonly total: number; readonly next: string | null }

function usePaged(run: (after: string | null) => Promise<Got<Page>>, on: readonly unknown[] = []) {
  const [of, set] = React.useState<Loaded<readonly Row[]>>(waiting());
  const [total, setTotal] = React.useState(0);
  const [next, setNext] = React.useState<string | null>(null);
  const [tick, again] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    let live = true;
    set(waiting());
    setNext(null);
    void run(null).then((got) => {
      if (!live) return;
      if (!got.ok) { set(trouble(got.problem)); return; }
      set(ready(got.value.items));
      setTotal(got.value.total);
      setNext(got.value.next);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...on]);

  /* ⚠️ ADDED TO WHAT IS THERE, and only while the page it was asked for is
     still the one on screen — a `more` that landed after a refresh would splice
     yesterday's rows into today's list. */
  const more = React.useCallback(() => {
    if (!next) return;
    const asked = next;
    void run(asked).then((got) => {
      if (!got.ok) return;
      set((was) => (was.status === "ready" ? ready([...was.data, ...got.value.items]) : was));
      setTotal(got.value.total);
      setNext((now) => (now === asked ? got.value.next : now));
    });
  }, [next, run]);

  return { of, total, more: next !== null, onMore: more, again };
}

function useWorld(api: Door) {
  /* ⚠️ THE SHELF IS THE ONE LIST THAT PAGES, because it is the one a workspace
     has thousands of rows in. The tree and the catalogue are read whole to draw
     the nav and to name a line, and both are bounded by what a plan sells. */
  const stock = usePaged((after) => api.get<Page>("stock.list",
    after ? { after } : {}));
  const places = useAsked<{ items: readonly Row[] }>(() => api.get("location.list"));
  const kinds = useAsked<{ items: readonly Row[] }>(() => api.get("product.list"));

  const again = React.useCallback(() => {
    stock.again(); places.again(); kinds.again();
  }, [stock, places, kinds]);

  return {
    stock: stock.of.status === "ready"
      ? ready({ items: stock.of.data })
      : stock.of as Loaded<{ items: readonly Row[] }>,
    lines: stock.total,
    more: stock.more,
    onMore: stock.onMore,
    places: places.of,
    kinds: kinds.of,
    again,
  };
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

/* ⚠️ NARROWED RATHER THAN CAST, LIKE EVERY OTHER ANSWER CROSSING THIS SEAM. An
   unrecognised standing draws as `fine`, which is the honest reading of a value
   this build does not know — inventing a warning would put an alarm on a screen
   over a string nobody can explain. */
const standingIn = (v: unknown): Dated["standing"] =>
  v === "gone" || v === "soon" ? v : "fine";

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

/**
 * ⚠️ A LINE ID OR A PRODUCT ID, BECAUSE BOTH ARE LINKED FROM. A row on the stock
 * list is one product on one shelf and carries a line id; every OTHER screen
 * that points here — the ledger, a job's trace, what runs out — knows the
 * product and nothing about which shelf. Resolving only the first made those
 * links land on the platform's not-found refusal, which reads as a deleted
 * record rather than as a link built out of the wrong id.
 *
 * ⚠️ AND THE BIGGEST LINE WINS WHERE A PRODUCT IS ON SEVERAL SHELVES. Any choice
 * is arbitrary and this one is at least stable and explicable: it is the shelf
 * somebody means when they say "have we got any".
 */
const pick = (lines: readonly Line[], id: string): Line | undefined =>
  lines.find((l) => l.id === id)
  ?? [...lines.filter((l) => l.product === id)].sort((a, b) => b.quantity - a.quantity)[0];

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
      /* ⚠️ THE COLLECTION'S OWN COUNT, NOT THE PAGE'S. `rows.length` is what is
         drawn; `lines` is what there is, and the gap between them is the whole
         reason the screen can say so. */
      total={world.lines}
      /* ⚠️ AND NOT WHILE THE READER HAS NARROWED. The count and the cursor are
         both about the unfiltered list; offering another page under a filter
         would append rows the filter then hides. */
      more={world.more && here === null}
      onMore={world.onMore}
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
  /* ⚠️ ASKED FOR EVERY PRODUCT AND USED BY TWO RUNGS, for the same reason. Which
     of them this product has is decided below, from its own rung. */
  const items = useAsked<{ items: readonly Row[] }>(() => api.get("unit.list"));
  const kits = useAsked<{ items: readonly Row[] }>(() => api.get("kit.list"));

  const places = world.places.status === "ready" && world.stock.status === "ready"
    ? placesOf(world.places.data.items, world.stock.data.items)
    : [];

  const line = both(world.stock, world.kinds, (stock, kinds) =>
    pick(linesOf(stock.items, places, kinds.items), id));

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
        total={0}
        more={false}
        onMore={() => undefined}
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

  /*
    ⚠️ THE NAMED ONES OF THIS PRODUCT, AND WHICH LIST IT IS COMES FROM THE RUNG.
    An itemised product has objects and an assembled one has kits; nothing is
    both, so asking for the list a product cannot have would be a request whose
    answer is always empty.
  */
  const tracking = line.status === "ready" ? line.data?.tracking : undefined;
  const pieces: readonly Piece[] = tracking === "itemised"
    ? (items.of.status === "ready" ? items.of.data.items : [])
      .filter((row) => text(row.product) === of)
      .map((row): Piece => ({
        id: text(row.id),
        label: text(row.code) || text(row.serial) || "Unlabelled",
        under: text(row.holder)
          ? `With ${text(row.holder)}`
          : SAID[lifeOf(row.life)],
      }))
    : tracking === "assembled"
      ? (kits.of.status === "ready" ? kits.of.data.items : [])
        .filter((row) => text(row.product) === of)
        .map((row): Piece => ({
          id: text(row.id),
          label: text(row.code) || "Unlabelled",
          under: KIT_SAID[stateOf(row.state)],
        }))
      : [];

  return (
    <Thing
      line={line.status === "ready" && line.data ? line.data : EMPTY_LINE}
      history={moves}
      batches={batches}
      pieces={pieces}
      onPiece={(id) => go(tracking === "assembled" ? `/kit/${id}` : `/item/${id}`)}
      /* ⚠️ OFFERED ONLY WHERE A KIT IS A THING THIS PRODUCT HAS. The operation
         refuses a kit of anything not on that rung, so a button anywhere else
         would be one that can only argue. */
      onAssemble={tracking === "assembled"
        ? () => {
          void api.post<{ id: string }>("kit.assemble", { product: of, day: today })
            .then((got) => { if (got.ok) go(`/kit/${got.value.id}`); });
        }
        : undefined}
      again={() => { world.again(); history.again(); dated.again(); items.again(); kits.again(); }}
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
  /* ⚠️ `null` UNTIL SOMEBODY ASKS, AND NEVER FETCHED ON ARRIVAL. A question
     costs credits; asking one on every unknown scan would spend them on the
     codes somebody was only checking. */
  const [guess, setGuess] = React.useState<Loaded<Guess | null>>(ready(null));
  const [busy, setBusy] = React.useState(false);
  const kinds = useAsked<{ items: readonly Row[] }>(() => api.get("product.list"));

  const resolve = React.useCallback((raw: string) => {
    setLast(raw);
    /* ⚠️ THE OLD SUGGESTION GOES WITH THE OLD CODE. A card describing the last
       thing scanned, over the next thing scanned, is the wrong product filled in
       and one press from being recorded. */
    setGuess(ready(null));
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

  /* ⚠️ ONE SHAPE FOR BOTH LANES, because a barcode and a photograph answer the
     same question and the screen draws one card either way. */
  const guessing = (op: string, input: unknown) => {
    setBusy(true);
    setGuess(waiting());
    void api.post<Guess>(op, input).then((got) => {
      setBusy(false);
      setGuess(got.ok ? ready(got.value) : trouble(got.problem));
    });
  };

  return (
    <Scan
      title={nameOf("/scan")}
      of={of}
      products={products}
      guess={guess}
      busy={busy}
      onIdentify={() => {
        const seen = of.status === "ready" ? of.data : null;
        if (seen) guessing("product.identify", { code: seen.value });
      }}
      onLabel={(image) => { guessing("product.read", { image }); }}
      onAdd={(said) => {
        setBusy(true);
        /* ⚠️ THE PRODUCT FIRST, THE CODE SECOND, AND THE SECOND ONLY IF THE
           FIRST LANDED. A code attached to a product that was never created
           names nothing for ever, and the next scan of it resolves to a row the
           catalogue does not have. */
        void api.post<{ id: string }>("product.create", {
          name: said.name,
          brand: said.brand,
          category: said.category,
          unit: said.unit || "item",
          tracking: said.tracking || "counted",
          storage: said.storage,
        }).then(async (made) => {
          if (!made.ok) { setBusy(false); setGuess(trouble(made.problem)); return; }
          if (last) {
            await api.post("code.learn", {
              raw: last, year: new Date().getFullYear(), product: made.value.id,
              /* ⚠️ HOW IT WAS LEARNED, RECORDED. A code a model suggested and a
                 code somebody typed deserve different amounts of trust the day
                 two of them disagree. */
              source: "ai-assisted",
              ...(said.pack > 1 ? { pack: said.pack } : {}),
            });
          }
          setBusy(false);
          setGuess(ready(null));
          kinds.again();
          go(`/thing/${made.value.id}`);
        });
      }}
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
 * RECEIVING — one session, one shelf, and one write per thing.
 *
 * ⚠️ THE PLACE SURVIVES BETWEEN SCANS AND THE THING DOES NOT, which is the whole
 * shape of the work. A location code moves the session; a product code fills the
 * row and is cleared the moment it is recorded, so the next scan cannot land on
 * the last one's quantity.
 *
 * ⚠️ AND THE WHOLE GESTURE IS ONE OPERATION — see `stock.arrive`. Making a
 * product, attaching its code, opening a batch and moving the balance from four
 * calls out here would leave a nameless product with no code the first time the
 * signal drops, and four queued items offline instead of one.
 */
const RECEIVE = (api: Door) => function ReceiveHere() {
  const world = useWorld(api);
  const [place, setPlace] = React.useState<{ id: string; name: string } | null>(null);
  const [seen, setSeen] = React.useState<Seen | null>(null);
  const [last, setLast] = React.useState("");
  /* ⚠️ THE MOVEMENT THAT CAN STILL BE TAKEN BACK. Held rather than looked up:
     undo is about the thing you JUST did, and asking the server which that was
     is a round trip in front of a button whose whole value is being instant. */
  const [undoable, setUndoable] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  /* ⚠️ `null` UNTIL A PAGE IS PHOTOGRAPHED. Reading one costs credits, so this
     is never asked for on arrival. */
  const [note, setNote] = React.useState<Loaded<readonly Noted[] | null>>(ready(null));
  /* ⚠️ WHICH LINES HAVE BEEN RECORDED, HELD HERE. It is a property of this
     session working through this page, not of the workspace — and the ledger
     cannot answer it, because a line and a movement are not the same shape. */
  const [done, setDone] = React.useState<ReadonlySet<string>>(new Set());
  /* ⚠️ THE LINE THE ROW WAS FILLED FROM, so recording it can tick the right one
     — the row itself carries no memory of where its numbers came from. */
  const from = React.useRef<Noted | null>(null);
  const today = dayHere();

  const places = world.places.status === "ready" && world.stock.status === "ready"
    ? placesOf(world.places.data.items, world.stock.data.items)
    : [];

  const read = React.useCallback((raw: string) => {
    setLast(raw);
    void api.get<Seen>("code.resolve", { raw, year: String(new Date().getFullYear()) })
      .then((got) => {
        if (!got.ok) { setSeen(null); return; }
        /* ⚠️ A SHELF LABEL MOVES THE SESSION RATHER THAN BECOMING A ROW. It is
           the highest-leverage behaviour in the whole flow: point at a shelf,
           scan, scan, scan, point at the next shelf. */
        if (got.value.ours === "location") {
          const found = places.find((p) => p.code === got.value.value || p.id === got.value.value);
          if (found) { setPlace({ id: found.id, name: found.name }); setSeen(null); }
          return;
        }
        if (got.value.ours) return;
        setSeen(got.value);
      });
  }, [api, places]);

  const readNote = (image: string) => {
    setBusy(true);
    setNote(waiting());
    setDone(new Set());
    void api.post<{ lines: readonly Noted[] }>("stock.note", { image }).then((got) => {
      setBusy(false);
      setNote(got.ok ? ready(got.value.lines) : trouble(got.problem));
    });
  };

  return (
    <Receive
      title={nameOf("/receive")}
      place={place}
      seen={seen}
      busy={busy}
      note={note}
      done={done}
      again={() => { world.again(); }}
      onNote={readNote}
      onLine={(line) => {
        /*
          ⚠️ THE LINE FILLS THE ROW RATHER THAN RECORDING ITSELF. What a model
          read off a creased page is a suggestion until somebody agrees with it,
          and the gesture they agree with it by is the one they already use.

          ⚠️ AND A LINE WITH NO CODE IS RECEIVED AGAINST ITS OWN DESCRIPTION.
          The supplier's words are the best name anybody has for it today; the
          product lands `unnamed` and the first real scan of its barcode is an
          unknown code, learnable onto that row. Refusing the line instead would
          lose the delivery, which is the worst outcome this product has.
        */
        from.current = line;
        const raw = line.code || line.name;
        setLast(raw);
        setSeen({
          found: false, kind: line.code ? "gtin" : "other", value: raw, ours: "",
          product: "", name: line.name, tracking: "", unit: "", pack: 1,
          lot: line.lot, expiry: line.expiry,
          /* ⚠️ WHAT THE PAGE DID NOT SAY, ASKED FOR. A note that gave a lot and
             no date is a batch with no expiry unless the person is asked. */
          needs: [line.lot ? "" : "lot", line.expiry ? "" : "expiry"]
            .filter(Boolean).join(","),
        });
      }}
      onRead={read}
      onForget={() => { setSeen(null); }}
      onUndo={undoable
        ? () => {
          void api.post("stock.undo", { movement: undoable, day: today }).then((got) => {
            if (!got.ok) return;
            /* ⚠️ THE OFFER GOES THE MOMENT IT IS TAKEN. An undo is not itself
               undoable, and a button that would now be refused is worse than no
               button at all. */
            setUndoable(null);
            world.again();
          });
        }
        : undefined}
      onReceive={({ quantity, lot, expiry }) => {
        if (!place || !seen) return;
        setBusy(true);
        void api.post<{ movement: string }>("stock.arrive", {
          raw: last,
          location: place.id,
          quantity,
          day: today,
          year: new Date().getFullYear(),
          capture: "scanned",
          ...(lot ? { lot } : {}),
          ...(expiry ? { expiry } : {}),
        }).then((got) => {
          setBusy(false);
          if (!got.ok) return;
          /* ⚠️ THE LINE IS TICKED ONLY WHERE THE WRITE LANDED. A worklist that
             crossed a line off on the press rather than on the answer is a page
             somebody works through twice. */
          if (from.current) {
            const at = keyOf(from.current);
            setDone((was) => new Set([...was, at]));
            from.current = null;
          }
          /* ⚠️ CLEARED SO THE NEXT SCAN STARTS CLEAN. A screen still showing the
             last thing is a screen where somebody presses "Add it" twice. */
          setSeen(null);
          setLast("");
          world.again();
          /* ⚠️ THE MOVEMENT IT JUST WROTE, ANSWERED BY THE OPERATION. That is
             what makes the take-back button honest rather than a guess at which
             row to reverse. */
          setUndoable(got.value.movement);
        });
      }}
    />
  );
};

/**
 * A COUNT SESSION — one shelf, open until somebody closes it.
 *
 * ⚠️ THE SESSION IS HELD HERE AND NOT IN THE ADDRESS, and that is deliberate:
 * counting is a job somebody is IN, and a route carrying the session id would
 * make the back button leave it half done with nothing saying so. The shelf is
 * the address of the work; the session is the state of it.
 *
 * ⚠️ AND THE TALLY IS RE-READ AFTER EVERY SCAN RATHER THAN COUNTED HERE. Two
 * people counting one aisle is the ordinary case, and a running total kept in
 * this component would be one person's half of it.
 */
const COUNT = (api: Door) => function CountHere() {
  const world = useWorld(api);
  const [place, setPlace] = React.useState<{ id: string; name: string } | null>(null);
  const [session, setSession] = React.useState("");
  const [blind, setBlind] = React.useState(false);
  const [stutter, setStutter] = React.useState<string | undefined>(undefined);
  const today = dayHere();

  /* ⚠️ WHEN EACH CODE WAS LAST READ, IN A REF. It is a property of this device's
     trigger finger rather than of the workspace, and re-rendering on every scan
     to store a timestamp would make the list flicker while somebody works. */
  const beats = React.useRef<Record<string, number[]>>({});

  const places = world.places.status === "ready" && world.stock.status === "ready"
    ? placesOf(world.places.data.items, world.stock.data.items)
    : [];

  const tallies = useAsked<{ items: readonly Row[] }>(
    () => api.get("tally.list"), [session]);
  const differences = useAsked<{ items: readonly Row[] }>(
    () => (session
      ? api.get("count.differences", { count: session })
      : Promise.resolve({ ok: true as const, value: { items: [] } })),
    [session]);

  const named = new Map(
    world.kinds.status === "ready"
      ? world.kinds.data.items.map((row) => [text(row.id), row])
      : [],
  );
  const held = new Map(
    world.stock.status === "ready" && place
      ? world.stock.data.items
        .filter((row) => text(row.location) === place.id)
        .map((row) => [text(row.product), num(row.quantity)])
      : [],
  );

  const rows: Loaded<readonly Counted[]> = tallies.of.status === "ready"
    ? ready(tallies.of.data.items
      .filter((row) => text(row.count) === session)
      .map((row): Counted => {
        const of = named.get(text(row.product));
        return {
          id: text(row.id),
          name: of ? text(of.name) : "—",
          unit: of ? text(of.unit) || "item" : "item",
          found: num(row.quantity),
          /* ⚠️ WITHHELD RATHER THAN HIDDEN ON A BLIND COUNT. A number sent to the
             browser and not drawn is a number in the page source. */
          expected: blind ? null : held.get(text(row.product)) ?? 0,
        };
      }))
    : tallies.of;

  /*
    ⚠️ DERIVED FROM THE SESSIONS RATHER THAN STORED ON THE SHELF. A "last
    counted" column on `location` would be a second answer to a question the
    count table already holds — and the two would disagree the first time a close
    half failed.
  */
  const sessions = useAsked<{ items: readonly Row[] }>(() => api.get("count.list"));
  const lastCounted: Record<string, string> = {};
  if (sessions.of.status === "ready") {
    for (const row of sessions.of.data.items) {
      if (!text(row.closed)) continue;
      const at = text(row.location);
      const on = text(row.day);
      if (!lastCounted[at] || lastCounted[at] < on) lastCounted[at] = on;
    }
  }
  const uncounted: readonly Uncovered[] = coverage(
    places.map((p) => ({ id: p.id, name: p.name })), lastCounted, today,
  ).map((c) => ({ location: c.location, name: c.name, days: c.days }));

  const changes: readonly Change[] = differences.of.status === "ready"
    ? differences.of.data.items.map((row): Change => ({
      product: text(row.product),
      name: named.get(text(row.product)) ? text(named.get(text(row.product))?.name) : "—",
      was: num(row.was),
      found: num(row.found),
      delta: num(row.delta),
    }))
    : [];

  const read = (raw: string) => {
    /* ⚠️ THE SHELF FIRST, ALWAYS. A location code scanned mid-count is somebody
       who has walked to the next rack — so it ends this session's scope rather
       than being counted onto it. */
    void api.get<Seen>("code.resolve", { raw, year: String(new Date().getFullYear()) })
      .then((got) => {
        if (!got.ok) return;
        if (got.value.ours === "location") {
          const found = places.find((p) => p.code === got.value.value || p.id === got.value.value);
          if (found) { setPlace({ id: found.id, name: found.name }); setSession(""); }
          return;
        }
        if (got.value.ours || !session) return;

        /* ⚠️ FLAGGED, NEVER BLOCKED — a trigger held against a pallet of
           identical boxes is also three reads in two seconds, and it is three
           boxes. */
        const now = Date.now();
        const was = beats.current[raw] ?? [];
        setStutter(stuttering(was, now)
          ? "That code read three times in two seconds — check it is three things"
          : undefined);
        beats.current[raw] = [...was, now].slice(-4);

        void api.post("count.tally", { count: session, raw, year: new Date().getFullYear() })
          .then((done) => { if (done.ok) { tallies.again(); differences.again(); } });
      });
  };

  return (
    <Count
      title={nameOf("/count")}
      place={place}
      blind={blind}
      onBlind={setBlind}
      counting={Boolean(session)}
      of={rows}
      changes={changes}
      stutter={stutter}
      uncounted={uncounted}
      onRead={read}
      onGo={(location) => {
        const found = places.find((p) => p.id === location);
        if (found) { setPlace({ id: found.id, name: found.name }); setSession(""); }
      }}
      onStart={() => {
        if (!place) return;
        void api.post<{ id: string }>("count.open", {
          location: place.id, blind, day: today,
        }).then((got) => { if (got.ok) setSession(got.value.id); });
      }}
      onClose={() => {
        if (!session) return;
        void api.post("count.close", { count: session, day: today }).then((got) => {
          if (!got.ok) return;
          /* ⚠️ THE SESSION ENDS HERE RATHER THAN BEING RE-READ. It is closed, and
             a screen still offering to count onto it would be offering something
             the operation now refuses. */
          setSession("");
          world.again();
        });
      }}
      again={() => { tallies.again(); differences.again(); sessions.again(); world.again(); }}
    />
  );
};

/**
 * ONE OBJECT — reachable by its row id or by the label printed on it.
 *
 * ⚠️ THE LABEL IS AN ADDRESS, WHICH IS WHY BOTH RESOLVE HERE. Somebody standing
 * in a store room has the code in their hand and nothing else; making the
 * scanner look up a row id first would put a round trip between the camera and
 * the screen it is supposed to open.
 */
const ITEM = (api: Door) => function ItemHere({ go, at }: Mounted) {
  const id = at[0] ?? "";
  const today = dayHere();
  const world = useWorld(api);
  const items = useAsked<{ items: readonly Row[] }>(() => api.get("unit.list"));
  const history = useAsked<{ items: readonly Row[] }>(() => api.get("ledger.list"));
  /* ⚠️ THE STANDING IS THE OPERATION'S, NOT THIS FILE'S. How many days counts as
     "soon" for a service is a setting a person on the floor cannot read, so a
     container working it out here would hard-code a number or show everybody the
     same wrong answer. */
  const dated = useAsked<{ items: readonly Row[] }>(
    () => api.get("unit.due", { today }), [today]);

  const places = world.places.status === "ready" && world.stock.status === "ready"
    ? placesOf(world.places.data.items, world.stock.data.items)
    : [];
  const named = new Map(places.map((p) => [p.id, p.name]));
  const kinds = new Map(
    world.kinds.status === "ready"
      ? world.kinds.data.items.map((row) => [text(row.id), text(row.name)])
      : [],
  );
  const standing = new Map(
    dated.of.status === "ready"
      ? dated.of.data.items.map((row) => [text(row.id), row])
      : [],
  );

  const row = items.of.status === "ready"
    ? items.of.data.items.find((r) => text(r.id) === id || text(r.code) === id)
    : undefined;

  const of: Kept = row
    ? {
      id: text(row.id),
      code: text(row.code),
      name: kinds.get(text(row.product)) ?? "—",
      product: text(row.product),
      serial: text(row.serial),
      life: lifeOf(row.life),
      where: named.get(text(row.location)) ?? "",
      holder: text(row.holder),
      issued: text(row.issued),
      due: text(row.due),
      standing: text(standing.get(text(row.id))?.standing),
      days: num(standing.get(text(row.id))?.days),
      services: num(row.services),
      retired: text(row.retired),
      note: text(row.note),
    }
    : EMPTY_ITEM;

  /* ⚠️ THE MOVEMENTS OF THIS OBJECT, WHICH THE LEDGER NAMES IN `against`. Every
     act on an item moves the balance through the same chokepoint as a box of
     gloves, so the history is one query and one vocabulary — see `stockMove`. */
  const moves: Loaded<readonly Movement[]> = history.of.status === "ready"
    ? ready(movesOf(
      history.of.data.items.filter((r) => text(r.against) === of.id), places))
    : history.of;

  const after = () => { items.again(); history.again(); dated.again(); world.again(); };

  return (
    <Item
      of={of}
      history={moves}
      again={after}
      back={() => go(of.product ? `/thing/${of.product}` : "/")}
      onIssue={(holder) => {
        void api.post("unit.issue", { unit: of.id, holder, day: today })
          .then((got) => { if (got.ok) after(); });
      }}
      onReturn={() => {
        void api.post("unit.return", { unit: of.id, day: today })
          .then((got) => { if (got.ok) after(); });
      }}
      onServe={({ next, note }) => {
        void api.post("unit.serve", {
          unit: of.id, day: today, ...(next ? { next } : {}), ...(note ? { note } : {}),
        }).then((got) => { if (got.ok) after(); });
      }}
      onRetire={(reason) => {
        void api.post("unit.retire", { unit: of.id, day: today, reason })
          .then((got) => { if (got.ok) after(); });
      }}
    />
  );
};

const LIVES: readonly Kept["life"][] = ["held", "issued", "retired"];
const lifeOf = (v: unknown): Kept["life"] =>
  LIVES.includes(v as Kept["life"]) ? (v as Kept["life"]) : "held";

/** ⚠️ What the screen draws while its subject is arriving — see `EMPTY_LINE`. */
const EMPTY_ITEM: Kept = {
  id: "", code: "", name: "", product: "", serial: "", life: "held",
  where: "", holder: "", issued: "", due: "", standing: "", days: 0,
  services: 0, retired: "", note: "",
};

/**
 * ONE KIT — and the check is the server's, not this file's.
 *
 * ⚠️ `kit.check` ANSWERS BOTH THE SCREEN AND THE BUILD, which is what makes the
 * missing list trustworthy. A container that worked out what was short from a
 * member list would be a second implementation of "is this complete", and the
 * two would disagree the first time a recipe line was edited.
 */
const KIT = (api: Door) => function KitHere({ go, at }: Mounted) {
  const id = at[0] ?? "";
  const today = dayHere();
  const world = useWorld(api);
  const kits = useAsked<{ items: readonly Row[] }>(() => api.get("kit.list"));
  const checked = useAsked<{ members: readonly Row[]; short: readonly Row[] }>(
    () => (id
      ? api.get("kit.check", { kit: id })
      : Promise.resolve({ ok: true as const, value: { members: [], short: [] } })),
    [id]);

  const places = world.places.status === "ready" && world.stock.status === "ready"
    ? placesOf(world.places.data.items, world.stock.data.items)
    : [];
  const named = new Map(places.map((p) => [p.id, p.name]));
  const kinds = new Map(
    world.kinds.status === "ready"
      ? world.kinds.data.items.map((row) => [text(row.id), text(row.name)])
      : [],
  );

  const row = kits.of.status === "ready"
    ? kits.of.data.items.find((r) => text(r.id) === id || text(r.code) === id)
    : undefined;

  const members: Loaded<readonly Member[]> = checked.of.status === "ready"
    ? ready(checked.of.data.members.map((m): Member => ({
      id: text(m.id), name: text(m.name), code: text(m.code),
      stray: m.stray === true,
    })))
    : checked.of;

  const missing: readonly Missing[] = checked.of.status === "ready"
    ? checked.of.data.short.map((s): Missing => ({
      product: text(s.product), name: text(s.name),
      want: num(s.want), have: num(s.have),
    }))
    : [];

  const after = () => { kits.again(); checked.again(); world.again(); };

  return (
    <Kit
      title={nameOf("/kit")}
      name={row ? kinds.get(text(row.product)) ?? "—" : "—"}
      code={row ? text(row.code) : ""}
      state={stateOf(row?.state)}
      built={row ? text(row.built) : ""}
      where={row ? named.get(text(row.location)) ?? "" : ""}
      of={members}
      missing={missing}
      again={after}
      back={() => go("/")}
      onRead={(raw) => {
        /* ⚠️ THE SCAN RESOLVES TO ONE OF OUR OWN LABELS AND NOTHING ELSE HERE. A
           product barcode names a type, and a type cannot be put into a tray —
           what goes in is one object, which is what our label names. */
        void api.get<Seen>("code.resolve", { raw, year: String(new Date().getFullYear()) })
          .then((got) => {
            if (!got.ok || got.value.ours !== "unit") return;
            void api.post("kit.put", { kit: id, unit: got.value.value })
              .then((done) => { if (done.ok) after(); });
          });
      }}
      onOpen={(unit) => go(`/item/${unit}`)}
      onTake={(unit) => {
        void api.post("kit.take", { kit: id, unit }).then((got) => { if (got.ok) after(); });
      }}
      onBuild={() => {
        void api.post("kit.build", { kit: id, day: today })
          .then((got) => { if (got.ok) after(); });
      }}
      onBreak={() => {
        void api.post("kit.break", { kit: id }).then((got) => { if (got.ok) after(); });
      }}
    />
  );
};

type KitState = "open" | "built" | "broken";
const STATES: readonly KitState[] = ["open", "built", "broken"];
const stateOf = (v: unknown): KitState =>
  STATES.includes(v as KitState) ? (v as KitState) : "open";

/**
 * ASKING IN WORDS.
 *
 * ⚠️ NOTHING IS ASKED ON ARRIVAL, and that is the whole shape of this container.
 * Every other screen here fetches when it mounts; a question costs credits, so
 * this one holds `null` until somebody presses — and an effect would ask one on
 * every render of a screen nobody typed into.
 */
const ASK = (api: Door) => function AskHere() {
  const [of, set] = React.useState<Loaded<Answer | null>>(ready(null));
  const [last, setLast] = React.useState("");
  const today = dayHere();
  /* ⚠️ HOW MANY LINES THE WORKSPACE HOLDS, so the screen can say when the
     answer read fewer. A bound nobody is told about is "you have none" over a
     shelf that has some. */
  const stock = useAsked<{ items: readonly Row[] }>(() => api.get("stock.list"));

  const ask = (question: string) => {
    setLast(question);
    set(waiting());
    void api.post<Answer>("stock.ask", { question, today })
      .then((got) => { set(got.ok ? ready(got.value) : trouble(got.problem)); });
  };

  return (
    <Ask
      title={nameOf("/ask")}
      of={of}
      lines={stock.of.status === "ready" ? stock.of.data.items.length : 0}
      onAsk={ask}
      again={() => { if (last) ask(last); }}
    />
  );
};

/* ---------------------------------------------------------------- the work --- */

const RUN_STATES: readonly Runs["state"][] =
  ["open", "ended", "released", "failed", "recalled"];
const runStateOf = (v: unknown): Runs["state"] =>
  RUN_STATES.includes(v as Runs["state"]) ? (v as Runs["state"]) : "open";

const VERDICTS: readonly Covered["verdict"][] = ["pending", "released", "failed", "lifted"];
const verdictOf = (v: unknown): Covered["verdict"] =>
  VERDICTS.includes(v as Covered["verdict"]) ? (v as Covered["verdict"]) : "pending";

/**
 * RUNS AND JOBS.
 *
 * ⚠️ THE DOUBT ON A JOB ROW IS NOT ASKED FOR HERE, AND THAT IS DELIBERATE.
 * `job.trace` is a join per job; running it for every row of a list would put N
 * queries behind one screen. What the list shows is the job; what the doubt
 * costs is one more read, and it is on the job's own screen where somebody
 * actually needs the answer.
 *
 * ⚠️ AND A LIST DOES NOT AGGREGATE, BY CONSTRUCTION. A generated read answers
 * rows and a total; a count of what each job USED is a group-by, which is a
 * query language arriving through a door that deliberately has none. The row
 * shows the job; the answer is one read away on the job's own screen, where
 * somebody is asking for it.
 */
const WORK = (api: Door) => function WorkHere({ go }: Mounted) {
  const today = dayHere();
  const runs = useAsked<{ items: readonly Row[] }>(() => api.get("process.list"));
  const jobs = useAsked<{ items: readonly Row[] }>(() => api.get("job.list"));
  const items = useAsked<{ items: readonly Row[] }>(() => api.get("process-item.list"));

  const inRun = new Map<string, number>();
  if (items.of.status === "ready") {
    for (const row of items.of.data.items) {
      const at = text(row.process);
      inRun.set(at, (inRun.get(at) ?? 0) + 1);
    }
  }

  const rows: Loaded<readonly Runs[]> = runs.of.status === "ready"
    ? ready(runs.of.data.items.map((row): Runs => ({
      id: text(row.id),
      kind: text(row.kind),
      machine: text(row.machine),
      state: runStateOf(row.state),
      started: text(row.started),
      items: inRun.get(text(row.id)) ?? 0,
    })))
    : runs.of;

  const cases: readonly Jobs[] = jobs.of.status === "ready"
    ? jobs.of.data.items.map((row): Jobs => ({
      id: text(row.id),
      ref: text(row.ref),
      label: text(row.label),
      state: text(row.state) === "closed" ? "closed" : "open",
      opened: text(row.opened),
      /* ⚠️ NOT ASKED FOR — see the DEFER above. Zero here is "not looked at",
         which the row draws as no note rather than as a clean bill. */
      doubted: 0,
    }))
    : [];

  return (
    <Work
      title={nameOf("/work")}
      of={rows}
      jobs={cases}
      again={() => { runs.again(); jobs.again(); items.again(); }}
      onRun={(id) => go(`/run/${id}`)}
      onJob={(id) => go(`/case/${id}`)}
      onStart={() => {
        /* ⚠️ THE KIND IS THE WORKSPACE'S OWN WORD and the run screen is where it
           is named — starting one with a placeholder would put "New run" in a
           record somebody signs against. */
        void api.post<{ id: string }>("process.open", { kind: "New run", day: today })
          .then((got) => { if (got.ok) go(`/run/${got.value.id}`); });
      }}
    />
  );
};

const RUN = (api: Door) => function RunHere({ go, at }: Mounted) {
  const id = at[0] ?? "";
  const today = dayHere();
  const [busy, setBusy] = React.useState(false);
  const runs = useAsked<{ items: readonly Row[] }>(() => api.get("process.list"));
  const items = useAsked<{ items: readonly Row[] }>(() => api.get("process-item.list"));
  const batches = useAsked<{ items: readonly Row[] }>(() => api.get("batch.list"));
  const world = useWorld(api);

  const row = runs.of.status === "ready"
    ? runs.of.data.items.find((r) => text(r.id) === id)
    : undefined;

  const named = new Map(
    world.kinds.status === "ready"
      ? world.kinds.data.items.map((k) => [text(k.id), text(k.name)])
      : [],
  );
  const lot = new Map(
    batches.of.status === "ready"
      ? batches.of.data.items.map((b) => [text(b.id), b])
      : [],
  );
  const stock = new Map<string, number>();
  if (world.stock.status === "ready") {
    for (const line of world.stock.data.items) {
      const of = text(line.batch);
      if (of) stock.set(of, (stock.get(of) ?? 0) + num(line.quantity));
    }
  }

  const covered: Loaded<readonly Covered[]> = items.of.status === "ready"
    ? ready(items.of.data.items
      .filter((r) => text(r.process) === id)
      .map((r): Covered => {
        const of = lot.get(text(r.batch));
        return {
          batch: text(r.batch),
          lot: of ? text(of.lot) : "",
          name: of ? named.get(text(of.product)) ?? "—" : "—",
          verdict: verdictOf(r.verdict),
          reason: text(r.reason),
          quantity: stock.get(text(r.batch)) ?? 0,
        };
      }))
    : items.of;

  const after = () => { runs.again(); items.again(); batches.again(); world.again(); };
  const did = (op: string, input: unknown) => {
    setBusy(true);
    void api.post(op, input).then((got) => { setBusy(false); if (got.ok) after(); });
  };

  return (
    <Run
      of={covered}
      kind={row ? text(row.kind) : "—"}
      machine={row ? text(row.machine) : ""}
      state={runStateOf(row?.state)}
      started={row ? text(row.started) : ""}
      ended={row ? text(row.ended) : ""}
      released={row ? text(row.released) : ""}
      evidence={row ? text(row.evidence) : ""}
      busy={busy}
      again={after}
      back={() => go("/work")}
      onEnd={(evidence) => { did("process.end", { process: id, evidence }); }}
      onRelease={() => { did("process.release", { process: id, day: today }); }}
      onFail={(reason) => { did("process.fail", { process: id, reason }); }}
      onRecall={(reason) => { did("process.recall", { process: id, reason }); }}
      onLift={(batch, reason) => { did("process.lift", { process: id, batch, reason }); }}
    />
  );
};

/**
 * ONE JOB, AND ITS TRACE IS THE SERVER'S.
 *
 * ⚠️ `job.trace` IS ASKED FOR RATHER THAN ASSEMBLED HERE, which is the whole
 * reason it exists. Whether a lot is in doubt is a join across the ledger, the
 * batches and the runs — done in the browser it would be three lists and a
 * guess, and the guess would be about the one question the screen is for.
 */
const CASE = (api: Door) => function CaseHere({ go, at }: Mounted) {
  const id = at[0] ?? "";
  const today = dayHere();
  const [busy, setBusy] = React.useState(false);
  const jobs = useAsked<{ items: readonly Row[] }>(() => api.get("job.list"));
  const trace = useAsked<{ items: readonly Row[] }>(
    () => (id
      ? api.get("job.trace", { job: id })
      : Promise.resolve({ ok: true as const, value: { items: [] } })),
    [id]);

  const row = jobs.of.status === "ready"
    ? jobs.of.data.items.find((r) => text(r.id) === id)
    : undefined;

  const used: Loaded<readonly Used[]> = trace.of.status === "ready"
    ? ready(trace.of.data.items.map((r): Used => ({
      movement: text(r.movement),
      product: text(r.product),
      name: text(r.name),
      quantity: num(r.quantity),
      lot: text(r.lot),
      at: text(r.at),
      doubt: text(r.doubt),
    })))
    : trace.of;

  return (
    <Case
      of={used}
      ref={row ? text(row.ref) : "—"}
      label={row ? text(row.label) : ""}
      state={row && text(row.state) === "closed" ? "closed" : "open"}
      opened={row ? text(row.opened) : ""}
      closed={row ? text(row.closed) : ""}
      busy={busy}
      again={() => { jobs.again(); trace.again(); }}
      back={() => go("/work")}
      onClose={() => {
        setBusy(true);
        void api.post("job.close", { job: id, day: today }).then((got) => {
          setBusy(false);
          if (got.ok) jobs.again();
        });
      }}
      onOpenProduct={(product) => go(`/thing/${product}`)}
    />
  );
};

/**
 * RUNNING OUT — where every note the nightly sweep sends lands.
 *
 * ⚠️ THE ARITHMETIC IS THE OPERATIONS', NOT THIS FILE'S, and both of them are
 * asked. How many days counts as "soon" is a `tenant:manage` setting a person on
 * the floor cannot read, so a container working it out here would hard-code a
 * number or show everybody the same wrong list — and it would have to do it
 * twice, because an expiry and a service interval are different settings.
 *
 * ⚠️ AND THE TWO ASKS ARE THE SAME TWO THE JOB MAKES. `batch.due` with no
 * product is the whole workspace, which is exactly what a note about the whole
 * workspace has to be able to show.
 */
const DUE = (api: Door) => function DueHere({ go }: Mounted) {
  const today = dayHere();
  const dated = useAsked<{ items: readonly Row[] }>(
    () => api.get("batch.due", { today }), [today]);
  const serviced = useAsked<{ items: readonly Row[] }>(
    () => api.get("unit.due", { today }), [today]);

  const rows: Loaded<readonly Dated[]> = dated.of.status === "ready"
    ? ready(dated.of.data.items.map((row): Dated => ({
      id: text(row.id),
      product: text(row.product),
      name: text(row.name),
      /* ⚠️ THE LOT, BECAUSE THAT IS WHAT A RECALL NAMES AND WHAT SOMEBODY READS
         OFF THE BOX. Two deliveries of one product are two rows here and the
         product's name alone cannot tell them apart. */
      which: text(row.lot) ? `Lot ${text(row.lot)}` : "",
      on: text(row.on),
      standing: standingIn(row.standing),
      days: num(row.days),
      by: text(row.by),
    })))
    : dated.of;

  const services: readonly Dated[] = serviced.of.status === "ready"
    ? serviced.of.data.items.map((row): Dated => ({
      id: text(row.id),
      product: text(row.product),
      name: text(row.name),
      which: text(row.serial) ? `Serial ${text(row.serial)}` : text(row.code),
      on: text(row.on),
      standing: standingIn(row.standing),
      days: num(row.days),
      /* ⚠️ EMPTY, BECAUSE A SERVICE HAS ONE CLOCK. The three-way "which clock
         won" is what an expiry needs; saying "printed on it" over an inspection
         date would be a sentence that is simply not true. */
      by: "",
    }))
    : [];

  return (
    <Due
      title={nameOf("/due")}
      of={rows}
      services={services}
      again={() => { dated.again(); serviced.again(); }}
      /* ⚠️ THE PRODUCT, NEVER THE BATCH. A row here is one delivery and there
         is no screen for one; the product's is where its deliveries are listed,
         and `THING` resolves a product id as well as a line id for exactly
         this. */
      onOpen={(row) => go(`/thing/${row.product}`)}
      onItem={(row) => go(`/item/${row.id}`)}
    />
  );
};

/**
 * REPORTS — one ask, because a figure screen is one screen.
 *
 * ⚠️ THE ARITHMETIC IS THE OPERATION'S, DOWN TO THE ORDERING. What runs out
 * first is a question about the workspace's own lead time, which is a
 * `tenant:manage` setting a person on the floor cannot read — a container
 * sorting this list would either hard-code a number or show everybody the same
 * wrong order.
 *
 * ⚠️ AND THE PERIOD IS COUNTED IN THE DEVICE'S OWN DAYS. The ledger's `day` is
 * the local date where the shelf is; a range cut on the server's calendar puts a
 * shift that ended at 01:00 into the wrong month for half the world.
 */
const SPAN_DAYS: Readonly<Record<Span, number>> = { week: 7, month: 30, quarter: 90 };

const REPORTS = (api: Door) => function ReportsHere({ go }: Mounted) {
  const [span, setSpan] = React.useState<Span>("month");
  const today = dayHere();
  /* ⚠️ THE KERNEL'S CALENDAR ARITHMETIC, not a subtraction on an instant. Thirty
     days back across a clock change is 29 or 31 by the millisecond, and a report
     silently covering the wrong period is one nobody can catch by looking. */
  const from = React.useMemo(
    () => dayPlus(today as Day, -(SPAN_DAYS[span] - 1)), [today, span]);

  const said = useAsked<Reported>(
    () => api.get("stock.report", { from, to: today }), [from, today]);

  return (
    <Reports
      title={nameOf("/reports")}
      of={said.of}
      span={span}
      onSpan={setSpan}
      again={said.again}
      onOpen={(product) => go(`/thing/${product}`)}
    />
  );
};

/**
 * LABELS — the sheet, and the codes it mints on the way to the printer.
 *
 * ⚠️ PRINTING IS WHAT MINTS A CODE, so the button is a WRITE before it is a
 * print. A place with no label is a place the camera cannot move a count to, and
 * minting one at creation would fill a workspace with four hundred codes on
 * shelves nothing is stuck to — a string that resolves to somewhere nobody can
 * find is worse than a blank column.
 *
 * ⚠️ AND THE BROWSER'S PRINT DIALOGUE IS THE LAST STEP, DELIBERATELY. Which
 * printer, which roll, how many copies and whether to scale are all questions
 * the operating system already asks better than a form could — and the sheet on
 * screen is the same components at the same millimetres, so what it shows is
 * what comes out.
 */
const LABELS = (api: Door) => function LabelsHere() {
  const today = dayHere();
  const [subject, setSubject] = React.useState<Subject>("place");
  const [template, setTemplate] = React.useState<Template>("tag");
  const [picked, setPicked] = React.useState<readonly string[]>([]);
  const [busy, setBusy] = React.useState(false);

  const world = useWorld(api);
  const items = useAsked<{ items: readonly Row[] }>(() => api.get("unit.list"));
  const kits = useAsked<{ items: readonly Row[] }>(() => api.get("kit.list"));

  const places = world.places.status === "ready" && world.stock.status === "ready"
    ? placesOf(world.places.data.items, world.stock.data.items)
    : [];
  const named = new Map(places.map((p) => [p.id, p.name]));
  const kinds = new Map(
    world.kinds.status === "ready"
      ? world.kinds.data.items.map((row) => [text(row.id), row])
      : [],
  );

  /* ⚠️ ONE SHAPE FOR FOUR SUBJECTS, ASSEMBLED HERE. The screen draws labels and
     has no business knowing that a shelf's second line is its trail and an
     item's is its serial — what crosses is a row a label can be printed from. */
  const rowsOf = (): Loaded<readonly Labelled[]> => {
    const bare = { hazards: [] as readonly string[], signal: "" as const,
      hazardText: "", precautions: "" };
    if (subject === "place") {
      return world.places.status === "ready"
        ? ready(world.places.data.items.map((row): Labelled => ({
          id: text(row.id), name: text(row.name), code: text(row.code),
          under: text(row.within) ? named.get(text(row.within)) ?? "" : "", ...bare,
        })))
        : world.places;
    }
    if (subject === "thing") {
      return world.kinds.status === "ready"
        ? ready(world.kinds.data.items.map((row): Labelled => ({
          id: text(row.id), name: text(row.name), code: text(row.code),
          under: text(row.brand),
          hazards: hazardsIn(row.hazards),
          signal: signalIn(row.signal),
          hazardText: text(row.hazardText),
          precautions: text(row.precautions),
        })))
        : world.kinds;
    }
    if (subject === "item") {
      return items.of.status === "ready"
        ? ready(items.of.data.items.map((row): Labelled => ({
          id: text(row.id),
          name: text(kinds.get(text(row.product))?.name) || "—",
          code: text(row.code),
          under: text(row.serial) ? `Serial ${text(row.serial)}` : "",
          ...bare,
        })))
        : items.of;
    }
    return kits.of.status === "ready"
      ? ready(kits.of.data.items.map((row): Labelled => ({
        id: text(row.id),
        name: text(kinds.get(text(row.product))?.name) || "—",
        code: text(row.code),
        under: text(row.location) ? named.get(text(row.location)) ?? "" : "",
        ...bare,
      })))
      : kits.of;
  };

  return (
    <Labels
      title={nameOf("/labels")}
      of={rowsOf()}
      subject={subject}
      onSubject={(next) => {
        setSubject(next);
        /* ⚠️ THE CHOICE IS CLEARED WITH THE SUBJECT, because an id from the
           previous list is an id in another table — a sheet that kept it would
           print nothing and say nothing about why. */
        setPicked([]);
        if (next !== "thing") setTemplate("tag");
      }}
      picked={picked}
      onPicked={setPicked}
      template={template}
      onTemplate={setTemplate}
      today={today}
      busy={busy}
      /* ⚠️ EVERY LIST THIS SCREEN CAN DRAW, because the retry belongs to the
         SCREEN and the screen does not know which of four asks failed. Refreshing
         only the current subject would leave the other three showing a stale
         refusal the moment somebody switched. */
      again={() => { world.again(); items.again(); kits.again(); }}
      onPrint={() => {
        const mint = subject === "place" ? "location.label"
          : subject === "thing" ? "product.label" : null;
        /* ⚠️ THE MINT COMES BACK BEFORE THE DIALOGUE OPENS. Printing first and
           minting after would put a sheet of blank symbols in somebody's hand,
           and they would only find out at the shelf. */
        if (!mint) { window.print(); return; }
        setBusy(true);
        void api.post(mint, { ids: picked }).then((got) => {
          setBusy(false);
          if (!got.ok) return;
          world.again();
          /* ⚠️ AFTER THE REPAINT, so the sheet carries the codes that were just
             minted rather than the blanks it was drawn with. */
          requestAnimationFrame(() => { window.print(); });
        });
      }}
    />
  );
};

/**
 * IMPORT — the paste, the mapping, the preview, the write.
 *
 * ⚠️ THE PREVIEW AND THE COMMIT SEND THE SAME TWO THINGS, and that is what makes
 * the screen's promise true. `product.preview` and `product.import` share one
 * planner on the server; this container's job is to make sure the text and the
 * mapping that reach the second are the ones the first was asked about, which is
 * why the mapping is re-sent rather than remembered anywhere.
 *
 * ⚠️ AND THE MAPPING IS A DIFF THE PERSON OWNS. The guess arrives with the
 * preview; every correction is kept locally and merged over it, so re-previewing
 * after a change does not throw the change away.
 */
const IMPORT = (api: Door) => function ImportHere() {
  const today = dayHere();
  const [text, setText] = React.useState("");
  const [seen, setSeen] = React.useState<Seeing | null>(null);
  const [said, setSaid] = React.useState<Record<string, number>>({});
  const [done, setDone] = React.useState<Done | null>(null);
  const [busy, setBusy] = React.useState(false);

  /* ⚠️ THE WORKSPACE'S OWN WORDS ON THE MAPPING LABELS. A clinic mapping a
     column called "Shelf" is mapping somebody else's product — and the vocabulary
     is asked for rather than copied here, so it cannot drift from `words.ts`. */
  const starts = useAsked<{ words: { place: string } }>(() => api.get("product.start"));
  const place = starts.of.status === "ready" ? starts.of.data.words.place : "Location";

  const fields = React.useMemo(() => MAPPABLE.map((one) => (
    one.id === "location" ? { id: one.id, label: place } : one
  )), [place]);

  const see = (columns: Record<string, number>) => {
    setBusy(true);
    void api.post<Seeing>("product.preview", { text, columns }).then((got) => {
      setBusy(false);
      if (!got.ok) return;
      setSeen(got.value);
    });
  };

  return (
    <Import
      title={nameOf("/import")}
      text={text}
      onText={setText}
      seen={seen}
      fields={fields}
      /* ⚠️ THE GUESS UNDER THE CORRECTIONS, in that order — the door merges the
         same way, so what is drawn is what will happen. */
      columns={{ ...(seen?.columns ?? {}), ...said }}
      onColumn={(field, at) => {
        const next = { ...said, [field]: at };
        setSaid(next);
        /* ⚠️ RE-PREVIEWED ON EVERY CHANGE, because the counts are the answer to
           the change. A mapping edited against a stale tally is a person reading
           the consequences of the previous decision. */
        see(next);
      }}
      done={done}
      busy={busy}
      onSee={() => { see(said); }}
      onImport={() => {
        setBusy(true);
        void api.post<Done>("product.import", {
          text, day: today, columns: { ...(seen?.columns ?? {}), ...said },
        }).then((got) => {
          setBusy(false);
          if (!got.ok) return;
          setDone(got.value);
        });
      }}
      onAgain={() => { setText(""); setSeen(null); setSaid({}); setDone(null); }}
    />
  );
};

/**
 * SUPPLIERS — who things come from.
 *
 * ⚠️ THE PRODUCT COUNT IS JOINED HERE rather than answered by the door, for the
 * reason this whole file exists: `product.list` is already read by half the
 * product, and a `supplier.count` operation would be a query language with extra
 * steps. It is the one fact that says whether a row is still worth keeping.
 */
const SUPPLIERS = (api: Door) => function SuppliersHere() {
  const rows = useAsked<{ items: readonly Row[] }>(() => api.get("supplier.list"));
  const kinds = useAsked<{ items: readonly Row[] }>(() => api.get("product.list"));
  const lead = useAsked<{ leadDays: number }>(() => api.get("product.start"));
  const [editing, setEditing] = React.useState<SupplierLine | null>(null);
  const [busy, setBusy] = React.useState(false);

  const per = new Map<string, number>();
  if (kinds.of.status === "ready") {
    for (const one of kinds.of.data.items) {
      const from = text(one.supplier);
      if (from) per.set(from, (per.get(from) ?? 0) + 1);
    }
  }

  const items: Loaded<readonly SupplierLine[]> = rows.of.status === "ready"
    ? ready(rows.of.data.items.map((row): SupplierLine => ({
      id: text(row.id),
      name: text(row.name),
      contact: text(row.contact),
      email: text(row.email),
      phone: text(row.phone),
      account: text(row.account),
      /* ⚠️ `null` RATHER THAN ZERO where nobody said — see `Supplier`. A
         supplier who has not been asked how long they take is not one who
         delivers this afternoon. */
      leadDays: row.leadDays === null || row.leadDays === undefined
        ? null
        : num(row.leadDays),
      note: text(row.note),
      products: per.get(text(row.id)) ?? 0,
    })))
    : rows.of;

  return (
    <Suppliers
      title={nameOf("/suppliers")}
      of={items}
      standingDays={lead.of.status === "ready" ? num(lead.of.data.leadDays) : 0}
      editing={editing}
      busy={busy}
      again={() => { rows.again(); kinds.again(); }}
      onOpen={setEditing}
      onNew={() => { setEditing(NOBODY); }}
      onClose={() => { setEditing(null); }}
      onSave={(of) => {
        setBusy(true);
        const body = {
          name: of.name, contact: of.contact, email: of.email, phone: of.phone,
          account: of.account, note: of.note,
          /* ⚠️ ABSENT RATHER THAN NULL where nobody said, because an absent
             field is what the collection writer leaves alone. */
          ...(of.leadDays === null ? {} : { leadDays: of.leadDays }),
        };
        void api.post(of.id ? "supplier.update" : "supplier.create",
          of.id ? { id: of.id, ...body } : body).then((got) => {
          setBusy(false);
          if (!got.ok) return;
          setEditing(null);
          rows.again();
        });
      }}
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
const START = (api: Door) => function StartHere({ app, go }: Mounted) {
  /* ⚠️ WHAT THIS PERSON HOLDS COMES WITH THE PRODUCT, NOT FROM A SECOND
     REQUEST. The centre already resolved it to draw the nav; narrowing `app`
     here is the seam working as designed — what crosses it is data, and the
     narrowing is the app's, right where it uses one. */
  const held = (app as { readonly permissions?: readonly string[] }).permissions ?? [];
  /* ⚠️ THE WORKSPACE'S OWN WORDS, WHICH IS WHAT A PROFILE IS. Asked rather than
     mapped here: a container turning `clinic` into a sentence would be a second
     copy of the vocabulary, drifting from `words.ts` the day a profile is
     added. */
  const starts = useAsked<{ words: { said: string } }>(() => api.get("product.start"));

  return (
    <Start
      title={nameOf("/start")}
      said={starts.of.status === "ready" ? starts.of.data.words.said : ""}
      done={[]}
      counts={{}}
      held={new Set(held)}
      onGo={go}
    />
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
    ["/receive", RECEIVE(api)],
    ["/count", COUNT(api)],
    ["/ask", ASK(api)],
    ["/work", WORK(api)],
    ["/run", RUN(api)],
    ["/case", CASE(api)],
    ["/item", ITEM(api)],
    ["/kit", KIT(api)],
    ["/due", DUE(api)],
    ["/labels", LABELS(api)],
    ["/reports", REPORTS(api)],
    ["/import", IMPORT(api)],
    ["/suppliers", SUPPLIERS(api)],
    ["/start", START(api)],
  ];
  for (const [route, screen] of screens) {
    if (declared.has(route)) register(INVENTORY.id, route, screen);
  }
}
