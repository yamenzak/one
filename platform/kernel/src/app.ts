/**
 * `defineApp` — the composition, and the whole of what a product declares.
 *
 * Layer 4. Imports everything below it and nothing beside it.
 *
 * The fields here are the ones MANIFEST.md §9 marks as day-zero: each implies a
 * column, a table, or a behaviour that cannot be applied retroactively. Several
 * are typed and unimplemented on purpose — the point of stage 0 is that adding
 * the behaviour later is filling something in, rather than migrating a platform
 * that has tenants on it.
 */

import type { AliasRoot } from "./doors.js";
import type { BindingSpec } from "./bindings.js";
import type { CollectionSpec } from "./collection.js";
import type { Shape } from "./validate.js";
import type { SettingsSpec } from "./settings.js";
import type { Services } from "./lookup.js";
import { serviceProblems } from "./lookup.js";
import { settingsProblems } from "./settings.js";
import type { FlagDef } from "./customer.js";
import type { AiSpec } from "./generation.js";
import { aiProblems } from "./generation.js";
import type { GuideSpec } from "./guide.js";
import { guideProblems } from "./guide.js";
import type { HelpRegistry } from "./help.js";
import type { JobSpec } from "./job.js";
import type { MilestoneRegistry } from "./milestone.js";
import { momentProblems } from "./moment.js";
import { marketProblems } from "./market.js";
import { MILESTONE_EARNED, milestoneProblems } from "./milestone.js";
import { danglingHelp, helpProblems } from "./help.js";
import { SPECIAL_CATEGORIES, agreementProblems, disclosureProblems, holdingProblems, protectionProblems, ropaOf, type ProtectionSpec, type Receiving, type Record30, type Subprocessor } from "./protection.js";
import type { VaultSpec } from "./vault.js";
import { shadowProblems, vaultActivities, wantProblems } from "./vault.js";
import type { NotificationRegistry } from "./notify.js";
import type { Release, Retired } from "./release.js";
import { releaseProblems } from "./release.js";
import { PLATFORM_EVENTS, danglingLinks } from "./notify.js";
import type { CreditPack, EntitlementDef, PlanSpec } from "./entitlement.js";
import { packProblems, parkingAboveFloor } from "./entitlement.js";
import type { Currency, Locale, RegionId, TimeZone, UnitSystem } from "./primitives.js";
import type { ProblemCatalog, ProblemDef } from "./problem.js";
import { PLATFORM_PROBLEMS } from "./problem.js";
import type { OperationSpec } from "./operation.js";

/**
 * ⚠️ THE ONE ENTITLEMENT KEY THE PLATFORM ITSELF ENFORCES, and it is named here
 * so an app cannot choose a different word for it.
 *
 * Storage is a ceiling every app with files has, counted the same way — bytes
 * stored, not files kept — and the operation that counts against it is the
 * platform's. An app that declared its own key would get a ceiling nothing
 * checks, which is the exact failure the coverage rule exists for.
 */
export const STORAGE_ENTITLEMENT = "storedBytes";

/**
 * ⚠️ THE SECOND KEY THE PLATFORM ITSELF ENFORCES, and it is named here for the
 * same reason.
 *
 * A seat ceiling is counted by the membership surface, which is the platform's —
 * so the key it counts against cannot be a word each app picks. An app that
 * called it `staff` would declare a ceiling that `member.invite` never reads,
 * and the overage would appear as a bill rather than as a refusal.
 *
 * Declaring it is optional; an app whose `seats.counts` is empty sells no seats
 * and needs no key.
 */
export const SEATS_ENTITLEMENT = "seats";

/**
 * ⚠️ `accept` IS THE CONTENT TYPE, NOT THE EXTENSION. An extension is whatever
 * somebody typed; the content type is what the browser said and what the reader
 * will trust.
 */
export interface FilePurpose {
  readonly accept: readonly string[];
  readonly maxBytes: number;
  /** One line, for the picker. What this is for, in the reader's words. */
  readonly label: string;
  /**
   * ⚠️ WHO MAY UPLOAD UNDER IT, AND IT IS REQUIRED.
   *
   * A purpose is a POLICY — what a file is for, which types it takes, how large
   * it may be — and "who may put one here" is the same question. Leaving it to a
   * single permission on the operation forces one answer for every kind of file
   * a product holds, and the two ends of that range are not close: a movement
   * demonstration is the studio's, and a photograph of a client's own body is
   * not.
   *
   * The alternative shipped, and it was a client who could not upload at all —
   * so every camera feature built FOR them carried their permission, carried
   * their flag, and was refused at its first step. Nothing reported that,
   * because the refusal was on a different operation from the feature.
   */
  readonly permission: string;
}

/* -------------------------------------------------------------- identity --- */

/**
 * ⚠️ ONE ACCOUNT, ONE CREDENTIAL, SEPARATE SESSIONS.
 *
 * The passkey relying party is the ROOT, so a credential registered on one
 * product is offered on the next and first sign-in there is one biometric tap
 * rather than a sign-up. Sessions stay per-origin: an account shared across
 * products is a feature, a session shared across them means a script injected
 * into any one product acts as that person in all of them.
 *
 * `rootRelyingParty` is a registrable domain, and raising it to the root is a
 * decision with a consequence worth writing down — nothing third-party may ever
 * be hosted under it, because anything there could then assert this RP.
 */
export interface IdentitySpec {
  readonly rootRelyingParty: string;
  /**
   * How far a session reaches.
   *
   * ⚠️ `origin` IS THE APP'S OWN ROOT, NOT THE PLATFORM'S, and `host` is one
   * hostname. The difference is real and a product may want either: with
   * `origin` a person signed into one workspace is signed into the next one
   * they open, which is what a multi-workspace product wants; with `host` every
   * workspace has its own jar, which is what a product serving mutually
   * hostile tenants wants.
   *
   * It was a single-member union read by nothing, so `cookieDomainFor` widened
   * every session to the app root whatever the manifest said.
   */
  readonly sessionScope: "origin" | "host";
  /** Identity is read at SIGN-IN; sessions are read per request. Hence one store. */
  readonly directoryRegion: RegionId;
}

/* --------------------------------------------------------------- tenancy --- */

export interface TenancySpec {
  /**
   * The host this app's doors hang off — `kova.4dl.app`.
   *
   * ⚠️ Declared rather than derived from `id` + the platform root, because a
   * deployment that differs (a preview, a local `localhost`, an app whose
   * product name is not its host) would otherwise have to override the identity
   * root to move its host, which silently moves the relying party with it and
   * invalidates every credential.
   */
  readonly appRoot: string;
  readonly doors: readonly ("root" | "setup" | "admin" | "identity" | "slug" | "custom" | "device")[];
  /**
   * OTHER DOMAINS OF OURS THAT ANSWER HERE.
   *
   * ⚠️ DECLARED SO THEY ARE NOT RESOLVED AS SOMEBODY'S CUSTOM DOMAIN. A hostname
   * the classifier does not recognise falls through to the custom-domain lookup,
   * which asks which TENANT registered it — so a domain we own and did not
   * declare is one a tenant's claim can be served at.
   */
  readonly aliases?: readonly AliasRoot[];
  readonly regions: readonly RegionId[];
  readonly defaultRegion: RegionId;
  /** Labels a tenant may not take — other doors, mail autoconfig, ACME, money words. */
  readonly reservedSlugs: readonly string[];
  /**
   * WHO MAY OPEN A WORKSPACE HERE.
   *
   * ⚠️ `open` IS A SELF-SERVE PRODUCT: anybody who can sign in can create one,
   * which is what `access.personal` already says and what a free tier means.
   *
   * ⚠️ `granted` IS A PRODUCT SOMEBODY IS LET INTO. The address has to hold a
   * provisioning grant — written by whoever sells the thing — and without one the
   * creation is REFUSED rather than merely unoffered. That distinction is the
   * whole point: a button the hub does not draw is not a control, it
   * is a decoration, and the route is reachable by anybody who reads the tool
   * catalogue or the API document.
   *
   * ⚠️ AND THE DEFAULT IS `open`, BECAUSE THAT IS WHAT AN APP WITHOUT AN OPINION
   * ALREADY DID. A default of `granted` would silently close every existing
   * product's front door on the day this field was added.
   */
  readonly creation?: "open" | "granted";
}

/* -------------------------------------------------------------- defaults --- */

/** What a value MEANS before anybody chooses how to see it. */
export interface FormatSpec {
  readonly currency: Currency;
  readonly timeZone: TimeZone;
  readonly locale: Locale;
  readonly units: UnitSystem;
  readonly weekStart: 0 | 1 | 6;
}

/* ---------------------------------------------------------------- access --- */

export interface AccessSpec {
  readonly permissions: readonly string[];
  readonly roles: Readonly<Record<string, readonly string[]>>;
  /**
   * What a signed-in person holds BEFORE they belong to any workspace.
   *
   * ⚠️ REQUIRED, AND USUALLY ONE KEY. Somebody has to be able to create their
   * first workspace before being a member of one, and a role cannot express
   * that — a role is held inside a tenant, and this caller is outside every
   * tenant. Leaving it to the caller resolver is what produced the scaffold in
   * every app here: "give a signed-in person the owner role" is the shortest
   * way to make the setup door work, and it is an authorization bypass on every
   * other door.
   *
   * The empty list is a real answer: an app nobody may join except by
   * invitation.
   */
  readonly personal: readonly string[];
  /** What the platform sells this app's tenants, and how each one is withheld. */
  readonly entitlements: Readonly<Record<string, EntitlementDef>>;
  /** The catalogue. Empty is a legitimate deployment — one with nothing for sale. */
  readonly plans: readonly PlanSpec[];
  /**
   * ⚠️ WHAT A WORKSPACE MAY BUY TO TOP UP ITS GENERATION BALANCE, and it is
   * separate from the plan on purpose: credits are consumption and a plan is
   * access. An app that sold them together would answer "I have run out" with an
   * upgrade, which is a bigger set of features where somebody wanted more of the
   * one they were already using.
   *
   * Empty is a real answer — an app that generates nothing, or one whose
   * deployment funds credits some other way.
   */
  readonly creditPacks?: readonly CreditPack[];
  /**
   * Whether this app sells to its tenants' own customers, and WHO the customer
   * is when it does.
   *
   * ⚠️ TWO FLAG SYSTEMS, NEVER MERGED — and an app that says `false` may not
   * then declare flags, because the rail is what decides whether anything
   * resolves them.
   *
   * ⚠️ AND THE SUBJECT IS DECLARED RATHER THAN RESOLVED BY EACH APP. In one
   * product the customer IS the signed-in person; in another they are a record
   * somebody was assigned to. That one difference is the whole of what an app's
   * caller resolver used to exist for — and the version every app wrote returned
   * the account id, which is right for the first shape and silently wrong for
   * the second.
   *
   * - `"member"` — the signed-in account is the customer.
   * - `"record"` — the membership names the record they are, on the invitation.
   */
  readonly customerRail: false | "member" | "record";
  readonly customerFlags: Readonly<Record<string, FlagDef>>;
  /**
   * ⚠️ REQUIRED, and the empty list is the honest way to say "nothing counts".
   *
   * A seat model decides what a plan's ceiling is measured against, so it is a
   * day-zero declaration: arriving late means auditing every membership row for
   * what should have been counted since the first tenant signed up. Optional, it
   * is a field an app omits — which is indistinguishable from an app that has no
   * ceiling, right up until somebody is billed for the difference.
   */
  readonly seats: { readonly counts: readonly string[] };
}

/* --------------------------------------------------------------- consent --- */

/**
 * A DOCUMENT SOMEBODY IS ASKED TO AGREE TO.
 *
 * ⚠️ IT CARRIES ITS TEXT, OR AN ADDRESS FOR IT, AND A DECLARATION WITH NEITHER
 * IS REFUSED AT COMPOSITION.
 *
 * This was `{ id, version, mustAccept }`. The consent ledger recorded that
 * somebody agreed to `terms@2026-01-01`, and the text of `terms@2026-01-01`
 * existed nowhere — not in the manifest, not on a page, not in the repository. A
 * ledger pointing at nothing is worse than no ledger: it manufactures evidence
 * that somebody agreed to something that cannot be produced, which is precisely
 * the document anybody would ask for it about.
 */
export interface LegalDoc {
  readonly id: string;
  readonly version: string;
  /** What it is called, in the words somebody sees before they agree. */
  readonly title: string;
  /**
   * The text, for a document short enough to read where it is asked about.
   *
   * ⚠️ ONE OF `body` OR `url` IS REQUIRED. Both together is the useful case: a
   * plain-language notice somebody actually reads, beside the operative document
   * they can open.
   */
  readonly body?: string;
  readonly url?: string;
  /** ⚠️ Who must accept it, recorded per person per version. Not backfillable. */
  readonly mustAccept: readonly string[];
  /**
   * WHAT IS DIFFERENT ABOUT THIS VERSION, IN THE WORDS OF SOMEBODY WHO AGREED TO
   * THE LAST ONE.
   *
   * ⚠️ VERSIONING WAS ALREADY REAL AND SILENT. The ledger is keyed per person
   * per document per VERSION, so a new version correctly re-asks everybody — and
   * what they were shown was the same wall of text with a different number on it
   * and no way to tell what moved. Somebody re-agreeing without being told what
   * changed is a signature collected, not a consent given.
   *
   * ⚠️ ABSENT ON A FIRST VERSION, AND THAT IS NOT AN OMISSION. There is no
   * previous version to differ from, so a summary of changes would be a sentence
   * invented to fill a field. An interface shows it where it exists and asks
   * nothing where it does not.
   */
  readonly changed?: string;
}

/**
 * ⚠️ THE ROLE A PLATFORM DOCUMENT IS ASKED OF, AND IT IS NOT A WORKSPACE ROLE.
 * Everything else in `mustAccept` names something somebody is inside a product —
 * an owner, a client, a coach. What the deployment asks is owed by anybody who
 * has an ACCOUNT, including somebody who has never opened a product and belongs
 * to nothing, which is a real state and the one where nothing else applies.
 */
export const ACCOUNT_HOLDER = "account";

/**
 * WHO RUNS THIS DEPLOYMENT, AND WHAT THEY ASK OF EVERYBODY WITH AN ACCOUNT.
 *
 * ⚠️ THE SHAPE IS THE PLATFORM'S; THE CONTENT IS NOT. Naming a company in a
 * product-agnostic package is the same mistake as putting one product's nouns in
 * a shared component library — so this type lives here and the one object that
 * fills it lives in the deployment's own module, injected once.
 *
 * ⚠️ IT EXISTS BECAUSE AN APP'S DECLARATION STRUCTURALLY CANNOT COVER THIS. A
 * vault fact outlives every workspace somebody leaves and every product they stop
 * using — that is what the vault IS — so the app that asked to read it is not the
 * party holding it. Nor can an app's terms cover an account with no workspaces in
 * it, which is a state somebody can sit in indefinitely while we hold their
 * address, their passkeys and the record of who read their facts.
 */
export interface DeploymentSpec {
  /** What the operator is called where a person would recognise it. */
  readonly name: string;
  /** ⚠️ The controller of the ACCOUNT and the VAULT. Not any product's. */
  readonly controller: string;
  /** Where a data-protection question goes. An address, not a form. */
  readonly contact: string;
  /**
   * ⚠️ ASKED OF `ACCOUNT_HOLDER`, NOT OF A ROLE. `legalProblems` still applies —
   * a version, a title, text or an address, and somebody it is required of.
   */
  readonly legal: readonly LegalDoc[];
  /**
   * WHO ELSE TOUCHES AN ACCOUNT — the infrastructure every product on this
   * deployment stands on.
   *
   * ⚠️ IT USED TO SAY "NOBODY", WHICH WAS FALSE. The account's own disclosure was
   * a controller and an address with an empty recipient list, so the one screen
   * that answers "who else sees this" said nobody else did — while the platform's
   * host stored the sessions table and the passkeys, and the mail lane carried
   * every sign-in code. Those are processors of the ACCOUNT, before and outside
   * any product.
   *
   * ⚠️ AND ONE COPY, NOT ONE PER APP. Every product here runs on the same host,
   * the same mail lane and the same payment rail; each manifest declaring its own
   * entry is the same company written N times and drifted by the second edit —
   * the identical argument that made this module exist. An app's list is merged
   * ON TOP of this one and wins on a shared id, because an app genuinely may
   * reach somewhere the platform does not.
   */
  readonly subprocessors: readonly Subprocessor[];
  /**
   * EVERY PRODUCT ON THIS DEPLOYMENT, DECLARED ONCE.
   *
   * ⚠️ THE ACCOUNT CENTRE CANNOT ASK AN APP WHAT ELSE EXISTS. It is served by one
   * worker and every other product is a different one; the only thing they share
   * is this module and the global directory. Without a list here, "which products
   * could I open a workspace in" has no answer at all — which is why the account
   * centre could show somebody the workspaces they are in and nothing about the
   * ones they could start.
   *
   * ⚠️ AND THE WORKSPACE IS CREATED AT THE PRODUCT'S OWN SETUP DOOR, never here.
   * Creating one writes a membership into that product's regional store, which
   * this worker has no binding for — so the hub's job is to say who
   * may create, where, and to hand over. `setup.<root>` is that address, and it
   * is derived from the root rather than stored, so the two cannot disagree.
   */
  readonly products?: readonly Product[];
}

/** One product on this deployment, as the hub needs to know it. */
export interface Product {
  /** The app id, which is what a workspace's directory row records. */
  readonly id: string;
  readonly name: string;
  /** One line: what somebody would open a workspace here to do. */
  readonly does: string;
  /** The host its doors hang off — the same value as its own `tenancy.appRoot`. */
  readonly root: string;
  /**
   * ⚠️ WHETHER ANYBODY SIGNED IN MAY OPEN ONE HERE. It mirrors the product's own
   * `tenancy.creation`, and the duplication is unavoidable rather than sloppy:
   * the hub is served by one worker and cannot import another
   * product's manifest, so this is the only place it can learn the answer.
   *
   * ⚠️ WHICH IS WHY EACH APP CHECKS ITS OWN ENTRY AGAINST ITS OWN MANIFEST. A
   * disagreement here offers somebody a door that then refuses them, or hides one
   * that would have opened — and the app is the only side that can see both.
   */
  readonly open?: boolean;
}

/**
 * WHERE A WORKSPACE IS CREATED FOR A PRODUCT.
 *
 * ⚠️ DERIVED, NOT DECLARED, so an hub and a product cannot disagree
 * about the one address that has to be right — and `classifyHost` already reads
 * the same label. A second field holding "https://setup.kova.4dl.app" is a field
 * somebody edits when the root moves and forgets when it moves back.
 */
export const setupDoorFor = (product: Product): string => `https://setup.${product.root}`;

/**
 * THE ACCOUNT'S OWN DISCLOSURE, AS A PROJECTION OF THE DECLARATION ABOVE.
 *
 * ⚠️ ONE ASSEMBLY, TWO CALLERS, AND THAT IS WHY IT IS A FUNCTION. The runtime
 * answers it to a signed-in person and the preview draws it; written twice they
 * would agree until the first edit, and the disagreement would be between what a
 * person is told about who holds their account and what a reviewer is shown.
 *
 * ⚠️ THE TRANSFERS ARE THE PROCESSORS THEMSELVES, WHICH IS THE ONE PLACE THAT IS
 * TRUE. Everywhere else `transfersOf` crosses what a product HOLDS with what each
 * processor receives, so a recipient cannot over-declare — but an account's
 * holdings are not a collection anybody wrote, so the crossing has nothing to
 * narrow against. Stated FROM the declaration rather than beside it, so the two
 * cannot drift.
 *
 * ⚠️ NO REGIONS AND NO INFERENCE, WHICH IS A DIFFERENT KIND OF EMPTY. An account
 * is global by construction — it is what routes somebody TO a region rather than
 * a thing placed in one — and nothing generates from it. Both are absent because
 * they do not apply, and an interface omits a row rather than printing a blank.
 */
export function accountReceiving(ours: DeploymentSpec): Receiving {
  return {
    controller: ours.controller,
    contact: ours.contact,
    subprocessors: ours.subprocessors,
    regions: [],
    inference: {},
    transfers: ours.subprocessors.map((sub) => ({
      to: sub.id,
      name: sub.name,
      where: sub.where,
      safeguard: sub.safeguard,
      categories: sub.receives,
      special: sub.receives.some((c) => SPECIAL_CATEGORIES.includes(c)),
      subjects: ["member"],
    })),
  };
}

/**
 * WHAT ONE PRODUCT ASKS OF ONE PERSON, ACROSS EVERY WORKSPACE THEY ARE IN IT.
 *
 * ⚠️ IT IS A KERNEL TYPE BECAUSE TWO SIDES HAVE TO AGREE ON IT. The runtime
 * assembles it and a screen renders it, and the screen cannot see the handler —
 * so a shape described in both places is one that is checked in neither.
 *
 * ⚠️ ROLES ARE A LIST BECAUSE A PERSON HOLDS SEVERAL. An owner of one studio and
 * a client of another owes what EITHER role owes, and accepting is recorded per
 * account, so it is one obligation rather than two lists.
 */
export interface LegalForApp {
  readonly appId: string;
  readonly appName: string;
  /** Every role this person holds in this product, sorted. */
  readonly roles: readonly string[];
  /** Everything the product publishes, whether or not it is asked of them. */
  readonly documents: readonly LegalDoc[];
  /** The subset any of their roles still owes. */
  readonly outstanding: readonly LegalDoc[];
  /**
   * ⚠️ THIS PRODUCT'S OWN DISCLOSURE, because each has different recipients.
   * Showing one app's under every app's documents is the asymmetry the published
   * declaration exists to remove — a person in three products was being told
   * about the one behind whichever door they came through.
   *
   * Null where a row predates the column, which is a real state and not an
   * absence to render as "nobody is responsible".
   */
  readonly receiving: Receiving | null;
}

/**
 * ⚠️ EVERY ONE OF THESE IS A CONSENT THAT WOULD BE RECORDED AGAINST NOTHING.
 *
 * A version is part of the ledger's key, so a document whose version changes
 * without its text changing asks everybody again for no reason — and one whose
 * text changes without its version changing inherits every consent ever given,
 * which is the single property the ledger exists to deny.
 */
export function legalProblems(docs: readonly LegalDoc[]): readonly { readonly id: string; readonly why: string }[] {
  const out: { id: string; why: string }[] = [];
  const seen = new Set<string>();
  for (const d of docs) {
    if (seen.has(d.id)) out.push({ id: d.id, why: "is declared twice, so which version is asked about is whichever came last" });
    seen.add(d.id);
    if (!d.title.trim()) out.push({ id: d.id, why: "has no title, so it is asked about by its identifier" });
    if (!d.version.trim()) out.push({ id: d.id, why: "has no version, so a consent to it cannot be told from a consent to the next one" });
    if (!d.body?.trim() && !d.url?.trim()) {
      out.push({ id: d.id, why: "carries neither its text nor an address for it — a consent recorded against it refers to nothing" });
    }
    if (!d.mustAccept.length) {
      out.push({ id: d.id, why: "is required of nobody, so it is a document that is never shown and never agreed to" });
    }
    /*
      ⚠️ AN ID THE ACCOUNT CENTRE'S ADDRESSES ALREADY USE IS A DOCUMENT THAT
      EXISTS AND CANNOT BE OPENED. Its screen is one path segment past the
      product — `legal/<product>/<document>` — and the surface reserves one word
      at that position for the disclosure. A document called it would resolve to
      the disclosure instead, on every link, for ever, and nothing would throw.
      Refused where the collision is, rather than handled by a parser that would
      have to guess which one the author meant.
    */
    if (RESERVED_DOCUMENT_IDS.includes(d.id)) {
      out.push({ id: d.id, why: `is a word the hub's own addresses use, so its screen would be unreachable (reserved: ${RESERVED_DOCUMENT_IDS.join(", ")})` });
    }
  }
  return out;
}

/**
 * ⚠️ WHAT A DOCUMENT MAY NOT BE CALLED, AND WHY THE LIST IS HERE. The interface
 * gives every screen an address and one segment past a product is where a
 * document's id goes; the disclosure sits at the same depth under a fixed word.
 * The check belongs beside the declaration it refuses rather than inside the
 * parser, because a parser can only guess and a refusal is a sentence somebody
 * reads while they still have the name in their hand.
 */
export const RESERVED_DOCUMENT_IDS: readonly string[] = ["who"];

/**
 * ⚠️ AND THE SAME FOR AN APP ID, at the segment above. `account` is how the
 * hub spells the deployment — whose own id is the empty string, which
 * no path can carry — so an app registered under that name would take over the
 * one address the platform's own documents live at.
 */
export const RESERVED_APP_IDS: readonly string[] = ["account"];

/* ------------------------------------------------------------ governance --- */

export interface GovernanceSpec {
  readonly legal: readonly LegalDoc[];
  /**
   * ⚠️ REQUIRED, because the record of processing is derived from it and a
   * derivation with a missing input is a document with a hole in it that reads
   * as a processing activity that does not happen.
   */
  readonly protection: ProtectionSpec;
  /** ⚠️ Operator access to a tenant: time-boxed, audited, announced. From day one. */
  readonly impersonation: { readonly maxMinutes: number; readonly announce: boolean };
  readonly auditRetentionDays: number;
}

/* ------------------------------------------------------------ presentation --- */

export interface SoundSpec {
  /** The platform's audio set. An app names intent and never ships a file. */
  readonly pack: string;
  /**
   * ⚠️ PER SURFACE, NOT PER ACTION, and per surface is the only granularity that
   * is a real decision. A station in a gym is audible and a dashboard in an
   * office is not; whether one particular save makes a noise is a question
   * nobody has ever wanted to answer twice.
   *
   * An app with no `sounds` at all is SILENT — which is the right default, and
   * the reason this is optional rather than defaulted to on.
   */
  readonly surfaces: Readonly<Record<string, "on" | "off">>;
}

/* ------------------------------------------------------------------ app --- */

/**
 * ⚠️ THE CODES AN OPERATION IS ALLOWED TO FAIL WITH.
 *
 * The app's own catalogue plus the platform's, because the platform raises its
 * codes on an operation's behalf — the gate, the resolver and the router all
 * answer before a handler runs — so requiring an app to re-declare them would be
 * asking it to describe machinery it does not own.
 */
export type DeclaredCode<P extends ProblemCatalog> = (keyof P & string) | (keyof typeof PLATFORM_PROBLEMS & string);

/**
 * ⚠️ THE CHECK THAT MAKES A `Problem` CATALOGUE A CONTRACT RATHER THAN A LIST.
 *
 * An operation naming a code nobody declared is a failure with no copy, no
 * status and no help link — which at runtime becomes a generic 503 wearing the
 * shape of a specific answer, and no test anywhere fails. Resolving it at
 * composition time is the only place both halves are in scope.
 *
 * The mechanism: this evaluates to `never` when every `fails` entry is declared,
 * and to the offending literal otherwise — which `defineApp` turns into a type
 * error naming the code.
 */
export type UndeclaredFailure<O extends readonly { readonly fails?: readonly string[] }[], P extends ProblemCatalog> =
  Exclude<NonNullable<O[number]["fails"]>[number], DeclaredCode<P>>;

export interface AppSpec<B extends BindingSpec, P extends ProblemCatalog = ProblemCatalog> {
  readonly id: string;
  readonly name: string;
  /** ⚠️ Live data once anything is sold: it tags every Stripe object we create. */
  readonly stripeMetadataPrefix: string;

  readonly manifestVersion: string;
  readonly bindings: B;
  readonly identity: IdentitySpec;
  readonly tenancy: TenancySpec;
  readonly format: FormatSpec;
  readonly access: AccessSpec;
  readonly governance: GovernanceSpec;

  readonly collections: readonly CollectionSpec[];
  /**
   * WHAT THIS APP ASKS TO SEE OF SOMEBODY'S OWN FACTS.
   *
   * ⚠️ ASKS. It does not hold them — the vault does, once, for the account, and
   * an app is granted a VIEW at an audience the person chose. So this list is
   * not a schema: it is the consent sheet, written by whoever wants the data, in
   * the words they would have to justify to the person deciding.
   *
   * ⚠️ AND DECLARING A WANT IS WHAT MAKES THE FACT UNAVAILABLE ANY OTHER WAY.
   * `shadowProblems` refuses a collection field that shadows a vault fact, so an
   * app cannot ask politely here and quietly keep its own column — which is
   * exactly what an app would do, because a column is easier than a grant.
   *
   * Absent means this app wants none of it, and the whole surface is absent
   * rather than present and refusing.
   */
  readonly vault?: VaultSpec;
  /**
   * ⚠️ WHAT THIS APP CAN TELL SOMEBODY, DECLARED. An operation may only `emit`
   * something named here, and a notification may only link to a collection this
   * manifest declares — so a type that renders as an anonymous bell, and one
   * that opens a screen the app does not have, are both refused at composition.
   */
  readonly notifications: NotificationRegistry;
  /**
   * ⚠️ HELP LIVES IN THE MANIFEST, so a cross-link cannot name an article that
   * does not exist and an article cannot explain a screen the app does not have.
   * A wiki is where documentation goes to describe a version of the product that
   * no longer exists.
   */
  readonly help: HelpRegistry;
  /**
   * ⚠️ WHAT MAY BE UPLOADED, AS A CLOSED SET. A purpose is a POLICY — what a
   * file is for, which types it takes, how large it may be — and a free-form
   * string makes every one of those questions unanswerable at the moment they
   * matter, which is the moment somebody is uploading.
   *
   * Empty means this app takes no files at all, and the whole surface is absent
   * rather than present and refusing.
   */
  readonly filePurposes: Readonly<Record<string, FilePurpose>>;
  /**
   * ⚠️ THE CATALOGUE IS THE PLATFORM'S AND THE PROMPT IS THE APP'S. Rates are a
   * fact about a provider's price list, identical in every product, and getting
   * one wrong is a transfer rather than a bug. What to ask for is the whole of
   * what makes a product different.
   *
   * Absent means this app generates nothing, and the surface is absent rather
   * than present and refusing.
   */
  readonly ai?: AiSpec;
  /**
   * ⚠️ WHAT A `json` FIELD ACTUALLY CONTAINS, and it is not optional the moment
   * one exists.
   *
   * A `json` field names a schema — `field.json("programme.weeks")` — and that
   * name used to be a comment: nothing read it, so the column took any shape at
   * all. The characteristic failure is not a crash. Code that reads the body
   * walks the keys it expects, finds none of them, and returns the input
   * unchanged: a plan whose days carry `items` where the reader wants
   * `movements` copies a week and applies no progression, saves, and reports
   * success. Every number is right and nothing moved.
   *
   * ⚠️ REGISTERED BY THE APP, because the SHAPE is the product's. A platform
   * that owned it would be owning what a training plan is.
   */
  readonly schemas?: Readonly<Record<string, Shape<unknown>>>;
  /**
   * ⚠️ WHAT A WORKSPACE MAY CHOOSE ABOUT ITSELF, and it is not config.
   *
   * Config is the DEPLOYMENT's — one Stripe key, one mail provider, set by an
   * operator, the same for everybody. A setting is one WORKSPACE's, set by its
   * owner and different for every tenant on the same deployment. Merging them
   * would put a studio's accent colour and a live secret key behind one read.
   *
   * Every app gets the three branding keys whether it declares any or not,
   * because the sign-in screen wears them and that screen renders before there
   * is a session to resolve an app's own settings with.
   */
  readonly settings?: SettingsSpec;
  /**
   * ⚠️ WHOSE SERVERS THIS APP MAY TALK TO, BY HOST.
   *
   * An outbound request is a capability rather than a convenience, because of
   * where a worker sits: a URL a caller can influence is a request made FROM
   * inside our network, to an address they chose. Declaring the HOST — never a
   * base URL, because a base URL carries a path somebody will interpolate into —
   * is what makes that unavailable rather than discouraged.
   */
  readonly services?: Services;
  /**
   * ⚠️ SCHEDULED WORK IS DECLARED, NOT CRON'D. A cron entry in a deployment
   * config is a capability with no surface, no test, no audit and no record that
   * it ran — and the characteristic failure is silence rather than an error.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly jobs: readonly JobSpec<any>[];
  /**
   * ⚠️ A CHECKLIST, NOT A TOUR — and the wizard is the `required` half of the
   * same list. Every step is DERIVED by counting, so it cannot drift from what
   * is true, survives a change of device, and un-checks itself if the thing is
   * deleted. A tour step can only record "seen".
   */
  readonly guide: GuideSpec;
  /**
   * ⚠️ RECOGNITION, NOT SCORE, AND THE RULES ARE OVER `emits`. A milestone is a
   * rule over something the manifest already declares an operation raises — so
   * there is no second set of instrumentation to remember, and a rule waiting on
   * an event nothing raises is refused rather than being a badge somebody works
   * towards forever. Empty is a product that recognises nothing, which is most
   * of them.
   */
  readonly milestones: MilestoneRegistry;
  /** The changelog, as product copy. A commit message here is refused. */
  readonly releases: readonly Release[];
  /**
   * ⚠️ WHAT THIS APP DELIBERATELY STOPPED OFFERING, AND WHY.
   *
   * Removing a plan, a permission or an entitlement is a decision about people
   * currently holding it — and a deletion looks identical to a rename and to a
   * typo. Naming it here is what makes the three different.
   */
  readonly retired: Retired;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly operations: readonly OperationSpec<B, any, any, string>[];
  readonly problems: P;

  readonly sounds?: SoundSpec;
}

/* ------------------------------------------------------------- coverage --- */

/**
 * ⚠️ EVERY SOLD CAPABILITY IS WITHHELD BY SOMETHING, AND THIS IS WHERE IT IS
 * PROVED.
 *
 * Both rails fail the same way and it is the quietest failure in a commercial
 * product: a capability appears on a price list, the interface hides it from
 * whoever did not buy it, and no route withholds anything. Every test passes,
 * because the tests drive the interface. The only signal is that the cheap plan
 * does the expensive thing for anyone who asks for it directly — which is the
 * first thing an API consumer, an assistant, or a curious customer does.
 *
 * Two products shipped that exact shape, and one of them shipped it through a
 * builder that rendered a switch for every declared capability, so adding one
 * was a single line and forgetting to enforce it was invisible.
 *
 * The check is a lookup rather than a search: an enforcement names a mechanism,
 * and the mechanism is an operation field, so composition can ask whether an
 * operation really names it. `{ unenforced }` and `{ derived }` opt out WITH A
 * REASON, which is the only kind of exemption that survives review — a boolean
 * exemption is indistinguishable from an oversight the moment its author leaves.
 */
export interface Uncovered {
  readonly rail: "entitlement" | "customer_flag";
  readonly key: string;
  readonly declared: string;
}

/**
 * ⚠️ AN OPERATION MAY ONLY RAISE SOMETHING SOMEBODY CAN RECEIVE.
 *
 * `emits` drives the webhook catalogue AND the inbox, so an undeclared event is
 * two failures at once: a subscription nobody can make, and a notification with
 * no copy, no icon and no destination — which renders, if anything renders it at
 * all, as an anonymous bell.
 *
 * The same treatment as a failure code, for the same reason: an operation is
 * written before the registry it will be composed with, so its own declaration
 * site cannot see one.
 */
/**
 * ⚠️ THE OPERATIONS A COLLECTION IMPLIES, so a checklist step may offer one.
 * Naming them here rather than importing the runtime keeps the check at
 * composition time — and a verb added to the derivation without being added
 * here makes a legitimate step look like a typo, which is the safe direction.
 */
const DERIVED_VERBS = ["list", "read", "create", "update", "delete", "submit", "cancel", "amend"] as const;

/**
 * Every event this manifest says something raises.
 *
 * ⚠️ JOBS RAISE EVENTS TOO, AND THEIRS ARE THE ONES NOBODY SEES FAIL. An
 * operation with an undeclared emit is found the first time somebody uses the
 * feature; a sweep's is found the night it finally has something to say.
 */
export function raisedEvents(spec: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly operations: readonly OperationSpec<any, any, any, string>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly jobs?: readonly JobSpec<any>[];
  readonly collections?: readonly CollectionSpec[];
}): readonly string[] {
  const out = new Set<string>();
  for (const source of [...spec.operations, ...(spec.jobs ?? [])]) {
    for (const event of source.emits ?? []) out.add(event);
  }
  /*
    ⚠️ A DOCUMENT'S OWN TRANSITIONS RAISE EVENTS TOO, and they are invisible in
    `operations` because nobody wrote those operations — they are derived. An
    undeclared one is a notification with no copy, no icon and no destination,
    arriving at the single most notification-worthy moment the product has.
  */
  for (const c of spec.collections ?? []) {
    for (const event of Object.values(c.docStatus?.emits ?? {})) if (event) out.add(event);
  }
  return [...out];
}

/**
 * Everything a milestone rule may legitimately be written over.
 *
 * ⚠️ THE PLATFORM'S OWN EVENTS COUNT HERE AND NOT IN `undeclaredEmits`. A
 * workspace created, a plan chosen and a package granted are raised by
 * operations no app wrote — so a rule over one of them is over something real,
 * while an app is not the thing that failed to declare it.
 */
export function recognisableEvents(spec: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly operations: readonly OperationSpec<any, any, any, string>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly jobs?: readonly JobSpec<any>[];
}): readonly string[] {
  return [...new Set([...PLATFORM_EVENTS, ...raisedEvents(spec)])];
}

export function undeclaredEmits(spec: {
  readonly notifications: NotificationRegistry;
  readonly collections?: readonly CollectionSpec[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly operations: readonly OperationSpec<any, any, any, string>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly jobs?: readonly JobSpec<any>[];
}): readonly string[] {
  const declared = new Set(Object.keys(spec.notifications));
  return raisedEvents(spec).filter((event) => !declared.has(event));
}

export function coverage(spec: {
  readonly access: AccessSpec;
  readonly filePurposes?: Readonly<Record<string, FilePurpose>>;
  /**
   * ⚠️ COLLECTIONS COUNT, and forgetting them would make this check vacuous for
   * exactly the apps it matters most to. An app whose whole surface is derived
   * declares no operations at all — so a coverage check reading `operations`
   * alone would report full coverage over an empty list and pass every app that
   * writes no routing, which is the shape the platform is built to encourage.
   */
  readonly collections: readonly CollectionSpec[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly operations: readonly OperationSpec<any, any, any, string>[];
}): readonly Uncovered[] {
  const gated = new Set<string>();
  const quotaed = new Set<string>();
  const flagged = new Set<string>();
  const shaped = new Set<string>();
  for (const c of spec.collections) {
    if (c.entitlement) gated.add(c.entitlement);
    if (c.quota) quotaed.add(c.quota);
    if (c.customerFlag) flagged.add(c.customerFlag);
  }
  /*
    ⚠️ THE PLATFORM'S OWN DERIVED OPERATIONS COUNT TOO. An app that declares a
    file purpose gets an upload it did not write, and that upload counts against
    storage — so a coverage check reading only what the APP declared would
    report the ceiling as unenforced and refuse a perfectly correct manifest.
  */
  if (Object.keys(spec.filePurposes ?? {}).length) quotaed.add(STORAGE_ENTITLEMENT);
  /*
    ⚠️ AND THE ROSTER'S CEILING THE SAME WAY. `member.invite` counts against
    seats, it is the platform's operation, and an app that declared the ceiling
    would be told nothing enforces it — while the enforcement sits in code the
    app never wrote and cannot name.
  */
  if (spec.access.seats.counts.length) quotaed.add(SEATS_ENTITLEMENT);
  for (const op of spec.operations) {
    if (op.entitlement) gated.add(op.entitlement);
    if (op.quota) quotaed.add(op.quota);
    if (op.customerFlag) flagged.add(op.customerFlag);
    for (const key of Object.values(op.shape ?? {})) shaped.add(key);
  }

  const out: Uncovered[] = [];
  for (const [key, def] of Object.entries(spec.access.entitlements)) {
    if (typeof def.enforcement !== "string") continue;
    const found = def.enforcement === "gate" ? gated.has(key)
      : def.enforcement === "quota" ? quotaed.has(key)
      : shaped.has(key);
    if (!found) out.push({ rail: "entitlement", key, declared: def.enforcement });
  }
  for (const [key, def] of Object.entries(spec.access.customerFlags)) {
    if (typeof def.enforcement !== "string") continue;
    const found = def.enforcement === "gate" ? flagged.has(key) : shaped.has(key);
    if (!found) out.push({ rail: "customer_flag", key, declared: def.enforcement });
  }
  return out;
}

/**
 * Compose an app.
 *
 * ⚠️ IT REFUSES AN OPERATION THAT FAILS WITH A CODE NOBODY DECLARED, and the
 * error names the code. That check can only live here: an operation is written
 * before the catalogue it will be composed with, so its own declaration site
 * cannot see one.
 *
 * It refuses three more things for the same reason — all of them are questions
 * only the whole manifest can answer, and all of them are silent at runtime:
 * a sold capability nothing withholds, a workspace that is better off never
 * paying, and customer capabilities declared by an app with no customer rail to
 * resolve them.
 *
 * ⚠️ IT THROWS RATHER THAN REPORTING. A manifest is evaluated when the worker
 * boots, so a refusal here is a deployment that does not start — which is the
 * correct outcome for a product about to sell something it does not enforce, and
 * it is loud in a way a warning in a log is not.
 */
export function defineApp<
  const B extends BindingSpec,
  const P extends ProblemCatalog,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  const O extends readonly OperationSpec<B, any, any, string>[],
>(
  spec: AppSpec<B, P> & { readonly operations: O } & (
    [UndeclaredFailure<O, P>] extends [never] ? unknown
      : { readonly problems: { readonly [K in UndeclaredFailure<O, P>]: ProblemDef } }
  ),
): AppSpec<B, P> {
  assertComposable(spec);
  return spec;
}

/**
 * The three whole-manifest refusals, in one function with two callers.
 *
 * ⚠️ CALLED AGAIN BY THE RUNTIME, deliberately. `defineApp` is where the error
 * is most useful — it names the manifest — but a spec is structurally typed, so
 * an app can assemble one without ever calling it. The runtime is the chokepoint
 * every app genuinely passes through, and a check that can be sidestepped by not
 * using the constructor is a check with an opt-out nobody documented.
 */
/**
 * Which companies an app's generations may reach, read off its inference
 * binding.
 *
 * ⚠️ IT IS A LIST OF PROVIDERS AND NOT OF MODELS, and that changed. A model-id
 * allow-list in a manifest is the thing the catalogue move exists to remove:
 * an operator adding a model would find it permitted by nobody until every
 * product was edited and redeployed. A provider is stable, is what a DPA names,
 * and is the only one of the two an app can honestly promise.
 */
export function providersOf(bindings: Readonly<Record<string, unknown>> | undefined): readonly string[] {
  return Object.values(bindings ?? {})
    .filter((b): b is { readonly kind: string; readonly subprocessors?: readonly string[]; readonly byRegion?: Readonly<Record<string, readonly string[]>> } =>
      typeof b === "object" && b !== null && (b as { kind?: unknown }).kind === "inference")
    .flatMap((b) => [...(b.subprocessors ?? []), ...Object.values(b.byRegion ?? {}).flat()]);
}

export function assertComposable(spec: {
  readonly id: string;
  readonly access: AccessSpec;
  /** ⚠️ Structurally, because the check is over a store's shape rather than an app's. */
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly tenancy?: { readonly regions: readonly string[] };
  readonly filePurposes?: Readonly<Record<string, FilePurpose>>;
  readonly ai?: AiSpec;
  readonly collections: readonly CollectionSpec[];
  /** ⚠️ Optional to declare, and the shadow check runs either way — see below. */
  readonly vault?: VaultSpec;
  readonly notifications: NotificationRegistry;
  readonly help: HelpRegistry;
  readonly releases: readonly Release[];
  /** ⚠️ For the documents. A consent ledger keyed on one that does not exist. */
  readonly governance: GovernanceSpec;
  readonly guide?: GuideSpec;
  readonly milestones?: MilestoneRegistry;
  readonly schemas?: Readonly<Record<string, Shape<unknown>>>;
  /**
   * ⚠️ WHAT A WORKSPACE MAY CHOOSE ABOUT ITSELF, and it is not config.
   *
   * Config is the DEPLOYMENT's — one Stripe key, one mail provider, set by an
   * operator, the same for everybody. A setting is one WORKSPACE's, set by its
   * owner and different for every tenant on the same deployment. Merging them
   * would put a studio's accent colour and a live secret key behind one read.
   *
   * Every app gets the three branding keys whether it declares any or not,
   * because the sign-in screen wears them and that screen renders before there
   * is a session to resolve an app's own settings with.
   */
  readonly settings?: SettingsSpec;
  readonly services?: Services;
  readonly problems: Readonly<Record<string, unknown>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly jobs?: readonly JobSpec<any>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly operations: readonly OperationSpec<any, any, any, string>[];
}): void {
  const uncovered = coverage(spec);
  if (uncovered.length) {
    throw new Error(
      `${spec.id}: ${uncovered.length} sold capability(s) that nothing withholds — ` +
        uncovered.map((u) => `${u.key} (declared "${u.declared}" on the ${u.rail} rail)`).join(", ") +
        `. Name it on an operation, or declare it unenforced with a reason.`,
    );
  }

  /*
    ⚠️ A PLAN SELLING A KEY NOBODY DECLARED IS A PRICE LIST PROMISING SOMETHING
    THAT DOES NOT EXIST — sold, paid for, resolved by nothing at the gate, and
    indistinguishable from a capability that happens to be generous.
  */
  const market = marketProblems(spec.access.plans, spec.access.entitlements);
  if (market.length) {
    throw new Error(`${spec.id}: plans — ${market.map((m) => `"${m.id}" ${m.why}`).join("; ")}.`);
  }

  const generous = parkingAboveFloor(spec.access.entitlements, spec.access.plans);
  if (generous.length) {
    throw new Error(
      `${spec.id}: the parking state is more generous than the cheapest plan for ${generous.join(", ")} — ` +
        `not paying would buy more than paying does.`,
    );
  }

  /*
    ⚠️ A PERMISSION NAMED NOWHERE IN THE MANIFEST IS A KEY NO GATE READS. On the
    personal set it is worse than merely inert: it is the set that decides
    whether anybody can create their first workspace, so a typo there is a
    product nobody can sign up to, refusing with the same 403 as a genuine lack
    of permission.
  */
  const undeclared = spec.access.personal.filter((p) => !spec.access.permissions.includes(p));
  if (undeclared.length) {
    throw new Error(`${spec.id}: personal permission(s) ${undeclared.join(", ")} are not in access.permissions.`);
  }

  /*
    ⚠️ AN APP THAT LETS PEOPLE CREATE WORKSPACES AND HAS NO ROLE THAT CAN MANAGE
    MEMBERS FOUNDS WORKSPACES NOBODY CAN ENTER. The platform makes the creator a
    member in the role that can invite others, chosen by capability rather than
    by name — so with no such role there is no founding membership, and the new
    workspace answers 403 to its own creator with every row looking correct.
  */
  const canCreate = [...spec.access.personal, ...Object.values(spec.access.roles).flat()].includes("workspace:create");
  const canManage = Object.values(spec.access.roles).some((keys) => keys.includes("member:manage"));
  if (canCreate && !canManage) {
    throw new Error(
      `${spec.id}: somebody may create a workspace but no role holds member:manage, ` +
        `so a new workspace has no founding member and nobody can enter it.`,
    );
  }

  if (!spec.access.customerRail && Object.keys(spec.access.customerFlags).length) {
    throw new Error(`${spec.id}: declares customer capabilities with customerRail false, so nothing resolves them.`);
  }

  const unheard = undeclaredEmits(spec);
  if (unheard.length) {
    throw new Error(
      `${spec.id}: operation(s) raise ${unheard.join(", ")}, which no notification declares — ` +
        `nobody can subscribe to it and it has no copy, icon or destination.`,
    );
  }

  /*
    ⚠️ THE PLATFORM'S EVENTS NEED COPY TOO, AND THE APP IS WHERE COPY LIVES.
    `dispatch` answers an unknown type by returning nothing — so an app that did
    not happen to declare these three got no announcement of a workspace being
    created, a plan being chosen or days being added, from a registry lookup,
    with every test green.
  */
  const silent = PLATFORM_EVENTS.filter((event) => !(event in spec.notifications));
  if (silent.length) {
    throw new Error(
      `${spec.id}: the platform raises ${silent.join(", ")}, which this app declares no notification for — ` +
        `so nothing announces it and there is no copy for it anywhere.`,
    );
  }

  const dangling = danglingLinks(spec.notifications, spec.collections);
  if (dangling.length) {
    throw new Error(`${spec.id}: notification(s) ${dangling.join(", ")} link to a collection this app does not declare.`);
  }

  /*
    ⚠️ REPORTED ALL AT ONCE. A check that stops at the first failure turns fixing
    a manifest into a conversation of one sentence at a time.
  */
  /*
    ⚠️ BEFORE THE HELP, because a consent recorded against a document that does
    not exist is the more expensive of the two to discover late — the rows are
    already written and there is nothing to point them at.
  */
  const legal = legalProblems(spec.governance.legal);
  if (legal.length) {
    throw new Error(`${spec.id}: legal — ${legal.map((l) => `"${l.id}" ${l.why}`).join("; ")}.`);
  }

  /*
    ⚠️ WHAT EVERY COLLECTION SAYS IT HOLDS, AND WHETHER IT IS BELIEVABLE. The
    declaration is one line and one line is exactly what somebody writes to make
    a check go away — so a collection claiming to hold nothing personal while
    carrying a field called `email`, or one whose own vocabulary is health while
    it declares only usage, is refused here rather than discovered in a
    questionnaire.
  */
  const held = holdingProblems(spec.collections);
  const declared = protectionProblems(spec.governance.protection);
  /*
    ⚠️ AND WHETHER THE LIST IS STILL TRUE, which is the half that rots. A
    sub-processor list is correct on the day it is written and wrong by the end
    of the quarter, because nothing anywhere connects adding a feature to
    disclosing where its data goes. Here it does: the only ways to reach a new
    recipient are a model, a service host and a price, all three are declarations
    in this manifest, and the composition that adds one refuses to boot until the
    disclosure names it.
  */
  /*
    ⚠️ THE PROVIDERS COME FROM THE BINDING, NOT FROM A LIST OF MODELS. An app
    declares no models — the catalogue is the deployment's — so the only stable
    thing it CAN disclose is which companies its generations may reach, and that
    is exactly what a processing agreement names. It is also the filter that
    stops an operator adding a provider from silently routing one product's data
    to a company that product never disclosed.
  */
  const disclosure = disclosureProblems(
    {
      models: spec.ai ? providersOf(spec.bindings) : [],
      services: Object.keys(spec.services ?? {}),
      charges:
        spec.access.plans.some((p) => p.price.minor > 0) ||
        (spec.access.creditPacks ?? []).some((p) => p.price.minor > 0),
    },
    spec.governance.protection.subprocessors,
  );
  /*
    ⚠️ AND WHAT THOSE DECLARATIONS OBLIGE. A processing agreement and an impact
    assessment are the two things every product owes and no product is ever
    asked for — they are owed at a moment nobody notices, and there is no error
    anywhere when they are absent. Here the collections themselves are what asks.
  */
  const agreements = agreementProblems({
    docs: spec.governance.legal,
    collections: spec.collections,
    assessment: spec.governance.protection.assessment,
  });
  /*
    ⚠️ AND WHAT THE APP ASKS TO SEE OF SOMEBODY'S OWN FACTS. Two checks, and the
    second is the one that makes the vault a mechanism rather than a courtesy:

      `wantProblems`   the consent sheet is answerable — every fact exists, every
                       ask has a reason a person can weigh, and no app argues for
                       more exposure than the fact's own registry entry does.
      `shadowProblems` the app has not ALSO given itself a column. Asking politely
                       here and keeping a private copy is what an app would do,
                       because a column is easier than a grant — and the copy is a
                       disclosure that outlives every grant over it, with nothing
                       anywhere that could take it back.

    ⚠️ THE SHADOW CHECK RUNS WHETHER OR NOT THE APP DECLARES A VAULT. An app that
    wants none of this and holds `height` on its own table is precisely the case
    the rule is for; making the check conditional on asking would mean the way to
    avoid it is to not ask.
  */
  const wants = wantProblems(spec.vault, spec.id);
  const shadows = shadowProblems(spec.collections);
  if (held.length || declared.length || disclosure.length || agreements.length || wants.length || shadows.length) {
    const all = [...held, ...declared, ...disclosure, ...agreements, ...wants, ...shadows];
    throw new Error(`${spec.id}: data protection — ${all.map((p) => `"${p.at}" ${p.why}`).join("; ")}.`);
  }

  /*
    ⚠️ A REGION THAT NEVER SAYS WHAT IT PERMITS IS A RESIDENCY PROMISE THAT STOPS
    AT STORAGE.

    The mechanism was complete — the binding could carry an allow-list and
    `generate` refused a model outside it — and no app ever declared one, so a
    workspace that chose the EU had its photographs sent to exactly the same
    models as every other workspace. Nothing failed, because falling back to the
    app-wide set is what an absent map means.

    So it is required rather than defaulted, and only where the question exists:
    one region has nothing to narrow, and an app with no model runner has nothing
    to narrow it to. Declaring the same set for a region IS an answer — it says
    the transfer happens and is covered — and the point is that somebody said it.
  */
  const inference = Object.entries((spec as { bindings?: Record<string, { kind?: string; byRegion?: Record<string, readonly string[]> }> }).bindings ?? {})
    .filter(([, store]) => store?.kind === "inference");
  const regions = (spec as { tenancy?: { regions?: readonly string[] } }).tenancy?.regions ?? [];
  if (inference.length && regions.length > 1) {
    for (const [name, store] of inference) {
      const missing = regions.filter((r) => !(store.byRegion ?? {})[r]);
      if (missing.length) {
        throw new Error(
          `${spec.id}: binding "${name}" does not say which models region(s) ${missing.join(", ")} permit. ` +
            `Residency that stops at storage is a promise a workspace cannot tell from one that does not — ` +
            `declare byRegion for every region, repeating the set where nothing narrows.`,
        );
      }
    }
  }

  const help = helpProblems(spec.help, spec.collections);
  if (help.length) {
    throw new Error(`${spec.id}: help — ${help.map((h) => `"${h.id}" ${h.why}`).join("; ")}.`);
  }

  /*
    ⚠️ A CROSS-LINK IS RENDERED BESIDE AN ERROR, so somebody following it is
    already stuck. A dead one there is the second failure in a row, which is
    where people stop trying.
  */
  const referenced = [
    ...spec.operations.flatMap((op) => (op.help ? [op.help as string] : [])),
    ...Object.values(spec.problems).flatMap((p) => ((p as { help?: string }).help ? [(p as { help: string }).help] : [])),
  ];
  const missing = danglingHelp(spec.help, referenced);
  if (missing.length) {
    throw new Error(`${spec.id}: help article(s) ${missing.join(", ")} are linked to and not declared.`);
  }

  /*
    ⚠️ A `json` FIELD NAMING AN UNREGISTERED SCHEMA IS AN UNVALIDATED COLUMN
    WEARING A CONTRACT'S CLOTHES.

    The name reads like a promise and used to be a comment: the column took any
    shape at all, and the failure that follows is silent rather than loud. Code
    that reads the body walks the keys it expects, finds none of them, and hands
    the input back unchanged — so a plan whose days carry `items` where the
    reader wants `movements` copies a week, applies no progression, saves, and
    reports success with every number correct and nothing moved.

    Refusing at composition costs one registration; the alternative costs a
    column of malformed records nobody can find.
  */
  /*
    ⚠️ A SETTING THAT CANNOT BE USED IS WORSE THAN ONE THAT IS ABSENT, because
    it renders. A choice with nothing to choose from, a fallback that is not one
    of the choices, and a fallback of the wrong type are all controls somebody
    will keep trying — and the last travels furthest, because a number declared
    with a string fallback is `NaN` for every workspace that has not set it,
    which on the day it ships is all of them.
  */
  /*
    ⚠️ A PACK THAT GRANTS NOTHING OR COSTS NOTHING IS A PURCHASE THAT SUCCEEDS
    AND MOVES NO BALANCE, or a tap anybody can refill from for free. Neither
    throws at runtime; both are money.
  */
  const packs = packProblems(spec.access.creditPacks ?? []);
  if (packs.length) {
    throw new Error(`${spec.id}: credit pack(s) ${packs.map((p) => `"${p.id}" ${p.why}`).join("; ")}.`);
  }

  /*
    ⚠️ EVERY ONE OF THESE IS A REQUEST THAT WOULD LEAVE THIS WORKER FOR SOMEWHERE
    NOBODY MEANT — a wildcard host, an address inside our own network, or a URL
    where a host belongs, which is a path a caller's value could be interpolated
    into. None is visible in a green suite.
  */
  const services = serviceProblems(spec.services ?? {});
  if (services.length) {
    throw new Error(`${spec.id}: service(s) ${services.map((p) => `"${p.id}" ${p.why}`).join("; ")}.`);
  }

  const settings = settingsProblems({ ...spec.settings ?? {} });
  if (settings.length) {
    throw new Error(`${spec.id}: setting(s) ${settings.map((p) => `"${p.key}" ${p.why}`).join("; ")}.`);
  }

  const unregistered = spec.collections.flatMap((c) =>
    Object.entries(c.fields)
      .filter(([, f]) => f.kind === "json" && !(spec.schemas ?? {})[(f as { schema: string }).schema])
      .map(([name, f]) => `${c.id}.${name} names "${(f as { schema: string }).schema}"`));
  if (unregistered.length) {
    throw new Error(
      `${spec.id}: ${unregistered.join(", ")} — a json field must name a schema this manifest registers, ` +
        `or the column takes any shape and the reader silently returns its input unchanged.`,
    );
  }

  /*
    ⚠️ A MEDIA FIELD NO PURPOSE CAN FILL IS A FORM CONTROL THAT CANNOT BE USED.
    The upload is governed by the declared purposes and the field by its own
    `accept`, so a field naming a type no purpose takes is one where every file
    a person can produce is refused at the save — after the upload has already
    succeeded, which is the worst place to learn it. An app with a media field
    and no purposes at all is the same failure with nothing to compare against.
  */
  /*
    ⚠️ A PURPOSE NAMING A PERMISSION NOBODY CAN HOLD IS AN UPLOAD NOBODY CAN
    MAKE, and it fails as a 403 on a screen that offered the control.
  */
  const declaredPermissions = new Set(spec.access.permissions);
  const unholdable = Object.entries(spec.filePurposes ?? {})
    .filter(([, p]) => !declaredPermissions.has(p.permission))
    .map(([id, p]) => `"${id}" needs "${p.permission}"`);
  if (unholdable.length) {
    throw new Error(
      `${spec.id}: file purpose(s) ${unholdable.join(", ")}, which this app does not declare — ` +
        `so nothing can be uploaded under them.`,
    );
  }

  const purposeTypes = Object.values(spec.filePurposes ?? {}).flatMap((p) => p.accept);
  const unfillable = spec.collections.flatMap((c) =>
    Object.entries(c.fields)
      .filter(([, f]) => f.kind === "media" && !(f as { accept: readonly string[] }).accept.some((t) => purposeTypes.includes(t)))
      .map(([name]) => `${c.id}.${name}`));
  if (unfillable.length) {
    throw new Error(
      `${spec.id}: media field(s) ${unfillable.join(", ")} accept nothing any declared file purpose can produce, so no upload could ever fill them.`,
    );
  }

  /*
    ⚠️ AN UNBOUNDED SWEEP IS ONE THAT STOPS. It works on every deployment until
    the largest tenant crosses the runtime's time limit — and then it fails, is
    retried, fails at the same size, and the work never happens again.
  */
  /*
    ⚠️ EVERY AI REFUSAL HERE IS A FAILURE THAT COSTS MONEY RATHER THAN THROWING.
    A feature pointed at an undeclared model cannot compute a reserve; a rate of
    zero holds nothing and charges nothing while the provider still invoices; an
    absent per-person ceiling is a balance one person empties in an afternoon.
    None of them is visible in a green suite, because each produces a perfectly
    successful generation.
  */
  const ai = aiProblems(spec.ai);
  if (ai.length) {
    throw new Error(`${spec.id}: ai — ${ai.map((a) => `"${a.id}" ${a.why}`).join("; ")}.`);
  }

  const unbounded = (spec.jobs ?? []).filter((j) => !Number.isInteger(j.batch) || j.batch < 1).map((j) => j.id);
  if (unbounded.length) {
    throw new Error(`${spec.id}: job(s) ${unbounded.join(", ")} declare no bound on one run.`);
  }

  /*
    ⚠️ A STEP COUNTING A COLLECTION THE APP DOES NOT HAVE IS ANSWERED "NO"
    FOREVER — so a new workspace is told to do something that cannot be done,
    and a `required` one of those is a wizard nobody can finish.
  */
  const guide = guideProblems(
    spec.guide ?? { steps: [], hints: [] },
    spec.collections,
    [...spec.operations.map((op) => op.id), ...spec.collections.flatMap((c) => DERIVED_VERBS.map((v) => `${c.id}.${v}`))],
    Object.keys(spec.help),
    { plans: spec.access.plans.length, filePurposes: Object.keys(spec.filePurposes ?? {}).length },
  );
  if (guide.length) {
    throw new Error(`${spec.id}: guide — ${guide.map((g) => `"${g.id}" ${g.why}`).join("; ")}.`);
  }

  /*
    ⚠️ A MILESTONE OVER AN EVENT NOTHING RAISES IS ONE NOBODY CAN EARN, and it
    is indistinguishable from one that is merely hard — so somebody works towards
    it forever and the product never says a word.
  */
  const milestones = milestoneProblems(spec.milestones ?? {}, recognisableEvents(spec), spec.notifications[MILESTONE_EARNED]);
  if (milestones.length) {
    throw new Error(`${spec.id}: milestones — ${milestones.map((m) => `"${m.id}" ${m.why}`).join("; ")}.`);
  }

  /*
    ⚠️ PUNCTUATION IS RATIONED, AND `celebrate` IS NOT AN APP'S TO DECLARE. A
    celebration belongs to a milestone — a rule over an event, earned once per
    person — not to an operation that can run all day. And a moment on a `danger`
    outcome is a chime over somebody's lost work.
  */
  const moments = momentProblems(spec.operations);
  if (moments.length) {
    throw new Error(`${spec.id}: outcomes — ${moments.map((m) => `"${m.id}" ${m.why}`).join("; ")}.`);
  }

  const notes = releaseProblems(spec.releases);
  if (notes.length) {
    throw new Error(
      `${spec.id}: release notes — ` +
        notes.map((n) => `${n.version}: "${n.note}" ${n.why}`).join("; ") +
        `. A release note is product copy, not a commit message.`,
    );
  }
}

/* ------------------------------------------------------------- consent --- */

/**
 * WHETHER SOMEBODY MAY WRITE BEFORE THEY HAVE AGREED TO ANYTHING.
 *
 * ⚠️ `outstandingFor` WAS COMPUTED AND ENFORCED BY NOTHING. It was returned by
 * `legal.list` and read by no route, no gate and no guard — so a person could
 * use an entire product, forever, without accepting the terms, the privacy
 * notice or the processing agreement, and the ledger would faithfully record
 * that they never did. A consent ledger nothing gates is a record of an
 * obligation rather than a discharge of one.
 *
 * ⚠️ WRITES ONLY, AND THE ASYMMETRY IS THE WHOLE DESIGN. It is the same shape as
 * the standing gate's read-only rung and for the same reason: withholding
 * somebody's own records because they have not clicked anything is punitive and
 * helps nobody. Refusing to record NEW information about a person until they
 * have been told what will be done with it is the actual obligation — Articles
 * 13 and 14 are about the moment of collection.
 *
 * ⚠️ AND THE LANES THAT SURVIVE IT ARE NOT A CONVENIENCE. Identity, because
 * somebody has to be able to sign in to reach the document at all. Exit, because
 * leaving is always allowed and a person who declines the terms must be able to
 * take their account with them. And accepting itself, or agreeing to the terms
 * would require having agreed to the terms.
 */
export const CONSENT_EXEMPT_LANES: readonly string[] = ["identity", "exit", "health", "legal"];

export interface ConsentVerdict {
  readonly allowed: boolean;
  /** The documents standing in the way, so the refusal names them. */
  readonly documents: readonly string[];
}

export function consentGate(input: {
  readonly kind: "read" | "write";
  readonly lane: string;
  readonly outstanding: readonly string[];
}): ConsentVerdict {
  if (input.kind !== "write") return { allowed: true, documents: [] };
  if (CONSENT_EXEMPT_LANES.includes(input.lane)) return { allowed: true, documents: [] };
  if (!input.outstanding.length) return { allowed: true, documents: [] };
  return { allowed: false, documents: input.outstanding };
}
