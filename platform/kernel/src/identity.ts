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

/*
  DEFER(one-005) stage:1 — the WebAuthn ceremony itself: attestation parsing,
  challenge storage and counter verification. `offerableAt` decides WHICH
  credentials a door may prompt for, which is the part with a migration attached;
  the ceremony is a library binding. See test/FINDINGS.md §12.
*/
