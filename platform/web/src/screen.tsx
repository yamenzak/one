/**
 * A SCREEN — the frame every surface in the platform is drawn in.
 *
 * ⚠️ THE WAY OUT IS A PROPERTY OF THE SCREEN'S PLACE, NOT A CHOICE. The root of a
 * presentation is DISMISSED, so it gets an ×; a screen one level inside is left
 * UPWARDS, so it gets an arrow. Two screens got that right by hand and the third
 * would have got it wrong — which is exactly the class of thing a frame exists to
 * decide once.
 *
 * ⚠️ THE BAR IS THERE FROM THE FIRST PIXEL AND ONLY THE GROUND ARRIVES. It holds
 * the way out and the way on at every scroll position, so nothing moves into it
 * and nothing has to be found again after scrolling; what changes is that it gains
 * a surface, a name, and — for the action — its words collapse into its symbol.
 * The alternative, a bar that slides in from off-screen carrying controls that
 * were somewhere else a moment ago, is two sets of the same buttons.
 *
 * ⚠️ THE NAME EXISTS TWICE IN THE MARKUP AND ONCE TO A READER. The large title is
 * the heading; the one in the bar is the same words, `aria-hidden`, because a
 * screen whose title is announced twice is a screen that sounds broken. That is
 * also why the small one is not a heading element.
 */

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { RoundButton } from "./button.js";
import { Back, Close } from "./icon.js";
import type { Sky } from "./sky.css.js";

/**
 * ⚠️ HOW FAR THE COLLAPSE TAKES, IN PIXELS. Roughly the height of the large
 * title: the bar finishes arriving at the moment the thing it is replacing has
 * finished leaving, which is what makes it read as one movement rather than two.
 */
const OVER = 86;

/**
 * ⚠️ IT WRITES A CUSTOM PROPERTY, NOT REACT STATE. A scroll fires at frame rate
 * and re-rendering a whole screen on each one is how a collapse comes to stutter
 * exactly when somebody is watching it. One property on one element, coalesced
 * into an animation frame, and every rule that depends on it interpolates in CSS.
 *
 * ⚠️ AND IT FINDS ITS OWN SCROLLER. Presented over an app the page scrolls inside
 * the presentation; opened as a route it scrolls the window. A frame that assumed
 * one would silently do nothing in the other.
 */
function useCollapse(page: { current: HTMLDivElement | null }): void {
  useEffect(() => {
    const node = page.current;
    if (!node) return;
    const scroller = node.closest<HTMLElement>(".over-content");
    const target: HTMLElement | Window = scroller ?? window;
    let queued = 0;
    const read = () => {
      queued = 0;
      const top = scroller ? scroller.scrollTop : window.scrollY;
      node.style.setProperty("--scrolled", String(Math.min(1, Math.max(0, top / OVER))));
    };
    const onScroll = () => { queued ||= requestAnimationFrame(read); };
    read();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(queued);
    };
  }, [page]);
}

export interface ScreenProps {
  /** ⚠️ `dismiss` closes the presentation; `up` returns inside it. */
  readonly leave: "dismiss" | "up";
  readonly onLeave: () => void;
  /**
   * ⚠️ A WORD, NEVER A GRADIENT, AND ONLY WHERE A SCREEN ARRIVES. The light is
   * the arrival; on every screen inside one it stops being an arrival and becomes
   * a tint the product wears.
   */
  readonly sky?: Sky;
  /** The heading, large and in flow. */
  readonly title: ReactNode;
  /**
   * ⚠️ THE SAME WORDS AS THE TITLE, AS A STRING, because the bar's copy cannot be
   * derived from arbitrary markup — the account home's title is a lockup. Absent
   * means the bar carries no name, which is right for a screen whose title is a
   * mark rather than a sentence.
   */
  readonly name?: string;
  /**
   * ⚠️ ONE SENTENCE, AND ONLY WHERE THE TITLE IS NOT ENOUGH. "Your details" needs
   * none; "Sign-in methods" does, because the screen holds three unrelated things
   * and the sentence is what says they belong together.
   */
  readonly lede?: string;
  /**
   * ⚠️ THE ONE THING THE SCREEN IS FOR, IN THE BAR, opposite the way out. A screen
   * whose principal action is at the bottom of a list makes the person read the
   * list to find out they could have skipped it.
   */
  readonly action?: ReactNode;
  readonly children: ReactNode;
}

export function Screen({ leave, onLeave, sky, title, name, lede, action, children }: ScreenProps): ReactNode {
  const page = useRef<HTMLDivElement>(null);
  useCollapse(page);

  return (
    /* ⚠️ THE STAGGER IS ON THE FRAME, so every screen's sections arrive in
       sequence without anybody remembering to ask. */
    <div className="page stagger" ref={page}>
      {sky ? <div className="sky" data-sky={sky} aria-hidden="true" /> : null}
      <div className="topbar">
        <RoundButton label={leave === "dismiss" ? "Close" : "Back"} onClick={onLeave}>
          {leave === "dismiss" ? <Close /> : <Back />}
        </RoundButton>
        {name ? <span className="topbar-name" aria-hidden="true">{name}</span> : <span />}
        {action}
      </div>
      <header className="page-head">
        {title}
        {lede ? <p className="lede">{lede}</p> : null}
      </header>
      {children}
    </div>
  );
}

export interface SectionProps {
  /** Absent means the section has no sign over it, which is a decision. */
  readonly name?: string;
  readonly children: ReactNode;
}

/**
 * ⚠️ A SECTION HEADING IS A HEADING. Small grey uppercase is a label on a form;
 * the sections here are places, and a place is named at full ink, in the brand
 * face. The first group on a screen usually has no name at all — what it is is
 * obvious from where it is, and a sign over it would only repeat the title.
 */
export const Section = ({ name, children }: SectionProps): ReactNode => (
  <section>
    {name ? <h2>{name}</h2> : null}
    {children}
  </section>
);

/** The screen's own name, where the name is read rather than recognised. */
export const Title = ({ children, as: As = "h1" }: {
  readonly children: ReactNode;
  readonly as?: ElementType;
}): ReactNode => <As className="page-name">{children}</As>;
