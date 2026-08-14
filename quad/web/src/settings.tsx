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

import type { SettingBook, SettingDef, Level } from "@quad/kernel";
import { disclose, groupsOn, settingsOn } from "@quad/kernel";
import { Card, Chip, Separator } from "@heroui/react";
import { Field } from "./field.js";
import { SPACE } from "./metrics.js";

export interface SettingsProps {
  readonly book: SettingBook;
  readonly level: Level;
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

export function Settings({ book, level, stored, held, includes, onChange }: SettingsProps) {
  const groups = groupsOn(book, level);
  const mine = settingsOn(book, level).filter((s) => visible(s, held));

  if (!mine.length) {
    return <Card><Card.Header><Card.Title>Nothing to change here</Card.Title></Card.Header></Card>;
  }

  return (
    <div className={`flex flex-col ${SPACE.roomy}`}>
      {groups.map((group) => {
        const rows = mine.filter((s) => s.group === group);
        if (!rows.length) return null;
        return (
          <Card key={group}>
            <Card.Header><Card.Title>{group}</Card.Title></Card.Header>
            <Card.Content>
              <div className={`flex flex-col ${SPACE.roomy}`}>
                {rows.map((def, i) => {
                  const locked = !!def.entitlement && includes ? !includes(def.entitlement) : false;
                  const shown = disclose(def, stored);
                  return (
                    <div key={def.id} className={`flex flex-col ${SPACE.tight}`}>
                      {i > 0 ? <Separator /> : null}
                      <Field
                        name={def.id}
                        spec={def.field}
                        value={"value" in shown ? shown.value : undefined}
                        set={"set" in shown ? shown.set : undefined}
                        disabled={locked}
                        onChange={(value) => onChange(def.id, value)}
                      />
                      {/* ⚠️ Shown and locked, because it is something they can buy. */}
                      {locked
                        ? <Chip color="warning" variant="soft"><Chip.Label>Your plan does not include this</Chip.Label></Chip>
                        : null}
                    </div>
                  );
                })}
              </div>
            </Card.Content>
          </Card>
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
