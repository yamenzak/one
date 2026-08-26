/**
 * PHOTOGRAPHS OF A THING, AND THE STEP THAT CHANGES THE REST OF THE FLOW.
 *
 * ⚠️ THIS IS THE ONE BLOCK A STEP CANNOT BE A FIELD FOR. Everything else a
 * registration asks is a name, a word out of a closed set, a number — `FieldSpec`
 * says all of it and the engine draws the control. A camera is not any of those:
 * it is a target somebody aims a phone at, a strip of what they have taken, and a
 * way to drop the one that came out blurred.
 *
 * ⚠️ AND IT ANSWERS, WHICH IS WHAT MAKES IT WORTH BEING A STEP AT ALL. It hands
 * the pictures back into the flow, the flow's declared `fills` runs on them, and
 * what comes back is eighteen answers the person then READS rather than types.
 * That is the whole argument for the shape: checking a paragraph is a job people
 * do, and confirming twenty fields is one they skip.
 *
 * ⚠️ THE PICTURES ARE DATA URLS RATHER THAN UPLOADS, AND THAT IS DELIBERATE. A
 * flow holds unsaved answers; uploading before the write means an object in the
 * bucket belonging to a product somebody abandoned on step three, which is
 * storage nobody can find and nobody is billed correctly for. The write puts them
 * where they belong, once, when there is a record for them to belong to.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import { PickFile, shrunk } from "./pick-file.js";
import { Stack } from "./arrange.js";
import { Nothing } from "./state.js";
import { glyphOf } from "../frame/shell.js";
import { TYPE } from "../tokens/type.js";
import { SPACE } from "../tokens/metrics.js";

/**
 * ⚠️ SIX, AND IT IS A REAL LIMIT RATHER THAN A ROUND NUMBER. A vision run is
 * charged per image; past about six of the same box the marginal picture tells a
 * model nothing it did not already have, and the person is paying for it. Front,
 * back, label, side, cap, and one of the thing out of its packaging is the set
 * that actually answers.
 */
export const MOST_SHOTS = 6;

/** ⚠️ Under four megabytes between them — a phone's own photo is well inside it. */
const MOST_BYTES = 4 * 1024 * 1024;

export interface ShotsProps {
  /** ⚠️ Data URLs, in the order they were taken. */
  readonly held: readonly string[];
  readonly onSet: (shots: readonly string[]) => void;
  /**
   * ⚠️ A RUN IS IN FLIGHT, AND THE CONTROL SAYS SO RATHER THAN GOING QUIET. The
   * gap between the last picture and the model's answer is seconds; a strip that
   * simply sits there through it is a screen somebody presses again.
   */
  readonly busy?: boolean;
}

export function Shots({ held, onSet, busy }: ShotsProps) {
  const left = Math.max(0, MOST_SHOTS - held.length);

  /*
    ⚠️ THE LATEST LIST, IN A REF, BECAUSE ONE PRESS FIRES `onPick` SEVERAL TIMES.
    `atOnce` lets somebody choose six adjacent photographs in one trip through the
    picker — six calls before React has re-rendered once — so a handler closing
    over the render's `held` appends each of them to the SAME empty list and five
    of the six are lost. Silently, and only when more than one was chosen, which
    is the case nobody tests by hand.
  */
  const latest = React.useRef(held);
  latest.current = held;

  return (
    <Stack space="tight">
      {/*
        ⚠️ THE STRIP COMES FIRST AND ONLY WHEN THERE IS ONE. Above the picker it
        is what somebody has; above nothing it is an empty rail that reads as a
        component that failed to load. `Nothing` is the vocabulary's own answer
        to "there is genuinely none yet" — see `state.tsx`.
      */}
      {held.length
        ? (
          <ul
            className={`flex ${SPACE.tight} overflow-x-auto`}
            aria-label={`${held.length} of ${MOST_SHOTS} pictures`}
          >
            {held.map((src, at) => (
              <li key={src.slice(-40)} className="relative shrink-0">
                <img
                  src={src}
                  alt={`Picture ${at + 1}`}
                  /* ⚠️ `cover`, SO SIX PICTURES ARE SIX EQUAL TILES. A strip of
                     mixed aspect ratios is a row that steps up and down, and the
                     thing being compared is what is IN them. */
                  className="size-20 rounded-xl object-cover bg-[var(--tier-card)]"
                />
                {/* ⚠️ THE WRAPPER IS POSITIONED AND THE BUTTON IS NOT (D7). A
                    control given layout classes of its own is a control restyled
                    at a call site — and the next screen that needs the same
                    affordance restyles it slightly differently. Where it SITS is
                    the surrounding markup's business.

                    ⚠️ ON THE PICTURE RATHER THAN UNDER THE STRIP, because the
                    thing being removed is one of six and a control that is not ON
                    it leaves the person to work out which it means. */}
                <span className="absolute end-1 top-1">
                  <Button
                    variant="tertiary"
                    size="sm"
                    isIconOnly
                    aria-label={`Remove picture ${at + 1}`}
                    onPress={() => { onSet(held.filter((_, i) => i !== at)); }}
                  >
                    {glyphOf("remove")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )
        : (
          <Nothing
            icon={glyphOf("scan")}
            says="No pictures yet"
            under="The label is the one that matters most"
          />
        )}

      {left
        ? (
          <PickFile
            accept={["image/*"]}
            most={MOST_BYTES}
            /* ⚠️ THE ONE FACT THE BUTTON DOES NOT CARRY. What to photograph is
               said once, on the step; a picker repeating it is the same sentence
               twice on one screen, and how many more it will take is the thing
               nobody can work out from anywhere else. */
            says={held.length ? `${left} more` : `Up to ${MOST_SHOTS}`}
            label={held.length ? "Add another" : "Take a picture"}
            atOnce={left}
            {...(busy ? { busy } : {})}
            /* ⚠️ SHRUNK, WHICH IS WHAT THE MANIFEST ALREADY CLAIMED HAPPENED.
               `product.see` refuses a batch over eight megabytes and its comment
               says "the screen shrinks each one before it asks" — and `shrunk`
               was exported, tested and called by NOTHING, so a phone's 4000-pixel
               photograph went whole and a portrait one went SIDEWAYS, because a
               canvas ignores the EXIF rotation tag unless asked. The per-file cap
               was tightened to compensate, which refused every photograph a
               modern phone takes; the cap was never the problem.

               ⚠️ AND IT IS AWAITED, SO SIX ARRIVE IN THE ORDER THEY WERE CHOSEN.
               See `PickFile.onPick`. */
            onPick={async (bytes, file) => {
              const next = [...latest.current, await shrunk(bytes, file.type)]
                .slice(0, MOST_SHOTS);
              latest.current = next;
              onSet(next);
            }}
          />
        )
        /* ⚠️ THE CEILING IS SAID, NOT ENFORCED IN SILENCE. A picker that simply
           disappears at six is a control somebody looks for and cannot find. */
        : <p className={TYPE.note}>That is {MOST_SHOTS}, which is plenty.</p>}

      {/*
        ⚠️ NO REFUSAL OF ITS OWN, AND THAT IS THE DECISION. A door's complaint
        about the pictures is a complaint about this STEP, and a step's refusal
        already has exactly one home — the sentence at its foot, which `Story`
        draws and which can carry somebody to a different step when the debt is
        there. Drawn here as well it would be the same sentence twice on one
        screen, and drawn here INSTEAD it would be a refusal in markup of its
        own, which is how the same failure comes to look different per screen.
        What this control still owns is what it can answer without the server:
        the wrong kind of file, one too large, an empty one — `PickFile` draws
        all three through `Trouble`.
      */}
    </Stack>
  );
}
