/**
 * ICONS — Lucide's shapes, our movement.
 *
 * ⚠️ THE SHAPES ARE LUCIDE'S BECAUSE DRAWING THEM IS NOT THE JOB. Six hand-drawn
 * glyphs were fine; sixty will not be, and the twentieth one somebody draws will
 * have a different stroke weight and a different optical size and nobody will be
 * able to say which is wrong.
 *
 * ⚠️ THE MOVEMENT IS OURS, AND THAT WAS A MEASURED DECISION RATHER THAN A
 * PREFERENCE. `lucide-animated` bundles as one module: one icon costs 79 kB
 * gzipped, six icons cost 79 kB gzipped — it does not tree-shake, and it needs
 * `motion` on top of that. Twelve icons from `lucide-react` cost 2.2 kB gzipped
 * together, because each is its own module of about two hundred bytes. It also
 * carries 441 of Lucide's icons rather than all of them, and four of the six this
 * screen needs are not among them.
 *
 * ⚠️ AND A SECOND MOTION LIBRARY WOULD BE A SECOND MOTION VOCABULARY. The
 * durations and curves are declared once in `motion.css.ts`; an icon set with its
 * own timing is a set of things on the screen moving to a rhythm nothing else
 * shares, which is the failure the motion module exists to prevent.
 *
 * ⚠️ THE MOVEMENT IS ONE OF FOUR, NOT ONE PER ICON. A download falls, a chevron
 * goes right, a key turns, a heart swells. Four verbs assigned across a set is a
 * language; twenty bespoke animations is decoration nobody can keep in step, and
 * it is what the last attempt at this shipped.
 */

import type { ReactNode } from "react";
import {
  ArrowLeft, Camera, Check, ChevronRight, Download, HeartCrack, KeyRound,
  Pencil, Shield, SlidersHorizontal, User, X, type LucideIcon,
} from "lucide-react";

/** How an icon answers a press. Assigned per icon, from a closed set of four. */
export type Move = "down" | "right" | "tilt" | "swell";

export interface IconProps {
  readonly size?: number;
  /** Given only when the icon is the whole meaning. Beside a label it is not. */
  readonly label?: string;
  readonly className?: string;
}

/*
  ⚠️ NAMED FOR WHAT THEY MEAN HERE, NOT FOR WHAT LUCIDE CALLS THEM. `Adjust`
  rather than `SlidersHorizontal`: `slide` is another product's core noun, and the
  kernel's vocabulary guard refuses it in platform code precisely so a shared
  control and a product's own object cannot end up one letter apart in the same
  file. Renaming at the boundary is also what makes swapping a shape later a
  one-line change instead of a find-and-replace across every screen.
*/
const draw = (Glyph: LucideIcon, move: Move, defaultSize: number) =>
  function Drawn({ size = defaultSize, label, className }: IconProps): ReactNode {
    return (
      <Glyph
        size={size}
        strokeWidth={1.9}
        absoluteStrokeWidth
        className={className}
        data-move={move}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      />
    );
  };

/* The account's own set. Each one appears exactly where its word does. */
export const Portrait = draw(User, "swell", 21);
export const Key = draw(KeyRound, "tilt", 21);
export const Adjust = draw(SlidersHorizontal, "right", 21);
export const Guard = draw(Shield, "swell", 21);
export const Save = draw(Download, "down", 21);
export const Heartbreak = draw(HeartCrack, "tilt", 21);
export const Edit = draw(Pencil, "tilt", 17);
export const Lens = draw(Camera, "swell", 14);

/* Furniture. The chevron has its own rule in `motion.css.ts` because it belongs
   to the row rather than to a meaning, and it moves on every row alike. */
export const Onward = draw(ChevronRight, "right", 19);
export const Close = draw(X, "swell", 20);
export const Back = draw(ArrowLeft, "right", 20);
export const Tick = draw(Check, "swell", 19);
