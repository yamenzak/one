/**
 * NOTES — the `list` shape, and hello's primary screen.
 *
 * ⚠️ IT EXERCISES THE FOUR OUTCOMES FROM ONE PROP. `of` carries waiting, ready,
 * nothing and trouble, and `Screen` decides which draws — including where the
 * primary action goes, which moves INTO the empty state when there is nothing to
 * act on. A screen that branches on those itself is a screen with four layouts
 * nobody ever compared.
 *
 * ⚠️ AND THE EMPTY STATE IS THE SCREEN'S, NOT THE LISTING'S. Two components able
 * to answer "there is nothing here" is two answers, and only one of them can
 * also stand the primary action down.
 */

import * as React from "react";
import { Chip } from "@heroui/react";
import { Group, Listing, NoteRow, Screen, Stack, type Loaded } from "@engine/design";
import type { Note } from "./sample.js";

export function Notes({ title, of, again, onNew, onOpen }: {
  /** ⚠️ The declared label — see `screens/index.tsx`. */
  readonly title?: string;
  readonly of: Loaded<readonly Note[]>;
  readonly again?: () => void;
  readonly onNew: () => void;
  readonly onOpen: (note: Note) => void;
}) {
  return (
    <Screen
      shape="list"
      title={title}
      does={{ label: "Write a note", onDo: onNew }}
      of={of}
      again={again}
      isNothing={(rows) => rows.length === 0}
      nothing={{
        says: "Nothing written yet",
        under: "A note is a title and whatever follows it",
      }}
      then={(rows) => (
        <Stack space="roomy">
          {/* ⚠️ PINNED IS A GROUP, NOT A MARKER ON A ROW. A pinned row mixed
              into the run with a flag on it is a row somebody has to scan for;
              two cards say the same thing with nothing to scan. */}
          {rows.some((n) => n.pinned) ? (
            <Group label="Pinned">
              {rows.filter((n) => n.pinned).map((n) => (
                <NoteRow key={n.id}>{n.title}</NoteRow>
              ))}
            </Group>
          ) : null}
          <Listing
            label="Notes"
            of={{ status: "ready", data: rows.filter((n) => !n.pinned) }}
            rowKey={(n) => n.id}
            onOpen={onOpen}
            says={{ nothing: "Nothing else written" }}
            asRow={(n) => ({
              name: n.title,
              under: n.said,
              aside: n.published
                ? undefined
                : <Chip color="default" variant="soft"><Chip.Label>Draft</Chip.Label></Chip>,
            })}
            cols={[
              { id: "title", label: "Note", cell: (n) => n.title },
              { id: "said", label: "About", cell: (n) => n.said },
              {
                id: "state", label: "State",
                cell: (n) => (
                  <Chip color={n.published ? "success" : "default"} variant="soft">
                    <Chip.Label>{n.published ? "Published" : "Draft"}</Chip.Label>
                  </Chip>
                ),
              },
              { id: "at", label: "Written", numeric: true, cell: (n) => n.at,
                by: (a, b) => a.at.localeCompare(b.at) },
            ]}
          />
        </Stack>
      )}
    />
  );
}
