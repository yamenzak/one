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

import type { AppSpec, Caller, Door, Kind, Problem, Resolved as _Resolved, Roots, Standing } from "@engine/kernel";
import {
  IN_GOOD_STANDING, PLATFORM_PROBLEMS, PROOF_WINDOW_MS, check, doorFor, newId, problem,
} from "@engine/kernel";
import { compose, type Composed, type Resolved as ResolvedOp } from "./compose.js";
import { tell } from "./dispatch.js";
import { answerMcp } from "./mcp.js";
import type { PlatformCtx } from "./member-ops.js";
import { keyFor, record, remember, seen, entryFor } from "./audit.js";
import { clearCookie, sessionIdFrom, setCookie, type Session } from "./identity.js";
import { maintenanceMode } from "./operator.js";
import type { Bucket, Where } from "./storage.js";
import { whoIs, type PersonalBook, type PersonalCtx } from "./personal.js";
import type { TenantRow } from "./directory.js";
import { tenantBySlug } from "./directory.js";
import { brandingOf } from "./branding.js";
import { keep } from "./vault.js";
import { iconSvg, webManifest, type Installable, type Installer } from "./installable.js";
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
  /**
   * ⚠️ THE BUCKET A WORKSPACE'S FILES ARE IN — the one the reconciler made for
   * that workspace's jurisdiction. Residency is in the ADDRESSING here: an EU
   * workspace resolves the EU bucket, so there is no check anybody can forget.
   */
  readonly bucketOf?: (where: Where) => Bucket | null;
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
  /**
   * ⚠️ ITS OWN SECRET, AND NEVER THE SESSION ONE. The key for every vault fact
   * is derived from this and the subject's salt, so rotating it does not
   * invalidate anything — it makes every fact already stored undecryptable, with
   * no error until somebody reads one. `AUTH_SECRET` is rotated as ordinary
   * hygiene; this must never be, and giving them one name would have made a
   * routine security action into silent, total data loss.
   */
  readonly vaultSecret?: string;
  /**
   * ⚠️ WHAT THIS CALLER STILL OWES AN AGREEMENT TO. Absent means this deployment
   * asks for none, which is the honest state of one that declares no documents —
   * and `deploymentFaults` tests that against what it actually collects, so
   * "nobody was asked" cannot quietly be the answer on a product holding
   * somebody's health record.
   */
  readonly owed?: (
    who: Who, located: Located,
  ) => Promise<readonly { readonly id: string; readonly title: string }[]>;
  /**
   * ⚠️ WHO THIS DEPLOYMENT IS, FOR THE TILES THAT WEAR OUR MARK. A personal
   * workspace installs as ours; nothing about a hostname can supply a name and a
   * glyph, so a deployment that has not said serves no manifest rather than a
   * plausible-looking wrong one.
   */
  readonly installable?: Installer;
}

/**
 * ⚠️ RESOLVED FROM THE DIRECTORY RATHER THAN THROUGH `locate`, and the reason is
 * the caller: a phone fetching a manifest has no session, and `locate` resolves
 * a shard, a standing, a plan and a balance that nothing here reads. Asking for
 * all of it would put the whole request path behind an icon.
 */
async function installableFor(wiring: Wiring, door: Door): Promise<Installable | null> {
  if (door.kind !== "tenant" || !door.slug || !wiring.installable) return null;
  const tenant = await tenantBySlug(wiring.directory, door.slug);
  if (!tenant || tenant.closedAt) return null;
  return {
    name: tenant.name,
    kind: tenant.kind,
    branding: await brandingOf(wiring.directory, tenant.id),
    us: wiring.installable,
  };
}

export interface Located {
  readonly tenantId: string;
  readonly db: Db;
  /** Which products this workspace has switched on, in the order to search. */
  readonly apps: readonly string[];
  /**
   * ⚠️ WHAT THIS WORKSPACE IS, CARRIED SO THE GATE CAN ASK (`Kind`). Absent
   * reads as `personal` at the gate, which is the safe direction: a locator that
   * forgot to report it withholds commercial-only capabilities rather than
   * handing them to every workspace on the deployment.
   */
  readonly kind?: Kind;
  /** ⚠️ Its name, because the commercial refusal is a sentence with it in. */
  readonly name?: string;
  readonly standing?: Standing;
  /**
   * ⚠️ WHICH JURISDICTION THIS WORKSPACE WAS PROMISED, carried so the file
   * lookup can resolve the bucket in it. Absent reads as the deployment's
   * default region, which is the direction whose mistake is a missing bucket
   * rather than a file in the wrong regime.
   */
  readonly residency?: string;
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
    /*
      ⚠️ AND THE SLUG COMES WITH IT, for exactly the same reason. A page that
      worked out which workspace it was on by cutting the hostname apart would
      be that second classifier one more time — and the hub asks the question
      constantly, because opening a workspace is a route where it already is
      and a full page load anywhere else.
    */
    if (url.pathname === "/health") {
      return json({
        ok: true, door: door.kind, root: wiring.roots.root,
        slug: door.kind === "tenant" ? door.slug : null,
      });
    }
    /*
      ⚠️ THE AGENT DOOR, AND IT IS THE SAME BUILDING (D13). `/mcp` answers on a
      tenant's own address with the tenant's own tools — a projection of the
      operations the caller could already reach over `/api/*`, entered through
      `performOperation` below so every gate, the replay and the audit apply
      identically. A separate agent deployment would be a second copy of all of
      them.
    */
    /*
      ⚠️ THE INSTALLABLE IDENTITY, ON THE WORKSPACE'S OWN DOOR AND NOWHERE ELSE.
      One tile per workspace, not per product — see `installable.ts`. Both routes
      are PUBLIC by construction: a phone fetches a manifest and an icon with no
      session and often with no cookie jar at all, so anything behind a login
      here installs as a browser default.

      ⚠️ AND A DEPLOYMENT THAT HAS NOT SAID WHO IT IS SERVES NEITHER. The tile a
      personal workspace wears is OURS, and there is no honest way to draw it
      from a hostname — so the absence is a 404 rather than a guess.
    */
    if (url.pathname === "/manifest.webmanifest" || url.pathname === "/icon.svg") {
      if (door.kind !== "tenant" || !wiring.installable) {
        return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));
      }
      const of = await installableFor(wiring, door);
      if (!of) return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));
      return url.pathname === "/icon.svg"
        ? new Response(iconSvg(of), {
          headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300" },
        })
        : json(webManifest(of), 200, { "content-type": "application/manifest+json; charset=utf-8" });
    }

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
      /* ⚠️ Handed back untouched — it is a file, and it has already been
         audited like every other answer. */
      case "raw": return outcome.answer;
      case "refused": return asProblem(outcome.problem);
    }
  };
}

/* -------------------------------------------------------------- the path --- */

export type Performed =
  | { readonly kind: "replay"; readonly answer: unknown }
  | { readonly kind: "ok"; readonly answer: unknown }
  /* ⚠️ A FILE. Answered as a Response because base64 in a JSON field is not
     something a browser can put in an `<img>` — and named as its own outcome so
     no caller can mistake it for an ordinary answer and serialise it. */
  | { readonly kind: "raw"; readonly answer: Response }
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

  /*
    ⚠️ ASKED PER REQUEST, LIKE STANDING, AND FOR THE SAME REASON. A person may
    agree in one tab while another is open, and a version may change under
    somebody mid-session; a value resolved once at sign-in would let them work
    for hours against wording they never saw.

    ⚠️ AND AN OPERATION MARKED `beforeAccepting` DOES NOT PAY FOR THE QUERY. The
    escape hatches are exactly the routes somebody behind the wall uses, and
    making them the slowest ones is the wrong way round.
  */
  const owed = op.spec.beforeAccepting || !wiring.owed
    ? []
    : await wiring.owed(who, located);

  /*
    ⚠️ MAINTENANCE IS ASKED HERE AND NOWHERE ELSE, so the agent door cannot
    forget it (D12). `readonly` refuses the writes and serves the reads;
    `full` withholds everything this path serves. The operator door, `/health`
    and the personal lane never reach this function — which is the exemption
    list, by construction rather than by remembering.
  */
  const care = await maintenanceMode(wiring.directory);
  if (care === "full" || (care === "readonly" && op.kind === "write")) {
    return { kind: "refused", problem: problem(catalog, "platform.maintenance") };
  }

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
    kind: located.kind ?? "personal",
    ...(located.name ? { workspace: located.name } : {}),
    entitlements: located.entitlements ?? [],
    flags: located.flags ?? {},
    used: located.used ?? (() => 0),
    /* ⚠️ SUPPLIED BY THE LOCATOR, so a deployment that cannot answer refuses
       rather than waving everybody through — an absent list here means "this
       deployment asks for no agreements", which the boot check tests against
       what it actually holds. */
    ...(owed.length ? { unaccepted: owed } : {}),
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
    /*
      ⚠️ THE SEAM TO THE VAULT, AND IT IS ABSENT WHEN NO SECRET IS BOUND. A
      deployment that has not chosen a vault secret cannot keep a special
      category, and the generated write refuses rather than falling back to the
      column — falling back is the failure.
    */
    ...(wiring.vaultSecret
      ? {
        vault: {
          secret: wiring.vaultSecret,
          keep: (subject: string, field: string, value: string) => keep(
            located.db, wiring.vaultSecret!, located.tenantId as never,
            subject as never, field, value, now),
        },
      }
      : {}),
    allowance: (key: string) =>
      (located.entitlements ?? []).find((e) => e.key === key)?.value ?? false,
    /* ⚠️ RESOLVED FROM THE WORKSPACE, so the residency is in the addressing —
       see `bucketOf`. Absent is a deployment that stores no files. */
    bucket: wiring.bucketOf?.(located) ?? null,
    fail: (code, values, extra) => { throw new Refused(problem(catalog, code, values, extra)); },
  };

  try {
    const answer = await op.run(ctx, input);
    /*
      ⚠️ AN OPERATION MAY ANSWER WITH A RESPONSE, and exactly one kind does: one
      handing back a FILE. Base64 in a JSON field is not something a browser can
      put in an `<img>`.

      ⚠️ AND IT STILL GOES THROUGH THE BOOKKEEPING BELOW. Returning here would
      make a file read the one operation on the deployment that leaves no audit
      row — invisible in exactly the record somebody asks for when they want to
      know who looked at a document.
    */
    if (!(answer instanceof Response) && replayKey) {
      await remember(located.db, located.tenantId, op.id, replayKey, answer, now);
    }
    await recordOutcome(located, who, op, input, {
      ok: true, id: (answer as { id?: string } | null)?.id,
    }, now);
    if (answer instanceof Response) return { kind: "raw", answer };
    /*
      ⚠️ AND THEN WHOEVER THIS CONCERNS IS TOLD — after the write and after the
      record, because a note about a change that did not land is worse than no
      note. Only on the way out of a SUCCESS: a refusal raises nothing.
    */
    await told(located, composed.app, who, op, input, answer, now);
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

  /* ⚠️ THE PROOF WINDOW, ON THIS LANE TOO. It is the kernel's constant rather
     than a number typed here — two windows is one of them being the wrong one
     for as long as nobody compares them. */
  if (op.proof === "recent") {
    const fresh = session?.provenAt
      && now.getTime() - Date.parse(session.provenAt) < PROOF_WINDOW_MS;
    if (!fresh) return no("platform.proof_required");
  }

  let cookie: string | null = null;
  const ctx: PersonalCtx = {
    directory: wiring.directory,
    session, email, door, now,
    shardOf: (tenant) => {
      if (!wiring.shardOf) throw new Error("this deployment resolves no shards");
      return wiring.shardOf(tenant);
    },
    app: (appId) => wiring.apps[appId]?.() ?? null,
    /* ⚠️ WHERE A WORKSPACE'S FILES ARE, so erasure can take the objects rather
       than only the rows. Absent is a deployment with no bucket live yet, which
       is a state it has to survive rather than an error. */
    ...(wiring.bucketOf ? { bucketOf: wiring.bucketOf } : {}),
    /* ⚠️ THE RUNTIME WRITES THE COOKIE, NOT THE HANDLER. Its flags — HttpOnly,
       SameSite, Secure, the domain — are a security decision, and one handler
       setting them slightly differently is one door with a weaker session. */
    issue: (next: Session | null) => {
      cookie = next ? setCookie(next.id, wiring.roots.root) : clearCookie(wiring.roots.root);
    },
    fail: (code, values, extra) => { throw new Refused(problem(catalog, code, values, extra)); },
  };

  try {
    const answer = await op.run(ctx, input);
    /* ⚠️ AN OPERATION MAY ANSWER WITH A RESPONSE, and exactly one kind does:
       one handing back a FILE. Wrapping bytes in JSON would base64 them into a
       string a browser cannot put in an `<img>`. */
    if (answer instanceof Response) return answer;
    return json(answer ?? {}, 200, cookie ? { "set-cookie": cookie } : {});
  } catch (thrown) {
    if (thrown instanceof Refused) return asProblem(thrown.problem);
    const ref = newId("err", now);
    console.error(`${ref} ${id}`, thrown);
    return asProblem(problem(catalog, "platform.unavailable", { ref }, { ref }));
  }
}

/**
 * ⚠️ A NOTE IS A CONSEQUENCE OF THE CHANGE, NOT PART OF IT. The write has
 * already landed and been recorded by the time this runs, so nothing here may
 * turn a successful operation into a failure — a full table or a malformed
 * template would otherwise answer 500 to somebody whose change went through.
 *
 * ⚠️ AND THE CATCH SAYS SO. A swallowed failure here is an inbox that quietly
 * stops filling, which is the exact shape this whole path exists to end.
 */
const told = async (
  located: Located, app: AppSpec, who: Who, op: _Op,
  input: Record<string, unknown>, answer: unknown, now: Date,
): Promise<void> => {
  const events = op.spec.emits ?? [];
  if (!events.length) return;
  try {
    await tell(located.db, {
      app, tenantId: located.tenantId, events, input,
      answer: (answer ?? {}) as Record<string, unknown>,
      actor: who.accountId ?? null, actorName: who.email ?? null,
      /* ⚠️ The inbox always; a channel that leaves the process is stage 23. */
      channels: ["inbox"],
    }, now);
  } catch (why) {
    console.error(`[notify] ${op.id} raised ${events.join(", ")} and nobody was told`, why);
  }
};

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
  /*
    ⚠️ A BODY IS BYTES ONLY WHEN IT SAYS SO IN SO MANY WORDS. An upload is a raw
    body — base64 in a JSON field is a third more bytes on the wire and holds the
    whole file twice in a 128 MB isolate — so an operation may receive
    `input.body` as an ArrayBuffer, with the query string carrying the rest.

    ⚠️ AND IT IS AN ALLOW-LIST, NOT "ANYTHING THAT IS NOT JSON", because that
    reading broke EIGHTY-EIGHT TESTS at once. `new Request(url, { body:
    JSON.stringify(x) })` sets `content-type: text/plain;charset=UTF-8` all by
    itself — the platform infers it from a string body — so every ordinary POST
    in this repository arrived as a content type that is not JSON, was read as
    bytes, and reached its operation with none of the fields it declared. The
    first draft's comment said an absent header would stay JSON; the header was
    never absent.
  */
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  const BYTES = /^(image|video|audio|font)\/|^application\/(octet-stream|pdf|zip|gzip)|^multipart\//;
  if (BYTES.test(type)) {
    const out: Record<string, unknown> = {};
    url.searchParams.forEach((value, key) => { out[key] = value; });
    const bytes = await request.arrayBuffer();
    return bytes.byteLength ? { ...out, body: bytes, contentType: type } : out;
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
