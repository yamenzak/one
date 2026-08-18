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
 */

import { Chip } from "@heroui/react";
import { Group, NavRow } from "../parts/surfaces.js";

export interface Note {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly link: string | null;
  readonly tone: string;
  readonly at: string;
  readonly seen: boolean;
}

export interface InboxProps {
  /** ⚠️ LOADED. The four-way is the screen's — see the header. */
  readonly notes: readonly Note[];
  readonly onOpen: (note: Note) => void;
}

/**
 * ⚠️ THE DAY AND THE TIME, NOT AN ISO STRING WITH ITS `T` SWAPPED FOR A SPACE.
 * A notification is read as "when", and `2026-08-18 14:03` makes somebody parse
 * a date to answer a question they asked by glancing.
 */
const when = (at: string): string => {
  const on = new Date(at);
  if (Number.isNaN(on.getTime())) return at;
  return on.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

export function Inbox({ notes, onOpen }: InboxProps) {
  return (
    /*
      ⚠️ ROWS IN ONE CARD, NOT A CARD EACH. Every note was a `Card` with a
      header, a description and a content area holding a chip and a button — so
      four notifications filled a phone and the only thing being scanned for,
      which of them is new, was the third element of the third block of each.

      ⚠️ AND THE WHOLE ROW OPENS IT. The press marks it seen and follows the
      link; a button inside a row makes the other 90% of the row a dead target,
      which is the one part of it a thumb actually lands on.
    */
    <Group>
      {notes.map((note) => (
        <NavRow
          key={note.id}
          label={note.title}
          under={when(note.at)}
          /*
            ⚠️ ZERO IS TEXTURE AND SO IS "SEEN". Only the unread ones are
            marked — a chip on every row is a chip that says nothing.

            ⚠️ AND ONE MARK, NOT ONE PER TONE. This wore `colorFor(note.tone)`,
            so a list held a grey "New" beside a green "New" beside an amber
            one — the same word in three colours, which asks the reader to
            decode a difference the label denies. Unread is one state; what the
            notification is ABOUT is its sentence, which is the row.
          */
          aside={note.seen
            ? undefined
            : <Chip color="accent" variant="soft"><Chip.Label>New</Chip.Label></Chip>}
          onOpen={() => onOpen(note)}
        />
      ))}
    </Group>
  );
}
