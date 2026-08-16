/**
 * THE PAGE, AND THE BANDS ACROSS IT.
 *
 * ⚠️ THE ONLY TWO THINGS THAT MOUNT A WORLD. `Page` paints the ground and `Band`
 * paints a stripe of it; everything else in this package receives a ground it did
 * not choose. `scene.test.mjs`'s `mount:` names both files, so a third painter
 * is a failure rather than a second opinion about what a screen's ground is.
 */

import * as React from "react";
import type { Tone } from "@engine/kernel";
import type { Sky, World } from "../tokens/ambience.js";
import { skyWorld, worldCss } from "../tokens/ambience.js";
import { BAND_PAD, GUTTER, NAV_SPACE, SAFE_TOP, WIDTH } from "../tokens/metrics.js";
import type { Width } from "../tokens/metrics.js";
import { transition } from "../tokens/motion.js";
import type { Density } from "../scene/index.js";

/* ------------------------------------------------------------------ bleed --- */

/**
 * How far a band reaches.
 *
 * ⚠️ THREE, AND THE MIDDLE ONE IS THE INTERESTING ONE. `hold` is a reading
 * column on a painted background — the shape almost every real screen wants and
 * the one people hand-build over and over, usually inconsistently. `edge` is for
 * something that IS the width: a hero, a chart, a table that must not be
 * squeezed. `flush` removes the gutter as well, and is for a band that carries
 * its own padding — a full-width image, a map.
 */
export type Bleed = "hold" | "edge" | "flush";

/** ⚠️ Two widths, not five. A scale nobody can hold in their head is a scale
    people opt out of. `read` is prose and forms; `work` is anything with
    columns in it. */


/* ------------------------------------------------------------------- page --- */

export interface PageProps {
  /**
   * ⚠️ A FAMILY, NEVER A COLOUR AND NO LONGER ONE OF TWENTY-FOUR DRAWN WORLDS.
   * `glow`, `cloth`, `etch`, `loops`, `blobs` — each is every ground in its own
   * space, seeded by `seedling`, so two screens naming the same one are two
   * worlds of one material rather than the same picture twice.
   */
  readonly sky?: Sky;
  /**
   * ⚠️ WHICH ONE OF THE FAMILY, AND IT WANTS THE SCREEN'S OWN IDENTITY. A route
   * is ideal: every screen in a product then has a ground of its own inside the
   * product's material, for free, with nobody choosing anything. Absent, every
   * page naming that family is the same page — a legitimate answer, and why
   * there is a default.
   */
  readonly seedling?: string;
  /**
   * ⚠️ A GROUND BUILT FROM A SUBJECT RATHER THAN CHOSEN FROM THE TABLE, and the
   * ONLY thing that may be handed one. A workspace's face is a planet seen from
   * outside; its own screen is that planet's sky, from the same two colours
   * (`worldCss`). Supplied, it wins over `sky` — a page has one ground.
   *
   * ⚠️ AND IT IS STILL NOT AN INLINE BACKGROUND. What goes on the element is two
   * custom PROPERTIES the `world` rules read, so the fade, the grain, the
   * vignette, the drift and both reduced-motion opt-outs all still apply. An
   * inline `background-image` would beat every token and freeze one page on ours.
   */
  readonly world?: World;
  /**
   * ⚠️ HOW MUCH OF ITSELF THE GROUND SHOWS, AS AN INTENT RATHER THAN A NUMBER. A
   * screen knows how much of it is content; what that means in stars is the
   * engine's. A page of rows takes `quiet`, an arrival takes `rich`.
   */
  readonly density?: Density;
  readonly tone?: Tone;
  /**
   * ⚠️ THE NAV IS THE PAGE'S, NOT THE CONTENT'S, AND THIS IS WHY. A sticky island
   * floats over whatever precedes it, so the last card on a screen is cropped
   * under it — which is what both specimens did the first time anybody looked.
   * The island cannot fix that itself: by the time it lays out, the content above
   * has already been sized. Handing it to the page is what lets the page reserve
   * the room.
   */
  readonly nav?: React.ReactNode;
  readonly children?: React.ReactNode;
}


/* --------------------------------------------------------------- scenery --- */

/**
 * A WORLD, MOUNTED — THE ONE PLACE THAT TURNS A FAMILY INTO PAINT.
 *
 * ⚠️ `Page` AND `Band` HAD A COPY EACH, AND A THIRD WAS ABOUT TO EXIST. The
 * three lines are trivial and that is exactly the problem: the day the engine
 * learns something — a reduced-motion opt-out, a matte, a per-theme day — a
 * mounter that has its own copy gets the picture and none of what came after,
 * and the two look identical until one of them does. `scene.test.mjs` keeps
 * `worldCss` and `data-field` to this file for the same reason; this is what
 * makes that rule livable rather than a wall.
 *
 * ⚠️ IT RETURNS ATTRIBUTES AND AN ELEMENT, NOT A WRAPPER. Whatever wears a
 * ground has to BE the element the attributes sit on — a card is `Card`, a page
 * is the page — so a component that wrapped its caller would put the world on a
 * box with no radius, no surface and no idea what it contains.
 */
export function useScenery(
  { sky, seedling, world, density = "even", reach }: {
    readonly sky?: Sky;
    readonly seedling?: string;
    readonly world?: World;
    readonly density?: Density;
    /**
     * ⚠️ `card` MEANS "AS TALL AS WHAT WEARS IT". The default reach is one
     * VIEWPORT, which is right for a screen and wrong inside anything smaller:
     * the shapes are composed for a wide field, so only the top corner of one
     * lands and it reads as a smudge rather than as a world.
     */
    readonly reach?: "card";
  },
): {
  readonly attrs: Record<string, string>;
  readonly css?: React.CSSProperties;
  readonly field: React.ReactNode;
} {
  const night = useNight();
  const scene = world ?? (!sky || sky === "plain"
    ? null
    : skyWorld(sky as Exclude<Sky, "plain">, seedling ?? sky));
  const own = scene ? worldCss(scene, { night, density }) : null;
  if (!own) return { attrs: { "data-sky": "plain" }, field: null };
  return {
    attrs: { "data-sky": "world", ...(reach ? { "data-reach": reach } : {}) },
    css: own.css as React.CSSProperties,
    /*
      ⚠️ THE FIELD IS AN ELEMENT, AND IT HAS TO BE. It was a `background-image`
      carrying its own `<style>`, which is the better design and does not work:
      Chromium renders an SVG used as a background STATICALLY, so every star in
      the product was frozen from the day the field was written. Measured — the
      same file animates as an `<img>` and as inline SVG, and does not animate
      as a background.

      ⚠️ INNER HTML, AND IT IS ENGINE-GENERATED — a `<pattern>` and a `<rect>`
      composed by `render` from a family's own declarations. Nothing a person
      typed reaches this string, and there is no other way to hand a browser a
      subtree of SVG built as text.
    */
    field: own.field
      ? (
        <svg
          aria-hidden="true"
          data-field="true"
          {...(reach ? { "data-reach": reach } : {})}
          dangerouslySetInnerHTML={{ __html: own.field }}
        />
      )
      : null,
  };
}

/**
 * The frame every screen sits in.
 *
 * ⚠️ `min-h-dvh` RATHER THAN `min-h-screen`. On a phone, `100vh` is the height
 * the viewport would be with the browser chrome hidden — so a page sized to it
 * is a page whose last control sits under the address bar until you scroll,
 * which reads as a broken layout rather than as a unit bug.
 */
export function Page(
  { sky = "plain", seedling, world, density = "even", tone = "neutral", nav, children }: PageProps,
) {
  /*
    ⚠️ THE THEME PICKS A SKY, AND THIS REPLACES A RULE THAT SHOULD NEVER HAVE
    BEEN ONE. For one build a world was a dark room in both themes, because every
    attempt at a pale night sky came out grey and "space is dark, so commit"
    looked like a decision. It was three failed attempts wearing one: the family
    declares a `day` as well as a `night` — different ground, different specks,
    light from above rather than from underfoot — so light mode gets a real
    daytime sky and nobody has to be told to accept a black page.

    ⚠️ READ SYNCHRONOUSLY AND FROM THE DOCUMENT, because a stamp is what the
    theme actually is here (`ThemeProvider` writes `data-theme` on the root) and
    a first render that guessed wrong would swap the sky one frame later.
  */
  /* ⚠️ THE PAGE OWNS IT BECAUSE THE PAGE OWNS THE CROWN'S ROOM — see
     `useHemOnScroll`. Every address goes through here, so one listener covers
     every crown in the product and no crown has to remember. */
  useHemOnScroll();
  /* ⚠️ ONE PATH FOR BOTH. A subject's world and a named sky differ only in where
     the family and the two colours came from — everything after that is the same
     engine, which is what "one engine powers every scene" has to mean. */
  const own = useScenery({ sky, seedling, world, density });
  return (
    <div
      className="min-h-dvh flex flex-col"
      {...own.attrs}
      data-tone={tone}
      style={own.css}
    >
      {/*
        ⚠️ THE FIELD IS AN ELEMENT, AND IT HAS TO BE. It was a `background-image`
        carrying its own `<style>`, which is the better design and does not work:
        Chromium renders an SVG used as a background STATICALLY, so every star in
        the product was frozen from the day the field was written. Measured — the
        same file animates as an `<img>` and as inline SVG, and does not animate
        as a background. See `render`.

        ⚠️ INNER HTML, AND IT IS ENGINE-GENERATED — a `<pattern>` and a `<rect>`
        composed by `render` from a family's own declarations. Nothing a person
        typed reaches this string, and there is no other way to hand a browser a
        subtree of SVG built as text.
      */}
      {own.field}
      <div className={`flex grow flex-col ${nav ? NAV_SPACE : ""}`}>{children}</div>
      {nav}
    </div>
  );
}

/**
 * THE TOP HEM ARRIVES WITH THE FIRST SCROLL, AND THAT IS THE DIFFERENCE BETWEEN
 * A VIGNETTE AND A BAR.
 *
 * ⚠️ THE HEM IS OPAQUE AGAINST THE WORLD, NOT ONLY AGAINST CONTENT. It has to be
 * — four weaker strengths were shot and every one let a card's text read through
 * a crown title — and opaque means the field's marks stop where it starts. On a
 * page nobody has scrolled that is a flat strip of one colour across the top
 * with a pattern under it, which is a bar whatever the softness of its edge.
 *
 * ⚠️ SO THE FIX IS NOT HOW STRONG IT IS, IT IS WHEN IT IS THERE. The hem exists
 * for content passing UNDER the chrome; at scroll zero there is none, so there
 * is nothing to dissolve and the crown sits on the world.
 *
 * ⚠️ IT WRITES A PROPERTY RATHER THAN SETTING STATE, so a scroll costs a style
 * write instead of a React render of every screen in the tree — and it writes
 * only when the answer CHANGES, so resting at the top costs nothing at all.
 *
 * ⚠️ AND THE THRESHOLD IS NOT ZERO. A rubber band, a focus scroll, an image
 * settling — anything that moves the page by a pixel would otherwise flicker the
 * hem on and off under somebody's hands.
 */
function useHemOnScroll(at = 8): void {
  React.useEffect(() => {
    const root = document.documentElement;
    let on: boolean | null = null;
    const read = () => {
      const now = scrollY > at;
      if (now === on) return;
      on = now;
      root.style.setProperty("--hem-top", now ? "1" : "0");
    };
    read();
    addEventListener("scroll", read, { passive: true });
    return () => {
      removeEventListener("scroll", read);
      /* ⚠️ Cleared rather than left at whatever it was, because the property is
         on the ROOT and outlives this page — a screen that unmounted while
         scrolled would hand the next one a hem it never asked for. */
      root.style.removeProperty("--hem-top");
    };
  }, [at]);
}

/**
 * ⚠️ WHICH THEME IS IN FORCE, READ RATHER THAN GUESSED. `ThemeProvider` stamps
 * `data-theme` on the document element and the system preference decides when it
 * has not; a component that assumed either would pick the wrong sky on the first
 * paint and swap it on the second, which reads as a flash rather than as a
 * theme. Both sources, in the order the stylesheet resolves them.
 */
export function useNight(): boolean {
  const read = () => {
    if (typeof document === "undefined") return true;
    const stamped = document.documentElement.getAttribute("data-theme");
    if (stamped) return stamped === "dark";
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [night, setNight] = React.useState(read);
  React.useEffect(() => {
    const on = new MutationObserver(() => setNight(read()));
    on.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => on.disconnect();
  }, []);
  return night;
}

/* ------------------------------------------------------------------- band --- */

export interface BandProps {
  readonly bleed?: Bleed;
  readonly width?: Width;
  /** ⚠️ Its own ground, so one section can lift while the page stays calm. */
  readonly sky?: Sky;
  /** ⚠️ Which one of the family — see `PageProps.seedling`. */
  readonly seedling?: string;
  readonly tone?: Tone;
  readonly children?: React.ReactNode;
}

/**
 * A horizontal slice of a page.
 *
 * ⚠️ THE OUTER ELEMENT IS FULL WIDTH AND THE INNER ONE IS THE COLUMN, ALWAYS.
 * That split is what makes a painted background reach the edge while the text
 * stays readable — and doing it per screen is how you get a product where some
 * sections are inset and some are not, for no reason anybody remembers.
 */
export function Band({ bleed = "hold", width = "read", sky, seedling, tone, children }: BandProps) {
  /* ⚠️ THE SAME ENGINE A PAGE USES, because a section that lifts is a scene at a
     smaller reach and not a second mechanism — and now literally the same call,
     rather than the same three lines written twice. */
  const own = useScenery({ sky, seedling, reach: "card" });
  const lit = own.css !== undefined;

  const inner = bleed === "flush"
    ? "w-full"
    : bleed === "edge"
      ? `w-full ${GUTTER}`
      : `w-full ${WIDTH[width]} mx-auto ${GUTTER}`;

  return (
    <section
      className="w-full"
      {...(lit ? own.attrs : {})}
      {...(tone ? { "data-tone": tone } : {})}
      style={own.css}
    >
      {own.field}
      <div className={inner}>{children}</div>
    </section>
  );
}
