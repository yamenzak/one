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

import { newId, problem, type Problem } from "@engine/kernel";
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

async function call<T>(id: string, method: "GET" | "POST", body?: unknown): Promise<Answer<T>> {
  const query = method === "GET" && body
    ? `?${new URLSearchParams(Object.entries(body as Record<string, string>)).toString()}`
    : "";

  let res: Response;
  try {
    res = await fetch(`/api/${id}${query}`, {
      method,
      /* ⚠️ The session is a cookie the runtime sets; `same-origin` is what sends
         it back, and its absence is a sign-in that appears to work once. */
      credentials: "same-origin",
      ...(method === "POST"
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }
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
  post: <T>(id: string, input?: unknown): Promise<Answer<T>> =>
    call<T>(id, "POST", input),

  /**
   * ⚠️ THE ONE REQUEST THAT IS NOT AN OPERATION. `/health` is outside `/api/`
   * because it is what a deploy probes before anything is signed in — and it is
   * here rather than in a screen so that this file remains the only place in the
   * OneSpace that calls `fetch`.
   */
  async health(): Promise<Answer<Health>> {
    try {
      const res = await fetch("/health", { credentials: "same-origin" });
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
}
