/**
 * A SCREEN — the frame every surface in the platform is drawn in.
 *
 * ⚠️ THE WAY OUT IS A PROPERTY OF THE SCREEN'S PLACE, NOT A CHOICE. The root of a
 * presentation is DISMISSED, so it gets an ×; a screen one level inside is left
 * UPWARDS, so it gets an arrow. Two screens got that right by hand and the third
 * would have got it wrong — which is exactly the class of thing a frame exists to
 * decide once.
 *
 * ⚠️ THE TITLE IS PASSED IN RATHER THAN COMPOSED HERE, because a title is
 * sometimes a lockup, sometimes a name beside a face, and sometimes a question.
 * What the frame owns is where it sits and what surrounds it.
 *
 * ⚠️ AND THE ELEMENT THAT NAMES IT BELONGS TO WHOEVER PRESENTS IT. Standing alone
 * that is an `h1`; inside a dialog the title is what LABELS the dialog, so the
 * presenter passes its own and the name exists once rather than twice.
 */

import type { ElementType, ReactNode } from "react";
import { Back, Close } from "./icon.js";
import type { Sky } from "./sky.css.js";

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
  readonly title: ReactNode;
  readonly children: ReactNode;
}

export function Screen({ leave, onLeave, sky, title, children }: ScreenProps): ReactNode {
  return (
    /* ⚠️ THE STAGGER IS ON THE FRAME, so every screen's sections arrive in
       sequence without anybody remembering to ask. */
    <div className="page stagger">
      {sky ? <div className="sky" data-sky={sky} aria-hidden="true" /> : null}
      <header className="page-top">
        <button
          type="button"
          className="round-button press"
          aria-label={leave === "dismiss" ? "Close" : "Back"}
          onClick={onLeave}
        >
          {leave === "dismiss" ? <Close /> : <Back />}
        </button>
        {title}
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
