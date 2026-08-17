/**
 * AN APP, AND THE COMPOSITION THAT REFUSES A BROKEN ONE.
 *
 * ⚠️ EVERY CHECK IN HERE CATCHES SOMETHING THAT WOULD OTHERWISE FAIL SILENTLY.
 * That is the standard for being here at all: a mistake the compiler sees does
 * not need a refusal, and a mistake that throws at the first request does not
 * either. What belongs here is the class that boots fine, serves fine, and is
 * wrong — a permission no role can hold, an entitlement nothing enforces, a
 * quota nothing counts, a notification nobody can receive.
 *
 * ⚠️ AND THEY ARE REPORTED ALL AT ONCE. A check that stops at the first failure
 * turns fixing a manifest into a conversation of one sentence at a time.
 *
 * ⚠️ THE DECLARATIONS BELOW ARE THE WHOLE CROSS-CUTTING SURFACE (D12). An app
 * that needed to reach outside them to switch something on would be the proof
 * that the framework does not have the property it exists to have — so a new
 * concern becomes a field here, never a call site over there.
 *
 * Layer 3. Imports everything below it.
 */

import type { AccessSpec } from "./access.js";
import {
  PLATFORM_PERMISSIONS, PLATFORM_PERSONAL, PLATFORM_ROLES, claimsPlatform, foundingAppRole,
  undeclared, unholdable,
} from "./access.js";
import type { Lane } from "./ai.js";
import type { WhitelabelDef } from "./brand.js";
import type { CollectionSpec } from "./collection.js";
import { danglingRefs, eventsFor, operationsFor, quotasWithoutCeiling, refuseCollection } from "./collection.js";
import type { MeterBook } from "./credit.js";
import { unbounded } from "./credit.js";
import { unknownInPrompt } from "./ai.js";
import type { EntitlementDef } from "./entitlement.js";
import { PLATFORM_ENTITLEMENTS, unenforced } from "./entitlement.js";
import { holdingsIn, type Holding } from "./field.js";
import type { FlagBook } from "./flag.js";
import { refuseFlags, unreadFlags } from "./flag.js";
import type { GuideBook, HelpBook, MilestoneBook } from "./guide.js";
import { refuseGuide } from "./guide.js";
import type { JobBook } from "./job.js";
import { refuseJobs } from "./job.js";
import type { NeedBook } from "./infra.js";
import { mediaNeedFor, refuseNeeds } from "./infra.js";
import type { DeploymentLegal, DocumentBook, SubProcessorBook, SubProcessorDef } from "./legal.js";
import { refuseLegal } from "./legal.js";
import type { NotificationBook } from "./notify.js";
import { deadLinks, unaddressable, unraisable } from "./notify.js";
import type { AnyOperation } from "./operation.js";
import { refuseOperation, unreachable, unrecordedWrites } from "./operation.js";
import type { ProblemCatalog } from "./problem.js";
import { PLATFORM_PROBLEMS, redefined, unknownProblems } from "./problem.js";
import type { AreaBook, SettingBook } from "./setting.js";
import { refuseSettings } from "./setting.js";
import { LADDER, refuseLadder } from "./dunning.js";
import { SURFACES, refuseSurfaces } from "./brand.js";
import type { PurposeBook, VaultBook } from "./vault.js";
import { refuseVault, strayFacts } from "./vault.js";
import type { AppId, Tone } from "./primitives.js";

/* ------------------------------------------------------------------ shape --- */

export interface ScreenSpec {
  readonly id: string;
  readonly route: string;
  readonly label: string;
  /** ⚠️ Only five may be primary — see `PRIMARY_MAX` and D10. */
  readonly nav?: "primary" | "secondary" | "none";
  readonly icon?: string;
  readonly permission: string;
  /** ⚠️ A screen only a business has. Same rule as an operation's — see there. */
  readonly commercial?: true;
  /** A screen behind one of our switches. */
  readonly flag?: string;
  /** The ambience. Derived from theme tokens, so branding reaches it (D7). */
  readonly sky?: string;
  readonly tone?: Tone;
}

/**
 * ⚠️ EVERY FIELD BELOW PRODUCES SURFACES NOBODY WRITES. That is the contract: an
 * app declares, and the settings screens, the policy screen, the flag console,
 * the plan shelf, the consent sheet, the processing record, the job console, the
 * help centre and the onboarding checklist all exist as a consequence.
 */
export interface AppSpec {
  readonly id: AppId;
  readonly name: string;
  readonly mark: string;

  readonly access: AccessSpec;
  /**
   * ⚠️ KEYS ONLY. An app declares what it SELLS — `notes`, `clients` — and the
   * deployment's plans say how many of each every tier gets. Plans left this
   * file when the membership became one: seats, storage and the wallet are one
   * roster, one bucket and one balance, so a per-app plan cannot say which
   * product a gigabyte belongs to.
   */
  readonly entitlements: Readonly<Record<string, EntitlementDef>>;
  readonly collections: readonly CollectionSpec[];
  readonly operations: readonly AnyOperation[];
  readonly screens: readonly ScreenSpec[];
  readonly problems?: ProblemCatalog;

  readonly notifications?: NotificationBook;
  readonly settings?: SettingBook;
  /**
   * ⚠️ THE PAGES ITS SETTINGS LIVE ON. Every declared setting names one, and an
   * area nothing names is refused — so a settings surface is a list of
   * destinations that each open onto something, rather than one column of every
   * row the app happens to declare (DESIGN.md §3).
   */
  readonly settingAreas?: AreaBook;
  readonly flags?: FlagBook;
  readonly vault?: VaultBook;
  readonly purposes?: PurposeBook;
  readonly documents?: DocumentBook;
  readonly processors?: SubProcessorBook;
  readonly jobs?: JobBook;
  /**
   * ⚠️ WHAT THIS PRODUCT NEEDS UNDERNEATH IT — a queue, a bucket, a model lane.
   * Declared rather than configured, so the reconciler can make it exist, the
   * residency rule can refuse it, and the processing record can name it. See
   * `infra.ts`.
   */
  readonly needs?: NeedBook;
  readonly meters?: MeterBook;
  readonly lanes?: readonly Lane[];
  readonly whitelabel?: WhitelabelDef;
  readonly help?: HelpBook;
  readonly guide?: GuideBook;
  readonly milestones?: MilestoneBook;
}

/* ------------------------------------------------------------------- nav --- */

/**
 * ⚠️ FIVE PRIMARY DESTINATIONS, MAXIMUM (D10). Past five a bottom bar stops
 * being tappable and becomes a menu — and a nav item added because a feature had
 * nowhere else to go is a sign the feature belongs inside an existing one.
 */
export const PRIMARY_MAX = 5;

export const primaryOf = (screens: readonly ScreenSpec[]): readonly ScreenSpec[] =>
  screens.filter((s) => s.nav === "primary");

/* --------------------------------------------------------------- derived --- */

/**
 * Every event this app raises.
 *
 * ⚠️ INCLUDING THE ONES NOBODY WROTE. A collection's generated writes raise
 * events exactly as a declared operation does, and leaving them out here would
 * make the manifest refuse a notification about a note being created — the most
 * ordinary thing an app could possibly want to be told about.
 */
export const eventsOf = (spec: AppSpec): readonly string[] => [...new Set([
  ...spec.operations.flatMap((o) => o.emits ?? []),
  ...spec.collections.flatMap(eventsFor),
])];

/**
 * ⚠️ THE VAULT KEY IS DERIVED FROM WHERE THE FIELD IS, never declared beside it.
 * Two names for one fact is how a field ends up pointing at a vault entry that
 * does not exist — a pointer column with nothing behind it, which reads on the
 * screen as a value somebody never filled in.
 */
export const vaultKeyFor = (collection: string, field: string): string => `${collection}.${field}`;

const vaultBackedIn = (spec: AppSpec): readonly string[] =>
  spec.collections.flatMap((c) =>
    Object.entries(c.fields).filter(([, f]) => f.vault).map(([name]) => vaultKeyFor(c.id, name)));

/** Every category of personal data this app holds anywhere, including the vault. */
export const holdingsOf = (spec: AppSpec): readonly Holding[] => [...new Set([
  ...spec.collections.flatMap((c) => holdingsIn(c.fields)),
  ...Object.values(spec.vault ?? {}).map((f) => f.holding),
])];

/**
 * EVERY NEED THIS APP HAS — the ones it declared, and the one its own fields
 * imply.
 *
 * ⚠️ READ THIS RATHER THAN `spec.needs`, EVERYWHERE. A caller reading the raw
 * declaration sees an app with a media field and no bucket, provisions nothing,
 * and the first upload fails against a binding that was never asked for. There
 * is one derived need today and the shape matters more than the count: a
 * concern the platform can work out for itself is never an app's to remember.
 */
export const needsOf = (spec: AppSpec): NeedBook => {
  const files = spec.collections.some((c) =>
    Object.values(c.fields).some((f) => f.kind === "media"));
  const derived = mediaNeedFor(files);
  return { ...(derived ? { [derived.id]: derived } : {}), ...(spec.needs ?? {}) };
};

/* ------------------------------------------------------------ inheritance --- */

/**
 * WHAT EVERY PRODUCT ON A DEPLOYMENT INHERITS, APPLIED IN ONE PLACE.
 *
 * ⚠️ THE INFRASTRUCTURE SUB-PROCESSORS ARE THE DEPLOYMENT'S, NOT A PRODUCT'S.
 * The records are in one database, the objects in one bucket and the code on one
 * runtime — the same vendor behind every app here, whether or not each app's
 * author remembers to write it down. Declared per app it is one chance per
 * product to forget, and an undisclosed recipient is the disclosure failure
 * regulators actually find. An app adds only what is genuinely its own: a
 * payment gateway one product uses, a model provider only one product calls.
 *
 * ⚠️ AND WHAT IT RECEIVES IS NARROWED TO WHAT THIS APP ACTUALLY HOLDS. The
 * deployment says "our infrastructure holds everything we hold"; per product,
 * that is only the categories that product collects. Listing a special category
 * against an app that has never held one is a processing record describing
 * something that does not happen — and `refuseLegal` would rightly refuse it.
 *
 * ⚠️ DOCUMENTS DO NOT MERGE, DELIBERATELY. The deployment's terms are asked of
 * the person once, by `owedBy`, against acceptances with no app in them; folded
 * into an app's book they would be asked AGAIN per app and recorded per app —
 * the same agreement, demanded once per product somebody opens.
 */
export function under(deployment: DeploymentLegal, spec: AppSpec): AppSpec {
  const held = holdingsOf(spec);
  const base: Record<string, SubProcessorDef> = {};
  for (const p of Object.values(deployment.processors)) {
    const receives = p.receives.filter((h) => held.includes(h));
    if (!receives.length) continue;
    base[p.id] = { ...p, receives };
  }
  return { ...spec, processors: { ...base, ...(spec.processors ?? {}) } };
}

/* --------------------------------------------------------------- refusals --- */

export interface Refusal { readonly of: string; readonly why: string }

/**
 * Everything wrong with a manifest, in one pass.
 *
 * ⚠️ THE ORDER OF THE CHECKS IS THE ORDER A READER CAN ACT ON THEM: what is
 * malformed, then what is unreachable, then what is sold and unenforced, then
 * the surfaces. A missing permission reported after a dangling reference is a
 * second run.
 */
export function refuseApp(spec: AppSpec): readonly Refusal[] {
  const out: Refusal[] = [];
  const at = (of: string, why: string) => out.push({ of, why });

  /* ⚠️ Surfaces may NAME platform keys ("the money screen needs billing:read")
     even though the app may not DECLARE them — see `claimsPlatform`. */
  const permissions = [...spec.access.permissions, ...PLATFORM_PERMISSIONS, ...PLATFORM_PERSONAL];
  const routes = spec.screens.map((s) => s.route);
  const events = eventsOf(spec);

  /* --- what is malformed ------------------------------------------------- */

  for (const c of spec.collections) {
    for (const p of refuseCollection(c)) at(`collection ${p.collection}`, `${p.why}: ${p.detail}`);
  }
  for (const o of spec.operations) {
    for (const p of refuseOperation(o)) at(`operation ${p.operation}`, `${p.why}: ${p.detail}`);
  }
  for (const bad of danglingRefs(spec.collections)) at("reference", `${bad} points at no collection`);
  for (const p of refuseSettings(spec.settings ?? {}, spec.settingAreas ?? {})) at(`setting ${p.setting}`, `${p.why}: ${p.detail}`);
  for (const p of refuseFlags(spec.flags ?? {})) at(`flag ${p.flag}`, `${p.why}: ${p.detail}`);
  for (const p of refuseVault(spec.vault ?? {}, spec.purposes ?? {})) {
    at(`vault ${p.of}`, `${p.why}: ${p.detail}`);
  }
  for (const p of refuseJobs(spec.jobs ?? {}, Object.keys(spec.notifications ?? {}))) {
    at(`job ${p.job}`, `${p.why}: ${p.detail}`);
  }

  /*
    ⚠️ THE LADDER IS THE PLATFORM'S AND IS CHECKED HERE ANYWAY, because there is
    nowhere else it ever gets asked. Its rungs must climb — read-only, then
    blocked, then purged — and an edit that puts them out of order does not
    fail: it produces a workspace that is blocked before it is read-only, or
    purged before either. Nothing in the product called `refuseLadder`, so the
    only thing standing between a transposed pair and a deleted workspace was
    that nobody had transposed one.
  */
  for (const why of refuseLadder(LADDER)) at("standing", `the ladder ${why}`);

  /*
    ⚠️ AND WHAT AN APP OFFERS FOR BRANDING IS CHECKED AGAINST THE CLOSED SET.
    `whitelabel.surfaces` is a list of strings in a manifest, so a typo is a
    surface a workspace can never switch on and nothing anywhere says why — and
    a name from `OURS` would be an app offering to rebrand the operator console
    or a document we are bound by.
  */
  if (spec.whitelabel) {
    for (const p of refuseSurfaces({ surfaces: SURFACES }, spec.whitelabel.surfaces)) {
      at("whitelabel", `"${p.of}" ${p.detail}`);
    }
  }

  const ids = [...spec.collections.map((c) => c.id), ...spec.operations.map((o) => o.id)];
  for (const id of ids.filter((v, i) => ids.indexOf(v) !== i)) at("id", `"${id}" is declared twice`);

  /* --- what nobody can reach --------------------------------------------- */

  for (const key of unholdable(spec.access)) {
    at("permission", `"${key}" is declared and no app role holds it`);
  }
  for (const key of undeclared(spec.access)) {
    at("permission", `a role holds "${key}", which is not a declared permission`);
  }
  /* ⚠️ An app claiming a platform key would let a product update quietly mint
     workspace managers (D15). The fix is deletion, so it is its own refusal. */
  for (const key of claimsPlatform(spec.access)) {
    at("permission", `"${key}" is the platform's — an app may name it on a surface, never declare or bundle it`);
  }
  for (const why of unreachable(spec.operations,
    { ...PLATFORM_ROLES, ...spec.access.roles }, PLATFORM_PERSONAL)) {
    at("operation", why);
  }

  /* ⚠️ ASKED, NOT ASSUMED. `unrecordedWrites` states that every write says what
     to record or why not, and nothing called it — so the one class of operation
     that leaves no trace was refused nowhere. A write with neither an `audit`
     nor a reason is a change somebody made that the audit cannot show, which is
     discovered when somebody asks who did it. */
  for (const id of unrecordedWrites(spec.operations)) {
    at(`operation ${id}`, "a write that records nothing and says no reason — the change happens and the audit cannot show who made it");
  }

  /*
    ⚠️ SOMEBODY MUST BE ABLE TO USE A NEW TENANT'S APP. The platform makes the
    creator an `owner` (workspace authority is the platform's); this is the APP
    role they found in, and an app with no roles at all has no founding state.
  */
  if (!foundingAppRole(spec.access)) {
    at("access", "no app roles are declared, so a new workspace's creator would be nobody in it");
  }
  if (spec.access.founding && !spec.access.roles[spec.access.founding]) {
    at("access", `founding role "${spec.access.founding}" is not a declared role`);
  }
  for (const role of spec.access.seats.counts) {
    if (!(role in PLATFORM_ROLES)) at("access", `seats count "${role}", which is not a platform role`);
    if (role === "customer") at("access", "customers never cost a seat — they are the product, not the staff");
  }

  /* --- what is sold and not kept ----------------------------------------- */

  /*
    ⚠️ AN APP MAY NOT DECLARE WHAT THE PLATFORM SELLS. The roster is the
    platform's and `member.invite` is its gate; the bucket and the custom
    hostname are the platform's too. Two apps each declaring `seats` is two
    answers to how many people a workspace may have, and whichever composed
    first would win.
  */
  for (const key of Object.keys(spec.entitlements)) {
    if (key in PLATFORM_ENTITLEMENTS) {
      at("catalogue", `"${key}" is the platform's to sell, not an app's`);
    }
  }
  /* ⚠️ AND A PRICE LIST IS THE DEPLOYMENT'S, WHOLE. Plans and credit packs both
     left this file when the membership became one — there is one wallet, so a
     pack an app declared would top up a shared balance that only that product
     could sell. `refuseCatalog` and `refusePacks` run over the deployment's own
     lists instead, in `deploymentFaults`. */
  if ("packs" in spec || "plans" in spec) {
    at("catalogue", "prices belong to the deployment, not to a product");
  }
  /* ⚠️ THE UNION, BECAUSE AN APP MAY COUNT AGAINST A PLATFORM KEY. It may not
     DECLARE one (above), but a collection is entitled to reference `seats` or
     `storage` — those are the workspace's, and referencing is not owning. */
  const holdable = { ...PLATFORM_ENTITLEMENTS, ...spec.entitlements };
  for (const why of quotasWithoutCeiling(spec.collections, Object.keys(holdable))) {
    at("quota", why);
  }

  /*
    ⚠️ A KEY IS ENFORCED IF AN OPERATION NAMES IT OR A COLLECTION COUNTS AGAINST
    IT. Anything else is on a price list and checked by nothing — which fails in
    the GENEROUS direction, so no customer complains and nothing goes red.
  */
  const named = [
    ...spec.operations.flatMap((o) => [o.entitlement, o.quota].filter(Boolean) as string[]),
    ...spec.collections.map((c) => c.quota).filter(Boolean) as string[],
    ...Object.values(spec.settings ?? {}).map((s) => s.entitlement).filter(Boolean) as string[],
    spec.access.seats.entitlement,
  ];
  for (const key of unenforced(spec.entitlements, named)) {
    at("entitlement", `"${key}" is sold and nothing withholds it`);
  }
  for (const key of named) {
    if (key && !(key in holdable)) at("entitlement", `"${key}" is enforced and nothing sells it`);
  }

  /* --- what a person is told --------------------------------------------- */

  const notifications = spec.notifications ?? {};
  for (const id of unaddressable(notifications, permissions)) {
    at(`notification ${id}`,
      `is addressed to a permission nothing declares, so its audience is always empty`);
  }
  for (const id of unraisable(notifications, events)) {
    at(`notification ${id}`, "waits for an event nothing raises, so it can never arrive");
  }
  for (const dead of deadLinks(notifications, routes)) {
    at("notification", `${dead} — which is not a screen`);
  }

  /* --- what a person can change ------------------------------------------ */

  for (const s of Object.values(spec.settings ?? {})) {
    if (s.needs && !permissions.includes(s.needs)) {
      at(`setting ${s.id}`, `may be changed by holders of "${s.needs}", which nothing declares`);
    }
  }

  /*
    ⚠️ A FLAG NOTHING READS IS A SWITCH THAT DOES NOTHING, which is worse than an
    absent feature: somebody turns it on, believes what it promised, and stops
    watching for the problem it claimed to solve.
  */
  const flagsNamed = [
    ...spec.operations.map((o) => o.flag).filter(Boolean) as string[],
    ...spec.screens.map((s) => s.flag).filter(Boolean) as string[],
  ];
  for (const id of unreadFlags(spec.flags ?? {}, flagsNamed)) {
    at(`flag ${id}`, "no operation and no screen is behind it, so switching it changes nothing");
  }
  for (const id of flagsNamed) {
    if (!(id in (spec.flags ?? {}))) at("flag", `"${id}" is read and nothing declares it`);
  }

  /* --- what is held, and what is disclosed -------------------------------- */

  /* ⚠️ ASKED, NOT REPEATED. `strayFacts` is this loop, in the kernel, with the
     argument for why it matters — and it was written out here instead, so the
     rule existed twice and the exported one had no caller at all. */
  for (const key of strayFacts(spec.vault ?? {}, vaultBackedIn(spec))) {
    at("vault", `${key} is vault-backed and no vault field declares it — the column would point at nothing`);
  }
  for (const p of refuseLegal(
    spec.documents ?? {},
    spec.processors ?? {},
    holdingsOf(spec),
    Object.values(spec.purposes ?? {}).some((x) => x.holdings.includes("sensitive")),
  )) {
    at(`legal ${p.of}`, `${p.why}: ${p.detail}`);
  }

  /* --- what it spends ----------------------------------------------------- */

  /* ⚠️ ASKED WITH NO RESIDENCY, WHICH IS THE APP-LOCAL HALF ON PURPOSE. Whether a
     queue can keep an EU promise depends on which jurisdictions the DEPLOYMENT
     serves, and an app does not know that — `deploymentFaults` asks the other
     half at boot and the reconciler refuses to bind it. What is answerable here
     is whether the app contradicts itself. */
  for (const p of refuseNeeds(spec.needs ?? {}, [])) {
    at(`need ${p.of}`, `${p.why}: ${p.detail}`);
  }

  for (const id of unbounded(spec.meters ?? {})) {
    at(`meter ${id}`, "no output ceiling, so the reserve is a guess and the platform pays the difference");
  }

  /*
    ⚠️ AN AI ACTION IS REFUSED AT COMPOSITION FOR THE SAME REASON A METER IS
    (D19). A prompt naming a variable the action does not offer sends a literal
    brace to a model — invisibly, with a subtly wrong answer rather than a
    visible failure — and an action with no output ceiling reserves a guess,
    which the platform pays the difference on.
  */
  for (const o of spec.operations) {
    const ai = o.ai;
    if (!ai) continue;
    if (!(ai.maxOutput > 0)) {
      at(`operation ${o.id}`, "generates with no output ceiling, so the reserve is a guess");
    }
    for (const bad of unknownInPrompt(ai, ai.prompt)) {
      at(`operation ${o.id}`, `its prompt names "{${bad}}", which it does not declare`);
    }
    /* ⚠️ A variable nothing names is a value a caller must supply and nothing
       uses — the harmless direction, and still a promise the screen makes. */
    for (const unused of ai.variables.filter((v) => !ai.prompt.includes(`{${v}}`))) {
      at(`operation ${o.id}`, `declares "{${unused}}" and its prompt never names it`);
    }
    if (o.kind !== "write") {
      at(`operation ${o.id}`, "generates, which spends credits, and a read may not spend");
    }
  }

  /* --- the surface -------------------------------------------------------- */

  const primary = primaryOf(spec.screens);
  if (primary.length > PRIMARY_MAX) {
    at("nav", `${primary.length} primary destinations — the ceiling is ${PRIMARY_MAX} (D10)`);
  }

  const catalog: ProblemCatalog = { ...PLATFORM_PROBLEMS, ...(spec.problems ?? {}) };
  for (const code of redefined(spec.problems ?? {})) {
    at("problem", `"${code}" is the platform's and an app may not reword it`);
  }
  for (const o of spec.operations) {
    for (const code of unknownProblems(catalog, o.fails ?? [])) {
      at(`operation ${o.id}`, `says it can fail with "${code}", which no catalogue has`);
    }
  }

  const screenKeys = new Set(permissions);
  for (const s of spec.screens) {
    if (!screenKeys.has(s.permission)) {
      at(`screen ${s.id}`, `needs "${s.permission}", which is not a declared permission`);
    }
  }

  for (const p of refuseGuide(
    spec.guide ?? {}, spec.milestones ?? {}, spec.help ?? {},
    events, routes, permissions, spec.screens.map((s) => s.id),
  )) {
    at(`guide ${p.of}`, `${p.why}: ${p.detail}`);
  }

  return out;
}

/**
 * ⚠️ THE DOOR THROWS RATHER THAN RETURNS, because an app whose manifest is wrong
 * must not boot. Everything `refuseApp` finds is a fault that would otherwise be
 * discovered by a customer, so the deploy is the last place it can be cheap.
 */
export function defineApp(spec: AppSpec): AppSpec {
  const refusals = refuseApp(spec);
  if (refusals.length) {
    throw new Error(
      `${spec.id}: this manifest does not compose.\n` +
      refusals.map((r) => `  · ${r.of}: ${r.why}`).join("\n"),
    );
  }
  return spec;
}
