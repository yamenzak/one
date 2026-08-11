/**
 * A SWITCH — a setting that is on or off, and takes effect on the spot.
 *
 * ⚠️ A SWITCH HAS NO SAVE BUTTON, WHICH IS THE WHOLE REASON IT IS A SWITCH. It is
 * for settings that apply the moment they are flipped and can be flipped back at
 * no cost. A switch whose change has to be confirmed, or that can fail, is a
 * checkbox in a form wearing the wrong clothes — and somebody will walk away from
 * that screen believing a thing that never happened.
 *
 * ⚠️ SO THE FAILURE PATH IS TO GO BACK. Where the write can fail the caller says
 * so by handing back a `Problem`, and the switch RETURNS to where it was rather
 * than sitting in a state the server never accepted. That is the one honest thing
 * an instant control can do about a failure, and it is why this owns the optimism
 * rather than each screen re-deriving it.
 *
 * ⚠️ AND THE ROW IS THE TARGET, NOT THE SWITCH. A 50-pixel control at the end of
 * a full-width row is the smallest thing on the screen; Radix gives the label and
 * the control one relationship, so pressing anywhere on the row flips it.
 */

import { useState, type ReactNode } from "react";
import * as Toggle from "@radix-ui/react-switch";
import type { Problem } from "@one/kernel";
import { feel } from "./feedback.js";

export interface SwitchRowProps {
  readonly title: string;
  readonly detail?: string;
  readonly icon?: ReactNode;
  readonly on: boolean;
  /** ⚠️ OFF BECAUSE IT CANNOT WORK HERE, which the detail line has to say. */
  readonly disabled?: boolean;
  /** ⚠️ RESOLVES TO A `Problem` OR TO NULL. A throw would leave it half-flipped. */
  readonly onChange: (next: boolean) => Promise<Problem | null> | void;
}

export function SwitchRow({ title, detail, icon, on, disabled, onChange }: SwitchRowProps): ReactNode {
  /* ⚠️ OPTIMISTIC, AND THAT IS NOT A SHORTCUT. A switch that waits for a round
     trip before moving is a switch that feels broken on a slow connection — the
     thumb has already left the screen. It moves, then it is corrected. */
  const [shown, setShown] = useState(on);
  const [busy, setBusy] = useState(false);

  const flip = async (next: boolean) => {
    setShown(next);
    feel("done");
    const answer = onChange(next);
    if (!answer) return;
    setBusy(true);
    const problem = await answer;
    setBusy(false);
    if (problem) { setShown(!next); feel("wrong"); }
  };

  return (
    <label className="item switch-row" data-off={disabled ? "" : undefined}>
      {icon ? <span className="well">{icon}</span> : null}
      <span className="item-body">
        <span className="item-title">{title}</span>
        {detail ? <span className="item-detail">{detail}</span> : null}
      </span>
      <Toggle.Root
        className="switch"
        checked={shown}
        disabled={busy || disabled === true}
        onCheckedChange={(next) => void flip(next)}
      >
        <Toggle.Thumb className="switch-thumb" />
      </Toggle.Root>
    </label>
  );
}
