/**
 * ACTIONS — every generating thing every product does, and what it runs on.
 *
 * ⚠️ THE LIST IS DERIVED FROM THE MANIFESTS, so a product that adds a
 * generating action has it here the day it ships, with no console edit — and
 * one that removes it cannot leave a binding pointing at nothing.
 *
 * ⚠️ AND THE CHOICES ARE ONLY WHAT THE LANE CAN USE. Offering every row in the
 * catalogue is offering a binding that silently falls back, which reads as the
 * console not having saved.
 */

import { useState } from "react";
import { Button, Card, Chip } from "@heroui/react";
import {
  Await, Choice, LongText, RowsWaiting, Section, Stack, Tray, notice,
} from "@quad/web";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

interface Action {
  readonly id: string;
  readonly summary: string;
  readonly lane: string;
  readonly variables: readonly string[];
  readonly brandable: boolean;
  readonly declared: string;
  readonly prompt: string;
  readonly wordedBy: "app" | "operator" | "tenant";
  readonly model: string | null;
  readonly bound: string | null;
  readonly choices: readonly { readonly id: string; readonly label: string; readonly provider: string }[];
}

interface AiAnswer {
  readonly apps: readonly {
    readonly id: string; readonly name: string; readonly mark: string;
    readonly actions: readonly Action[];
  }[];
}

export function Actions() {
  const of = useLoad<AiAnswer>("op.ai");

  return (
    <Section label="Actions" under="What each product generates, and the model behind it">
      <Await
        of={of.of}
        waiting={<RowsWaiting rows={3} />}
        again={of.again}
        isNothing={(d) => d.apps.every((a) => a.actions.length === 0)}
        then={(data) => (
          <Stack space="roomy">
            {data.apps.filter((a) => a.actions.length).map((app) => (
              <Section key={app.id} label={`${app.mark} ${app.name}`}>
                <Stack space="snug">
                  {app.actions.map((action) => (
                    <Card key={action.id}>
                      <Card.Header>
                        <Card.Title>{action.summary}</Card.Title>
                        <Card.Description>{action.id} · {action.lane}</Card.Description>
                      </Card.Header>
                      <Card.Content>
                        <Stack space="snug">
                          <div className="flex flex-wrap items-center justify-between">
                            <span>{action.model ?? "No model in this lane"}</span>
                            {action.bound
                              ? <Chip color="accent" variant="soft"><Chip.Label>Bound</Chip.Label></Chip>
                              : <Chip color="default" variant="soft"><Chip.Label>Chosen for you</Chip.Label></Chip>}
                          </div>
                          <div className="flex flex-wrap items-center justify-between">
                            <span>
                              {action.wordedBy === "app" ? "The product's own words"
                                : action.wordedBy === "operator" ? "Your words"
                                  : "A workspace's words"}
                            </span>
                            {action.brandable
                              ? <Chip color="default" variant="soft"><Chip.Label>Workspaces may reword</Chip.Label></Chip>
                              : null}
                          </div>
                          <BindTray app={app.id} action={action} onDone={of.again} />
                        </Stack>
                      </Card.Content>
                    </Card>
                  ))}
                </Stack>
              </Section>
            ))}
          </Stack>
        )}
      />
    </Section>
  );
}

function BindTray({ app, action, onDone }: {
  readonly app: string;
  readonly action: Action;
  readonly onDone: () => void;
}) {
  const [prompt, setPrompt] = useState(action.prompt);

  const bind = async (change: Record<string, unknown>) => {
    const out = await api.post("op.ai.bind", { app, action: action.id, ...change });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Saved. The next run reads it.");
    onDone();
  };

  return (
    <Tray
      trigger={<Button variant="secondary">Change it</Button>}
      title={action.summary}
      actions={
        <Button slot="close" variant="primary" onPress={() => void bind({ prompt })}>
          Save the wording
        </Button>
      }
    >
      <Stack space="roomy">
        <Choice
          label="Model"
          value={action.bound}
          onChange={(v) => void bind({ model: v })}
          options={action.choices.map((c) => ({ id: c.id, label: c.label, help: c.provider }))}
          placeholder="Choose for me"
          help="Only models this lane can use. Choosing nothing lets the cheapest enabled one answer."
        />
        <LongText
          label="Instructions"
          value={prompt}
          onChange={setPrompt}
          help={`It may name ${action.variables.map((v) => `{${v}}`).join(", ")} and nothing else.`}
        />
        {action.wordedBy !== "app" ? (
          <Button variant="ghost" onPress={() => { setPrompt(action.declared); void bind({ prompt: null }); }}>
            Back to the product's own words
          </Button>
        ) : null}
      </Stack>
    </Tray>
  );
}
