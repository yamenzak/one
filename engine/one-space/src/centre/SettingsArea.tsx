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

export function SettingsArea({ view, level, app, area, onGo, onArea }: {
  readonly view: CentreView;
  /**
   * ⚠️ WHICH AUTHORITY THIS SCREEN IS, AND IT IS ONE PER SCREEN. The workspace's
   * settings and a person's own preferences rendered one under the other here —
   * an administration surface with a preference inside it, which also hid the
   * preference from anybody without `tenant:manage`. They are two destinations
   * now (`settings` and `prefs`), the same split the hub already draws between
   * `notices` and `told`.
   */
  readonly level: "tenant" | "person";
  /** Which product's settings, when the workspace holds more than one. */
  readonly app?: string;
  /** Which page of that product's, when it declares more than one. */
  readonly area?: string;
  readonly onGo: (appId: string) => void;
  readonly onArea: (areaId: string) => void;
}) {
  const has = (a: CentreApp) => settingsOn(a.settings, level).length > 0;
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
      then={(a) => <AppSettings app={a} level={level} area={area} onArea={onArea} />}
    />
  );
}

interface StoredAnswer {
  readonly tenant: Readonly<Record<string, { value?: unknown; set?: boolean }>>;
  readonly person: Readonly<Record<string, { value?: unknown }>>;
}

function AppSettings({ app, level, area, onArea }: {
  readonly app: CentreApp;
  readonly level: "tenant" | "person";
  readonly area?: string;
  readonly onArea: (areaId: string) => void;
}) {
  const stored = useLoad<StoredAnswer>("setting.read", { app: app.id });
  const held = new Set([...app.permissions]);

  /*
    ⚠️ THE REFUSAL IS RETURNED, NOT ANNOUNCED. `Settings` puts it in the sheet
    that is still open holding what somebody typed; a toast from here would be a
    sentence beside a row that has already gone back to the old value, and there
    would then be two places a failure is reported depending on the field's kind.

    ⚠️ AND A REFUSED WRITE RE-READS. The row renders from `stored`, so leaving it
    alone leaves the screen showing a value the server declined.
  */
  const write = async (id: string, value: unknown) => {
    const out = await api.post("setting.write", { app: app.id, id, value });
    if (!out.ok) { stored.again(); return out.problem; }
    notice.ok("Saved.");
    return null;
  };

  return (
    /* ⚠️ `settings` — every row here saves itself, a switch the moment it moves
       and everything else when its own sheet is saved, so the shape refuses a
       primary action. A Save button over rows that have already saved says
       there is something outstanding when there is not. */
    <Screen
      shape="settings"
      of={stored.of}
      again={stored.again}
      /* ⚠️ WHOSE SETTING IT IS RIDES ON THE PAGE, not on a heading of its own.
         An area is already a card with a name on it, and a line under that name
         is where "everyone" against "only you" belongs. */
      then={(data) => (
        <Settings
          book={app.settings}
          areas={app.settingAreas}
          level={level}
          area={area}
          onArea={onArea}
          under={level === "tenant" ? "Everyone in this workspace" : "Only you"}
          stored={flat(level === "tenant" ? data.tenant : data.person)}
          held={held}
          onChange={write}
        />
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
