/**
 * HOW YOU ARE TOLD — yours, everywhere, and nobody else's business.
 *
 * ⚠️ IT FOLLOWS THE PERSON, NOT THE WORKSPACE. The preference is stored per
 * person per notification type, so filing it under a workspace would mean
 * setting the same thing once per workspace and having them disagree.
 *
 * ⚠️ AND IT IS SEPARATE FROM THE CEILING BY DESIGN — see `Notices.tsx`. This
 * screen is somebody deciding how much they want to hear; that one is an owner
 * deciding what a colleague is allowed to miss. They shared a screen, and a
 * person scrolling down it could change what forty people are sent while
 * looking for their own email switch.
 *
 * ⚠️ THE DEVICE SWITCH IS ABOVE THE PER-TYPE LIST, AND THAT IS THE ORDER OF THE
 * QUESTIONS. "May this device show notifications" is answered once by the
 * browser and cannot be overridden per type; "which ones" is only worth asking
 * after it. Underneath the list it reads as a footnote to a screen it actually
 * governs.
 */

import { useEffect, useState } from "react";
import {
  Group, NotificationPolicy, Nothing, PermissionRow, Screen, notice, type Permission,
} from "@engine/design";
import { BellRing } from "lucide-react";
import { api } from "../api.js";
import { pushState, turnPushOff, turnPushOn } from "../push.js";
import { useLoad, type CentreView } from "./data.js";
import { distinguishing } from "@engine/design";

export interface PolicyAnswer {
  readonly policy: Readonly<Record<string, readonly ("inbox" | "email" | "push")[]>>;
  readonly preference: Readonly<Record<string, readonly ("inbox" | "email" | "push")[]>>;
  /**
   * ⚠️ WHAT THIS DEPLOYMENT CAN ACTUALLY SEND ON, from the server. Both screens
   * had `["inbox", "email", "push"]` written out in the page — so a workspace
   * could switch on a channel nothing could deliver, and the symptom is somebody
   * waiting for an email that was never attempted.
   */
  readonly available: readonly ("inbox" | "email" | "push")[];
}

/**
 * THE ONE SWITCH THAT IS ABOUT THIS DEVICE RATHER THAN ABOUT YOU.
 *
 * ⚠️ THE SUBSCRIPTION BELONGS TO THIS ORIGIN, which is this workspace — so the
 * sentence under it says so. Somebody with three workspaces genuinely does turn
 * this on three times, and the reason is the same reason each one's
 * notifications arrive wearing its own logo.
 */
function OnThisDevice({ says }: { readonly says: string }) {
  /* ⚠️ `null` UNTIL IT IS KNOWN, never `off`. The browser is asked
     asynchronously, and a switch that starts off and flicks on a moment later
     reads as the product changing a setting by itself. */
  const [state, setState] = useState<Permission | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void pushState().then((now) => { if (live) setState(now.state); });
    return () => { live = false; };
  }, []);

  const flip = async (next: boolean) => {
    setBusy(true);
    /* ⚠️ `asking` WHILE THE BROWSER'S OWN PROMPT IS UP. It is modal and can sit
       there for as long as somebody ignores it; without this the switch shows
       the old value under a dialogue about the new one. */
    if (next) setState("asking");
    try {
      if (next) {
        const said = await turnPushOn();
        if (typeof said === "object") { setState("on"); notice.ok("Notifications are on here."); return; }
        setState(said === "denied" ? "denied" : "off");
        /* ⚠️ EACH REFUSAL SAYS WHICH ONE IT WAS. "Something went wrong" over a
           permission somebody deliberately blocked is the sentence that sends
           them to support instead of to their browser settings. */
        if (said === "denied") return;
        notice.fail(said === "no_keypair"
          ? "Notifications are not set up on this deployment yet"
          : said === "unavailable"
            ? "This browser cannot show notifications"
            : "That did not work — try again");
      } else {
        const off = await turnPushOff();
        setState("off");
        if (off) notice.ok("Notifications are off here.");
        else notice.fail("Turned off here, but we could not tell the server");
      }
    } finally {
      setBusy(false);
    }
  };

  /* ⚠️ Nothing is drawn until the browser has answered — see above. */
  if (!state) return null;

  return (
    <Group label="On this device">
      <PermissionRow
        icon={<BellRing />}
        label="Notifications"
        under={says}
        state={busy && state !== "denied" ? "asking" : state}
        onChange={(next) => void flip(next)}
        whyUnavailable="This browser cannot show notifications"
      />
    </Group>
  );
}

export function Told({ view }: { readonly view: CentreView }) {
  const of = useLoad<PolicyAnswer>("inbox.settings");

  const narrow = async (id: string, channels: readonly string[]) => {
    const out = await api.post("inbox.preference", { type: id, channels });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Saved.");
    of.again();
  };

  return (
    /* ⚠️ `settings` — every switch here saves itself, so the shape refuses a
       primary action outright (`screen.tsx`). */
    <Screen
      shape="settings"
      of={of.of}
      again={of.again}
      then={(told) => (
        <>
          {/* ⚠️ OFFERED ONLY WHERE IT CAN BE DELIVERED. On a deployment with no
              push keypair the whole card is absent rather than present and
              inert — the same rule the per-type switches follow. */}
          {told.available.includes("push")
            ? <OnThisDevice says={`Shown by ${view.tenant.name} on this browser`} />
            : null}

          {/* ⚠️ The inbox always keeps the record, so this is only about what
              ELSE reaches somebody — said once, on the screen, rather than under
              every product's heading. */}
          {view.apps.map((app) => (
            <NotificationPolicy
              key={app.id}
              book={app.notifications}
              level="person"
              label={distinguishing(view.apps, app.name)}
              policy={told.policy}
              preference={told.preference}
              held={new Set(app.permissions)}
              available={told.available}
              onChange={(id, channels) => void narrow(id, channels)}
            />
          ))}
          {view.apps.length === 0
            ? <Nothing says="Nothing here sends notifications yet" />
            : null}
        </>
      )}
    />
  );
}
