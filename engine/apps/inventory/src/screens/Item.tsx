/**
 * ONE OBJECT — where it is, who has it, and what has been done to it.
 *
 * ⚠️ THIS IS THE SCREEN A NUMBER CANNOT HAVE. Everywhere else the app answers
 * "how many of this, here"; here it answers "this one" — the drill somebody
 * borrowed on Tuesday, the extinguisher due for inspection, the clamp that
 * failed. Every act on it is one press, because the alternative is a person
 * standing in a store room deciding not to bother.
 *
 * ⚠️ AND THE PRIMARY ACT IS WHATEVER ITS STANDING MAKES IT. A held object wants
 * giving out and an issued one wants taking back; offering both would put the
 * wrong one under the thumb half the time, and a retired object wants neither.
 */

import * as React from "react";
import {
  AmountRow, FieldRow, Group, NoteRow, Screen, Section, TextInput,
  Timeline, Tray, glyphOf, useShown, type Loaded, type Moment,
} from "@engine/design";
import { Button } from "@heroui/react";
import { sayDate, type Instant } from "@engine/kernel";
import type { Movement } from "./Thing.js";

/** One object the workspace keeps, as a screen needs it. */
export interface Kept {
  readonly id: string;
  /** Our own label — the only code in the workspace that names THIS object. */
  readonly code: string;
  readonly name: string;
  readonly product: string;
  readonly serial: string;
  readonly life: "held" | "issued" | "retired";
  readonly where: string;
  /** Who has it. Empty unless it is out. */
  readonly holder: string;
  readonly issued: string;
  /** The next service or calibration. Empty where nothing is booked. */
  readonly due: string;
  /** ⚠️ Worked out where the workspace's own threshold can be read — `unit.due`. */
  readonly standing: string;
  readonly days: number;
  readonly services: number;
  readonly retired: string;
  readonly note: string;
}

export interface ItemProps {
  readonly of: Kept;
  readonly history: Loaded<readonly Movement[]>;
  readonly again: () => void;
  readonly back: () => void;
  readonly onIssue: (holder: string) => void;
  readonly onReturn: () => void;
  readonly onServe: (of: { next: string; note: string }) => void;
  readonly onRetire: (reason: string) => void;
}

/* ⚠️ THE STANDING IN WORDS, AND THE COLUMN'S SPELLING IS NOT IT. `held` is what
   the database holds; "On the shelf" is what somebody reads.

   ⚠️ EXPORTED, BECAUSE THE PRODUCT'S SCREEN LISTS THESE TOO. Two spellings of
   "out with somebody" is how a list and the screen it opens come to describe one
   object differently. */
export const SAID: Readonly<Record<Kept["life"], string>> = {
  held: "On the shelf", issued: "Out with somebody", retired: "Retired",
};

const INK: Readonly<Record<string, "danger" | "warning" | undefined>> = {
  gone: "danger", soon: "warning", fine: undefined,
};

/** ⚠️ Signed, and said the way somebody would say it out loud. */
const saysDays = (days: number): string =>
  days < 0 ? `${Math.abs(days)} days ago`
    : days === 0 ? "today"
      : days === 1 ? "tomorrow"
        : `in ${days} days`;

/* ⚠️ THE VERB, NOT THE COLUMN — see `Thing`, which prints the same vocabulary. */
const MOVED: Readonly<Record<Movement["move"], string>> = {
  received: "Received", taken: "Taken", adjusted: "Corrected",
};

export function Item({
  of, history, again, back, onIssue, onReturn, onServe, onRetire,
}: ItemProps) {
  /* ⚠️ THE READER'S OWN CONVENTIONS. A stored instant printed as it is stored is
     the database's spelling shown to somebody who told us how they write a
     date. */
  const shown = useShown();
  const [holder, setHolder] = React.useState("");
  const [next, setNext] = React.useState("");
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [issuing, setIssuing] = React.useState(false);
  const [serving, setServing] = React.useState(false);
  const [retiring, setRetiring] = React.useState(false);

  const issue = () => {
    if (!holder.trim()) return;
    onIssue(holder);
    setIssuing(false);
    setHolder("");
  };

  const retireIt = () => {
    if (!reason.trim()) return;
    onRetire(reason);
    setRetiring(false);
    setReason("");
  };

  return (
    <Screen
      shape="detail"
      title={of.name}
      /* ⚠️ THE LABEL UNDER THE NAME, BECAUSE IT IS WHAT SOMEBODY IS HOLDING. A
         store room has four of these, and the label on the one in their hand is
         the only thing that says they are on the right screen. */
      under={[of.code, of.serial].filter(Boolean).join(" · ") || SAID[of.life]}
      back={back}
      /* ⚠️ ONE ACT UNDER THE THUMB AND IT IS THE ONE ITS STANDING MAKES. A
         retired object has nothing to offer, and a docked button that argued
         would be worse than none. */
      does={of.life === "held"
        ? { label: "Give it to somebody", onDo: () => { setIssuing(true); } }
        : of.life === "issued"
          ? { label: "Take it back", onDo: onReturn }
          : undefined}
      of={history}
      again={again}
      /* ⚠️ AN EMPTY HISTORY IS NEVER THIS SCREEN'S NOTHING — see `Thing`, which
         had exactly this defect. An object received this morning has no
         movements against it yet, and its standing, its holder and its next
         service are the whole reason somebody opened it. */
      isNothing={() => false}
      then={(moves) => (
        <>
          <Group label="Now">
            <FieldRow label="Standing" value={SAID[of.life]} />
            {of.holder
              ? (
                <FieldRow
                  label="With"
                  value={of.holder}
                  under={of.issued ? `Since ${of.issued}` : undefined}
                />
              )
              : null}
            {of.where ? <FieldRow label="Where" value={of.where} /> : null}
            {of.retired
              ? (
                <NoteRow icon={glyphOf("alert")}>
                  Retired on {of.retired}{of.note ? ` — ${of.note}` : ""}
                </NoteRow>
              )
              : null}
          </Group>

          {/*
            ⚠️ SERVICE IS ITS OWN SECTION AND IT IS THE ASSET CASE ENTIRE. A
            forklift, an extinguisher and a calibrated gauge are things nobody
            ever counts and everybody has to maintain — the date is the whole
            record, and the count beside it says whether anybody keeps it.
          */}
          {of.life !== "retired"
            ? (
              <Section label="Service">
                <Group
                  does={(
                    <Button variant="secondary" onPress={() => { setServing(true); }}>
                      Serviced
                    </Button>
                  )}
                >
                  {of.due
                    ? (
                      <AmountRow
                        label="Next service"
                        under={of.due}
                        amount={<span data-ink={INK[of.standing]}>{saysDays(of.days)}</span>}
                      />
                    )
                    /* ⚠️ SAID RATHER THAN LEFT BLANK. "Nothing is booked" is a
                       fact about a machine somebody is responsible for; an empty
                       row reads as a screen that failed to load one. */
                    : <NoteRow>Nothing is booked</NoteRow>}
                  <FieldRow
                    label="Services"
                    value={String(of.services)}
                    under={of.services === 0 ? "None recorded yet" : undefined}
                  />
                </Group>
              </Section>
            )
            : null}

          <Section label="History">
            {moves.length
              ? (
                <Timeline
                  moments={moves.map((m): Moment => ({
                    id: m.id,
                    label: MOVED[m.move],
                    when: sayDate(shown, m.at as Instant, "short"),
                    under: [m.where, m.reason].filter(Boolean).join(" · "),
                  }))}
                />
              )
              : <NoteRow>Nothing has happened to it yet</NoteRow>}
          </Section>

          {/*
            ⚠️ RETIRING IS THE LAST THING ON THE SCREEN AND IT IS BEHIND A REASON.
            "Dropped", "failed calibration", "sold" and "stolen" are four
            different facts about a business, and an object that left with none of
            them recorded is shrinkage nobody can explain.
          */}
          {/*
            ⚠️ A TRAY RATHER THAN A CONFIRMATION, AND THE REASON IS THE REASON.
            "Are you sure?" is a question with two answers; this one cannot be
            done without saying why, so it is a form — and a confirmation sheet
            whose button is dead until somebody types is a confirmation that has
            become a form with the wrong furniture.
          */}
          {of.life === "held"
            ? (
              <Group
                label="The end of it"
                under="It comes off the shelf and stays off"
                does={(
                  <Button variant="secondary" onPress={() => { setRetiring(true); }}>
                    Retire it
                  </Button>
                )}
              >
                <NoteRow>It stays in the history with the reason beside it</NoteRow>
              </Group>
            )
            : null}

          <Tray
            isOpen={retiring}
            onOpenChange={setRetiring}
            title="Retire this one"
            actions={(
              <Button variant="danger" isDisabled={!reason.trim()} onPress={retireIt}>
                Retire it
              </Button>
            )}
          >
            <TextInput
              label="Why"
              value={reason}
              onChange={setReason}
              name="reason"
              help="Dropped, failed calibration, sold, stolen"
              onSubmit={retireIt}
            />
          </Tray>

          {/* ⚠️ CONTROLLED RATHER THAN TRIGGERED, because the thing that opens
              this is the DOCKED act — a tray with its own trigger would put a
              second "give it to somebody" on the screen. */}
          <Tray
            isOpen={issuing}
            onOpenChange={setIssuing}
            title="Give it to somebody"
            actions={(
              <Button variant="primary" isDisabled={!holder.trim()} onPress={issue}>
                Issue it
              </Button>
            )}
          >
            <TextInput
              label="Who has it"
              value={holder}
              onChange={setHolder}
              name="holder"
              help="A name is enough. It is what you will ask for it back by"
              onSubmit={issue}
            />
          </Tray>

          <Tray
            isOpen={serving}
            onOpenChange={setServing}
            title="Record a service"
            actions={(
              <Button
                variant="primary"
                onPress={() => {
                  onServe({ next, note });
                  setServing(false);
                  setNext("");
                  setNote("");
                }}
              >
                Record it
              </Button>
            )}
          >
            {/* ⚠️ THE NEXT DATE IS ASKED FOR RATHER THAN COMPUTED. An interval is
                a fact about a regime — annual, six-monthly, every 500 hours — and
                a default would print a confident date nobody chose on a fire
                extinguisher. */}
            <TextInput
              label="Next service"
              value={next}
              onChange={setNext}
              name="next"
              placeholder="2027-03-31"
              help="Leave it empty if nothing is booked"
            />
            <TextInput label="Note" value={note} onChange={setNote} name="note" />
          </Tray>
        </>
      )}
    />
  );
}
