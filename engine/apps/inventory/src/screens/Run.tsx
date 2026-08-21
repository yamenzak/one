/**
 * ONE RUN — what was in it, what happened, and who said it may be used.
 *
 * ⚠️ THE ACT IS THE STANDING, AND THERE IS ONLY EVER ONE. A run still loading is
 * finished; one that finished is released or failed; one that was released can be
 * called back. Offering all four at once would put the most consequential button
 * on the product beside the most ordinary one, every time.
 *
 * ⚠️ AND RELEASING IS NOT A CONFIRMATION, IT IS A SIGNATURE. "Are you sure?" over
 * a load nobody has looked at is a formality people learn to press through — so
 * the evidence is a field somebody fills, the sheet names what it will do, and
 * the whole gesture takes as long as reading the printout does.
 */

import * as React from "react";
import {
  AmountRow, Confirm, FieldRow, Group, NoteRow, Screen, Section, TextInput,
  Tray, glyphOf, useShown, type Loaded,
} from "@engine/design";
import { Button } from "@heroui/react";
import { sayDate, type Instant } from "@engine/kernel";
import { SAID_RUN } from "./Work.js";

/** One thing the run covered, and what the run decided about it. */
export interface Covered {
  readonly batch: string;
  readonly lot: string;
  readonly name: string;
  readonly verdict: "pending" | "released" | "failed" | "lifted";
  readonly reason: string;
  /** ⚠️ How much of it is still on a shelf — what a recall could reach. */
  readonly quantity: number;
}

export interface RunProps {
  readonly of: Loaded<readonly Covered[]>;
  readonly kind: string;
  readonly machine: string;
  readonly state: "open" | "ended" | "released" | "failed" | "recalled";
  readonly started: string;
  readonly ended: string;
  readonly released: string;
  readonly evidence: string;
  readonly again: () => void;
  readonly back: () => void;
  readonly onEnd: (evidence: string) => void;
  readonly onRelease: () => void;
  readonly onFail: (reason: string) => void;
  readonly onRecall: (reason: string) => void;
  readonly onLift: (batch: string, reason: string) => void;
  readonly busy?: boolean;
}

/* ⚠️ THE VERDICT IN WORDS, AND `lifted` IS THE ONE THAT HAS TO BE EXACT.
   "Unfrozen — still not released" is the whole rule in four words; anything
   shorter reads as "fine now", which is precisely what it is not. */
const SAID: Readonly<Record<Covered["verdict"], string>> = {
  pending: "Waiting",
  released: "Released",
  failed: "Frozen",
  lifted: "Unfrozen — still not released",
};

const INK: Readonly<Record<Covered["verdict"], "danger" | "warning" | undefined>> = {
  pending: undefined, released: undefined, failed: "danger", lifted: "warning",
};

export function Run({
  of, kind, machine, state, started, ended, released, evidence,
  again, back, onEnd, onRelease, onFail, onRecall, onLift, busy,
}: RunProps) {
  const shown = useShown();
  const [says, setSays] = React.useState(evidence);
  const [why, setWhy] = React.useState("");
  const [ending, setEnding] = React.useState(false);
  const [failing, setFailing] = React.useState(false);
  const [lifting, setLifting] = React.useState<string | null>(null);

  /*
    ⚠️ ONE ACT, AND THE STANDING CHOOSES IT. `undefined` on a run that is over —
    a docked button on a released load would be one that can only argue, and it
    is the control a thumb finds first.
  */
  const does = state === "open"
    ? { op: "process.end", label: "It has finished", onDo: () => { setEnding(true); } }
    : state === "ended"
      ? { op: "process.release", label: "Release it", onDo: onRelease, disabled: busy === true }
      : undefined;

  return (
    <Screen
      shape="detail"
      title={kind}
      under={[machine, SAID_RUN[state]].filter(Boolean).join(" · ")}
      back={back}
      does={does}
      of={of}
      again={again}
      /* ⚠️ AN EMPTY RUN IS NOT AN EMPTY SCREEN. A run somebody just opened has
         nothing in it yet, and its standing and its dates are the reason they
         are looking at it. */
      isNothing={() => false}
      then={(items) => (
        <>
          <Group label="Now">
            <FieldRow label="Standing" value={SAID_RUN[state]} />
            {/* ⚠️ THROUGH `sayDate`, LIKE THE THREE UNDER IT. Written straight
                out this was an ISO stamp — "2026-08-21" over "Aug 21, 2026" in
                the very next row, two formats for the same kind of fact an inch
                apart, and neither one the reader's own. */}
            <FieldRow label="Started" value={sayDate(shown, started as Instant, "short")} />
            {ended
              ? <FieldRow label="Finished" value={sayDate(shown, ended as Instant, "short")} />
              : null}
            {released
              ? <FieldRow label="Released" value={sayDate(shown, released as Instant, "short")} />
              : null}
            {evidence ? <FieldRow label="Evidence" value={evidence} /> : null}
            {/*
              ⚠️ SAID PLAINLY WHERE IT IS TRUE, because it is the whole design.
              A machine finishing its cycle is a fact about a machine; a person
              has to read the printout and put their name to it.
            */}
            {state === "ended"
              ? (
                <NoteRow icon={glyphOf("alert")}>
                  <span data-ink="warning">
                    Finished, and nobody has released it. Nothing in it may be used yet
                  </span>
                </NoteRow>
              )
              : null}
          </Group>

          <Section label="In the run">
            <Group>
              {items.map((item) => (
                <AmountRow
                  key={item.batch}
                  label={item.name}
                  under={[item.lot ? `Lot ${item.lot}` : "", item.reason]
                    .filter(Boolean).join(" · ") || undefined}
                  amount={<span data-ink={INK[item.verdict]}>{SAID[item.verdict]}</span>}
                  /* ⚠️ LIFTING IS OFFERED ONLY ON WHAT IS ACTUALLY FROZEN.
                     Anything else would be a release arriving by the wrong
                     door — see `mayLift`. */
                  aside={item.verdict === "failed"
                    ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        isDisabled={busy}
                        onPress={() => { setLifting(item.batch); setWhy(""); }}
                      >
                        Unfreeze
                      </Button>
                    )
                    : undefined}
                />
              ))}
              {items.length ? null : <NoteRow>Nothing in it yet</NoteRow>}
            </Group>
          </Section>

          {/*
            ⚠️ FAILING AND CALLING BACK ARE THE SAME CARD IN TWO STANDINGS, and
            neither shares a card with the ordinary acts above. Both freeze
            stock; one happens before anybody relied on it and one happens after,
            which is the difference between an inconvenience and a phone call.
          */}
          {state === "ended" || state === "released"
            ? (
              <Group
                label={state === "ended" ? "If it failed" : "If it was wrong"}
                under={state === "ended"
                  ? "Everything in it is frozen until somebody looks"
                  : "Everything still on a shelf is frozen, and what is gone is named"}
                does={(
                  <Button
                    variant="secondary"
                    isDisabled={busy}
                    onPress={() => { setFailing(true); setWhy(""); }}
                  >
                    {state === "ended" ? "Fail it" : "Call it back"}
                  </Button>
                )}
              >
                <NoteRow>
                  {state === "ended"
                    ? "Nothing has been released, so nothing has been used"
                    : "What was already used cannot be frozen. It will be named"}
                </NoteRow>
              </Group>
            )
            : null}

          {/* ⚠️ THE EVIDENCE IS A FIELD RATHER THAN A CONFIRMATION, because it is
              the thing somebody actually has to have looked at. */}
          <Tray
            isOpen={ending}
            onOpenChange={setEnding}
            title="Record that it finished"
            actions={(
              <Button
                variant="primary"
                onPress={() => { onEnd(says); setEnding(false); }}
              >
                It has finished
              </Button>
            )}
          >
            <TextInput
              label="Evidence"
              value={says}
              onChange={setSays}
              name="evidence"
              help="The printout, the indicator lot, the certificate — what somebody would go and look at"
            />
            <NoteRow>This records the cycle. It releases nothing</NoteRow>
          </Tray>

          <Tray
            isOpen={failing}
            onOpenChange={setFailing}
            title={state === "released" ? "Call this run back" : "Fail this run"}
            actions={(
              <Button
                variant="danger"
                isDisabled={!why.trim()}
                onPress={() => {
                  if (state === "released") onRecall(why);
                  else onFail(why);
                  setFailing(false);
                  setWhy("");
                }}
              >
                {state === "released" ? "Call it back" : "Fail it"}
              </Button>
            )}
          >
            <TextInput
              label="Why"
              value={why}
              onChange={setWhy}
              name="why"
              help="The indicator, the reading, the report — what says it was wrong"
            />
          </Tray>

          {/*
            ⚠️ UNFREEZING IS BEHIND A REASON AND SAYS WHAT IT DOES NOT DO. The
            whole risk of this control is somebody reading "unfreeze" as "it is
            fine now" — a tray whose steriliser failed is not sterile because
            somebody pressed a button.
          */}
          <Tray
            isOpen={lifting !== null}
            onOpenChange={(open) => { if (!open) setLifting(null); }}
            title="Unfreeze this one"
            actions={(
              <Button
                variant="secondary"
                isDisabled={!why.trim()}
                onPress={() => {
                  if (lifting) onLift(lifting, why);
                  setLifting(null);
                  setWhy("");
                }}
              >
                Unfreeze it
              </Button>
            )}
          >
            <NoteRow icon={glyphOf("alert")}>
              <span data-ink="warning">
                It becomes usable again and it is still not released. It has to be run again
              </span>
            </NoteRow>
            <TextInput label="Why" value={why} onChange={setWhy} name="lift" />
          </Tray>

          {/* ⚠️ A RECALLED RUN KEEPS ITS RECORD AND OFFERS NOTHING. What comes
              next is a new run, not an edit of this one. */}
          {state === "recalled"
            ? (
              <Confirm
                trigger={<Button slot="trigger" variant="ghost">What now?</Button>}
                title="Called back"
                act={{ label: "Close", tone: "primary", onDo: back }}
              >
                Everything still on a shelf is frozen. What was already used is named
                above — those are the ones somebody has to be told about.
              </Confirm>
            )
            : null}
        </>
      )}
      nothing={{ icon: glyphOf("check"), says: "Nothing in it yet" }}
    />
  );
}
