/**
 * IN YOUR WORDS — what the AI features say on this workspace's behalf.
 *
 * ⚠️ ONLY WHAT THE PRODUCT SAID IS YOURS. The server sends the brandable
 * actions and nothing else, so this screen cannot offer a wording the write
 * would refuse — and a drafting tone being the workspace's while an extraction
 * rule is not is the product's decision, said once in its manifest (D19).
 *
 * ⚠️ AND IT IS ITS OWN SCREEN NOW, NOT A THIRD SECTION UNDER SETTINGS. It sat
 * below every product's settings and every product's notification policy, so
 * the one thing on that page a workspace edits deliberately was the one thing
 * nobody scrolled to.
 */

import { useState } from "react";
import { Button, Card } from "@heroui/react";
import {
  Await, FormWaiting, Group, LongText, NavRow, Nothing, Row, Stack, glyphOf, notice,
} from "@quad/web";
import { api } from "../api.js";
import { useLoad, type CentreApp, type CentreView } from "./data.js";

export interface WordingLine {
  readonly id: string;
  readonly summary: string;
  readonly variables: readonly string[];
  readonly declared: string;
  readonly prompt: string | null;
}

export function Wording({ view, app, onGo }: {
  readonly view: CentreView;
  readonly app?: string;
  readonly onGo: (appId: string) => void;
}) {
  /* ⚠️ Changing what a product says on the workspace's behalf is the
     workspace's decision, so it needs the workspace's authority. */
  if (!view.you.platform.includes("tenant:manage")) {
    return (
      <Nothing
        says="Only an owner or a manager may change these words"
        under="Ask somebody who runs this workspace"
      />
    );
  }

  /* ⚠️ ONE PRODUCT IS THE SCREEN; SEVERAL ARE A LIST — the same rule Settings
     follows, for the same reason (DESIGN.md §3). Nobody pays a tap for a menu
     with one item on it, and nobody should read six products' prompts stacked. */
  const only = view.apps.length === 1 ? view.apps[0] : undefined;
  const chosen = app ? view.apps.find((a) => a.id === app) : only;

  if (!chosen) {
    return (
      <Group>
        {view.apps.map((a) => (
          <NavRow key={a.id} icon={glyphOf("note")} label={a.name} onOpen={() => onGo(a.id)} />
        ))}
      </Group>
    );
  }

  return <AppWording app={chosen} />;
}

function AppWording({ app }: { readonly app: CentreApp }) {
  const of = useLoad<{ items: readonly WordingLine[] }>("ai.wording", { app: app.id });

  return (
    <Await
      of={of.of}
      waiting={<FormWaiting fields={1} />}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      /* ⚠️ SAID, NOT SILENT. A product with nothing to reword used to render
         literally nothing, so a workspace whose only product has no brandable
         action got a screen with a heading and no content — which reads as a
         page that failed to load rather than as an answer. */
      nothing={(
        <Nothing
          says="Nothing here is yours to reword"
          under={`Every AI feature ${app.name} has uses the product's own words`}
        />
      )}
      then={(data) => (
        <Stack space="snug">
          {data.items.map((line) => (
            <WordingRow key={line.id} app={app} line={line} onDone={of.again} />
          ))}
        </Stack>
      )}
    />
  );
}

function WordingRow({ app, line, onDone }: {
  readonly app: CentreApp;
  readonly line: WordingLine;
  readonly onDone: () => void;
}) {
  const [text, setText] = useState(line.prompt ?? line.declared);

  const save = async (prompt: string | null) => {
    const out = await api.post("ai.word", { app: app.id, action: line.id, prompt });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(prompt === null ? "Back to the product's own words." : "Saved.");
    onDone();
  };

  return (
    <Card>
      <Card.Header>
        <Card.Title>{line.summary}</Card.Title>
        <Card.Description>
          {line.prompt ? "In your words" : "The product's own words"}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Stack space="snug">
          <LongText
            label="Instructions"
            value={text}
            onChange={setText}
            help={`It may name ${line.variables.map((v) => `{${v}}`).join(", ")} and nothing else.`}
          />
          <Row>
            <Button variant="primary" onPress={() => void save(text)}>Save</Button>
            {line.prompt
              ? (
                <Button variant="ghost" onPress={() => { setText(line.declared); void save(null); }}>
                  Use the product's words
                </Button>
              )
              : null}
          </Row>
        </Stack>
      </Card.Content>
    </Card>
  );
}
