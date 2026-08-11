/**
 * FACES — the one avatar in the platform, for a person and for a workspace.
 *
 * ⚠️ IT TAKES A SOURCE; IT DOES NOT MAKE ONE. Generating an avatar means shipping
 * the generator and its style definitions to the browser — about 40 kB gzipped for
 * two styles — to redraw the same picture from the same seed on every device that
 * ever loads the page. The seed is stable, so the picture is stable, so it belongs
 * behind a URL that can be cached forever. Where that URL comes from is the app's
 * business, and it is why this file has no dependency on DiceBear at all.
 *
 * ⚠️ AND IT IS AN IMAGE, NOT INLINE SVG. Every DiceBear avatar carries
 * `id="viewboxMask"` — the SAME id in all of them — so two inlined into one
 * document leaves the second referencing the first's mask. Half of them simply
 * disappear, and which half depends on what the mask happens to clip. An image is
 * its own document, so the ids cannot meet. The animation still runs: it is CSS
 * inside the file, and CSS animations run in an image.
 *
 * ⚠️ THE FALLBACK IS NOT A SPINNER AND NOT A BLANK. It is the initial on the
 * ground the picture would have had, held until the image has actually decoded —
 * which is what stops a list of four flashing four letters and then four faces.
 */

import * as Avatar from "@radix-ui/react-avatar";
import type { ReactNode } from "react";

/**
 * ⚠️ TWO KINDS, AND THEY ARE DIFFERENT SHAPES. A person is a circle; a workspace
 * is a rounded square. Round is a symbol or a person, a rounded square is a thing
 * with an identity of its own — and a workspace's own uploaded logo, when it has
 * one, is a logo with its corners cut off in a circle.
 */
export type FaceKind = "person" | "workspace";

export interface FaceProps {
  /**
   * ⚠️ THE UPLOADED ONE FIRST, THE GENERATED ONE SECOND. A workspace that has
   * chosen a logo has said what it looks like; the generated face is what stands
   * in until somebody does.
   */
  readonly src?: string;
  readonly kind: FaceKind;
  /** What the fallback letter comes from. Never read aloud — the row says it. */
  readonly name: string;
  /** A product's colour, when the fallback should carry one. */
  readonly tone?: string;
  readonly className?: string;
}

export function Face({ src, kind, name, tone, className }: FaceProps): ReactNode {
  return (
    <Avatar.Root className={`face${className ? ` ${className}` : ""}`} data-kind={kind} data-tone={tone}>
      <Avatar.Image className="face-image" src={src} alt="" />
      <Avatar.Fallback className="face-letter" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </Avatar.Fallback>
    </Avatar.Root>
  );
}
