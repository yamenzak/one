/**
 * EVERY FACE IN THE PRODUCT, FROM ONE RESOLVER.
 *
 * ⚠️ THE POINT IS NOT THE PICTURE, IT IS THAT THERE IS ONE PLACE THAT DECIDES.
 * A face assembled at the call site is a face assembled from whatever fields
 * that screen happened to have: one list seeds a person by email, the next by
 * name, the third by a row id — and the same person then wears three faces in
 * one product while every screen looks correct on its own. Nobody can point at
 * which one is wrong. So a caller says WHAT it is drawing and WHICH one, and
 * gets a picture; it never gets to choose the style, the size or the seed
 * recipe.
 *
 * ⚠️ AND A SEED IS AN IDENTITY, NEVER A LABEL. `whoFace(accountId)` and
 * `placeFace(slug)` exist so the argument cannot be a display name — a name is
 * editable, and a face that changes when somebody corrects the spelling of
 * theirs is a face that means nothing. This is the payoff of accounts living
 * under the deployment rather than under each workspace: one person, one seed,
 * the same face in every workspace and every product.
 *
 * ⚠️ FOUR KINDS, AND ONLY TWO OF THEM ARE GENERATED.
 *   - A PERSON is a mood. Faces are what people recognise each other by, and a
 *     drawn one carries a temperament without claiming to be a photograph.
 *   - A WORKSPACE is a planet, because a workspace IS its own world: its own
 *     people, its own money, its own rules, seen from outside.
 *   - A PRODUCT is neither, and must not be. A generated mark on an app would
 *     read as that app's LOGO — an identity nobody chose, arriving with the
 *     authority of one that was designed. It gets the glyph its manifest
 *     declared, on the plate every other face wears, until somebody draws it one.
 *   - ONE is the deployment, which is not one of the products in it. Its plate
 *     is the framework's own four-cell mark, and it is fixed.
 *
 * ⚠️ DRAWN HERE, NOT FETCHED. `api.dicebear.com` would serve exactly these
 * pictures over the network — and would make a third party a dependency of every
 * roster in the product, a service that has to be up for a face to appear, and a
 * sub-processor the trust screen would have to name. The generator is ~40 kB and
 * a seed is deterministic, so the picture is computed once per seed per session
 * and never again.
 *
 * ⚠️ THE EXPRESSIONS ARE NOT CURATED, AND THAT IS A DECISION RATHER THAN AN
 * OVERSIGHT. `moods` ships fifteen mouths, a few of which read as unhappy, and
 * the obvious edit is to keep only the cheerful ones. Two things are wrong with
 * it. The option is an ALLOW-LIST — naming twelve to exclude three means every
 * expression DiceBear adds after today is silently dropped by a list nobody will
 * revisit. And a wall of identical grins is exactly what stops a roster of forty
 * being scannable, which is the whole reason a face is here at all. A range of
 * expressions is character; it is not the software's opinion of anybody.
 *
 * ⚠️ EVERY SEED IS BAKED TWICE, AND THE SMALL ONE DOES NOT MOVE. The animation
 * is a `<style>` element INSIDE the SVG, which is why it survives being used as
 * an image — and why a still face has to be a different picture rather than a
 * paused one. At 40px a breathing face reads as alive; at 24px the same movement
 * reads as a twitch in the corner of the eye, which is worse than nothing. The
 * caller does not decide this: the SIZE does.
 */

import * as React from "react";
import { Avatar, Style } from "@dicebear/core";
import { Avatar as Plate } from "@heroui/react";
import MOODS from "@dicebear/styles/moods.json" with { type: "json" };
import PLANETS from "@dicebear/styles/planets.json" with { type: "json" };
import { FACE_PX } from "../tokens/metrics.js";
import type { World } from "../tokens/ambience.js";
import { useStill } from "../tokens/motion.js";

/* ------------------------------------------------------------------ kinds --- */

/**
 * ⚠️ `one` IS ITS OWN KIND RATHER THAN AN APP WITH A KNOWN ID. The deployment is
 * not one of the products in it, and giving it a fixed plate here is what keeps
 * the fallback out of a `if (id === "one")` in whichever screen drew it first.
 */
export type FaceKind = "person" | "workspace" | "app" | "one";

/**
 * ⚠️ THE SIZE PICKS THE MOVEMENT, WHICH IS WHY IT IS A NAME AND NOT A NUMBER.
 * `chip` is the crown and a dense row; `row` is a list; `panel` is the one at
 * the top of a screen that is ABOUT this subject. Three, because a fourth would
 * be somebody's page needing 34px.
 */
export type FaceSize = "chip" | "row" | "panel";

/**
 * ⚠️ THE LIBRARY'S OWN THREE, AND NO CLASS OF OURS. `.avatar` sizes the BOX and
 * the letter inside it TOGETHER — `sm` is 32px at `text-sm`, the default 40px,
 * `lg` 48px at `text-base` — so a class that widens the box alone leaves the
 * fallback at whatever the variant set. That was built once here and produced an
 * 88px panel with a 14px letter adrift in the middle of it (D7).
 */
const VARIANT: Readonly<Record<FaceSize, "sm" | "md" | "lg">> = {
  chip: "sm", row: "md", panel: "lg",
};

/**
 * ⚠️ TWICE THE BOX — crisp on a 2× screen and no higher, DERIVED rather than
 * typed. Written out, the two lists drift the first time a face changes size and
 * the only symptom is a slightly soft picture nobody attributes to anything.
 */
const PIXELS: Readonly<Record<FaceSize, number>> = {
  chip: FACE_PX.chip * 2, row: FACE_PX.row * 2, panel: FACE_PX.panel * 2,
};

/** ⚠️ See the header: below a row, movement is a twitch. */
const MOVES: Readonly<Record<FaceSize, boolean>> = { chip: false, row: true, panel: true };

/**
 * ⚠️ 1.2, BECAUSE THE PLATE IS A CIRCLE AND THE DRAWING IS A SQUARE. Both styles
 * compose for a square canvas, so under a round mask the corners — a fifth of
 * the picture — are thrown away and the subject sits in a wide ring of
 * background. At 32px that reads as a coloured badge with something small in it
 * rather than as a face or a world. At 1.2 the subject fills the circle and the
 * background survives as a rim, which is what makes a roster scannable at a
 * glance. Past about 1.3 the top of a head and the edge of a planet's ring go
 * over the edge, so this is a ceiling as much as a setting.
 */
const FILL = 1.2 as const;

/* ------------------------------------------------------------- generation --- */

/*
  ⚠️ THE STYLE DEFINITIONS ARE LOADED ONCE, LAZILY, AND THE `Style` OBJECTS ARE
  BUILT ONCE. Constructing one parses a schema; doing that inside a component
  would re-parse it on every render of every row.
*/
let moods: Style | null = null;
let planets: Style | null = null;

const styleFor = (kind: "person" | "workspace"): Style => {
  if (kind === "person") return (moods ??= new Style(MOODS as never));
  return (planets ??= new Style(PLANETS as never));
};

/*
  ⚠️ ONE CACHE, KEYED BY EVERYTHING THAT CHANGES THE PICTURE. A roster of forty
  re-renders on every keystroke in its filter field; without this each one is
  forty SVG builds and forty base64 encodings per stroke.
*/
const drawn = new Map<string, string>();

/**
 * ⚠️ `animationVariant` HAS TO BE ASKED FOR. Every style ships its movement
 * variants at WEIGHT ZERO, so a seed alone never picks one — leave the option
 * off and every face in the product is the `none` variant, silently, forever.
 */
const bake = (kind: "person" | "workspace", seed: string, moving: boolean, px: number): string => {
  const key = `${kind}|${moving ? "m" : "s"}|${px}|${seed}`;
  const had = drawn.get(key);
  if (had !== undefined) return had;
  const svg = new Avatar(styleFor(kind), {
    seed,
    size: px,
    scale: FILL,
    ...(moving ? { animationVariant: ["slow"] as const } : {}),
  }).toDataUri();
  drawn.set(key, svg);
  return svg;
};

/* ------------------------------------------------------------------ seeds --- */

/**
 * A PERSON'S SEED — their account, which is the same in every workspace and
 * every product. ⚠️ Never their name and never their email: one is edited, the
 * other is changed, and a face that moves when either does is decoration.
 */
export const whoFace = (accountId: string): FaceOf => ({ kind: "person", seed: accountId });

/** A WORKSPACE'S SEED — its slug, which is its address and does not change. */
export const placeFace = (slug: string): FaceOf => ({ kind: "workspace", seed: slug });

/**
 * A PRODUCT — its id, and the glyph its manifest declared.
 *
 * ⚠️ NOTHING IS GENERATED HERE, AND THE GLYPH IS WHY. A hashed mark on an app
 * would read as that app's LOGO — an identity nobody chose, arriving with the
 * authority of one that was designed. `AppSpec.mark` is a character somebody
 * picked on purpose; putting it on the same plate every face wears makes it a
 * real slot in the list rather than a lone character floating beside two
 * pictures, and it stays honestly a placeholder until there is a drawn mark.
 */
export const appFace = (appId: string, mark?: string): FaceOf =>
  ({ kind: "app", seed: appId, glyph: mark });

/** ⚠️ The deployment itself. Fixed, so it is the same plate on every door. */
export const ONE_FACE: FaceOf = { kind: "one", seed: "one" };

export interface FaceOf {
  readonly kind: FaceKind;
  readonly seed: string;
  /** ⚠️ `app` only — the character the manifest declared. See `appFace`. */
  readonly glyph?: string;
}

/* ------------------------------------------------------------------ world --- */

/**
 * THE TWO COLOURS A WORKSPACE'S SKY IS BUILT FROM — see `worldCss`.
 *
 * ⚠️ READ OUT OF THE PICTURE THAT WAS DRAWN, NOT DERIVED A SECOND TIME. The
 * obvious alternative is to hash the slug here and index the palette ourselves,
 * which works right up until DiceBear's own selection changes by one step — and
 * then the sky is a different world from the planet in the row above it, with
 * nothing failing anywhere. Matching the fills in the SVG against the style's
 * OWN declared palette means both come from the same file: one edit moves them
 * together, and a colour we do not recognise falls through to nothing rather
 * than to a guess.
 *
 * ⚠️ AND IT IS THE STILL BAKE THAT IS PARSED. The animated one carries the same
 * fills plus a `<style>` element; reading the smaller of the two is the same
 * answer with less to go wrong, and it is already in the cache for any chip.
 */
export function worldOf(slug: string): World | null {
  const cached = worlds.get(slug);
  if (cached !== undefined) return cached;

  const svg = new Avatar(styleFor("workspace"), { seed: slug, size: 64, scale: FILL }).toString();
  const fills = [...svg.matchAll(/fill="(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]!.toLowerCase());
  const deep = fills.find((c) => DEEPS.has(c));
  const lit = fills.find((c) => BODIES.has(c));
  const world = deep && lit ? { deep, lit, seed: slug } : null;
  worlds.set(slug, world);
  return world;
}

const worlds = new Map<string, World | null>();

/* ⚠️ THE STYLE'S OWN PALETTES, NOT COPIES OF THEM. A literal list here is a
   list that is right today. */
const palette = (name: "background" | "planet"): ReadonlySet<string> =>
  new Set(((PLANETS as { colors: Record<string, { values: string[] }> })
    .colors[name]?.values ?? []).map((c) => c.toLowerCase()));

const DEEPS = palette("background");
const BODIES = palette("planet");

/* ------------------------------------------------------------- the plates --- */

/*
  ⚠️ FOUR CELLS, IN INK, AND IT IS THE FRAMEWORK'S OWN MARK RATHER THAN A
  GENERATED ONE. Four is what Quad is named after, so the deployment's plate is
  the shape of the thing rather than a hash of the word — and because it is
  fixed, it is the same plate on every door, which is what a mark is for. Drawn
  in `currentColor` so it inherits ink and can never fight a workspace's ground
  the way a tinted one would (`ground.ts` — the interface is values, the data is
  hues), and drawn rather than SET, because a glyph from a font is whatever
  weight and baseline the reader's machine decides.
*/
const CELLS = [
  { x: 2, y: 2 }, { x: 13, y: 2 }, { x: 2, y: 13 }, { x: 13, y: 13 },
] as const;

/** ⚠️ Descending, so one cell leads and the plate has a reading order. */
const WEIGHTS = [1, 0.62, 0.38, 0.22] as const;

function QuadPlate() {
  return (
    <svg viewBox="0 0 24 24" className="size-3/5" fill="currentColor" aria-hidden="true">
      {CELLS.map((c, i) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x} y={c.y} width={9} height={9} rx={2.5}
          opacity={WEIGHTS[i]}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------- face --- */

export interface FaceProps {
  /**
   * ⚠️ ABSENT IS A REAL ANSWER, AND IT IS WHY THIS IS OPTIONAL. An invitation
   * nobody has claimed has no account; a workspace being typed into a wizard has
   * no slug yet. A face invented for either is a picture of nobody, so those get
   * the initial — and having ONE component answer both is what stops each caller
   * writing its own `Avatar` fallback beside its own `Face`. Five of those
   * existed for one afternoon and two already disagreed about the size.
   */
  readonly of?: FaceOf;
  /**
   * ⚠️ FOR THE ACCESSIBLE NAME AND THE LETTER OF LAST RESORT — never for the
   * seed. See the header: a face keyed on a name is a face that changes when
   * somebody fixes their spelling.
   */
  readonly name?: string;
  readonly size?: FaceSize;
}

/**
 * ⚠️ HEROUI'S `Avatar`, WHICH ALREADY KNOWS WHAT A MISSING PICTURE IS. It owns
 * the squircle, the fallback and the loading swap; wrapping our own box round it
 * would be a restyle wearing a component's clothes (D7). All this adds is WHICH
 * picture — which is the entire job.
 *
 * ⚠️ AND THE ALT IS EMPTY ON PURPOSE. Every face in this product sits beside the
 * name it belongs to, so an alt text repeats it — a screen reader then says
 * "Northwind Strength, Northwind Strength" down a list of ten.
 */
export function Face({ of, name, size = "row" }: FaceProps) {
  /*
    ⚠️ THE ONLY MOTION IN THIS PRODUCT `motion.ts`'S RULES CANNOT REACH. The
    animation is a `<style>` element inside an SVG being used as an IMAGE, so it
    is in a document of its own: no selector of ours crosses that boundary,
    `prefers-reduced-motion` inside it answers about the same machine but nothing
    applies our stylesheet there, and `data-reduce-motion` on an ancestor is
    invisible to it. Switching it off therefore means serving a DIFFERENT
    picture, which is exactly what the still bake is.
  */
  const at = React.useRef<HTMLDivElement>(null);
  const still = useStill(at);

  /* ⚠️ ON THE PRIMITIVES, NOT ON `of`. `whoFace(id)` returns a fresh object
     every render, so a memo keyed on it would miss every time — which is a
     lesson about the dependency array rather than about faces. The cache in
     `bake` is the real one; this only saves the lookup. */
  const kind = of?.kind;
  const seed = of?.seed;
  const glyph = of?.glyph;
  const moving = MOVES[size] && !still;
  const src = React.useMemo(
    () => (seed !== undefined && (kind === "person" || kind === "workspace")
      ? bake(kind, seed, moving, PIXELS[size])
      : null),
    [kind, seed, moving, size],
  );
  return (
    <Plate ref={at} size={VARIANT[size]} className="shrink-0">
      {src ? <Plate.Image src={src} alt="" /> : null}
      <Plate.Fallback>
        {/* ⚠️ THREE ANSWERS, IN ORDER OF HOW MUCH IS KNOWN: the framework's own
            plate, the glyph a manifest declared, or the initial. An app with no
            mark falls to its initial rather than to the quad — the quad is ONE's
            mark, and lending it to a product would say the product is the
            platform. */}
        {kind === "one"
          ? <QuadPlate />
          : kind === "app" && glyph
            ? <span aria-hidden="true">{glyph}</span>
            : (name ?? seed ?? "?").slice(0, 1).toUpperCase()}
      </Plate.Fallback>
    </Plate>
  );
}
