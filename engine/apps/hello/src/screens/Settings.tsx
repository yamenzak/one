/**
 * SETTINGS — and nobody wrote it.
 *
 * ⚠️ THIS IS THE AUTODISCOVERY CLAIM, RENDERED. Every control on this screen
 * comes from `HELLO.settings`; adding a setting to the manifest puts a row here
 * with no screen edited, and removing one takes the row away. The `settings`
 * shape refuses a primary action, because every row saves itself — a switch the
 * moment it moves, everything else when its sheet is saved — and a Save button
 * over that says there is something still unsaved.
 *
 * ⚠️ ONE LEVEL PER SCREEN, WHICH THIS DID NOT DO. Both levels were two tabs
 * here, on the argument that they are two facets of one subject. They are not:
 * the level is an AUTHORITY, so what the whole workspace is set to and what one
 * person prefers are two operations done by different people with different
 * consequences — DESIGN.md §3's first question. The cost of the old shape was
 * concrete: the screen's permission had to be `tenant:manage`, so a member with
 * no workspace authority could not reach their OWN preferences.
 *
 * ⚠️ AND WITHIN A LEVEL IT DESCENDS. `Rendered` lists the app's declared areas
 * and opens one; where there is a single area it IS the screen. This file passes
 * the address through and decides nothing.
 *
 * ⚠️ WHAT A PERMISSION HIDES IS THE RENDERER'S BUSINESS, NOT THIS SCREEN'S.
 * `held` goes in and the rows a reader may not change do not come out.
 */

import { Screen, Settings as Rendered, type Refusal } from "@engine/design";
import { HELLO } from "../index.js";

export function Settings({ title, level, area, onArea, held, stored, onChange, includes }: {
  readonly title?: string;
  /** ⚠️ Which authority this screen is. One per screen — see the header. */
  readonly level: "tenant" | "person";
  /** ⚠️ Which page, from the address. Absent lists them. */
  readonly area?: string;
  readonly onArea: (id: string) => void;
  readonly held: ReadonlySet<string>;
  readonly stored: Readonly<Record<string, unknown>>;
  /** ⚠️ A refusal comes BACK, so it lands in the sheet — see `edit.tsx`. */
  readonly onChange: (id: string, value: unknown) => Refusal | Promise<Refusal>;
  /** What the plan covers — a setting it does not is shown and locked, never hidden. */
  readonly includes?: (entitlement: string) => boolean;
}) {
  return (
    <Screen shape="settings" title={title}>
      <Rendered
        book={HELLO.settings ?? {}}
        areas={HELLO.settingAreas ?? {}}
        level={level}
        area={area}
        onArea={onArea}
        under={level === "tenant" ? "Everyone in this workspace" : "Only you"}
        stored={stored}
        held={held}
        onChange={onChange}
        includes={includes}
      />
    </Screen>
  );
}
