/**
 * A MARK — the one tile in the platform, and the only thing that draws a face, a
 * logo or a symbol.
 *
 * ⚠️ THERE WERE FIVE OF THESE AND THEY AGREED ABOUT NOTHING. A person's face was a
 * circle at 44 and another at 62; a workspace was a rounded square at 11px radius;
 * a company was one at 14px; an icon sat in a 999px well; and two badges hung off
 * their corners at −1px and −3px. Every one of them was defensible on its own and
 * together they were five sizes, four radii and three badge positions — which is
 * what "inconsistent avatars" is, and no amount of individually careful work fixes
 * it while there are five places to be careful in.
 *
 * ⚠️ THE SHAPE IS THE KIND, AND THERE ARE TWO. Round is a PERSON or a SYMBOL —
 * something that stands for a class of thing. A rounded square is something with
 * an identity of its own: a workspace, a product, a company, a place. A logo in a
 * circle is a logo with its corners cut off, and a symbol in a square is a sticker.
 *
 * ⚠️ THE RADIUS IS DERIVED FROM THE SIZE, so a mark is the same OBJECT at every
 * scale rather than three tiles with similar corners. Written as a pixel value it
 * drifts the first time somebody adds a size — which is what 11 and 14 on the same
 * 44-pixel box were.
 *
 * ⚠️ AND THE BADGE SITS ON THE SHAPE'S EDGE, WHICH TAKES ARITHMETIC RATHER THAN A
 * NUDGE. Placed at the bounding box's corner it lands ON a rounded square and in
 * EMPTY SPACE beside a circle — which is why the camera on somebody's photograph
 * looked detached and the device on a workspace did not. Nine per cent of the box,
 * outward, puts it on the arc at four o'clock and just past the square's corner:
 * one number, both shapes.
 */

import * as Avatar from "@radix-ui/react-avatar";
import type { CSSProperties, ReactNode } from "react";
import { LOGOS } from "./brand/logos.js";

/**
 * WHAT THE MARK IS OF. The shape follows from this and from nothing else.
 *
 * ⚠️ `symbol` IS THE ICON WELL, and it is here rather than beside the icons
 * because it is the same tile at the same size in the same column. Kept apart, a
 * row with an icon and a row with a face lined up only by coincidence.
 */
export type MarkKind =
  | "person"
  | "workspace"
  | "product"
  | "company"
  | "place"
  | "symbol";

/** ⚠️ Three, and they are the three a row, a sentence and a title need. */
export type MarkSize = "sm" | "md" | "lg";

/**
 * ⚠️ A TONE, NEVER A COLOUR. Everything that grounds a mark comes from the tone
 * scale or from a declared brand colour — so a screen cannot invent a hue, which
 * is what made a column of capsules read as arbitrary.
 */
export type MarkTone = "quiet" | "warn" | "alarm" | "accent";

export interface MarkProps {
  readonly kind: MarkKind;
  readonly size?: MarkSize;
  /**
   * ⚠️ A PICTURE IF THERE IS ONE, THE INITIAL UNTIL IT DECODES. Not a spinner and
   * not a blank: what stops a list of four flashing four letters and then four
   * faces is holding the letter on the ground the picture will have.
   */
  readonly src?: string;
  /** A drawn symbol. Only for `symbol` — anything else has a face or a logo. */
  readonly glyph?: ReactNode;
  /**
   * A company's own logo, by the name its declaration gives.
   *
   * ⚠️ AN UNKNOWN NAME FALLS BACK TO THE INITIAL, never to a drawn office block:
   * beside three real logos that reads as a company nobody could identify.
   */
  readonly logo?: string;
  /** What the initial comes from. Never read aloud — the row carries the name. */
  readonly name?: string;
  readonly tone?: MarkTone;
  /** A product's colour, for a workspace that has no picture of its own. */
  readonly product?: string;
  /**
   * ⚠️ A SECOND, SMALLER THING ON THE EDGE — what KIND of thing this row is about
   * when the mark already says WHICH. Never a control: it is on the mark, and a
   * mark is not a target.
   */
  readonly badge?: ReactNode;
  /** ⚠️ Only `alive`, which is the breathing a generated face does. */
  readonly className?: string;
}

/**
 * ⚠️ THE SIZE IS A NUMBER ON THE ELEMENT, and everything else is computed from it
 * in the sheet — the radius, the letter, the glyph, the badge and its ring. That
 * is what makes a new size one value rather than five rules.
 */
const PIXELS: Readonly<Record<MarkSize, number>> = { sm: 26, md: 44, lg: 64 };

export function Mark({
  kind, size = "md", src, glyph, logo, name, tone, product, badge, className,
}: MarkProps): ReactNode {
  const drawn = logo ? LOGOS[logo] : undefined;
  const style = {
    "--mark": `${PIXELS[size]}px`,
    ...(drawn ? { "--brand": drawn.hex } : {}),
  } as CSSProperties;

  return (
    <span className={`mark${className ? ` ${className}` : ""}`} data-kind={kind}
      data-tone={tone} data-product={product} style={style}>
      {/* ⚠️ AN IMAGE, NEVER INLINE SVG, FOR A GENERATED FACE. Every one of them
          carries the same internal id, so two inlined into one document leaves the
          second referencing the first's mask and half of them simply disappear.
          An image is its own document, and its CSS still runs. */}
      {src !== undefined ? (
        <Avatar.Root className="mark-body">
          <Avatar.Image className="mark-image" src={src} alt="" />
          <Avatar.Fallback className="mark-letter" aria-hidden="true">{initial(name)}</Avatar.Fallback>
        </Avatar.Root>
      ) : drawn ? (
        /* ⚠️ THE COMPANY'S OWN PATH AT THEIR OWN COLOUR, on a ground mixed from it.
           Painted flat, four of these in a column is a sponsor wall. */
        <svg className="mark-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d={drawn.path} fill="var(--brand)" />
        </svg>
      ) : glyph ? (
        <span className="mark-glyph">{glyph}</span>
      ) : (
        <span className="mark-letter" aria-hidden="true">{initial(name)}</span>
      )}
      {badge ? <span className="mark-badge" aria-hidden="true">{badge}</span> : null}
    </span>
  );
}

/** ⚠️ One character, upper case, and never a space — a blank tile reads as broken. */
const initial = (name?: string): string => (name?.trim()[0] ?? "?").toUpperCase();

/** ⚠️ Exported for the guard that holds every declared logo to a drawing. */
export const DRAWN_LOGOS: readonly string[] = Object.keys(LOGOS);
