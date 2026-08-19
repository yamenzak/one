/**
 * MODELS — what this deployment sells, and at what margin.
 *
 * ⚠️ THE QUESTION IS ALWAYS ABOUT A LANE, SO THE SCREEN IS SIX ROWS. "Does
 * anything answer text, and which one wins" is what somebody opens this to find
 * out. Flat, it was sixty rows of vendor prose in one scroll — every model in
 * every lane, each with a description, a price, a margin control and a switch —
 * and the answer to that question was somewhere in the middle of it. Six rows
 * that descend answer it at a glance (DESIGN.md §3, "descend, don't cram").
 *
 * ⚠️ TWO COLUMNS ARE DISCOVERED AND THREE ARE DECIDED. The name, the price and
 * what a model can do arrive nightly from the provider's own catalogue; whether
 * it is sold here, whether it is the lane's default and what margin it carries
 * are this screen's, and the sync never writes them. That is why the controls
 * are here and the facts are not editable.
 *
 * ⚠️ AND THE MARGIN IS NEVER OFFERED AS "AT COST". A reserve is a ceiling on
 * revenue — a charge can come in under an estimate and never over it — so a row
 * at one times cost breaks even at best, and a workspace is free to choose it as
 * often as it likes.
 */

import { useState } from "react";
import { Button } from "@heroui/react";
import {
  Group, ModelLine, NavRow, NumberInput, Row, Screen, SettledSwitch, Spacer, Stack, Tray,
  glyphOf, notice, per, perMillion, sentence,
} from "@engine/design";
import { LANES, type Lane } from "@engine/kernel";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";
import type { Where } from "../space/where.js";

interface Shown {
  readonly id: string;
  readonly provider: string;
  readonly task: string;
  readonly label: string;
  readonly about: string | null;
  readonly meter: string;
  readonly input: number;
  readonly output: number;
  readonly multiplier: number;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly thinks: boolean;
  readonly maxOutput: number;
  readonly retired: boolean;
  readonly lane: string | null;
}

interface Fault {
  readonly of: string;
  readonly why: string;
  readonly detail: string;
  /** ⚠️ Whether `of` is one of OUR lanes or a provider's own model path. */
  readonly lane: boolean;
}

/**
 * ⚠️ A LANE IS SAID AND A MODEL ID IS QUOTED, and the difference matters both
 * ways. "image" is one of our words and belongs in the reader's language;
 * `@cf/meta/llama-3.1-8b-instruct` is the provider's own spelling, and a screen
 * that tidied it would show an id that matches nothing anybody can look up.
 */
const subject = (f: Fault): string => (f.lane ? sentence(f.of) : f.of);

interface Answer {
  readonly models: readonly Shown[];
  readonly faults: readonly Fault[];
  readonly floor: number;
}

/** ⚠️ Answers no lane of ours — a real group, and never a fault. See below. */
const SPARE = "spare";

const laneOf = (m: Shown): string => m.lane ?? SPARE;

export function Models({ where, onGo }: {
  readonly where: Where & { at: "models" };
  readonly onGo: (to: Where) => void;
}) {
  const of = useLoad<Answer>("op.models");

  return (
    <Screen shape="list"
      under={where.lane
        ? "What answers this lane, and what each one earns"
        : "What this deployment sells, and at what margin"}
      of={of.of} again={of.again}
      nothing={{
        icon: glyphOf("bank"),
        says: "No models yet",
        under: "The nightly sync has not run, or there is no token to read it",
      }}
      then={(at) => (where.lane
        ? <InLane at={at} lane={where.lane} onDone={of.again} />
        : <Lanes at={at} onGo={onGo} />)}
    />
  );
}

/* ------------------------------------------------------------------ index --- */

/**
 * ⚠️ THE COUNT IS THE ROW'S WHOLE POINT — never make somebody count
 * (DESIGN.md §1.7). "3 of 22 on" and the name of the one that runs is the entire
 * answer to what a lane is doing, and it fits on the second line.
 */
function Lanes({ at, onGo }: {
  readonly at: Answer; readonly onGo: (to: Where) => void;
}) {
  const spare = at.models.filter((m) => laneOf(m) === SPARE);

  return (
    <>
      <Faults of={at.faults} />

      <Group label="Lanes" under="What an app asks for, and what answers it">
        {LANES.map((lane) => {
          const rows = at.models.filter((m) => m.lane === lane);
          const on = rows.filter((m) => m.enabled && !m.retired);
          const runs = on.find((m) => m.isDefault) ?? on[0];
          return (
            <NavRow
              key={lane}
              label={sentence(lane)}
              under={on.length
                ? `${on.length} of ${rows.length} on · ${runs?.label ?? ""}`
                : <span data-ink="warning">Nothing on</span>}
              onOpen={() => onGo({ at: "models", lane })}
            />
          );
        })}
      </Group>

      {/*
        ⚠️ NOT A FAULT, A GROUP. A provider's catalogue carries classifiers,
        translators, rerankers and detectors; this deployment offers six lanes
        and none of them is those. Reported per row as a problem, they were fifty
        red cards above the list — so the one entry that mattered was buried in
        them. They are simply not on offer, which is a fact and takes one row.
      */}
      {spare.length ? (
        <Group label="Not on offer">
          <NavRow
            label="Answers no lane"
            under={`${spare.length} models for tasks this deployment does not sell`}
            onOpen={() => onGo({ at: "models", lane: SPARE })}
          />
        </Group>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------- lane --- */

function InLane({ at, lane, onDone }: {
  readonly at: Answer; readonly lane: string; readonly onDone: () => void;
}) {
  const rows = at.models.filter((m) => laneOf(m) === lane);
  const on = rows.filter((m) => m.enabled && !m.retired).length;

  /* ⚠️ CHEAPEST FIRST, AND THE ONES THAT RUN ABOVE THEM. What is switched on is
     what somebody came to check; sorting by name puts it wherever the alphabet
     happens to leave it. */
  const order = [...rows].sort((a, b) =>
    Number(b.enabled) - Number(a.enabled)
    || Number(b.isDefault) - Number(a.isDefault)
    || (a.input + a.output) - (b.input + b.output));

  return (
    <>
      <Faults of={at.faults.filter((f) => f.of === lane
        || rows.some((m) => m.id === f.of))} />

      <Group
        label={lane === SPARE ? "Answers no lane" : sentence(lane)}
        under={lane === SPARE
          ? "Nothing will ever select these — their task maps to no lane of ours"
          : `${on} of ${rows.length} on`}
      >
        {order.map((m) => (
          <Sold key={m.id} model={m} floor={at.floor} onDone={onDone} />
        ))}
      </Group>
    </>
  );
}

/**
 * ⚠️ WHAT IS LEFT AFTER THE NOISE WENT. A fault here is a call that cannot work
 * or cannot pay: a lane with nothing enabled, a row switched on at zero, a row
 * switched on into no lane. Each is somebody's decision contradicting itself,
 * which is worth a red card; "we do not sell classifiers" is not.
 */
function Faults({ of }: { readonly of: readonly Fault[] }) {
  if (!of.length) return null;
  return (
    <Group label="Needs attention" under="Each one is a call that cannot work, or cannot pay">
      {of.map((f) => (
        <NavRow
          key={`${f.of}:${f.why}`}
          label={subject(f)}
          under={<span data-ink="danger">{f.detail}</span>}
        />
      ))}
    </Group>
  );
}

/* ------------------------------------------------------------------- sold --- */

/**
 * ⚠️ THE SWITCH IS IMMEDIATE AND EVERYTHING ELSE IS A SHEET. Turning a model on
 * is one decision with one obvious outcome; the margin is a number somebody
 * types and the default is a choice among the lane's rows, and neither belongs
 * inline beside a control that saves itself (DESIGN.md §5).
 *
 * ⚠️ AND THE SWITCH ANSWERS THE PRESS RATHER THAN THE ROUND TRIP — see
 * `SettledSwitch`. Drawn from the row it is about to change, it did not move
 * until a refetch landed, which on a long list also replaced everything under
 * the person's thumb. That is what "the switch doesn't work" was.
 */
function Sold({ model, floor, onDone }: {
  readonly model: Shown;
  readonly floor: number;
  readonly onDone: () => void;
}) {
  const [multiplier, setMultiplier] = useState<number | undefined>(model.multiplier);
  const [open, setOpen] = useState(false);

  const decide = async (change: Record<string, unknown>): Promise<boolean> => {
    const out = await api.post("op.model.decide", { model: model.id, ...change });
    if (!out.ok) { notice.fail(out.problem.title); return false; }
    onDone();
    return true;
  };

  return (
    <ModelLine
      label={model.label}
      id={model.id}
      meter={model.meter}
      input={model.input}
      output={model.output}
      multiplier={model.multiplier}
      thinks={model.thinks}
      retired={model.retired}
      isDefault={model.isDefault}
      controls={(
        <Row space="tight">
          {/* ⚠️ THE OPENER IS THE MARGIN, because that is the number somebody
              came to change and it is already on the row. A separate "Details"
              control would be a third hit target saying nothing. */}
          <Tray
            isOpen={open}
            onOpenChange={setOpen}
            trigger={(
              <Button variant="ghost" size="sm" aria-label={`About ${model.label}`}>
                ⋯
              </Button>
            )}
            title={model.label}
            actions={(
              <Button slot="close" variant="primary"
                onPress={() => { void decide({ multiplier }); }}
              >
                Save the margin
              </Button>
            )}
          >
            <Stack space="roomy">
              {/* ⚠️ THE PROVIDER'S OWN SPELLING, and this is where it lives now.
                  It is what the call is addressed to, so it must be quotable —
                  and it is read once, when somebody is working out which model
                  this is, rather than on every row of a list. */}
              <Row space="tight">
                <small data-ink="muted">Called</small>
                <Spacer />
                <small className="tabular-nums">{model.id}</small>
              </Row>
              {model.about ? <small data-ink="muted">{model.about}</small> : null}

              <NumberInput
                label="Margin"
                value={multiplier}
                onChange={setMultiplier}
                min={floor}
                step={0.5}
                help={`What a workspace pays, as a multiple of what this costs us.`
                  + ` Above ${floor}× — at cost, every call on this model loses money.`}
              />
              {/* ⚠️ THE ANSWER, NOT THE ARITHMETIC. Somebody setting a margin is
                  deciding what a customer sees, so what a customer will see is
                  the thing on the screen. */}
              <Row space="tight">
                <small data-ink="muted">They will pay</small>
                <Spacer />
                <small className="tabular-nums">
                  {perMillion(model.input * (multiplier ?? model.multiplier))}
                  {" / "}
                  {perMillion(model.output * (multiplier ?? model.multiplier))}
                  {` per ${per(model.meter)}`}
                </small>
              </Row>

              {/* ⚠️ ONE DEFAULT PER LANE, and pressing it clears the others — two
                  rows claiming it makes which one runs depend on row order. */}
              {model.enabled && !model.retired ? (
                <Button
                  variant={model.isDefault ? "primary" : "ghost"}
                  onPress={() => { void decide({ isDefault: !model.isDefault }); setOpen(false); }}
                >
                  {model.isDefault ? "Stop being the default" : "Make it the default"}
                </Button>
              ) : null}
            </Stack>
          </Tray>

          <SettledSwitch
            value={model.enabled}
            isDisabled={model.retired}
            onSet={(on) => decide({ enabled: on })}
          />
        </Row>
      )}
    />
  );
}
