/**
 * IN YOUR WORDS — what a product says on this workspace's behalf.
 *
 * ⚠️ ONLY WHAT THE PRODUCT SAID IS YOURS. The server sends the brandable
 * actions and the brandable messages and nothing else, so this screen cannot
 * offer a wording the write would refuse — and a drafting tone being the
 * workspace's while an extraction rule is not is the product's decision, said
 * once in its manifest (D19).
 *
 * ⚠️ AND IT IS ITS OWN SCREEN NOW, NOT A THIRD SECTION UNDER SETTINGS. It sat
 * below every product's settings and every product's notification policy, so
 * the one thing on that page a workspace edits deliberately was the one thing
 * nobody scrolled to.
 *
 * ⚠️ TWO KINDS OF WORDS, ONE SCREEN, BECAUSE IT IS ONE QUESTION. A prompt is
 * instructions to a model and a letter is text a customer reads verbatim — but
 * somebody arriving here is asking "what does this product say as us", and
 * splitting that across two destinations means finding out twice that the
 * answer is partly ours. What separates them is a section, not an address.
 */

import { useState } from "react";
import { Button, Card } from "@heroui/react";
import {
  Group, LongText, NoteRow, Row, Screen, Section, Stack, TextInput, Whichever, appFace,
  both, glyphOf, notice,
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

/** One message a workspace may send in its own words. */
export interface LetterLine {
  readonly id: string;
  readonly label: string;
  /** What the product says when the workspace has not written anything. */
  readonly declared: string;
  readonly variables: readonly string[];
  readonly letter: {
    readonly subject: string;
    readonly body: string;
    readonly signature?: string;
  } | null;
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
          icon: glyphOf("shield"),
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
      nothing={{ icon: glyphOf("note"), says: "Nothing here is yours to reword" }}
      then={(a) => <AppWording app={a} />}
    />
  );
}

function AppWording({ app }: { readonly app: CentreApp }) {
  const prompts = useLoad<{ items: readonly WordingLine[] }>("ai.wording", { app: app.id });
  const letters = useLoad<{ used: boolean; items: readonly LetterLine[] }>(
    "notify.wording", { app: app.id });
  /* ⚠️ ONE WAITING, ONE TROUBLE, ONE NOTHING — see `both`. Two Awaits side by
     side draw two skeletons and then two empty states, which reads as a page
     that half-loaded. */
  const of = both(prompts.of, letters.of);
  const again = () => { prompts.again(); letters.again(); };

  return (
    /* ⚠️ `settings` — each wording saves itself. And SAID, not silent: a product
       with nothing to reword used to render literally nothing, so a workspace
       whose only product has no brandable action got a heading over no content,
       which reads as a page that failed to load rather than as an answer. */
    <Screen
      shape="settings"
      of={of}
      again={again}
      isNothing={([ai, mail]) => ai.items.length === 0 && mail.items.length === 0}
      nothing={{
        icon: glyphOf("note"),
        says: "Nothing here is yours to reword",
        under: `Everything ${app.name} says, it says in the product's own words`,
      }}
      then={([ai, mail]) => (
        <>
          {/* ⚠️ A SECTION ONLY WHERE THERE IS SOMETHING IN IT. A heading over no
              rows is the half-loaded picture the joined state exists to end, and
              a product with prompts and no letters is the ordinary case. */}
          {ai.items.length
            ? (
              <Section
                label="What the AI is told"
                under="Instructions to the model, not text anybody reads"
              >
                {ai.items.map((line) => (
                  <WordingRow key={line.id} app={app} line={line} onDone={again} />
                ))}
              </Section>
            )
            : null}

          {mail.items.length
            ? (
              <Section
                label="What your messages say"
                under="Sent as written, over your name"
              >
                {/*
                  ⚠️ SAID BEFORE ANYTHING IS TYPED, NOT AFTER IT IS SAVED. A
                  letter only goes out in a workspace's own words where that
                  workspace has switched its email over — so without the line
                  above it, this is an editor whose work silently changes
                  nothing, which is the shape every guard in this repository
                  exists to catch.
                */}
                {mail.used
                  ? null
                  : (
                    <NoteRow icon={glyphOf("alert")}>
                      <span data-ink="warning">
                        These go out in our words until Email is switched on in
                        Brand
                      </span>
                    </NoteRow>
                  )}
                {mail.items.map((line) => (
                  <LetterRow key={line.id} app={app} line={line} onDone={again} />
                ))}
              </Section>
            )
            : null}
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
    <Group
      label={line.summary}
      under={line.prompt ? "In your words" : "The product's own words"}
    >
      {/* ⚠️ NO `Stack` — a card is already one. Nested, the card's own rhythm
          applied to the stack and the stack's to its children, so these two sat
          12 apart where every other card spaces its children 24. See
          `design/test/rhythm.test.tsx`. */}
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
    </Group>
  );
}

/**
 * ONE MESSAGE, IN THE WORKSPACE'S OWN WORDS.
 *
 * ⚠️ THREE FIELDS RATHER THAN ONE, BECAUSE A LETTER HAS THREE PARTS AND ONLY THE
 * SUBJECT IS READ BEFORE IT IS OPENED. A single box would put the line somebody
 * decides on in the middle of the text they are writing.
 *
 * ⚠️ AND THE SIGNATURE IS OPTIONAL RATHER THAN DEFAULTED. A business signing off
 * as itself is the point of this screen; one signing off as a name the product
 * invented for it is worse than not signing off at all.
 *
 * ⚠️ THE VARIABLES ARE SAID, AND THE SERVER IS WHAT REFUSES. A template naming
 * something the message never carries is an email with `{who}` in it, sent to a
 * customer — so it is checked at the write and the sentence comes back here.
 */
function LetterRow({ app, line, onDone }: {
  readonly app: CentreApp;
  readonly line: LetterLine;
  readonly onDone: () => void;
}) {
  const [subject, setSubject] = useState(line.letter?.subject ?? "");
  const [body, setBody] = useState(line.letter?.body ?? line.declared);
  const [signature, setSignature] = useState(line.letter?.signature ?? "");

  const save = async (letter: LetterLine["letter"]) => {
    const out = await api.post("notify.word", { app: app.id, type: line.id, letter });
    if (!out.ok) {
      /* ⚠️ THE DETAIL, WHICH IS THE HALF THAT SAYS WHICH VARIABLE. "Invalid" over
         three fields does not tell anybody what to change. */
      notice.fail(out.problem.detail ?? out.problem.title);
      return;
    }
    notice.ok(letter === null ? "Back to the product's own words." : "Saved.");
    onDone();
  };

  const mine = () => { void save({ subject, body, ...(signature ? { signature } : {}) }); };

  return (
    <Group
      label={line.label}
      under={line.letter ? "In your words" : "The product's own words"}
    >
      <TextInput
        label="Subject"
        value={subject}
        onChange={setSubject}
        name={`${line.id}-subject`}
        help="The line somebody reads before they open it"
      />
      <LongText
        label="What it says"
        value={body}
        onChange={setBody}
        help={line.variables.length
          ? `It may name ${line.variables.map((v) => `{${v}}`).join(", ")} and nothing else.`
          : "It may not name anything in braces — this message carries no details."}
      />
      <TextInput
        label="Sign off"
        value={signature}
        onChange={setSignature}
        name={`${line.id}-signature`}
        help="Left empty, it ends with the message"
      />
      <Row>
        <Button
          variant="primary"
          isDisabled={!subject.trim() || !body.trim()}
          onPress={mine}
        >
          Save
        </Button>
        {line.letter
          ? (
            <Button
              variant="ghost"
              onPress={() => {
                setSubject("");
                setBody(line.declared);
                setSignature("");
                void save(null);
              }}
            >
              Use the product's words
            </Button>
          )
          : null}
      </Row>
    </Group>
  );
}
