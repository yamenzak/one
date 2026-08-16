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
 */

import { NotificationPolicy, Nothing, Screen, notice } from "@engine/design";
import { api } from "../api.js";
import { useLoad, type CentreView } from "./data.js";
import { distinguishing } from "@engine/design";

export interface PolicyAnswer {
  readonly policy: Readonly<Record<string, readonly ("inbox" | "email" | "push")[]>>;
  readonly preference: Readonly<Record<string, readonly ("inbox" | "email" | "push")[]>>;
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
              available={["inbox", "email", "push"]}
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
