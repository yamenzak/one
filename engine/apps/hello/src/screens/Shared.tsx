/**
 * SHARED — the notes that are on a page anybody can read.
 *
 * ⚠️ THIS SCREEN IS DECLARED `commercial`, AND THAT IS THE APP'S OWN DECISION
 * RATHER THAN THE PLATFORM'S. Sharing puts the workspace's brand on a page
 * people outside it read, so a personal workspace — trading under nobody's name
 * and holding no brand — cannot do it at any price. The list of what is out
 * there follows the capability.
 *
 * ⚠️ SO IT IS NEVER DRAWN IN A PERSONAL WORKSPACE AT ALL, which is the
 * difference between this and a brand editor. There is nothing to explain and
 * nothing to offer here: somebody who cannot share has no shared notes to be
 * told about, and a destination that exists to say "not for you" is a row spent
 * on a refusal. `reachable` withholds it and `Screen` never runs.
 */

import { Chip } from "@heroui/react";
import { Listing, Screen, Tally, glyphOf, sentence, type Loaded } from "@engine/design";
import type { Note } from "./sample.js";

export function Shared({ title, of, again, onOpen }: {
  readonly title?: string;
  readonly of: Loaded<readonly Note[]>;
  readonly again?: () => void;
  readonly onOpen: (note: Note) => void;
}) {
  const count = of.status === "ready" ? of.data.length : null;

  return (
    <Screen
      shape="list"
      title={title}
      under={count === null
        ? undefined
        : <Tally value={count} format={(n) => `${n} on a public page`} count />}
      of={of}
      again={again}
      isNothing={(rows) => rows.length === 0}
      /* ⚠️ NO WAY OUT IN THE EMPTY STATE, because sharing happens on a note. An
         offer here would be a button that has to ask "which one" — a screen
         sending somebody somewhere else to start what it advertised. */
      nothing={{
        icon: glyphOf("star"),
        says: "Nothing is shared",
        under: "Open a note and share it to put it on a public page",
      }}
      then={(rows) => (
        <Listing
          label="Shared"
          of={{ status: "ready", data: rows }}
          rowKey={(n) => n.id}
          onOpen={onOpen}
          asRow={(n) => ({ name: n.title, under: n.said })}
          cols={[
            { id: "title", label: "Note", cell: (n) => n.title },
            { id: "said", label: "About", cell: (n) => n.said },
            {
              id: "kind", label: "Kind",
              /* ⚠️ A KIND IS A CLOSED SET, so it is said rather than printed —
                 see `scripts/keys.test.mjs`. */
              cell: (n) => <Chip variant="soft"><Chip.Label>{sentence(n.kind)}</Chip.Label></Chip>,
            },
          ]}
        />
      )}
    />
  );
}
