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

import type { JobBook, PackDef } from "@quad/kernel";
import { Button, Card, Chip, Meter, ProgressBar, Separator } from "@heroui/react";
import { money } from "./console.js";
import { SPACE } from "./metrics.js";

/* ------------------------------------------------------------------- bill --- */

export interface BillProps {
  readonly lines: readonly { readonly appId: string; readonly planId: string; readonly price: number; readonly currency: string }[];
  readonly total: number;
  readonly currency: string;
  readonly appName: (appId: string) => string;
  readonly mixed?: boolean;
}

export function Bill({ lines, total, currency, appName, mixed }: BillProps) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>What this workspace pays</Card.Title>
        <Card.Description>One invoice, one line per product.</Card.Description>
      </Card.Header>
      <Card.Content>
        <div className={`flex flex-col ${SPACE.tight}`}>
          {lines.length === 0
            ? <span>Nothing yet — every product here is on a free plan.</span>
            : lines.map((line) => (
              <div key={line.appId} className={`flex justify-between ${SPACE.snug}`}>
                <span>{appName(line.appId)} · {line.planId}</span>
                <span>{money(line.price, line.currency)}</span>
              </div>
            ))}
          <Separator />
          <div className={`flex justify-between ${SPACE.snug}`}>
            <strong>Total</strong>
            <strong>{money(total, currency)}</strong>
          </div>
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
        </div>
      </Card.Content>
    </Card>
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
                  <div key={s.appId ?? "platform"} className="flex flex-col gap-1">
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

      <div className={`grid ${SPACE.snug} md:grid-cols-3`}>
        {[...packs].sort((a, b) => a.order - b.order).map((pack) => (
          <Card key={pack.id}>
            <Card.Header>
              <Card.Title>{pack.name}</Card.Title>
              <Card.Description>{pack.credits} credits</Card.Description>
            </Card.Header>
            <Card.Content>
              <strong>{money(pack.price, pack.currency)}</strong>
              {/* ⚠️ An expiry is on the card, not in the small print. */}
              {pack.expiresDays
                ? (
                  <Chip color="warning" variant="soft">
                    <Chip.Label>Expires after {pack.expiresDays} days</Chip.Label>
                  </Chip>
                )
                : null}
            </Card.Content>
            <Card.Footer>
              <Button variant="primary" onPress={() => onBuy(pack.id)}>Buy</Button>
            </Card.Footer>
          </Card>
        ))}
      </div>
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
  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {Object.values(book).map((job) => {
        const last = runs.filter((r) => r.jobId === job.id)
          .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
        const quiet = !last || now - Date.parse(last.startedAt) > missedMs;
        const hanging = last && !last.endedAt;

        return (
          <Card key={job.id}>
            <Card.Header>
              <Card.Title>{job.label}</Card.Title>
              <Card.Description>{job.why}</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className={`flex flex-wrap items-center ${SPACE.snug}`}>
                {/* ⚠️ "Has not run" is the headline, because it is the failure
                    that produces no error anywhere. */}
                {quiet
                  ? (
                    <Chip color="danger" variant="primary">
                      <Chip.Label>{last ? "Has not run since " + last.startedAt.slice(0, 16) : "Has never run"}</Chip.Label>
                    </Chip>
                  )
                  : null}
                {hanging
                  ? (
                    <Chip color="warning" variant="soft">
                      <Chip.Label>Started and never came back</Chip.Label>
                    </Chip>
                  )
                  : null}
                {last?.ok === false
                  ? (
                    <Chip color="danger" variant="soft">
                      <Chip.Label>Last run failed: {last.detail}</Chip.Label>
                    </Chip>
                  )
                  : null}
                {last?.ok === true && !quiet
                  ? (
                    <Chip color="success" variant="soft">
                      <Chip.Label>{last.touched} handled at {last.startedAt.slice(11, 16)}</Chip.Label>
                    </Chip>
                  )
                  : null}
                <ProgressBar value={0} isIndeterminate={!!hanging} aria-label="Running">
                  <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
                </ProgressBar>
              </div>
            </Card.Content>
          </Card>
        );
      })}
    </div>
  );
}
