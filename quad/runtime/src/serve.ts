/**
 * ONE REQUEST, ONE PATH THROUGH THE PLATFORM.
 *
 * ⚠️ EVERY CROSS-CUTTING CONCERN HAPPENS HERE AND NOWHERE ELSE (D12). The door,
 * the tenancy, the replay, all seven gates, the audit entry and the shape of a
 * refusal are applied to every operation by this function — because the moment
 * one of them is something a handler CALLS, it is something a handler can
 * forget, and a forgotten one is invisible: no error, no failing test, a
 * capability that silently does not apply.
 *
 * ⚠️ THE HANDLER NEVER SEES THE REQUEST, THE ENV OR A BINDING. It gets its own
 * tenant's database, who is asking, the time, and a way to refuse. Anything more
 * would let an app reach around the platform, and then the platform's guarantees
 * would be things apps opt into.
 *
 * ⚠️ AND THE ORDER IS THE DESIGN. Replay before the gates, because answering a
 * duplicate must not spend a credit or take a seat. Gates in the kernel's fixed
 * order, because each position decides which sentence somebody is shown first.
 * Audit after the outcome, including when the outcome is a refusal.
 */

import type { AppSpec, Caller, Door, Problem, Resolved as _Resolved, Roots, Standing } from "@quad/kernel";
import { IN_GOOD_STANDING, PLATFORM_PROBLEMS, check, doorFor, newId, problem } from "@quad/kernel";
import { compose, type Composed, type Resolved as ResolvedOp } from "./compose.js";
import { answerMcp } from "./mcp.js";
import type { PlatformCtx } from "./member-ops.js";
import { keyFor, record, remember, seen, entryFor } from "./audit.js";
import { clearCookie, sessionIdFrom, setCookie, type Session } from "./identity.js";
import { whoIs, type PersonalBook, type PersonalCtx } from "./personal.js";
import type { TenantRow } from "./directory.js";
import type { Db } from "./sql.js";

/* ------------------------------------------------------------------ seams --- */

/**
 * ⚠️ WHO IS ASKING IS INJECTED, and that is the seam identity fills. Until it
 * does, a deployment that answered as somebody would be one whose gates are
 * decoration — so the default is nobody, and the caller with no session is
 * refused by the permission gate exactly as they should be.
 *
 * ⚠️ PERMISSIONS ARE A FUNCTION OF WHICH APP IS ASKING (D15). A flat set here
 * was the multi-app bug: it was resolved against ONE app's registry — whichever
 * happened to be first on the tenant's list — so a role in the second product
 * granted nothing, silently, on every request. The gate resolves the set for
 * the app the operation belongs to; `null` is the platform's own context.
 */
export interface Who {
  readonly accountId: string | null;
  readonly email?: string | null;
  readonly signedIn: boolean;
  readonly provenAt: string | null;
  readonly permissionsIn: (appId: string | null) => Promise<ReadonlySet<string>>;
}

const NONE: ReadonlySet<string> = new Set();

export const NOBODY: Who = {
  accountId: null,
  signedIn: false,
  provenAt: null,
  permissionsIn: async () => NONE,
};

export interface Wiring {
  readonly roots: Roots;
  /** ⚠️ A thunk per app, so composing one does not compose the others (D4). */
  readonly apps: Readonly<Record<string, () => AppSpec>>;
  readonly directory: Db;
  /** Resolve a tenant's slug (or custom host) to where its records are. */
  readonly locate: (door: Door) => Promise<Located | null>;
  readonly identify?: (request: Request, located: Located) => Promise<Who>;
  readonly now?: () => Date;
  /**
   * ⚠️ THE OPERATIONS ABOUT YOURSELF, WHICH RESOLVE NO WORKSPACE. Somebody has
   * to be able to sign in and make their first workspace while they belong to
   * nothing, and no role can express that — see `personal.ts`.
   */
  readonly personal?: PersonalBook;
  readonly shardOf?: (tenant: TenantRow) => Db;
}

export interface Located {
  readonly tenantId: string;
  readonly db: Db;
  /** Which products this workspace has switched on, in the order to search. */
  readonly apps: readonly string[];
  readonly standing?: Standing;
  readonly entitlements?: Parameters<typeof check>[0]["entitlements"];
  readonly flags?: Readonly<Record<string, boolean>>;
  readonly balance?: number;
  readonly used?: (key: string) => number;
}

/* ------------------------------------------------------------------ serve --- */

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const asProblem = (p: Problem): Response => json({ problem: p }, p.status);

export function serve(wiring: Wiring): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const now = wiring.now?.() ?? new Date();
    const url = new URL(request.url);
    const door = doorFor(url.host, wiring.roots);

    /*
      ⚠️ THE PLATFORM'S OWN CATALOGUE, NOT AN EMPTY ONE. A refusal raised before
      an app is resolved has no app catalogue to draw on, and `problem` answers
      an unknown code with `unavailable` — so passing `{}` here turned every
      "that is not here" into "something went wrong on our side", which is a
      different sentence, a different status, and a page somebody reports.
    */
    /* ⚠️ An unrecognised host is nothing, never a default — see `doorFor`. */
    if (door.kind === "none") return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));

    /*
      ⚠️ THE DOOR IS REPORTED, SO THE BROWSER NEVER CLASSIFIES ITS OWN HOSTNAME.
      A second classifier in the page is a second set of reserved labels and a
      second idea of what a custom domain is — and when the two disagree, the
      page offers a control the runtime refuses, which arrives as a 404 nobody
      can explain. `root` comes with it for the same reason: the addresses of the
      other doors are derived from a fact the deployment holds, not from a
      constant baked into a bundle at build time.
    */
    if (url.pathname === "/health") {
      return json({ ok: true, door: door.kind, root: wiring.roots.root });
    }
    /*
      ⚠️ THE AGENT DOOR, AND IT IS THE SAME BUILDING (D13). `/mcp` answers on a
      tenant's own address with the tenant's own tools — a projection of the
      operations the caller could already reach over `/api/*`, entered through
      `performOperation` below so every gate, the replay and the audit apply
      identically. A separate agent deployment would be a second copy of all of
      them.
    */
    if (url.pathname === "/mcp") return answerMcp(wiring, request, door, now);
    if (!url.pathname.startsWith("/api/")) return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));

    const id = url.pathname.slice("/api/".length);

    /*
      ⚠️ THE PERSONAL LANE IS ANSWERED BEFORE A WORKSPACE IS RESOLVED, and it has
      to be: the caller is outside every workspace at the moment they need it.
      It is also outside the standing gate — leaving must never be something an
      unpaid invoice can prevent.
    */
    const own = wiring.personal?.[id];
    if (own) return answerPersonal(wiring, own, id, request, url, door, now);
    if (door.kind !== "tenant") return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));

    const located = await wiring.locate(door);
    if (!located) return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));

    /* ⚠️ ONLY THE APP THE OPERATION BELONGS TO IS COMPOSED (D4). Searching the
       tenant's own list rather than every registered app is what keeps the cost
       of a request proportional to the workspace instead of to the catalogue. */
    let found: { readonly composed: Composed; readonly op: _Op } | null = null;
    for (const appId of located.apps) {
      const make = wiring.apps[appId];
      if (!make) continue;
      const composed = compose(make());
      const op = composed.byId.get(id);
      if (op) { found = { composed, op }; break; }
    }
    if (!found) return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));

    const { composed, op } = found;
    const catalog = composed.catalog;
    const expects = op.kind === "read" ? "GET" : "POST";
    if (request.method !== expects) return asProblem(problem(catalog, "platform.not_found"));

    const input = await readInput(request, url);
    if (input === null) return asProblem(problem(catalog, "platform.invalid"));

    const who = (await wiring.identify?.(request, located)) ?? NOBODY;

    const outcome = await performOperation(
      wiring, located, who, { composed, op }, input,
      request.headers.get("idempotency-key"), now,
    );
    switch (outcome.kind) {
      case "replay": return json(outcome.answer, 200, { "idempotent-replay": "true" });
      case "ok": return json(outcome.answer ?? {});
      case "refused": return asProblem(outcome.problem);
    }
  };
}

/* -------------------------------------------------------------- the path --- */

export type Performed =
  | { readonly kind: "replay"; readonly answer: unknown }
  | { readonly kind: "ok"; readonly answer: unknown }
  | { readonly kind: "refused"; readonly problem: Problem };

/**
 * ⚠️ THE ONE OPERATION PATH, WHATEVER DOOR THE CALL CAME THROUGH (D12). The
 * HTTP route and the agent door both end here — replay, the seven gates in the
 * kernel's order, the handler, the audit entry for successes and refusals
 * alike. A second copy for "the MCP ones" would be a second place every
 * cross-cutting concern has to be remembered, which is the exact shape this
 * framework exists to refuse.
 */
export async function performOperation(
  wiring: Wiring, located: Located, who: Who,
  found: { readonly composed: Composed; readonly op: ResolvedOp },
  input: Record<string, unknown>, given: string | null, now: Date,
): Promise<Performed> {
  const { composed, op } = found;
  const catalog = composed.catalog;

  /* --- a replay is answered before anything is spent ---------------------- */

  const mode = op.spec.idempotency.mode;
  const replayKey = mode === "key" && given
    ? keyFor(located.tenantId, op.id, given)
    : mode === "natural" && typeof input[op.spec.idempotency.key] === "string"
      ? keyFor(located.tenantId, op.id, String(input[op.spec.idempotency.key]))
      : null;

  if (replayKey) {
    const already = await seen(located.db, located.tenantId, replayKey);
    if (already !== null) return { kind: "replay", answer: already };
  }

  /* --- the gates, in the kernel's order ----------------------------------- */

  /* ⚠️ Resolved for the app THIS operation belongs to (D15) — the flat set the
     caller used to carry was whichever app was first on the tenant's list. */
  const caller: Caller = {
    signedIn: who.signedIn,
    permissions: await who.permissionsIn(composed.app.id),
    provenAt: who.provenAt,
  };

  const refused = check({
    op: op.spec,
    caller,
    standing: located.standing ?? IN_GOOD_STANDING,
    entitlements: located.entitlements ?? [],
    flags: located.flags ?? {},
    used: located.used ?? (() => 0),
    ledger: { balance: located.balance ?? 0 },
    now: now.toISOString(),
    catalog,
  });
  if (refused) {
    await recordOutcome(located, who, op, input, { ok: false, problem: refused.problem.code }, now);
    return { kind: "refused", problem: refused.problem };
  }

  /* --- the handler -------------------------------------------------------- */

  /* ⚠️ THE PLATFORM'S OWN OPERATIONS SEE MORE THAN A HANDLER DOES — the
     directory, the caller's keys, the allowances — and an app handler is
     typed against `Ctx`, which carries none of it. See `member-ops.ts`. */
  const ctx: PlatformCtx = {
    db: located.db,
    tenantId: located.tenantId,
    accountId: who.accountId,
    now,
    directory: wiring.directory,
    permissions: caller.permissions,
    permissionsIn: who.permissionsIn,
    appOf: (appId) => wiring.apps[appId]?.() ?? null,
    enabledApps: located.apps,
    email: who.email ?? null,
    allowance: (key: string) =>
      (located.entitlements ?? []).find((e) => e.key === key)?.value ?? false,
    fail: (code, values) => { throw new Refused(problem(catalog, code, values)); },
  };

  try {
    const answer = await op.run(ctx, input);
    if (replayKey) await remember(located.db, located.tenantId, op.id, replayKey, answer, now);
    await recordOutcome(located, who, op, input, {
      ok: true, id: (answer as { id?: string } | null)?.id,
    }, now);
    return { kind: "ok", answer };
  } catch (thrown) {
    if (thrown instanceof Refused) {
      await recordOutcome(located, who, op, input, { ok: false, problem: thrown.problem.code }, now);
      return { kind: "refused", problem: thrown.problem };
    }
    /*
      ⚠️ AN UNEXPECTED THROW BECOMES A REFERENCE, NOT A STACK TRACE. The
      reference is in the log beside the cause and is the one thing a person is
      asked to quote — without it every report starts with "it said something
      went wrong".
    */
    const ref = newId("err", now);
    console.error(`${ref} ${op.id}`, thrown);
    await recordOutcome(located, who, op, input, { ok: false, problem: "platform.unavailable" }, now);
    return { kind: "refused", problem: problem(catalog, "platform.unavailable", { ref }, { ref }) };
  }
}

type _Op = Composed["byId"] extends ReadonlyMap<string, infer V> ? V : never;

/* ---------------------------------------------------------------- personal --- */

class Refused extends Error {
  constructor(readonly problem: Problem) { super(problem.code); }
}

async function answerPersonal(
  wiring: Wiring, op: PersonalBook[string], id: string,
  request: Request, url: URL, door: Door, now: Date,
): Promise<Response> {
  const catalog = PLATFORM_PROBLEMS;
  const no = (code: string, values?: Record<string, string | number>) =>
    asProblem(problem(catalog, code, values));

  if (request.method !== (op.kind === "read" ? "GET" : "POST")) return no("platform.not_found");
  if (op.doors && !op.doors.includes(door.kind)) return no("platform.not_found");

  const input = await readInput(request, url);
  if (input === null) return no("platform.invalid");

  const { session, email } = await whoIs(wiring.directory, sessionIdFrom(request), now);
  if (op.needs === "session" && !session) return no("platform.unauthorized");

  let cookie: string | null = null;
  const ctx: PersonalCtx = {
    directory: wiring.directory,
    session, email, door, now,
    shardOf: (tenant) => {
      if (!wiring.shardOf) throw new Error("this deployment resolves no shards");
      return wiring.shardOf(tenant);
    },
    app: (appId) => wiring.apps[appId]?.() ?? null,
    /* ⚠️ THE RUNTIME WRITES THE COOKIE, NOT THE HANDLER. Its flags — HttpOnly,
       SameSite, Secure, the domain — are a security decision, and one handler
       setting them slightly differently is one door with a weaker session. */
    issue: (next: Session | null) => {
      cookie = next ? setCookie(next.id, wiring.roots.root) : clearCookie(wiring.roots.root);
    },
    fail: (code, values) => { throw new Refused(problem(catalog, code, values)); },
  };

  try {
    const answer = await op.run(ctx, input);
    return json(answer ?? {}, 200, cookie ? { "set-cookie": cookie } : {});
  } catch (thrown) {
    if (thrown instanceof Refused) return asProblem(thrown.problem);
    const ref = newId("err", now);
    console.error(`${ref} ${id}`, thrown);
    return asProblem(problem(catalog, "platform.unavailable", { ref }, { ref }));
  }
}

const recordOutcome = async (
  located: Located, who: Who, op: _Op, input: Record<string, unknown>,
  outcome: { ok: boolean; problem?: string; id?: string }, now: Date,
): Promise<void> => {
  const entry = entryFor(op.spec, input, { tenantId: located.tenantId, actor: who.accountId }, outcome);
  if (entry) await record(located.db, entry, now);
};

/**
 * ⚠️ A READ TAKES ITS INPUT FROM THE QUERY AND A WRITE FROM THE BODY, and the
 * split is not style: a GET with a body is dropped by proxies and caches, and a
 * write whose values are in the URL ends up in every access log on the way.
 */
async function readInput(request: Request, url: URL): Promise<Record<string, unknown> | null> {
  if (request.method === "GET") {
    /* ⚠️ `forEach` rather than spreading the params: the Workers type for
       `URLSearchParams` is not iterable without `DOM.Iterable`, so a spread
       compiles here and fails in the one package that actually builds a worker
       — which is the only place it matters. */
    const out: Record<string, unknown> = {};
    url.searchParams.forEach((value, key) => { out[key] = value; });
    return out;
  }
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch { return null; }
}

export type { Roots, Door };
export { compose };
export type { _Resolved };
