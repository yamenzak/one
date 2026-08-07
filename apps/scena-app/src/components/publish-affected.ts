/**
 * "Also publish to the channels using this?" — the convenience prompt that saves
 * a trip to Channels ▸ Publish after editing a *shared* building block.
 *
 * Slide playlists, music playlists, widget profiles and ad profiles are reused
 * across channels; editing one leaves every channel that references it stale
 * until it's republished. After a discrete save, call {@link offerPublishAffected}
 * with the block's kind + id: it looks up the channels that use it and, if any,
 * offers to publish them in one go.
 *
 * A short per-id cooldown keeps a burst of edits (or an editor that saves a few
 * times in a row) from re-prompting — you're asked once, then left alone for a
 * bit whether you say yes or no.
 */
import { channelsUsingPlaylist, publishChannel } from "../api.js";
import { confirm, toast } from "@4dl/ui";

export type PublishKind = "slide" | "music" | "widget" | "ad";

const LABEL: Record<PublishKind, string> = {
  slide: "slide playlist",
  music: "music playlist",
  widget: "widget profile",
  ad: "ad profile",
};

/** Don't re-ask about the same block within this window (ms). */
const COOLDOWN_MS = 30_000;
const lastAsked = new Map<string, number>();

/**
 * Offer to publish every channel that uses this block. No-op when nothing uses
 * it, when we asked very recently, or when a prompt for it is already open.
 * Fails soft: a screen without publish permission just sees a gentle toast.
 */
export async function offerPublishAffected(kind: PublishKind, id: string): Promise<void> {
  if (!id) return;
  const key = `${kind}:${id}`;
  const now = Date.now();
  if (now - (lastAsked.get(key) ?? 0) < COOLDOWN_MS) return;
  lastAsked.set(key, now); // reserve immediately so parallel saves don't double-prompt

  let channels: { id: string; name: string }[] = [];
  try {
    channels = await channelsUsingPlaylist(kind, id);
  } catch {
    lastAsked.delete(key);
    return;
  }
  if (channels.length === 0) {
    lastAsked.delete(key); // nothing used it — don't burn the cooldown
    return;
  }

  const n = channels.length;
  const names = channels.slice(0, 3).map((c) => c.name).join(", ") + (n > 3 ? `, +${n - 3} more` : "");
  const ok = await confirm({
    title: n === 1 ? "Publish this change to the live channel?" : `Publish this change to ${n} channels?`,
    description: `${names} use this ${LABEL[kind]}. Publish now so their screens update — or do it later from Channels.`,
    confirmLabel: n === 1 ? "Publish" : `Publish ${n} channels`,
    cancelLabel: "Not now",
  });
  lastAsked.set(key, Date.now()); // restart the cooldown from the decision
  if (!ok) return;

  const results = await Promise.allSettled(channels.map((c) => publishChannel(c.id)));
  const ok2 = results.filter((r) => r.status === "fulfilled").length;
  const failed = n - ok2;
  if (ok2 > 0) toast.success(ok2 === 1 ? "Published — screens are updating." : `Published ${ok2} channels — screens are updating.`);
  if (failed > 0) toast.error(ok2 === 0 ? "Couldn't publish — you may not have permission." : `${failed} channel${failed === 1 ? "" : "s"} couldn't be published.`);
}
