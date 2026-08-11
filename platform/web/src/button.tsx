/**
 * BUTTONS — three tones, and the tone is what the button IS rather than how it
 * looks.
 *
 * ⚠️ IT WAS EXTRACTED AT THE SECOND USE, WHICH IS THIS SCREEN. Until now there
 * was exactly one button shape — the action at the foot of a sheet — and a class
 * anybody could apply by hand. Sign-in methods brought three at once: an "Add
 * passkey" that leads, a "Remove" that sits quietly on a row it must not
 * dominate, and the existing save. Three is a set; one was a rule waiting to be
 * broken by whoever forgot the class.
 *
 * ⚠️ `quiet` IS NOT `alarm`, EVEN WHEN IT DELETES SOMETHING. Removing a passkey
 * and signing a device out are both destructive and both belong on a row with
 * something more important on it — the thing being removed. A red button per row
 * makes a list of ordinary facts look like a list of problems, and the one that
 * really is dangerous stops standing out. Destruction is confirmed, not coloured.
 *
 * ⚠️ AND EVERY ONE OF THEM PRESSES. That was a class anybody had to remember
 * (`.press`), which is invisible when forgotten — the button simply feels dead,
 * on one screen, and nobody can say why. It is not optional here.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonTone =
  /** It leads. One per surface: the thing the person came to do. */
  | "loud"
  /** It sits on a row beside something more important. */
  | "quiet";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  readonly tone: ButtonTone;
  /** A symbol before the words. Never instead of them — this is not a toolbar. */
  readonly icon?: ReactNode;
  /**
   * ⚠️ A SYMBOL AFTER THE WORDS, AND IT IS ITS OWN CHILD RATHER THAN PART OF THE
   * LABEL. Passed in with the text it landed INSIDE the label, which sets
   * `line-height: 1` and no gap — so a finished save read as "Done✓", the tick
   * touching the word. What comes after the words is a separate thing and is
   * spaced like one.
   */
  readonly sign?: ReactNode;
  /** ⚠️ FULL WIDTH IS A PLACE, NOT A SIZE: it means the button owns the row. */
  readonly wide?: boolean;
  readonly children: ReactNode;
}

export function Button({ tone, icon, sign, wide, children, ...rest }: ButtonProps): ReactNode {
  return (
    <button
      type="button"
      className="button press"
      data-tone={tone}
      data-wide={wide ? "" : undefined}
      {...rest}
    >
      {icon}
      <span className="button-label">{children}</span>
      {sign}
    </button>
  );
}

/**
 * A control that is only a symbol — the ways out of a screen, and the camera on a
 * photograph.
 *
 * ⚠️ IT ALWAYS CARRIES A LABEL, because it has no words of its own. A round
 * button with no accessible name is a button that reads as "button".
 */
export const RoundButton = ({ label, children, ...rest }: {
  readonly label: string;
  readonly children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">): ReactNode => (
  <button type="button" className="round-button press" aria-label={label} {...rest}>
    {children}
  </button>
);
