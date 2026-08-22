/**
 * A WORKSPACE MAKING THE PRODUCT LOOK LIKE THEIRS.
 *
 * ⚠️ A WORKSPACE'S BRAND IS ITS NAMEPLATE, AND IT IS NOT THE INTERFACE. It was
 * both, and being both is what stopped either working: a colour a workspace
 * picked in ten seconds decided the light against the ground, the wash against
 * the card and the one coloured thing on a screen — so no screen could be
 * designed, because no screen knew what it would be made of. What a product is
 * made of is `AppSpec.hue`, declared by whoever built it. What a workspace owns
 * is where its own NAME appears: the tile its staff tap on a phone, and the
 * letterhead on mail it sends. Nothing here reaches a component.
 *
 * ⚠️ AND ONLY A COMMERCIAL WORKSPACE HAS ONE (`mayBrand`). A personal workspace
 * is not trading under anybody's name, so it wears ours — that is the honest
 * default rather than a withheld feature, and it is why the PWA a person
 * installs from a personal workspace carries our mark and not a blank.
 *
 * ⚠️ A TENANT EDITS TOKENS, NEVER STYLES (D7), AND THERE ARE THREE OF THEM. A
 * ground, an ink and a letter — everything a tile needs and nothing else. The
 * alternative, letting a workspace supply CSS, hands them the ability to break
 * their own customers' screens on our infrastructure and to make a page look
 * like something it is not; that argument still holds, and what shrank is how
 * much there is to edit.
 *
 * ⚠️ AND AN UNREADABLE PAIR IS REFUSED RATHER THAN WARNED ABOUT. A tile whose
 * letter cannot be read against its own ground is an icon nobody can find on a
 * home screen full of them — and the person who chose it will never notice,
 * because they have their own screen at their own brightness.
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
/*
  ⚠️ `shell` IS GONE, AND IT IS THE ONLY ONE THAT WAS REMOVED RATHER THAN NOT YET
  BUILT. The surface exists — it is every screen of every product — and what it
  meant was a workspace's colours written onto `:root`, which is precisely the
  thing that stopped a screen being designable. The other three below reach
  nothing YET, which is a different state: a public page and a sign-in door are
  real surfaces this deployment has and has not put a nameplate on.
*/
export type Surface =
  | "email" | "documents" | "sign-in" | "public" | "app-icons";

export const SURFACES: readonly Surface[] = [
  "email", "documents", "sign-in", "public", "app-icons",
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
  /**
   * WHERE A REPLY GOES, WHICH IS NOT WHERE THE LETTER CAME FROM.
   *
   * ⚠️ THE SENDER IS THE DEPLOYMENT'S ONE VERIFIED ADDRESS AND IT HAS TO BE.
   * Mail is delivered on the strength of a domain that has been set up to send
   * it, so a workspace cannot be the `From:` — but everything a business tells
   * its own staff has somewhere it wants the answer, and without this every
   * reply goes to a mailbox nobody reads.
   *
   * ⚠️ AND IT IS THE WORKSPACE'S, NOT AN APP'S, for the reason the accent is
   * (D22, D44): a business running three of our products has ONE address it
   * wants replies at, and one per app would give it three with two of them
   * stale.
   */
  readonly replyTo?: string;
}

/**
 * ⚠️ TOKENS, AND THE NAMES ARE THE COMPONENT LIBRARY'S. Inventing our own and
 * mapping them is a translation table that goes stale the first time the library
 * adds one — and a token that maps to nothing changes nothing, visibly.
 */
/**
 * ⚠️ THREE TOKENS, AND THEY ARE ALL THE TILE'S. This carried an accent, a radius,
 * a font and two logos as well. The accent and the radius and the font painted
 * the INTERFACE, which is now the product's (`AppSpec.hue`); the two logos were
 * declared for a year and drawn by nothing anywhere, which is the state a field
 * reaches when it is added for a surface somebody meant to build.
 *
 * ⚠️ AND WHAT IS LEFT IS EXACTLY WHAT `installableFor` READS. A ground, an ink
 * and a letter — the home-screen tile, and the one place a workspace's own name
 * is genuinely the subject rather than a decoration on somebody else's design.
 */
export interface Theme {
  readonly ground?: string;
  readonly ink?: string;
  /** ⚠️ One or two characters. Their initial where they leave it. */
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
/*
  ⚠️ THE INTERSECTION IS RESOLVED WHERE THE SURFACE IS SERVED, NOT WHERE IT IS
  DRAWN. `centre.view` answers with the theme or with nothing; the tile resolves
  its own paint the same way. Sending the theme and the picks separately would
  make every screen in every product decide for itself whether to wear them —
  which is how one product ends up branded and the next one beside it is not, on
  the same workspace, with nobody able to say why.

  ⚠️ AND `app-icons` IS THE WORKSPACE'S PICK ALONE. A home-screen tile belongs to
  no product, so there is no app to ask whether it has one; this function is for
  the surfaces a PRODUCT owns.

  ⚠️ AND `email` IS THE FIRST SURFACE AN APP OWNS. It is asked once per dispatch
  by `ownLettersFor`, at the READ rather than at the write: a workspace's own
  letter, written while the app offered the surface and the workspace had asked
  for it, must stop going out the day either of those stops being true. A rule
  applied where a row is saved is a rule that describes the past.
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
    if (["ground", "ink"].includes(name) && typeof value === "string"
      && luminance(value) === null) {
      at(name, "not_a_colour", `"${value}" is not a #rrggbb, so a palette cannot be derived from it`);
    }
  }

  /* ⚠️ ONE PAIR NOW, AND IT IS THE TILE'S. The second was "accent on ground",
     which stopped meaning anything the day a workspace stopped choosing what the
     interface is made of. */
  const ratio = theme.ink && theme.ground ? contrast(theme.ink, theme.ground) : null;
  if (ratio !== null && ratio < CONTRAST_FLOOR) {
    at("ink on ground", "unreadable",
      `${ratio.toFixed(1)}:1 against a floor of ${CONTRAST_FLOOR}:1`);
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
