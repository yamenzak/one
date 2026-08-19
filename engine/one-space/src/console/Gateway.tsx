/**
 * GATEWAY — where every call goes, and whether we are being paid above cost.
 *
 * ⚠️ THIS IS THE SCREEN FOR THE ONE NUMBER THAT IS NOT OURS. The estimate, the
 * rate table, the multiplier and the settle all agree with each other by
 * construction and would go on agreeing through a mistake they share; Cloudflare
 * bills us from its own figures, so a workspace sold under cost is a fact only
 * the gateway can report. Without somewhere to draw it, that check runs nightly
 * and tells nobody.
 *
 * ⚠️ AND IT SAYS WHEN THE CHECK IS NOT RUNNING. A margin screen that draws a
 * healthy zero because no cost has ever been read is worse than an empty one —
 * it is a green light wired to nothing.
 */

import {
  Group, NavRow, Row, Screen, Spacer, Stack, glyphOf, useShown,
} from "@engine/design";
import { sayMoment, type Instant } from "@engine/kernel";
import { useLoad } from "../centre/data.js";

interface Run {
  readonly id: string;
  readonly label: string;
  readonly lastAt: string | null;
  readonly lastOk: boolean | null;
  readonly lastDetail: string | null;
}

interface Answer {
  readonly jobs: readonly Run[];
}

/** ⚠️ The two jobs this screen is about, named where the ids are. */
const COSTS = "ai-costs";
const SYNC = "models";

export function Gateway() {
  const of = useLoad<Answer>("op.jobs");
  /* ⚠️ `sayMoment`, NOT A SLICE (D7). Cutting an ISO string leaves UTC in
     nobody's conventions on a screen whose whole subject is when something last
     happened. */
  const shown = useShown();

  return (
    <Screen shape="list" under="Where the calls go, and whether the margin is holding"
      of={of.of} again={of.again}
      then={(at) => {
        const costs = at.jobs.find((j) => j.id === COSTS);
        const sync = at.jobs.find((j) => j.id === SYNC);

        return (
          <>
            {/*
              ⚠️ THE ABSENCE IS THE HEADLINE WHEN IT IS ABSENT. A deployment with
              no gateway configured cannot read what anything cost — so the
              margin is unmeasured rather than fine, and this says which.
            */}
            <Group label="The check" under="Cloudflare's own bill, against what we charged">
              {costs ? (
                <NavRow
                  icon={glyphOf("clock")}
                  label={costs.lastOk === false ? "Sold under cost" : "Every run above cost"}
                  under={said(costs, shown)}
                />
              ) : (
                <NavRow
                  icon={glyphOf("clock")}
                  label="Not running"
                  under={(
                    <span data-ink="warning">
                      No gateway is configured, so nothing can read what a call cost.
                      Set the gateway and its token under Keys.
                    </span>
                  )}
                />
              )}
            </Group>

            <Group label="The catalogue" under="What the models cost us, refreshed nightly">
              {sync ? (
                <NavRow
                  icon={glyphOf("bank")}
                  label={sync.lastOk === false ? "Last sync failed" : "Prices are current"}
                  under={said(sync, shown)}
                />
              ) : (
                <NavRow
                  icon={glyphOf("bank")}
                  label="Not running"
                  under={(
                    <span data-ink="warning">
                      No account token, so the catalogue is whatever it was when it last ran.
                    </span>
                  )}
                />
              )}
            </Group>

            {/*
              ⚠️ WHAT IT IS SAFE TO SAY ABOUT WHERE THE CALLS GO, AND NOTHING
              MORE. The gateway's name is configuration and it is on the Keys
              screen; repeating it here would be a second place to read a value
              that is edited in one.
            */}
            <Group label="How a call is made">
              <Stack space="tight">
                <Row space="tight">
                  <small data-ink="muted">Every provider</small>
                  <Spacer />
                  <small>one endpoint, one shape</small>
                </Row>
                <small data-ink="muted">
                  Calls go out tagged with the workspace, the product and the action,
                  which is what lets the check above be answered per workspace rather
                  than as one number for the deployment.
                </small>
              </Stack>
            </Group>
          </>
        );
      }}
    />
  );
}

/** ⚠️ The run's own words. A job's detail is written to be read here. */
const said = (job: Run, shown: ReturnType<typeof useShown>): string =>
  !job.lastAt ? "Has never run"
    : `${job.lastDetail ?? (job.lastOk ? "ran" : "failed")} · ${sayMoment(shown, job.lastAt as Instant)}`;
