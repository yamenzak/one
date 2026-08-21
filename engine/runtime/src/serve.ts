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

import type {
  AnyOperation, AppSpec, Ask, Caller, CollectionSpec, DeploymentLegal, DocumentBook, DocumentDef,
  Door, Kind, PackDef, PlanSpec, Problem, ReachBook, Resolved as _Resolved, Roots, Standing,
  TenantId,
} from "@engine/kernel";
import {
  IN_GOOD_STANDING, LEGAL_INDEX, LEGAL_PATH, PLATFORM_PROBLEMS, PROOF_WINDOW_MS, blockedBy, check,
  checkAll, doorFor, newId, passagesOf, problem, resolveFlags,
} from "@engine/kernel";
import { compose, type Composed, type Resolved as ResolvedOp } from "./compose.js";
import { switchesFor } from "./flags.js";

const NO_SWITCHES = { deployment: {}, tenant: {}, person: {} } as const;

/**
 * ⚠️ WHETHER ANY PRODUCT HERE HAS A SWITCH AT ALL, so a deployment with none
 * pays nothing for the mechanism. Reading the store on every request took an
 * ordinary list from ten queries to eleven, and a deployment whose apps declare
 * no flags would have paid that for a map that can only ever be empty.
 *
 * ⚠️ ASKED OF THE WIRING RATHER THAN OF THE WORKSPACE, because it decides
 * whether to START the read — which happens beside the identity, before the
 * workspace's own app list is known. Broader than it needs to be by exactly the
 * apps this workspace has switched off, which costs a query nobody notices and
 * is the direction that cannot be wrong.
 */
const declaresAFlag = (wiring: Wiring): boolean =>
  Object.values(wiring.apps).some((make) => {
    const book = make().flags;
    return !!book && Object.keys(book).length > 0;
  });
import { tell } from "./dispatch.js";
import { noteEvents } from "./progress.js";
import { answerMcp } from "./mcp.js";
import type { PlatformCtx } from "./member-ops.js";
import { keyFor, record, remember, seen, entryFor } from "./audit.js";
import { clearCookie, sessionIdFrom, setCookie, type Session } from "./identity.js";
import { maintenanceMode, type MaintenanceMode } from "./operator.js";
import type { Bucket, Where } from "./storage.js";
import { whoIs, type PersonalBook, type PersonalCtx } from "./personal.js";
import type { TenantRow } from "./directory.js";
import { tenantBySlug } from "./directory.js";
import { brandingOf } from "./branding.js";
import { keep } from "./vault.js";
import { iconPng, iconSvg, webManifest, type Installable, type Installer } from "./installable.js";
import { iconOf } from "./icon.js";
import { mailedAs } from "./inbox.js";
import { reachIn } from "./reach.js";
import { availableChannels, type Mailer, type Pusher } from "./services.js";
import { settingsFor } from "./settings.js";
import type { Db } from "./sql.js";
import { generatorFor, streamerFor } from "./ai-run.js";
import { gatewayProvider, gatewayStreamer, type Provider } from "./services.js";
import type { GatewayAt } from "./gateway.js";
import { searchIn, type Searcher } from "./search.js";

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
  /**
   * WHERE IN THE WORKSPACE THIS PERSON WORKS, PER PRODUCT (`reach.ts`).
   *
   * ⚠️ IT COMES FROM THE MEMBERSHIP THE IDENTITY ALREADY READ, and is here for
   * that reason: re-reading the roster to answer it would put a query in front
   * of every request in every product, to answer a question most of them never
   * ask. Absent — and an app absent FROM it — is the whole workspace, which is
   * the default and every membership that predates the column.
   */
  readonly reach?: ReachBook;
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
  /**
   * ⚠️ IT ANSWERS TWICE, AND THE EARLY ANSWER IS WHY. Where a door is comes back
   * one query in; what the workspace holds — the plan, the wallet, every quota
   * count — is three or four. The identity needs only the first, so handing it
   * the second put three round trips in front of every request. See `Locating`,
   * and `asLocating` for a wiring that already has a whole `Located`.
   */
  readonly locate: (door: Door) => Locating;
  /**
   * ⚠️ IT IS HANDED A PROMISE, AND THAT IS THE POINT. Reading the session needs
   * nothing about the workspace, and reading the roster needs only its shard —
   * so this starts beside `locate` rather than after it, and awaits `where` at
   * the moment it actually needs a database. `null` means the door resolved to no
   * workspace, and the only correct answer to that is `NOBODY`.
   */
  readonly identify?: (request: Request, where: Promise<Whereabouts | null>) => Promise<Who>;
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
   * ⚠️ THE DOCUMENTS THEMSELVES, SO THERE IS SOMETHING TO READ. `owed` says what
   * somebody still has to agree to; this is what it says. They were separate,
   * and only the first existed — so the consent screen listed titles pointing at
   * an address nothing answered.
   */
  readonly legal?: DeploymentLegal;
  /**
   * ⚠️ WHO THIS DEPLOYMENT IS, FOR THE TILES THAT WEAR OUR MARK. A personal
   * workspace installs as ours; nothing about a hostname can supply a name and a
   * glyph, so a deployment that has not said serves no manifest rather than a
   * plausible-looking wrong one.
   */
  readonly installable?: Installer;
  /**
   * ⚠️ HOW A NOTIFICATION LEAVES THE PROCESS. Absent is honest and is the state
   * of a deployment with no push keypair: `availableChannels` then leaves `push`
   * out, so the switch is never offered rather than offered and inert.
   */
  readonly pusher?: Pusher;
  /**
   * ⚠️ ITS SIBLING, AND ABSENT IS THE SAME HONEST STATE. A deployment with no
   * sender configured binds nothing here, `availableChannels` leaves `email`
   * out, and the switch is never offered rather than offered and inert.
   *
   * ⚠️ WIRED FROM `sendMail`, NEVER BESIDE IT. The sign-in code and a
   * notification go out through one lane, so a deployment cannot be in the state
   * where one of them sends and the other silently does not.
   */
  readonly mailer?: Mailer;
  /**
   * ⚠️ WHAT A VERIFIED PAYMENT DOES, HANDED IN. The webhook is answered here
   * because it must be answered before any door resolves a workspace — Stripe
   * has no session and knows nothing about a tenancy — but WHAT it means is the
   * money module's, and putting the ladder here would be a second copy of it.
   *
   * ⚠️ ABSENT IS A DEPLOYMENT THAT TAKES NO CARD, and the route then answers 404
   * rather than 500. A stranger probing for an endpoint learns nothing either
   * way, and an operator reading a log sees "not configured" instead of a stack.
   */
  readonly payments?: Payments;
  /**
   * ⚠️ WHAT A STORED CREDENTIAL IS ENCRYPTED UNDER — see `config.ts`. Handed to
   * every handler, because a handler about to CHARGE somebody needs the key and
   * nothing else here may read one.
   */
  readonly configSecret?: string;
  /**
   * ⚠️ WHAT THIS DEPLOYMENT SELLS. One membership covers every product, so the
   * catalogue is the deployment's rather than any app's — see `PlanSpec`.
   */
  readonly plans?: readonly PlanSpec[];
  /** ⚠️ And the one-off packs, for the same reason — see `PlatformCtx.packs`. */
  readonly packs?: readonly PackDef[];
  /** ⚠️ What storage over a plan's included amount costs — see `PlatformCtx`. */
  readonly storageRate?: number;
  /**
   * ⚠️ WHERE A MODEL IS ASKED, AND ITS ABSENCE IS AN ANSWER. A deployment with
   * no gateway configured cannot generate anything — so `ctx.generate` is absent
   * rather than present and failing on every call, and a handler refuses on the
   * seam instead of on a timeout.
   *
   * ⚠️ THE ADDRESS, NOT THE PROVIDER, AND THAT IS WHAT MAKES THE TAG UNFORGETTABLE.
   * A provider handed in ready-made would carry whatever tag the deployment
   * happened to build — or none. Built here, it carries the workspace, the
   * product and the action every time, because this is the only place all three
   * are known and there is no other constructor.
   */
  readonly gateway?: GatewayAt;
  /**
   * ⚠️ THE DEVELOPMENT LANE, AND IT IS NEVER THE FALLBACK IN PRODUCTION. A
   * deployment with no gateway generates nothing; one running locally with no
   * gateway can still exercise the whole chain, because the mock refuses on its
   * own the moment `environment` is not development. Two independent guards on
   * one switch, and the inner one is the load-bearing half — a console cannot
   * reach it and neither can a misconfigured deploy.
   */
  readonly aiFallback?: Provider;
  /** ⚠️ The one thing that decides whether a mock may run — see `services.ts`. */
  readonly environment?: string;
  /**
   * ⚠️ WHERE A RECORD IS FOUND BY MEANING, AND THE NAME IS HALF OF IT. The
   * instance name is composed from the deployment and the app, and it has to be
   * composed the same way by the reader and by the job that writes — so both
   * take it from here rather than each spelling it. A deployment with no index
   * bound leaves `ctx.find` absent, and the generated operation says so.
   */
  readonly search?: { readonly searcher: Searcher; readonly deployment: string };
}

/**
 * ⚠️ ONE SEAM, AND IT IS DELIBERATELY NARROW. Everything about Stripe — the key,
 * the signature, the event shape — is `stripe.ts`'s; everything about what a
 * payment MEANS is the app's ladder. What crosses here is a raw body, a header
 * and a clock.
 */
export interface Payments {
  answer(raw: string, signature: string | null, now: Date): Promise<Response>;
}

/**
 * ⚠️ RESOLVED FROM THE DIRECTORY RATHER THAN THROUGH `locate`, and the reason is
 * the caller: a phone fetching a manifest has no session, and `locate` resolves
 * a shard, a standing, a plan and a balance that nothing here reads. Asking for
 * all of it would put the whole request path behind an icon.
 */
/**
 * WHOSE TILE THIS DOOR WEARS.
 *
 * ⚠️ EVERY DOOR HAS ONE, AND THAT IS THE CHANGE. This answered for a workspace
 * and 404'd everywhere else, so the identity door, the setup door and the
 * signpost — the first three screens anybody sees — had no favicon and no
 * manifest at all. A deployment with no icon on its own sign-in page is not a
 * neutral default; it is a browser drawing a blank page symbol next to our name.
 *
 * ⚠️ AND THE DEPLOYMENT'S OWN IS A WORKSPACE-SHAPED ANSWER ON PURPOSE, so the
 * routes below have one shape to serve rather than two. `personal` is the kind
 * that wears our mark (`mayBrand`), which is exactly what a door of ours is.
 */
async function installableFor(wiring: Wiring, door: Door): Promise<Installable | null> {
  if (!wiring.installable) return null;

  if (door.kind !== "tenant" || !door.slug) {
    /* ⚠️ Not a workspace: ours, with no brand and no upload to consider. */
    return {
      name: wiring.installable.name, kind: "personal", branding: null,
      us: wiring.installable, icon: null,
    };
  }

  const tenant = await tenantBySlug(wiring.directory, door.slug);
  if (!tenant || tenant.closedAt) return null;
  return {
    name: tenant.name,
    kind: tenant.kind,
    branding: await brandingOf(wiring.directory, tenant.id),
    us: wiring.installable,
    /* ⚠️ `iconOf` REFUSES A PERSONAL WORKSPACE ITSELF, so a kind that changed
       after an upload cannot leave a business's mark on a workspace that is no
       longer that business. */
    icon: await iconOf(wiring.directory, tenant.id, tenant.kind),
  };
}

/**
 * ⚠️ FOUR PATHS, AND THREE OF THEM ARE ASKED FOR BY SOMETHING THAT NEVER READ
 * OUR HTML. A browser requests `/favicon.ico` on its own when a page declares no
 * icon, and iOS requests `/apple-touch-icon.png` on its own when a page is added
 * to a home screen — both before any markup of ours has a say. Serving the PNG
 * at the names they already ask for is what makes this work on a page we did not
 * get to edit, which includes every error page and the manifest's own scope.
 *
 * ⚠️ `.ico` SERVED AS A PNG IS DELIBERATE AND IS FINE: every browser that asks
 * for that path sniffs the content type, and none has required the ICO container
 * for over a decade. The alternative is a second encoder for a format whose only
 * remaining consumer is a filename.
 */
const INSTALLABLE = new Set([
  "/manifest.webmanifest", "/icon.svg", "/icon.png",
  "/apple-touch-icon.png", "/favicon.ico",
]);

/**
 * IS THIS PATH THE PLATFORM'S, OR THE PAGE'S?
 *
 * ⚠️ THE DEPLOYMENT ASKS THIS ONE QUESTION, AND IT EXISTS BECAUSE THE ANSWER WAS
 * WRITTEN OUT SOMEWHERE ELSE. The worker routed `/api/*`, `/health` and `/mcp`
 * here and handed everything else to the static assets — so the manifest and the
 * icon, which are answered a few lines below, were never reached by a single
 * request. The route was there, the code was there, and a phone asking for the
 * manifest got `index.html` with a 200 on it.
 *
 * ⚠️ THAT IS THE FAILURE SHAPE THIS REPOSITORY IS A CATALOGUE OF: a capability
 * built, wired and mounted nowhere, with nothing failing anywhere. Deriving the
 * list from the one place that serves it is what makes adding a path here enough.
 */
export const isPlatformPath = (pathname: string): boolean =>
  pathname.startsWith("/api/") || pathname === "/health" || pathname === "/mcp"
  || pathname === WEBHOOK_PATH
  || pathname === LEGAL_INDEX || pathname.startsWith(LEGAL_PATH)
  || INSTALLABLE.has(pathname);

/**
 * ⚠️ WHERE A DOCUMENT SOMEBODY IS ASKED TO AGREE TO IS ACTUALLY READ. It was not
 * anywhere: the deployment declared `/legal/terms`, nothing answered it, the
 * request fell through to the page, and the app drew the consent screen again —
 * so the one screen that stops somebody demanded agreement to a text it could
 * not show them.
 *
 * ⚠️ AND IT NEEDS NO SESSION, ON ANY DOOR. Deciding whether to agree is a thing
 * somebody does BEFORE they are anybody here, and a term nobody can read without
 * first accepting the terms is not a term that was offered.
 *
 * ⚠️ THE PATH IS THE KERNEL'S (`LEGAL_PATH`, `legalUrlOf`) AND NOT THIS FILE'S,
 * because the link on the consent screen is derived from the same rule. A
 * constant here and a string there is how the screen came to point at a route
 * this worker does not answer.
 */

/** ⚠️ Anything from a declaration is somebody's text, and it goes into a page. */
const safe = (text: string): string => text
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * ⚠️ THE WHOLE PAGE, WRITTEN OUT, AND IT IS NOT THE APP. A legal document read
 * inside the single-page app is a document behind a boot, a session resolution
 * and a consent gate — which is what made it unreadable in the first place. This
 * answers with the text and nothing else: no script, no fetch, no state.
 *
 * ⚠️ AND IT ANSWERS IN BOTH THEMES WITHOUT ASKING. `color-scheme` hands the two
 * grounds to the user agent, so a document opened at night is not a white sheet.
 */
const LEGAL_STYLE = `
  :root { color-scheme: light dark; }
  body {
    margin: 0 auto; padding: 3rem 1.25rem 6rem; max-width: 38rem;
    font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  h1 { font-size: 1.75rem; line-height: 1.2; margin: 0 0 .25rem; text-wrap: balance; }
  .v { opacity: .6; font-size: .875rem; margin: 0 0 2.5rem; }
  p { margin: 0 0 1.1rem; }
  h2 { font-size: 1.125rem; margin: 2rem 0 .6rem; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { margin: 0 0 1.25rem; }
  a { color: inherit; }
  .b { display: inline-block; margin-top: 2.5rem; opacity: .6; font-size: .875rem; }
`;

const legalShell = (title: string, body: string): string => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${LEGAL_STYLE}</style>
</head><body>
${body}
</body></html>`;

function legalPage(doc: DocumentDef, root: string): string {
  return legalShell(`${safe(doc.title)} · ${safe(root)}`, `<h1>${safe(doc.title)}</h1>
<p class="v">Version ${safe(String(doc.version))}</p>
${/* ⚠️ CUT BY THE KERNEL'S RULE, which is also what the sheet inside the app
      renders — one wording cannot come out as two documents. */
  passagesOf(doc.text ?? "")
    .map((p) => (p.heading ? `<h2>${safe(p.text)}</h2>` : `<p>${safe(p.text)}</p>`))
    .join("\n")}
<a class="b" href="${LEGAL_PATH}">All documents</a>`);
}

/**
 * ⚠️ THE INDEX, BECAUSE A DOCUMENT WITH NO WAY TO FIND IT IS NOT PUBLISHED. Each
 * one had an address that answered and nothing anywhere linked to any of them —
 * so somebody deciding whether to sign up could not read the terms first, and
 * somebody who had already agreed could not read them again. Both are the same
 * absence, and this is the page that ends it.
 *
 * ⚠️ IT LISTS WHAT THIS DEPLOYMENT HOLDS THE WORDS OF, and nothing else. A row
 * for a document served from somewhere else would be a promise about a link this
 * page cannot keep — which is the exact fault the address rule exists to stop.
 */
function legalIndex(book: DocumentBook, root: string): string {
  const rows = Object.values(book)
    .filter((d) => d.text?.trim())
    .sort((a, b) => a.title.localeCompare(b.title));
  return legalShell(`Documents · ${safe(root)}`, `<h1>Documents</h1>
<p class="v">What ${safe(root)} promises, and what it asks you to agree to.</p>
<ul>
${rows.map((d) => `<li><a href="${LEGAL_PATH}${safe(d.id)}">${safe(d.title)}</a><br />`
    + `<span class="v">Version ${safe(String(d.version))}`
    + `${d.mustAccept ? " · agreed before you can use One" : ""}</span></li>`).join("\n")}
</ul>`);
}

/**
 * ⚠️ THE WEBHOOK'S PATH, NAMED ONCE, AND IT HAPPENED AGAIN. The paragraph above
 * is about the manifest and the icon; the webhook was added later, answered a
 * hundred lines below, and left out of this list — so every event Stripe sent
 * went to the static assets and came back `405`. Stripe retries a 405, gives up,
 * and nothing is ever granted: money captured, no plan stamped, no credits, and
 * no error anywhere, because from the worker's side no request was ever refused.
 */
export const WEBHOOK_PATH = "/webhook/stripe";

/**
 * ⚠️ FIVE MINUTES, AND `public` SO A CDN MAY HOLD IT. An icon is fetched on
 * every cold start of every tab; it is also the thing somebody changes and then
 * immediately looks at, so a day would make an upload appear not to have worked.
 */
const picture = (type: string): Record<string, string> => ({
  "content-type": type, "cache-control": "public, max-age=300",
});

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
  readonly balance?: number;
  readonly used?: (key: string) => number;
}

/** ⚠️ Where a door IS: the two facts an identity needs, and nothing else. */
export interface Whereabouts {
  readonly tenantId: TenantId;
  readonly db: Db;
}

/**
 * ⚠️ TWO ANSWERS FROM ONE LOOKUP — see `locator`. `where` lands one round trip
 * in; `located` lands three or four. A caller that needs both awaits both, and
 * pays for the lookup once.
 */
export interface Locating {
  readonly where: Promise<Whereabouts | null>;
  readonly located: Promise<Located | null>;
}

/* ------------------------------------------------------------------ serve --- */

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const asProblem = (p: Problem): Response => json({ problem: p }, p.status);

/**
 * WHICH DOOR THIS IS — the one question a page asks before it can draw anything.
 *
 * ⚠️ IT READS A HOSTNAME AND NOTHING ELSE, WHICH IS WHY IT IS OUT HERE. Every
 * other path this runtime answers needs the database — the plan catalogue is
 * resolved before a request is even dispatched — so a deployment binds them all
 * behind the schema runner. This one needs none of it, and a person watching
 * "Finding this place" on a cold start was watching a migration run in front of
 * four fields derived from the address bar.
 *
 * ⚠️ SO A DEPLOYMENT MAY ANSWER IT BEFORE BOOTING, and `engine/one` does. The
 * function is shared rather than copied for the reason the comments below give:
 * a second classifier in a second place is a second idea of what a custom domain
 * is, and when the two disagree the page offers a control the runtime refuses.
 *
 * ⚠️ THE DOOR IS REPORTED, SO THE BROWSER NEVER CLASSIFIES ITS OWN HOSTNAME.
 * `root` comes with it because the addresses of the other doors are derived from
 * a fact the deployment holds, not from a constant baked into a bundle at build
 * time — and the SLUG comes with it because a page that worked out which
 * workspace it was on by cutting the hostname apart would be that second
 * classifier one more time.
 *
 * ⚠️ AN UNRECOGNISED HOST IS NOT FOUND, NOT A DOOR CALLED `none`. `serve` refuses
 * one before it reaches any path at all, so answering 200 here would make the
 * same hostname 404 through the router and 200 through the probe — which is how
 * a deployment comes to report that somebody else's domain is alive on it. This
 * is the reason the refusal lives in this function rather than beside its caller.
 *
 * ⚠️ AND IT IS NEVER CACHED. The answer names one workspace, and a shared cache
 * holding it would hand that workspace's identity to the next hostname asking.
 */
export function healthOf(request: Request, roots: Roots): Response {
  const door = doorFor(new URL(request.url).host, roots);
  if (door.kind === "none") return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));
  return json({
    ok: true, door: door.kind, root: roots.root,
    slug: door.kind === "tenant" ? door.slug : null,
  }, 200, { "cache-control": "no-store" });
}

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
    if (url.pathname === "/health") return healthOf(request, wiring.roots);
    /*
      ⚠️ A DOCUMENT SOMEBODY IS ASKED TO AGREE TO, READ WITHOUT AGREEING FIRST.
      Public on every door and behind nothing: deciding whether to accept is what
      somebody does BEFORE they are anybody here, and a term nobody can read
      without accepting the terms was never offered.
    */
    if (url.pathname === LEGAL_INDEX || url.pathname.startsWith(LEGAL_PATH)) {
      const book = wiring.legal?.documents ?? {};
      const id = url.pathname.slice(LEGAL_PATH.length);
      const doc = Object.values(book).find((d) => d.id === id);
      /* ⚠️ The index at `/legal` and at `/legal/` alike — a trailing slash is
         not a different page, and half the links people write carry one. */
      const page = id === "" ? legalIndex(book, wiring.roots.root)
        : doc?.text ? legalPage(doc, wiring.roots.root) : null;
      if (page === null) return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));
      return new Response(page, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          /* ⚠️ A VERSION IS THE THING BEING AGREED TO, so the text for one never
             changes — a new wording is a new version, and a stale copy of a
             version is the same bytes as a fresh one. */
          "cache-control": "public, max-age=3600",
        },
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
    if (INSTALLABLE.has(url.pathname)) {
      const of = await installableFor(wiring, door);
      if (!of) return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));

      if (url.pathname === "/manifest.webmanifest") {
        /*
          ⚠️ THE INSTALLABLE THING IS A WORKSPACE, AND ONLY A WORKSPACE — which
          is the whole argument of `installable.ts`. A manifest on the setup door
          would let somebody install a tile that opens the sign-up wizard for
          ever; on the operator door it would offer a home-screen icon for the
          console. Both are `start_url: "/"` on a door that is not a place to
          come back to.

          ⚠️ AN ICON IS THE OPPOSITE QUESTION, WHICH IS WHY IT IS NOT REFUSED
          HERE. Every door is a page in a browser tab, and the tab draws
          something whether or not we supply it.
        */
        if (door.kind !== "tenant") {
          return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));
        }
        return json(webManifest(of), 200,
          { "content-type": "application/manifest+json; charset=utf-8" });
      }
      if (url.pathname === "/icon.svg") {
        return new Response(iconSvg(of), { headers: picture("image/svg+xml; charset=utf-8") });
      }
      /*
        ⚠️ THE RASTER MAY HONESTLY BE ABSENT — see `rasterOf`. A commercial
        workspace that has turned our mark off and uploaded nothing gets a 404
        here rather than our logo on their staff's home screens, and the SVG
        above still carries their own initial.
      */
      const png = await iconPng(of);
      if (!png) return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));
      return new Response(png, { headers: picture("image/png") });
    }

    /*
      ⚠️ THE WEBHOOK IS ANSWERED BEFORE ANY DOOR RESOLVES ANYTHING, and it has to
      be: Stripe carries no session, no cookie and no idea which workspace an
      event is about — the event itself says, and only after it is verified.

      ⚠️ IT IS OUTSIDE `/api/` ON PURPOSE. Everything under that prefix is an
      operation, and an operation has a caller, a gate and an audit row. This has
      none of the three, so putting it there would mean a branch inside
      `performOperation` that skips all of them — which is exactly where a
      cross-cutting concern goes missing (D12).

      ⚠️ AND IT IS THE ROOT DOOR, WHICH IS THE ONE ADDRESS THAT IS NOT A PLACE.
      A workspace's own hostname would make the endpoint move when a workspace is
      renamed; the operator door would put it behind the console's own meaning.
      The signpost is not an app and never was.
    */
    if (url.pathname === WEBHOOK_PATH) {
      if (!wiring.payments || door.kind !== "signpost") {
        return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));
      }
      if (request.method !== "POST") {
        return asProblem(problem(PLATFORM_PROBLEMS, "platform.not_found"));
      }
      /* ⚠️ THE RAW BODY, because the signature covers the bytes — see
         `verifySignature`. Parsing and re-encoding changes key order and
         whitespace, and every event then fails for a reason nothing says. */
      return wiring.payments.answer(
        await request.text(), request.headers.get("stripe-signature"), now);
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

    /*
      ⚠️ THREE QUESTIONS START HERE AND ONE OF THEM IS AWAITED. Where this door
      is, who is asking, and whether the deployment is closed are answered by
      three different tables and none is an input to another — but they were asked
      in that order, so a request paid for all three end to end before its own
      handler ran.

      ⚠️ AND THE IDENTITY IS THE EXPENSIVE ONE TO HAVE WAITED FOR. Resolving who
      is asking needs a session and this workspace's roster; the roster is on the
      shard, and the shard is known after the FIRST query `locate` makes. Handing
      over the full answer meant waiting for the plan catalogue, the wallet and
      every quota count first — three round trips in front of a lookup that needed
      none of them. `locate` answers twice now, from one read: see `Locating`.
    */
    const locating = wiring.locate(door);
    const identifying = wiring.identify?.(request, locating.where) ?? Promise.resolve(NOBODY);
    const caring = maintenanceMode(wiring.directory);
    /*
      ⚠️ THE SWITCHES ARE READ HERE, WHERE NOTHING CAN BYPASS THEM. This was a
      field on `Located` and then a dependency of `locator`, and both were the
      same hole one step apart: `locate` is a WIRING SEAM — every test supplies
      its own, and so may a deployment — so anything read only in there is read
      only by whoever remembered. The console wrote rows that only the console
      read back, a flag switched on changed nothing anywhere, and every suite was
      green. These two tables are the platform's own, in the platform's own
      directory, so there was never a decision for an app to make.

      ⚠️ AND IT COSTS NO DEPTH. The deployment's rows need nothing; the
      workspace's need `where`, which is the SAME promise `identify` already
      chains off (see above) — so both run beside the identity rather than after
      the whole of `locate`. `apps/hello/test/request-cost.test.ts` measures it.
    */
    /*
      ⚠️ AND IT WAITS FOR THE IDENTITY, BECAUSE THE THIRD LEVEL IS A PERSON. A
      workspace decides which of ITS OWN members get a feature it has been given,
      so the row is keyed by workspace and account and the read cannot start
      before both are known. It is still ONE query, and it runs beside the rest
      of `locate` rather than after it — the identity is already in flight above.
    */
    const switching = declaresAFlag(wiring)
      ? Promise.all([locating.where, identifying]).then(([w, who]) => (w
        ? switchesFor(wiring.directory, w.tenantId, who.accountId)
        : NO_SWITCHES))
      : Promise.resolve(NO_SWITCHES);

    /*
      ⚠️ A REFUSAL STILL SETTLES WHAT IT STARTED. Every path below can return
      before either of those is awaited — an unknown workspace, an unknown
      operation, the wrong method — and a query abandoned in flight is a
      rejection nobody handles and, in the Workers test runtime, a storage frame
      that cannot be popped. Both have been travelling for as long as the lookup
      took already, so waiting costs a refusal nothing it had not spent.
    */
    const refusing = async (why: Problem): Promise<Response> => {
      await Promise.allSettled([identifying, caring]);
      return asProblem(why);
    };

    const located = await locating.located;
    if (!located) return refusing(problem(PLATFORM_PROBLEMS, "platform.not_found"));

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
    if (!found) return refusing(problem(PLATFORM_PROBLEMS, "platform.not_found"));

    const { composed, op } = found;
    const catalog = composed.catalog;
    const expects = op.kind === "read" ? "GET" : "POST";
    if (request.method !== expects) return refusing(problem(catalog, "platform.not_found"));

    const input = await readInput(request, url);
    if (input === null) return refusing(problem(catalog, "platform.invalid"));

    const who = await identifying;

    const outcome = await performOperation(
      wiring, located, who, { composed, op }, input,
      request.headers.get("idempotency-key"), now,
      { origin: url.origin, slug: door.kind === "tenant" ? door.slug : null },
      /* ⚠️ Both started at the top of the request — see there. */
      caring,
      switching,
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
  /**
   * ⚠️ WHERE THE REQUEST ARRIVED, because a handler that sends somebody AWAY has
   * to know how to send them back. The doors ARE the tenancy, so this is a fact
   * about the request rather than about the deployment — a constant would return
   * a workspace on its own domain to somebody else's hostname.
   */
  at: { readonly origin: string; readonly slug: string | null },
  /**
   * ⚠️ STARTED BY THE CALLER WHERE THE CALLER CAN START IT EARLY. Whether the
   * deployment is closed is one row and is nobody's input, so the HTTP path asks
   * it at the top of the request and hands the promise down. Absent — the agent
   * door — it is asked here, which is where it always was.
   */
  care?: Promise<MaintenanceMode>,
  /**
   * ⚠️ THE SAME BARGAIN AS `care`, AND FOR THE SAME REASON. What somebody
   * switched is two rows and nobody's input, so the HTTP path starts them beside
   * the identity and hands the promise down; the agent door, which has no such
   * moment, asks here. What must never happen is either of them going through
   * `locate` — that is a wiring seam every test replaces, so a read placed there
   * is a read only whoever remembered performs, and the switch silently does
   * nothing.
   */
  switches?: Promise<{
    readonly deployment: Readonly<Record<string, boolean>>;
    readonly tenant: Readonly<Record<string, boolean>>;
    readonly person: Readonly<Record<string, boolean>>;
  }>,
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
  /*
    ⚠️ THREE INDEPENDENT QUESTIONS, ASKED TOGETHER. What this person still owes,
    whether the deployment is closed, and what they may do here are answered by
    three different tables and none of them is an input to the others — so
    awaiting them in turn was three waits for one round trip's worth of work, in
    front of every request the product makes.

    ⚠️ AND THE ORDER THEY ARE *USED* IN IS UNCHANGED, which is the half that
    matters. The kernel's gate order decides what a person is TOLD when more than
    one thing is wrong — acceptance before maintenance before permission — and
    that order is below, where the answers are read. Asking early is not deciding
    early.
  */
  const [owed, closed, permissions] = await Promise.all([
    op.spec.beforeAccepting || !wiring.owed ? Promise.resolve([]) : wiring.owed(who, located),
    care ?? maintenanceMode(wiring.directory),
    /* ⚠️ Resolved for the app THIS operation belongs to (D15) — the flat set the
       caller used to carry was whichever app was first on the tenant's list. */
    who.permissionsIn(composed.app.id),
  ]);

  /*
    ⚠️ MAINTENANCE IS ASKED HERE AND NOWHERE ELSE, so the agent door cannot
    forget it (D12). `readonly` refuses the writes and serves the reads;
    `full` withholds everything this path serves. The operator door, `/health`
    and the personal lane never reach this function — which is the exemption
    list, by construction rather than by remembering.
  */
  if (closed === "full" || (closed === "readonly" && op.kind === "write")) {
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

  const caller: Caller = {
    signedIn: who.signedIn,
    permissions,
    provenAt: who.provenAt,
  };

  /*
    ⚠️ ONE RESOLUTION, AND EVERYTHING DOWNSTREAM READS IT. The gate below and the
    `flags` on the ctx are the same object, so a screen the surface offers and a
    route the gate refuses cannot come apart — which they will the moment two
    places each read the store and decide for themselves. The books come from the
    products this workspace has on, so a flag another product declares is not in
    the map at all and its operations are simply not here.
  */
  const flags = resolveFlags(
    located.apps.map((id) => wiring.apps[id]?.().flags ?? {}),
    await (switches ?? (declaresAFlag(wiring)
      ? switchesFor(wiring.directory, located.tenantId, who.accountId)
      : NO_SWITCHES)),
  );

  /*
    ⚠️ ONE ASK, BUILT ONCE, ANSWERING BOTH QUESTIONS. This request's own gate is
    the first caller; what ELSE this caller could do is the second, and a screen
    asking that separately would be a second opinion about access — which is the
    exact fault this whole seam exists to make impossible. Every input is already
    settled in memory by the locator, so asking about fifty operations costs
    fifty pure walks and no query.
  */
  const askFor = (spec: AnyOperation): Ask => ({
    op: spec,
    caller,
    standing: located.standing ?? IN_GOOD_STANDING,
    kind: located.kind ?? "personal",
    ...(located.name ? { workspace: located.name } : {}),
    entitlements: located.entitlements ?? [],
    flags,
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

  const refused = check(askFor(op.spec));
  if (refused) {
    await recordOutcome(located, who, op, input, { ok: false, problem: refused.problem.code }, now);
    return { kind: "refused", problem: refused.problem };
  }

  /* --- the handler -------------------------------------------------------- */

  /* ⚠️ THE PLATFORM'S OWN OPERATIONS SEE MORE THAN A HANDLER DOES — the
     directory, the caller's keys, the allowances — and an app handler is
     typed against `Ctx`, which carries none of it. See `member-ops.ts`. */
  /* ⚠️ MEMOISED, NOT PRELOADED — see `Ctx.setting`. The promise is the memo, so
     two handlers asking in the same request share one query rather than racing
     to run two. */
  let asked: Promise<Readonly<Record<string, unknown>>> | null = null;
  const settings = () => (asked ??= settingsFor(
    located.db, located.tenantId as never, composed.app, who.accountId));

  const ctx: PlatformCtx = {
    db: located.db,
    tenantId: located.tenantId,
    accountId: who.accountId,
    /*
      ⚠️ HOW FAR THIS PERSON REACHES, RESOLVED ONCE PER REQUEST AND ONLY WHERE
      SOMEBODY IS ACTUALLY NARROWED. A product that declares no reach, and a
      member nobody narrowed, both answer `null` before any query is made — so
      the whole feature costs nothing until a business buys the thing it is for.
    */
    reach: await reachIn(located.db, composed.app, who.reach),
    /* ⚠️ THE INSTANT AS A STRING, WHICH IS THE ONLY SHAPE A HANDLER CAN WRITE.
       `now` is a `Date` in here because the bookkeeping below does arithmetic
       with it; what crosses into an app is the ISO text, the same as a job's. */
    now: now.toISOString(),
    directory: wiring.directory,
    permissions: caller.permissions,
    permissionsIn: who.permissionsIn,
    appOf: (appId) => wiring.apps[appId]?.() ?? null,
    enabledApps: located.apps,
    /* ⚠️ THE SAME MAP `check` WAS HANDED, above. */
    flags,
    /*
      ⚠️ WHAT ELSE THIS CALLER COULD DO, THROUGH THE SAME WALK THE GATE JUST
      RAN. A screen that decided for itself which controls to draw would be a
      second opinion about access, and the two disagree the first time either
      changes — so this is the gate answering, one operation at a time, from the
      Ask it already built.
    */
    mayCall: (spec) => blockedBy(askFor(spec)),
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
    /* ⚠️ THE SAME ANSWER THE DISPATCH USES — one call, so the switch a person is
       offered and the channel a note is sent on cannot disagree. */
    channels: await availableChannels(wiring),
    origin: at.origin,
    slug: at.slug,
    /* ⚠️ THE DEPLOYMENT'S CATALOGUE, so a handler about to price something reads
       the same list the gate resolved against. Empty is a deployment that sells
       nothing, which every reader already handles as the parking state. */
    plans: wiring.plans ?? [],
    packs: wiring.packs ?? [],
    storageRate: wiring.storageRate ?? 0,
    ...(wiring.configSecret ? { configSecret: wiring.configSecret } : {}),
    /* ⚠️ ONE READ PER REQUEST AT MOST, AND ONLY IF A HANDLER ASKS. Resolved for
       the app the operation belongs to, because a setting is that app's. */
    setting: async (id: string) => (await settings())[id],
    /*
      ⚠️ ONLY FOR AN OPERATION THAT DECLARED AN ACTION, and `generatorFor`
      answers `undefined` otherwise — so `ctx.generate` is absent rather than
      present-and-refusing. An operation generating text it never said it would
      is one whose cost lands on a bill against an action nobody can find.

      ⚠️ AND ONLY WHERE THE DEPLOYMENT CAN ACTUALLY ASK A MODEL. With no gateway
      configured there is nothing to call, so the seam is absent and a handler
      refuses on it rather than a provider timing out on every request.
    */
    ...(wiring.gateway || wiring.aiFallback
      ? {
        generate: generatorFor({
          directory: wiring.directory,
          db: located.db,
          tenantId: located.tenantId as never,
          app: composed.app,
          operation: op.id,
          /* ⚠️ THE REAL ONE WINS. A deployment holding both is one mid-setup,
             and answering from a mock while a gateway is configured would be
             fabricated output on a live product. */
          provider: wiring.gateway
            ? gatewayProvider(wiring.gateway, {
              t: located.tenantId, a: composed.app.id, o: op.id,
            })
            : wiring.aiFallback!,
          environment: wiring.environment ?? "",
        }),
      }
      : {}),
    /*
      ⚠️ STREAMING NEEDS A REAL GATEWAY, AND ITS ABSENCE IS THE HONEST ANSWER.
      There is no mock stream: a fabricated one would be output nobody asked for
      arriving token by token, which is more convincing than the same fabrication
      in one lump. A deployment without a gateway simply has no `ctx.stream`, and
      the handler falls back to the whole answer at once.
    */
    ...(wiring.gateway
      ? {
        stream: streamerFor({
          directory: wiring.directory,
          db: located.db,
          tenantId: located.tenantId as never,
          app: composed.app,
          operation: op.id,
          provider: gatewayProvider(wiring.gateway, {
            t: located.tenantId, a: composed.app.id, o: op.id,
          }),
          /* ⚠️ THE SAME TAG ON BOTH. A streamed call that went out untagged
             would be a hole in the one independent check on the money, exactly
             where the long generations are. */
          streamer: gatewayStreamer(wiring.gateway, {
            t: located.tenantId, a: composed.app.id, o: op.id,
          }),
          environment: wiring.environment ?? "",
        }),
      }
      : {}),
    /* ⚠️ BOUND HERE SO THE INSTANCE NAME IS COMPOSED ONCE. The reader and the
       job that writes the items must agree about which instance a product's
       records are in, and two spellings of that is a search over an index
       nothing fills — which answers "no results" rather than failing. */
    ...(wiring.search
      ? {
        find: (spec: CollectionSpec, scope: string, query: string, limit?: number) =>
          searchIn(wiring.search!.searcher, wiring.search!.deployment, composed.app.id,
            spec, scope, query, limit),
      }
      : {}),
    fail: (code, values, extra) => { throw new Refused(problem(catalog, code, values, extra)); },
  };

  /*
    ⚠️ THE DECLARED INPUT IS CHECKED HERE, AND FOR A LONG TIME IT WAS CHECKED
    NOWHERE. `checkAll` was reached by collection records and by settings, so an
    operation's `input` map was a declaration the tool catalogue and the OpenAPI
    document were generated from and nothing enforced: a required field could be
    absent, a `max` of four hundred thousand characters was advisory, and a `day`
    could be any string at all.

    ⚠️ AND THE SYMPTOM WAS NEVER A 400. A missing required field reached the
    handler as `undefined`, went into a statement, and D1 answered
    `D1_TYPE_ERROR: Type 'undefined' not supported` — a 503 naming a value,
    thrown from whichever bind happened to hold it, with nothing pointing at the
    field or the caller.

    ⚠️ IT GATES RATHER THAN REPLACES. A checked object drops the keys nothing
    declared, and a handler reading one would then see `undefined` for a value
    the caller did send — the same failure one step along. What crosses is what
    arrived; what this decides is whether it may.
  */
  if (!op.generated && Object.keys(op.spec.input).length) {
    const checked = checkAll(op.spec.input, input);
    if (!checked.ok) {
      await recordOutcome(located, who, op, input, { ok: false, problem: "platform.invalid" }, now);
      return {
        kind: "refused",
        problem: problem(catalog, "platform.invalid", {}, { fields: checked.fields }),
      };
    }
  }

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
    /*
      ⚠️ AND WHAT HAPPENED IS COUNTED, WHETHER OR NOT ANYBODY IS TOLD. `told`
      returns early when an event has no audience — correct for an inbox, wrong
      for a checklist, which asks whether the workspace has ever done the thing.
      Recorded here rather than inside `told` so the two cannot be confused
      again.
    */
    await happened(located, composed.app, op, now);
    await told(wiring, located, composed.app, who, op, input, answer, now, at);
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
/**
 * ⚠️ A TALLY IS A CONSEQUENCE, LIKE A NOTE, SO IT MAY NOT FAIL THE REQUEST. The
 * write has landed and been recorded by the time this runs; a full table here
 * answering 500 would tell somebody their change failed after it worked.
 *
 * ⚠️ AND THE CATCH SAYS SO, because the symptom of a swallowed failure is a
 * checklist that never ticks — which is the exact state this path exists to end.
 */
const happened = async (
  located: Located, app: AppSpec, op: _Op, now: Date,
): Promise<void> => {
  const events = op.spec.emits ?? [];
  if (!events.length) return;
  try {
    await noteEvents(located.db, located.tenantId as TenantId, app.id, events, now);
  } catch (why) {
    console.error(`[progress] ${op.id} raised ${events.join(", ")} and nothing counted it`, why);
  }
};

const told = async (
  wiring: Wiring, located: Located, app: AppSpec, who: Who, op: _Op,
  input: Record<string, unknown>, answer: unknown, now: Date,
  at: { readonly origin: string },
): Promise<void> => {
  const events = op.spec.emits ?? [];
  if (!events.length) return;
  try {
    await tell(located.db, {
      app, tenantId: located.tenantId, events, input,
      answer: (answer ?? {}) as Record<string, unknown>,
      actor: who.accountId ?? null, actorName: who.email ?? null,
      /* ⚠️ THE ORIGIN THIS REQUEST ARRIVED ON, so a workspace on its own domain
         is sent back to its own domain. A constant would mail everybody the
         root's address, which for a custom-domain workspace is a hostname their
         staff have never seen. */
      origin: at.origin,
      ...(located.name ? { workspace: located.name } : {}),
      /*
        ⚠️ WHAT THIS DEPLOYMENT CAN ACTUALLY DELIVER, ASKED RATHER THAN ASSUMED.
        This was the literal `["inbox"]` under a note saying a channel leaving
        the process was a later stage — and it stayed that literal after push
        was wired, so every device would have been subscribed, stored and never
        sent to. `availableChannels` is the one answer, and it is also what the
        two settings screens draw their switches from.
      */
      channels: await availableChannels(wiring),
      ...(wiring.pusher ? { pusher: wiring.pusher } : {}),
      /* ⚠️ READ ONCE FOR THE WHOLE DISPATCH, and only where there is a lane to
         use them on. A deployment that sends no mail should not pay a query per
         write for words nothing will read. */
      ...(wiring.mailer
        ? {
          mailer: wiring.mailer,
          /* ⚠️ ONLY WHERE THE WORKSPACE'S BRAND REACHES ITS MAIL. `mailedAs`
             asks all three questions — the app offers the surface, the workspace
             asked for it, the workspace is the kind that may — at the read
             rather than at the write, so a letter written while they all held
             stops applying the day one of them stops. */
          ...await mailedAs(
            located.db, located.tenantId as TenantId, app,
            await brandingOf(wiring.directory, located.tenantId as TenantId),
            located.kind ?? "personal"),
        }
        : {}),
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
