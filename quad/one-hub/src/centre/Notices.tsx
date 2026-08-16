/**
 * WHAT EVERYBODY IS TOLD — the workspace's ceiling, which is administration.
 *
 * ⚠️ THIS IS NOT A PREFERENCE AND IT MUST NOT SIT BESIDE ONE. Switching a
 * channel off here takes it away from every colleague, including the ones who
 * turned it on for themselves — so it belongs where a workspace's other
 * consequential settings are, behind its own name, reached on purpose. It used
 * to be the lower half of the screen where somebody sets their own email.
 *
 * ⚠️ AND WHAT IT CANNOT DO IS THE REASSURING PART: the inbox always keeps the
 * record. A ceiling withholds email and push; it never withholds the fact.
 */

import { NoteRow, NotificationPolicy, Screen, distinguishing, notice } from "@quad/design";
import { api } from "../api.js";
import { useLoad, type CentreView } from "./data.js";
import type { PolicyAnswer } from "./Told.js";

export function Notices({ view }: { readonly view: CentreView }) {
  const of = useLoad<PolicyAnswer>("inbox.settings");

  const ceiling = async (id: string, channels: readonly string[]) => {
    const out = await api.post("inbox.policy", { type: id, channels });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Saved for the whole workspace.");
    of.again();
  };

  return (
    /* ⚠️ `settings` — every control here saves itself the moment it changes, so
       the shape refuses a primary action outright (`screen.tsx`). */
    <Screen
      shape="settings"
      refused={view.you.platform.includes("tenant:manage")
        ? undefined
        : { says: "Only an owner or a manager may set this", under: "Your own settings are under You" }}
      of={of.of}
      again={of.again}
      then={(told) => (
        <>
          {view.apps.map((app) => (
            <NotificationPolicy
              key={app.id}
              book={app.notifications}
              level="tenant"
              label={distinguishing(view.apps, app.name)}
              policy={told.policy}
              preference={{}}
              held={new Set(app.permissions)}
              available={["inbox", "email", "push"]}
              onChange={(id, channels) => void ceiling(id, channels)}
            />
          ))}
          {/* ⚠️ The limit of the damage, stated where the damage is done. */}
          <NoteRow>
            Everybody may narrow this further for themselves, and the inbox keeps the
            record whatever is switched off here.
          </NoteRow>
        </>
      )}
    />
  );
}
