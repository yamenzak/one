/**
 * A STANDING MESSAGE IN THE PAGE — the block every product has and this one did
 * not.
 *
 * ⚠️ `notice` IS A TOAST AND A TOAST IS THE WRONG SHAPE FOR A STATE. A toast
 * says what just happened and then goes; "your trial ends on Friday", "two
 * counts are half done", "this workspace is read-only while the bill is settled"
 * are all TRUE UNTIL SOMETHING CHANGES, and a message that leaves after four
 * seconds is a message nobody read. Every screen that needed one built it out of
 * a `Group` and a `NoteRow` by hand, which is four decisions per site — where
 * the mark goes, how loud the words are, whether the action is a button or a
 * row, whether it can be dismissed — and they came out differently every time.
 *
 * ⚠️ THE TONE IS INK, NEVER A FILL, AND THAT IS THE SAME RULE THE REST OF THE
 * SYSTEM KEEPS. A tinted card paints every word inside it, which makes a
 * sentence about one fact look like a screen in a state; what carries the state
 * here is the MARK and the chip beside the heading, and both of them are
 * `data-ink` (see `theme.ts` on why the ink value is not the fill value). A
 * banner therefore sits on the ordinary surface tier and reads as part of the
 * page rather than as something stuck on top of it.
 *
 * ⚠️ AND DISMISSING IS THE CALLER'S, WHICH IS WHY THERE IS NO STATE HERE. A
 * banner that hides itself is a banner whose absence means nothing — the next
 * mount brings it back, or it does not, depending on where the component
 * happened to be remounted. Whoever knows what the message is about knows
 * whether it should come back.
 */

import * as React from "react";
import { Button, Chip } from "@heroui/react";
import { X } from "lucide-react";
import type { Tone } from "@engine/kernel";
import { TYPE } from "../tokens/type.js";
import { ICON, ROW, SPACE } from "../tokens/metrics.js";
import { Group } from "./surfaces.js";
import { Hint } from "./beside.js";

export interface BannerProps {
  /**
   * ⚠️ WHAT IS TRUE, IN A SENTENCE SOMEBODY CAN ACT ON. Not a category —
   * "Two counts are half done", never "Counts".
   */
  readonly label: string;
  /** ⚠️ One line of why it matters, or what happens next. */
  readonly says?: React.ReactNode;
  /**
   * ⚠️ THE MARK, AND IT IS THE ONE THING THAT CARRIES THE TONE AT A GLANCE.
   * A caller passes `glyphOf(…)`; the ink is `Group`'s.
   */
  readonly icon?: React.ReactNode;
  readonly tone?: Tone;
  /**
   * ⚠️ THE STATE IN A WORD, BESIDE THE HEADING — "Ending", "Overdue", "Paused".
   * Absent is the common case: most banners say one thing and the sentence is
   * the whole of it.
   */
  readonly state?: string;
  /**
   * ⚠️ ONE ACTION, AND ONE ONLY. Two buttons on a standing message is a decision
   * being asked for, which is a `Confirm` or a screen — not a line somebody is
   * reading on the way past.
   */
  readonly does?: { readonly label: string; readonly onDo: () => void };
  /** ⚠️ Present means dismissible. See the header: the caller owns whether it returns. */
  readonly onClose?: () => void;
}

/**
 * ⚠️ `info` IS `accent` ON A CHIP, AND THE LIBRARY IS RIGHT. There is no
 * informational HUE in this palette — the informational colour IS the brand's,
 * which is what `[data-ink="info"]` resolves to as well. Two names, one value,
 * stated once here.
 */
const CHIP_COLOUR = {
  neutral: "default", info: "accent", success: "success",
  warning: "warning", danger: "danger",
} as const satisfies Record<Tone, string>;

export function Banner({ label, says, icon, tone = "neutral", state, does, onClose }: BannerProps) {
  return (
    /*
      ⚠️ A `Group` WITH NO LABEL, AND ONE ROW IN IT — which is not the shape the
      first draft had. `Group` puts its heading block ABOVE the card and its
      children inside, so a banner built out of `label` and `under` came out as
      two lines floating over a card holding nothing but a button, with the
      surface's whole padding between the words and the action. A banner is ONE
      object: the mark, the words and what to do about it, on one surface.
    */
    <Group {...(does === undefined ? {} : {
      does: <Button variant="secondary" onPress={does.onDo}>{does.label}</Button>,
    })}>
      {/*
        ⚠️ ITEMS-START, BECAUSE THE MARK BELONGS TO THE FIRST LINE. Centred
        against a two-line message the glyph floats between them and reads as
        decoration; against the heading it reads as the heading's own.
      */}
      <div data-row className={`flex items-start ${ROW.gap} ${ROW.pad}`}>
        {icon ? (
          <span
            aria-hidden="true"
            className="shrink-0"
            style={{ ["--icon" as string]: `${ICON.row}px` }}
            {...(tone === "neutral" ? {} : { "data-ink": tone })}
          >
            {icon}
          </span>
        ) : null}
        <div className={`flex min-w-0 grow flex-col ${SPACE.hair}`}>
          {/* ⚠️ THE STATE IS `shrink-0` ON THE HEADING'S OWN LINE, which is what
              `Group`'s `aside` could not be: an aside WRAPS by design — right
              for a five-segment period picker, and wrong for a one-word chip,
              which then lands under the description and reads as a third
              element rather than as the heading's own. */}
          <div className={`flex flex-wrap items-center ${SPACE.tight}`}>
            <span className={TYPE.group}>{label}</span>
            {state ? (
              <Chip color={CHIP_COLOUR[tone]} variant="soft">
                <Chip.Label>{state}</Chip.Label>
              </Chip>
            ) : null}
          </div>
          {says ? <p className={TYPE.note}>{says}</p> : null}
        </div>
        {onClose ? (
          <span className="shrink-0">
            <Hint says="Dismiss">
              <Button variant="tertiary" size="sm" isIconOnly aria-label="Dismiss" onPress={onClose}>
                <X />
              </Button>
            </Hint>
          </span>
        ) : null}
      </div>
    </Group>
  );
}
