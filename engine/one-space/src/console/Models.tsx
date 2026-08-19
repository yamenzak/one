/**
 * MODELS — what this deployment sells, and at what margin.
 *
 * ⚠️ THIS SCREEN DID NOT EXIST, AND ITS ABSENCE WAS THE WHOLE GAP. The catalogue
 * had no store, no sync and nowhere to look, so the AI actions screen correctly
 * reported that no model answered any lane and there was nothing anybody could
 * do about it from the product.
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
import { Button, Label, Switch } from "@heroui/react";
import {
  Cluster, Group, ModelLine, NumberInput, Row, Screen, Spacer, Stack, Tray,
  glyphOf, notice, sentence,
} from "@engine/design";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

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

export function Models() {
  const of = useLoad<Answer>("op.models");

  return (
    <Screen shape="list" under="What this deployment sells, and at what margin"
      of={of.of} again={of.again}
      nothing={{
        icon: glyphOf("bank"),
        says: "No models yet",
        under: "The nightly sync has not run, or there is no token to read it",
      }}
      then={(at) => {
        /*
          ⚠️ GROUPED BY LANE, BECAUSE THE QUESTION IS ALWAYS ABOUT A LANE. "Does
          anything answer text" is what somebody opens this to find out; a flat
          list of two hundred rows sorted by name answers it only by reading all
          of them.
        */
        const lanes = [...new Set(at.models.map((m) => m.lane ?? "unmapped"))].sort();

        return (
          <>
            {at.faults.length ? (
              <Group label="Needs attention" under="Each one is a call that cannot work, or cannot pay">
                {at.faults.map((f) => (
                  <Row key={`${f.of}:${f.why}`} space="tight">
                    <Stack space="tight">
                      <strong>{subject(f)}</strong>
                      <small data-ink="danger">{f.detail}</small>
                    </Stack>
                  </Row>
                ))}
              </Group>
            ) : null}

            {lanes.map((lane) => {
              const rows = at.models.filter((m) => (m.lane ?? "unmapped") === lane);
              const on = rows.filter((m) => m.enabled && !m.retired).length;
              return (
                <Group
                  key={lane}
                  label={lane === "unmapped" ? "Answers no lane" : sentence(lane)}
                  under={lane === "unmapped"
                    ? "Nothing will ever select these — their task maps to no lane of ours"
                    : `${on} of ${rows.length} on`}
                >
                  {rows.map((m) => (
                    <Sold key={m.id} model={m} floor={at.floor} onDone={of.again} />
                  ))}
                </Group>
              );
            })}
          </>
        );
      }}
    />
  );
}

/**
 * ⚠️ THE SWITCH IS IMMEDIATE AND THE MARGIN IS A SHEET. Turning a model on is one
 * decision with one obvious outcome; changing what it earns is a number somebody
 * types, and a number typed inline is a number saved halfway through.
 */
function Sold({ model, floor, onDone }: {
  readonly model: Shown;
  readonly floor: number;
  readonly onDone: () => void;
}) {
  const [multiplier, setMultiplier] = useState<number | undefined>(model.multiplier);

  const decide = async (change: Record<string, unknown>) => {
    const out = await api.post("op.model.decide", { model: model.id, ...change });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Saved. The next call reads it.");
    onDone();
  };

  return (
    <ModelLine
      label={model.label}
      id={model.id}
      about={model.about}
      meter={model.meter}
      /* ⚠️ THE OPERATOR SEES THE COST, NOT THE PRICE. What a workspace pays is
         the product of this and the multiplier beside it — shown apart here
         precisely so the margin is legible to the person setting it. */
      input={model.input}
      output={model.output}
      thinks={model.thinks}
      retired={model.retired}
      controls={(
        <Cluster space="tight">
          <Tray
            trigger={<Button variant="ghost" size="sm">{model.multiplier}× cost</Button>}
            title={model.label}
            actions={(
              <Button slot="close" variant="primary"
                onPress={() => void decide({ multiplier })}
              >
                Save the margin
              </Button>
            )}
          >
            <Stack space="roomy">
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
                  {Math.round(model.input * (multiplier ?? model.multiplier))}
                  {" in / "}
                  {Math.round(model.output * (multiplier ?? model.multiplier))}
                  {" out per 1k"}
                </small>
              </Row>
            </Stack>
          </Tray>

          {/* ⚠️ ONE DEFAULT PER LANE, and pressing it clears the others — two rows
              claiming it makes which one runs depend on row order. */}
          {model.enabled && !model.retired ? (
            <Button
              variant={model.isDefault ? "primary" : "ghost"}
              size="sm"
              onPress={() => void decide({ isDefault: !model.isDefault })}
            >
              {model.isDefault ? "Default" : "Make default"}
            </Button>
          ) : null}

          <Switch
            isSelected={model.enabled}
            isDisabled={model.retired}
            onChange={(on) => void decide({ enabled: on })}
          >
            <Switch.Control><Switch.Thumb /></Switch.Control>
            <Switch.Content><Label>{model.enabled ? "On" : "Off"}</Label></Switch.Content>
          </Switch>
        </Cluster>
      )}
    />
  );
}
