/**
 * A WORKSPACE MAKING THE PRODUCT LOOK LIKE THEIRS.
 *
 * ⚠️ THE BRAND IS THE WORKSPACE'S AND NEVER ONE APP'S, and that is what makes it
 * worth having. A business running three of our products under one roof has ONE
 * identity — one logo on the sign-in page its staff use, one colour behind every
 * screen, one icon on the phone — and a brand declared per app would give it
 * three of everything and three places to change them, with two of them stale.
 * Every app under the workspace draws from the same theme; which SURFACES exist
 * is still the app's to say, because only the app knows whether it has emails or
 * documents at all.
 *
 * ⚠️ AND ONLY A COMMERCIAL WORKSPACE HAS ONE (`mayBrand`). A personal workspace
 * is not trading under anybody's name, so it wears ours — that is the honest
 * default rather than a withheld feature, and it is why the PWA a person
 * installs from a personal workspace carries our mark and not a blank.
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

/**
 * ⚠️ AN APP DECLARES WHICH SURFACES IT HAS, AND NOTHING ELSE ABOUT BRANDING.
 * Only the app knows whether it sends email or produces documents at all. Who is
 * ALLOWED to brand is the platform's answer and the same in every product
 * (`mayBrand`) — an app naming an entitlement for it, as this once did, made
 * "may this business use its own logo" a question with a different answer per
 * product on one workspace's screens.
 */
export interface WhitelabelDef {
  readonly surfaces: readonly Surface[];
}

/**
 * WHAT ONE WORKSPACE LOOKS LIKE, ACROSS EVERY APP IT HAS SWITCHED ON.
 *
 * ⚠️ ONE RECORD PER WORKSPACE, WHICH IS THE WHOLE POINT — see the header. The
 * surfaces named here are the workspace's ASK; what actually applies is the
 * intersection with what each app offers, resolved once in `brandedSurfaces`.
 */
export interface Branding {
  readonly theme: Theme;
  readonly surfaces: readonly Surface[];
  /**
   * ⚠️ WHETHER OUR MARK COMES OFF, AND IT IS OURS TO ANSWER RATHER THAN AN
   * APP'S. Adding your logo and removing ours are different transactions, and
   * an app that could decide the second would be deciding how the deployment is
   * credited on a page it does not own.
   */
  readonly ourMark?: boolean;
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

/**
 * ⚠️ `allowed` IS `mayBrand(kind)` AND NOTHING ELSE, passed in rather than read,
 * so this file needs to know nothing about workspaces to answer a question about
 * paint. One caller resolves it; every surface here agrees by construction.
 */
export const brandableOn = (def: WhitelabelDef, allowed: boolean): readonly Surface[] =>
  allowed ? def.surfaces : [];

/**
 * What a workspace's brand actually reaches, in one app.
 *
 * ⚠️ THE INTERSECTION, AND BOTH HALVES MATTER. A surface the workspace asked for
 * that this app does not have is a promise it cannot keep; a surface the app
 * offers that the workspace never asked to brand keeps our letterhead. Resolving
 * this per screen is how one product ends up branded and the next one beside it
 * is not, on the same workspace, with nobody able to say why.
 */
export const brandedSurfaces = (
  def: WhitelabelDef, branding: Branding | null, allowed: boolean,
): readonly Surface[] =>
  branding ? brandableOn(def, allowed).filter((s) => branding.surfaces.includes(s)) : [];

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

/**
 * A surface asked for that is not on offer, or that is never theirs.
 *
 * ⚠️ TWO CALLERS AND ONE RULE. Composition asks it of an APP's declaration
 * against the platform's closed set — is this a surface at all, and is it one we
 * keep? A workspace's own ask is checked against what its enabled apps offer.
 * Both are "you asked for a surface that is not available to you", which is why
 * the detail says what is missing rather than who is asking.
 */
export function refuseSurfaces(
  def: WhitelabelDef,
  asked: readonly string[],
): readonly BrandProblem[] {
  const out: BrandProblem[] = [];
  for (const s of asked) {
    if (OURS.includes(s)) {
      out.push({ of: s, why: "ours_to_keep", detail: "carries our voice and stays in our letterhead" });
    } else if (!def.surfaces.includes(s as Surface)) {
      out.push({ of: s, why: "surface_not_offered", detail: "is not offered for branding here" });
    }
  }
  return out;
}
