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

import type { Allowance, EntitlementDef, FlagBook, FlagDef, PlanSpec } from "@quad/kernel";
import { UNLIMITED, overdue, resolve, settableBy } from "@quad/kernel";
import { Button, Card, Chip, Label, Separator, Switch } from "@heroui/react";
import { Grid } from "./layout.js";
import { SPACE } from "./metrics.js";
import { TYPE } from "./type.js";
import { Reveal } from "./blocks.js";

/* ------------------------------------------------------------------ flags --- */

export interface FlagConsoleProps {
  readonly book: FlagBook;
  /** Where this console sits. A tenant may not set an operator's switch. */
  readonly level: "operator" | "tenant" | "person";
  readonly deployment: Readonly<Record<string, boolean>>;
  readonly tenant?: Readonly<Record<string, boolean>>;
  readonly person?: Readonly<Record<string, boolean>>;
  readonly today: string;
  readonly onSet: (id: string, on: boolean) => void;
}

export function FlagConsole(props: FlagConsoleProps) {
  const { book, level, deployment, tenant, person, today, onSet } = props;
  const late = new Set(overdue(book, today as never));

  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {Object.values(book).map((def: FlagDef) => {
        const switches = {
          deployment: deployment[def.id],
          tenant: tenant?.[def.id],
          person: person?.[def.id],
        };
        const on = resolve(def, switches);
        const mine = settableBy(def, switches).includes(level);

        return (
          <Card key={def.id}>
            <Card.Header>
              <Card.Title>{def.label}</Card.Title>
              <Card.Description>{def.why}</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className={`flex flex-wrap items-center ${SPACE.snug}`}>
                <Switch isSelected={on} isDisabled={!mine} onChange={(next) => onSet(def.id, next)}>
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                  <Switch.Content><Label>{on ? "On" : "Off"}</Label></Switch.Content>
                </Switch>

                {/* ⚠️ Says WHY it cannot be changed here, because a disabled
                    control with no reason reads as broken. */}
                {!mine
                  ? (
                    <Chip color="default" variant="soft">
                      <Chip.Label>Switched off further up — only an operator can change it</Chip.Label>
                    </Chip>
                  )
                  : null}

                <Chip color={def.stage === "on" ? "success" : "default"} variant="soft">
                  <Chip.Label>{def.stage}</Chip.Label>
                </Chip>

                {/* ⚠️ Reported, never enforced: taking a capability away on a
                    date somebody typed a year ago is an outage nobody asked for. */}
                {late.has(def.id)
                  ? (
                    <Chip color="warning" variant="soft">
                      <Chip.Label>Past its retirement date — this should be the product now</Chip.Label>
                    </Chip>
                  )
                  : null}
              </div>
            </Card.Content>
          </Card>
        );
      })}
    </div>
  );
}

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

export const money = (minor: number, currency: string): string =>
  minor === 0 ? "Free" : new Intl.NumberFormat("en", { style: "currency", currency })
    .format(minor / 100);

export function Shelf({ plans, entitlements, current, onChoose }: ShelfProps) {
  /* ⚠️ The parking plan is where somebody who never chose lands. It is shown —
     hiding it would make the screen disagree with the plan they are on. */
  const shown = [...plans].sort((a, b) => a.order - b.order);
  const keys = Object.entries(entitlements).filter(([, def]) => !def.reserved);

  return (
    /*
      ⚠️ AUTO-FIT, NOT THREE COLUMNS. A catalogue has however many plans somebody
      priced: at `md:grid-cols-3` a fourth one orphans onto a row of its own,
      full width in a two-thirds gap, reading as a plan of a different kind. It
      is also three columns in a `read` column, where each card is 190px wide.
      The minimum is what a price and an entitlement list need; the count is
      whatever fits.
    */
    <Grid min="15rem">
      {shown.map((plan) => {
        const mine = plan.id === current;
        const includes = (
          <dl className={`flex flex-col ${SPACE.hair}`}>
            {keys.map(([key, def]) => (
              <div key={key} className={`flex justify-between ${SPACE.snug}`}>
                <dt>{def.label}</dt>
                <dd>{saying(plan.includes[key] ?? false)}</dd>
              </div>
            ))}
          </dl>
        );
        return (
          <Card key={plan.id}>
            <Card.Header>
              <Card.Title>{plan.name}</Card.Title>
              <Card.Description>{plan.said}</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className={`flex flex-col ${SPACE.tight}`}>
                <strong className={TYPE.figure}>{money(plan.price, plan.currency)}</strong>
                {/*
                  ⚠️ A TRIAL IS AN OFFER, NOT A SUCCESS. `success` is the token
                  for something that WENT WELL — a payment cleared, a job
                  finished — and spending it on a sales badge is what makes
                  green stop meaning anything on the screens where it is load
                  bearing. It also puts a hue on a product whose interface is
                  values (`ground.ts`).
                */}
                {plan.trialDays
                  ? <Chip variant="soft"><Chip.Label>{plan.trialDays} days free</Chip.Label></Chip>
                  : null}
                <Separator />
                {/*
                  ⚠️ THE LIST IS FOR COMPARING, AND A PHONE CANNOT COMPARE. Three
                  plans stacked with every entitlement each is a screen somebody
                  scrolls past rather than reads. The plan they are ON keeps its
                  list, because that is a fact about them rather than a
                  comparison; the others fold behind a disclosure.
                */}
                {mine ? includes : (
                  <>
                    <div className="hidden md:block">{includes}</div>
                    <div className="md:hidden">
                      <Reveal label="What is included">{includes}</Reveal>
                    </div>
                  </>
                )}
              </div>
            </Card.Content>
            <Card.Footer>
              {mine
                ? <Chip variant="primary"><Chip.Label>Your plan</Chip.Label></Chip>
                : <Button variant="primary" onPress={() => onChoose(plan.id)}>Choose {plan.name}</Button>}
            </Card.Footer>
          </Card>
        );
      })}
    </Grid>
  );
}
