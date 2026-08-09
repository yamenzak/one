/**
 * THE CHANGELOG, AND WHAT A MANIFEST MAY STOP OFFERING.
 *
 * Layer 3. Imports collection, notify, app-shaped records.
 *
 * ⚠️ A RELEASE NOTE IS PRODUCT COPY, NOT A COMMIT MESSAGE. The two get confused
 * because both describe a change and one is already written — so the changelog
 * fills with file paths, type names and pull-request numbers, and the people it
 * was for stop opening it. Then somebody writes a second, hand-curated
 * changelog for customers, and the two disagree within a month.
 *
 * ⚠️ AND A SURFACE THAT WAS SOLD CANNOT QUIETLY DISAPPEAR. Removing a plan, a
 * permission or an entitlement is a decision about people who are currently
 * holding it. It has to be RETIRED — stated, with a reason — rather than
 * deleted, because a deletion looks identical to a rename and to a mistake.
 */

/* ------------------------------------------------------------ the notes --- */

export interface Release {
  readonly version: string;
  /** `YYYY-MM-DD`. A changelog with no dates is a list, not a history. */
  readonly at: string;
  readonly notes: readonly string[];
}

/**
 * ⚠️ WHAT MAKES A LINE A COMMIT MESSAGE RATHER THAN A RELEASE NOTE.
 *
 * Each of these appears in copy nobody outside the team can act on: a path they
 * cannot open, an identifier they cannot look up, a number in a system they
 * cannot see. The list is small and unambiguous on purpose — it catches the
 * habit of pasting a commit subject, which is the only way this ever goes wrong.
 */
const INTERNAL = [
  [/\b[\w./-]+\.(ts|tsx|js|jsx|sql|json|md)\b/, "names a file"],
  [/#\d+\b/, "names a pull request or issue number"],
  [/\b[A-Z][a-zA-Z]*(Spec|Registry|Handler|Adapter|Service|Manager|Controller)\b/, "names a type"],
  [/\b[0-9a-f]{7,40}\b/, "names a commit"],
  [/\b(refactor|refactored|bump|bumped|wip|chore|lint|typecheck|merge)\b/i, "reads as a commit subject"],
] as const;

export interface ReleaseProblem {
  readonly version: string;
  readonly note: string;
  readonly why: string;
}

export function releaseProblems(releases: readonly Release[]): readonly ReleaseProblem[] {
  const out: ReleaseProblem[] = [];
  for (const release of releases) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(release.at)) {
      out.push({ version: release.version, note: release.at, why: "is not a date" });
    }
    if (release.notes.length === 0) {
      out.push({ version: release.version, note: "", why: "has no notes — a version nobody can describe is one nobody should ship" });
    }
    for (const note of release.notes) {
      for (const [pattern, why] of INTERNAL) {
        if (pattern.test(note)) out.push({ version: release.version, note, why });
      }
    }
  }
  return out;
}

/* --------------------------------------------------------- what was sold --- */

/**
 * The parts of a manifest somebody can be HOLDING.
 *
 * ⚠️ NOT EVERY FIELD — the ones a person or a workspace has a live relationship
 * with. A collection somebody has rows in, a permission somebody's role carries,
 * a plan somebody is on, an entitlement somebody bought, an operation something
 * is calling, a notification somebody has in their inbox. Changing any of these
 * changes what an existing customer already has.
 */
export interface Surface {
  readonly collections: readonly string[];
  readonly permissions: readonly string[];
  readonly plans: readonly string[];
  readonly entitlements: readonly string[];
  readonly operations: readonly string[];
  readonly notifications: readonly string[];
}

export const EMPTY_SURFACE: Surface = {
  collections: [], permissions: [], plans: [], entitlements: [], operations: [], notifications: [],
};

export function surfaceOf(spec: {
  readonly collections: readonly { readonly id: string }[];
  readonly access: {
    readonly permissions: readonly string[];
    readonly plans: readonly { readonly id: string }[];
    readonly entitlements: Readonly<Record<string, unknown>>;
  };
  readonly operations: readonly { readonly id: string }[];
  readonly notifications: Readonly<Record<string, unknown>>;
}): Surface {
  const sort = (v: readonly string[]) => [...v].sort();
  return {
    collections: sort(spec.collections.map((c) => c.id)),
    permissions: sort(spec.access.permissions),
    plans: sort(spec.access.plans.map((p) => p.id)),
    entitlements: sort(Object.keys(spec.access.entitlements)),
    operations: sort(spec.operations.map((o) => o.id)),
    notifications: sort(Object.keys(spec.notifications)),
  };
}

/** What an app says it deliberately stopped offering, and why. */
export type Retired = Readonly<Record<string, string>>;

export interface Removal {
  readonly kind: keyof Surface;
  readonly name: string;
}

/**
 * What this manifest stopped offering since the last one that shipped.
 *
 * ⚠️ ADDITIONS ARE NEVER A PROBLEM AND REMOVALS ALWAYS ARE. Nobody holds
 * something that did not exist; everybody who holds something that is gone finds
 * out by using it. A removal that appears in `retired` is a decision somebody
 * made and wrote down; one that does not is indistinguishable from a rename
 * typo, and the two need opposite fixes.
 *
 * ⚠️ IT COMPARES DERIVED OPERATIONS TOO, which is the case a hand-kept list
 * would miss: renaming a collection silently removes seven operations, and every
 * client calling any of them breaks at once.
 */
export function removals(previous: Surface, current: Surface, retired: Retired): readonly Removal[] {
  const out: Removal[] = [];
  for (const kind of Object.keys(EMPTY_SURFACE) as (keyof Surface)[]) {
    const now = new Set(current[kind]);
    for (const name of previous[kind]) {
      if (!now.has(name) && !(name in retired)) out.push({ kind, name });
    }
  }
  return out;
}
