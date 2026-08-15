/**
 * SETTINGS — generated from the declarations, two authorities on one screen.
 *
 * ⚠️ NO APP WROTE ANY OF THIS. Each product's declared settings render through
 * the platform's one Settings surface; the workspace's rows save with the
 * declaration's own `needs`, a person's rows are theirs. The notification
 * policy is the same two levels: the workspace sets a ceiling, you narrow your
 * own — same door, different authority, and the screen says which is which.
 *
 * ⚠️ ONE SECTION PER PRODUCT, HOLDING EVERYTHING ABOUT IT. This was two passes
 * over the same list — every product's settings, then every product's
 * notification policy — so a workspace with two products read them A, B, A, B,
 * and each block re-stated whose it was in a heading of its own. With ONE
 * product that came out as four headings all beginning "Kova — ": the word that
 * varies buried at the end, after the words they share.
 *
 * ⚠️ WHAT THE PRODUCTS SAY ON THIS WORKSPACE'S BEHALF IS ITS OWN SCREEN — see
 * `Wording.tsx`. It was a third section under here, below every product's
 * settings and every product's notification policy, which is how the one thing
 * on the page somebody edits deliberately became the one nobody scrolled to.
 */

import { Await, FormWaiting, NotificationPolicy, Section, Settings, Stack, notice } from "@quad/web";
import { settingsOn } from "@quad/kernel";
import { api } from "../api.js";
import { useLoad, type CentreApp, type CentreView } from "./data.js";

interface PolicyAnswer {
  readonly policy: Readonly<Record<string, readonly ("inbox" | "email" | "push")[]>>;
  readonly preference: Readonly<Record<string, readonly ("inbox" | "email" | "push")[]>>;
}

export function SettingsArea({ view }: { readonly view: CentreView }) {
  /* ⚠️ ONE LOAD FOR THE WHOLE SCREEN, because the policy is the PERSON's and the
     workspace's rather than a product's. Read here and handed down, instead of
     inside a loop that would ask for the same rows once per product. */
  const inbox = useLoad<PolicyAnswer>("inbox.settings");

  return (
    <Await
      of={inbox.of}
      waiting={<FormWaiting fields={3} />}
      again={inbox.again}
      then={(told) => (
        <Stack space="roomy">
          {/* ⚠️ The crown names the screen — see hub/Hub.tsx. */}
          {view.apps.map((app) => (
            <Section key={app.id} label={app.name}>
              <Stack space="roomy">
                <AppSettings app={app} />
                <Told view={view} app={app} told={told} again={inbox.again} />
              </Stack>
            </Section>
          ))}
        </Stack>
      )}
    />
  );
}

/* ---------------------------------------------------------------- settings --- */

interface StoredAnswer {
  readonly tenant: Readonly<Record<string, { value?: unknown; set?: boolean }>>;
  readonly person: Readonly<Record<string, { value?: unknown }>>;
}

function AppSettings({ app }: { readonly app: CentreApp }) {
  const stored = useLoad<StoredAnswer>("setting.read", { app: app.id });
  const held = new Set([...app.permissions]);

  const hasTenant = settingsOn(app.settings, "tenant").length > 0;
  const hasPerson = settingsOn(app.settings, "person").length > 0;
  if (!hasTenant && !hasPerson) return null;

  const write = async (id: string, value: unknown) => {
    const out = await api.post("setting.write", { app: app.id, id, value });
    if (!out.ok) { notice.fail(out.problem.title); stored.again(); return; }
    notice.ok("Saved.");
  };

  return (
    <Await
      of={stored.of}
      waiting={<FormWaiting fields={3} />}
      again={stored.again}
      then={(data) => (
        /* ⚠️ WHOSE SETTING IT IS RIDES ON THE GROUP, not on a heading of its
           own. Each declared group is already a card with a name on it, and a
           line under that name is where "everyone" against "only you" belongs. */
        <Stack space="roomy">
          {hasTenant ? (
            <Settings
              book={app.settings}
              level="tenant"
              under="Everyone in this workspace"
              stored={flat(data.tenant)}
              held={held}
              onChange={(id, value) => void write(id, value)}
            />
          ) : null}
          {hasPerson ? (
            <Settings
              book={app.settings}
              level="person"
              under="Only you"
              stored={flat(data.person)}
              held={held}
              onChange={(id, value) => void write(id, value)}
            />
          ) : null}
        </Stack>
      )}
    />
  );
}

/* The wire shape is `disclose`'s — `{value}` or `{set}` — and the screen reads
   a flat record. A secret never has a value here, by construction. */
const flat = (
  rows: Readonly<Record<string, { value?: unknown; set?: boolean }>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(rows)
    .filter(([, v]) => v.value !== undefined)
    .map(([k, v]) => [k, v.value]));

/* ----------------------------------------------------------- notifications --- */

function Told({ view, app, told, again }: {
  readonly view: CentreView;
  readonly app: CentreApp;
  readonly told: PolicyAnswer;
  readonly again: () => void;
}) {
  const manage = view.you.platform.includes("tenant:manage");
  const held = new Set(app.permissions);

  const narrow = async (id: string, channels: readonly string[]) => {
    const out = await api.post("inbox.preference", { type: id, channels });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Saved.");
    again();
  };

  const ceiling = async (id: string, channels: readonly string[]) => {
    const out = await api.post("inbox.policy", { type: id, channels });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Saved for the whole workspace.");
    again();
  };

  return (
    <Stack space="roomy">
      <NotificationPolicy
        book={app.notifications}
        level="person"
        label="How you are told"
        under="Email and push you may refuse — the inbox keeps the record"
        policy={told.policy}
        preference={told.preference}
        held={held}
        available={["inbox", "email", "push"]}
        onChange={(id, channels) => void narrow(id, channels)}
      />
      {manage ? (
        <NotificationPolicy
          book={app.notifications}
          level="tenant"
          label="How everybody is told"
          under="The ceiling each person narrows their own settings under"
          policy={told.policy}
          preference={{}}
          held={held}
          available={["inbox", "email", "push"]}
          onChange={(id, channels) => void ceiling(id, channels)}
        />
      ) : null}
    </Stack>
  );
}
