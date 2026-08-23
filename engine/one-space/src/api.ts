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
  newId, problem,
  type Instant, type Offline, type Outcome, type Presentation, type Problem,
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
 * ⚠️ A TAB LEFT OPEN NEVER LEARNS THAT IT WAS REPLACED, and nothing about a
 * deploy reaches one that is already running. The runtime stamps every answer
 * with the entry bundle it would serve NOW (`VERSION_HEADER`); the first one
 * this tab sees is what it is running, and any answer that disagrees means a
 * newer version is out there.
 *
 * ⚠️ IT COMPARES WHAT IT WAS TOLD, NEVER A NUMBER OF ITS OWN. A version
 * compiled into the bundle is a second fact that has to agree with the served
 * one, and the day somebody deploys the worker without the page they disagree —
 * so every tab is told to reload, for ever, over nothing.
 *
 * ⚠️ AND IT SAYS SO ONCE. A second announcement of the same thing is a product
 * nagging somebody who has already decided to finish what they were doing.
 */
let running: string | null = null;
let onRenewed: (() => void) | null = null;
let told = false;
export const whenRenewed = (run: () => void): void => { onRenewed = run; };

const noticed = (res: Response): void => {
  const said = res.headers.get("x-one-version");
  if (!said) return;
  running ??= said;
  if (said === running || told) return;
  told = true;
  onRenewed?.();
};

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

/**
 * WHAT A WRITE SAYS WHEN IT WORKED, AND WHAT IT MADE STALE.
 *
 * ⚠️ THE OPERATION'S, NEVER THE SCREEN'S. A confirmation written where the
 * button is means two screens calling one operation are two answers to what just
 * happened — and the reads a write invalidates are usually on neither of them,
 * which is why every one of those lists was a round trip out of date until
 * somebody navigated away and back.
 */
let outcomes: Readonly<Record<string, Outcome>> = {};

/**
 * ⚠️ RAISED THROUGH A SEAM RATHER THAN HERE. This file is the door; a toast
 * belongs to the design system and forgetting a held read belongs to whatever
 * holds them, and importing either would point the dependency the wrong way.
 * One handler, installed once, exactly as an expired session is.
 */
let onWritten: ((outcome: Outcome) => void) | null = null;
export const whenWritten = (run: (outcome: Outcome) => void): void => { onWritten = run; };

/** ⚠️ Every enabled product's book merged into one, because the door answers by
    operation id and an operation belongs to exactly one of them. */
const learn = (centre: unknown): void => {
  const apps = (centre as {
    apps?: readonly {
      offline?: Record<string, Offline>;
      outcomes?: Record<string, Outcome>;
    }[];
  }).apps;
  if (!apps) return;
  offlinePolicy(Object.assign({}, ...apps.map((a) => a.offline ?? {})) as Record<string, Offline>);
  outcomes = Object.assign({}, ...apps.map((a) => a.outcomes ?? {})) as Record<string, Outcome>;
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

/**
 * ⚠️ EVERY PREFLIGHT WAS TAKEN BEFORE THERE WAS A SESSION, so a sign-in makes
 * all of them wrong at once. `me.who`'s is read at boot and never outlives
 * anything; the centre's is read by the first screen that wants it, which on
 * this door is AFTER somebody has signed in — so its answer would be the 401
 * the page got while nobody was here, and `call` reads a 401 on an operation
 * outside `NOT_AN_EXPIRY` as an expired session. Somebody would sign in and be
 * signed straight back out, once, with the cookie already set.
 *
 * ⚠️ AND IT IS EVERY KEY RATHER THAN THE ONE THAT BITES. What makes a preflight
 * stale is not which operation it is, it is when it was asked — before the
 * session existed. Naming the exception is how the next one added to the page
 * inherits the bug.
 */
const forgetEarly = (): void => {
  delete (globalThis as { __one?: unknown }).__one;
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

  /* ⚠️ BEFORE THE BRANCHES, so a refusal reports the version too — a deployment
     somebody is mid-way through is exactly when a browser is likeliest to be
     holding the old half. */
  noticed(res);

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
    /* ⚠️ THE MOMENT EVERY PREFLIGHT BECAME WRONG — see `forgetEarly`. */
    if (id === "me.session") forgetEarly();
    /*
      ⚠️ ONCE, AND ONLY WHERE THE OPERATION DECLARED ONE. Silence is what an
      operation that has said nothing means; a default the platform invented
      would put a toast under every generated verb, which on an autosaving screen
      is one per keystroke.
    */
    const said = method === "POST" ? outcomes[id] : undefined;
    if (said) onWritten?.(said);
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

/* ------------------------------------------------------------- one asking --- */

/**
 * WHAT THIS TAB HAS ALREADY BEEN TOLD, AND WHAT IT IS IN THE MIDDLE OF ASKING.
 *
 * ⚠️ IT IS THE DOOR'S BECAUSE THE KEY IS THE DOOR'S. An answer is identified by
 * the operation and its input and by nothing else, and this is the one place
 * both are in hand — so a cache anywhere above it is a second key for one
 * question, which is how two screens reading the same collection came to make
 * two requests for it and hold two copies that could disagree.
 *
 * ⚠️ AND `flight` IS THE HALF THAT SAVES THE DATABASE RATHER THAN THE PHONE.
 * Answers held only help a SECOND visit; coalescing helps the first, because a
 * screen mounting three blocks that each want the catalogue is three identical
 * queries arriving within a frame of each other. They share the promise now, so
 * the workspace is asked once.
 *
 * ⚠️ PER TAB, AND THAT IS WHY NOTHING HERE IS INVALIDATED ON SIGN-OUT BY HAND. A
 * reload is what ends a session and a reload is what empties this.
 */
const answers = new Map<string, unknown>();
const flight = new Map<string, Promise<Answer<unknown>>>();

/**
 * ⚠️ AND IT IS BOUNDED, BECAUSE NOTHING ELSE EMPTIES IT. `forget` runs when a
 * write says an answer is untrue; nothing runs when an answer is merely old and
 * unwanted. A long session moving through workspaces, lists and narrowings keeps
 * every one of them — each a whole payload — for as long as the tab is open,
 * and on a phone that is memory a background tab gets killed for.
 *
 * ⚠️ OLDEST OUT, WHICH A `Map` GIVES FOR FREE: insertion order is iteration
 * order, and deleting before setting moves a key to the end. Recency is kept by
 * the FETCH rather than by `known`, and that is deliberate — `known` is read
 * during render, where reordering a store is a side effect nobody expects. It
 * costs nothing here: `useLoad` asks again on every mount, so a screen being
 * revisited re-remembers its own key on the way in, and the key evicted is the
 * one no screen has asked for longest.
 *
 * ⚠️ EVICTING IS NOT LOSING. The next ask fetches it again, exactly as a first
 * visit does. The cap trades one round trip on a rarely-revisited screen for a
 * bound on memory, which is the right way round.
 */
const KEEP = 64;

const keep = (key: string, value: unknown): void => {
  answers.delete(key);
  answers.set(key, value);
  while (answers.size > KEEP) {
    const oldest = answers.keys().next();
    if (oldest.done) break;
    answers.delete(oldest.value);
  }
};

/**
 * WHEN A TAB COMES BACK, WHAT IT HOLDS IS OLD.
 *
 * ⚠️ A TAB LEFT OPEN IS THE ORDINARY CASE, not an edge one — a phone locked in a
 * pocket, a laptop shut, a tab behind eleven others. It comes back showing
 * whatever was true when it was last looked at, confidently, with nothing saying
 * how old that is; the only thing that refreshes it is navigating somewhere that
 * happens to re-ask.
 *
 * ⚠️ SO THE ANSWERS ARE DROPPED, NOT REFETCHED. Refetching from here would fire
 * every held key at once the moment a tab is focused — a thundering herd on the
 * one thing that just woke up — and most of those answers are for screens
 * nobody is looking at. Dropping them costs nothing: the screen that IS mounted
 * re-asks on its next render and everything else is fetched if and when it is
 * wanted again.
 *
 * ⚠️ AND ONLY AFTER LONG ENOUGH TO MATTER. Every tab switch is a
 * `visibilitychange`, so dropping on each one would make an alt-tab a refetch of
 * the visible screen — the cost of a stale answer for ninety seconds is nothing,
 * and the cost of re-reading on every glance is a round trip a person watches.
 *
 * ⚠️ WATCHED, NEVER POLLED, exactly as `online` is above: the browser says when
 * this changed, and `runaway.test.mjs` refuses a timer that asks.
 */
const AWAY_MS = 90_000;
let hidAt = 0;

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hidAt = Date.now(); return; }
    if (hidAt && Date.now() - hidAt >= AWAY_MS) answers.clear();
    hidAt = 0;
  });
}

/**
 * ⚠️ A RECONNECTION IS THE SAME CLAIM. Everything held was read on the other
 * side of an outage of unknown length, so it is exactly as datable as an answer
 * from a tab that has been shut — and `online` fires only when the state
 * CHANGED, so this cannot repeat while a connection is merely poor.
 */
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("online", () => { answers.clear(); });
}

/**
 * ⚠️ SYNCHRONOUS, WHICH IS THE WHOLE POINT. A hook that has to await its own
 * cache renders `waiting` for a frame first, and a frame of skeleton over an
 * answer the tab already holds is the blank navigation this exists to end.
 */
export const known = <T>(id: string, input?: Record<string, string>): T | undefined =>
  answers.get(keyOf(id, input)) as T | undefined;

/**
 * ⚠️ WHAT A WRITE MADE UNTRUE. Without an id every answer goes, which is what a
 * sign-out or a workspace switch means; with one, every input of that operation
 * — a list narrowed four ways is four keys and one write invalidates all of them.
 */
export const forget = (id?: string): void => {
  if (!id) { answers.clear(); return; }
  for (const key of [...answers.keys()]) {
    if (key === id || key.startsWith(`${id}?`)) answers.delete(key);
  }
};

export const api = {
  /**
   * ⚠️ ONE ASKING PER QUESTION IN FLIGHT, AND THE ANSWER KEPT. Both are here
   * rather than in a hook — see `answers`. A GET is idempotent by construction
   * (the runtime routes reads this way), so two callers wanting the same thing
   * at the same moment want the same request.
   *
   * ⚠️ A REFUSAL IS NOT KEPT. Holding "it failed" would answer the retry with
   * the failure, which is a product that cannot recover from one dropped packet
   * until somebody reloads it.
   */
  get: <T>(id: string, input?: Record<string, string>): Promise<Answer<T>> => {
    const key = keyOf(id, input);
    const already = flight.get(key);
    if (already) return already as Promise<Answer<T>>;
    const asking = call<T>(id, "GET", input).then((got) => {
      if (got.ok && got.stale === undefined) keep(key, got.value);
      return got;
    }).finally(() => { flight.delete(key); });
    flight.set(key, asking as Promise<Answer<unknown>>);
    return asking;
  },
  /**
   * ⚠️ ON THE DOOR AS WELL AS BESIDE IT, because a product is handed this
   * object and nothing else. A cache reachable only by `import` is a cache the
   * platform's own screens get and every app writes again — which is what
   * happened, at forty-five call sites.
   */
  known,

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
  /** What this workspace is on. Absent on a deployment that sells nothing. */
  readonly plan?: string | null;
  /**
   * ⚠️ WHETHER ANYBODY IS PAYING FOR IT, ON THE LIST SOMEBODY LANDS ON. A
   * workspace that was given is one of the few facts worth a chip in a list of
   * names — it has no card, it may have a term, and the person holding it should
   * not have to open a billing screen to learn either.
   */
  readonly given?: { readonly at: string; readonly until: string | null } | null;
  /** ⚠️ Unread notes in this workspace — see `me.who`. */
  readonly unseen?: number;
}
