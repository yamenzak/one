/**
 * THE ONE DOOR TO THE API.
 *
 * ⚠️ NOTHING IN THIS APP CALLS `fetch` DIRECTLY, and a guard enforces it. A
 * previous product had 167 bare calls and no hook for an expired session, so a
 * dead cookie did not LOOK dead: every screen rendered whatever empty state its
 * failed load produced and every save failed into a toast. An expired session
 * was indistinguishable from a deleted workspace.
 *
 * ⚠️ A REFUSAL IS A VALUE, NOT A REJECTION SOMEBODY MAY FORGET TO CATCH. The
 * platform answers every failure with a `Problem` carrying a sentence written
 * for the person reading it — so the caller's job is to show it, never to invent
 * one from a status code.
 */

import {
  newId, problem, type Instant, type Offline, type Presentation, type Problem,
} from "@engine/kernel";
import { PROBLEMS } from "./problems.js";
import { flush, hold, keyOf, recall, remember, waiting } from "./offline.js";

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
  /**
   * ⚠️ WHEN THIS ANSWER WAS TRUE, PRESENT ONLY WHEN IT CAME FROM THIS DEVICE. An
   * answer from a copy and an answer from the server are the same shape, and
   * that is exactly why they must not be the same CLAIM. A caller that ignores
   * this shows what it always showed; one that reads it can say "last seen four
   * minutes ago", which is the difference between a screen a person trusts and a
   * number nobody can date.
   */
  readonly stale?: Instant;
}
export interface No { readonly ok: false; readonly problem: Problem }
export type Answer<T> = Ok<T> | No;

/**
 * ⚠️ RAISED FROM THE CATALOGUE, LIKE EVERY OTHER REFUSAL IN THE PRODUCT. This
 * was an object literal here — the whole sentence, the tone and the
 * retryability decided in this file — which is how a refusal comes to be
 * worded differently in the two places that raise it. `problems.ts` says what
 * it is; this says when.
 */
const unreachable = (): Problem => problem(PROBLEMS, "space.unreachable");

/**
 * ⚠️ WHAT HAPPENS WHEN THE SESSION IS GONE IS ONE DECISION, MADE HERE. Left to
 * each screen it becomes several, and the ones that forget leave somebody
 * looking at a page that will never load.
 */
let onExpired: (() => void) | null = null;
export const whenSessionExpires = (run: () => void): void => { onExpired = run; };

/**
 * ⚠️ THE SIGN-IN LANE IS EXEMPT, and it has to be: a wrong code answers 401, and
 * treating that as an expiry would sign somebody out of the screen they are
 * signing in on. `me.who` is exempt for a different reason — it is what the
 * session handler itself calls, so without this a single 401 is a loop.
 */
const NOT_AN_EXPIRY = new Set(["me.code", "me.session", "me.who"]);

/* ------------------------------------------------------------- no signal --- */

/**
 * WHAT THIS DEVICE MAY DO WITHOUT A CONNECTION, PER OPERATION.
 *
 * ⚠️ HANDED OVER, NEVER DECIDED HERE. It is `offline` on a collection, carried
 * by `centre.view` — the page holds no manifest (D17), and a door working out
 * for itself which calls are safe to hold would be a second answer to a question
 * the declaration already settles. Empty until the centre arrives, which is the
 * right default: an operation this door knows nothing about is one it does not
 * hold and does not answer from a copy.
 */
let policy: Readonly<Record<string, Offline>> = {};

/** ⚠️ Every enabled product's book merged into one, because the door answers by
    operation id and an operation belongs to exactly one of them. */
const learn = (centre: unknown): void => {
  const apps = (centre as { apps?: readonly { offline?: Record<string, Offline> }[] }).apps;
  if (!apps) return;
  offlinePolicy(Object.assign({}, ...apps.map((a) => a.offline ?? {})) as Record<string, Offline>);
};

export const offlinePolicy = (book: Readonly<Record<string, Offline>>): void => {
  policy = book;
  /* ⚠️ THE FIRST CHANCE TO SEND WHAT WAS HELD IS THE MOMENT WE KNOW IT MAY BE
     SENT. A device that queued yesterday and was opened today has a connection
     and no `online` event to fire — that event says the state CHANGED. */
  void send();
};

/**
 * ⚠️ WATCHED, NEVER POLLED. `online` is the browser telling us the state
 * changed; a timer asking every few seconds is the shape `runaway.test.mjs`
 * refuses, and on a phone it is a radio kept awake for nothing.
 */
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("online", () => { void send(); });
}

/** ⚠️ ONE PASS AT A TIME. Two overlapping flushes replay the same entry twice —
    which the idempotency key survives, and which is still two requests. */
let sending: Promise<void> | null = null;

export const send = (): Promise<void> => (sending ??= (async () => {
  try {
    await flush(async (held) => {
      const out = await raw(`/api/${held.op}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": held.key },
        body: JSON.stringify(held.body ?? {}),
      });
      if (!out) return "unreachable";
      return out.ok ? "sent" : "refused";
    });
  } finally { sending = null; }
})());

export const heldHere = (): number => waiting();

/** ⚠️ `null` FOR A REQUEST THAT NEVER ARRIVED, which is not a status. */
const raw = async (url: string, init: RequestInit): Promise<Response | null> => {
  try { return await fetch(url, init); } catch { return null; }
};

/**
 * WHAT WAS ALREADY ASKED BEFORE THIS FILE EXISTED — see `index.html`.
 *
 * ⚠️ TWO ANSWERS ARE IN FLIGHT BEFORE THE BUNDLE IS. Which door this is and who
 * is here decide the first screen, so nothing can be drawn without them; asked
 * from here they were asked after several hundred kilobytes had been downloaded
 * and parsed, which made them a second wait rather than a concurrent one. An
 * inline script in the page starts both while that download is still happening
 * and leaves them on `window.__one`.
 *
 * ⚠️ CONSUMED ONCE, BECAUSE A `Response` IS READ ONCE. It is deleted as it is
 * taken, so the second ask — signing in, refreshing, a screen re-reading — is an
 * ordinary request. Left in place it would answer a signed-in caller with the
 * page's own pre-sign-in answer, permanently.
 *
 * ⚠️ AND IT IS A HEAD START, NEVER A DEPENDENCY. A preflight that failed
 * resolves to `null` and the caller asks again for real, so a page served
 * without the script — an old cached shell, a browser that refused to run it —
 * behaves exactly as it did before this existed.
 */
const early = (key: string): Promise<Response | null> | null => {
  const held = (globalThis as { __one?: Record<string, Promise<Response | null>> }).__one;
  const flying = held?.[key];
  if (!flying) return null;
  delete held![key];
  return flying;
};

const readProblem = async (res: Response): Promise<Problem> => {
  try {
    const body = await res.json() as { problem?: Problem };
    if (body.problem?.code) return body.problem;
  } catch { /* not JSON — fall through to the shape below */ }
  /* ⚠️ A REFERENCE, BECAUSE THIS IS THE ONE NOBODY CAN EXPLAIN. A response
     that is not ours has no sentence in it; what makes it reportable is
     something to quote, and `space.unexpected` asks for exactly that. */
  return problem(PROBLEMS, "space.unexpected", {}, { ref: newId("ref") });
};

/**
 * ⚠️ AN UPLOAD IS BYTES, AND THE DOOR HAS TO KNOW THAT OR A SCREEN WILL. This
 * sent everything as JSON, so the one screen that had a file to send would have
 * written its own `fetch` — and `api-door` exists precisely because 167 of those
 * is what an app written before the platform looks like. The runtime's own read
 * side already takes a raw body on an allow-list of types (`serve.ts`).
 *
 * ⚠️ AND IT IS NOT BASE64 IN A FIELD. That is a third larger on the wire, and it
 * has to be decoded before anything can read the file's own header — which is
 * the only trustworthy statement of what the file actually is.
 */
async function call<T>(
  id: string, method: "GET" | "POST", body?: unknown, contentType?: string,
): Promise<Answer<T>> {
  const query = method === "GET" && body
    ? `?${new URLSearchParams(Object.entries(body as Record<string, string>)).toString()}`
    : "";

  const raw_ = body instanceof ArrayBuffer || ArrayBuffer.isView(body);

  /* ⚠️ Only a bare GET can have been asked ahead of time — see `early`. */
  const ahead = method === "GET" && !body ? await early(id) : null;

  /* ⚠️ ASKED BEFORE THE CALL IS MADE, so the two branches below read one answer
     rather than each deciding what this operation is. */
  const how = policy[id] ?? "none";
  const cacheAt = method === "GET" && how === "cache"
    ? keyOf(id, body as Record<string, string> | undefined)
    : null;

  const res = ahead ?? await raw(`/api/${id}${query}`, {
    method,
    /* ⚠️ The session is a cookie the runtime sets; `same-origin` is what sends
       it back, and its absence is a sign-in that appears to work once. */
    credentials: "same-origin",
    ...(method === "POST"
      ? {
        headers: {
          "content-type": raw_ ? contentType ?? "application/octet-stream" : "application/json",
        },
        body: raw_ ? body as BodyInit : JSON.stringify(body ?? {}),
      }
      : {}),
  });

  if (!res) {
    /*
      ⚠️ THE REQUEST NEVER ARRIVED, AND WHAT HAPPENS NEXT IS THE COLLECTION'S
      DECISION RATHER THAN THIS FILE'S. A `queue` write is held with a key that
      makes its replay recognisable; a `cache` read is answered from what was
      last seen, WITH ITS AGE; anything else is what it has always been.
    */
    if (method === "POST" && how === "queue") {
      const key = newId("held");
      const at = new Date().toISOString();
      /* ⚠️ A DEVICE THAT CANNOT KEEP IT SAYS SO. Reporting a write as held when
         nothing holds it is the one lie the whole lane exists to avoid — it is
         somebody's work, and they would find out weeks later. */
      if (!hold(id, body, key, at)) return { ok: false, problem: problem(PROBLEMS, "space.full") };
      return { ok: false, problem: problem(PROBLEMS, "space.held") };
    }
    if (cacheAt) {
      const kept = recall(cacheAt);
      if (kept) return { ok: true, value: kept.value as T, stale: kept.at };
    }
    return { ok: false, problem: unreachable() };
  }

  if (res.ok) {
    const value = await res.json() as T;
    /*
      ⚠️ THE CENTRE IS WHERE THE DOOR LEARNS WHAT IT MAY HOLD, AND IT IS LEARNED
      HERE RATHER THAN BY A SCREEN. `offline` is a collection's declaration and
      it travels on this one read; a screen installing it would be a place that
      has to remember, and forgetting is silent — an operation nobody told the
      door about is simply never held, which reads as an offline lane that does
      not work rather than as a missing line.
    */
    if (id === "centre.view") learn(value);
    /* ⚠️ KEPT ONLY WHERE THE COLLECTION SAID SO. Keeping every answer would put
       a copy of a workspace's records on every device that ever opened it, for
       a capability nobody declared. */
    if (cacheAt) remember(cacheAt, value, new Date().toISOString());
    /* ⚠️ A CONNECTION PROVES ITSELF BY ANSWERING, so the pass that empties the
       queue rides the first call that worked rather than a timer asking. */
    if (waiting()) void send();
    return { ok: true, value };
  }

  const problem_ = await readProblem(res);
  if (res.status === 401 && !NOT_AN_EXPIRY.has(id)) onExpired?.();
  return { ok: false, problem: problem_ };
}

export const api = {
  get: <T>(id: string, input?: Record<string, string>): Promise<Answer<T>> =>
    call<T>(id, "GET", input),
  /** ⚠️ `contentType` only for BYTES — see `call`. JSON needs none. */
  post: <T>(id: string, input?: unknown, as?: { readonly contentType: string }): Promise<Answer<T>> =>
    call<T>(id, "POST", input, as?.contentType),

  /**
   * ⚠️ THE ONE REQUEST THAT IS NOT AN OPERATION. `/health` is outside `/api/`
   * because it is what a deploy probes before anything is signed in — and it is
   * here rather than in a screen so that this file remains the only place in the
   * OneSpace that calls `fetch`.
   */
  async health(): Promise<Answer<Health>> {
    /* ⚠️ The page asked this before the bundle loaded — see `early`. */
    const res = await early("health") ?? await raw("/health", { credentials: "same-origin" });
    if (!res) return { ok: false, problem: unreachable() };
    if (!res.ok) return { ok: false, problem: await readProblem(res) };
    return { ok: true, value: await res.json() as Health };
  },
};

/* -------------------------------------------------------------- the shapes --- */

export interface Health {
  readonly ok: boolean;
  /** ⚠️ Classified by the SERVER — see `door.ts`. */
  readonly door: string;
  readonly root: string;
  /** Which workspace this door is, when it is one. Reported, never derived. */
  readonly slug?: string | null;
}

/**
 * ⚠️ WHO YOU ARE EVERYWHERE, which is what OneSpace is built from. None of this
 * is a fact about one workspace, which is exactly why OneSpace can be opened
 * from any door and show the same thing.
 */
export interface Me {
  readonly accountId: string;
  readonly email: string | null;
  /**
   * ⚠️ OPTIONAL, AND THE EMAIL IS THE FALLBACK. Somebody signs in with an
   * address and may never offer a name; the account centre said so by
   * introducing everybody to themselves as `sam@example.com`.
   */
  readonly name?: string | null;
  /** ⚠️ An ACCOUNT fact — an operator stands outside every workspace (D18). */
  readonly operator?: boolean;
  readonly tenants: readonly Belonging[];
  /**
   * ⚠️ WHAT THEY STILL OWE AN AGREEMENT TO, CARRIED BY THE BOOT READ. The wall
   * has to be known before the page is chosen — asked afterwards, somebody sees
   * the product for a moment and then loses it, and every write behind it
   * refuses with a status the screen has no reason to expect.
   */
  readonly owed?: readonly Owed[];
  /**
   * ⚠️ HOW THEY READ A DATE, A NUMBER AND A QUANTITY — carried by the boot read
   * for the same reason `owed` is: the first paint has dates on it. Fetched
   * separately it arrives after the screen, so every timestamp is drawn once in
   * the browser's convention and rewritten in theirs a moment later, which is a
   * flicker on every list on every load for everybody who set a preference.
   */
  readonly presentation?: Presentation;
}

/** One document somebody has not agreed to yet. */
export interface Owed {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  /** ⚠️ A day, and it is what is being agreed to — see `DocumentDef`. */
  readonly version: string;
  readonly url: string | null;
  readonly binds: "person" | "tenant";
  readonly appId: string | null;
}

export interface Belonging {
  readonly slug: string;
  readonly name: string;
  /**
   * ⚠️ WHAT THE WORKSPACE IS (D21). Absent reads as `personal`, which is the
   * safe direction here exactly as it is at the gate: a screen that lost this
   * offers becoming a business to somebody who already is — mildly wrong — where
   * the other default would draw a brand editor over a workspace that has no
   * brand and cannot save one.
   */
  readonly kind?: "personal" | "commercial";
  readonly legalName?: string | null;
  /** One of the platform's four offices, or `null` while a claim is pending. */
  readonly platformRole?: string | null;
  readonly appRoles?: Readonly<Record<string, string>>;
  readonly apps?: readonly string[];
  /** ⚠️ Only where it is worth saying — see `me.who`. */
  readonly attention?: boolean;
  /** ⚠️ Unread notes in this workspace — see `me.who`. */
  readonly unseen?: number;
}
