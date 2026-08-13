/**
 * IDENTITY — one account, one credential, and nothing about authorization.
 *
 * Layer 1. Imports primitives only.
 *
 * ⚠️ THE SPLIT IS THE DESIGN, and it is the thing to get right before anything
 * is stored:
 *
 *   GLOBAL, one store, read at SIGN-IN     an account, its credentials
 *   PER APP, per region, read PER REQUEST  a session, a membership, a role
 *
 * That asymmetry is what makes a single global identity store affordable. If
 * sessions lived here too, every request in the platform would cross a region to
 * validate one; because they do not, the shared store is touched once per
 * sign-in and the hot path never leaves home.
 */

import type { Instant, Locale, UserId } from "./primitives.js";

/* --------------------------------------------------------------- account --- */

/**
 * One person, across every product.
 *
 * ⚠️ NOTHING HERE MAY BE APP-SPECIFIC OR AUTHORIZING. No tenant, no role, no
 * permission, no plan. This record answers "who is this" and never "what may
 * they do" — the second question is per-app, per-tenant, and belongs in that
 * app's own regional store beside the data it protects.
 *
 * The rule matters more than it looks. An account carrying a role would mean a
 * global store deciding a regional question, one product's authorization
 * travelling into another, and a permission change requiring a cross-region
 * write on a path that must stay fast. `ACCOUNT_FIELDS` and its conformance test
 * make adding one a deliberate act.
 */
export interface Account {
  readonly id: UserId;
  /** The one identifier a person is found by, and the sign-in factor. */
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly avatarUrl: string | null;
  readonly locale: Locale;
  readonly createdAt: Instant;
  /**
   * Bumped on any change to the fields a session snapshots.
   *
   * A session carries a copy of this record so per-request validation stays
   * local; the version is how the copy knows it is behind. Compared at sign-in
   * and on refresh — never per request, which would reintroduce the cross-region
   * read the copy exists to avoid.
   */
  readonly profileVersion: number;
}

/** Asserted against the interface by `test/identity.test.ts`. */
export const ACCOUNT_FIELDS = [
  "id", "email", "emailVerified", "name", "avatarUrl", "locale", "createdAt", "profileVersion",
] as const;

/* ------------------------------------------------------------ credential --- */

/**
 * A passkey.
 *
 * ⚠️ IT CARRIES ITS OWN RELYING PARTY, AND THAT ONE FIELD IS THE WHOLE MIGRATION.
 *
 * WebAuthn binds a credential to the relying party it was created under, and a
 * credential may only be offered at an origin the relying party is a
 * registrable-domain suffix of. So a passkey created under `kova.4dl.app` works
 * on Kova and nowhere else, while one created under `4dl.app` works on every
 * product beneath it.
 *
 * Storing the relying party PER CREDENTIAL rather than as one global constant is
 * what makes moving to the root additive: existing credentials keep working
 * exactly where they always did, new ones are created at the root and work
 * everywhere, and nobody is locked out or forced to re-register under duress.
 * A single constant would have made the switch a flag day.
 */
export interface Credential {
  readonly id: string;
  readonly accountId: UserId;
  /** The relying party this was REGISTERED under. Never rewritten. */
  readonly relyingParty: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly createdAt: Instant;
  /** What the person calls it — "MacBook", "phone". Theirs, not ours. */
  readonly label: string | null;
}

/**
 * May this credential be offered at an origin whose relying party is `rpId`?
 *
 * WebAuthn's rule, and nothing more: a credential is offerable when its relying
 * party is the requested one, or a registrable-domain suffix of it. Expressed
 * here as a pure function because it is the entire migration story and deserves
 * to be tested without a browser.
 *
 * Deliberately NOT the reverse. A credential registered at `4dl.app` is offered
 * at `kova.4dl.app`; one registered at `kova.4dl.app` is NOT offered at
 * `4dl.app`, because it never agreed to that scope.
 */
export function offerableAt(credential: Credential, rpId: string): boolean {
  if (credential.relyingParty === rpId) return true;
  return rpId.endsWith(`.${credential.relyingParty}`);
}

/** Which of a person's credentials this origin may prompt for. */
export function credentialsFor(all: readonly Credential[], rpId: string): readonly Credential[] {
  return all.filter((c) => offerableAt(c, rpId));
}

/**
 * Whether a person should be nudged to add a credential at the root.
 *
 * True when they hold one that works here but is narrower than the platform —
 * the state every existing customer is in the day the relying party is raised.
 * The nudge is the whole of the migration a person ever sees: an offer, once,
 * not a lockout.
 */
export function shouldOfferRootCredential(all: readonly Credential[], rpId: string, platformRoot: string): boolean {
  if (rpId !== platformRoot) return false;
  const usable = credentialsFor(all, rpId);
  return all.length > 0 && usable.every((c) => c.relyingParty !== platformRoot);
}

/* ------------------------------------------------------- provisioning --- */

/**
 * WHO MAY OPEN A WORKSPACE, AND WHERE.
 *
 * ⚠️ IT IS GRANTED TO AN ADDRESS, NOT TO AN ACCOUNT, and that is the whole
 * reason it is a record of its own. The real sequence is somebody typing their
 * address on a marketing site and signing in AFTERWARDS — so a grant that needed
 * an account to attach to would be a grant that cannot be given at the moment it
 * is bought. It is claimed by whoever proves that address, which is the same
 * mechanism an invitation to a workspace already uses.
 *
 * ⚠️ AND `apps` IS A LIST RATHER THAN A BOOLEAN, because a deployment sells more
 * than one thing. Somebody who paid for one product is not thereby entitled to
 * open workspaces in the others, and a boolean cannot say which — so the first
 * time a second product exists, a boolean has to be replaced by this, on live
 * data, with every existing grant meaning something ambiguous.
 */
export interface Provisioning {
  readonly email: string;
  /** ⚠️ `["*"]` is every product. Written by an operator, never by a purchase. */
  readonly apps: readonly string[];
  readonly grantedAt: Instant;
  /** Who granted it — a machine name or an operator's address. Audit, not display. */
  readonly by: string;
}

/** ⚠️ Every product, or the ones named. Nothing else means anything. */
export const EVERY_PRODUCT = "*";

/**
 * Whether a grant opens a particular product.
 *
 * ⚠️ PURE, AND IT IS THE ONE PLACE THE WILDCARD IS UNDERSTOOD. Written at each
 * call site, the day somebody checks `apps.includes(id)` without it is the day a
 * wildcard grant silently stops opening anything.
 */
export const grantOpens = (grant: Provisioning | null, appId: string): boolean =>
  grant !== null && (grant.apps.includes(EVERY_PRODUCT) || grant.apps.includes(appId));

/**
 * Whether this person may open a workspace in this product.
 *
 * ⚠️ THE WHOLE RULE, IN ONE PLACE, BECAUSE IT HAS TWO HALVES THAT LOOK ALIKE. A
 * product with an open front door admits anybody signed in — that is what a free
 * tier IS — and one that is sold admits the addresses somebody was paid for. A
 * call site that checked only the grant would close the open product; one that
 * checked only the declaration would open the sold one.
 *
 * ⚠️ AND `undefined` IS `open`, which is what every app did before the field
 * existed. A default of `granted` would close every existing front door on the
 * day this was added, silently, to everybody.
 */
export const mayCreateHere = (
  creation: "open" | "granted" | undefined,
  grant: Provisioning | null,
  appId: string,
): boolean => creation !== "granted" || grantOpens(grant, appId);

