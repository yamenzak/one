/**
 * THE THREE SETTINGS SCREENS, WHICH NO APP WRITES.
 *
 * ⚠️ EVERY DECLARED SETTING RENDERS SOMEWHERE A PERSON CAN CHANGE IT. That is
 * half of the autodiscovery rule and the half that is easy to lose: a mechanism
 * fully built, wired and tested, with nowhere anybody could look. A previous
 * platform shipped that repeatedly, and every suite stayed green.
 *
 * ⚠️ AND A CONTROL SOMEBODY CANNOT USE IS ABSENT, NOT BROKEN. A setting whose
 * permission the reader does not hold is not rendered at all — showing it
 * disabled invites them to ask for it, which is sometimes right and is a
 * decision the workspace's owner should be making, not a screen.
 *
 * ⚠️ A SETTING BEHIND AN ENTITLEMENT IS SHOWN AND LOCKED, WHICH IS THE OPPOSITE
 * CHOICE, AND DELIBERATELY. That one is something they can buy, so hiding it
 * hides the offer; the lock is the offer.
 */

import type { SettingBook, SettingDef, Level } from "@engine/kernel";
import { disclose, groupsOn, settingsOn } from "@engine/kernel";
import { Field } from "./field.js";
import { ControlRow, Group, ToggleRow } from "../parts/surfaces.js";
import { Nothing } from "../parts/state.js";
import { SPACE } from "../tokens/metrics.js";

export interface SettingsProps {
  readonly book: SettingBook;
  readonly level: Level;
  /**
   * ⚠️ WHOSE SETTINGS THESE ARE, IN A LINE — "Everyone in this workspace" or
   * "Only you". It is the one fact a settings screen must not leave ambiguous,
   * and the level alone does not carry it to the reader.
   */
  readonly under?: string;
  /** What is stored. A key that is absent falls back to the declaration's. */
  readonly stored: Readonly<Record<string, unknown>>;
  readonly held: ReadonlySet<string>;
  /** Whether the workspace's plan includes a given key. */
  readonly includes?: (entitlement: string) => boolean;
  readonly onChange: (id: string, value: unknown) => void;
}

/** ⚠️ Absent, not disabled — see the header. */
const visible = (def: SettingDef, held: ReadonlySet<string>): boolean =>
  !def.needs || held.has(def.needs);

export function Settings({ book, level, under, stored, held, includes, onChange }: SettingsProps) {
  const groups = groupsOn(book, level);
  const mine = settingsOn(book, level).filter((s) => visible(s, held));

  if (!mine.length) return <Nothing says="Nothing to change here" />;

  return (
    <div className={`flex flex-col ${SPACE.roomy}`}>
      {groups.map((group) => {
        const rows = mine.filter((s) => s.group === group);
        if (!rows.length) return null;
        return (
          /*
            ⚠️ A GROUP OF ROWS, NOT A CARD PER SETTING. Every declared setting
            used to be a `Card` with a title, a description and a full-width
            form control stacked inside — the shape of one step of a wizard,
            drawn once per row. A settings screen is a list of facts you change:
            the name and what it means on the left, the control at the end.

            ⚠️ AND THE AUTHORITY IS SAID ONCE, HERE. Whether a row changes
            something for the whole workspace or only for the reader is the one
            thing this screen must not leave ambiguous, and it was carried in a
            section heading per app per level — four headings all starting with
            the product's name on a workspace with one product.
          */
          <Group key={group} label={group} under={under}>
            {rows.map((def) => {
              const locked = !!def.entitlement && includes ? !includes(def.entitlement) : false;
              const shown = disclose(def, stored);
              const value = "value" in shown ? shown.value : undefined;
              const set = "set" in shown ? shown.set : undefined;
              /* ⚠️ Shown and locked, because it is something they can buy — so
                 the reason rides on the row rather than as a chip under it. */
              const help = locked ? "Your plan does not include this" : def.field.help;

              if (def.field.kind === "bool") {
                return (
                  <ToggleRow
                    key={def.id}
                    label={def.field.label}
                    under={help}
                    value={value === true}
                    isDisabled={locked || value === undefined}
                    onChange={(next) => onChange(def.id, next)}
                  />
                );
              }

              return (
                <ControlRow
                  key={def.id}
                  label={def.field.label}
                  under={help}
                  /* ⚠️ A textarea takes the width whatever the screen is; every
                     other control sits at the end of the row. */
                  wide={def.field.kind === "long"}
                >
                  <Field
                    bare
                    name={def.id}
                    spec={def.field}
                    value={value}
                    set={set}
                    disabled={locked}
                    onChange={(next) => onChange(def.id, next)}
                  />
                </ControlRow>
              );
            })}
          </Group>
        );
      })}
    </div>
  );
}

/**
 * ⚠️ WHAT THE SCREEN WOULD SHOW, AS DATA. The guard that asks "does every
 * declaration reach a surface" reads this rather than a rendered string — a
 * check that parses HTML is a check that breaks when a class name changes, and
 * then somebody deletes it.
 */
export const settingsShown = (
  book: SettingBook, level: Level, held: ReadonlySet<string>,
): readonly string[] => settingsOn(book, level).filter((s) => visible(s, held)).map((s) => s.id);
