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
 *
 * ⚠️ AND THE FILTERS ARE AN ASIDE, NEVER INSIDE THE LIST. A filter under the
 * results changes something somebody has already read; one between the field and
 * the matches pushes the matches off a phone. `Columns` puts it beside them on a
 * desktop and under them on a phone, with the results FIRST in the DOM either
 * way — so the reading order does not change with the drawing order.
 */

import * as React from "react";
import {
  Choice, Cluster, Columns, Listing, Nothing, Screen, SearchInput, Segmented, Stack,
  Tags,
  type Loaded,
} from "@engine/design";
import type { Note } from "./sample.js";

const WHICH = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "drafts", label: "Drafts" },
] as const;

const ORDER = [
  { id: "recent", label: "Most recent first" },
  { id: "oldest", label: "Oldest first" },
  { id: "longest", label: "Longest first" },
] as const;

export function Search({ title, q, onQ, of, recent, onRecent }: {
  /** ⚠️ The declared label — see `screens/index.tsx`. */
  readonly title?: string;
  readonly q: string;
  readonly onQ: (next: string) => void;
  readonly of: Loaded<readonly Note[]>;
  /** What was searched before — a shortcut, not a history somebody has to clear. */
  readonly recent: readonly string[];
  readonly onRecent: (drop: string) => void;
}) {
  const [which, setWhich] = React.useState<string>("all");
  const [order, setOrder] = React.useState<string | null>("recent");
  const asked = q.trim().length > 0;

  return (
    <Screen
      shape="list"
      title={title}
      of={of}
      isNothing={(rows) => asked && rows.length === 0}
      nothing={{
        says: `Nothing matches “${q.trim()}”`,
        under: "Search looks at titles, what is written under them, and topics",
      }}
      then={(rows) => {
        const kept = which === "all"
          ? rows
          : rows.filter((n) => (which === "published" ? n.published : !n.published));
        return (
          <Stack space="roomy">
            <SearchInput label="Search notes" value={q} onChange={onQ} placeholder="Title or a word in it" />

            {/*
              ⚠️ THE FILTERS ARE AN ASIDE AND THE RESULTS ARE THE PAGE, and the
              aside comes SECOND in the DOM whichever side it is drawn on —
              putting a filter panel before the results because it is on the left
              is how a page becomes unusable with a screen reader without ever
              being wrong to look at.
            */}
            <Columns
              aside={
                <Cluster space="snug">
                  {/* ⚠️ A SEGMENT FOR THE SHORT CLOSED SET, A CHOICE FOR THE
                      REST. Three states of a note fit on the surface; three
                      orderings are a sentence each and belong behind a control
                      that can hold one. */}
                  <Segmented label="Which notes" value={which} onChange={setWhich} options={WHICH} />
                  <Choice label="Order" value={order} onChange={setOrder} options={ORDER} />
                  {recent.length ? (
                    <Tags
                      label="Searched before"
                      items={recent.map((r) => ({ id: r, label: r }))}
                      onRemove={onRecent}
                    />
                  ) : null}
                </Cluster>
              }
            >
              {/* ⚠️ BEFORE ANYBODY TYPES, THE SCREEN STILL HAS TO SAY SOMETHING.
                  The first render of this was a full-width field alone on an
                  empty page — no heading, no result, no hint — which is the same
                  picture as a page that failed to load. "Nothing typed" is a
                  state, and a state with no copy is a blank. */}
              {asked ? null : (
                <Nothing says="Search the notes" under="Titles and the words under them — results appear as you type" />
              )}
              {asked ? (
                <Listing
                  label="Matches"
                  of={{ status: "ready", data: kept }}
                  rowKey={(n) => n.id}
                  says={{ nothing: "Nothing matches that filter", under: "Try “All” — the note may be a draft" }}
                  asRow={(n) => ({ name: n.title, under: n.said })}
                  cols={[
                    { id: "title", label: "Note", cell: (n) => n.title },
                    { id: "said", label: "About", cell: (n) => n.said },
                    { id: "at", label: "Written", numeric: true, cell: (n) => n.at,
                      by: (a, b) => a.at.localeCompare(b.at) },
                  ]}
                />
              ) : null}
            </Columns>
          </Stack>
        );
      }}
    />
  );
}
