/**
 * THE PIECES A SCREEN IS ASSEMBLED FROM, SO ASSEMBLING ONE IS A DECISION RATHER
 * THAN A LAYOUT.
 *
 * ⚠️ THE POINT IS THAT A SCREEN CONTAINS NO MEASUREMENTS. Every `max-w`, every
 * gap, every gutter and every decision about what bleeds to the edge lives here
 * — because thirty screens each picking a defensible width is a product with no
 * width at all, and nobody can point at the file that is wrong.
 *
 * ⚠️ NOTHING HERE DRAWS A CONTROL. These are frames: they place HeroUI's
 * components and our own type roles, and they set no colour, no radius and no
 * border of their own. The moment one of them does, it is a screen a workspace's
 * branding does not reach (D7).
 *
 * ⚠️ AND THE AMBIENCE IS AN ATTRIBUTE, NOT AN INLINE STYLE. `data-sky` is read
 * by one stylesheet rule built from theme tokens, so a workspace's accent
 * reaches the background of every screen without any screen knowing branding
 * exists. An inline style would beat every token and freeze one page on ours.
 */

import type { Tone } from "@quad/kernel";
import { Separator } from "@heroui/react";
import type { Sky } from "./theme.js";
import { TYPE } from "./type.js";

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
export type Width = "read" | "work";

const WIDTH: Readonly<Record<Width, string>> = {
  read: "max-w-2xl",
  work: "max-w-6xl",
};

/* ------------------------------------------------------------------- page --- */

export interface PageProps {
  /** ⚠️ Named, never a colour — see the header. */
  readonly sky?: Sky;
  readonly tone?: Tone;
  readonly children?: React.ReactNode;
}

/**
 * The frame every screen sits in.
 *
 * ⚠️ `min-h-dvh` RATHER THAN `min-h-screen`. On a phone, `100vh` is the height
 * the viewport would be with the browser chrome hidden — so a page sized to it
 * is a page whose last control sits under the address bar until you scroll,
 * which reads as a broken layout rather than as a unit bug.
 */
export function Page({ sky = "plain", tone = "neutral", children }: PageProps) {
  return (
    <div className="min-h-dvh flex flex-col" data-sky={sky} data-tone={tone}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- band --- */

export interface BandProps {
  readonly bleed?: Bleed;
  readonly width?: Width;
  /** ⚠️ Its own ambience, so one section can lift while the page stays calm. */
  readonly sky?: Sky;
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
export function Band({ bleed = "hold", width = "read", sky, tone, children }: BandProps) {
  const inner = bleed === "flush"
    ? "w-full"
    : bleed === "edge"
      ? "w-full px-4 md:px-6"
      : `w-full ${WIDTH[width]} mx-auto px-4 md:px-6`;

  return (
    <section
      className="w-full"
      {...(sky ? { "data-sky": sky } : {})}
      {...(tone ? { "data-tone": tone } : {})}
    >
      <div className={inner}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ stack --- */

/**
 * ⚠️ SPACING IS A `gap` ON THE PARENT, NEVER A MARGIN ON A CHILD. Margins
 * collapse, they double when two spaced things meet, and the last child leaves a
 * gap at the bottom of its container that nobody asked for. A gap does none of
 * those, and it is why every layout here is flex or grid.
 */
export const SPACE = { tight: "gap-2", snug: "gap-3", roomy: "gap-6", airy: "gap-10" } as const;
export type Space = keyof typeof SPACE;

export function Stack(
  { space = "snug", children }: { readonly space?: Space; readonly children?: React.ReactNode },
) {
  return <div className={`flex flex-col ${SPACE[space]}`}>{children}</div>;
}

/** ⚠️ Wraps by default. A row that cannot wrap is a row that overflows a phone. */
export function Row(
  { space = "snug", children }: { readonly space?: Space; readonly children?: React.ReactNode },
) {
  return <div className={`flex flex-wrap items-center ${SPACE[space]}`}>{children}</div>;
}

/**
 * ⚠️ `auto-fit` WITH A MINIMUM, NOT A COLUMN COUNT. A grid declared as "three
 * columns" needs a breakpoint for every size it does not fit; this one has none
 * and cannot be wrong on a device nobody tested.
 */
export function Grid(
  { min = "16rem", space = "snug", children }: {
    readonly min?: string; readonly space?: Space; readonly children?: React.ReactNode;
  },
) {
  return (
    <div
      className={`grid ${SPACE[space]}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ crown --- */

export interface CrownProps {
  /** What is over the door. A mark, a name, or both. */
  readonly mark?: React.ReactNode;
  readonly name: string;
  /** ⚠️ One line, and only where it says something the name does not. */
  readonly under?: string;
  /** Pushed to the far end: a bell, an avatar, a switcher. */
  readonly aside?: React.ReactNode;
  readonly bleed?: Bleed;
  readonly width?: Width;
  /** ⚠️ A rule under the crown is right on a working screen and wrong on a
      landing one, where it cuts the page in half for no reason. */
  readonly ruled?: boolean;
}

/**
 * THE CHROME ABOVE EVERY SCREEN.
 *
 * ⚠️ THE CROWN IS NOT A DESTINATION (D10). The switcher, the bell and the
 * account sit here precisely because they are about *where you are* rather than
 * *what you are doing* — putting any of them in the five primary destinations
 * spends a scarce slot on something every screen already has.
 */
export function Crown(
  { mark, name, under, aside, bleed = "hold", width = "read", ruled = true }: CrownProps,
) {
  return (
    <header className="w-full">
      <Band bleed={bleed} width={width}>
        <div className="flex items-center gap-3 py-3">
          {mark ? <span aria-hidden="true" className="flex items-center">{mark}</span> : null}
          <div className="flex flex-col min-w-0">
            <strong className={TYPE.label}>{name}</strong>
            {under ? <span className={TYPE.note}>{under}</span> : null}
          </div>
          {aside ? <div className="ml-auto flex items-center gap-2">{aside}</div> : null}
        </div>
      </Band>
      {ruled ? <Separator /> : null}
    </header>
  );
}

/* ------------------------------------------------------------------ heads --- */

/**
 * ⚠️ ONE `Title` PER SCREEN, AND IT IS AN `h1`. Not decoration: it is what a
 * screen reader announces on arrival and what every "where am I" affordance
 * reads. A screen with three of them has none.
 */
export function Title(
  { children, under }: { readonly children: React.ReactNode; readonly under?: string },
) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className={TYPE.title}>{children}</h1>
      {under ? <p className={TYPE.note}>{under}</p> : null}
    </div>
  );
}

export function SectionTitle({ children }: { readonly children: React.ReactNode }) {
  return <h2 className={TYPE.section}>{children}</h2>;
}

/** ⚠️ Prose gets a width whatever its container is — see `Width.read`. */
export function Prose({ children }: { readonly children: React.ReactNode }) {
  return <p className={`${TYPE.body} max-w-2xl`}>{children}</p>;
}

/**
 * ⚠️ A NUMBER AND WHAT IT IS, TOGETHER. A figure with its label somewhere else
 * on the page is a figure people misread, and `tabular-nums` is what stops a
 * column of them rippling — see `TYPE.figure`.
 */
export function Figure(
  { value, of }: { readonly value: React.ReactNode; readonly of: string },
) {
  return (
    <div className="flex flex-col gap-1">
      <span className={TYPE.figure}>{value}</span>
      <span className={TYPE.note}>{of}</span>
    </div>
  );
}

/** Pushes what follows it to the bottom of a flex column. */
export const Spacer = () => <div className="flex-1" />;
