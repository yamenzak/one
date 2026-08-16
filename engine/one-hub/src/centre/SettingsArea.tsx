/**
 * SETTINGS — what a product is set to, for this workspace and for you.
 *
 * ⚠️ NO APP WROTE ANY OF THIS. Each product's declared settings render through
 * the platform's one Settings surface; the workspace's rows save with the
 * declaration's own `needs`, a person's rows are theirs.
 *
 * ⚠️ ONE PRODUCT AT A TIME, AND THE LIST IS HOW YOU CHOOSE ONE. This screen used
 * to render EVERY product's settings in one column with the product's name
 * repeated as a heading — fine with one product, a report with six, and the
 * customer with six is the one to design for (DESIGN.md §3). With one product
 * there is nothing to choose between, so the list stands down and its settings
 * ARE the screen; nobody pays a tap for a menu with one item on it.
 *
 * ⚠️ AND WHAT THE WHOLE WORKSPACE IS TOLD IS NOT HERE. It was a second half of
 * this screen: a person narrowing their own email, and an owner deciding what
 * every colleague may be sent, one under the other. Same subject, different
 * operation, different authority, different frequency — which is three reasons
 * to be two screens (DESIGN.md §3).
 */

import { Screen, Settings, Whichever, appFace, notice } from "@engine/design";
import { settingsOn } from "@engine/kernel";
import { api } from "../api.js";
import { useLoad, type CentreApp, type CentreView } from "./data.js";

export function SettingsArea({ view, app, onGo }: {
  readonly view: CentreView;
  /** Which product's settings, when the workspace holds more than one. */
  readonly app?: string;
  readonly onGo: (appId: string) => void;
}) {
  const has = (a: CentreApp) =>
    settingsOn(a.settings, "tenant").length > 0 || settingsOn(a.settings, "person").length > 0;
  const settable = view.apps.filter(has);

  /* ⚠️ ONE PRODUCT IS THE SCREEN; SEVERAL ARE A LIST — and the four branches
     that says (none, one, several-chosen, several-unchosen) are `Whichever`'s
     now. Three screens wrote them by hand. */
  return (
    <Whichever
      items={settable}
      id={(a) => a.id}
      name={(a) => a.name}
      face={(a) => appFace(a.id, a.mark)}
      chosen={app}
      onChoose={onGo}
      nothing={{
        says: "Nothing to change here",
        under: "No product in this workspace declares a setting",
      }}
      then={(a) => <AppSettings app={a} />}
    />
  );
}

interface StoredAnswer {
  readonly tenant: Readonly<Record<string, { value?: unknown; set?: boolean }>>;
  readonly person: Readonly<Record<string, { value?: unknown }>>;
}

function AppSettings({ app }: { readonly app: CentreApp }) {
  const stored = useLoad<StoredAnswer>("setting.read", { app: app.id });
  const held = new Set([...app.permissions]);

  const hasTenant = settingsOn(app.settings, "tenant").length > 0;
  const hasPerson = settingsOn(app.settings, "person").length > 0;

  const write = async (id: string, value: unknown) => {
    const out = await api.post("setting.write", { app: app.id, id, value });
    if (!out.ok) { notice.fail(out.problem.title); stored.again(); return; }
    notice.ok("Saved.");
  };

  return (
    /* ⚠️ `settings` — every control writes on change (see `write`), so the shape
       refuses a primary action. A Save button here would be a screen where half
       the controls save themselves and half do not. */
    <Screen
      shape="settings"
      of={stored.of}
      again={stored.again}
      then={(data) => (
        /* ⚠️ WHOSE SETTING IT IS RIDES ON THE GROUP, not on a heading of its
           own. Each declared group is already a card with a name on it, and a
           line under that name is where "everyone" against "only you" belongs. */
        <>
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
        </>
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
