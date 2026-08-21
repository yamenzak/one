/**
 * WORK — the runs and the jobs, which are the two halves of the regulated day.
 *
 * ⚠️ RUNS FIRST, AND THE ONES WAITING ON SOMEBODY ABOVE THE REST. A run that
 * finished and nobody has released is a load sitting in a machine and a person
 * who has not been told; it is the only thing on this screen that is waiting for
 * an action rather than reporting one, so it is what the screen opens with.
 *
 * ⚠️ AND A JOB IS NOT A RUN. One is a batch of things passing through a machine
 * and the other is a context consuming them — a case, a work order, a cook. They
 * share a screen because they share a day, and they share nothing else.
 */

import {
  Group, NavRow, NoteRow, Screen, Section, glyphOf, type Loaded,
} from "@engine/design";

/** One run, as a list needs it. */
export interface Runs {
  readonly id: string;
  readonly kind: string;
  readonly machine: string;
  readonly state: "open" | "ended" | "released" | "failed" | "recalled";
  readonly started: string;
  readonly items: number;
}

/** One job, as a list needs it. */
export interface Jobs {
  readonly id: string;
  readonly ref: string;
  readonly label: string;
  readonly state: "open" | "closed";
  readonly opened: string;
  /** ⚠️ How many of the things it used are now in doubt — see `job.trace`. */
  readonly doubted: number;
}

export interface WorkProps {
  readonly title?: string;
  readonly of: Loaded<readonly Runs[]>;
  readonly jobs: readonly Jobs[];
  readonly again: () => void;
  readonly onRun: (id: string) => void;
  readonly onJob: (id: string) => void;
  readonly onStart: () => void;
}

/* ⚠️ THE STANDING IN WORDS, AND `ended` IS THE ONE THAT MATTERS. "Finished" is
   what a machine did; "waiting to be released" is what a person has to do about
   it, and only the second gets somebody to go and look. */
export const SAID_RUN: Readonly<Record<Runs["state"], string>> = {
  open: "Running",
  ended: "Waiting to be released",
  released: "Released",
  failed: "Failed",
  recalled: "Called back",
};

const INK: Readonly<Record<Runs["state"], "danger" | "warning" | undefined>> = {
  open: undefined, ended: "warning", released: undefined,
  failed: "danger", recalled: "danger",
};

export function Work({ title, of, jobs, again, onRun, onJob, onStart }: WorkProps) {
  return (
    <Screen
      shape="list"
      title={title}
      under="Runs and the jobs that consume what they release"
      does={{ label: "Start a run", onDo: onStart }}
      of={of}
      again={again}
      isNothing={(rows) => rows.length === 0 && jobs.length === 0}
      nothing={{
        icon: glyphOf("check"),
        says: "Nothing running",
        under: "A cycle, a cure, a calibration — anything somebody signs for",
      }}
      then={(runs) => (
        <>
          {/*
            ⚠️ WAITING FIRST, AND SEPARATED FROM THE REST. A load that finished
            and nobody released is the one row on this screen somebody has to act
            on today; mixed into a list ordered by time it is a row they scroll
            past, and the load sits in the machine.
          */}
          {runs.some((r) => r.state === "ended")
            ? (
              <Section label="Waiting for somebody">
                <Group>
                  {runs.filter((r) => r.state === "ended").map((run) => (
                    <NavRow
                      key={run.id}
                      label={run.kind}
                      under={[run.machine, `${run.items} in it`].filter(Boolean).join(" · ")}
                      onOpen={() => { onRun(run.id); }}
                    />
                  ))}
                </Group>
              </Section>
            )
            : null}

          <Section label="Runs">
            <Group>
              {runs.filter((r) => r.state !== "ended").map((run) => (
                <NavRow
                  key={run.id}
                  label={run.kind}
                  under={(
                    <span data-ink={INK[run.state]}>
                      {SAID_RUN[run.state]}{run.machine ? ` · ${run.machine}` : ""}
                    </span>
                  )}
                  onOpen={() => { onRun(run.id); }}
                />
              ))}
              {runs.some((r) => r.state !== "ended") ? null : <NoteRow>Nothing else running</NoteRow>}
            </Group>
          </Section>

          <Section label="Jobs">
            <Group>
              {jobs.map((job) => (
                <NavRow
                  key={job.id}
                  label={job.label || job.ref}
                  /*
                    ⚠️ THE DOUBT IS ON THE ROW, BECAUSE IT ARRIVES AFTER THE FACT.
                    A job correct on Tuesday acquires a concern on Thursday — a
                    recall lands on a lot it used — and the whole point of
                    reading it backwards is that the LIST learns it too.
                  */
                  under={job.doubted
                    ? (
                      <span data-ink="danger">
                        {job.doubted} of what it used is in doubt
                      </span>
                    )
                    : job.state === "closed" ? `Closed · ${job.ref}` : job.ref}
                  onOpen={() => { onJob(job.id); }}
                />
              ))}
              {jobs.length ? null : <NoteRow>No jobs open</NoteRow>}
            </Group>
          </Section>
        </>
      )}
    />
  );
}
