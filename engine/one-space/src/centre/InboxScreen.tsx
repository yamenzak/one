/**
 * THE INBOX — the record of what happened, which survives every narrowing.
 *
 * ⚠️ A ROW THAT LINKS GOES WHERE IT SAYS. The link is a declared screen's
 * route, guarded at composition — so pressing a row is navigation, never a
 * guess. Marking one as seen is pressing it; the broom sweeps the rest.
 *
 * ⚠️ AND THE FOUR-WAY IS `Screen`'S, WHICH IS WHY THE WAITING STATE IS A
 * SKELETON AND A REFUSAL IS A REFUSAL. This handed `Inbox` a `null` for
 * everything that was not a loaded answer, and `Inbox` drew "Loading…" for it —
 * so `inbox.list` answering 404 on the account door, which it does, was a
 * spinner-less page that never resolved.
 */

import { Inbox, RowsWaiting, Screen, glyphOf } from "@engine/design";
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

  /* ⚠️ OFFERED ONLY WHERE IT WOULD DO SOMETHING. "Mark all as read" over an
     inbox with nothing unread is a control whose whole effect is to not change
     anything, and it sat above every list including the empty one. */
  const unseen = inbox.of.status === "ready" ? inbox.of.data.unseen : 0;

  return (
    /* ⚠️ `list` WITH NO PRIMARY. Nothing is added to an inbox by the person
       reading it; clearing it is a secondary, and the crown is where a
       secondary docks (`screen.tsx`). */
    <Screen
      shape="list"
      of={inbox.of}
      again={inbox.again}
      isNothing={(d) => d.items.length === 0}
      also={unseen > 0
        ? [{ id: "seen", label: "Mark all as read", icon: glyphOf("check"), onDo: () => void sweep() }]
        : undefined}
      waiting={<RowsWaiting rows={4} lead={false} />}
      nothing={{
        icon: glyphOf("inbox"),
        says: "Nothing here yet",
        under: "Anything a product needs to tell you arrives here, and stays",
      }}
      then={(data) => <Inbox notes={data.items} onOpen={(n) => void open(n)} />}
    />
  );
}
