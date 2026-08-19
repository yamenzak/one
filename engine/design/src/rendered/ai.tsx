/**
 * A MODEL, DRAWN — for the operator who sets the margin and the workspace that
 * pays it.
 *
 * ⚠️ TWO AUDIENCES, ONE COMPONENT, AND THE DIFFERENCE IS ONE PROP. What a model
 * is called, what it is good at, whether it thinks — the same facts either way.
 * What differs is the PRICE: the operator sees what it costs us and the margin
 * over it; a workspace sees the product of the two, which reveals neither. A
 * second component for the second audience is how a margin ends up on a screen
 * anybody can open.
 *
 * ⚠️ AND THE ID IS SHOWN AS THE PROVIDER SPELLS IT. `@cf/meta/llama-3.3-70b` is
 * what the call is addressed to; a tidier name over a hidden path is how a
 * catalogue comes to disagree with itself about which model ran.
 */

import type * as React from "react";
import { Chip } from "@heroui/react";
import { Cluster, Row, Spacer, Stack } from "../parts/arrange.js";

/** ⚠️ Milli-credits per thousand units — the unit the whole meter speaks. */
const MILLI = 1000;

/**
 * WHAT A THOUSAND UNITS COSTS, IN CREDITS, READABLY.
 *
 * ⚠️ A CREDIT IS A CENT AND A THOUSAND TOKENS IS A FRACTION OF ONE, so the
 * honest figure has three decimals and reads as noise. Per MILLION is the unit
 * every published price list already uses, which makes ours comparable to the
 * one somebody just looked at.
 */
export const perMillion = (milliPerThousand: number): string => {
  const credits = (milliPerThousand * 1000) / MILLI;
  return credits >= 100 ? String(Math.round(credits))
    : credits >= 1 ? credits.toFixed(1)
      : credits.toFixed(2);
};

/**
 * ⚠️ WHAT THE NUMBERS ARE PER, IN THE READER'S WORDS — never the meter's key
 * (DESIGN.md §1.9). `token`, `image` and `second` are values the code branches
 * on; "1M tokens" is the thing on the screen.
 *
 * ⚠️ AND THERE IS NO `Price` CHIP ANY MORE. A price was a soft-filled capsule on
 * every row of a sixty-row list, which is a screen of chips — the number belongs
 * in the row's own second line, as the fact it is.
 */
export const per = (meter: string): string =>
  meter === "token" ? "1M tokens" : meter === "image" ? "1k images" : "1k seconds";

/**
 * ⚠️ ONE LINE, BECAUSE A CATALOGUE IS A LIST AND NOT SIXTY ARTICLES. This drew
 * the model's full marketing description under every row — "FLUX.1 [schnell] is
 * a 12 billion parameter rectified flow transformer capable of…" — so a lane of
 * twenty models was a wall of vendor prose that nobody setting a margin needed,
 * and the switch they came for was four scrolls down. A row's second line is a
 * FACT (DESIGN.md §2): what it costs, what it is called, whether it thinks.
 *
 * ⚠️ AND THE DESCRIPTION IS NOT DELETED, IT IS ONE PRESS AWAY. It is genuinely
 * useful once — when somebody is deciding whether to sell a model they have not
 * heard of — which is exactly what a sheet is for.
 */
export interface ModelLineProps {
  readonly label: string;
  readonly id: string;
  readonly meter: string;
  readonly input: number;
  readonly output: number;
  readonly multiplier?: number;
  readonly thinks?: boolean;
  readonly retired?: boolean;
  readonly isDefault?: boolean;
  /** The operator's controls, or nothing at all for a workspace. */
  readonly controls?: React.ReactNode;
}

export function ModelLine({
  label, id, meter, input, output, multiplier, thinks, retired, isDefault, controls,
}: ModelLineProps) {
  return (
    <Row space="tight">
      <Stack space="hair">
        <Row space="tight">
          <strong className="truncate">{label}</strong>
          {/* ⚠️ THE ONE-WORD MARKS ONLY, INLINE. A thinking model bills for
              tokens nobody asked for, and the lane's default is the row that
              actually runs — both change what a press means, so both are on the
              row rather than behind it. */}
          {isDefault
            ? <Chip color="success" variant="soft"><Chip.Label>Default</Chip.Label></Chip>
            : null}
          {thinks
            ? <Chip color="warning" variant="soft"><Chip.Label>Thinks</Chip.Label></Chip>
            : null}
          {/* ⚠️ RETIRED IS SHOWN RATHER THAN HIDDEN. A model gone from a
              provider's catalogue is still named on old runs and may still be
              bound; hiding it makes "why is this on a model I cannot find"
              unanswerable. */}
          {retired
            ? <Chip color="danger" variant="soft"><Chip.Label>Gone</Chip.Label></Chip>
            : null}
        </Row>
        {/*
          ⚠️ THE COST AND THE MARGIN ON ONE LINE, because either alone is
          unreadable: a number with no multiplier beside it is not a margin, and
          a multiplier with no number is not a price. This is the whole reason
          the operator's row differs from a workspace's.
        */}
        <small data-ink="muted" className="tabular-nums">
          {perMillion(input)}
          {" / "}
          {perMillion(output)}
          {` per ${per(meter)}`}
          {multiplier === undefined ? "" : ` · ${multiplier}× cost`}
        </small>
      </Stack>
      <Spacer />
      {controls}
    </Row>
  );
}
