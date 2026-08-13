/**
 * A SCREEN DERIVED FROM A DECLARATION — one control per kind, nothing written
 * per app.
 *
 * ⚠️ THE FORM WRITTEN BY HAND IS THE ONE THAT GOES OUT OF DATE, and it does so
 * in the direction nobody notices. A setting added to a manifest and not to the
 * form is a setting with a default nobody can change, on a screen that looks
 * complete. One removed and left on the form is a control that writes a key no
 * consumer reads — indistinguishable, to whoever presses it, from a setting that
 * does not work. Neither fails. Both are one edit somebody forgot.
 *
 * ⚠️ SO THE DECLARATION IS THE SCREEN. `SettingsSpec` already carries the label,
 * the kind, the range, the choices and the help line; `settings.read` already
 * sends it beside the values, deliberately, so that "a screen is rendered from
 * what the deployment actually has rather than from a form somebody wrote to
 * match". What was missing was the piece that turns one into the other — which
 * is the whole of this file, and the reason adding a setting is now one line in
 * a manifest and nothing else anywhere.
 *
 * ⚠️ IT WRITES NO COPY OF ITS OWN, and that is the same rule the vault's screen
 * follows. Every word here comes from the declaration; a label invented at the
 * render site is a second vocabulary for one setting, and the one people quote
 * back at support is whichever they saw.
 *
 * ⚠️ AND AN UNKNOWN KIND RENDERS AS NOTHING RATHER THAN AS TEXT. A future kind
 * shown as a text box is a colour somebody types a word into and a number that
 * accepts "soon" — the store refuses it, correctly, and what the person sees is
 * a control that will not save. Absent is honest; wrong is not.
 */

import { useState, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Choose } from "../choose.js";
import { Card, Item, Unset, Waiting } from "../list.js";
import { Section } from "../screen.js";
import { SwitchRow } from "../switch.js";
import { ValueEditor, type EditableField } from "../editor.js";

/** One declared setting, exactly as `kernel/settings.ts` declares it. */
export interface Declared {
  readonly label: string;
  readonly kind: "text" | "number" | "bool" | "enum" | "media" | "colour";
  readonly fallback: string | number | boolean;
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly help?: string;
}

export type Declaration = Readonly<Record<string, Declared>>;
export type Values = Readonly<Record<string, string | number | boolean>>;

/** ⚠️ Every kind this file can actually draw. Anything else renders as nothing. */
const KNOWN: readonly Declared["kind"][] = ["text", "number", "bool", "enum", "media", "colour"];

export interface DeclaredProps {
  readonly declared: Declaration;
  /** ⚠️ Null until known — a control showing a fallback it does not have is a lie. */
  readonly values: Values | null;
  readonly onSet: (key: string, value: string | number | boolean) => Promise<Problem | null>;
  /**
   * ⚠️ WHICH KEYS THIS PERSON MAY WRITE, and absent means all of them. A setting
   * may be narrower than the screen it is on — the ones that cost money or take
   * something away from every customer of a workspace — and the server refuses
   * either way. This is what stops somebody being OFFERED the refusal.
   */
  readonly mayWrite?: (key: string) => boolean;
}

/**
 * ⚠️ GROUPED BY THE PREFIX OF THE KEY, because a declaration already has one.
 * `brand.name`, `brand.mark` and `brand.accent` are one card; `mail.signature`
 * is another. Derived rather than declared, so a new group is a key name rather
 * than a second registry to keep in step — and a flat list of eleven controls is
 * a settings screen nobody reads to the bottom of.
 */
export const groupsOf = (declared: Declaration): readonly (readonly [string, readonly string[]])[] => {
  const by = new Map<string, string[]>();
  for (const key of Object.keys(declared)) {
    const group = key.includes(".") ? key.slice(0, key.indexOf(".")) : "";
    by.set(group, [...(by.get(group) ?? []), key]);
  }
  return [...by].sort(([a], [b]) => a.localeCompare(b));
};

/** ⚠️ The group's own word, capitalised. Never a lookup table that can drift. */
const titled = (group: string): string | undefined =>
  group === "" ? undefined : group.replace(/^./, (c) => c.toUpperCase());

/**
 * ⚠️ WHAT A ROW SHOWS WHEN IT IS NOT THE CONTROL ITSELF. A setting nobody has
 * touched shows nothing rather than its fallback dressed as a choice — "" and
 * "the product's own name" are different facts, and a row that prints the
 * second as if somebody had typed it is a row that makes an untouched workspace
 * look configured.
 */
export const shownAs = (def: Declared, value: string | number | boolean | undefined): ReactNode => {
  const held = value ?? def.fallback;
  if (held === "" || held === undefined) return <Unset>Not set</Unset>;
  return <span className="value">{String(held)}</span>;
};

export function DeclaredSettings({ declared, values, onSet, mayWrite }: DeclaredProps): ReactNode {
  /* ⚠️ ONE PIECE OF STATE FOR THE WHOLE SCREEN, because only one sheet is ever
     open. A flag per control is a screen that can show two. */
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableField | null>(null);

  const may = (key: string) => (mayWrite ? mayWrite(key) : true);

  return (
    <>
      {groupsOf(declared).map(([group, keys]) => (
        <Section key={group || "rest"} name={titled(group)}>
          {values === null ? <Waiting rows={keys.length} /> : (
            <Card>
              {keys.map((key) => {
                const def = declared[key]!;
                const held = values[key] ?? def.fallback;
                const off = !may(key);

                if (def.kind === "bool") {
                  return (
                    <SwitchRow
                      key={key} title={def.label} detail={def.help}
                      on={held === true} disabled={off}
                      onChange={(next) => onSet(key, next)}
                    />
                  );
                }

                /*
                  ⚠️ AN UNKNOWN KIND DRAWS NOTHING — see the header. It has to be
                  checked HERE rather than trusted to a switch's default, because
                  every remaining kind renders through one shared row: a future
                  kind falling through to it is exactly the text box the header
                  says must never happen.
                */
                if (!KNOWN.includes(def.kind)) return null;

                /*
                  ⚠️ A ROW THAT OPENS SOMETHING, NEVER A CONTROL EMBEDDED IN ONE.
                  A switch is the exception because in a switch the choice IS the
                  action; everything else is a value somebody types or picks, and
                  a list of inline inputs is a form rather than a settings screen.
                */
                return (
                  <Item
                    key={key}
                    title={def.label}
                    /*
                      ⚠️ WHAT IT IS SET TO IS ON THE ROW, whether or not this
                      person may change it. A settings screen whose rows are only
                      names is a menu, and a menu between somebody and eleven
                      settings is a tax — the whole configuration should be
                      readable without opening anything.

                      ⚠️ AND IT IS IN THE DETAIL RATHER THAN THE ACTION SLOT. A
                      row goes somewhere or carries something on the right, never
                      both; put right, the value is silently dropped AND the row
                      stops opening. That is `Item`'s own rule and it has now bitten
                      four screens in this hub.
                    */
                    detail={
                      <>
                        {shownAs(def, values[key])}
                        {def.help ? ` ${def.help}` : ""}
                      </>
                    }
                    {...(off ? {} : {
                      onGo: () => {
                        if (def.kind === "enum") { setOpen(key); return; }
                        if (def.kind === "media") return;
                        setEditing({
                          name: key, kind: def.kind === "number" ? "number" : def.kind === "colour" ? "colour" : "text",
                          title: def.label, label: def.label, value: String(held),
                          ...(def.help ? { lede: def.help } : {}),
                        } as EditableField);
                      },
                    })}
                  />
                );
              })}
            </Card>
          )}
        </Section>
      ))}

      {/*
        ⚠️ ONE SHEET PER ENUM, RENDERED FOR THE OPEN ONE ONLY. Rendering one per
        key would mount a dialog per setting on a screen that has eleven, each
        with its own focus trap waiting to be the wrong one.
      */}
      {Object.entries(declared)
        .filter(([key, def]) => def.kind === "enum" && open === key)
        .map(([key, def]) => (
          <Choose
            key={key}
            open
            title={def.label}
            options={(def.values ?? []).map((v) => ({ value: v, label: v }))}
            value={String(values?.[key] ?? def.fallback)}
            onPick={(next) => onSet(key, next)}
            onClose={() => setOpen(null)}
          />
        ))}

      <ValueEditor
        field={editing}
        onSave={(name, value) => onSet(name, declared[name]?.kind === "number" ? Number(value) : value)}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
