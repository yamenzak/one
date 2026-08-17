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

import type { JobBook, PackDef } from "@engine/kernel";
import { stalled } from "@engine/kernel";
import { Button, Card, Chip, Meter, ProgressBar } from "@heroui/react";
import { money } from "./console.js";
import { Grid, Stack } from "../parts/arrange.js";
import { Balance } from "../parts/heads.js";
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
  readonly balance: number;
  readonly held: number;
  readonly spentByApp: readonly { readonly appId: string | null; readonly credits: number }[];
  readonly appName: (appId: string) => string;
  readonly packs: readonly PackDef[];
  readonly onBuy: (packId: string) => void;
}

export function Wallet({ balance, held, spentByApp, appName, packs, onBuy }: WalletProps) {
  const spendable = Math.max(0, balance - held);
  const spent = spentByApp.reduce((n, s) => n + s.credits, 0);

  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      <Card>
        <Card.Header>
          <Card.Title>Credits</Card.Title>
          <Card.Description>{spendable} to spend</Card.Description>
        </Card.Header>
        <Card.Content>
          <div className={`flex flex-col ${SPACE.snug}`}>
            {/*
              ⚠️ HELD IS SHOWN SEPARATELY, because a balance that silently
              excludes it is a number that disagrees with what the person can
              actually spend — and they will notice at the moment of a refusal.
            */}
            {held > 0
              ? (
                <Chip color="default" variant="soft">
                  <Chip.Label>{held} held for calls that are still running</Chip.Label>
                </Chip>
              )
              : null}

            {spent > 0 ? (
              <div className={`flex flex-col ${SPACE.tight}`}>
                {spentByApp.map((s) => (
                  <div key={s.appId ?? "platform"} className={`flex flex-col ${SPACE.hair}`}>
                    <div className={`flex justify-between ${SPACE.snug}`}>
                      <span>{s.appId ? appName(s.appId) : "The platform"}</span>
                      <span>{s.credits}</span>
                    </div>
                    <Meter value={s.credits} maxValue={Math.max(1, spent)}>
                      <Meter.Track><Meter.Fill /></Meter.Track>
                    </Meter>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Card.Content>
      </Card>

      {/* ⚠️ Auto-fit for the same reason the plan shelf is — a catalogue has
          however many packs somebody priced. See `Shelf`. */}
      <Grid min="15rem">
        {[...packs].sort((a, b) => a.order - b.order).map((pack) => (
          <Card key={pack.id}>
            <Card.Header>
              <Card.Title>{pack.name}</Card.Title>
              <Card.Description>{pack.credits} credits</Card.Description>
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
    </div>
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
