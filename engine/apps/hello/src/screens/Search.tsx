/**
 * SEARCH — the screen behind a flag.
 *
 * ⚠️ IT EXISTS TO MAKE THE FLAG MEAN SOMETHING. `note-search` is declared in the
 * manifest, and a flag no screen and no operation is behind changes nothing when
 * pressed — so this is the other half of that declaration rather than a feature
 * anybody asked for.
 *
 * ⚠️ NOTHING-YET AND NOTHING-FOUND ARE DIFFERENT SENTENCES. An empty box before
 * anybody types is not a result, and answering both with "No matches" tells
 * somebody their query failed when they have not made one.
 */

import * as React from "react";
import { Listing, Nothing, Screen, SearchInput, Stack, type Loaded } from "@engine/design";
import type { Note } from "./sample.js";

export function Search({ title, q, onQ, of }: {
  /** ⚠️ The declared label — see `screens/index.tsx`. */
  readonly title?: string;
  readonly q: string;
  readonly onQ: (next: string) => void;
  readonly of: Loaded<readonly Note[]>;
}) {
  const asked = q.trim().length > 0;
  return (
    <Screen
      shape="list"
      title={title}
      of={of}
      isNothing={(rows) => asked && rows.length === 0}
      nothing={{
        says: `Nothing matches “${q.trim()}”`,
        under: "Search looks at titles and what is written under them",
      }}
      then={(rows) => (
        <Stack space="roomy">
          <SearchInput label="Search notes" value={q} onChange={onQ} placeholder="Title or a word in it" />
          {/* ⚠️ BEFORE ANYBODY TYPES, THE SCREEN STILL HAS TO SAY SOMETHING. The
              first render of this was a full-width field alone on an empty page
              — no heading, no result, no hint — which is the same picture as a
              page that failed to load. "Nothing typed" is a state, and a state
              with no copy is a blank. */}
          {asked ? null : (
            <Nothing says="Search the notes" under="Titles and the words under them — results appear as you type" />
          )}
          {asked ? (
            <Listing
              label="Matches"
              of={{ status: "ready", data: rows }}
              rowKey={(n) => n.id}
              says={{ nothing: "Nothing matches" }}
              asRow={(n) => ({ name: n.title, under: n.said })}
              cols={[
                { id: "title", label: "Note", cell: (n) => n.title },
                { id: "said", label: "About", cell: (n) => n.said },
              ]}
            />
          ) : null}
        </Stack>
      )}
    />
  );
}
