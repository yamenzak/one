/**
 * WHERE A WORKSPACE'S RECORDS LIVE — the one choice a residency question is about.
 *
 * ⚠️ IT WAS AN IDENTIFIER EVERYWHERE IT APPEARED. Every surface that named a
 * region printed `auto` or `eu`, because no human name for one existed anywhere
 * in the platform and any screen that wanted one would have had to invent it.
 * The names are the kernel's now — a reading of what `RegionId` already
 * documents rather than a new fact — and this is the one way they are shown.
 *
 * ⚠️ A CHIP WITH A MARK, BECAUSE IT IS AN IDENTITY RATHER THAN A VALUE. A
 * workspace on the global network and a workspace pinned to the union are two
 * different commitments, and the pair have to be told apart at a glance in a
 * list — which is exactly what the interface already uses a face and a chip for
 * everywhere else a thing has an identity.
 *
 * ⚠️ THE TWO DRAWINGS ARE THE PLATFORM'S OWN, and neither is an official emblem.
 * A globe is a globe; the circle of stars is the shape the union is recognised
 * by, drawn at chip scale in its own colours. Both are decoration over a name
 * that is always present, so nothing depends on either being read.
 *
 * ⚠️ AND BOTH MOVE ON THE WEATHER SCALE, NOT THE INTERFACE ONE. The globe turns
 * once a minute and the stars breathe over nine seconds — nothing is responding
 * to anybody, and their rate IS the effect. Anything under two seconds would be
 * a control asking to be pressed. Reduced motion removes both, by the universal
 * rule rather than by a class list.
 */

import type { ReactNode } from "react";
import { jurisdictionOf, type RegionId } from "@one/kernel";

/**
 * ⚠️ THE STARS ARE PLACED BY ARITHMETIC, NOT BY TWELVE HAND-WRITTEN PAIRS. Twelve
 * coordinates typed out is twelve chances to put one slightly wrong, and the one
 * that is wrong is invisible until somebody looks at a ring of stars and cannot
 * say why it feels off.
 */
const RING = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
  return { i, x: 12 + Math.cos(angle) * 6.6, y: 12 + Math.sin(angle) * 6.6 };
});

const Union = (): ReactNode => (
  <svg viewBox="0 0 24 24" width="24" height="24" focusable="false" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#003399" />
    {RING.map((star) => (
      /* ⚠️ EACH ONE CARRIES ITS OWN INDEX, and the stylesheet delays off it, so
         the shimmer travels round the ring instead of pulsing as one object. */
      <circle
        key={star.i}
        className="star"
        style={{ "--n": star.i } as Record<string, number>}
        cx={star.x}
        cy={star.y}
        r="1.15"
        fill="#FFCC00"
      />
    ))}
  </svg>
);

const Globe = (): ReactNode => (
  <svg viewBox="0 0 24 24" width="24" height="24" focusable="false" aria-hidden="true">
    <defs>
      {/* ⚠️ THE MERIDIANS ARE CLIPPED TO THE SPHERE, which is what makes them read
          as being ON it rather than as ellipses drawn over a disc. */}
      <clipPath id="globe-edge"><circle cx="12" cy="12" r="11" /></clipPath>
    </defs>
    <circle cx="12" cy="12" r="11" fill="var(--accent)" />
    <g clipPath="url(#globe-edge)" stroke="#fff" strokeWidth="0.9" fill="none" opacity="0.72">
      {/* The latitudes hold still: a sphere turns about its axis, and a band of
          latitude is the one line on it that does not move when it does. */}
      <path d="M1 8.6h22M1 15.4h22" />
      <circle cx="12" cy="12" r="11" />
      {/* ⚠️ THE LONGITUDES ARE THE ONLY MOVING PART, and they narrow and widen
          rather than sliding — which is what a line of longitude does as it comes
          round the far side. Translating them would be a picture drifting. */}
      <g className="meridians">
        <ellipse cx="12" cy="12" rx="4" ry="11" />
        <ellipse cx="12" cy="12" rx="8.5" ry="11" />
      </g>
    </g>
  </svg>
);

export interface JurisdictionChipProps {
  readonly region: RegionId;
  /**
   * ⚠️ THE SENTENCE UNDER IT, WHERE THERE IS ROOM FOR ONE. In a list the chip is
   * the whole of it; on a screen about residency the line that says what
   * choosing this MEANS is the reason somebody is reading at all.
   */
  readonly explain?: boolean;
}

/**
 * ⚠️ AN UNKNOWN REGION IS SHOWN AS ITSELF, WITH NO MARK AND NO SENTENCE. The id
 * is open by design, so a deployment may name a third; printing it plainly says
 * "this exists and nobody has written it up here", where a prettified guess
 * would say something about where data is that nobody declared.
 */
export function JurisdictionChip({ region, explain }: JurisdictionChipProps): ReactNode {
  const known = jurisdictionOf(region);
  if (!known) return <span className="chip" data-plain="">{region}</span>;
  return (
    <span className="jurisdiction" data-explain={explain ? "" : undefined}>
      <span className="jurisdiction-face">{region === "eu" ? <Union /> : <Globe />}</span>
      <span className="jurisdiction-said">
        <span className="jurisdiction-name">{known.name}</span>
        {explain ? <span className="jurisdiction-means">{known.means}</span> : null}
      </span>
    </span>
  );
}
