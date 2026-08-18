/**
 * WHICH MODEL ANSWERS WHICH LANE, AND WHAT IT COSTS.
 *
 * ⚠️ AN APP DECLARES LANES, NOT MODELS. `text`, `vision`, `speech` — what a
 * product needs is a capability; which model provides it is a decision the
 * deployment makes and changes. This screen is where those two meet, and it is
 * the only place a person can see that a lane an app asks for has nothing
 * enabled behind it.
 *
 * ⚠️ A LANE WITH NO MODEL IS THE FAILURE WORTH RENDERING. Every call into it
 * refuses, for ever, and the refusal reads to the customer as a feature that is
 * broken rather than one nobody switched on.
 *
 * ⚠️ AND ONE LANE HAS TWO PROVIDER NAMES. Cloudflare calls it `tts`, Google
 * calls it `speech`; a selector matching on one name cannot see the other's
 * models, and the app then reports that no voice is available while four are
 * enabled. `inLane` is what this reads, so the screen and the selector cannot
 * disagree.
 */

import type { Lane, ModelRow } from "@engine/kernel";
import { defaultIn, inLane } from "@engine/kernel";
import { Card, Chip, Switch, Label } from "@heroui/react";
import { SPACE } from "../tokens/metrics.js";

export interface LanesProps {
  /** What the app asked for. */
  readonly lanes: readonly Lane[];
  readonly models: readonly ModelRow[];
  readonly onEnable: (modelId: string, on: boolean) => void;
}

export function AiLanes({ lanes, models, onEnable }: LanesProps) {
  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {lanes.map((lane) => {
        const rows = inLane(models, lane);
        const chosen = defaultIn(models, lane);

        return (
          <Card key={lane}>
            <Card.Header>
              <Card.Title>{lane}</Card.Title>
              <Card.Description>
                {chosen ? `${chosen.label} answers this` : "Nothing answers this"}
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <div className={`flex flex-col ${SPACE.snug}`}>
                {/* ⚠️ Said plainly, because every call into it refuses for ever. */}
                {!chosen
                  ? (
                    <Chip color="danger" variant="primary">
                      <Chip.Label>This app asks for {lane} and no enabled model answers it</Chip.Label>
                    </Chip>
                  )
                  : null}

                {rows.map((model) => (
                  <div key={model.id} className={`flex items-center justify-between ${SPACE.snug}`}>
                    <div className="flex flex-col">
                      <strong>{model.label}</strong>
                      {/* ⚠️ The id IS the provider path, so what is shown is what
                          is called — a friendly name over a hidden path is how a
                          catalogue comes to disagree with itself. */}
                      <small>{model.id}</small>
                    </div>
                    <div className={`flex items-center ${SPACE.snug}`}>
                      <Chip color="default" variant="soft">
                        <Chip.Label>in {model.input} / out {model.output} per 1k</Chip.Label>
                      </Chip>
                      {model.thinks
                        ? (
                          <Chip color="warning" variant="soft">
                            <Chip.Label>Thinks — bills for tokens nobody asked for</Chip.Label>
                          </Chip>
                        )
                        : null}
                      <Switch
                        isSelected={model.enabled}
                        onChange={(on) => onEnable(model.id, on)}
                      >
                        <Switch.Control><Switch.Thumb /></Switch.Control>
                        <Switch.Content><Label>{model.enabled ? "On" : "Off"}</Label></Switch.Content>
                      </Switch>
                    </div>
                  </div>
                ))}
              </div>
            </Card.Content>
          </Card>
        );
      })}
    </div>
  );
}
