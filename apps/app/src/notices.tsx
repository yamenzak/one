/**
 * The one notice that is entirely Kova's.
 *
 * The other four — the offline pill, the queued-write reassurance, the
 * new-build prompt and the unhandled-error toast — moved to `@4dl/app-kit`:
 * they describe the RUNTIME (connectivity, the service worker, a rejected
 * promise), which every 4DL app has in exactly the same shape. This one
 * describes a studio's standing with Kova, in Kova's words, with Kova's ladder
 * in the copy. There is nothing left to share once the words are removed.
 */

import { Lock } from "@4dl/ui";
import { DUNNING_DAYS } from "@4dl/billing/model";
import { useSession } from "./session.js";

import { OfflinePill as KitOfflinePill, PwaUpdatePrompt as KitPwaUpdatePrompt } from "@4dl/app-kit";

export { QueuedNotice, UnhandledErrorToast } from "@4dl/app-kit";

/** The kit's pill, given this app's connectivity. */
export function OfflinePill() {
  const { online, degraded } = useSession();
  return <KitOfflinePill online={online} degraded={degraded} />;
}

/**
 * The kit's update prompt. `enabled` is a BUILD question — a service worker
 * exists only in a production build — and Vite is the app's choice, not the
 * platform's, so the app answers it.
 */
export function PwaUpdatePrompt() {
  return <KitPwaUpdatePrompt enabled={import.meta.env.PROD} />;
}

/**
 * The studio is read-only, said out loud.
 *
 * A suspended or closing studio refuses every write at the edge (route-guard's
 * host gate). Without this the app looks completely normal and each save fails
 * one at a time with a 402 — the user's model becomes "the app is broken", which
 * is both wrong and the version they will repeat to their coach. Naming the state
 * once, up front, is the difference between a lock and a fault.
 *
 * Deliberately not dismissible: it is not a notification, it is the current state
 * of the whole surface, and it stops being true only when the studio renews.
 */
export function StudioPausedBanner() {
  const { host, ctx } = useSession();
  const reason = host?.gate?.reason;
  if (!host?.gate?.readOnly) return null;
  const closing = reason === "closing";
  // The OWNER gets the next rung's deadline. Every step of the platform ladder is
  // announced before it lands — a single cliff is how you lose a customer who was
  // on holiday — and read-only is the rung where saying so still changes the
  // outcome. Clients are not told a date they cannot act on.
  const owner = ctx?.active?.role === "owner";
  return (
    /* The STRIP is full-bleed — it describes the whole surface, so a floating
       card would understate it — but its TEXT sits in the content column. A
       single line running the full width of a desktop window is a ~180-character
       measure; §5 caps prose at ~68. */
    <div
      role="status"
      className="border-b border-warning/25 bg-warning/12 px-4 py-2.5 text-xs leading-relaxed text-warning"
    >
      <div className="column flex items-start gap-2">
      <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-semibold">{closing ? "This studio is closing." : "This studio is paused."}</span>{" "}
        {closing
          ? "Everything is readable, but nothing new can be saved. The owner can still cancel the closure from Billing."
          : "Everything is readable, but nothing new can be saved until the studio renews."}
        {!closing && owner && (
          <>
            {" "}
            <span className="font-semibold">
              Access is withheld for everyone {DUNNING_DAYS.blocked} days after the missed payment, and the studio is deleted at {DUNNING_DAYS.purge}.
            </span>
          </>
        )}
      </span>
      </div>
    </div>
  );
}
