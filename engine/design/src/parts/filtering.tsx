/**
 * NARROWING A LIST — the row of pills above it, and the sentence that says what
 * is left.
 *
 * ⚠️ EVERY LIST SCREEN IN EVERY PRODUCT HAS THIS AND NONE OF THEM HAD IT HERE.
 * `Segmented` is a choice worn on the surface — one of a few, always exactly
 * one, and it is the wrong control the moment a filter can be OFF or two can be
 * on at once. So each screen built the row itself out of chips or buttons, and
 * measured across the two apps they came out at three different heights, two
 * different gaps, and with "All" meaning "no filter" on one and a real value on
 * another.
 *
 * ⚠️ "ALL" IS ABSENCE, NOT AN OPTION, AND THAT IS THE DECISION THIS FILE MAKES.
 * A pill for "everything" is a value somebody has to select to undo a filter,
 * and it competes with the real ones for the same row. Nothing chosen IS
 * everything; what undoes a choice is pressing it again, and what undoes several
 * is the one control that appears when there are several.
 *
 * ⚠️ AND IT WRAPS RATHER THAN SCROLLING, WHICH IS `Cluster`'S OWN ARGUMENT AND
 * NOT A NEW ONE. A sideways scroller hides the filters past the edge behind an
 * affordance a phone does not draw, and a filter nobody can see is a filter
 * nobody uses — which is worse than a header one line taller. The row is a
 * `Cluster` for exactly this: an unknown number of unequal small things, gapped
 * the same in both directions so the wrapped line does not sit tighter than the
 * items in it.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import { TYPE } from "../tokens/type.js";
import { Cluster } from "./arrange.js";
import { useFigures } from "./said.js";

export interface Filter {
  readonly id: string;
  readonly label: string;
  /** ⚠️ How many this filter would leave — absent where counting costs a query. */
  readonly count?: number;
}

export interface FiltersProps {
  readonly of: readonly Filter[];
  /** ⚠️ Ids, because more than one may be on. Empty is everything — see the header. */
  readonly chosen: readonly string[];
  readonly onChoose: (chosen: readonly string[]) => void;
  /**
   * ⚠️ ONE AT A TIME, WHICH IS A PROPERTY OF WHAT IS BEING FILTERED. A status is
   * exclusive (a thing is one of them); a tag is not. Getting it wrong is a
   * filter that silently returns nothing, so it is stated rather than guessed.
   */
  readonly only?: true;
  /** ⚠️ Names the whole row for a reader who arrives at it out of context. */
  readonly label: string;
}

/**
 * ⚠️ A BUTTON, NOT A CHIP, AND THE FLOOR IS WHAT DECIDES IT. The first draft was
 * a pressable `Chip` — the shape a value wears everywhere else here, and the
 * right instinct — and it is 24px tall. A filter is a thing somebody presses,
 * `ROW.tap` calls 44px non-negotiable, and the browser sweep would have reported
 * every one of them as a target too small for a finger. A chip is what a value
 * WEARS; a control is what a person HITS, and the two are not the same object
 * however similar they look.
 *
 * ⚠️ AND THE SELECTED STATE IS THE LIBRARY'S `primary` AGAINST ITS `secondary`,
 * which is a fill against an outline. `aria-pressed` is what says so to anybody
 * not looking at the fill — a toggle whose only state is a colour is a toggle
 * half the readers of this product cannot use.
 */
export function Filters({ of, chosen, onChoose, only, label }: FiltersProps) {
  const say = useFigures();
  const on = new Set(chosen);
  const press = (id: string) => {
    if (only) { onChoose(on.has(id) ? [] : [id]); return; }
    onChoose(on.has(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
  };
  return (
    <div role="group" aria-label={label}>
      <Cluster space="tight">
        {of.map((one) => (
          <Button
            key={one.id}
            size="sm"
            variant={on.has(one.id) ? "primary" : "secondary"}
            aria-pressed={on.has(one.id)}
            onPress={() => { press(one.id); }}
          >
            {one.label}
            {/* ⚠️ THE COUNT RIDES INSIDE THE CONTROL, because a number beside it
                is a second element at a second baseline — and eight of those is
                a row of sixteen things. Quieter than the word, because what
                somebody is choosing is the filter and not the total. */}
            {one.count === undefined ? null : (
              <span className={`${TYPE.figures} opacity-70`}>{say.compact(one.count)}</span>
            )}
          </Button>
        ))}
        {/* ⚠️ ONLY WHERE THERE IS SOMETHING TO CLEAR, AND ONLY WHERE CLEARING IS
            MORE THAN ONE PRESS. With a single filter on, pressing it again is
            the shorter path and a second control beside it is noise. */}
        {chosen.length > 1 ? (
          <Button variant="tertiary" size="sm" onPress={() => { onChoose([]); }}>
            Clear
          </Button>
        ) : null}
      </Cluster>
    </div>
  );
}

/**
 * WHAT IS LEFT AFTER NARROWING, IN WORDS.
 *
 * ⚠️ A COUNT IS THE ONE THING A FILTERED LIST OWES ITS READER, and a list that
 * quietly shows twelve of two hundred is a list somebody trusts as the whole
 * set. It is a sentence rather than a number for the same reason every other
 * figure in this system is: "12" beside a list says nothing about what the 12
 * are out of.
 *
 * ⚠️ AND IT SAYS NOTHING AT ALL WHEN NOTHING IS NARROWED. "200 of 200" is a line
 * of chrome on every unfiltered screen in the product — the reader already knows
 * what they are looking at, and the count is the FIRST thing to disappear when a
 * screen has nothing to report.
 */
export function Found({ shown, of, what }: {
  readonly shown: number;
  readonly of: number;
  /** ⚠️ Plural, and the app's word: "notes", "products", "people". */
  readonly what: string;
}) {
  const say = useFigures();
  if (shown === of) return null;
  return (
    <p className={TYPE.note}>
      {say.compact(shown)} of {say.compact(of)} {what}
    </p>
  );
}
