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
import {
  Listing, Place, Rail, Screen, SectionTitle, Stack, Tally, glyphOf,
  type Loaded,
} from "@engine/design";
import type { Note } from "./sample.js";

export function Notes({ title, of, again, density = "comfortable", onNew, onOpen }: {
  /** ⚠️ The declared label — see `screens/index.tsx`. */
  readonly title?: string;
  readonly of: Loaded<readonly Note[]>;
  readonly again?: () => void;
  /**
   * ⚠️ THE PERSON'S OWN `notes.density`, PASSED IN. It is read where it is
   * DRAWN — no handler could apply it, because what it changes is how much of
   * each row is shown — and it is a prop rather than a read inside the screen so
   * the ground can photograph both settings of it.
   */
  readonly density?: "comfortable" | "compact";
  readonly onNew: () => void;
  readonly onOpen: (note: Note) => void;
}) {
  /* ⚠️ THE COUNT IS A FACT ABOUT THE SCREEN, so it goes under the title where
     the crown puts a fact — not in a card of its own. The first draft gave it a
     `Group` labelled "Everything else", which then named a one-line count while
     the table it was supposed to head sat outside the card with no heading at
     all. A heading over the wrong block is worse than none. */
  const count = of.status === "ready" ? of.data.length : null;

  return (
    <Screen
      shape="list"
      title={title}
      under={count === null
        ? undefined
        : <Tally value={count} format={(n) => `${n} notes in this workspace`} count />}
      does={{ label: "Write a note", onDo: onNew }}
      of={of}
      again={again}
      isNothing={(rows) => rows.length === 0}
      nothing={{
        icon: glyphOf("note"),
        says: "Nothing written yet",
        under: "A note is a title and whatever follows it",
      }}
      then={(rows) => {
        const pinned = rows.filter((n) => n.pinned);
        return (
          <Stack space="roomy">
            {/* ⚠️ PINNED IS A GROUP, NOT A MARKER ON A ROW. A pinned row mixed
                into the run with a flag on it is a row somebody has to scan for;
                a block of its own says the same thing with nothing to scan.
                ⚠️ AND IT IS A RAIL RATHER THAN A LIST, because a handful of
                pinned notes are things you look AT — a card each, the next one
                peeking past the edge, which is the only affordance saying there
                is more. Twenty of them would be a list; three are not. */}
            {pinned.length ? (
              <Stack space="snug">
                <SectionTitle>Pinned</SectionTitle>
                <Rail space="snug">
                  {pinned.map((n) => (
                    <Place
                      key={n.id}
                      name={n.title}
                      said={n.said}
                      foot={`${n.minutes} min · ${n.at}`}
                      onOpen={() => onOpen(n)}
                    />
                  ))}
                </Rail>
              </Stack>
            ) : null}

            <Listing
              label="Notes"
              of={{ status: "ready", data: rows.filter((n) => !n.pinned) }}
              rowKey={(n) => n.id}
              onOpen={onOpen}
              says={{ icon: glyphOf("note"), nothing: "Nothing else written" }}
              asRow={(n) => ({
                name: n.title,
                /* ⚠️ COMPACT DROPS THE SECOND LINE, which is what density IS —
                   the same rows, less of each. Dropping a row or a column would
                   be withholding information and calling it a preference. */
                under: density === "compact" ? undefined : n.said,
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
        );
      }}
    />
  );
}
