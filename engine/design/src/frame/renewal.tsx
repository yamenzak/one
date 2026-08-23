/**
 * A NEWER VERSION IS OUT THERE, AND THIS TAB IS NOT IT.
 *
 * ⚠️ IT IS NOT A TOAST, AND THE RULE IS `overlay.tsx`'s OWN: a notice reports
 * the outcome of something the person just did, "never for ambient state". This
 * is ambient — it became true while they were reading, they did nothing to cause
 * it, and there is nothing to acknowledge. A toast would also be gone in four
 * seconds, which for the one message that asks somebody to act is exactly wrong.
 *
 * ⚠️ IT IS NOT A CURTAIN EITHER. Nothing is broken: the running version works,
 * and taking the product away over an improvement is a worse interruption than
 * the improvement is worth. It offers; it does not insist.
 *
 * ⚠️ AND IT DOES NOT RELOAD BY ITSELF. A page that refreshes under somebody
 * loses whatever they were typing and puts them back at the top of a list they
 * had scrolled — for a benefit they cannot see. The one moment that is safe is
 * the one they choose.
 *
 * ⚠️ IT LIVES IN `frame/` BECAUSE IT PINS TO AN EDGE, and `chrome.test.mjs`
 * refuses that anywhere else — correctly. A second thing stuck to the viewport
 * is a second chrome whatever it is called: it competes with the nav for the
 * same corner, it has to know the same safe-area inset, and the day one of those
 * numbers moves only one of them follows.
 *
 * ⚠️ IT SITS ABOVE THE NAV RATHER THAN OVER THE CROWN. The foot is where this
 * product's own standing chrome lives, and the crown is where a screen says what
 * it is; a bar across the top pushes every screen down by its own height, which
 * is a layout every surface would have to survive.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import { TYPE } from "../tokens/type.js";
import { ISLAND_PAD, NAV_SPACE, SPACE } from "../tokens/metrics.js";
import { ARRIVE } from "../tokens/motion.js";

export function Renewal({ shown, onReload, onLater }: {
  readonly shown: boolean;
  readonly onReload: () => void;
  /** ⚠️ Dismissable, because "not now" is a real answer to an offer. */
  readonly onLater: () => void;
}) {
  if (!shown) return null;
  return (
    /* ⚠️ `NAV_SPACE` IS THE ROOM THE BAR ALREADY RESERVES, so this sits on top
       of the nav's own reserve rather than inventing a second number — the two
       would drift the first time a safe-area inset changed. */
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center
        ${NAV_SPACE}`}
    >
      <div
        /* ⚠️ THE ISLAND'S OWN INSET. A pill floating over the foot is the shape
           the docked action already has, so it takes that padding rather than a
           pair this file picked — `metrics.test.mjs` refuses the pair, and it is
           right to: two numbers for one shape drift the first time one moves. */
        className={`pointer-events-auto flex items-center ${SPACE.snug}
          ${ISLAND_PAD} rounded-full`}
        data-chrome="glass"
        /* ⚠️ THE ONE ARRIVAL, SPREAD. It is a data attribute the motion engine
           reads, not a duration this file gets to pick — `motion.ts` owns when
           and how long, so a second answer here is a second arrival. */
        {...ARRIVE}
      >
        {/* ⚠️ WHAT HAPPENED, NOT WHAT TO DO — the button says what to do. */}
        <span className={TYPE.note}>A newer version is ready</span>
        <Button size="sm" variant="secondary" onPress={onReload}>Reload</Button>
        {/* ⚠️ NAMED "LATER", NEVER AN ×. A cross on an offer reads as refusing
            the improvement rather than deferring it, and this comes back. */}
        <Button size="sm" variant="tertiary" onPress={onLater}>Later</Button>
      </div>
    </div>
  );
}
