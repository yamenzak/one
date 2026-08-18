/**
 * THE BELL AND THE INBOX.
 *
 * ⚠️ THIS IS THE SCREEN A PREVIOUS PLATFORM NEVER SHIPPED. It had the schema,
 * the Durable Object, four routes, a registry and sixteen dispatch sites — and
 * nowhere a person could look, for three stages, with every suite green. The
 * note saying the bell was coming became the reason nobody checked.
 *
 * ⚠️ `null` IS NOT `[]`. A count that has not arrived yet is not zero and an
 * inbox that has not loaded is not empty — "You're all caught up" while still
 * fetching is a wrong answer wearing a loading state's excuse, and somebody acts
 * on it.
 *
 * ⚠️ AND A FAILED POLL IS ONLY SHOWN WHILE THERE IS NOTHING TO SHOW. A dropped
 * connection that blanks a list somebody was reading is indistinguishable, to
 * them, from their records being gone.
 */

import { Button, Card, Chip, Separator } from "@heroui/react";
import { colorFor } from "../tokens/theme.js";
import type { Tone } from "@engine/kernel";
import { SPACE } from "../tokens/metrics.js";

export interface Note {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly link: string | null;
  readonly tone: string;
  readonly at: string;
  readonly seen: boolean;
}

export interface BellProps {
  /** ⚠️ `null` means not known yet — see the header. */
  readonly unseen: number | null;
  readonly onOpen: () => void;
}

export function Bell({ unseen, onOpen }: BellProps) {
  return (
    <Button variant="ghost" aria-label="Notifications" onPress={onOpen}>
      {/* Nothing while it is unknown, and nothing at zero: a zero badge is texture. */}
      {unseen === null || unseen === 0
        ? "Inbox"
        : <Chip color="danger" variant="primary"><Chip.Label>{unseen}</Chip.Label></Chip>}
    </Button>
  );
}

export interface InboxProps {
  /** ⚠️ `null` until the first answer arrives. */
  readonly notes: readonly Note[] | null;
  readonly failed?: boolean;
  readonly onOpen: (note: Note) => void;
  readonly onSeenAll: () => void;
}

export function Inbox({ notes, failed, onOpen, onSeenAll }: InboxProps) {
  if (notes === null) {
    return (
      <Card>
        <Card.Header><Card.Title>Loading…</Card.Title></Card.Header>
      </Card>
    );
  }

  /* ⚠️ The failure is shown only because there is nothing else to show. */
  if (failed && notes.length === 0) {
    return (
      <Card>
        <Card.Header>
          <Card.Title>Could not load your inbox</Card.Title>
          <Card.Description>Nothing is lost — try again in a moment.</Card.Description>
        </Card.Header>
      </Card>
    );
  }

  if (notes.length === 0) {
    return (
      <Card>
        <Card.Header><Card.Title>Nothing here yet</Card.Title></Card.Header>
      </Card>
    );
  }

  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      <div className="flex justify-end">
        <Button variant="ghost" onPress={onSeenAll}>Mark all as read</Button>
      </div>
      {notes.map((note) => (
        <Card key={note.id}>
          <Card.Header>
            <Card.Title>{note.title}</Card.Title>
            <Card.Description>{note.at.slice(0, 16).replace("T", " ")}</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className={`flex items-center ${SPACE.snug}`}>
              {!note.seen
                ? (
                  <Chip color={colorFor(note.tone as Tone)} variant="soft">
                    <Chip.Label>New</Chip.Label>
                  </Chip>
                )
                : null}
              {/* ⚠️ A row with a dead link is worse than a row with none: it is a
                  promise that goes nowhere, and the person blames the product. */}
              {note.link
                ? <Button variant="secondary" onPress={() => onOpen(note)}>Open</Button>
                : null}
            </div>
          </Card.Content>
          <Separator />
        </Card>
      ))}
    </div>
  );
}
