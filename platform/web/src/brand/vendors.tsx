/**
 * SOMEBODY ELSE'S MARK — the companies a disclosure names, drawn.
 *
 * ⚠️ A LIST OF COMPANY NAMES IS A LIST OF WORDS TO READ; A LIST OF MARKS IS ONE
 * TO RECOGNISE. The question somebody opens a disclosure with is "do I know who
 * these people are", and a reader who has seen the host's logo on a hundred
 * status pages answers it before reading a line.
 *
 * ⚠️ THESE ARE DRAWN AT ICON SCALE AND ARE NOT THE VENDOR'S OWN FILE. Nothing
 * here claims to be an official asset: each is a simplified construction at 24
 * units, in the company's own colour, beside the company's full legal name —
 * which is the half that carries the identification. A mark alone would be a
 * claim; a mark beside "Cloudflare, Inc." is a recognition aid for it.
 *
 * ⚠️ WHICH ONE TO DRAW IS DECLARED, NOT INFERRED. `Subprocessor.mark` names it,
 * so two entries for the same company — the host and its mail lane — share a
 * mark while keeping their own ids, and an id a handler is matched against never
 * becomes a lookup key for artwork. An unknown name and an absent one both fall
 * back to the initial, so nothing here can fail to render.
 *
 * ⚠️ AND THE FALLBACK IS A MONOGRAM, NEVER A GENERIC BUILDING. A drawn office
 * block beside three real logos reads as a company we could not identify; a
 * letter in the same well reads as one whose mark we simply do not draw.
 */

import type { ReactNode } from "react";

/** What a mark is drawn on: the vendor's colour, and the mark's own ink. */
interface Drawn {
  readonly ground: string;
  readonly art: ReactNode;
}

/*
  ⚠️ EVERY COLOUR BELOW IS THE COMPANY'S PUBLISHED BRAND COLOUR, and it is used
  as a GROUND at low strength rather than as a fill. A row of four saturated
  logo tiles is a sponsor wall; the same four as tinted wells read as a list with
  identities in it, and — the part that matters here — they stay legible in both
  themes without a second set of values.
*/
const MARKS: Readonly<Record<string, Drawn>> = {
  /* A cloud, with the lighter wing behind it that the mark is built from. */
  cloudflare: {
    ground: "#F6821F",
    art: (
      <>
        {/* The wing behind: the lighter half of the mark, and it sits above and
            right of the cloud rather than beside it. */}
        <path
          d="M16.9 12.1a3.4 3.4 0 0 0-3.2-2.3 3.4 3.4 0 0 0-3.1 2 2.6 2.6 0 0 0-.6-.1 2.7 2.7 0 0 0-2.6 2.2h9.7a2 2 0 0 0 .1-.7 2 2 0 0 0-.3-1.1Z"
          fill="#FBAD41"
        />
        {/* The cloud itself: one silhouette, flat-bottomed, in the full colour. */}
        <path
          d="M18.4 14.1h-.2a.3.3 0 0 0-.3.2l-.3 1c0 .1 0 .2.2.2h4c.1 0 .2 0 .2-.2a5 5 0 0 0 .2-1.3 4.6 4.6 0 0 0-4.6-4.6 4.7 4.7 0 0 0-4.4 3 3.5 3.5 0 0 0-2.3-.9 3.4 3.4 0 0 0-3.4 3.1 4 4 0 0 0 0 .8 1.6 1.6 0 0 0-1.5 1.6c0 .1 0 .3.1.4 0 .1 0 .1.2.1h9.7c.1 0 .3-.1.3-.2l.2-.8c.1-.3.4-.5.7-.5h.9c.9 0 1.6-.7 1.6-1.6a1.7 1.7 0 0 0-1.3-1.6Z"
          fill="#F6821F"
          transform="translate(-3.4 -1.6) scale(0.92)"
        />
      </>
    ),
  },
  /* The slashed S, at the proportions the mark is set at. */
  /*
    ⚠️ SET ON ITS OWN GROUND, BECAUSE ITS MARK IS A CUT-OUT. The others are shapes
    that read in their own colour; this one is a letter reversed out of a solid
    tile, and drawn as a coloured glyph on a tint of the same hue it is a smudge
    in one theme and invisible in the other.
  */
  stripe: {
    ground: "#635BFF",
    art: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#635BFF" />
        <path
          d="M11.3 10.6c0-.5.4-.7 1.1-.7a7 7 0 0 1 3.2.8V7.6a8.6 8.6 0 0 0-3.2-.6c-2.6 0-4.4 1.4-4.4 3.7 0 3.5 4.8 2.9 4.8 4.5 0 .5-.5.7-1.2.7a8 8 0 0 1-3.5-1v2.9c1.1.5 2.3.7 3.5.7 2.7 0 4.5-1.3 4.5-3.6 0-3.8-4.8-3.1-4.8-4.3Z"
          fill="#fff"
        />
      </>
    ),
  },
  /* The four-colour G: three arcs, the fourth as the bar and its stem. */
  google: {
    ground: "#4285F4",
    art: (
      <>
        <path d="M12 5.2a6.8 6.8 0 0 1 4.7 1.9l-2 2a4 4 0 0 0-2.7-1Z" fill="#EA4335" />
        <path d="M12 8.1a3.9 3.9 0 0 0-3.7 2.7l-2.4-1.9A6.8 6.8 0 0 1 12 5.2Z" fill="#EA4335" />
        <path d="M8.3 10.8a3.9 3.9 0 0 0 0 2.4l-2.4 1.9a6.8 6.8 0 0 1 0-6.2Z" fill="#FBBC05" />
        <path d="M8.3 13.2a3.9 3.9 0 0 0 5.9 2l2.3 1.8A6.8 6.8 0 0 1 5.9 15.1Z" fill="#34A853" />
        <path d="M18.8 12.2c0 3-2.1 5.1-5.3 5.1a3.9 3.9 0 0 0 2.5-2.4H12v-2.7h6.7c.1.3.1.6.1 1Z" fill="#4285F4" />
      </>
    ),
  },
};

export interface VendorProps {
  /** The declared mark name. Unknown and absent both fall back to the letter. */
  readonly mark?: string;
  /** The company's own name — the initial, and what a reader is told. */
  readonly name: string;
}

/**
 * ⚠️ IT IS `aria-hidden`, ALWAYS. The name is on the row beside it in full, so a
 * reader hearing "Cloudflare, Inc. logo, Cloudflare, Inc." is being told the
 * same thing twice — and the mark carries no information the words do not.
 */
export function Vendor({ mark, name }: VendorProps): ReactNode {
  const drawn = mark ? MARKS[mark] : undefined;
  return (
    <span
      className="vendor"
      aria-hidden="true"
      /* ⚠️ THE GROUND IS A MIX, NOT THE COLOUR. Painted flat it is a sponsor
         wall; mixed into the card's own surface it is a tint the row wears, and
         one that survives both themes without a second value. */
      style={drawn ? ({ "--vendor": drawn.ground } as Record<string, string>) : undefined}
    >
      {drawn
        ? <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">{drawn.art}</svg>
        : <span className="vendor-letter">{name.trim().charAt(0).toUpperCase()}</span>}
    </span>
  );
}

/** ⚠️ Exported for the conformance test, which holds every declared mark to a drawing. */
export const DRAWN_MARKS: readonly string[] = Object.keys(MARKS);
