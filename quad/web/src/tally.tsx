/**
 * A NUMBER THAT COUNTS TO ITSELF — the one animation in this system written in
 * JavaScript, and the reasons it has to be are worth stating before the code.
 *
 * ⚠️ CSS CANNOT DO THIS, WHICH IS THE WHOLE JUSTIFICATION. A count is a change
 * to TEXT CONTENT, and no transition, keyframe or `@property` trick animates the
 * characters in a node across browsers we can rely on. Everything else here
 * moves a box or fades one, which CSS does natively and the reduced-motion
 * settings switch off for free.
 *
 * ⚠️ SO IT SWITCHES ITSELF OFF, EXPLICITLY AND BOTH WAYS. A tween is the one
 * form of motion that keeps running for somebody who asked it to stop, because
 * nothing in the platform can reach it — so this reads `prefers-reduced-motion`
 * AND walks up for a `data-reduce-motion` ancestor, and when either says no it
 * renders the final value on the first frame. That is not a nicety: a number
 * ticking is exactly the kind of motion the setting exists for.
 *
 * ⚠️ AND IT IS FOR THE ONE NUMBER A SCREEN IS ABOUT. A `Hero` counts because
 * somebody came to the screen to see it and the count is what draws the eye to
 * it. A row of stats does not, an axis label does not, a table cell does not —
 * six numbers ticking at once is not emphasis, it is noise, and it makes a page
 * unreadable for the second it lasts. `count` is opt-in everywhere except the
 * hero, which is by definition the one.
 *
 * ⚠️ THE ACCESSIBLE VALUE IS THE FINAL ONE, FROM THE FIRST FRAME. A screen
 * reader announcing a number as it counts is either nonsense or a stream of
 * interruptions, so the animating text is `aria-hidden` and the real value sits
 * beside it where assistive technology reads it once.
 */

import * as React from "react";

/**
 * ⚠️ 700ms, WHICH IS LONGER THAN EVERY OTHER DURATION HERE AND SHOULD BE. The
 * `MOTION` scale is about controls settling — 180ms, 260ms — and a count at
 * that speed is a flicker rather than a count. This is the only thing in the
 * product a person is meant to WATCH, so it is slow enough to follow and short
 * enough not to delay anybody who is reading rather than watching.
 */
const COUNT_MS = 700;

/** ⚠️ Decelerating, so the last digits settle rather than slam. Matches `--ease-out-quart`. */
const easeOutQuart = (t: number): number => 1 - (1 - t) ** 4;

/**
 * ⚠️ BOTH SIGNALS, AND THE SECOND ONE IS THE HALF THAT IS ACTUALLY REACHABLE.
 * `prefers-reduced-motion` is an operating-system setting; `data-reduce-motion`
 * is what a switch inside the product sets, and it is the one somebody flips
 * after this animation annoys them. Answering only the first would mean the app
 * has a control that visibly does nothing here.
 */
function useStill(at: React.RefObject<HTMLElement | null>): boolean {
  /*
    ⚠️ THE OS SETTING IS READ SYNCHRONOUSLY AND THAT IS LOAD-BEARING. Starting at
    `true` and correcting in an effect meant the FIRST run of the counting effect
    always took the bail-out path — which marks the value as already reached, so
    when the correction arrived there was nothing left to count from. The result
    was a component that never animated at all, in either setting, with every
    test green and the code reading exactly as intended.
  */
  const [still, setStill] = React.useState(
    () => typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  /* ⚠️ The ancestor can only make it MORE still — an in-app switch turns motion
     off, it never turns it back on over somebody's operating system. */
  React.useEffect(() => {
    if (at.current?.closest('[data-reduce-motion="true"]')) setStill(true);
  }, [at]);
  return still;
}

export interface TallyProps {
  readonly value: number;
  /**
   * ⚠️ THE FORMATTER IS THE CALLER'S, because what a number IS decides how it
   * counts. Money counts in whole units and lands on its cents; a compacted
   * figure goes 0 → 1.2K → 12.9K; a percentage counts in ones. A component that
   * chose would be right for one of them.
   */
  readonly format?: (value: number) => React.ReactNode;
  /** ⚠️ Off is the default everywhere but the hero — see the header. */
  readonly count?: boolean;
  readonly className?: string;
}

/**
 * ⚠️ IT COUNTS FROM THE PREVIOUS VALUE, NOT FROM ZERO, AFTER THE FIRST TIME. A
 * balance that dropped by five pounds and re-counted from nothing would say the
 * account had been emptied and refilled — the animation has to describe the
 * change that happened, and on arrival the change IS from nothing.
 */
export function Tally({ value, format = String, count = false, className }: TallyProps) {
  const at = React.useRef<HTMLSpanElement>(null);
  const still = useStill(at);
  const counting = count && !still;

  /*
    ⚠️ THE FIRST PAINT IS ALREADY AT ZERO WHEN WE ARE GOING TO COUNT. Rendering
    the final value and then tweening from nothing shows the answer, throws it
    away and counts back up to it — a flash nobody asked for on the one number
    the screen is about.
  */
  const [shown, setShown] = React.useState<number>(() => (counting ? 0 : value));

  /*
    ⚠️ WHERE THE NUMBER CURRENTLY IS, WHICH IS NOT "THE LAST VALUE WE WERE GIVEN".
    The first version recorded the target as reached the moment the tween was
    SCHEDULED, and StrictMode double-invokes effects in development — schedule,
    cancel, schedule again — so the second run saw start === value and snapped.
    The result was a component that never counted at all, in development, while
    reading exactly as intended and behaving differently in production. Tracking
    the shown value instead is also what makes a mid-count change continue from
    where the digits actually are rather than jumping.
  */
  const showing = React.useRef(shown);
  const settle = (n: number) => { showing.current = n; setShown(n); };

  React.useEffect(() => {
    const start = showing.current;
    if (!counting || start === value) { settle(value); return; }

    let frame = 0;
    let began: number | null = null;
    const step = (now: number) => {
      began ??= now;
      const t = Math.min(1, (now - began) / COUNT_MS);
      settle(t < 1 ? start + (value - start) * easeOutQuart(t) : value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, counting]);

  return (
    <span ref={at} className={className}>
      {/* ⚠️ ROUNDED, BECAUSE A FORMATTER IS GIVEN A REAL NUMBER MID-TWEEN and
          most of them will happily render `12913.7421`. The final frame is the
          exact value, so nothing is lost. */}
      <span aria-hidden="true">{format(shown === value ? value : Math.round(shown))}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
