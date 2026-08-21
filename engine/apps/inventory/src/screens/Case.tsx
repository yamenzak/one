/**
 * ONE JOB — what it consumed, and whether any of it is now in doubt.
 *
 * ⚠️ IT READS BACKWARDS, AND THAT IS THE WHOLE FEATURE. A job correct on Tuesday
 * acquires a concern on Thursday — a recall lands on a lot it used — without
 * anything about the job changing. A status written when the job closed can
 * never learn that, which is why the doubt is computed at read time from what the
 * batches say NOW.
 *
 * ⚠️ AND THE DOUBT IS THE TOP OF THE SCREEN. Somebody opening a closed job is
 * almost always opening it because they were told to; the list of what it used
 * is context, and the two lines that are in question are the answer.
 */

import * as React from "react";
import {
  AmountRow, FieldRow, Group, NoteRow, Num, Screen, Section, glyphOf, useShown,
  type Loaded,
} from "@engine/design";
import { Button } from "@heroui/react";
import { sayDate, type Instant } from "@engine/kernel";

/** One thing a job consumed. */
export interface Used {
  readonly movement: string;
  readonly product: string;
  readonly name: string;
  readonly quantity: number;
  readonly lot: string;
  readonly at: string;
  /** ⚠️ Empty where nothing is wrong — `held` or `not released` otherwise. */
  readonly doubt: string;
}

export interface CaseProps {
  readonly of: Loaded<readonly Used[]>;
  readonly ref: string;
  readonly label: string;
  readonly state: "open" | "closed";
  readonly opened: string;
  readonly closed: string;
  readonly again: () => void;
  readonly back: () => void;
  readonly onClose: () => void;
  readonly onOpenProduct: (product: string) => void;
  readonly busy?: boolean;
}

/* ⚠️ THE DOUBT IN WORDS, AND THE TWO ARE GENUINELY DIFFERENT. Frozen means
   nobody may use any more of it; not released means this job used something a
   run never signed for, which is a different conversation with a different
   person. */
const SAID: Readonly<Record<string, string>> = {
  held: "That lot is frozen",
  "not released": "That lot was never released",
};

export function Case({
  of, ref, label, state, opened, closed, again, back, onClose, onOpenProduct, busy,
}: CaseProps) {
  const shown = useShown();
  const rows = of.status === "ready" ? of.data : [];
  const doubted = React.useMemo(() => rows.filter((r) => r.doubt), [rows]);

  return (
    <Screen
      shape="detail"
      title={label || ref}
      under={label ? ref : state === "closed" ? "Closed" : "Open"}
      back={back}
      does={state === "open"
        ? { op: "job.close", label: "Close it", onDo: onClose, disabled: busy === true }
        : undefined}
      of={of}
      again={again}
      /* ⚠️ A JOB THAT CONSUMED NOTHING IS NOT AN EMPTY SCREEN — it is a job
         somebody opened this morning, and its reference is why they are here. */
      isNothing={() => false}
      then={(used) => (
        <>
          {/*
            ⚠️ THE DOUBT FIRST, ALWAYS. It is the answer to the question anybody
            opens a closed job with, and it arrived after the job was finished —
            so putting it under a list of everything the job used is putting the
            answer under the working.
          */}
          {doubted.length
            ? (
              <Section label="In doubt">
                <Group>
                  <NoteRow icon={glyphOf("alert")}>
                    <span data-ink="danger">
                      <Num value={doubted.length} /> of what this used is in question now
                    </span>
                  </NoteRow>
                  {doubted.map((row) => (
                    <AmountRow
                      key={row.movement}
                      label={row.name}
                      under={[row.lot ? `Lot ${row.lot}` : "", SAID[row.doubt] ?? row.doubt]
                        .filter(Boolean).join(" · ")}
                      amount={<span data-ink="danger"><Num value={row.quantity} /></span>}
                      onOpen={() => { onOpenProduct(row.product); }}
                    />
                  ))}
                </Group>
              </Section>
            )
            : null}

          <Group label="Now">
            {/* ⚠️ NO REFERENCE ROW: THE CROWN IS ALWAYS ALREADY SHOWING IT. A
                job with a name carries the reference under its title, and a job
                without one is TITLED by it — so the row was the heading said a
                second time, either way, three lines below itself. */}
            <FieldRow label="Standing" value={state === "closed" ? "Closed" : "Open"} />
            <FieldRow label="Opened" value={sayDate(shown, opened as Instant, "short")} />
            {closed
              ? <FieldRow label="Closed" value={sayDate(shown, closed as Instant, "short")} />
              : null}
            {/* ⚠️ SAID WHERE IT IS TRUE, because "nothing is in doubt" is a real
                answer to the question somebody came with — and an absent section
                is indistinguishable from one that failed to load. */}
            {doubted.length ? null : <NoteRow>Nothing it used is in question</NoteRow>}
          </Group>

          <Section label="What it used">
            <Group>
              {used.map((row) => (
                <AmountRow
                  key={row.movement}
                  label={row.name}
                  under={[
                    row.lot ? `Lot ${row.lot}` : "",
                    sayDate(shown, row.at as Instant, "short"),
                  ].filter(Boolean).join(" · ")}
                  amount={<Num value={row.quantity} />}
                  onOpen={() => { onOpenProduct(row.product); }}
                />
              ))}
              {used.length
                ? null
                : (
                  <NoteRow>
                    Nothing yet. Take stock against this job and it appears here
                  </NoteRow>
                )}
            </Group>
          </Section>

          {/* ⚠️ A CLOSED JOB IS STILL READ, AND SAYING SO IS THE POINT. Closing
              is not archiving: the trace is the reason the record exists, and it
              keeps answering long after the work finished. */}
          {state === "closed"
            ? (
              <Group label="After it closed">
                <NoteRow>
                  This still reads what the batches say now, so a recall next month
                  will show here
                </NoteRow>
                <Button variant="ghost" onPress={again}>Look again</Button>
              </Group>
            )
            : null}
        </>
      )}
      nothing={{ icon: glyphOf("note"), says: "Nothing used yet" }}
    />
  );
}
