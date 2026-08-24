/**
 * HOW A THING IS PACKAGED — the editor for the rungs between a carton and a
 * tablet.
 *
 * ⚠️ IT IS ITS OWN FILE BECAUSE IT IS A LIST INSIDE A FORM, which is the shape
 * that makes a form file long. Registering a product is already photographs, a
 * name, tags, several barcodes, how it is counted, how it keeps and who sells
 * it; a repeating pair of fields inline there is fifty lines nobody can see the
 * end of.
 *
 * ⚠️ `per` IS PER THE RUNG BELOW, AND THE COPY HAS TO SAY SO. Somebody entering
 * a ladder knows "a box holds 3 sheets" — they do not know, and must not have to
 * multiply out, that a box holds 30 tablets. Read as base units the second rung
 * is silently wrong by a factor of the first, and it renders perfectly.
 *
 * ⚠️ AND IT NEVER CHANGES WHAT THE SHELF IS COUNTED IN. Stock is always in the
 * base unit, so a rung is a named multiplier and nothing more: the way somebody
 * says "two boxes" while holding two boxes, and the way a number reads back in
 * the words they think in.
 */

import * as React from "react";
import {
  Group, NoteRow, NumberInput, Row, Spacer, TextInput,
} from "@engine/design";
import { Button } from "@heroui/react";
/* ⚠️ ONE PLURAL RULE FOR THE WHOLE PRODUCT — see `packing.ts`. */
import { plural } from "../packing.js";

/** One rung. Mirrors `packing.ts`'s `Level`, which the worker owns. */
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
  /** What one is counted in — the floor every rung multiplies up from. */
  readonly unit: string;
  readonly levels: readonly Rung[];
  readonly onChange: (next: readonly Rung[]) => void;
}

/**
 * WHAT THE RUNG BELOW THIS ONE IS CALLED, which is what `per` counts.
 *
 * ⚠️ PLURAL, ALWAYS, because `per` is at least two. "How many sheet in a box" is
 * the label reading as a typo on every ladder anybody enters, and the fix is the
 * rule the reader already uses rather than a second one written here.
 */
export const under = (
  levels: readonly Rung[], at: number, unit: string,
): string => {
  const below = at > 0 ? levels[at - 1]?.name.trim() : "";
  return plural(below || unit.trim() || "units", 2);
};

export function Ladder({ unit, levels, onChange }: LadderProps) {
  const set = (at: number, of: Partial<Rung>) => {
    onChange(levels.map((one, i) => (i === at ? { ...one, ...of } : one)));
  };

  return (
    <Group label="How it is packaged">
      {levels.map((rung, at) => (
        /* ⚠️ KEYED ON POSITION, DELIBERATELY. The name is what somebody is
           typing, so keying on it remounts the field on every keystroke and the
           caret jumps to the end — which is the bug that makes a form feel
           broken without ever failing. */
        <React.Fragment key={at}>
          <TextInput
            label={at === 0 ? "The smallest one has a name" : "And then"}
            value={rung.name}
            onChange={(name) => { set(at, { name }); }}
            placeholder={at === 0 ? "sheet" : "box"}
            name={`rung-${at}`}
          />
          <NumberInput
            /* ⚠️ THE LABEL NAMES THE RUNG BELOW, which is the whole ergonomics
               of this field — "How many sheets in a box", never "how many
               tablets", because the second is a multiplication the person should
               not be doing. */
            label={`How many ${under(levels, at, unit)} in ${
              rung.name.trim() ? `a ${rung.name.trim()}` : "one"}`}
            value={rung.per}
            onChange={(per) => { set(at, { per }); }}
            min={2}
          />
          <Row space="tight">
            <Spacer />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove ${rung.name.trim() || "this level"}`}
              /* ⚠️ EVERYTHING ABOVE IT GOES TOO. A ladder is a chain — removing
                 the middle rung would leave the one above counting a thing that
                 no longer exists, and its `per` would silently start meaning
                 something else. */
              onPress={() => { onChange(levels.slice(0, at)); }}
            >
              Remove
            </Button>
          </Row>
        </React.Fragment>
      ))}

      {levels.length < MOST_RUNGS
        ? (
          <Button
            variant="secondary"
            onPress={() => { onChange([...levels, { name: "", per: 2 }]); }}
          >
            {levels.length ? "Add another level" : "It comes in packs"}
          </Button>
        )
        : null}

      {/* ⚠️ SAID ONCE, UNDER THE CONTROL, AND ONLY WHERE IT IS RELEVANT. The
          fear this answers is real — somebody adding a ladder wonders whether
          their shelf numbers are about to change — and it is a sentence rather
          than a paragraph. */}
      <NoteRow>
        {levels.length
          ? `The shelf is still counted in ${unit.trim() || "single units"}. This is only how you say it.`
          : "A box of sheets of tablets, a case of packs of cans — add one if it comes that way."}
      </NoteRow>
    </Group>
  );
}
