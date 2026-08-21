/**
 * WHAT THIS DEVICE HOLDS WHEN THERE IS NO SIGNAL — the queue and the last answer.
 *
 * ⚠️ A COLLECTION DECLARES THIS AND THIS FILE OBEYS IT. Which operations may be
 * held and which may be answered from a copy is `offline` on the collection,
 * carried to the page by `centre.view`; nothing here decides. A door working out
 * for itself which calls are safe to hold would be a second answer to a question
 * the manifest already settles, and the failure is silent in the worst
 * direction — a read answered from last week with nothing saying so.
 *
 * ⚠️ IT IS `localStorage`, AND THE CEILING IS THE HONEST PART. A queued write is
 * a small object and a browser gives about five megabytes, which is thousands of
 * them — but a stocktake in a warehouse with no signal is exactly the workload
 * that finds the end of it. **A queue that silently drops is worse than one that
 * refuses**, so it refuses, with a sentence saying the device is full, and
 * nothing already held is ever discarded to make room for something newer.
 *
 * ⚠️ AND IT IS PER ORIGIN, WHICH IS PER WORKSPACE. Every workspace here has its
 * own host, so one studio's held writes cannot be replayed against another's —
 * that is the browser's own boundary rather than a prefix we remembered to add.
 * What it does NOT separate is two people sharing a device, so signing out
 * clears both halves.
 */

import type { Instant } from "@engine/kernel";

/* ------------------------------------------------------------------ shape --- */

export interface Held {
  readonly id: string;
  readonly op: string;
  readonly body: unknown;
  /**
   * ⚠️ MADE ONCE, WHEN THE CALL WAS FIRST HELD, AND SENT ON EVERY ATTEMPT. It is
   * what lets the platform recognise the repeat: a phone that queued a write
   * cannot know whether the first attempt landed, so it asks again, and without
   * this a shelf counted once is counted twice.
   */
  readonly key: string;
  readonly at: string;
}

const QUEUE = "one.offline.queue";
const SEEN = "one.offline.seen.";

/**
 * ⚠️ ABOUT A QUARTER OF WHAT A BROWSER GIVES, AND DELIBERATELY NOT ALL OF IT.
 * The queue shares the origin's storage with the cached reads and with whatever
 * the shell keeps; a queue allowed to fill it would evict the very list somebody
 * is working against.
 */
const CEILING = 1_000_000;

/* ⚠️ EVERY READ AND EVERY WRITE IS GUARDED. A private window, cleared site data,
   a browser set to refuse storage — each of them THROWS on access rather than
   answering empty, and an uncaught one takes the screen down at the moment
   somebody has no connection, which is the moment it matters most. */
const store = (): Storage | null => {
  try {
    const held = globalThis.localStorage;
    held.getItem(QUEUE);
    return held;
  } catch { return null; }
};

const readQueue = (): Held[] => {
  const at = store();
  if (!at) return [];
  try { return JSON.parse(at.getItem(QUEUE) ?? "[]") as Held[]; } catch { return []; }
};

const writeQueue = (held: readonly Held[]): boolean => {
  const at = store();
  if (!at) return false;
  try { at.setItem(QUEUE, JSON.stringify(held)); return true; } catch { return false; }
};

/* ------------------------------------------------------------------ queue --- */

export const waiting = (): number => readQueue().length;

/**
 * Hold a write until there is a connection.
 *
 * ⚠️ IT ANSWERS WHETHER IT TOOK IT, and the caller says so. A `false` here is a
 * write that is NOT coming back — the device is full, or this browser keeps
 * nothing — and reporting it as held would be the one lie this whole file exists
 * to avoid.
 */
export const hold = (op: string, body: unknown, key: string, at: string): boolean => {
  const queue = readQueue();
  const next = [...queue, { id: key, op, body, key, at }];
  if (JSON.stringify(next).length > CEILING) return false;
  return writeQueue(next);
};

/**
 * Send what is held, oldest first.
 *
 * ⚠️ IN ORDER, AND IT STOPS AT THE FIRST ONE THAT CANNOT BE SENT. A create and
 * the update that follows it are two entries about one record; replayed out of
 * order the update lands against nothing. So a failure to REACH the server ends
 * the pass and leaves the rest where they are.
 *
 * ⚠️ AND AN ANSWER — ANY ANSWER — REMOVES THE ENTRY. A refusal is the server
 * having an opinion, and an entry retried against a settled opinion is a device
 * asking a closed door for ever. What a person can do about it is the same
 * whether it was accepted or refused: nothing, and it is off the queue.
 */
export const flush = async (
  send: (held: Held) => Promise<"sent" | "refused" | "unreachable">,
): Promise<{ readonly sent: number; readonly refused: number; readonly left: number }> => {
  let sent = 0;
  let refused = 0;
  let queue = readQueue();
  while (queue.length) {
    const first = queue[0]!;
    const how = await send(first);
    if (how === "unreachable") break;
    if (how === "sent") sent++; else refused++;
    queue = queue.slice(1);
    writeQueue(queue);
  }
  return { sent, refused, left: queue.length };
};

/* ------------------------------------------------------------------ cache --- */

interface Kept { readonly at: string; readonly value: unknown }

/** ⚠️ Keyed on the operation AND its input, so a filtered list is not the
    unfiltered one's answer under a different question. */
export const keyOf = (op: string, input?: Record<string, string>): string =>
  input && Object.keys(input).length
    ? `${op}?${new URLSearchParams(Object.entries(input)).toString()}`
    : op;

export const remember = (key: string, value: unknown, at: string): void => {
  const store_ = store();
  if (!store_) return;
  /* ⚠️ A FULL DEVICE COSTS A CACHED READ AND NEVER A HELD WRITE. Losing an
     answer we can ask for again is nothing; losing a write is somebody's work. */
  try { store_.setItem(SEEN + key, JSON.stringify({ at, value })); } catch { /* full */ }
};

/**
 * ⚠️ THE AGE COMES BACK WITH IT, ALWAYS. An answer from a copy and an answer
 * from the server are the same shape and must never be the same claim — "last
 * seen four minutes ago" is the difference between a screen a person can trust
 * and one that shows them a number nobody can date.
 */
export const recall = (key: string): { readonly value: unknown; readonly at: Instant } | null => {
  const store_ = store();
  if (!store_) return null;
  try {
    const raw = store_.getItem(SEEN + key);
    if (!raw) return null;
    const kept = JSON.parse(raw) as Kept;
    return { value: kept.value, at: kept.at as Instant };
  } catch { return null; }
};

/**
 * ⚠️ BOTH HALVES GO WITH THE SESSION. A device is shared — a counter's phone, a
 * shop's tablet — and what one person's workspace answered must not be the next
 * person's first screen. Held writes go too: they carry that person's session's
 * authority and nothing else can send them.
 */
export const forget = (): void => {
  const at = store();
  if (!at) return;
  try {
    at.removeItem(QUEUE);
    /* ⚠️ `key(i)`, NOT `Object.keys`. Enumerating a `Storage` as an object works
       in a browser and is not the interface — it relies on the host exposing
       every entry as an own property, which nothing specifies. And the names are
       collected BEFORE any are removed, because removing shifts every index
       after it and a loop reading as it deletes clears half of them. */
    const names: string[] = [];
    for (let i = 0; i < at.length; i++) {
      const key = at.key(i);
      if (key?.startsWith(SEEN)) names.push(key);
    }
    for (const key of names) at.removeItem(key);
  } catch { /* nothing to clear */ }
};
