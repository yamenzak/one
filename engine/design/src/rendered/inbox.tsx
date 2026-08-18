/**
 * THE INBOX.
 *
 * ⚠️ THIS IS THE SCREEN A PREVIOUS PLATFORM NEVER SHIPPED. It had the schema,
 * the Durable Object, four routes, a registry and sixteen dispatch sites — and
 * nowhere a person could look, for three stages, with every suite green. The
 * note saying the bell was coming became the reason nobody checked.
 *
 * ⚠️ AND IT TAKES LOADED NOTES, NEVER A `null` MEANING "NOT YET". This drew its
 * own four-way out of `notes: Note[] | null` plus `failed: boolean`, with the
 * null branch first — so a REFUSED inbox rendered "Loading…" for as long as
 * somebody was willing to look at it, and the "could not load" branch under it
 * was unreachable code. `Await` owns that decision (`state.tsx`), the screen
 * hands it a `Loaded`, and this draws the one case where there are notes.
 *
 * ⚠️ IT IS CUT INTO DAYS, AND THE DAYS ARE THE READER'S OWN. A flat list of
 * forty notifications is forty timestamps somebody has to read to place; under
 * "Today" and "Yesterday" the same forty are two glances. Past two days the
 * headings are DATES rather than "3 days ago" — a relative phrase goes stale on
 * a page left open, and this is the surface people leave open.
 *
 * ⚠️ AND THE DAY IS DECIDED IN THEIR TIME ZONE, WHICH IS THE PART THAT WOULD GO
 * WRONG SILENTLY. A notification at 23:30 in Berlin is stamped 21:30Z, and
 * cutting on the UTC date files it under yesterday for the person who was there
 * when it arrived. `useDays` asks `present.ts`, once per list.
 */

import { Chip } from "@heroui/react";
import { sayTime, type Instant } from "@engine/kernel";
import { Group, NavRow } from "../parts/surfaces.js";
import { Stack } from "../parts/arrange.js";
import { useDays, useShown } from "../parts/said.js";

export interface Note {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly link: string | null;
  readonly tone: string;
  readonly at: string;
  readonly seen: boolean;
  /**
   * ⚠️ WHICH WORKSPACE, WHERE SEVERAL ARE MERGED — and absent where they are
   * not. The account door shows every workspace's notes in one list, and without
   * this it is a column of sentences about work with no way to tell which of
   * four places any of them is about. A workspace's own inbox leaves it off:
   * naming the workspace on every row of its own screen is the heading printed
   * again per line.
   */
  readonly where?: string;
}

export interface InboxProps {
  /** ⚠️ LOADED. The four-way is the screen's — see the header. */
  readonly notes: readonly Note[];
  /**
   * ⚠️ WHAT "TODAY" MEANS, AS A PROP. Read from the clock inside the render this
   * component could not be asserted, and every test of it would pass only on the
   * day it was written.
   */
  readonly now?: Instant;
  readonly onOpen: (note: Note) => void;
}

export function Inbox({ notes, now, onOpen }: InboxProps) {
  const shown = useShown();
  const days = useDays(notes, (n) => n.at as Instant, now);

  return (
    /*
      ⚠️ ONE CARD PER DAY, NOT ONE PER NOTE. Every note was a `Card` with a
      header, a description and a content area holding a chip and a button — so
      four notifications filled a phone and the only thing being scanned for,
      which of them is new, was the third element of the third block of each.
      Grouped, the heading carries the date and every row under it carries only
      the time, which is the field that actually differs.
    */
    <Stack space="roomy">
      {days.map((day) => (
        <Group key={day.day} label={day.says}>
          {day.items.map((note) => (
            /* ⚠️ THE WHOLE ROW OPENS IT. The press marks it seen and follows the
               link; a button inside a row makes the other 90% of the row a dead
               target, which is the part a thumb actually lands on. */
            <NavRow
              key={note.id}
              label={note.title}
              /* ⚠️ THE TIME, AND THE WORKSPACE ONLY WHERE THERE IS MORE THAN
                 ONE — the heading above already said which day, and a full date
                 on every row is three fields repeated down a list with one of
                 them varying. */
              under={note.where
                ? `${note.where} · ${sayTime(shown, note.at as Instant)}`
                : sayTime(shown, note.at as Instant)}
              /*
                ⚠️ ZERO IS TEXTURE AND SO IS "SEEN". Only the unread ones are
                marked — a chip on every row is a chip that says nothing.

                ⚠️ AND ONE MARK, NOT ONE PER TONE. This wore
                `colorFor(note.tone)`, so a list held a grey "New" beside a green
                "New" beside an amber one — the same word in three colours, which
                asks the reader to decode a difference the label denies. Unread
                is one state; what the notification is ABOUT is its sentence,
                which is the row.
              */
              aside={note.seen
                ? undefined
                : <Chip color="accent" variant="soft"><Chip.Label>New</Chip.Label></Chip>}
              onOpen={() => onOpen(note)}
            />
          ))}
        </Group>
      ))}
    </Stack>
  );
}
