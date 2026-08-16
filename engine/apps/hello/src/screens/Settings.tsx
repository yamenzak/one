/**
 * SETTINGS — and nobody wrote it.
 *
 * ⚠️ THIS IS THE AUTODISCOVERY CLAIM, RENDERED. Every control on this screen
 * comes from `HELLO.settings`; adding a setting to the manifest puts a row here
 * with no screen edited, and removing one takes the row away. The `settings`
 * shape refuses a primary action, because half these controls save themselves
 * and a Save button beside them says the other half do not.
 */

import * as React from "react";
import { Screen, Settings as Rendered } from "@engine/design";
import { HELLO } from "../index.js";

export function Settings({ title, level, held, stored, onChange, includes }: {
  readonly title?: string;
  readonly level: "tenant" | "person";
  readonly held: ReadonlySet<string>;
  readonly stored: Readonly<Record<string, unknown>>;
  readonly onChange: (id: string, value: unknown) => void;
  /** What the plan covers — a setting it does not is shown and locked, never hidden. */
  readonly includes?: (entitlement: string) => boolean;
}) {
  return (
    <Screen shape="settings" title={title}>
      <Rendered
        book={HELLO.settings ?? {}}
        level={level}
        stored={stored}
        held={held}
        onChange={onChange}
        includes={includes}
      />
    </Screen>
  );
}
