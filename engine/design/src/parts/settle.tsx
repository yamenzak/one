/**
 * A CONTROL THAT ANSWERS THE PRESS, AND PUTS ITSELF BACK IF THE SERVER REFUSES.
 *
 * ⚠️ A CONTROL DRAWN FROM THE ROW IT IS ABOUT TO CHANGE DOES NOT MOVE UNTIL THE
 * ROUND TRIP LANDS. That is the whole of "the switch doesn't work": the press
 * registered, the write succeeded, and for half a second — longer on a phone on
 * a train — the switch sat exactly where it was. A person who cannot see their
 * own press land presses again, and the second press is the one that undoes the
 * first.
 *
 * ⚠️ AND THE ALTERNATIVE IS WORSE, WHICH IS WHY THIS IS A COMPONENT RATHER THAN
 * A HABIT. `setState(next); await write().catch(() => undefined)` moves
 * immediately and then leaves the control showing a value the server refused —
 * a lie that survives until somebody reloads. Rolling back to the value that was
 * there BEFORE the press is what makes optimism honest.
 *
 * ⚠️ THE REFETCH IS NOT THE FEEDBACK. Answering a toggle by reloading the whole
 * screen replaces the list under the person's thumb, and on a long one the
 * scroll goes with it — so the row they just touched is somewhere off-screen and
 * the press appears to have done nothing. `onDone` is for keeping the rest of
 * the page honest, and it fires AFTER the control has already moved.
 */

import * as React from "react";
import { Label, Switch } from "@heroui/react";
import { notice } from "../frame/overlay.js";

export interface SettledProps {
  readonly value: boolean;
  /** ⚠️ Answers whether it landed. A `false` is a rollback, never a shrug. */
  readonly onSet: (next: boolean) => Promise<boolean>;
  readonly isDisabled?: boolean;
  /** The word beside it, which is the state rather than the act. */
  readonly says?: (on: boolean) => string;
}

/**
 * ⚠️ THE WORD IS NOT DECORATION — `Switch.Content` IS WHERE THE INPUT LIVES.
 * HeroUI renders the control's hidden `<input type="checkbox" role="switch">`
 * inside its content slot, so a switch written without one is two styled spans:
 * it draws correctly, it is in the markup, it has no input, and no press of it
 * does anything. Every test that renders a screen to a string still passed,
 * because what was missing is exactly the thing markup assertions do not look
 * for.
 *
 * ⚠️ SO THERE IS A DEFAULT RATHER THAN AN OPTIONAL SLOT. A caller who wants no
 * word cannot have one — a switch with no accessible name is unusable to anybody
 * on a screen reader anyway, so the two requirements are the same requirement.
 */
const STATE = (on: boolean): string => (on ? "On" : "Off");

/**
 * ⚠️ THE SERVER'S ANSWER WINS ONCE IT ARRIVES. `value` changing under a settled
 * control is a re-read landing, an operator on another tab, or a rollback — and
 * in every one of those the row is right and the local memory is stale.
 */
export function SettledSwitch({ value, onSet, isDisabled, says }: SettledProps) {
  const [shown, setShown] = React.useState(value);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setShown(value); }, [value]);

  const flip = async (next: boolean) => {
    const before = shown;
    setShown(next);
    setBusy(true);
    try {
      if (!await onSet(next)) setShown(before);
    } catch {
      /* ⚠️ A THROW IS A ROLLBACK TOO. A caller that rejects rather than
         answering `false` is a caller whose control would otherwise keep the
         value nothing stored. */
      setShown(before);
      notice.fail("That did not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Switch isSelected={shown} isDisabled={isDisabled || busy} onChange={(on) => void flip(on)}>
      <Switch.Control><Switch.Thumb /></Switch.Control>
      {/* ⚠️ ALWAYS RENDERED — it carries the input. See `STATE`. */}
      <Switch.Content><Label>{(says ?? STATE)(shown)}</Label></Switch.Content>
    </Switch>
  );
}
