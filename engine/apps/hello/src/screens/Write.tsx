/**
 * WRITE A NOTE — the `form` shape, and where the control grammar is judged.
 *
 * ⚠️ EVERY CONTROL SPEAKS FOUR SENTENCES — a label, a help line, a refusal and
 * whether it is disabled — and the whole point of the grammar is that they land
 * in the same place on all of them. That cannot be checked one control at a
 * time: it looks right on any single field and comes apart on a form, where a
 * help line under one control and beside the next is what a person actually
 * sees. So the fields below are one form rather than a catalogue.
 *
 * ⚠️ THE FORM IS HAND-COMPOSED AND THE SETTINGS SCREEN IS NOT, AND BOTH ARE
 * CORRECT. A setting is a declaration, so `Field` picks its control and nobody
 * writes the screen. A note is a thing somebody is composing: the order matters,
 * one field is the title, and "how long did it take" belongs beside "what did it
 * cost" rather than wherever the manifest happens to list it. Autodiscovery
 * builds a console; a person writing something needs a page.
 *
 * ⚠️ EXCEPT THE COLOUR, WHICH COMES FROM THE DECLARATION. There is no
 * hand-composed colour control and there should not be — a swatch, an area, a
 * hue slider and a hex field is the library's `ColorPicker`, and `Field` already
 * reaches for it. Where the declaration has the better answer, the form uses it.
 */

import * as React from "react";
import {
  Agree, Choice, DateInput, Dial, Field, Grid, Lookup, LongText, MoneyInput,
  NumberInput, OneOf, Screen, Section, Stack, Tags, TextInput, TimeInput, notice,
} from "@engine/design";
import { HELLO } from "../index.js";
import { NOTES } from "./sample.js";

/** ⚠️ Options carry the word a person reads; the id is what crosses the wire. */
const KINDS = [
  { id: "idea", label: "Idea", help: "Something to come back to" },
  { id: "decision", label: "Decision", help: "What was settled, and why" },
  { id: "question", label: "Question", help: "Something nobody knows yet" },
  { id: "record", label: "Record", help: "What happened, for later" },
] as const;

const WHO = [
  { id: "everybody", label: "Everybody here" },
  { id: "writers", label: "Writers only" },
] as const;

export function Write({ title, onBack, onSave }: {
  readonly title?: string;
  readonly onBack: () => void;
  readonly onSave: () => void;
}) {
  const [heading, setHeading] = React.useState("");
  const [body, setBody] = React.useState("");
  const [kind, setKind] = React.useState<string | null>(null);
  const [minutes, setMinutes] = React.useState(30);
  const [cost, setCost] = React.useState(0);
  const [confidence, setConfidence] = React.useState(60);
  const [follows, setFollows] = React.useState<string | null>(null);
  const [colour, setColour] = React.useState<unknown>("#3f7d58");
  const [audience, setAudience] = React.useState<string | null>("everybody");
  const [topics, setTopics] = React.useState<readonly string[]>(["week 33"]);
  const [publish, setPublish] = React.useState(false);

  /* ⚠️ THE REFUSAL IS THE CALLER'S WORDS AND IT APPEARS UNDER THE FIELD THAT WAS
     REFUSED — never in a summary at the top, which makes somebody scroll to find
     out which of eight fields is the problem. */
  const tooLong = heading.length > 80 ? "Keep a title under eighty characters" : undefined;

  /* ⚠️ THE COLOUR'S DECLARATION, READ FROM THE MANIFEST. A second copy of "a
     note has a colour" here is a second answer, and they drift the day somebody
     renames it. */
  const colourSpec = HELLO.collections.find((c) => c.id === "note")?.fields.colour;

  return (
    <Screen
      shape="form"
      title={title}
      back={onBack}
      leave="back"
      /* ⚠️ ONE SUBMIT, AND IT IS THE PRIMARY. A form with two equal buttons is a
         form where somebody presses the wrong one — a draft is what happens when
         you leave, not a second control. */
      does={{ label: "Save the note", onDo: () => { onSave(); notice.ok("Saved."); }, disabled: !heading.trim() }}
    >
      <Stack space="roomy">
        {/*
          ⚠️ NO PROGRESS ROW, AND THE FIRST DRAFT HAD ONE. `Steps` printed "What
          it says · When and how long · Who sees it" directly above three section
          headings reading exactly that — the same three phrases, twice, an inch
          apart. A progress row belongs to a sequence of PAGES, where the steps
          somebody cannot see are the whole point of drawing them; on one page
          the headings already are the progress.
        */}
        <Section label="What it says">
          <Stack space="roomy">
            <TextInput
              label="Title"
              value={heading}
              onChange={setHeading}
              placeholder="One line, the way you would say it out loud"
              error={tooLong}
              autoFocus
              name="title"
            />
            <LongText
              label="Body"
              value={body}
              onChange={setBody}
              help="Whatever follows the title. Nobody reads a note twice, so put the point first"
            />
            {/* ⚠️ A CHOICE IS FOR A HANDFUL, A LOOKUP IS FOR TOO MANY TO SCROLL.
                Four kinds is a `Choice`; every note in the workbook is a
                `Lookup`, because typing has to narrow it. */}
            <Choice
              label="Kind"
              value={kind}
              onChange={setKind}
              options={KINDS}
              placeholder="Choose one"
            />
            <Tags
              label="Topics"
              items={topics.map((t) => ({ id: t, label: t }))}
              onRemove={(id) => setTopics((was) => was.filter((t) => t !== id))}
              help="How search finds a note that does not say the word"
            />
          </Stack>
        </Section>

        <Section label="When, and how long">
          <Stack space="roomy">
            {/* ⚠️ TWO ACROSS ON A DESKTOP AND ONE ON A PHONE, from a minimum
                rather than a column count — a grid declared as "two columns"
                needs a breakpoint for every size it does not fit. */}
            <Grid min="14rem" space="snug">
              <DateInput label="Happened on" onChange={() => undefined} />
              <TimeInput label="Time" onChange={() => undefined} />
            </Grid>
            <Grid min="14rem" space="snug">
              <NumberInput
                label="Minutes it took"
                value={minutes}
                onChange={setMinutes}
                min={0}
                max={600}
              />
              {/* ⚠️ MONEY IS ITS OWN CONTROL BECAUSE MINOR UNITS ARE. A number
                  field holding euros is a float, and a float is a rounding
                  error with a currency symbol on it. */}
              {/* ⚠️ AN ISO CODE HERE AND A SYMBOL ON `Money` — see `MoneyInput`. */}
              <MoneyInput label="What it cost" currency="EUR" value={cost} onChange={setCost} />
            </Grid>
            {/* ⚠️ A DIAL IS FOR A VALUE WITH NO RIGHT ANSWER — a preference, a
                confidence, a threshold. Anything somebody would type exactly is
                a number field. */}
            <Dial
              label="How sure are you"
              value={confidence}
              onChange={setConfidence}
              format={{ style: "unit", unit: "percent" }}
              help="It goes on the note, so a reader knows how much to lean on it"
            />
          </Stack>
        </Section>

        <Section label="Who sees it">
          <Stack space="roomy">
            {/* ⚠️ `OneOf` SHOWS EVERY OPTION AND `Choice` HIDES THEM. Two options
                whose difference matters are worth the two rows; twelve are not. */}
            <OneOf label="Audience" value={audience} onChange={setAudience} options={WHO} />
            <Lookup
              label="Follows"
              value={follows}
              onChange={setFollows}
              options={NOTES.map((n) => ({ id: n.id, label: n.title }))}
              placeholder="The note this came out of"
            />
            {colourSpec ? (
              <Field
                name="colour"
                spec={colourSpec}
                value={colour}
                onChange={setColour}
              />
            ) : null}
            <Agree
              label="Publish it when it saves"
              value={publish}
              onChange={setPublish}
              help="Everybody here is told once. There is no quiet way to undo it"
            />
          </Stack>
        </Section>

        {/*
          ⚠️ AND NO SAVE BUTTON DOWN HERE EITHER, WHICH THIS SCREEN'S OWN HEADER
          ALREADY FORBADE AND THE FIRST DRAFT DID ANYWAY. "Save the note" in the
          crown, "Save" at the foot and "Leave it" beside it is three controls
          for two acts, and leaving is what the back arrow is. One submit.
        */}
      </Stack>
    </Screen>
  );
}
