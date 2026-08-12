/**
 * ICONS — Lucide's shapes, moved one at a time.
 *
 * ⚠️ THE SHAPES ARE LUCIDE'S BECAUSE DRAWING THEM IS NOT THE JOB. Six hand-drawn
 * glyphs were fine; sixty will not be, and the twentieth one somebody draws will
 * have a different stroke weight and a different optical size and nobody will be
 * able to say which is wrong.
 *
 * ⚠️ THE MOVEMENT IS OURS, AND THAT WAS MEASURED RATHER THAN PREFERRED.
 * `lucide-animated` bundles as one module: one icon costs 79 kB gzipped, six
 * icons cost 79 kB gzipped — it does not tree-shake — and it needs `motion` on
 * top. Twelve icons from `lucide-react` cost 2.2 kB gzipped together, because each
 * is its own two-hundred-byte module. It also carries 441 of Lucide's icons, and
 * four of the six this screen needs are not among them.
 *
 * ⚠️ EACH ICON MOVES THE WAY ITS OWN PARTS WOULD. A key turns about its hole. A
 * download's arrow falls while the tray it falls into stays. A camera's lens
 * closes. A shield seals. Four generic verbs applied across a set is a rule that
 * makes every icon move like every other one, which is tidy and dead; the
 * movement is where an icon says what it is. The vocabulary that stays shared is
 * the TIMING — every one of them uses the same durations and curves, declared
 * once in `motion.css.ts`.
 *
 * ⚠️ THE MOVEMENT LIVES IN CSS AND ADDRESSES CHILDREN BY POSITION, which is the
 * one fragile thing here and is guarded rather than hoped about. `test/icon.test.tsx`
 * pins the shape of every icon — how many children and in what order — because
 * Lucide redraws icons between versions and a redrawn one does not fail: it moves
 * the wrong part, quietly, forever. Both `KeyRound` and the sliders glyph have
 * already been redrawn once since this file was written.
 *
 * vocabulary-exempt-file(slide): Lucide's own component names. `SlidersHorizontal`
 * is a symbol from a dependency, so it cannot be renamed where it is imported —
 * and it IS renamed at the boundary, which is what `Adjust` below is.
 */

import type { ReactNode } from "react";
import {
  ArrowLeft, Camera, Check, ChevronRight, Download, FileText, HeartCrack, Info, KeyRound, Languages, Lock,
  ArrowUpRight, Mail, MonitorSmartphone, Pencil, Plus, Ruler, Share2, Shield, SlidersHorizontal, SunMoon,
  Vibrate, Volume2, X, type LucideIcon,
} from "lucide-react";

/** The name the stylesheet animates by. Closed: a new icon adds a rule. */
export type IconName =
  | "key" | "adjust" | "guard" | "save" | "heartbreak" | "letter" | "device" | "others"
  | "outward"
  | "edit" | "lens" | "onward" | "close" | "back" | "tick" | "add"
  | "light" | "tongue" | "measure" | "buzz" | "sound" | "locked" | "about" | "paper";

export interface IconProps {
  readonly size?: number;
  /** Given only when the icon is the whole meaning. Beside a label it is not. */
  readonly label?: string;
  readonly className?: string;
}

const draw = (Glyph: LucideIcon, name: IconName, defaultSize: number) =>
  function Drawn({ size = defaultSize, label, className }: IconProps): ReactNode {
    return (
      <Glyph
        size={size}
        strokeWidth={1.9}
        absoluteStrokeWidth
        className={className}
        data-icon={name}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      />
    );
  };

/*
  ⚠️ NAMED FOR WHAT THEY MEAN HERE, NOT FOR WHAT LUCIDE CALLS THEM. `Adjust`
  rather than the drawing's own name: that name carries another product's core
  noun, and the
  kernel's vocabulary guard refuses it in platform code precisely so a shared
  control and a product's own object cannot end up one letter apart in the same
  file. Renaming at the boundary is also what makes swapping a shape later a
  one-line change instead of a find-and-replace across every screen.
*/
export const Key = draw(KeyRound, "key", 21);
export const Adjust = draw(SlidersHorizontal, "adjust", 21);
export const Guard = draw(Shield, "guard", 21);
/* ⚠️ NOT THE SHIELD. A shield is protection — what the platform does — and the
   account home carries both a vault row and a consent row, so reusing it would
   put one glyph on two rows meaning different things on the same screen. A lock
   is what a person's own things are kept behind. */
export const Locked = draw(Lock, "locked", 21);
export const Save = draw(Download, "save", 21);
export const Heartbreak = draw(HeartCrack, "heartbreak", 21);
export const Edit = draw(Pencil, "edit", 17);
export const Lens = draw(Camera, "lens", 14);
export const Letter = draw(Mail, "letter", 21);
/* ⚠️ `Paper` rather than the drawing's own name, for the reason at the top of
   this block: a document is what it is HERE, and the shape may change. */
export const Paper = draw(FileText, "paper", 21);
export const Device = draw(MonitorSmartphone, "device", 21);
/* ⚠️ `Others` RATHER THAN A SHARE VERB. The row it names answers "who else
   receives this", which is a set of companies rather than an action somebody
   takes — and a share glyph read as a control is a control that would send
   something. It is also deliberately not one letter from `Onward`, which is the
   furniture two rows down and means the opposite kind of thing. */
export const Others = draw(Share2, "others", 21);

/* ⚠️ THERE IS NO ICON FOR A PLACE, AND THERE WERE TWO. A globe stood for the edge
   network and a ring of stars for the union — shapes a drawing library happened to
   have, doing duty as emblems, in a column where every other tile is a company's
   own logo or a symbol that means what it draws. Nothing an icon set contains
   means "European Union"; a region is a label rather than a tile, and it is one
   now — see `Region` in `account/legal.tsx`. Written down because the next person
   to want one will reach for the same two shapes. */

/* Furniture — the parts of a row rather than a meaning in it. */
/* ⚠️ IT LEAVES, AND IT IS NOT A CHEVRON. A chevron is a promise of a next screen
   in this surface; this is a promise of a new tab, and using one for the other is
   how somebody presses "next" and loses the page they were on. */
export const Outward = draw(ArrowUpRight, "outward", 16);
export const Onward = draw(ChevronRight, "onward", 19);
export const Close = draw(X, "close", 20);
export const Back = draw(ArrowLeft, "back", 20);
export const Tick = draw(Check, "tick", 19);
export const Add = draw(Plus, "add", 18);
/* ⚠️ THE ONE MARK THAT MEANS "EXPLAIN THIS", and it is worth its own entry
   because the alternative is a paragraph on every row it would sit beside. */
export const About = draw(Info, "about", 19);

/* Preferences — each one is the thing it sets, not a symbol borrowed from a
   neighbour. Sliders for a theme, an envelope for a language and a shield for a
   unit were all exactly that, and each of them means something else two screens
   away. */
export const Light = draw(SunMoon, "light", 21);
export const Tongue = draw(Languages, "tongue", 21);
export const Measure = draw(Ruler, "measure", 21);
export const Buzz = draw(Vibrate, "buzz", 21);
export const Sound = draw(Volume2, "sound", 21);

/**
 * ⚠️ WHAT EACH ICON IS MADE OF, so a test can hold Lucide to it. The order is the
 * order the elements appear in, and the CSS addresses them by exactly that.
 */
export const ICON_PARTS: Readonly<Record<IconName, readonly string[]>> = {
  key: ["path", "circle"],
  adjust: ["path", "path", "path", "path", "path", "path", "path", "path", "path"],
  guard: ["path"],
  save: ["path", "path", "path"],
  heartbreak: ["path", "path"],
  edit: ["path", "path"],
  lens: ["path", "circle"],
  letter: ["path", "rect"],
  device: ["path", "path", "path", "rect"],
  onward: ["path"],
  close: ["path", "path"],
  back: ["path", "path"],
  tick: ["path"],
  add: ["path", "path"],
  locked: ["rect", "path"],
  light: ["path", "path", "path", "path", "path"],
  tongue: ["path", "path", "path", "path", "path", "path"],
  measure: ["path", "path", "path", "path", "path"],
  buzz: ["path", "path", "rect"],
  sound: ["path", "path", "path"],
  about: ["circle", "path", "path"],
  paper: ["path", "path", "path", "path", "path"],
  others: ["circle", "circle", "circle", "line", "line"],
  outward: ["path", "path"],
};

/*
  ⚠️ THE ONE GLYPH DRAWN BY HAND, AND IT IS HERE RATHER THAN BESIDE THE BUTTON IT
  SPINS IN. Drawing is what this file is for: a path written at a screen is how a
  second stroke weight and a second optical size enter the product without anybody
  choosing them — and it is how four company logos came to be drawn from memory.
  An arc of a circle is not in the icon set because it is not an icon; it is a
  ring, and every ring in the platform is this one.
*/
export const Spinner = (): ReactNode => (
  <svg className="button-sign spin" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
    <path d="M12 3a9 9 0 0 1 9 9" />
  </svg>
);
