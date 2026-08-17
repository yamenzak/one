/**
 * SETTINGS — and nobody wrote it.
 *
 * ⚠️ THIS IS THE AUTODISCOVERY CLAIM, RENDERED. Every control on this screen
 * comes from `HELLO.settings`; adding a setting to the manifest puts a row here
 * with no screen edited, and removing one takes the row away. The `settings`
 * shape refuses a primary action, because every row here saves itself — a
 * switch the moment it moves, everything else when its sheet is saved — and a
 * Save button over that says there is something still unsaved.
 *
 * ⚠️ BOTH LEVELS, ON ONE SCREEN, BECAUSE THAT IS WHERE SOMEBODY LOOKS. A
 * workspace's settings and your own are two audiences and one destination —
 * splitting them across two routes means half of them are somewhere nobody goes.
 * Tabs are right here for the reason `PageTabs` states: these are two facets of
 * one subject, not two places.
 *
 * ⚠️ AND WHAT A PERMISSION HIDES IS THE RENDERER'S BUSINESS, NOT THIS SCREEN'S.
 * `held` goes in and the rows a reader may not change do not come out — so a
 * reader opening the workspace tab sees an honest, shorter list rather than a
 * row that refuses when pressed.
 */

import * as React from "react";
import { PageTabs, Screen, Settings as Rendered, Stack, type Refusal } from "@engine/design";
import { HELLO } from "../index.js";

export function Settings({ title, level, held, stored, onChange, includes }: {
  readonly title?: string;
  /** Which tab opens. The other is one press away. */
  readonly level: "tenant" | "person";
  readonly held: ReadonlySet<string>;
  readonly stored: Readonly<Record<string, unknown>>;
  /** ⚠️ A refusal comes BACK, so it lands in the sheet — see `edit.tsx`. */
  readonly onChange: (id: string, value: unknown) => Refusal | Promise<Refusal>;
  /** What the plan covers — a setting it does not is shown and locked, never hidden. */
  readonly includes?: (entitlement: string) => boolean;
}) {
  const [tab, setTab] = React.useState<string>(level);

  const book = HELLO.settings ?? {};
  const of = (which: "tenant" | "person") => (
    <Stack space="roomy">
      <Rendered
        book={book}
        level={which}
        stored={stored}
        held={held}
        onChange={onChange}
        includes={includes}
      />
    </Stack>
  );

  return (
    <Screen shape="settings" title={title}>
      <PageTabs
        label="Settings"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "tenant", label: "Workspace", content: of("tenant") },
          { id: "person", label: "You", content: of("person") },
        ]}
      />
    </Screen>
  );
}
