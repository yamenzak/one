/**
 * A BROWSER PERMISSION, AS A ROW SOMEBODY CAN READ.
 *
 * ⚠️ A PERMISSION IS NOT A BOOLEAN AND A SWITCH DRAWN AS ONE IS THE BUG. There
 * are five honest states — this browser cannot do it, the person has not been
 * asked, they said no, they said yes, and we are mid-ask — and four of them are
 * "off". Rendered as a plain `ToggleRow`, all four look identical: somebody who
 * blocked notifications last month flicks the switch, the browser answers
 * instantly with the same refusal, the switch snaps back, and nothing on the
 * screen ever says why. That is the single most reported defect in every
 * notification setting on the web.
 *
 * ⚠️ AND `denied` IS THE ONE THAT NEEDS WORDS RATHER THAN A CONTROL. A browser
 * will not re-prompt after a refusal — by design, and no API can — so the only
 * true thing to show is where the person changes it, which is in the browser
 * rather than in this product. A disabled switch with no sentence beside it is
 * an accusation somebody cannot answer.
 *
 * ⚠️ IT IS HERE RATHER THAN IN A SCREEN BECAUSE THE SHAPE IS NOT ABOUT PUSH. A
 * camera, a microphone, a location and a clipboard are the same five states with
 * the same four wrong ways to draw them, and the second surface that needed one
 * is where the copy starts to disagree with the first.
 */

import { Spinner } from "@heroui/react";
import { NoteRow, ToggleRow } from "./surfaces.js";

/**
 * ⚠️ `asking` IS A STATE RATHER THAN A SPINNER THE CALLER DRAWS, because the
 * browser's own prompt is modal and can sit there for as long as somebody
 * ignores it. Without it the switch shows the OLD value under a dialogue asking
 * about the new one.
 */
export type Permission = "unavailable" | "off" | "asking" | "on" | "denied";

export interface PermissionRowProps {
  readonly label: string;
  /** ⚠️ ONE LINE, AND WHAT IT IS FOR — never how it works. */
  readonly under?: string;
  readonly icon?: React.ReactNode;
  readonly state: Permission;
  /**
   * ⚠️ ASKED ONLY WHERE ASKING CAN WORK. `denied` and `unavailable` render no
   * control at all, so this is never called into a refusal the person cannot
   * undo from here.
   */
  readonly onChange: (next: boolean) => void;
  /**
   * Where this browser hides the setting, in the person's words. Shown only when
   * they have already said no.
   *
   * ⚠️ IT NAMES THE PLACE, NOT THE PRODUCT. "In your browser's site settings" is
   * true everywhere; "Chrome → Settings → Privacy" is wrong for most readers and
   * unfalsifiable for the rest.
   */
  readonly whereToChange?: string;
  /** Why this browser cannot do it at all — one sentence, no apology. */
  readonly whyUnavailable?: string;
}

export function PermissionRow({
  label, under, icon, state, onChange, whereToChange, whyUnavailable,
}: PermissionRowProps) {
  if (state === "unavailable") {
    /* ⚠️ NO CONTROL AND NO DISABLED SWITCH. A greyed switch is a promise that
       something could turn it on; there is nothing, and the row says so. */
    return (
      <NoteRow icon={icon}>
        {whyUnavailable ?? `${label} is not something this browser can do`}
      </NoteRow>
    );
  }

  return (
    <>
      <ToggleRow
        icon={state === "asking" ? <Spinner size="sm" /> : icon}
        label={label}
        under={under}
        value={state === "on"}
        /* ⚠️ Held during the ask AND after a refusal — the first because the
           answer is not in yet, the second because pressing it does nothing a
           browser will honour. */
        isDisabled={state === "asking" || state === "denied"}
        onChange={onChange}
      />
      {state === "denied" ? (
        /* ⚠️ UNDER THE ROW IT EXPLAINS, never in a toast — the sentence is about
           this control, and it has to be beside the thing that is not working. */
        <NoteRow>
          {whereToChange
            ?? "You said no to this once, so the browser will not ask again — turn it back on in your browser's site settings"}
        </NoteRow>
      ) : null}
    </>
  );
}
