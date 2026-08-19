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

export interface PriceProps {
  readonly input: number;
  readonly output: number;
  /** What the numbers are per — "token", "image", "second". */
  readonly meter: string;
}

/** ⚠️ In and out, together, because one without the other is not a price. */
export function Price({ input, output, meter }: PriceProps) {
  const per = meter === "token" ? "1M tokens" : meter === "image" ? "1k images" : "1k seconds";
  return (
    <Chip color="default" variant="soft">
      <Chip.Label>
        <span className="tabular-nums">{perMillion(input)}</span>
        {" in · "}
        <span className="tabular-nums">{perMillion(output)}</span>
        {` out · ${per}`}
      </Chip.Label>
    </Chip>
  );
}

export interface ModelLineProps {
  readonly label: string;
  readonly id: string;
  readonly about?: string | null;
  readonly meter: string;
  readonly input: number;
  readonly output: number;
  readonly thinks?: boolean;
  readonly retired?: boolean;
  /** The operator's controls, or nothing at all for a workspace. */
  readonly controls?: React.ReactNode;
}

export function ModelLine({
  label, id, about, meter, input, output, thinks, retired, controls,
}: ModelLineProps) {
  return (
    <Stack space="tight">
      <Row space="tight">
        <Stack space="tight">
          <strong>{label}</strong>
          <small data-ink="muted">{id}</small>
        </Stack>
        <Spacer />
        {controls}
      </Row>
      {about ? <small data-ink="muted">{about}</small> : null}
      <Cluster space="tight">
        <Price input={input} output={output} meter={meter} />
        {/* ⚠️ Worth its own mark: a thinking model bills for tokens nobody asked
            for and nobody sees, which is why the reserve widens for one. */}
        {thinks
          ? <Chip color="warning" variant="soft"><Chip.Label>Thinks</Chip.Label></Chip>
          : null}
        {/* ⚠️ RETIRED IS SHOWN RATHER THAN HIDDEN. A model gone from a provider's
            catalogue is still named on old runs and may still be bound; hiding it
            makes "why is this on a model I cannot find" unanswerable. */}
        {retired
          ? <Chip color="danger" variant="soft"><Chip.Label>Gone from the provider</Chip.Label></Chip>
          : null}
      </Cluster>
    </Stack>
  );
}
