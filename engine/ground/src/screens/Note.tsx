/**
 * ONE NOTE — the `detail` shape, and the screen somebody arrives at.
 *
 * ⚠️ A DETAIL SCREEN IS WHERE THE OVERLAYS LIVE, and that is not a coincidence.
 * A menu, a confirmation, a definition and a full-screen presentation are all
 * things you do TO a subject, so a list has nowhere honest to put them and a
 * settings sheet has no subject to do them to. Every one of them was shipped
 * and drawn nowhere until this screen existed.
 *
 * ⚠️ THE TABS SPLIT ONE SUBJECT, NEVER THREE DESTINATIONS. What it says, what
 * happened to it, and its facts are three facets of one note — if any of them
 * were somewhere you could link somebody to, it would be a screen.
 *
 * ⚠️ AND DELETING ASKS FIRST, IN THE WORDS OF THE THING IT DOES. "Delete note",
 * never "Yes" — somebody under a dialog reads the buttons before the question,
 * and this is the one press that cannot be taken back.
 */

import * as React from "react";
import { Button, Chip } from "@heroui/react";
import {
  Center, Confirm, CopyRow, Dialog, FieldRow, Figure, Group, Hint, Hotkey, Menu,
  Money,
  NoteRow, Over, PageTabs, Peek, Prose, Row, Screen, SectionTitle, Stack, Tags,
  Timeline, glyphOf, type Moment,
} from "@engine/design";
import { TRAIL, noteName, personName, type Note as OneNote } from "./sample.js";

/** ⚠️ Sentence case from an id, because the wire value is not a word. */
const KIND: Readonly<Record<OneNote["kind"], string>> = {
  idea: "Idea", decision: "Decision", question: "Question", record: "Record",
};

export function Note({ title, note, onBack, onPublish, onOpen }: {
  readonly title?: string;
  readonly note: OneNote;
  readonly onBack: () => void;
  readonly onPublish: () => void;
  readonly onOpen: (id: string) => void;
}) {
  const [tab, setTab] = React.useState("says");
  const [presenting, setPresenting] = React.useState(false);
  const [topics, setTopics] = React.useState<readonly string[]>(["onboarding", "email", "week 33"]);

  const moments: readonly Moment[] = TRAIL;

  return (
    <Screen
      shape="detail"
      /* ⚠️ THE NOTE'S OWN NAME BEATS THE DECLARED ONE. A router knows the screen
         is called "A note"; only the screen knows which note. */
      title={note.title}
      under={`${KIND[note.kind]} · ${note.happened}`}
      back={onBack}
      leave="back"
      does={note.published ? undefined : { label: "Publish", onDo: onPublish }}
      also={[
        { id: "present", label: "Present", icon: glyphOf("chart"), onDo: () => setPresenting(true) },
      ]}
    >
      <Stack space="roomy">
        {/*
          ⚠️ NO CRUMBS HERE, DELIBERATELY, AND THE FIRST DRAFT HAD THEM. The trail
          read "Notes → Decision → Rewrite the onboarding email" under a crown
          already saying "Rewrite the onboarding email" — the page title, twice,
          four lines apart. `Crumbs` earns its row at three levels or more; a note
          has one ancestor, and the crown's back button is what says so. Inventing
          a middle level to give a component somewhere to live is how chrome
          accumulates.
        */}
        <Row space="snug">
          <Chip color={note.published ? "success" : "default"} variant="soft">
            <Chip.Label>{note.published ? "Published" : "Draft"}</Chip.Label>
          </Chip>
          {/* ⚠️ A PEEK IS A DEFINITION, NOT A DESTINATION. "Who can see this" is
              a question with a two-line answer, and sending somebody to a screen
              for it loses their place in the note they were reading. */}
          <Peek
            title="Who can see this"
            trigger={<Button variant="tertiary" size="sm">Who can see this</Button>}
          >
            <Prose>
              Everybody in the workspace who can read notes. There is no per-note
              audience — a notebook people have to check the permissions of is a
              notebook nobody writes in.
            </Prose>
          </Peek>
          <Menu
            trigger={<Button variant="tertiary" size="sm">More</Button>}
            items={[
              { id: "copy", label: "Duplicate", onDo: () => undefined },
              { id: "pin", label: note.pinned ? "Unpin" : "Pin to the top", onDo: () => undefined },
              /* ⚠️ THE DESTRUCTIVE ITEM IS LAST AND THERE IS AT MOST ONE. */
              { id: "delete", label: "Delete", tone: "danger", onDo: () => undefined },
            ]}
          />
        </Row>

        <PageTabs
          label="This note"
          value={tab}
          onChange={setTab}
          tabs={[
            {
              id: "says", label: "Note",
              content: (
                <Stack space="roomy">
                  <Prose>{note.body}</Prose>
                  <Tags
                    label="Topics"
                    items={topics.map((t) => ({ id: t, label: t }))}
                    onRemove={(id) => setTopics((was) => was.filter((t) => t !== id))}
                    help="Topics are how search finds a note that does not say the word"
                  />
                </Stack>
              ),
            },
            {
              id: "trail", label: "Activity",
              content: (
                <Stack space="roomy">
                  {/* ⚠️ A FIGURE IS A NUMBER AND WHAT IT IS, TOGETHER — the
                      plainest of the three. `Stat` adds a delta and a trend and
                      `Hero` is the one number a whole screen is about; neither
                      is true of a count sitting above a trail. */}
                  <Row space="roomy">
                    <Figure value={moments.length} of="things happened" />
                    <Figure value={`${note.minutes} min`} of="spent writing it" />
                  </Row>
                  <SectionTitle>What happened</SectionTitle>
                  <Timeline moments={moments} />
                </Stack>
              ),
            },
            {
              id: "facts", label: "Details",
              content: (
                <Stack space="roomy">
                  <Group label="This note">
                    <FieldRow label="Written by" value={personName(note.by)} />
                    <FieldRow label="Happened on" value={note.happened} />
                    <FieldRow label="Time it took" value={`${note.minutes} min`} />
                    {/* ⚠️ MONEY IS A COMPONENT BECAUSE A CURRENCY IS NOT A
                        SUFFIX. Minor units in, one grouped figure out — a screen
                        formatting its own is a screen that rounds differently
                        from the bill. */}
                    <FieldRow
                      label="What it cost"
                      value={<Money minor={note.cost} currency="EUR" size="label" />}
                    />
                    <FieldRow
                      label="Follows"
                      value={note.follows ? noteName(note.follows) : "Nothing"}
                      onEdit={note.follows ? () => onOpen(note.follows as string) : undefined}
                    />
                    <FieldRow label="Who to ask" value={note.ask} />
                    {/* ⚠️ A NOTE ROW IS AN ASIDE INSIDE A CARD — the line that
                        stops somebody misreading the rows above it. It is not a
                        `Hint`: nothing here is a control, so there is nothing to
                        hover. */}
                    <NoteRow icon={glyphOf("sparkle")}>
                      What it cost is the credits a draft spent, not what anybody
                      was paid.
                    </NoteRow>
                  </Group>

                  <Group label="Its address">
                    {/* ⚠️ A COPY ROW IS FOR A VALUE SOMEBODY HAS TO PASTE
                        SOMEWHERE ELSE. A link they can only read is a `FieldRow`
                        — the copy control is a promise that it goes into another
                        window. */}
                    <CopyRow label="Link" value={note.link} onCopy={() => undefined} />
                    <CopyRow label="Reference" value={`ground/${note.id}`} onCopy={() => undefined} />
                  </Group>

                  <Row space="snug">
                    {/* ⚠️ A HINT IS FOR A CONTROL WHOSE LABEL IS ALREADY RIGHT
                        and still leaves a question. It is never where the
                        explanation lives — a screen that needs a tooltip to be
                        usable needs different words. */}
                    <Hint says="Everybody here is told once, and it cannot be undone quietly">
                      <Button variant="secondary" onPress={onPublish} isDisabled={note.published}>
                        Publish
                      </Button>
                    </Hint>
                    <Hotkey keys={["cmd", "enter"]} />
                  </Row>

                  <Row space="snug">
                    <Confirm
                      trigger={<Button variant="tertiary">Delete this note</Button>}
                      title="Delete this note?"
                      act={{ label: "Delete note", onDo: () => undefined, tone: "danger" }}
                    >
                      <Prose>
                        There is no bin. Everything written here goes with it, and
                        anybody who had the link will find nothing.
                      </Prose>
                    </Confirm>
                    {/* ⚠️ A DIALOG IS FOR A DECISION WITH A FORM IN IT — a
                        confirmation with fields. `Confirm` is the one with no
                        input, and keeping them apart is what stops a delete
                        dialog growing a text box. */}
                    <Dialog
                      trigger={<Button variant="tertiary">Ask somebody</Button>}
                      title="Ask about this note"
                      actions={<Button slot="close" variant="primary">Send</Button>}
                    >
                      <Prose>
                        They get one message with a link to this note and whatever
                        you add here. Nothing else changes.
                      </Prose>
                    </Dialog>
                  </Row>
                </Stack>
              ),
            },
          ]}
        />
      </Stack>

      {/* ⚠️ `Over` COVERS THE VIEWPORT RATHER THAN DIMMING IT, and what is under
          it is where dismissing returns you. This is presenting a note to a
          room, which is the one thing on this screen that is not about editing
          it. */}
      <Over open={presenting} onClose={() => setPresenting(false)} label={`Presenting ${note.title}`}>
        <Screen
          shape="reader"
          title={note.title}
          under={`${KIND[note.kind]} · ${personName(note.by)}`}
          back={() => setPresenting(false)}
          leave="dismiss"
        >
          {/* ⚠️ CENTRED, WHICH ALMOST NOTHING ELSE HERE IS — and that is the
              rule rather than an exception to it: centring is for a block
              nobody scans, and a note being read to a room is looked at rather
              than scanned. Every working surface stays left-aligned. */}
          <Center space="roomy">
            <Stack space="roomy">
              <Prose>{note.body}</Prose>
              <SectionTitle>It follows</SectionTitle>
              <Prose>{note.follows ? noteName(note.follows) : "Nothing — this is where it started."}</Prose>
            </Stack>
          </Center>
        </Screen>
      </Over>
    </Screen>
  );
}
