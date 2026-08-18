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
 * so a 404 was a spinner-less page that never resolved.
 *
 * ⚠️ ONE SCREEN, TWO READS, AND THE DOOR DECIDES WHICH. On a workspace it is
 * that workspace's notes (`inbox.list`, a member op); on the account door it is
 * EVERY workspace's, merged, each row naming where it came from (`me.inbox`, a
 * personal op that walks this account's own shards). They are the same list
 * asked at two scopes, so they are one screen rather than two that could drift.
 *
 * ⚠️ AND THAT IS WHY THE ACCOUNT DOOR HAS AN INBOX AT ALL. It used to call the
 * member op here, which needs a `tenantId` the account door does not have, so it
 * 404'd; the row was then removed, which left the one address that spans every
 * workspace unable to tell somebody that any of them needed them. A notification
 * is addressed to a PERSON — email and push already go to one address and one
 * device — so the inbox was the only channel disagreeing about the audience.
 */

import { Inbox, RowsWaiting, Screen, glyphOf } from "@engine/design";
import { api } from "../api.js";
import { useSession } from "../session.js";
import { useLoad, type InboxView } from "./data.js";

export function InboxScreen({ onGo, onSeen }: {
  readonly onGo: (path: string) => void;
  readonly onSeen: () => void;
}) {
  const { where } = useSession();
  /* ⚠️ `undefined` UNTIL THE DOOR IS KNOWN, and `useLoad` is not called with a
     guess. Defaulting to either op would fire the wrong read on the first paint
     and then the right one, so every open of this screen would flash somebody
     else's scope. */
  const mine = where?.kind !== "tenant";
  const inbox = useLoad<InboxView>(mine ? "me.inbox" : "inbox.list");

  /* ⚠️ THE SEEN WRITE FOLLOWS THE READ, because a note read from another
     workspace's shard cannot be marked through this one's operation — the row is
     not in this database. `me.seen` takes the slug the note arrived with. */
  const markOne = (note: { id: string; slug?: string }) => mine
    ? api.post("me.seen", { id: note.id, ...(note.slug ? { slug: note.slug } : {}) })
    : api.post("inbox.seen", { id: note.id });

  const open = async (note: { id: string; link: string | null; seen: boolean; slug?: string }) => {
    if (!note.seen) { await markOne(note); onSeen(); }
    if (note.link) onGo(note.link);
  };

  const sweep = async () => {
    await api.post(mine ? "me.seen" : "inbox.seen", {});
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
        under: mine
          ? "Anything any of your workspaces needs to tell you arrives here, and stays"
          : "Anything a product needs to tell you arrives here, and stays",
      }}
      then={(data) => <Inbox notes={data.items} onOpen={(n) => void open(n)} />}
    />
  );
}
