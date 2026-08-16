/**
 * WHAT A SCREEN SAYS ABOUT ITSELF — its name, its sections, its prose, its one
 * number.
 *
 * ⚠️ THESE SIT INSIDE A SCREEN, WHICH IS WHY THEY ARE IN `parts/` AND NOT IN
 * `frame/`. The directory test is "does it wrap a screen rather than sit inside
 * one" (README), and every export here fails it — they were in `frame/layout.tsx`
 * only because that is where things went when nobody re-asked the question.
 *
 * ⚠️ AND THIS IS ONE OF TWO FILES ALLOWED TO NAME A TYPE SIZE. `motion.test.mjs`
 * fails on a `text-2xl` anywhere else, because a heading whose size is chosen by
 * the screen is a heading branding does not reach.
 */

import * as React from "react";
import { TYPE } from "../tokens/type.js";
import { HEAD_GAP, HERO_PAD, SPACE, TITLE_PAD } from "../tokens/metrics.js";

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
    <div className={`flex flex-col ${SPACE.hair}`}>
      <h1 className={TYPE.title}>{children}</h1>
      {under ? <p className={TYPE.note}>{under}</p> : null}
    </div>
  );
}

/**
 * A HEADING AND THE THING IT HEADS, WHICH IS ONE BLOCK RATHER THAN TWO.
 *
 * ⚠️ A HEADING BELONGS TO WHAT IS UNDER IT, AND A BARE `SectionTitle` CANNOT
 * KNOW THAT. Dropped into a stack beside its content it is just the previous
 * sibling, so it takes the stack's gap — 24px on a `roomy` one — and a heading
 * floating 24px above its own tiles reads as an orphan, equidistant from the
 * block it names and the block before it. `Group` has always paired a label with
 * its card at `HEAD_GAP`; everything that is not a card had no way to say the
 * same thing, which is why the specimens did it wrong every time.
 *
 * ⚠️ AND IT IS A STEP ABOVE `Group`, BECAUSE IT CONTAINS ONE. Both drew their
 * label at `TYPE.section`, so a section holding three groups came out as four
 * headings of identical weight and the nesting was invisible — "Kova", then
 * "Studio", then "Appearance", each reading as a peer of the last. A heading
 * that does not outrank what it heads is a heading doing no work.
 */
export function Section(
  { label, under, children }: {
    /**
     * ⚠️ ABSENT IS A REAL ANSWER — see `distinguishing`. A section whose heading
     * separates it from nothing is a line of chrome, and they stack: a phone
     * showed "Settings", the workspace's name, "Kova", "Studio" and "Everyone
     * in this workspace" before the first control it could change.
     */
    readonly label?: string;
    readonly under?: string;
    readonly children?: React.ReactNode;
  },
) {
  return (
    <section className={`flex flex-col ${HEAD_GAP}`}>
      {label || under ? (
        <div className={`flex flex-col ${SPACE.hair}`}>
          {label ? <h2 className={TYPE.title}>{label}</h2> : null}
          {under ? <p className={TYPE.note}>{under}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * THE NAME OF ONE OF SEVERAL — or nothing, when it is the only one.
 *
 * ⚠️ A HEADING EXISTS TO SEPARATE, SO ONE THING NEEDS NONE. Every screen in the
 * hub loops the workspace's products and heads each block with the product's
 * name; on a workspace with ONE product that name distinguishes it from nothing
 * and is read before every screen, under two headings that already scoped it.
 * The same block with two products needs it badly, which is why this is a
 * question about the list rather than a decision per screen.
 *
 * ⚠️ AND IT IS HERE RATHER THAN IN EACH SCREEN so the rule cannot be applied to
 * four of the five. The list is the argument; the name is what to say about it.
 */
export const distinguishing = <T,>(among: readonly T[], name: string): string | undefined =>
  among.length > 1 ? name : undefined;

/** ⚠️ For a heading with nothing structurally under it. Prefer `Section`. */
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
    <div className={`flex flex-col ${SPACE.hair}`}>
      <span className={TYPE.figure}>{value}</span>
      <span className={TYPE.note}>{of}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- balance --- */

/**
 * THE ONE NUMBER A SCREEN IS ABOUT.
 *
 * ⚠️ EYEBROW, FIGURE, IDENTIFIER — in that order, and the order is the reading.
 * The eyebrow says which of several this is ("Personal · EUR"), the figure is
 * what somebody came for, and the identifier is the thing they would copy or
 * quote. A layout that leads with the identifier makes them hunt for the number.
 *
 * ⚠️ AND IT IS CENTRED, WHICH IS THE ONE PLACE IN THIS SYSTEM THAT IS. Centred
 * text is hard to scan, which is exactly right for a block nobody scans — they
 * look at it. Everything else stays left-aligned.
 */
export function Balance({ eyebrow, figure, identifier, under }: {
  readonly eyebrow?: string;
  readonly figure: React.ReactNode;
  readonly identifier?: React.ReactNode;
  readonly under?: React.ReactNode;
}) {
  return (
    /* ⚠️ TWO GROUPS, NOT ONE RUN. The eyebrow, the figure and the identifier are
       ONE thing and belong tight together; whatever is under them is a separate
       thing and needs air. Spacing them all identically is what made the
       quick-actions read as a fourth line of the caption. */
    <div className={`flex flex-col items-center ${SPACE.roomy} ${HERO_PAD} text-center`}>
      <div className={`flex flex-col items-center ${SPACE.tight}`}>
        {eyebrow ? <span className={TYPE.note}>{eyebrow}</span> : null}
        <div className="flex items-baseline justify-center">{figure}</div>
        {identifier ? (
          <span className={`${TYPE.note} flex items-center ${SPACE.tight}`}>{identifier}</span>
        ) : null}
      </div>
      {under}
    </div>
  );
}
