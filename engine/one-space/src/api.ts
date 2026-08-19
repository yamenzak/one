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

import { newId, problem, type Presentation, type Problem } from "@engine/kernel";
import { PROBLEMS } from "./problems.js";

export interface Ok<T> { readonly ok: true; readonly value: T }
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

  const raw = body instanceof ArrayBuffer || ArrayBuffer.isView(body);

  /* ⚠️ Only a bare GET can have been asked ahead of time — see `early`. */
  const ahead = method === "GET" && !body ? await early(id) : null;

  let res: Response;
  try {
    res = ahead ?? await fetch(`/api/${id}${query}`, {
      method,
      /* ⚠️ The session is a cookie the runtime sets; `same-origin` is what sends
         it back, and its absence is a sign-in that appears to work once. */
      credentials: "same-origin",
      ...(method === "POST"
        ? {
          headers: {
            "content-type": raw ? contentType ?? "application/octet-stream" : "application/json",
          },
          body: raw ? body as BodyInit : JSON.stringify(body ?? {}),
        }
        : {}),
    });
  } catch {
    return { ok: false, problem: unreachable() };
  }

  if (res.ok) return { ok: true, value: await res.json() as T };

  const problem = await readProblem(res);
  if (res.status === 401 && !NOT_AN_EXPIRY.has(id)) onExpired?.();
  return { ok: false, problem };
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
    try {
      /* ⚠️ The page asked this before the bundle loaded — see `early`. */
      const res = await early("health") ?? await fetch("/health", { credentials: "same-origin" });
      if (!res.ok) return { ok: false, problem: await readProblem(res) };
      return { ok: true, value: await res.json() as Health };
    } catch {
      return { ok: false, problem: unreachable() };
    }
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
