/**
 * HOW A THING ARRIVES PACKED — a case of boxes of sheets, a pallet of cases of
 * cans.
 *
 * ⚠️ EVERY LABEL HERE IS BUILT FROM WHAT IS ALREADY TYPED, AND THAT IS THE WHOLE
 * DESIGN OF THE CONTROL. The pair of fields on their own is meaningless — a
 * name and a number, twice — so the labels have to carry the sentence: "How many
 * screws in a box?", then "How many boxes in a case?". Change the unit from
 * screws to metres and every label in the list changes with it, because none of
 * them is a fixed string.
 *
 * ⚠️ IT USED TO SAY "The smallest one has a name" AND "The shelf is still
 * counted in box." Both were written from inside the model rather than from the
 * bench: the first is a sentence about the data structure, and the second names
 * the unit in the singular, unpluralised, in a place where nobody had asked
 * whether their totals were about to change. Neither told anybody what to type.
 *
 * ⚠️ `per` IS PER THE PACK BELOW, AND THE COPY HAS TO SAY SO. Somebody entering
 * this knows "a case holds 4 boxes" — they do not know, and must not have to
 * multiply out, that a case holds 400 screws. Read as single units the second
 * row is silently wrong by a factor of the first, and it renders perfectly.
 *
 * ⚠️ AND IT NEVER CHANGES WHAT THE TOTAL IS IN. Stock is always counted in the
 * one unit, so a pack is a named multiplier and nothing more: the way somebody
 * says "two cases" while holding two cases.
 */

import * as React from "react";
import {
  Bars, NoteRow, NumberInput, Row, Spacer, TextInput, Viewfinder,
} from "@engine/design";
import { Button } from "@heroui/react";
import { some } from "../saying.js";

/** One pack. Mirrors `packing.ts`'s `Level`, which the worker owns. */
export interface Rung {
  readonly name: string;
  readonly per: number;
}

/**
 * ⚠️ THE SAME CAP THE DOOR ENFORCES. Pallet ← layer ← case ← inner ← sheet ←
 * tablet is five and is the deepest real packaging anybody has described; a
 * screen that let somebody type a seventh would be collecting a row the write
 * then refuses.
 */
export const MOST_RUNGS = 6;

export interface LadderProps {
  /** What one is counted in — the floor every pack multiplies up from. */
  readonly unit: string;
  readonly levels: readonly Rung[];
  readonly onChange: (next: readonly Rung[]) => void;
  /**
   * THE BARCODE ON THIS PACK, IF ONE HAS BEEN READ.
   *
   * ⚠️ THE CODE IS SCANNED WHERE THE PACK IS DESCRIBED, and that removes the one
   * multiplication the flow used to ask for. Scanned on the barcode step instead,
   * the question is "how many units does this cover" and somebody holding a case
   * of 4 boxes of 10 has to answer 40 — a sum they can get wrong, about a fact
   * the ladder beside it already states. Here the answer is the rung.
   *
   * ⚠️ AND IT IS STILL ONE LIST OF CODES. This hands the value up; the screen
   * puts it in the same place a scan on the barcode step goes, with the
   * multiplier derived rather than typed. Two ways in, one store, no second
   * answer to "what does this code mean".
   */
  readonly codeAt?: (at: number) => string | null;
  readonly onCode?: (at: number, code: string) => void;
  readonly onUncode?: (at: number) => void;
}

/**
 * WHAT IS INSIDE THE PACK AT THIS POSITION, PLURAL — the thing `per` counts.
 *
 * ⚠️ PLURAL ALWAYS, because `per` is at least two. "How many screw in a box" is
 * the label reading as a typo on every list anybody enters, and the fix is the
 * rule the reader already uses rather than a second one written here.
 *
 * ⚠️ AND IT FALLS BACK TO THE UNIT AT THE BOTTOM. The first pack holds units;
 * every one after that holds the pack below it.
 */
export const inside = (
  levels: readonly Rung[], at: number, unit: string,
): string => {
  const below = at > 0 ? levels[at - 1]?.name.trim() : "";
  return some(below || unit);
};

/**
 * ⚠️ A SUGGESTION THAT CLIMBS, so the placeholders read as a real example of the
 * thing being described rather than as the same two words repeated.
 */
const LIKELY = ["box", "case", "pallet", "container", "load", "shipment"] as const;

export function Ladder({ unit, levels, onChange, codeAt, onCode, onUncode }: LadderProps) {
  const set = (at: number, of: Partial<Rung>) => {
    onChange(levels.map((rung, i) => (i === at ? { ...rung, ...of } : rung)));
  };

  return (
    <>
      {levels.map((rung, at) => {
        const named = rung.name.trim();
        const holds = inside(levels, at, unit);
        return (
          /* ⚠️ KEYED ON POSITION, DELIBERATELY. The name is what somebody is
             typing, so keying on it remounts the field on every keystroke and
             the caret jumps to the end — the bug that makes a form feel broken
             without ever failing. */
          <React.Fragment key={at}>
            <TextInput
              /* ⚠️ THE LABEL NAMES WHAT IS INSIDE, so the question is answerable
                 without looking anywhere else on the screen. */
              label={at === 0
                ? `What are the ${holds} packed in?`
                : `And what holds the ${holds}?`}
              value={rung.name}
              onChange={(name) => { set(at, { name }); }}
              placeholder={LIKELY[Math.min(at, LIKELY.length - 1)]}
              name={`pack-${at}`}
            />
            <NumberInput
              /* ⚠️ THE NUMBER IS THE PACK BELOW, NEVER THE UNIT — "how many
                 boxes in a case", not "how many screws", because the second is a
                 multiplication the person should not be doing. */
              label={named
                ? `How many ${holds} in one ${named}?`
                : `How many ${holds} in one?`}
              value={rung.per}
              onChange={(per) => { set(at, { per }); }}
              min={2}
            />
            {/*
              ⚠️ OFFERED ONLY ONCE THE PACK HAS A NAME. "Scan the barcode on it"
              over two empty fields is a control for a thing that does not exist
              yet, and what it would attach the code to is undecided.
            */}
            {onCode && named
              ? (codeAt?.(at)
                ? (
                  <Row space="tight">
                    <Bars of={codeAt(at) ?? ""} onScreen />
                    <span className="tabular-nums truncate">{codeAt(at)}</span>
                    <Spacer />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove the barcode on the ${named}`}
                      onPress={() => { onUncode?.(at); }}
                    >
                      Remove
                    </Button>
                  </Row>
                )
                : (
                  <Viewfinder
                    says={`Hold up the barcode on the ${named}`}
                    typed={{
                      label: `Or type the number on the ${named}`,
                      placeholder: "The digits printed under the bars",
                    }}
                    onRead={(code) => { onCode(at, code); }}
                  />
                ))
              : null}

            <Row space="tight">
              <Spacer />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${named || "this pack"}`}
                /* ⚠️ EVERYTHING ABOVE IT GOES TOO. This is a chain — removing a
                   pack from the middle would leave the one above counting a
                   thing that no longer exists, and its number would silently
                   start meaning something else. */
                onPress={() => { onChange(levels.slice(0, at)); }}
              >
                Remove
              </Button>
            </Row>
          </React.Fragment>
        );
      })}

      {levels.length < MOST_RUNGS
        ? (
          <Button
            variant="secondary"
            onPress={() => { onChange([...levels, { name: "", per: 2 }]); }}
          >
            {levels.length ? "And those come in something bigger" : "Add the pack"}
          </Button>
        )
        : null}

      {/* ⚠️ THE FEAR THIS ANSWERS IS REAL AND IT IS ASKED ONCE. Somebody
          describing packaging wonders whether the numbers on their shelves are
          about to change into something else. They are not. */}
      {levels.length
        ? (
          <NoteRow>
            {`Your totals stay in ${some(unit)}. Packs only save you typing when things arrive`}
          </NoteRow>
        )
        : null}
    </>
  );
}
