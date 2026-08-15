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
import { Button, Chip } from "@heroui/react";
import {
  Choice, Group, LongText, NavRow, Screen, Stack, Tray, Whichever, glyphOf, notice,
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

export function Actions({ app, onGo }: {
  readonly app?: string;
  readonly onGo: (appId: string) => void;
}) {
  const of = useLoad<AiAnswer>("op.ai");

  /* ⚠️ THE OUTER WAIT CANNOT BE A `Screen`, BECAUSE `Whichever` RENDERS ONE.
     Two would draw two crowns; so this resolves the answer first and hands the
     shape over. The waiting and trouble cases still get a framed screen — see
     `Part.tsx` for the same seam and the same reason. */
  if (of.of.status !== "ready") {
    return <Screen shape="list" of={of.of} again={of.again} then={() => null} />;
  }
  const shown = of.of.data.apps.filter((a) => a.actions.length);

  return (
    /* ⚠️ ONE PRODUCT AT A TIME — the same rule the workspace's own screens
       follow (DESIGN.md §3), and the same component. A deployment with six
       products and forty actions was one column of forty rows under six
       repeated headings. */
    <Whichever
      items={shown}
      id={(a) => a.id}
      name={(a) => a.name}
      icon={glyphOf("sparkle")}
      chosen={app}
      onChoose={onGo}
      nothing={{ says: "No product here declares a generating action" }}
      then={(chosen) => (
        <Screen shape="list">
          {/*
            ⚠️ AN ACTION IS A ROW THAT OPENS ITS OWN SHEET. Each was a `Card`
            with a title, an id line, two label-and-chip pairs stacked in its
            content and a button under those — six elements to say what a row
            says in two. The sheet already existed; only the way in was a card.
          */}
          <Group>
            {chosen.actions.map((action) => (
              <BindTray key={action.id} app={chosen.id} action={action} onDone={of.again} />
            ))}
          </Group>
        </Screen>
      )}
    />
  );
}

/**
 * ⚠️ THE TWO FACTS AN OPERATOR OPENED THIS FOR: what answers it, and whose
 * words it uses. The lane and the action's id are in the sheet, where somebody
 * changing a binding needs them — on the row they are a second line of
 * identifiers under a summary that already named the thing.
 */
const said = (action: Action): string => [
  action.model ?? "No model in this lane",
  action.wordedBy === "app" ? "the product's own words"
    : action.wordedBy === "operator" ? "your words"
      : "a workspace's words",
].join(" · ");

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
      trigger={<NavRow label={action.summary} under={said(action)} />}
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
