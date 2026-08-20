/**
 * THE SCREENS AN OPERATOR GETS FOR FREE — the flag console and the plan shelf.
 *
 * ⚠️ EVERY DECLARATION REACHES A SURFACE, AND THESE ARE THE TWO NOBODY EVER
 * WRITES. A flag with no console is a switch that exists in a comment; a plan
 * catalogue with no shelf is a price list a customer cannot see. Both were built
 * and unreachable in a previous platform, and both passed every test.
 *
 * ⚠️ AND A SWITCH HERE CHANGES BEHAVIOUR, WHICH IS THE OTHER HALF OF THE RULE. A
 * flag the console can set that nothing reads is worse than an absent feature:
 * somebody turns it on, believes what it promised, and stops watching for the
 * problem it claimed to solve.
 */

import type { Allowance, EntitlementDef, FlagBook, FlagDef, PlanSpec } from "@engine/kernel";
import * as React from "react";
import { UNLIMITED, overdue, resolve, sayDate, sayMoney, settableBy } from "@engine/kernel";
import { Table } from "@heroui/react";
import { Stack } from "../parts/arrange.js";
import { AmountRow, Group, ToggleRow } from "../parts/surfaces.js";
import type { FaceOf } from "../parts/face.js";
import { SPACE } from "../tokens/metrics.js";
import { Reveal } from "../parts/blocks.js";
import { useShown } from "../parts/said.js";

/*
  ⚠️ `FlagConsole` WAS HERE AND IS GONE, AND THE GUARD IS WHY. It drew a book of
  flags as a run of toggles with the three-level algebra resolved per row — and
  when the two surfaces that show flags were built properly, neither wanted that
  shape. The operator's is a LIST that descends, because a switch has three
  states and a list of exceptions; the workspace's is a toggle for what it may
  change and a row leading to its people for what it may only share. A component
  general enough for both was general enough for neither, and `showcase` reported
  it as shipped and drawn by nothing twice before it was deleted.
*/

/* ------------------------------------------------------------------ shelf --- */

export interface ShelfProps {
  readonly plans: readonly PlanSpec[];
  readonly entitlements: Readonly<Record<string, EntitlementDef>>;
  readonly current?: string;
  readonly onChoose: (planId: string) => void;
}

/** ⚠️ `-1` is unlimited and `0` is none, and a shelf that showed "-1" would be
    a price list nobody could read. */
export const saying = (value: Allowance): string => {
  if (value === true) return "Included";
  if (value === false || value === 0) return "—";
  if (value === UNLIMITED) return "Unlimited";
  return String(value);
};

/**
 * ⚠️ A PRICE, IN THE READER'S CONVENTIONS. This was `Intl.NumberFormat("en", …)`
 * with `minor / 100` — hardcoded American grouping for everybody, and a
 * hundredth of the real figure for every currency with no minor unit. It is a
 * HOOK now, so it cannot be called anywhere the reader is unknown.
 *
 * ⚠️ AND ZERO IS "FREE" RATHER THAN "€0.00". A price list where the free tier
 * reads as a formatted nothing makes somebody look twice at the one row that
 * needs no thought.
 */
export function useMoney(): (minor: number, currency: string) => string {
  const shown = useShown();
  return React.useCallback(
    (minor: number, currency: string) => (minor === 0 ? "Free" : sayMoney(shown, minor, currency)),
    [shown],
  );
}

export function Shelf({ plans, entitlements, current, onChoose }: ShelfProps) {
  const money = useMoney();
  /* ⚠️ The parking plan is where somebody who never chose lands. It is shown —
     hiding it would make the screen disagree with the plan they are on. */
  const shown = [...plans].sort((a, b) => a.order - b.order);
  const keys = Object.entries(entitlements).filter(([, def]) => !def.reserved);

  return (
    <Stack space="snug">
      {/*
        ⚠️ A PLAN IS A ROW WITH A PRICE ON IT, NOT A CARD WITH A TABLE IN IT.
        The card version drew the SAME five entitlement labels once per plan —
        four columns of "Staff / Clients / Plans / AI drafting / Your own
        branding", most of the values an em dash — which is a spreadsheet with
        chrome around it, and it was the ugliest thing on the screen. A row says
        the name, what the plan is for, and what it costs; that is the whole of
        what somebody scanning a price list reads.
      */}
      {/*
        ⚠️ WHAT YOU HAVE AND WHAT YOU COULD HAVE ARE TWO CARDS, because they are
        two kinds of thing. In one card the plan somebody is ON was the first row
        of a price list, distinguished from the three below it only by a missing
        chevron — so the answer to "what am I paying for" and the answer to "what
        else is there" were the same list, and the eye had to read all four to
        find the first. A gap says it at every size, with no rule to align.
      */}
      <Group>
        {shown.filter((p) => p.id === current).map((plan) => (
          <AmountRow
            key={plan.id}
            label={plan.name}
            under="Your plan"
            amount={money(plan.price, plan.currency)}
            /* ⚠️ NO CHEVRON: there is nowhere to go from the one you are on, and
               a row that promises something and does nothing is worse than a row
               that promises nothing. */
          />
        ))}
      </Group>

      <Group>
        {shown.filter((plan) => plan.id !== current).map((plan) => (
          <AmountRow
            key={plan.id}
            label={plan.name}
            /* ⚠️ A TRIAL BELONGS ON THE PLAN IT IS ON, IN WORDS. It was a chip,
               and a chip on a sales badge is a hue on a product whose interface
               is values. */
            under={plan.trialDays ? `${plan.said} · ${plan.trialDays} days free` : plan.said}
            amount={money(plan.price, plan.currency)}
            onOpen={() => onChoose(plan.id)}
          />
        ))}
      </Group>

      {/*
        ⚠️ A COMPARISON IS ONE TABLE, AND IT IS THE ONE THING HERE THAT SHOULD
        SCROLL ON A PHONE. Plans across, what they include down: the labels are
        written once, and the eye can travel a row to see where a number
        changes — which is the only reason anybody opens this. Folded away by
        default, because most people arriving here already know which plan they
        want and are looking for the price.
      */}
      <Reveal label="Compare what each includes">
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="What each plan includes">
              <Table.Header>
                <Table.Column id="what" isRowHeader>What</Table.Column>
                {shown.map((plan) => (
                  <Table.Column key={plan.id} id={plan.id} className="text-end">
                    {plan.name}
                  </Table.Column>
                ))}
              </Table.Header>
              <Table.Body>
                {keys.map(([key, def]) => (
                  <Table.Row key={key}>
                    <Table.Cell>{def.label}</Table.Cell>
                    {shown.map((plan) => (
                      <Table.Cell key={plan.id} className="text-end tabular-nums">
                        {saying(plan.includes[key] ?? false)}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </Reveal>
    </Stack>
  );
}
