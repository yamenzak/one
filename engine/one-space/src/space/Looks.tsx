/**
 * HOW IT LOOKS AND HOW MUCH IT MOVES — on THIS device.
 *
 * ⚠️ THE DEVICE, NOT THE PERSON, WHICH IS WHY NOTHING HERE IS SENT ANYWHERE. The
 * same person wants a different answer on a phone in bright sun and on a desktop
 * at night, and a preference stored against the account would carry one of those
 * to the other. Both settings live in this browser's own storage — the same
 * place the theme has always been kept, now with a control over it.
 *
 * ⚠️ AND BOTH WERE UNREACHABLE UNTIL THIS SCREEN. `applyAppearance` runs at boot
 * and reads a value nothing could write; every keyframe in the design system
 * answers `data-reduce-motion` and nothing set it. A setting a person cannot
 * reach is a setting that does not exist, however carefully it is honoured.
 *
 * ⚠️ THE MOTION CONTROL SAYS WHAT `Automatic` DECIDED. Still is the answer on
 * almost every device, so a person who sees a still world and a control saying
 * "Automatic" learns nothing about why — and the reason is a fact about their
 * hardware, which they can overrule and cannot guess.
 */

import * as React from "react";
import { useState } from "react";
import {
  Choice, Group, NoteRow, Screen,
  applyAppearance, applyLiveliness, earned, livelinessStored, motionFor, reading,
  rememberLiveliness, remember as rememberAppearance, stored as storedAppearance,
  type Appearance, type Liveliness,
} from "@engine/design";

const THEMES = [
  { id: "system", label: "Same as this device" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/*
  ⚠️ FOUR, AND THEY ARE ORDERED BY HOW MUCH MOVES RATHER THAN BY WHICH IS THE
  DEFAULT. A list whose first entry is "Automatic" and whose rest is a scale
  reads as one control; sorting the default to the top of a scale makes the scale
  unreadable, which is the whole thing somebody is choosing along.

  ⚠️ AND EACH ONE SAYS WHAT MOVES, NOT HOW MUCH. "Full" and "Calm" are a volume
  knob nobody can predict the effect of; "Everything moves" and "Screens only"
  are the two things that actually differ, which is the world and the screens.
*/
const MOTION = [
  { id: "auto", label: "Automatic" },
  { id: "full", label: "Everything moves" },
  { id: "calm", label: "Screens only" },
  { id: "none", label: "Nothing moves" },
];

export function Looks() {
  const [theme, setTheme] = useState<Appearance>(() => storedAppearance());
  const [motion, setMotion] = useState<Liveliness>(() => livelinessStored());

  /* ⚠️ READ ON EVERY RENDER, NOT ONCE. The sentence under the control is about
     the device as it is now — a laptop that gains a mouse, a phone that turns on
     data saving — and a value captured at mount would go on describing the
     device this screen was opened on. */
  const device = reading();
  const now = motionFor(motion, device);

  const pickTheme = (next: Appearance) => {
    setTheme(next);
    rememberAppearance(next);
    /* ⚠️ APPLIED BEFORE IT IS ANNOUNCED, because the screen IS the confirmation.
       A toast saying "Saved" over a page that did not change is the shape
       `useConfirmedState` exists to refuse. */
    applyAppearance(next);
  };

  const pickMotion = (next: Liveliness) => {
    setMotion(next);
    rememberLiveliness(next);
    /* ⚠️ THE STAMP IS WHAT EVERY OTHER SCREEN READS. `applyLiveliness` writes
       `data-reduce-motion`, which the design system's own rules already answer,
       and `useMotion` watches — so a world three screens away goes still without
       anything here knowing it exists. */
    applyLiveliness(next);
  };

  /*
    ⚠️ THE REASON, IN THE PERSON'S TERMS AND NOT THE ENGINE'S. `saveData` and
    `deviceMemory` are facts about a browser; "this device asked for less data"
    is a fact about them, and it is the one that tells them what to change.
  */
  const because = device.asked
    ? "Your device asks for reduced motion, so nothing moves. That setting wins over this one."
    : device.saveData
      ? "Your device is saving data, so the world is still."
      : !device.fine
        ? "This looks like a touch device, so the world is still. A moving background "
          + "repaints the whole screen continuously, which is what makes scrolling stutter."
        : earned(device)
          ? "This device can afford a moving world, so it has one."
          : "This device reports limited memory, so the world is still.";

  return (
    /* ⚠️ `settings` — every control here applies itself, so the shape refuses a
       primary action outright. */
    <Screen shape="settings">
      <Group label="Appearance" under="Kept on this device, not on your account">
        <Choice
          label="Theme"
          value={theme}
          options={THEMES}
          onChange={(next) => pickTheme(next as Appearance)}
        />
      </Group>

      <Group
        label="Motion"
        under="What may move, and how much of it"
      >
        <Choice
          label="How much moves"
          /* ⚠️ THE HELP NAMES THE TWO KINDS, because the difference is the whole
             control. Screens moving is how somebody knows where they came from;
             the world moving is decoration that costs a repaint a frame. */
          help="Screens arriving and travelling always move unless you turn motion off. The world behind them is the expensive half."
          value={motion}
          options={MOTION}
          onChange={(next) => pickMotion(next as Liveliness)}
        />
        {motion === "auto" ? <NoteRow>{because}</NoteRow> : null}
        {/* ⚠️ SAID WHEN THE DEVICE OVERRULES THE CHOICE, and only then. Somebody
            who picked `Full` on a phone whose system asks for reduced motion has
            a control that appears to do nothing, and the reason is two settings
            away in an operating system. */}
        {motion !== "auto" && device.asked && !now.essential
          ? (
            <NoteRow>
              Your device asks for reduced motion, which wins over this.
            </NoteRow>
          )
          : null}
      </Group>
    </Screen>
  );
}
