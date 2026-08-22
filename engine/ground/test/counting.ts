/**
 * HOW MANY TIMES SOMETHING TALKS TO A DATABASE, COUNTED.
 *
 * ⚠️ A LATENCY BUDGET IS THE ONE PROPERTY NO BEHAVIOURAL TEST CAN SEE. Every
 * query on a request path is correct, cheap in isolation, and covered — what is
 * wrong is how MANY there are, and how many of them wait for each other. On a
 * deployment whose database is a continent away each one is a hundred
 * milliseconds, so the count IS the speed.
 *
 * ⚠️ AND SEQUENTIAL IS THE NUMBER THAT MATTERS, not the total. Four queries
 * awaited together cost one wait; four awaited in turn cost four. The depth is
 * measured by watching what is in flight: a query that starts while another is
 * still open did not wait for it.
 */

import type { Db } from "@engine/runtime";

export interface Counted {
  readonly db: Db;
  /** Every statement that crossed the wire. */
  readonly trips: () => number;
  /** ⚠️ The longest chain of queries that WAITED for each other — the real cost. */
  readonly depth: () => number;
  readonly reset: () => void;
  /** Every statement, wave-numbered. `|` marks one that did not wait. */
  readonly said: () => readonly string[];
}

/**
 * ⚠️ ONE CLOCK ACROSS EVERY DATABASE, AND THE FIRST VERSION OF THIS DID NOT HAVE
 * ONE. A request touches the directory and a shard, so counting each separately
 * and adding the depths reports two queries running side by side as two waits —
 * exactly the parallelism the measurement exists to reward. The wave is a
 * property of the REQUEST, not of a connection.
 */
export interface Waves {
  readonly start: () => void;
  readonly done: () => void;
  readonly depth: () => number;
  readonly open: () => number;
  readonly reset: () => void;
}

export function waves(): Waves {
  let depth = 0;
  let open = 0;
  return {
    /* ⚠️ A NEW WAVE BEGINS WHENEVER NOTHING IS IN FLIGHT. Anything started while
       something else is open is running beside it and costs no extra wait. */
    start: () => { if (open === 0) depth++; open++; },
    done: () => { open--; },
    depth: () => depth,
    open: () => open,
    reset: () => { depth = 0; open = 0; },
  };
}

export function counting(real: Db, clock: Waves): Counted {
  let trips = 0;
  const start = () => { clock.start(); trips++; };
  const done = () => { clock.done(); };

  const watch = async <T>(made: Promise<T>, query: string): Promise<T> => {
    start();
    said.push(`${String(clock.depth()).padStart(2)} ${clock.open() > 1 ? "|" : " "} `
      + query.replace(/\s+/g, " ").slice(0, 90));
    try { return await made; } finally { done(); }
  };

  const said: string[] = [];

  type Made = ReturnType<ReturnType<Db["prepare"]>["bind"]>;
  const wrap = (made: Made, query: string) => ({
    all: <T = Record<string, unknown>>() => watch(made.all<T>(), query),
    first: <T = Record<string, unknown>>() => watch(made.first<T>(), query),
    run: () => watch(made.run(), query),
  });

  const db: Db = {
    prepare: (query: string) => {
      const made = real.prepare(query);
      return {
        ...wrap(made as Made, query),
        bind: (...values: unknown[]) => wrap(made.bind(...values), query),
      };
    },
    exec: (query: string) => watch(real.exec(query) as Promise<unknown>, query),
  };

  return {
    db,
    trips: () => trips,
    depth: () => clock.depth(),
    reset: () => { trips = 0; said.length = 0; },
    /** ⚠️ What was asked, wave-numbered — the way to SEE a chain rather than count it. */
    said: () => said,
  };
}
