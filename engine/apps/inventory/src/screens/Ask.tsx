/**
 * ASKING IN WORDS — the screen for people who will not learn navigation.
 *
 * ⚠️ IT REPLACES NAVIGATION RATHER THAN DECORATING IT. "Do we have blue resin",
 * "what expires this month", "where is the torque wrench" are three screens and
 * a filter each, and they are all one sentence somebody would say out loud. The
 * person who will never be trained is the person this product is for, and this
 * is the surface that needs nothing explained.
 *
 * ⚠️ AND THE ANSWER SAYS HOW MUCH IT LOOKED AT. What goes to the model is a
 * BOUNDED summary of the stock, because a reserve is computed from what is sent
 * — so a workspace with four thousand lines would otherwise pay for all of them
 * on every question. A bound nobody is told about is an answer of "you have
 * none" over a shelf that has some, which is the worst thing this screen could
 * ever say.
 */

import * as React from "react";
import {
  ActionRow, Await, Group, NoteRow, Num, Screen, Section, TextInput, TextWaiting, glyphOf,
  type Loaded,
} from "@engine/design";

/** What one question came back as. */
export interface Answer {
  readonly answer: string;
  /** How many stock lines the model was shown. */
  readonly looked: number;
}

export interface AskProps {
  readonly title?: string;
  /** ⚠️ `null` before anything has been asked — which is not an empty state. */
  readonly of: Loaded<Answer | null>;
  /** How many lines the workspace holds altogether, so a bound can be said. */
  readonly lines: number;
  readonly onAsk: (question: string) => void;
  readonly again: () => void;
}

/*
  ⚠️ THREE EXAMPLES RATHER THAN AN EXPLANATION, and they are the three real
  shapes: have we got it, when does it run out, where is it. Somebody who reads
  one of these knows what the box is for without a sentence about capabilities —
  and pressing one asks it, because the fastest way to learn what a thing does is
  to watch it do something.
*/
const LIKE: readonly string[] = [
  "Do we have any blue resin",
  "What runs out this month",
  "Where is the torque wrench",
];

export function Ask({ title, of, lines, onAsk, again }: AskProps) {
  const [question, setQuestion] = React.useState("");

  const ask = (words: string) => {
    const said = words.trim();
    if (!said) return;
    setQuestion(said);
    onAsk(said);
  };

  return (
    <Screen
      shape="decision"
      title={title}
      under="Ask about the stock the way you would ask a colleague"
      does={{ op: "stock.ask", label: "Ask", onDo: () => { ask(question); }, disabled: !question.trim() }}
    >
      <TextInput
        label="What do you want to know"
        value={question}
        onChange={setQuestion}
        onSubmit={() => { ask(question); }}
        placeholder={LIKE[0]}
        name="question"
      />

      <Await
        of={of}
        again={again}
        /* ⚠️ SHAPED LIKE A PARAGRAPH, because that is what is coming. A row
           skeleton under a question box promises a list and delivers a
           sentence. */
        waiting={<TextWaiting lines={3} />}
        then={(answer) => (answer
          ? (
            <Group label="The answer">
              <NoteRow icon={glyphOf("sparkle")}>{answer.answer}</NoteRow>
              {/*
                ⚠️ SAID ONLY WHERE IT IS NOT THE WHOLE PICTURE. On a workspace of
                forty lines the bound is invisible and mentioning it is noise; on
                one of four thousand it is the difference between "we have none"
                and "none of the two hundred lines I read".
              */}
              {answer.looked < lines
                ? (
                  <NoteRow>
                    {/* ⚠️ THROUGH `Num`, BOTH OF THEM. Written into the string
                        this reads "Read 200 of your 4000 lines" — one grouped
                        figure would be worse still, and here neither was. A
                        count is a number a person compares. */}
                    {/* ⚠️ THE SENTENCE NAMES ITS SUBJECT. "Read 2 of your 6
                        lines" leaves who read them to the reader, under a
                        heading that says The answer — so the caveat that is the
                        whole reason for the row is the one part that is a
                        guess. */}
                    <span data-ink="warning">
                      Answered from <Num value={answer.looked} /> of your{" "}
                      <Num value={lines} /> lines
                    </span>
                  </NoteRow>
                )
                : null}
            </Group>
          )
          /* ⚠️ NOT AN EMPTY STATE — nothing has been asked, which is the
             beginning rather than a fault. The examples below are the whole
             content of the screen at this moment. */
          : <NoteRow>The answer will appear here</NoteRow>)}
      />

      <Section label="Things people ask">
        <Group>
          {LIKE.map((words) => (
            /* ⚠️ PRESSING ONE ASKS IT. An example somebody has to retype is an
               example somebody reads and ignores.

               ⚠️ AND IT IS A ROW, NOT A BUTTON IN A CARD. A bare `Button` here
               brings none of a row's grammar — measured, its text sat 32px in
               where every other row in the product sits at 16, and it carried
               no floor under its height. `ActionRow` is the shape for an item
               in a list that DOES something rather than going somewhere. */
            <ActionRow key={words} label={words} onDo={() => { ask(words); }} />
          ))}
        </Group>
      </Section>

      {/*
        ⚠️ SAID ONCE, PLAINLY, AND NOT AS A DISCLAIMER. It reads what is
        recorded — so a shelf nobody has counted since spring answers from a
        number nobody has checked since spring, and that is worth knowing before
        somebody drives across town on the strength of it.
      */}
      <NoteRow>It reads what is recorded, which is only as good as the last count</NoteRow>
    </Screen>
  );
}
