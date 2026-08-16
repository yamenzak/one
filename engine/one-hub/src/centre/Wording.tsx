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
  LongText, Row, Screen, Stack, Whichever, appFace, notice,
} from "@engine/design";
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
  const mayNot = !view.you.platform.includes("tenant:manage");

  /* ⚠️ THE REFUSAL IS CONTENT, NOT AN EARLY RETURN. Returned above the frame it
     took the crown with it — a sentence alone on a page with no name and no way
     back (`screen.tsx`). */
  if (mayNot) {
    return (
      <Screen
        shape="settings"
        refused={{
          says: "Only an owner or a manager may change these words",
          under: "Ask somebody who runs this workspace",
        }}
      />
    );
  }

  /* ⚠️ One product is the screen; several are a list — see `Whichever`. */
  return (
    <Whichever
      items={view.apps}
      id={(a) => a.id}
      name={(a) => a.name}
      face={(a) => appFace(a.id, a.mark)}
      chosen={app}
      onChoose={onGo}
      nothing={{ says: "Nothing here is yours to reword" }}
      then={(a) => <AppWording app={a} />}
    />
  );
}

function AppWording({ app }: { readonly app: CentreApp }) {
  const of = useLoad<{ items: readonly WordingLine[] }>("ai.wording", { app: app.id });

  return (
    /* ⚠️ `settings` — each wording saves itself. And SAID, not silent: a product
       with nothing to reword used to render literally nothing, so a workspace
       whose only product has no brandable action got a heading over no content,
       which reads as a page that failed to load rather than as an answer. */
    <Screen
      shape="settings"
      of={of.of}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      nothing={{
        says: "Nothing here is yours to reword",
        under: `Every AI feature ${app.name} has uses the product's own words`,
      }}
      then={(data) => (
        <>
          {data.items.map((line) => (
            <WordingRow key={line.id} app={app} line={line} onDone={of.again} />
          ))}
        </>
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
