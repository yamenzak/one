/**
 * A WORKSPACE MAKING THE PRODUCT LOOK LIKE THEIRS.
 *
 * ⚠️ A TENANT EDITS TOKENS, NEVER STYLES (D7). Every component takes its colour,
 * radius and type from the theme, so changing the theme changes everything and
 * changing nothing else has to happen. The alternative — letting a workspace
 * supply CSS — hands them the ability to break their own customers' screens on
 * our infrastructure, and to make a page look like something it is not.
 *
 * ⚠️ AND AN UNREADABLE PAIR IS REFUSED RATHER THAN WARNED ABOUT. A workspace
 * picking a pale accent on a pale ground has not made a subtle choice, they have
 * made an application their own customers cannot read — and they will never see
 * it, because they have their own screen at their own brightness.
 *
 * ⚠️ SOME SURFACES ARE NEVER THEIRS. Anything that says who WE are — a message
 * about their bill, the operator console, a legal document — keeps our
 * letterhead. A customer who cannot tell whose page this is cannot tell whose
 * claim to believe.
 *
 * Layer 2. Imports primitives.
 */

/* ------------------------------------------------------------------ shape --- */

/**
 * ⚠️ THE SURFACES, NAMED. A brandable surface a tenant cannot find is a package
 * they paid for and cannot use; an unbrandable one they can reach is a
 * misattribution. Both come from this list, which is why it is a closed set.
 */
export type Surface =
  | "shell" | "email" | "documents" | "sign-in" | "public" | "app-icons";

export const SURFACES: readonly Surface[] = [
  "shell", "email", "documents", "sign-in", "public", "app-icons",
];

/**
 * ⚠️ NEVER BRANDABLE, AND NOT A SETTING. These carry our voice — a bill we are
 * chasing, a console that is the deployment itself, a document we are bound by.
 */
export const OURS: readonly string[] = ["operator-console", "platform-mail", "legal-documents"];

export interface WhitelabelDef {
  /** Which surfaces this app offers at all. A tenant's plan narrows it further. */
  readonly surfaces: readonly Surface[];
  /** The entitlement that unlocks it. Named so the gate is the ordinary one. */
  readonly entitlement: string;
  /** ⚠️ Whether a tenant may remove our mark entirely, or only add theirs. */
  readonly removeOurMark?: boolean;
}

/**
 * ⚠️ TOKENS, AND THE NAMES ARE THE COMPONENT LIBRARY'S. Inventing our own and
 * mapping them is a translation table that goes stale the first time the library
 * adds one — and a token that maps to nothing changes nothing, visibly.
 */
export interface Theme {
  readonly accent?: string;
  readonly ground?: string;
  readonly ink?: string;
  readonly radius?: "none" | "sm" | "md" | "lg" | "full";
  readonly font?: string;
  readonly logo?: string;
  readonly logoDark?: string;
  readonly mark?: string;
}

export const brandableOn = (def: WhitelabelDef, allowed: boolean): readonly Surface[] =>
  allowed ? def.surfaces : [];

/* -------------------------------------------------------------- contrast --- */

const channel = (v: number): number =>
  v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

/** Relative luminance of a `#rrggbb`. Null where it is not one. */
export function luminance(hex: string): number | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number | null {
  const [la, lb] = [luminance(a), luminance(b)];
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** ⚠️ The published floor for body text. Not a number we invented. */
export const CONTRAST_FLOOR = 4.5;
/** Large text and non-text controls sit lower, and this is where. */
export const CONTRAST_FLOOR_LARGE = 3;

/* ------------------------------------------------------------------ rules --- */

export type BrandRefusal =
  | "not_a_colour" | "unreadable" | "surface_not_offered" | "ours_to_keep"
  | "entitlement_missing";

export interface BrandProblem { readonly of: string; readonly why: BrandRefusal; readonly detail: string }

/**
 * What a workspace's theme can get wrong.
 *
 * ⚠️ `unreadable` IS ENFORCED, NOT ADVISED. The person choosing is not the
 * person who has to read it, and a warning in a settings screen is read once by
 * somebody who has already decided.
 */
export function refuseTheme(theme: Theme): readonly BrandProblem[] {
  const out: BrandProblem[] = [];
  const at = (of: string, why: BrandRefusal, detail: string) => out.push({ of, why, detail });

  for (const [name, value] of Object.entries(theme)) {
    if (["accent", "ground", "ink"].includes(name) && typeof value === "string"
      && luminance(value) === null) {
      at(name, "not_a_colour", `"${value}" is not a #rrggbb, so a palette cannot be derived from it`);
    }
  }

  const pairs: readonly [string, string, string, number][] = [
    ["ink on ground", theme.ink ?? "", theme.ground ?? "", CONTRAST_FLOOR],
    ["accent on ground", theme.accent ?? "", theme.ground ?? "", CONTRAST_FLOOR_LARGE],
  ];
  for (const [what, a, b, floor] of pairs) {
    if (!a || !b) continue;
    const ratio = contrast(a, b);
    if (ratio !== null && ratio < floor) {
      at(what, "unreadable", `${ratio.toFixed(1)}:1 against a floor of ${floor}:1`);
    }
  }
  return out;
}

/** ⚠️ A surface asked for that the app does not offer, or that is never theirs. */
export function refuseSurfaces(
  def: WhitelabelDef,
  asked: readonly string[],
): readonly BrandProblem[] {
  const out: BrandProblem[] = [];
  for (const s of asked) {
    if (OURS.includes(s)) {
      out.push({ of: s, why: "ours_to_keep", detail: "carries our voice and stays in our letterhead" });
    } else if (!def.surfaces.includes(s as Surface)) {
      out.push({ of: s, why: "surface_not_offered", detail: "this app does not offer it for branding" });
    }
  }
  return out;
}
