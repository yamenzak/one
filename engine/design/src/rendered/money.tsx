/**
 * THE BILL, THE WALLET AND THE WORK — the screens the money stage owes.
 *
 * ⚠️ ONE BILL FOR A BUSINESS WITH SEVERAL OF OUR PRODUCTS. That is the thing the
 * whole inversion is for, and this screen is where a customer either sees it or
 * does not: three lines, one total, one payment method — not three emails on
 * three days from what looks like three companies.
 *
 * ⚠️ AND ONE WALLET, WITH THE SPENDING BROKEN DOWN. A shared balance is only an
 * improvement if a business can still tell which product is spending it;
 * otherwise "one wallet" is just "we stopped telling you".
 */

import React from "react";
import type { JobBook, PackDef } from "@engine/kernel";
import { stalled } from "@engine/kernel";
import { Button, Card, Chip, Meter, ProgressBar } from "@heroui/react";
import { money } from "./console.js";
import { Grid, Stack } from "../parts/arrange.js";
import { Credits } from "../parts/credits.js";
import { Balance } from "../parts/heads.js";
import { Choice, NumberInput } from "../parts/forms.js";
import { AmountRow, ControlRow, Group } from "../parts/surfaces.js";
import { TYPE } from "../tokens/type.js";
import { SPACE } from "../tokens/metrics.js";

/* ------------------------------------------------------------------- bill --- */

export interface BillProps {
  readonly lines: readonly { readonly appId: string; readonly planId: string; readonly price: number; readonly currency: string }[];
  readonly total: number;
  readonly currency: string;
  readonly appName: (appId: string) => string;
  readonly mixed?: boolean;
}

/** ⚠️ What the figure is OF, which is a count rather than the word "total". */
const said = (lines: number): string =>
  lines === 0
    ? "Every product here is on a free plan"
    : lines === 1 ? "For one product" : `Across ${lines} products`;

export function Bill({ lines, total, currency, appName, mixed }: BillProps) {
  return (
    <Stack space="snug">
      {/*
        ⚠️ THE AMOUNT IS THE SCREEN, NOT A FIELD ON A CARD. This was a titled
        card with a description, a figure and a list inside it — three levels of
        chrome around one number, on the screen whose entire question is that
        number. A hero has no chrome to read past.
      */}
      <Balance
        eyebrow="Every month"
        figure={<span className={TYPE.display}>{money(total, currency)}</span>}
        identifier={said(lines.length)}
      />

      {/* ⚠️ THE LINES ARE ROWS, WHICH IS WHAT EVERY OTHER LIST IN THIS PRODUCT
          IS. A `dt`/`dd` run inside a card is a second list grammar, and it is
          the one that reads as a printout. */}
      {lines.length > 0 ? (
        <Group>
          {lines.map((line) => (
            <AmountRow
              key={line.appId}
              label={appName(line.appId)}
              under={line.planId}
              amount={money(line.price, line.currency)}
            />
          ))}
        </Group>
      ) : null}

      {/*
        ⚠️ A MIXED-CURRENCY BILL IS SAID, NOT SUMMED. Adding euros to dirhams
        produces a number that means nothing, on the one document people
        actually read.
      */}
      {mixed
        ? (
          <Chip color="warning" variant="soft">
            <Chip.Label>Some products here are priced in another currency and are billed separately</Chip.Label>
          </Chip>
        )
        : null}
    </Stack>
  );
}

/* ----------------------------------------------------------------- wallet --- */

export interface WalletProps {
  /** ⚠️ This month's allowance, and it does not carry over. */
  readonly granted: number;
  /** ⚠️ Bought with a card, and it never expires. */
  readonly bought: number;
  readonly held: number;
  readonly spentByApp: readonly { readonly appId: string | null; readonly credits: number }[];
  readonly appName: (appId: string) => string;
  readonly packs: readonly PackDef[];
  readonly onBuy: (packId: string) => void;
  /** ⚠️ What is owed and could not be collected — see `owedMilli`. */
  readonly owed?: number;
  /**
   * ⚠️ THE STANDING INSTRUCTION, AND WHY IT LAST FAILED. Nobody is present when
   * a bank refuses an off-session charge, so this screen is the only place
   * somebody learns their credits stopped topping up.
   */
  readonly armed?: {
    readonly packId: string | null;
    readonly below: number;
    readonly error: string | null;
  };
  /** ⚠️ Clearing the pack turns it off, and that is never refused. */
  readonly onArm?: (packId: string | null, below: number) => void;
}

/**
 * ONE BALANCE, MADE OF TWO NUMBERS THAT OBEY OPPOSITE RULES.
 *
 * ⚠️ THE SPLIT IS SHOWN BECAUSE IT IS THE ONLY WAY THE MONTH MAKES SENSE. One
 * figure of 5,500 that drops to 4,000 on the first of the month, with nothing
 * saying why, is a support conversation every month for ever. Two lines — what
 * lapses and what does not — answer it before it is asked.
 *
 * ⚠️ AND THE HERO IS WHAT CAN BE SPENT, not what is on the row. A balance that
 * silently includes a hold disagrees with the product at the moment of a
 * refusal, which is the worst possible moment to be discovered.
 */
export function Wallet({
  granted, bought, held, spentByApp, appName, packs, onBuy, owed = 0, armed, onArm,
}: WalletProps) {
  const spendable = Math.max(0, granted + bought - held);
  const spent = spentByApp.reduce((n, s) => n + s.credits, 0);

  /* ⚠️ THE FORM HOLDS WHAT IS ON SCREEN AND THE SERVER HOLDS THE TRUTH. A
     control bound straight to the loaded answer cannot be typed into. */
  const [pick, setPick] = React.useState(armed?.packId ?? "");
  const [below, setBelow] = React.useState(armed?.below || 500);

  return (
    <Stack space="snug">
      <Balance
        eyebrow="To spend"
        figure={<Credits value={spendable} as="display" label="credits" />}
        identifier={granted > 0 ? `${granted.toLocaleString("en-US")} of it this month's allowance` : undefined}
      />

      {/*
        ⚠️ THE TWO BALANCES ARE ROWS, and the copy on each says its RULE rather
        than its name. "Allowance" and "Bought" are labels somebody has to be
        taught; "ends when the month does" and "never expires" are the two facts
        that decide what to do next.
      */}
      <Group>
        <AmountRow
          label="This month's allowance"
          under="Ends when the month does"
          amount={<Credits value={granted} as="inline" />}
        />
        <AmountRow
          label="Credits you bought"
          under="Never expires"
          amount={<Credits value={bought} as="inline" />}
        />
        {/*
          ⚠️ HELD IS ITS OWN ROW, because a balance that silently excludes it is
          a number that disagrees with what can actually be spent — and the
          person finds out at the moment of a refusal.
        */}
        {held > 0 ? (
          <AmountRow
            label="Held"
            under="For calls that are still running"
            amount={<Credits value={held} as="inline" />}
          />
        ) : null}
        {/*
          ⚠️ AND A DEBT IS SAID PLAINLY. Storage over the included amount is
          metered rather than refused, so this is the only place somebody learns
          the meter could not collect — and it is what stopped their writes.
        */}
        {owed > 0 ? (
          <AmountRow
            tone="warning"
            label="Owed"
            under="Add credits to make this workspace writable again — nothing has been deleted"
            amount={<Credits value={owed} as="inline" />}
          />
        ) : null}
      </Group>

      {/*
        ⚠️ WHERE IT WENT, PER PRODUCT. One wallet is only an improvement if a
        business can still tell which product is spending it; otherwise "one
        wallet" is just "we stopped telling you".
      */}
      {spent > 0 ? (
        <Group label="Where the credits went">
          {spentByApp.map((s) => (
            <AmountRow
              key={s.appId ?? "platform"}
              label={s.appId ? appName(s.appId) : "The platform"}
              amount={<Credits value={s.credits} as="inline" />}
              aside={(
                <Meter value={s.credits} maxValue={Math.max(1, spent)} className="w-16">
                  <Meter.Track><Meter.Fill /></Meter.Track>
                </Meter>
              )}
            />
          ))}
        </Group>
      ) : null}

      {/*
        ⚠️ THE STANDING INSTRUCTION IS A CONTROL, NOT A SETTING BURIED ELSEWHERE.
        It authorises a charge to a card with nobody present, so it belongs on
        the screen that shows the balance it protects — where somebody watching
        their credits run down is already looking.

        ⚠️ AND ITS LAST FAILURE IS SAID HERE. Nobody was present when the bank
        refused, so without this row the credits simply stop arriving.
      */}
      {onArm ? (
        <Group label="Buy more automatically">
          {armed?.error ? (
            <AmountRow
              tone="warning"
              label={armed.error}
              under="Nothing was charged — check the card on file"
              amount={<Credits value={armed.below} as="inline" />}
            />
          ) : null}
          <ControlRow label="When the balance falls below" under="Checked once a day">
            <NumberInput label="Credits" value={below} min={0} onChange={setBelow} />
          </ControlRow>
          <ControlRow label="Buy" under="Nothing is charged until the balance actually falls">
            <Choice
              label="Pack"
              value={pick}
              placeholder="Off"
              options={[
                { id: "", label: "Off" },
                ...[...packs].sort((a, b) => a.order - b.order)
                  .map((p) => ({ id: p.id, label: p.name })),
              ]}
              onChange={setPick}
            />
          </ControlRow>
          <ControlRow label="" under={pick ? undefined : "Turning this off stops every future charge"}>
            <Button variant="primary" onPress={() => onArm(pick || null, below)}>
              {pick ? "Turn on" : "Turn off"}
            </Button>
          </ControlRow>
        </Group>
      ) : null}

      {/* ⚠️ Auto-fit for the same reason the plan shelf is — a catalogue has
          however many packs somebody priced. See `Shelf`. */}
      <Grid min="15rem">
        {[...packs].sort((a, b) => a.order - b.order).map((pack) => (
          <Card key={pack.id}>
            <Card.Header>
              <Card.Title>{pack.name}</Card.Title>
              <Card.Description>
                <Credits value={pack.credits} as="inline" />
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <strong>{money(pack.price, pack.currency)}</strong>
              {/* ⚠️ SAID ON THE CARD, NOT IN THE SMALL PRINT. It is the reason
                  somebody buys a pack instead of waiting for the month to turn,
                  and it is the one thing the allowance beside it does not do. */}
              <Chip variant="soft">
                <Chip.Label>Never expires</Chip.Label>
              </Chip>
            </Card.Content>
            <Card.Footer>
              <Button variant="primary" onPress={() => onBuy(pack.id)}>Buy</Button>
            </Card.Footer>
          </Card>
        ))}
      </Grid>
    </Stack>
  );
}

/* ---------------------------------------------------------------- storage --- */

export interface StorageProps {
  readonly used: number;
  readonly included: number;
  readonly creditsPerGbMonth: number;
}

const GB = 1024 * 1024 * 1024;
const inGb = (bytes: number): string =>
  `${(Math.round((bytes / GB) * 10) / 10).toLocaleString("en-US")} GB`;

/**
 * WHERE THE STORAGE STANDS, BEFORE THE METER IS THE FIRST ANYBODY HEARS OF IT.
 *
 * ⚠️ THE INCLUDED AMOUNT IS WHERE THE METER STARTS, NOT WHERE THE PRODUCT STOPS,
 * and that is only kind if somebody can see the line coming. A charge that
 * arrives without a screen that predicted it is the same surprise as a refusal,
 * arriving later — so the rate is on the screen whether or not it is being paid.
 */
export function Storage({ used, included, creditsPerGbMonth }: StorageProps) {
  const over = Math.max(0, used - included);
  return (
    <Group label="Storage">
      <AmountRow
        label={over > 0 ? `${inGb(over)} over what your plan includes` : "Within your plan"}
        under={`${inGb(used)} of ${inGb(included)} included`}
        tone={over > 0 ? "warning" : "neutral"}
        amount={<Credits value={Math.round((over / GB) * creditsPerGbMonth)} as="inline" />}
        aside={(
          <ProgressBar value={Math.min(100, included > 0 ? (used / included) * 100 : 0)} className="w-16">
            <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
          </ProgressBar>
        )}
      />
      {/* ⚠️ THE PRICE, ALWAYS. It is the difference between a limit and a meter,
          and somebody reading this row is deciding whether to tidy up or to pay. */}
      <ControlRow label="Over the included amount" under="Charged monthly, to the nearest day">
        <span className={TYPE.note}>
          <Credits value={creditsPerGbMonth} as="inline" /> per GB
        </span>
      </ControlRow>
    </Group>
  );
}

/* ------------------------------------------------------------------- jobs --- */

export interface JobsProps {
  readonly book: JobBook;
  readonly runs: readonly {
    readonly jobId: string; readonly startedAt: string; readonly endedAt: string | null;
    readonly ok: boolean | null; readonly detail: string | null; readonly touched: number;
  }[];
  /** How long without a run is worth saying something about. */
  readonly missedMs: number;
  readonly now: number;
}

/**
 * ⚠️ THE LAST RUN, NOT THE NEXT ONE. A job that is scheduled tells you nothing;
 * a job whose last run was three days ago is a job that has stopped, and that is
 * the only thing this screen is for.
 */
export function Jobs({ book, runs, missedMs, now }: JobsProps) {
  const quiet_ = stalled(book, runs, now, missedMs);
  return (
    /*
      ⚠️ A JOB IS A ROW, AND ITS STATE IS A SENTENCE. Each was a `Card` with a
      title, a description and a content area of up to four chips — so a
      deployment with six jobs was six cards deep and the one thing worth seeing
      was a filled red pill repeated down the page.

      ⚠️ AND "HAS NEVER RUN" IS NOT AN ALARM. `danger` filled is the loudest
      thing this product can draw, and on a fresh deployment every job has never
      run — so the screen an operator opens first is entirely red, which teaches
      them the colour means nothing. Quiet is a STATE, said in words; only a
      failed run is a failure.
    */
    <Group>
      {Object.values(book).map((job) => {
        const last = runs.filter((r) => r.jobId === job.id)
          .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
        /* ⚠️ ASKED, NOT WORKED OUT. This was the same three lines as `stalled` in
           the kernel — one comparison, written twice, and the copy on the screen
           is the one that decides what an operator is told. Two answers to "has
           this job stopped running" diverge in whichever direction nobody
           tests. */
        const quiet = quiet_.includes(job.id);

        return (
          <ControlRow key={job.id} label={job.label} under={job.why}>
            <span className={`${TYPE.note} text-end`} data-tone={last?.ok === false ? "danger" : "neutral"}>
              {lastRun(last, quiet)}
            </span>
          </ControlRow>
        );
      })}
    </Group>
  );
}

/**
 * ⚠️ ONE LINE, AND THE WORST TRUE THING FIRST. A failed run, then a run that
 * started and never came back, then silence, then the ordinary answer — an
 * operator scanning this is looking for the one that is wrong, and four chips
 * on a row is four things to rule out per job.
 */
const lastRun = (
  last: JobsProps["runs"][number] | undefined, quiet: boolean,
): string => {
  if (last?.ok === false) return `Last run failed: ${last.detail ?? "no detail"}`;
  if (last && !last.endedAt) return "Started and never came back";
  if (!last) return "Has never run";
  if (quiet) return `Nothing since ${last.startedAt.slice(0, 16).replace("T", " ")}`;
  return `${last.touched} handled at ${last.startedAt.slice(11, 16)}`;
};
