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
  Agree, Choice, DateInput, Dial, Field, Grid, Lookup, LongText, MoneyInput, Words, Written,
  NumberInput, OneOf, Reveal, Screen, Section, Stack, Tags, TextInput, TimeInput,
  Viewfinder, notice,
} from "@engine/design";
import { GROUND } from "../index.js";
import { NOTES } from "./sample.js";

/** ⚠️ Options carry the word a person reads; the id is what crosses the wire. */
/* ⚠️ WHAT THIS WORKBOOK ALREADY FILES THINGS UNDER — see `Words.known`. A
   vocabulary rather than a free-text box: two notes under "meeting" and
   "meetings" are two topics, and search then finds neither reliably. */
const KNOWN_TOPICS = [
  { id: "meeting", label: "meeting" },
  { id: "decision", label: "decision" },
  { id: "pricing", label: "pricing" },
  { id: "hiring", label: "hiring" },
  { id: "roadmap", label: "roadmap" },
];

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
  const [reference, setReference] = React.useState("");

  /* ⚠️ THE REFUSAL IS THE CALLER'S WORDS AND IT APPEARS UNDER THE FIELD THAT WAS
     REFUSED — never in a summary at the top, which makes somebody scroll to find
     out which of eight fields is the problem. */
  const tooLong = heading.length > 80 ? "Keep a title under eighty characters" : undefined;

  /* ⚠️ THE COLOUR'S DECLARATION, READ FROM THE MANIFEST. A second copy of "a
     note has a colour" here is a second answer, and they drift the day somebody
     renames it. */
  const colourSpec = GROUND.collections.find((c) => c.id === "note")?.fields.colour;

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
            {/*
              ⚠️ `Written` RATHER THAN `LongText`, BECAUSE A NOTE'S BODY IS PROSE.
              What somebody types here has paragraphs in it and is read back on
              the note's own screen through `Prose` — so a control that can only
              be typed into shows the writing side of a field whose reading side
              is the point. The preview arrives with the first character and
              opens on the reading side when the field arrives full.
            */}
            <Written
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
            {/*
              ⚠️ `Words` IS THE CONTROL AND `Tags` IS THE READBACK, which is the
              pair this screen was missing half of. A `Tags` row shows what has
              been chosen and offers a way to remove one; adding is the other
              half, and without a control for it this form could only ever take
              topics away. `known` is what the workbook already files things
              under — a vocabulary rather than a free-text box, because two
              notes filed under "meeting" and "meetings" are two topics.
            */}
            <Words
              label="Topics"
              value={topics}
              onChange={(next) => setTopics([...next])}
              known={KNOWN_TOPICS}
              placeholder="Type a word"
              help="How search finds a note that does not say the word"
            />
            <Tags
              label="Filed under"
              items={topics.map((t) => ({ id: t, label: t }))}
              onRemove={(id) => setTopics((was) => was.filter((t) => t !== id))}
              help="Press the cross to take one off"
            />
          </Stack>
        </Section>

        <Section label="When, and how long">
          <Stack space="roomy">
            {/* ⚠️ TWO ACROSS ON A DESKTOP AND ONE ON A PHONE, from a minimum
                rather than a column count — a grid declared as "two columns"
                needs a breakpoint for every size it does not fit. */}
            <Grid least="panel" space="snug">
              <DateInput label="Happened on" onChange={() => undefined} />
              <TimeInput label="Time" onChange={() => undefined} />
            </Grid>
            <Grid least="panel" space="snug">
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

        {/*
          ⚠️ A NOTE CAN CARRY A REFERENCE, AND THAT IS WHERE THE CAMERA LIVES IN
          THIS APP. A serial number off the back of a machine, an ISBN, a ticket
          — the kind of string somebody would otherwise squint at and mistype.

          ⚠️ AND IT IS BEHIND A DISCLOSURE ON PURPOSE. The component starts the
          camera when it MOUNTS, so a viewfinder rendered open on a note form
          turns the phone's light on for somebody who came here to type.
        */}
        <Section label="A reference">
          <Stack space="roomy">
            <TextInput
              label="Reference"
              value={reference}
              onChange={setReference}
              placeholder="A serial number, an ISBN, a ticket"
              help="Whatever is printed on the thing this note is about"
              name="reference"
            />
            <Reveal label="Scan it instead">
              <Viewfinder
                says="Point it at the code on the thing"
                onRead={(code) => {
                  setReference(code);
                  notice.ok("Scanned.");
                }}
                /* ⚠️ THE WAY IN THAT ALWAYS WORKS, and it fills the same field
                   as the lens does — so a camera that will not start costs a
                   keystroke rather than the feature. */
                typed={{ label: "Or type it", placeholder: "What is printed on it" }}
              />
            </Reveal>
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
