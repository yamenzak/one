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
 *
 * ⚠️ AND THE CATALOGUE'S OWN FAULTS ARE DRAWN HERE, WHICH THEY WERE NOT.
 * `refuseCatalogue` states three things no other check can see — a row whose
 * task maps to no lane, two rows claiming one lane's default, and a row that is
 * enabled and priced at zero, which settles free on every call so usage looks
 * healthy until the provider's invoice arrives. It was written, argued for,
 * called, and answered over the wire to a screen that dropped it on the floor.
 * Declared and unmounted, one layer up from the usual.
 */

import { useState } from "react";
import { Button } from "@heroui/react";
import {
  Choice, FieldRow, Group, LongText, NavRow, Screen, Stack, Tray, Whichever,
  appFace, glyphOf, notice, sentence,
} from "@engine/design";
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
  readonly modelLabel: string | null;
  readonly bound: string | null;
  readonly choices: readonly {
    readonly id: string; readonly label: string; readonly provider: string;
    /** ⚠️ Credits per thousand units, before markup — what it costs us. */
    readonly input: number; readonly output: number;
  }[];
}

/** ⚠️ Something wrong with the deployment's model catalogue — see the header. */
interface Fault {
  readonly of: string;
  readonly why: string;
  readonly detail: string;
}

interface AiAnswer {
  readonly apps: readonly {
    readonly id: string; readonly name: string; readonly mark: string;
    readonly actions: readonly Action[];
  }[];
  readonly faults: readonly Fault[];
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
  const faults = of.of.data.faults;

  return (
    /* ⚠️ ONE PRODUCT AT A TIME — the same rule the workspace's own screens
       follow (DESIGN.md §3), and the same component. A deployment with six
       products and forty actions was one column of forty rows under six
       repeated headings. */
    <Whichever
      items={shown}
      id={(a) => a.id}
      name={(a) => a.name}
      face={(a) => appFace(a.id, a.mark)}
      chosen={app}
      onChoose={onGo}
      nothing={{ icon: glyphOf("sparkle"), says: "No product here declares a generating action" }}
      then={(chosen) => (
        <Screen shape="list" under="What answers each one, and whose words it uses">
          {/*
            ⚠️ THE CATALOGUE'S FAULTS FIRST, BECAUSE THEY OUTRANK EVERY ROW UNDER
            THEM. They are the DEPLOYMENT's rather than this product's — the card
            says so, because a fault shown on a product's screen otherwise reads
            as that product's. Repeated on each product's screen is not a
            duplicate: one of these screens is drawn at a time.
          */}
          {faults.length ? (
            <Group
              label="The model catalogue"
              /* ⚠️ THE SCOPE NOTE IS NOT AN ALARM. In danger ink beside two red
                 findings it was a third red line saying nothing was wrong — the
                 ink stops meaning "this one" the moment it is on everything. */
              under="Every product on this deployment draws from it"
            >
              {faults.map((f) => (
                <FieldRow
                  key={`${f.of}:${f.why}`}
                  label={f.of}
                  value={<span data-ink="danger">{sentence(f.why)}</span>}
                  under={f.detail}
                />
              ))}
            </Group>
          ) : null}

          {/*
            ⚠️ AN ACTION IS A ROW THAT OPENS ITS OWN SHEET. Each was a `Card`
            with a title, an id line, two label-and-chip pairs stacked in its
            content and a button under those — six elements to say what a row
            says in two. The sheet already existed; only the way in was a card.
          */}
          {/* ⚠️ THE PRODUCT NAMES ITS OWN CARD, because the crown cannot: the
              screen is "AI actions" for whichever product the address holds, and
              with a catalogue fault above it an unlabelled second card reads as
              more of the first one. */}
          <Group label={chosen.name} face={appFace(chosen.id, chosen.mark)}>
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
const said = (action: Action): React.ReactNode => {
  const words = action.wordedBy === "app" ? "the product's own words"
    : action.wordedBy === "operator" ? "your words"
      : "a workspace's words";
  /* ⚠️ AND ONE OF THE TWO IS NOT A FACT, IT IS A FAILURE. "No model in this
     lane" set in the same grey as a model's name is an action that CANNOT RUN,
     reading as an action that runs on something. */
  return action.model
    ? `${action.modelLabel ?? action.model} · ${words}`
    : <><span data-ink="danger">No model answers this lane</span>{` · ${words}`}</>;
};

/**
 * ⚠️ WHAT A CHOICE COSTS, IN THE PICKER, BECAUSE THAT IS THE CHOICE. The lane
 * elects the cheapest enabled row on its own, so binding one by hand is trading
 * money for something — and a picker showing only a provider hides which way.
 */
const price = (c: Action["choices"][number]): string =>
  `${c.provider} · ${c.input} in, ${c.output} out per 1k credits`;

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
          options={action.choices.map((c) => ({ id: c.id, label: c.label, help: price(c) }))}
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
