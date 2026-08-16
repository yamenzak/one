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
import type { SceneFamily, World } from "../tokens/ambience.js";
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

/**
 * THE WORLD WITHOUT ITS SKY.
 *
 * ⚠️ THE STYLE IS A COMPOSITION, NOT A PICTURE, AND THAT IS THE WHOLE POINT OF
 * USING ONE. `planets` declares a planet, its surface, its shade, its ring, its
 * moons and TWELVE separate stars over a background — so asking for the half
 * that is the world is a matter of turning the other half off, not of hiding it
 * afterwards. Every star drops to probability zero and the background takes an
 * eight-digit hex whose alpha is zero, which is the only way `backgroundColor`
 * accepts "none": the schema wants a colour, and a colour with no opacity is
 * one.
 *
 * ⚠️ THE SPACE HALF IS NOT RENDERED, IT IS LEARNED FROM. Twelve stars on a fixed
 * grid is right inside a 40px disc and thin across a viewport, so the ambience
 * scatters its own — with the same five magnitudes, the same weights and the
 * same twinkle timings the style declares (`starArt` in `ambience.ts`). What
 * comes from here is the two colours; what comes from there is a sky.
 */
const bakeWorld = (seed: string, moving: boolean, px: number): string => {
  const key = `world|${moving ? "m" : "s"}|${px}|${seed}`;
  const had = drawn.get(key);
  if (had !== undefined) return had;
  const svg = new Avatar(styleFor("workspace"), {
    seed,
    size: px,
    /* ⚠️ NO `scale` HERE. The 1.2 that fills a circular plate is a crop
       compensation; on transparency it only makes the ring touch the edges. */
    backgroundColor: [CLEAR],
    ...STARLESS,
    ...(moving ? { animationVariant: ["slow"] as const } : {}),
  } as never).toDataUri();
  drawn.set(key, svg);
  return svg;
};

/** ⚠️ Zero alpha. `"transparent"` is refused — the schema wants a colour. */
const CLEAR = "#00000000";

/** ⚠️ All twelve, by name, because the style names them that way. */
const STARLESS = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`${i === 0 ? "star" : `star${String(i + 1).padStart(2, "0")}`}Probability`, 0]),
);

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
 * ⚠️ TWO KINDS HAVE A WORLD AND THEY GET DIFFERENT ONES, WHICH IS THE POINT. A
 * workspace is somewhere you look AT from outside — a planet on a starfield, and
 * `space` is that seen large. A person is not a place you visit: the light is
 * theirs and you are standing in it, so their ground is `aura`, an atmosphere
 * with no horizon in it. Same two slots, same mechanism, two worlds — and
 * nobody can mistake whose screen they are on.
 *
 * ⚠️ EACH STYLE NAMES ITS OWN SECOND COLOUR, and that is the only difference in
 * the reading. `planets` calls the body `planet`; `moods` calls the face `face`.
 * Both call the ground `background`, so `deep` needs no table.
 */
/**
 * ⚠️ AND THE OTHER TWO HAVE NO PICTURE, WHICH IS WHY THEY GET A DIFFERENT KIND
 * OF FAMILY. A product wears the glyph its manifest declared and the deployment
 * wears a fixed mark — neither is generated, so there is nothing to read two
 * colours out of. What they have is the THEME, so their palette is
 * `var(--background)` and `var(--brand)`; and because `var()` inside an SVG is a
 * string rather than a colour, their families draw in white or black and let the
 * ground carry the hue (`Family.ink`).
 *
 * ⚠️ THE FOUR ARE FOUR DIFFERENT WORLDS AND THAT IS THE POINT. A place is
 * somewhere you look at from outside; a person is a room you stand in; a product
 * is a SYSTEM, so it gets a lattice — structure, adjacency, a pattern that
 * re-routes itself; and the deployment is the thing all of them are inside, so
 * it gets shapes with no grid at all. Nobody chooses this per screen: it falls
 * out of what the subject IS.
 */
const SKY: Record<FaceKind, {
  readonly family: SceneFamily;
  /** The style to read, or the theme — see above. */
  readonly of?: "person" | "workspace";
  /** The style's own name for the colour that is the LIGHT. */
  readonly lit?: string;
}> = {
  workspace: { family: "space", of: "workspace", lit: "planet" },
  person: { family: "aura", of: "person", lit: "face" },
  app: { family: "loops" },
  one: { family: "blobs" },
};

/* ⚠️ The theme's two, for the kinds with no picture. Read by CSS, never baked
   into a mark — see `Family.ink`. */
const THEME = { deep: "var(--background)", lit: "var(--brand)" } as const;

/**
 * THE SUBJECT'S WORLD, FROM THE SAME DECLARATION THAT DREW ITS FACE.
 *
 * ⚠️ THIS IS THE SEAM `Layout` IS BUILT ON, and it exists because the two used
 * to be derived separately from the same slug — `face: placeFace(where.slug)`
 * beside a hand-built world, two expressions that have to agree and nothing
 * checking that they do. Editing one is a page whose crown shows one workspace's
 * planet over another workspace's sky, which no test can see and nobody can name
 * from a screenshot.
 *
 * ⚠️ READ OUT OF THE PICTURE THAT WAS DRAWN, NOT DERIVED A SECOND TIME. The
 * obvious alternative is to hash the seed here and index the palette ourselves,
 * which works right up until DiceBear's own selection changes by one step — and
 * then the sky is a different world from the face in the row above it, with
 * nothing failing anywhere. Matching the fills in the SVG against the style's
 * OWN declared palette means both come from the same file: one edit moves them
 * together, and a colour we do not recognise falls through to `null` rather than
 * to a guess.
 *
 * ⚠️ AND IT IS THE STILL BAKE THAT IS PARSED. The animated one carries the same
 * fills plus a `<style>` element; reading the smaller of the two is the same
 * answer with less to go wrong, and it is already in the cache for any chip.
 *
 * ⚠️ `null` FOR A PRODUCT AND FOR THE DEPLOYMENT, and that is a real answer
 * rather than a gap. Neither is generated — an app wears the glyph its manifest
 * declared — so there is no palette to read, and the page keeps its material.
 */
export function worldFor(of: FaceOf | undefined): World | null {
  if (!of) return null;
  const sky = SKY[of.kind];

  /* ⚠️ No picture, so the theme — see `SKY`. Nothing to read and nothing to
     cache: the two values are custom properties the stylesheet resolves. */
  const { of: style, lit } = sky;
  if (!style || !lit) {
    return { family: sky.family, deep: THEME.deep, lit: THEME.lit, seed: of.seed };
  }

  const key = `${of.kind}|${of.seed}`;
  const cached = worlds.get(key);
  if (cached !== undefined) return cached;

  const svg = new Avatar(styleFor(style), { seed: of.seed, size: 64, scale: FILL }).toString();
  const fills = [...svg.matchAll(/fill="(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]!.toLowerCase());
  const deep = fills.find((c) => palette(style, "background").has(c));
  const body = fills.find((c) => palette(style, lit).has(c));
  const world = deep && body ? { family: sky.family, deep, lit: body, seed: of.seed } : null;
  worlds.set(key, world);
  return world;
}

const worlds = new Map<string, World | null>();

/* ⚠️ THE STYLE'S OWN PALETTES, NOT COPIES OF THEM. A literal list here is a
   list that is right today — and with two styles it would be two lists that are
   right today, which is how the second one comes to be wrong on its own. */
const palettes = new Map<string, ReadonlySet<string>>();

const palette = (of: "person" | "workspace", name: string): ReadonlySet<string> => {
  const key = `${of}|${name}`;
  let had = palettes.get(key);
  if (!had) {
    const json = (of === "person" ? MOODS : PLANETS) as {
      colors?: Record<string, { values?: string[] }>;
    };
    had = new Set((json.colors?.[name]?.values ?? []).map((c) => c.toLowerCase()));
    palettes.set(key, had);
  }
  return had;
};

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

/* ------------------------------------------------------------------- orb --- */

/**
 * THE SAME SUBJECT, BIG ENOUGH TO BE THE SCREEN.
 *
 * ⚠️ NOT AN AVATAR AND DELIBERATELY NOT ON A PLATE. `Face` is a slot in a row —
 * HeroUI's box, its squircle, its fallback letter, three sizes the library owns.
 * A hero is a PICTURE: it has no ground, no letter to fall back to and no fixed
 * size, and pushing it through the plate would mean a fourth avatar variant
 * whose only caller wants none of what the variant is for.
 *
 * ⚠️ AND IT IS STILL BAKED THROUGH THE ONE RESOLVER. Which picture, whether it
 * moves and what a seed means are `bake`'s, exactly as for every face — this
 * only asks for a bigger one. A hero that generated its own would be the second
 * source this file exists to prevent.
 *
 * ⚠️ IT MOVES, BECAUSE AT THIS SIZE THE MOVEMENT IS THE POINT. The rule that
 * stills a chip is about a twitch in the corner of the eye at 32px; a planet
 * filling half a phone that does not turn is a photograph of one.
 */
export function Orb({ of, size = 280 }: {
  readonly of: FaceOf;
  /** ⚠️ CSS pixels. Baked at twice this, like every other face. */
  readonly size?: number;
}) {
  const at = React.useRef<HTMLImageElement>(null);
  const still = useStill(at);
  const src = React.useMemo(
    () => (of.kind === "workspace"
      ? bakeWorld(of.seed, !still, size * 2)
      : of.kind === "person" ? bake(of.kind, of.seed, !still, size * 2) : null),
    [of.kind, of.seed, still, size],
  );
  if (!src) return null;
  return (
    /*
      ⚠️ NOTHING IS MASKED, BECAUSE NOTHING NEEDS TO BE — see `bakeWorld`. The
      first build took the whole avatar and faded its edge to hide the deep
      square the drawing carries, which is a workaround for a picture that was
      never asked for correctly. The style COMPOSES, so the sky can simply be
      left out and what arrives is a planet on transparency: no crop, no seam, no
      circle where a world should be, and the ring and moons free to reach past
      wherever a mask would have ended.

      ⚠️ AND THE ALT IS EMPTY: the name is right there, and a screen reader that
      said it twice would read the page's heading to somebody twice.
    */
    <img ref={at} src={src} alt="" width={size} height={size}
      className="block" style={{ width: size, height: size }} />
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
  /** ⚠️ The subject AS the screen — see `Orb`. No plate, no letter, no scale. */
  readonly hero?: boolean;
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
export function Face({ of, name, size = "row", hero }: FaceProps) {
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

  /* ⚠️ THE HERO IS A PICTURE, NOT A PLATE — see `Orb`. It is asked for here
     rather than by a separate import so every face in the product still comes
     through one component, which is what the guard is about. */
  if (hero && of) return <Orb of={of} />;

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
