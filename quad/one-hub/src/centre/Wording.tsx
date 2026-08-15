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
import { Await, FormWaiting, LongText, Nothing, Row, Section, Stack, notice } from "@quad/web";
import { api } from "../api.js";
import { useLoad, type CentreApp, type CentreView } from "./data.js";

export interface WordingLine {
  readonly id: string;
  readonly summary: string;
  readonly variables: readonly string[];
  readonly declared: string;
  readonly prompt: string | null;
}

export function Wording({ view }: { readonly view: CentreView }) {
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

  return (
    <Stack space="roomy">
      {view.apps.map((app) => <AppWording key={app.id} app={app} />)}
    </Stack>
  );
}

function AppWording({ app }: { readonly app: CentreApp }) {
  const of = useLoad<{ items: readonly WordingLine[] }>("ai.wording", { app: app.id });

  return (
    <Await
      of={of.of}
      waiting={<FormWaiting fields={1} />}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      nothing={null}
      then={(data) => (
        <Section
          label={app.name}
          under="What it says on your behalf, when you want it said differently"
        >
          <Stack space="snug">
            {data.items.map((line) => (
              <WordingRow key={line.id} app={app} line={line} onDone={of.again} />
            ))}
          </Stack>
        </Section>
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
