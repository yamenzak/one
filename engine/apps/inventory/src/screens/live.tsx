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
import {
  Nothing, Screen, glyphOf, ready, trouble, useTelling, waiting, type Loaded,
} from "@engine/design";
import { dayPlus, type Day, type Problem } from "@engine/kernel";
import { inventory } from "../index.js";

/** ⚠️ The manifest is a thunk and memoises itself — see `inventory`. */
const INVENTORY = inventory();
import { hazardsIn, signalIn } from "../hazard.js";
import { coverage, stuttering } from "../count.js";
import { Count, type Change, type Counted, type Uncovered } from "./Count.js";
import { SAID, type Kept } from "./Item.js";
import { Receive, keyOf, type Noted } from "./Receive.js";
import { Ask, type Answer } from "./Ask.js";
import type { Movement } from "./Thing.js";
import { Scan, type Guess, type Seen } from "./Scan.js";
import { Stock } from "./Stock.js";
import { Home, type Moving, type Needs, type Shelf } from "./Home.js";
import { Labels, type Labelled, type Subject, type Template } from "./Labels.js";
import { Reports, type Reported, type Span } from "./Reports.js";
import { Move } from "./Move.js";
/* ⚠️ A JSON COLUMN IS WHATEVER IS IN THE COLUMN — see `packing.ts`. */
import { readLevels } from "../packing.js";
import { Start } from "./Start.js";
/* ⚠️ `Seen` IS TAKEN BY THE SCAN SCREEN, so the import's is renamed at the door.
   Two meanings of one word in one file is a rename waiting to pick the wrong
   one — the same reason `Got` is not called `Answer` above. */
import { Import, MAPPABLE, type Done, type Seen as Seeing } from "./Import.js";
import {
  Register, type Guessed, type Match, type Registering,
} from "./Register.js";
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
  /**
   * ⚠️ THE THIRD ARGUMENT IS ONLY FOR BYTES. When the body IS a file, its type
   * is a header and everything else the operation declared travels in the
   * query — which is why `with` exists at all: without it `media.upload` could
   * be called and could never be told what the file is FOR.
   */
  post<T>(
    op: string, input?: unknown,
    as?: { readonly contentType: string; readonly with?: Readonly<Record<string, string>> },
  ): Promise<{ ok: true; value: T } | { ok: false; problem: Problem }>;
  /**
   * ⚠️ WHAT THIS TAB HAS ALREADY BEEN TOLD, SYNCHRONOUSLY. The door holds one
   * answer per operation-and-input; this is how a screen seeds its first render
   * from it instead of painting a skeleton over something already known. A
   * product that cannot ask this question has no way to avoid blanking, which
   * is what "every navigation takes time" actually is.
   */
  known<T>(op: string, input?: Record<string, string>): T | undefined;
  /**
   * ⚠️ WHERE A STORED FILE CAN BE POINTED AT — the one thing the door hands back
   * that is not an answer. A photograph belongs in an `<img>`, and an `<img>`
   * takes an address rather than bytes; going through `get` would mean this app
   * holding every product picture in memory as a blob URL it then has to revoke.
   * The address is still an operation, so the roster is asked per request.
   */
  file(id: string): string;
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
/**
 * ⚠️ THE OPERATION IS THE KEY, WHICH IS WHY THERE IS NO DEPENDENCY ARRAY. This
 * took a THUNK — `() => api.get("stock.list", { limit })` — and a list of things
 * to watch, and a thunk is opaque: nothing outside it can say what was asked, so
 * nothing could hold the answer, share it with the next screen that wants the
 * same list, or know that two blocks mounting together want one request. Naming
 * the operation and its input makes all three fall out, and it deletes the deps
 * array as well — the input IS what changed.
 *
 * ⚠️ AND IT SEEDS FROM WHAT THE DOOR ALREADY HOLDS. `React.useState(waiting())`
 * is what this was, on every mount, so every navigation blanked the screen and
 * waited a round trip to redraw what the browser had painted a second earlier —
 * measured on a phone as several seconds of nothing per tap, which reads as the
 * app being slow rather than as it having thrown away the answer. It shows what
 * it has and catches up; the request still goes out and replaces it.
 *
 * ⚠️ `null` IS "DO NOT ASK", for a read behind a permission or one whose subject
 * is not chosen yet. `otherwise` is what such a screen shows — an EMPTY thing
 * rather than a wait, because "you may not read this" is an answer.
 */
function useAsked<T>(
  api: Door, id: string | null, input?: Record<string, string>, otherwise?: T,
) {
  const [tick, again] = React.useReducer((n: number) => n + 1, 0);
  /* ⚠️ ONE STRING, SO THE EFFECT WATCHES THE QUESTION RATHER THAN THE OBJECT. An
     input literal is a new object every render, so an effect keyed on it re-runs
     for ever — a request loop nobody sees until they read the network tab. */
  const key = id === null ? null : `${id}?${new URLSearchParams(input ?? {}).toString()}`;

  const seed = (): Loaded<T> => {
    if (id === null) return otherwise === undefined ? waiting() : ready(otherwise);
    const had = api.known<T>(id, input);
    return had === undefined ? waiting() : ready(had);
  };
  const [of, set] = React.useState<Loaded<T>>(seed);

  React.useEffect(() => {
    let live = true;
    /* ⚠️ ONLY WHERE THERE IS NOTHING TO SHOW. Blanking over an answer already in
       hand is the reload this exists to end. */
    set((was) => (was.status === "ready" ? was : seed()));
    if (id === null) return () => { live = false; };
    void api.get<T>(id, input).then((got) => {
      if (!live) return;
      /* ⚠️ A FAILED REFRESH OVER DATA WE HAVE IS NOT A REFUSAL SCREEN — the same
         rule every polling surface in this repository follows. */
      if (got.ok) set(ready(got.value));
      else if (api.known<T>(id, input) === undefined) set(trouble(got.problem));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  return { of, again: again as () => void };
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

/**
 * ⚠️ HOW MANY OF EACH, KEYED BY COLLECTION — and a collection this person may
 * not read is ABSENT rather than nought (`totals-ops.ts`). Optional here for
 * that reason: `?? null` at the reader is the difference between "you have none"
 * and "this is not yours to see".
 */
interface Totals { readonly counts: Readonly<Record<string, number | undefined>> }

function usePaged(run: (after: string | null) => Promise<Got<Page>>, on: readonly unknown[] = []) {
  /* ⚠️ THE ONE CHANNEL — see `telling.tsx`. A refused FIRST page becomes the
     list's own `trouble`; a refused LATER one cannot, because the rows already
     on screen are real and must not be replaced by a refusal. */
  const tell = useTelling();
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
      /*
        ⚠️ A PAGE THAT WOULD NOT LOAD SAYS SO RATHER THAN LEAVING THE LIST. The
        rows already on screen are real and must not be replaced by a refusal —
        so this cannot become a `trouble` state — but pressing "show more" and
        getting the same list back is the same dead control as anywhere else.
        `next` is left as it was, so the button stays and can be pressed again.
      */
      if (!got.ok) { tell.failed(got.problem, "Could not load any more"); return; }
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
  const places = useAsked<{ items: readonly Row[] }>(api, "location.list");
  const kinds = useAsked<{ items: readonly Row[] }>(api, "product.list");

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

/**
 * ⚠️ `file` IS THE FOURTH ARGUMENT BECAUSE A ROUTE IS THE DOOR'S TO KNOW. The
 * product row holds a media ID, and a list holds an address — resolving it once
 * here means `Line` is a shape a screen can draw and the sample world can be
 * written out by hand, neither of which is true of an id that needs a lookup.
 */
function linesOf(
  rows: readonly Row[], places: readonly Place[], kinds: readonly Row[],
  file: (id: string) => string,
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
      /* ⚠️ THE PICTURE OF RECORD, WHICH IS THE FIRST ONE — see `product.register`.
         A product photographed from six angles has one the shelf is scanned by,
         and the other five are for the page that is about it. */
      ...(of && text(of.photo) ? { photo: file(text(of.photo)) } : {}),
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

const STOCK = (api: Door) => function StockHere({ app, go }: Mounted) {
  const world = useWorld(api);
  /* ⚠️ WHAT THIS PERSON HOLDS COMES WITH THE PRODUCT, NOT FROM A SECOND
     REQUEST — the centre already resolved it to draw the nav. Same narrowing
     `START` does, for the same reason. */
  const held = React.useMemo(
    () => new Set((app as { readonly permissions?: readonly string[] }).permissions ?? []),
    [app],
  );
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
    const all = linesOf(stock.items, places, kinds.items, api.file);
    return here ? all.filter((l) => reach.has(l.where)) : all;
  });

  return (
    <Stock
      title={nameOf("/stock")}
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
      /* ⚠️ RECEIVING IS STOCK'S OWN ACT, AND THIS IS THE ONE PLACE IT IS
         OFFERED. It was `() => undefined` with a comment calling that honest;
         it stopped being honest the moment `/receive` existed, and it was the
         only thing standing between the screen and the session it names. */
      onAdd={() => go("/receive")}
      onImport={() => go("/import")}
      held={held}
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
  const kinds = useAsked<{ items: readonly Row[] }>(api, "product.list");

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
/**
 * CARRYING SOME OF A SHELF TO ANOTHER SHELF.
 *
 * ⚠️ IT IS REACHED FROM THE LINE, so the product and the shelf it is on are
 * facts this screen arrived with rather than questions it asks. What is left is
 * where to and how many, which is why the surface is three fields instead of a
 * scanning session.
 *
 * ⚠️ AND THE LADDER COMES FROM THE PRODUCT, NOT FROM THE LINE. A stock row knows
 * how many and where; how the thing is PACKAGED is a fact about the product, and
 * it is what the rung picker offers.
 */
const MOVE = (api: Door) => function MoveHere({ go, at }: Mounted) {
  const id = at[0] ?? "";
  /* ⚠️ THE ONE CHANNEL — see `telling.tsx`. Every write below could fail into
     nothing without it, which is what "the button does not do anything" is. */
  const tell = useTelling();
  const today = dayHere();
  const world = useWorld(api);
  const [busy, setBusy] = React.useState(false);

  const places = world.places.status === "ready" && world.stock.status === "ready"
    ? placesOf(world.places.data.items, world.stock.data.items)
    : [];
  const line = both(world.stock, world.kinds, (stock, kinds) =>
    pick(linesOf(stock.items, places, kinds.items, api.file), id));

  const held = line.status === "ready" ? line.data : undefined;
  /* ⚠️ THE PRODUCT'S OWN ROW, because the ladder is the product's. */
  const kind = world.kinds.status === "ready"
    ? world.kinds.data.items.find((row) => text(row.id) === (held?.product ?? ""))
    : undefined;

  /*
    ⚠️ EVERY SHELF EXCEPT THE ONE IT IS ON. A move to where it already is writes
    two rows that cancel — the balance would be right, which is exactly why the
    picker must not offer it. The door refuses it too.
  */
  const shelves = places
    .filter((one) => one.id !== (held?.where ?? ""))
    .map((one) => ({ id: one.id, name: one.name }));

  if (line.status === "ready" && !held) {
    /*
      ⚠️ AN ADDRESS NAMING A LINE THIS WORKSPACE DOES NOT HAVE IS A MISTAKE TO
      REPORT, never a blank form to fill in. Drawing the move screen over an
      empty line would offer to carry nothing from nowhere, and the person would
      find out by pressing.
    */
    return (
      <Screen shape="form" title="Move it" back={() => go("/stock")}>
        <Nothing
          /* ⚠️ THE SCREEN'S OWN NOUN, never a shrug — this emptiness is about a
             thing on a shelf, and the mark is what says which. */
          icon={glyphOf("box")}
          says="That is not on a shelf any more"
          under="Somebody moved or took the last of it"
          offer={{ label: "Back to the stock", onDo: () => go("/stock") }}
        />
      </Screen>
    );
  }

  return (
    <Move
      line={held ?? EMPTY_LINE}
      levels={readLevels(kind?.levels)}
      shelves={shelves}
      busy={busy}
      back={() => go(held ? `/thing/${id}` : "/stock")}
      onMove={({ to, quantity, rung }) => {
        if (!held) return;
        setBusy(true);
        void api.post("stock.move", {
          product: held.product,
          from: held.where,
          to,
          quantity,
          /* ⚠️ THE NAME, NEVER THE MULTIPLIER — resolved on the server against
             the ladder the product declares now. */
          ...(rung ? { rung } : {}),
          day: today,
          capture: "typed",
        }).then((got) => {
          setBusy(false);
          if (!got.ok) { tell.failed(got.problem); return; }
          tell.did("Moved.");
          world.again();
          go(`/thing/${id}`);
        });
      }}
    />
  );
};

const RECEIVE = (api: Door) => function ReceiveHere() {
  /* ⚠️ THE ONE CHANNEL — see `telling.tsx`. Every write below could fail
     into nothing before this, and several of them did. */
  const tell = useTelling();

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
        /*
          ⚠️ A CODE THAT WOULD NOT RESOLVE IS SAID OUT LOUD. This cleared the
          panel and returned — so somebody pointing a phone at a box got the
          read beep from the camera and then a screen that went blank, which
          reads as a scanner that half works. The reader has confirmed the
          digits by now; what failed is the LOOKUP, and that is a different
          sentence with a different fix.
        */
        if (!got.ok) { setSeen(null); tell.failed(got.problem); return; }
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
          product: "", name: line.name, tracking: "", unit: "", pack: 1, rung: "", levels: [],
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
            if (!got.ok) { tell.failed(got.problem); return; }
            /* ⚠️ THE OFFER GOES THE MOMENT IT IS TAKEN. An undo is not itself
               undoable, and a button that would now be refused is worse than no
               button at all. */
            setUndoable(null);
            tell.did("Put back");
            world.again();
          });
        }
        : undefined}
      onReceive={({ quantity, rung, lot, expiry }) => {
        if (!place || !seen) return;
        setBusy(true);
        void api.post<{ movement: string }>("stock.arrive", {
          raw: last,
          location: place.id,
          quantity,
          /* ⚠️ THE NAME, NEVER THE MULTIPLIER — the server resolves it against
             what the product declares now. */
          ...(rung ? { rung } : {}),
          day: today,
          year: new Date().getFullYear(),
          capture: "scanned",
          ...(lot ? { lot } : {}),
          ...(expiry ? { expiry } : {}),
        }).then((got) => {
          setBusy(false);
          if (!got.ok) { tell.failed(got.problem); return; }
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
  /* ⚠️ THE ONE CHANNEL — see `telling.tsx`. Every write below could fail
     into nothing before this, and several of them did. */
  const tell = useTelling();

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

  const tallies = useAsked<{ items: readonly Row[] }>(api, "tally.list");
  const differences = useAsked<{ items: readonly Row[] }>(
    api, session ? "count.differences" : null,
    session ? { count: session } : undefined, { items: [] });

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
  const sessions = useAsked<{ items: readonly Row[] }>(api, "count.list");
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
        /* ⚠️ SAID, FOR THE REASON ONE SCREEN OVER. A count is the flow where a
           silent scan costs most: somebody works down a rack believing every
           beep landed, and the shelf is short at the end with nothing to say
           which line it was. */
        if (!got.ok) { tell.failed(got.problem); return; }
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
          if (!got.ok) { tell.failed(got.problem); return; }
          /* ⚠️ THE SESSION ENDS HERE RATHER THAN BEING RE-READ. It is closed, and
             a screen still offering to count onto it would be offering something
             the operation now refuses. */
          setSession("");
          tell.did("Count closed");
          world.again();
        });
      }}
      again={() => { tallies.again(); differences.again(); sessions.again(); world.again(); }}
    />
  );
};

/*
  ⚠️ THE ITEM SCREEN IS A DECLARATION NOW — see `unit` in `../index.ts`. What
  stood here fetched three lists, resolved a label to a row, worked out a
  standing and wired four operations into four trays; the manifest says the
  same screen in blocks, and `AppSurface` draws a declared body ahead of any
  mount. `Item.tsx` itself stays: it is what the sample world draws, and it is
  where `SAID` lives.
*/

const LIVES: readonly Kept["life"][] = ["held", "issued", "retired"];
const lifeOf = (v: unknown): Kept["life"] =>
  LIVES.includes(v as Kept["life"]) ? (v as Kept["life"]) : "held";


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
  const stock = useAsked<{ items: readonly Row[] }>(api, "stock.list");

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

  const said = useAsked<Reported>(api, "stock.report",{ from, to: today });

  return (
    <Reports
      title={nameOf("/reports")}
      of={said.of}
      span={span}
      onSpan={setSpan}
      again={said.again}
      onOpen={(product) => go(`/thing/${product}`)}
      onSuppliers={() => go("/suppliers")}
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
  /* ⚠️ THE ONE CHANNEL — see `telling.tsx`. Every write below could fail
     into nothing before this, and several of them did. */
  const tell = useTelling();

  const today = dayHere();
  const [subject, setSubject] = React.useState<Subject>("place");
  const [template, setTemplate] = React.useState<Template>("tag");
  const [picked, setPicked] = React.useState<readonly string[]>([]);
  const [busy, setBusy] = React.useState(false);

  const world = useWorld(api);
  const items = useAsked<{ items: readonly Row[] }>(api, "unit.list");
  const kits = useAsked<{ items: readonly Row[] }>(api, "kit.list");

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
          /* ⚠️ AND NOTHING IS PRINTED ON A FAILURE. The sheet was drawn with
             blanks in it, so printing anyway puts a page of unreadable symbols
             in somebody's hand and they find out at the shelf. */
          if (!got.ok) { tell.failed(got.problem); return; }
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
  /* ⚠️ THE ONE CHANNEL — see `telling.tsx`. Every write below could fail
     into nothing before this, and several of them did. */
  const tell = useTelling();

  const today = dayHere();
  const [text, setText] = React.useState("");
  const [seen, setSeen] = React.useState<Seeing | null>(null);
  const [said, setSaid] = React.useState<Record<string, number>>({});
  const [done, setDone] = React.useState<Done | null>(null);
  const [busy, setBusy] = React.useState(false);

  /* ⚠️ THE WORKSPACE'S OWN WORDS ON THE MAPPING LABELS. A clinic mapping a
     column called "Shelf" is mapping somebody else's product — and the vocabulary
     is asked for rather than copied here, so it cannot drift from `words.ts`. */
  const starts = useAsked<{ words: { place: string } }>(api, "product.start");
  const place = starts.of.status === "ready" ? starts.of.data.words.place : "Location";

  const fields = React.useMemo(() => MAPPABLE.map((one) => (
    one.id === "location" ? { id: one.id, label: place } : one
  )), [place]);

  const see = (columns: Record<string, number>) => {
    setBusy(true);
    void api.post<Seeing>("product.preview", { text, columns }).then((got) => {
      setBusy(false);
      if (!got.ok) { tell.failed(got.problem); return; }
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
          if (!got.ok) { tell.failed(got.problem); return; }
          setDone(got.value);
        });
      }}
      onAgain={() => { setText(""); setSeen(null); setSaid({}); setDone(null); }}
    />
  );
};


/**
 * ⚠️ THE GUIDE IS TICKED BY EVENTS THIS WORKSPACE HAS ACTUALLY RAISED, never by
 * a screen deciding a step looks done. `guide.view` is the platform's one answer
 * — a tally of what happened — so a product that added a fourth way to receive
 * stock ticks the same step from all four, and the API ticks it too.
 *
 * ⚠️ AND A MILESTONE IS MARKED SEEN AFTER IT IS DRAWN, not while it is being
 * computed. A read that recorded the congratulation would spend it on a page
 * somebody loaded and closed.
 */
interface Far {
  readonly counts: Readonly<Record<string, number>>;
  /** ⚠️ What THIS person has done. Half a checklist is theirs, not the workspace's. */
  readonly mine: readonly string[];
  readonly fresh: readonly { readonly id: string }[];
  readonly said: readonly string[];
}

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
  const starts = useAsked<{ words: { said: string } }>(api, "product.start");
  const far = useAsked<Far>(api, "guide.view");
  const got = far.of.status === "ready" ? far.of.data : null;

  /* ⚠️ ONE CALL PER MILESTONE, ONCE, AND THE SCREEN DOES NOT WAIT FOR IT. The
     congratulation is already on the page; what the write buys is that it is not
     there again tomorrow, so a failure costs a repeat rather than a blank. */
  const fresh = got?.fresh ?? [];
  const marked = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const one of fresh) {
      if (marked.current.has(one.id)) continue;
      marked.current.add(one.id);
      void api.post("guide.seen", { milestone: one.id });
    }
  }, [fresh]);

  return (
    <Start
      title={nameOf("/start")}
      said={starts.of.status === "ready" ? starts.of.data.words.said : ""}
      /* ⚠️ THE EVENTS, NOT THE STEPS. `Guide` ticks a step whose `done` is in
         these lists, so handing it step ids would tick nothing and look correct.
         ⚠️ AND BOTH AXES SEPARATELY — a workspace step is anybody's to have
         done, a person step is only this person's. */
      raised={got ? { workspace: Object.keys(got.counts), person: got.mine } : null}
      counts={got?.counts ?? {}}
      /*
        ⚠️ WHILE IT IS LOADING, EVERYTHING IS "ALREADY SAID". `[]` would draw
        every reached milestone for the length of the round trip and then take
        them away — a congratulation that flickers, which is worse than one that
        arrives a beat late.
      */
      already={got ? got.said : Object.keys(INVENTORY.milestones ?? {})}
      held={new Set(held)}
      onGo={go}
    />
  );
};

/**
 * ⚠️ WHAT A REPORT LOOKS LIKE WHEN NOBODY ASKED FOR ONE. `useAsked` needs an
 * answer of the right shape whether or not the read was made, and the block it
 * feeds is not drawn at all without `ledger:read` — so this is never rendered.
 * It exists so the hook has one branch rather than two.
 */
const EMPTY_REPORT: Reported = {
  told: { recorded: 0, inferred: 0, share: 0 },
  used: [], losses: [], buy: [], daily: [],
};

/**
 * HOME — the first screen, and the one read that is really seven.
 *
 * ⚠️ EVERY BLOCK ASKS FOR ITSELF, AND THAT IS WHY THEY ARE SEPARATE READS. One
 * operation answering the whole screen would be a read that fails whole: a
 * workspace whose production runs are unreachable would lose the shelf figure
 * and the checklist with them, on the screen somebody opens first. Seven
 * requests in parallel cost one round trip and fail one block at a time.
 *
 * ⚠️ AND WHAT A PERSON MAY NOT SEE IS NOT ASKED FOR. The history, the counts and
 * the runs are three separate grants; asking anyway would put a refusal behind
 * the first screen of the product, and the block would then have to tell a
 * warehouse hand that something went wrong when nothing did. `null` travels
 * instead, and the screen leaves the row out.
 *
 * ⚠️ THE THREE TOTALS ARE ONE ASK, AND THE PLATFORM'S. They used to be three
 * list reads with `limit: 1` — the cheapest way to learn a total when the only
 * thing on offer is a list — which is three round trips, each carrying identity,
 * workspace, membership and standing, to run three `SELECT COUNT(*)`.
 * `totals.read` answers all of them at once and counts with the SAME filters the
 * lists use, so the hero cannot disagree with the screen behind it (D57).
 */
/* ------------------------------------------------------------- registering --- */

/** A row as `tag.list` and `supplier.list` answer it. */
interface Named { readonly id: string; readonly name: string }

/**
 * REGISTERING A PRODUCT — a page, with an address of its own.
 *
 * ⚠️ IT WAS A DRAWER AND THE LENGTH IS WHY IT IS NOT. Photographs, a name, tags,
 * several barcodes, how it is counted, how it keeps and who it is bought from is
 * a form that scrolls for a while; a drawer is the shape for a question the size
 * of what it asks. An address also gives it what a drawer cannot have — a
 * checklist step, an empty catalogue and a scan that found nothing can all send
 * somebody HERE, and the phone's own back gesture is a real move rather than a
 * flag being set false two screens away.
 *
 * ⚠️ THE PHOTOGRAPHS ARE UPLOADED BEFORE THE PRODUCT IS WRITTEN, not after. A
 * media row the product never referenced is an orphan the quota counts and
 * nothing points at; a product referencing a media id that failed to upload is a
 * broken picture on the one screen somebody checks a thing in their hand
 * against. Uploading first makes the failure happen before anything is claimed.
 */
const REGISTER = (api: Door) => function RegisterHere({ app, go }: Mounted) {
  const held = React.useMemo(
    () => new Set((app as { readonly permissions?: readonly string[] }).permissions ?? []),
    [app],
  );
  const may = React.useCallback((one: string) => held.has(one), [held]);
  /* ⚠️ THE ONE CHANNEL — see `telling.tsx`. Registering a product is six uploads
     and a write, and every one of those could fail into nothing before this. */
  const tell = useTelling();
  const [busy, setBusy] = React.useState(false);
  const [asked, setAsked] = React.useState<{ name: string; brand: string } | null>(null);
  const [guessed, setGuessed] = React.useState<Loaded<Guessed | null>>(ready(null));

  const tags = useAsked<{ items: readonly Named[] }>(
    api, may("product:read") ? "tag.list" : null, undefined, { items: [] });
  const suppliers = useAsked<{ items: readonly Named[] }>(
    api, may("product:read") ? "supplier.list" : null, undefined, { items: [] });
  /* ⚠️ THE CATALOGUE, READ FOR ITS UNITS ALONE — see `knownUnits`. It is already
     cached by every list screen in the product, so this costs nothing on any
     path somebody reaches this screen by. */
  const kinds = useAsked<{ items: readonly Row[] }>(
    api, may("product:read") ? "product.list" : null, undefined, { items: [] });

  /* ⚠️ THE QUESTION IS THE STATE, so the read re-runs when the name changes and
     not when the sheet re-renders. `useAsked` keys on the input's string, which
     is what makes a debounced setter enough. */
  const resembling = useAsked<{ matches: readonly Match[] }>(
    api, asked && may("product:read") ? "product.resembling" : null,
    asked ? { name: asked.name, brand: asked.brand } : undefined,
  );

  const resembles: Loaded<readonly Match[] | null> = asked === null
    ? ready(null)
    : resembling.of.status === "ready" ? ready(resembling.of.data.matches)
      : resembling.of as Loaded<readonly Match[] | null>;

  const onLook = React.useCallback((of: { name: string; brand: string }) => {
    setAsked(of);
  }, []);

  const onIdentify = React.useCallback((photos: readonly string[]) => {
    setGuessed(waiting());
    void api.post<Guessed>("product.see", {
      images: photos,
      /* ⚠️ THE WORKSPACE'S OWN WORDS GO WITH THE PICTURES. Asking a model to
         categorise against nothing produces four spellings of one kind across
         four mornings — see `product.see`. */
      known: (tags.of.status === "ready" ? tags.of.data.items : []).map((t) => t.name).join(", "),
    }).then((got) => {
      setGuessed(got.ok ? ready(got.value) : trouble(got.problem));
    });
  }, [api, tags.of]);

  /* ⚠️ WHAT THIS WORKSPACE ALREADY COUNTS IN — see the prop. */
  const units = React.useMemo(() => {
    const rows = kinds.of.status === "ready" ? kinds.of.data.items : [];
    const seen = new Map<string, string>();
    for (const row of rows) {
      const said = String((row as { unit?: unknown }).unit ?? "").trim();
      /* ⚠️ FOLDED FOR THE COMPARISON, KEPT AS WRITTEN FOR THE OFFER. `Box` and
         `box` are one unit and the one to show is the one already in use. */
      if (said && !seen.has(said.toLowerCase())) seen.set(said.toLowerCase(), said);
    }
    return [...seen.values()].map((one) => ({ id: one, label: one }));
  }, [kinds.of]);

  const onRegister = React.useCallback((of: Registering) => {
    setBusy(true);
    void (async () => {
      /*
        ⚠️ EVERY PICTURE, OR NONE OF THEM. A partial gallery is a product whose
        second angle is missing with nothing saying why, and the person who took
        six photographs has no way to tell which one did not land.
      */
      const kept: string[] = [];
      const sending = of.photos.filter((one) => bytesOf(one));
      for (const [i, one] of sending.entries()) {
        const bytes = bytesOf(one);
        if (!bytes) continue;
        /*
          ⚠️ COUNTED, BECAUSE SIX PHOTOGRAPHS TAKE FIFTEEN SECONDS. With nothing
          on screen that is indistinguishable from a button that did not fire,
          which is exactly what it was reported as. The share is per FILE rather
          than per byte: a determinate bar that jumps in sixths is honest, and
          per-byte progress across six requests needs the upload hook this path
          does not use.
        */
        tell.working(
          sending.length > 1
            ? `Sending photograph ${i + 1} of ${sending.length}`
            : "Sending the photograph",
          i / sending.length,
        );
        const put = await api.post<{ id: string }>("media.upload", bytes.body, {
          contentType: bytes.type,
          /* ⚠️ THE PURPOSE TRAVELS IN THE QUERY BECAUSE THE BODY IS THE FILE —
             see `api.post`. It is a path segment in R2 and a closed set at the
             door, so a typo here is a refusal rather than a stray bucket. */
          with: { purpose: "product-photo" },
        });
        /*
          ⚠️ AND A FAILED UPLOAD SAYS SO. This was `setBusy(false); return;` — the
          spinner stopped, the form stayed exactly as it was, and nothing
          anywhere said a photograph had been refused. A person pressing the only
          button on the screen and getting a screen back is the definition of a
          control that does nothing.
        */
        if (!put.ok) {
          setBusy(false);
          tell.failed(put.problem, sending.length > 1
            ? `Photograph ${i + 1} did not go up`
            : "The photograph did not go up");
          return;
        }
        kept.push(put.value.id);
      }
      if (sending.length) tell.working("Adding the product", 1);

      const made = await api.post<{ product: string }>("product.register", {
        name: of.name, brand: of.brand, description: of.description,
        unit: of.unit, tracking: of.tracking, whole: of.whole,
        storage: of.storage, handling: of.handling,
        reorder: of.reorder, anyway: of.anyway,
        ...(of.shelfDays === null ? {} : { shelfDays: of.shelfDays }),
        ...(of.openDays === null ? {} : { openDays: of.openDays }),
        ...(of.par === null ? {} : { par: of.par }),
        ...(of.reorderQty === null ? {} : { reorderQty: of.reorderQty }),
        ...(of.supplier ? { supplier: of.supplier } : {}),
        /* ⚠️ THE FIRST ONE IS THE PICTURE OF RECORD AND THE REST ARE THE
           GALLERY. `product.photo` is what somebody checks the thing in their
           hand against, so it is the one they took first and deliberately. */
        ...(kept.length ? { photo: kept[0], shots: kept.slice(1) } : {}),
        codes: of.codes, tags: of.tags, sources: of.sources,
        /* ⚠️ ONLY WHERE THERE IS ONE. An empty ladder and no ladder are the same
           thing to every reader, and sending `[]` would store a row saying
           somebody described the packaging as nothing. */
        ...(of.levels.length ? { levels: of.levels } : {}),
      });

      setBusy(false);
      /* ⚠️ THE OTHER SILENT RETURN, AND THE ONE THAT WAS REPORTED. Everything
         about the form was fine, the write was refused, and the handler said
         nothing at all. */
      if (!made.ok) { tell.failed(made.problem); return; }
      /* ⚠️ ARRIVING SOMEWHERE IS NOT A CONFIRMATION. Landing on the product's
         own screen looks the same whether it was just created or was already
         there — the sentence is what says which. */
      tell.did(`${of.name.trim() || "The product"} is in the catalogue`);
      tags.again();
      /* ⚠️ ONWARD TO THE THING THAT WAS JUST MADE, WHICH IS ALSO THE WAY BACK.
         A page that returned to Home would leave somebody wondering whether it
         landed; the product's own screen is the receipt. */
      go(`/thing/${made.value.product}`);
    })();
  }, [api, go, tags, tell]);

  return (
    <Register
      title={nameOf("/register")}
      back={() => go("/")}
      knownTags={(tags.of.status === "ready" ? tags.of.data.items : [])
        .map((t) => ({ id: t.id, label: t.name }))}
      /*
        ⚠️ DERIVED FROM THE CATALOGUE RATHER THAN FROM A LIST NOBODY MAINTAINS.
        There is no `unit.list` for units of MEASURE — `unit.list` is serialised
        items — and adding one to hold a handful of words the products already
        carry would be a second place for them to disagree. Distinct, in the
        order they first appear, which puts the workspace's commonest first
        without anybody ranking anything.
      */
      knownUnits={units}
      suppliers={(suppliers.of.status === "ready" ? suppliers.of.data.items : [])
        .map((one) => ({ id: one.id, label: one.name }))}
      resembles={resembles}
      onLook={onLook}
      onIdentify={onIdentify}
      guessed={guessed}
      onRegister={onRegister}
      busy={busy}
      again={() => { setGuessed(ready(null)); }}
    />
  );
}

/**
 * ⚠️ A `data:` URL BACK INTO BYTES, because the camera hands the sheet a string
 * and the store takes a file. Decoded here rather than kept as bytes all along:
 * the identify lane needs the URL, an `<img>` needs the URL, and holding both
 * shapes of six photographs is twice the memory on the device least able to
 * spare it.
 */
function bytesOf(url: string): { body: ArrayBuffer; type: string } | null {
  const at = url.indexOf(",");
  if (!url.startsWith("data:") || at < 0) return null;
  const head = url.slice(5, at);
  if (!head.endsWith(";base64")) return null;
  const raw = atob(url.slice(at + 1));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return { body: out.buffer, type: head.slice(0, -";base64".length) || "application/octet-stream" };
}

const HOME = (api: Door) => function HomeHere({ app, go }: Mounted) {
  const today = dayHere();
  const held = React.useMemo(
    () => new Set((app as { readonly permissions?: readonly string[] }).permissions ?? []),
    [app],
  );
  const may = React.useCallback((one: string) => held.has(one), [held]);

  const totals = useAsked<Totals>(api, "totals.read");

  /* ⚠️ ABSENT IS NOT NOUGHT, AND THAT IS THE PLATFORM'S RULE ARRIVING HERE. A
     collection this person may not read is missing from the answer rather than
     counted as empty — so it travels as `null` and the hero leaves it out, the
     same way the three lanes under it do. Every preset role holds all three
     keys; a role somebody built by hand need not. */
  const shelf: Loaded<Shelf> = totals.of.status === "ready"
    ? ready({
      lines: totals.of.data.counts.stock ?? null,
      products: totals.of.data.counts.product ?? null,
      places: totals.of.data.counts.location ?? null,
    })
    : totals.of as Loaded<Shelf>;

  /* ⚠️ THE SAME TWO ASKS THE EXPIRY SWEEP MAKES, so the number on this screen
     and the number in the notification cannot disagree. How many days counts as
     "soon" is a setting a person on the floor cannot read, which is why the
     arithmetic is the operation's rather than this file's. */
  const dated = useAsked<{ items: readonly Row[] }>(api, "batch.due",{ today });
  const serviced = useAsked<{ items: readonly Row[] }>(api, "unit.due",{ today });
  const sessions = useAsked<{ items: readonly Row[] }>(
    api, may("count:write") ? "count.list" : null, undefined, { items: [] });
  const runs = useAsked<{ items: readonly Row[] }>(
    api, may("process:read") ? "process.list" : null, undefined, { items: [] });

  /*
    ⚠️ WAITING IS NOT ZERO, AND NEITHER IS FORBIDDEN. A count still in flight
    draws no number rather than a confident nought — the screen would be telling
    somebody nothing needs them and then changing its mind — and a lane this
    person may not read is left out of the list entirely rather than shown as
    clear. Both are `null`; the screen distinguishes them by whether the row is
    there at all.
  */
  const many = (
    of: Loaded<{ items: readonly Row[] }>, pick: (rows: readonly Row[]) => number,
  ): number | null => (of.status === "ready" ? pick(of.data.items) : null);

  const needs: Needs = {
    due: dated.of.status === "ready" && serviced.of.status === "ready"
      ? dated.of.data.items.length + serviced.of.data.items.length
      : null,
    counts: may("count:write")
      ? many(sessions.of, (rows) => rows.filter((r) => !text(r.closed)).length)
      : null,
    runs: may("process:read")
      ? many(runs.of, (rows) => rows.filter((r) => text(r.state) === "ended").length)
      : null,
  };

  /* ⚠️ THIRTY DAYS, THROUGH THE KERNEL'S CALENDAR. A subtraction on an instant
     is 29 or 31 days across a clock change, and a home screen quietly covering
     the wrong period is one nobody can catch by looking. */
  const from = React.useMemo(() => dayPlus(today as Day, -29), [today]);
  const report = useAsked<Reported>(
    api, may("ledger:read") ? "stock.report" : null, { from, to: today }, EMPTY_REPORT);

  const moving: Loaded<Moving> | null = may("ledger:read")
    ? (report.of.status === "ready"
      ? ready({
        share: report.of.data.told.share,
        out: report.of.data.told.recorded,
        short: report.of.data.losses.reduce((n, one) => n + one.lost, 0),
        buy: report.of.data.buy.length,
        daily: report.of.data.daily,
      })
      : report.of as Loaded<Moving>)
    : null;

  const starts = useAsked<{ words: { said: string } }>(api, "product.start");
  const far = useAsked<Far>(api, "guide.view");
  const got = far.of.status === "ready" ? far.of.data : null;

  return (
    <Home
      title={nameOf("/")}
      said={starts.of.status === "ready" ? starts.of.data.words.said : ""}
      of={shelf}
      again={totals.again}
      needs={needs}
      moving={moving}
      /* ⚠️ BOTH AXES, AND `null` WHILE THE ANSWER IS STILL COMING. This read
         `Object.keys(got?.counts ?? {})`, so a workspace that had not answered
         yet was indistinguishable from one that had done nothing: the card drew
         every step under a confident "0 of 3 done" and then took most of it away
         — and the comment here said the section was held back, which `Guide`
         had no way to do because it was handed two empty lists. It takes `null`
         now and draws nothing until it knows. */
      raised={got ? { workspace: Object.keys(got.counts), person: got.mine } : null}
      held={held}
      onGo={go}
      onRegister={() => go("/register")}
      onLabels={() => go("/labels")}
      onImport={() => go("/import")}
      onSuppliers={() => go("/suppliers")}
      onDue={() => go("/due")}
      onCounts={() => go("/count")}
      onRuns={() => go("/work")}
      onReports={() => go("/reports")}
      onStart={() => go("/start")}
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
    ["/", HOME(api)],
    ["/stock", STOCK(api)],
    ["/scan", SCAN(api)],
    ["/register", REGISTER(api)],
    ["/receive", RECEIVE(api)],
    ["/move", MOVE(api)],
    ["/count", COUNT(api)],
    ["/ask", ASK(api)],
    ["/labels", LABELS(api)],
    ["/reports", REPORTS(api)],
    ["/import", IMPORT(api)],
    ["/start", START(api)],
  ];
  for (const [route, screen] of screens) {
    if (declared.has(route)) register(INVENTORY.id, route, screen);
  }
}
