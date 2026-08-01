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

import { Link } from "react-router-dom";
import { ArrowRight, Lock } from "@4dl/ui";
import { DUNNING_DAYS } from "@4dl/billing/model";
import { useSession } from "./session.js";

import { MaintenanceBanner as KitMaintenanceBanner, OfflinePill as KitOfflinePill, PwaUpdatePrompt as KitPwaUpdatePrompt } from "@4dl/app-kit";

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
 *
 * **`blocking` is deliberately not passed.** A modal that refuses the app until
 * the user reloads would discard whatever they had not saved, and Kova is used
 * mid-set, mid-check-in, mid-meal-log — the same reason `skipWaiting` is off in
 * `vite.config.ts`. Shipping a build is not a good enough reason to take a
 * client's half-finished check-in away from them.
 *
 * The case that WOULD justify it is a running build the API can no longer serve,
 * and Kova has no such signal today: the API is additive and versionless, so
 * there is nothing that says "this bundle is too old". If that ever changes, the
 * prompt takes `blocking` and this is where it is decided. Until then the real
 * dead end — a stale bundle failing to load a chunk — lands in the
 * `ErrorBoundary`, which carries its own hard-refresh escape.
 */
export function PwaUpdatePrompt() {
  return <KitPwaUpdatePrompt enabled={import.meta.env.PROD} />;
}

/**
 * The kit's maintenance strip, given this app's host probe.
 *
 * Nothing here is Kova's — a platform-wide read-only window says the same thing
 * on every app — so only the wiring lives on this side. Renders for the
 * `readonly` level only; `full` never reaches the Shell (main.tsx swaps the whole
 * screen before it).
 */
export function MaintenanceBanner() {
  const { host } = useSession();
  return <KitMaintenanceBanner state={host?.maintenance} />;
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
  /**
   * NEVER CONFIGURED — the owner abandoned the wizard, was declined, or reloaded
   * mid-checkout, so the studio has no plan and has never had one.
   *
   * It reaches the same read-only gate as a lapse and must not borrow its words.
   * "This studio is paused… until it renews" is wrong twice over for someone who
   * never started: nothing was taken away, and there is no arrears to settle.
   * They are one step from finished, and the banner's job is to say which step.
   */
  const setup = reason === "setup";
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
        <span className="font-semibold">
          {setup ? "This studio isn't set up yet." : closing ? "This studio is closing." : "This studio is paused."}
        </span>{" "}
        {setup
          ? owner
            ? <>
                Choose a plan to start adding clients. Everything you&rsquo;ve entered is saved and waiting.{" "}
                {/* The way out, in the banner. A read-only app with no route to
                    the one action that unlocks it is a dead end, and this state
                    is reached by people who were ALREADY interrupted once. */}
                <Link to="/business" className="inline-flex items-center gap-1 font-semibold underline underline-offset-4">
                  Finish setting up <ArrowRight aria-hidden className="size-3" />
                </Link>
              </>
            : "Your coach hasn't finished setting it up. Nothing you've done is lost — it'll all be here."
          : closing
            ? "Everything is readable, but nothing new can be saved. The owner can still cancel the closure from Billing."
            : "Everything is readable, but nothing new can be saved until the studio renews."}
        {!closing && !setup && owner && (
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
