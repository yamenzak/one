/**
 * The deployment is closed — the whole app, replaced by one screen.
 *
 * ⚠️ THE PLATFORM'S, not one app's, and the file's own comment is why: "This is
 * about US. Nobody reading it did anything, nobody can pay to end it." A
 * deployment-wide maintenance window says exactly the same thing whatever the
 * product is, and the only variable is the name over the door.
 *
 * It lived in one app while `platform.maintenance` closed all of them, so two
 * of three rendered a generic failure for a state the operator had deliberately
 * chosen. Moving it is the difference between an app that says "we'll be right
 * back" and one that looks broken.
 *
 * Not the same thing as `StudioBlocked`, and the difference is the whole reason
 * this is a separate screen rather than another branch of that one. `StudioBlocked`
 * is about ONE studio and its bill: it names the studio, it tells the owner what
 * to pay, and it keeps the export door open because the data is still there and
 * still theirs. This is about US. Nobody reading it did anything, nobody can pay
 * to end it, and there is no door to hold open because every door is shut.
 *
 * So the copy owes them exactly three things and nothing else: that this is
 * deliberate, that it is ours and not theirs, and — if the operator wrote one —
 * when it ends. Anything more is filler on a screen someone is staring at while
 * they wait.
 *
 * ── Why the reload button is here ───────────────────────────────────────────
 *
 * It is the one action that can actually be useful. When maintenance lifts, this
 * screen does not know: the app resolved `/api/host` at boot and has been sitting
 * on the answer. A reload is the only way back in, and doing it through
 * `hardRefresh` also sheds a service worker that may be holding a build from
 * before the window — which, if the window existed to ship that build, is the
 * whole point.
 *
 * No T1 anchor (§1): the subject is a state, not a value. The badge and the
 * sentence are the anchor, exactly as on `StudioBlocked`.
 */

import { Card, IconBadge, Page, Stagger, TierAnchor, Wrench } from "@4dl/ui";
import { RefreshNote } from "./RefreshNote.js";
import type { Maintenance as MaintenanceState } from "@4dl/tenancy/model";

/** "Since 14:02" — a local time, because "3 hours ago" is a worse answer to
 *  "how long has this been going on" than the clock the person is looking at. */
function startedAt(since: string | null): string | null {
  if (!since) return null;
  const t = new Date(since);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}

export function MaintenanceScreen({ state, brandName }: { state: MaintenanceState; brandName?: string | null }) {
  const started = startedAt(state.since);
  return (
    <Page className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <TierAnchor className="flex flex-col items-center gap-3 text-center">
        <IconBadge icon={Wrench} tone="primary" size="lg" />
        <div className="space-y-1.5">
          <h1 className="text-title-1">{brandName || "We"}&rsquo;ll be right back</h1>
          <p className="text-body text-muted-foreground">
            {/* The operator's own words win. They know what is happening and when
                it ends; no wording chosen months in advance can beat that. */}
            {state.message || "We're doing some maintenance. Nothing is wrong with your account — everything will be here when we're done."}
          </p>
        </div>
      </TierAnchor>

      <Stagger className="space-y-3">
        <Card className="space-y-1.5 text-center">
          <p className="text-caption text-muted-foreground">
            {started ? `Started ${started}. ` : ""}
            Your data is untouched. You don&rsquo;t need to do anything.
          </p>
        </Card>
        {/* The screen cannot know when the window lifts — the host was read once,
            at boot. Asking again is the only way back in. */}
        <RefreshNote label="Think it&rsquo;s over?" action="Check again" />
      </Stagger>
    </Page>
  );
}
