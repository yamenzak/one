/**
 * THE INBOX — the record of what happened, which survives every narrowing.
 *
 * ⚠️ A ROW THAT LINKS GOES WHERE IT SAYS. The link is a declared screen's
 * route, guarded at composition — so pressing a row is navigation, never a
 * guess. Marking one as seen is pressing it; the broom sweeps the rest.
 */

import { Inbox, Section, Stack } from "@quad/web";
import { api } from "../api.js";
import { useLoad, type InboxView } from "./data.js";

export function InboxScreen({ onGo, onSeen }: {
  readonly onGo: (path: string) => void;
  readonly onSeen: () => void;
}) {
  const inbox = useLoad<InboxView>("inbox.list");

  const open = async (note: { id: string; link: string | null; seen: boolean }) => {
    if (!note.seen) { await api.post("inbox.seen", { id: note.id }); onSeen(); }
    if (note.link) onGo(note.link);
  };

  const sweep = async () => {
    await api.post("inbox.seen", {});
    inbox.again();
    onSeen();
  };

  return (
    /* ⚠️ NO HEADING OF ITS OWN — THE CROWN IS THE SCREEN'S NAME. This drew
       "Inbox" and the same sentence the crown had already put four lines above
       it, so the screen said its own name twice and its own description twice
       before a single notification. `Hub.tsx` states the rule; this was the one
       screen breaking it. */
    <Section>
      <Stack space="snug">
        <Inbox
          notes={inbox.of.status === "ready"
            ? inbox.of.data.items.map((n) => ({ ...n }))
            : null}
          failed={inbox.of.status === "trouble"}
          onOpen={(n) => void open(n)}
          onSeenAll={() => void sweep()}
        />
      </Stack>
    </Section>
  );
}
