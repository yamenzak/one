/**
 * WHAT AN APP ACTUALLY WRITES.
 *
 * ⚠️ THE POINT OF THIS FILE IS HOW LITTLE IS IN IT. There is no shell, no
 * navigation, no dialog, no empty state, no loading state and no button — every
 * one of those is the renderer's, and reaching for a raw `<button>` here would
 * bypass the state declaration, the hit-area floor, the refusal reason and the
 * matrix somebody photographs, all in one tag.
 *
 * What remains is the app's own arrangement of the language's pieces, which is
 * the only part a framework cannot decide.
 */

import { Button, Collection, Row, Surface, Text } from "@one/ui";

export interface Note { readonly id: string; readonly title: string; readonly body?: string }

export interface NotesProps {
  /** ⚠️ `null` is NOT KNOWN. The container has a separate branch for it. */
  readonly notes: readonly Note[] | null;
  readonly failed?: boolean;
  /** Locked rather than hidden, so the plan that would allow it is reachable. */
  readonly canWrite: boolean;
  readonly onOpen: (id: string) => void;
  readonly onAdd: () => void;
}

export function NotesScreen({ notes, failed, canWrite, onOpen, onAdd }: NotesProps) {
  return (
    <Surface depth={0} role="content">
      <Text role="title">Notes</Text>
      <Button
        kind="primary"
        state={canWrite ? "idle" : "locked"}
        reason={canWrite ? undefined : "Writing notes isn't in your plan"}
        resolve={canWrite ? undefined : "billing.plans"}
        onPress={onAdd}
      >
        Add a note
      </Button>

      <Collection
        items={notes}
        failed={failed ?? false}
        empty={{ title: "No notes yet", detail: "Anything you write here stays in this workspace." }}
      >
        {(rows) => (
          <Surface depth={1} as="section">
            {rows.map((note) => (
              <Row key={note.id} title={note.title} detail={note.body ?? undefined} onOpen={() => onOpen(note.id)} />
            ))}
          </Surface>
        )}
      </Collection>
    </Surface>
  );
}
