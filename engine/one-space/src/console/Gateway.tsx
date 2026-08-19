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
 *
 * ⚠️ IT READS `op.jobs`'s OWN SHAPE, WHICH IS `{ book, runs }`. It declared a
 * `{ jobs }` of its own invention and threw on the first field it touched, so
 * this page — the one whose whole job is to say "no gateway is configured, set
 * it under Keys" — was a black rectangle on exactly the deployment that needed
 * to read it. `useLoad<T>` is a type ARGUMENT, not a check: the compiler
 * believed the declaration and the server never sent it. `Await` catches the
 * throw now; reading the real shape is what stops there being one.
 */

import * as React from "react";
import {
  ActionRow, FieldRow, Group, NavRow, Screen, glyphOf, useShown
} from "@engine/design";
import type { JobRun, JobShown } from "@engine/design";
import { sayMoment, type Instant } from "@engine/kernel";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";
import type { Where } from "../space/where.js";

/**
 * ⚠️ THE TYPES ARE `@engine/design`'s, NOT A SECOND COPY. The Nightly work
 * screen already renders this exact payload through `Jobs`, and a private
 * re-declaration here is how this file came to expect a `{ jobs }` nothing ever
 * sent. One shape, one home — and the compiler now checks this page against the
 * same definition the other one is drawn from.
 */
interface Answer {
  readonly book: Readonly<Record<string, JobShown>>;
  readonly runs: readonly JobRun[];
}

/** ⚠️ The two jobs this screen is about, named where the ids are. */
const COSTS = "ai-costs";
const SYNC = "models";

export function Gateway({ onGo }: { readonly onGo: (to: Where) => void }) {
  const of = useLoad<Answer>("op.jobs");
  /* ⚠️ `sayMoment`, NOT A SLICE (D7). Cutting an ISO string leaves UTC in
     nobody's conventions on a screen whose whole subject is when something last
     happened. */
  const shown = useShown();
  const [running, setRunning] = React.useState<string | null>(null);

  /* ⚠️ THE JOB EXISTS AND THE CONSOLE CAN ALREADY START ONE, so an operator who
     reads "the catalogue is empty" here does not then have to go and find the
     Nightly work screen to do the one thing this page just told them to do. */
  const runNow = async (id: string) => {
    setRunning(id);
    try { await api.post("op.job.run", { job: id }); of.again?.(); }
    finally { setRunning(null); }
  };

  return (
    <Screen shape="list" under="Where the calls go, and whether the margin is holding"
      of={of.of} again={of.again}
      then={(at) => {
        /* ⚠️ THE NEWEST RUN OF ONE JOB, DERIVED. `runs` is every job's, newest
           first, so the first match is the last time this one ran — and a job
           that has never run has none, which is a state this screen has to be
           able to say out loud. */
        const last = (id: string): JobRun | undefined => at.runs.find((r) => r.jobId === id);
        const costs = at.book[COSTS];
        const sync = at.book[SYNC];

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
                  label={said(last(COSTS)).label}
                  under={said(last(COSTS), shown).under}
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
              {/* ⚠️ NO `Stack` HERE — A CARD IS ALREADY ONE. Wrapping the rows put
                  a second rhythm inside the card: its own inset on top of the
                  card's, so the first row sat 24 from the edge where every other
                  card in the product puts it at 12, plus the stack's gap between
                  every pair. That is the "double padding" this card was reported
                  for, and `test/rhythm.test.tsx` measures it now. */}
              {sync ? (
                <>
                  {/* ⚠️ THE ROW LEADS WHERE THE NUMBER SENDS SOMEBODY. "64 new"
                      is read as an invitation to go and look at them, and for a
                      while it was a chevron over nothing — the models are on
                      the next screen and this is the only place that says how
                      many there are. */}
                  <NavRow
                    icon={glyphOf("bank")}
                    label={said(last(SYNC)).label}
                    under={said(last(SYNC), shown).under}
                    onOpen={() => onGo({ at: "models" })}
                  />
                  {/*
                    ⚠️ AND A WAY TO RUN IT. Until this has run once there are no
                    models at all, so every lane reports "no model answers" and
                    every product's AI is off — which is the state a fresh
                    deployment is in, and the one an operator opens this to fix.
                  */}
                  <ActionRow
                    icon={glyphOf("refresh")}
                    label={running === SYNC ? "Syncing" : "Sync now"}
                    under="Discovers every model and refreshes what each one costs"
                    onDo={() => void runNow(SYNC)}
                  />
                </>
              ) : (
                <NavRow
                  icon={glyphOf("bank")}
                  label="Not running"
                  under={(
                    <span data-ink="warning">
                      This deployment holds no Cloudflare account token, so nothing can
                      discover a model or a price. Until it does, no model answers any lane.
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
            {/* ⚠️ TWO FACTS, NOT A PARAGRAPH. This was a sentence explaining why
                the check above can be answered per workspace — thirty words of
                architecture under a heading, which DESIGN.md §1.1 rules out and
                §2 rules out again ("a row's second line is a FACT, never an
                explanation"). What it was actually saying is two values, and a
                value belongs in the row that names it. */}
            <Group label="How a call is made">
              <FieldRow label="Every provider" value="One endpoint, one shape" />
              <FieldRow label="Every call" value="Tagged with the workspace, product and action" />
            </Group>
          </>
        );
      }}
    />
  );
}

/**
 * ⚠️ THE RUN'S OWN WORDS, AND "HAS NEVER RUN" IS ONE OF THE ANSWERS. A job that
 * is declared and has never fired reads identically to one that ran and found
 * nothing unless the screen says which — and on a fresh deployment it is always
 * the first of the two.
 */
const said = (
  run: JobRun | undefined, shown?: ReturnType<typeof useShown>,
): { label: string; under: React.ReactNode } => {
  if (!run) return { label: "Has never run", under: "Nothing has happened here yet" };
  const when = shown ? sayMoment(shown, run.startedAt as Instant) : "";
  const detail = run.detail ?? (run.ok ? "ran" : "failed");
  return {
    label: run.ok === false ? "Last run failed" : "Ran",
    under: run.ok === false
      ? <span data-ink="danger">{detail} · {when}</span>
      : `${detail} · ${when}`,
  };
};
