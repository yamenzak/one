/**
 * WHAT IS ACTUALLY SCROLLING UNDER A SCREEN — the page, or a surface presented
 * over it.
 *
 * ⚠️ THREE HOOKS ASSUMED THE WINDOW AND ALL THREE WENT DEAD IN THE SAME PLACE.
 * The hem's strength, the crown's collapse and the nav's leaving are each a
 * function of scroll position, and each read `window.scrollY` and listened on
 * `window`. Inside `Over` the scrolling element is the presented surface, so the
 * window never scrolls and never fires: `scrollY` is 0 for ever, the hems resolve
 * to nothing, the title never collapses and the bar never leaves. Every one of
 * them looked like a separate missing feature.
 *
 * ⚠️ THE LISTENER IS ON `document` IN THE CAPTURE PHASE, WHICH IS THE ONE PLACE
 * THAT HEARS BOTH. A `scroll` event on an element does not bubble, so a window
 * listener cannot see it — but capture runs down from the root, so one
 * registration catches the document's own scroll and every scroller inside it.
 *
 * ⚠️ AND THE SCROLLER IS RESOLVED FROM THE NODE, NEVER GUESSED. A screen is
 * mounted in both places by design (`OneSpace` is a route AND a surface over a
 * product), so which of the two is scrolling is a fact about where this instance
 * happens to be — and asking the DOM is the only way to be right in both.
 */

import * as React from "react";

/**
 * ⚠️ THE NEAREST ANCESTOR THAT SCROLLS, or `null` for the document. `overflow`
 * alone is not enough: a `Modal.Body` that has not overflowed yet is `auto` and
 * scrolls nothing, and treating it as the scroller would freeze every reading at
 * zero — which is the bug one level down from the one this file is about.
 */
export const scrollerOf = (node: Element | null): HTMLElement | null => {
  for (let up = node?.parentElement; up; up = up.parentElement) {
    const how = getComputedStyle(up).overflowY;
    if ((how === "auto" || how === "scroll") && up.scrollHeight > up.clientHeight + 1) return up;
  }
  return null;
};

/** Where a scroller is, and how much of it is still below the fold. */
export interface Scrolled {
  readonly y: number;
  /** ⚠️ What is left BELOW, which is the question the bottom hem asks. */
  readonly under: number;
}

const readingOf = (host: HTMLElement | null): Scrolled => {
  if (host) {
    return { y: host.scrollTop, under: host.scrollHeight - (host.scrollTop + host.clientHeight) };
  }
  const doc = document.documentElement;
  return { y: window.scrollY, under: doc.scrollHeight - (window.scrollY + window.innerHeight) };
};

/**
 * WATCH WHATEVER SCROLLS UNDER `ref`, AND HAND EACH READING TO `onRead`.
 *
 * ⚠️ IT HANDS OVER A READING RATHER THAN SETTING STATE, because two of the three
 * callers write a CSS property and must not re-render the screen on every frame
 * of a scroll. The one that does need state decides that for itself.
 *
 * ⚠️ AND IT READS ONCE ON MOUNT. A screen restored mid-page, or one presented
 * over a product that was already scrolled, has a scroll position before it has
 * a scroll event — and waiting for the event is a first paint with the wrong
 * chrome on it.
 */
export function useScrolling(
  ref: React.RefObject<HTMLElement | null>,
  onRead: (at: Scrolled) => void,
): void {
  const latest = React.useRef(onRead);
  latest.current = onRead;

  React.useEffect(() => {
    /* ⚠️ RESOLVED AFTER LAYOUT, NOT DURING RENDER. `scrollHeight` is a
       measurement, and a surface that has just mounted has not been laid out
       when its effect body first runs in the same frame as its children. */
    let host = scrollerOf(ref.current);
    const read = () => latest.current(readingOf(host));

    /* ⚠️ RE-RESOLVED WHEN THE PAGE CHANGES SHAPE. A list that finishes loading
       turns a container that was not scrolling into one that is, and the answer
       has to be able to change from `null` to an element. */
    const again = () => { host = scrollerOf(ref.current); read(); };

    read();
    const settle = requestAnimationFrame(again);
    document.addEventListener("scroll", read, { passive: true, capture: true });
    addEventListener("resize", again);
    return () => {
      cancelAnimationFrame(settle);
      document.removeEventListener("scroll", read, { capture: true } as EventListenerOptions);
      removeEventListener("resize", again);
    };
  }, [ref]);
}
