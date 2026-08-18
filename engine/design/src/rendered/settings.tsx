/**
 * THE SETTINGS SCREENS, WHICH NO APP WRITES.
 *
 * ⚠️ EVERY DECLARED SETTING RENDERS SOMEWHERE A PERSON CAN CHANGE IT. That is
 * half of the autodiscovery rule and the half that is easy to lose: a mechanism
 * fully built, wired and tested, with nowhere anybody could look. A previous
 * platform shipped that repeatedly, and every suite stayed green.
 *
 * ⚠️ AND THE OTHER HALF IS THAT SOMEWHERE HAS TO BE A PLACE, NOT A PILE. This
 * rendered one column of every declared row, carded by a free-text `group`, so
 * an app with eight settings was a screen of three headings holding a switch, a
 * colour and an email address — three different kinds of consequence in one
 * scroll. DESIGN.md §3 answers that directly: what a control CHANGES is what
 * decides whether two of them belong together, and for those three the answer is
 * that they do not. Settings DESCEND — a list of declared areas, each opening
 * onto its own page.
 *
 * ⚠️ AND WHERE THERE IS ONE AREA, IT IS THE SCREEN. `Whichever`'s rule, applied
 * here for the reason it exists: nobody pays a tap for a menu with one item on
 * it. An app whose settings are all one subject lands on those settings.
 *
 * ⚠️ ONE LEVEL PER SCREEN, ALWAYS. The level is an AUTHORITY: what a whole
 * workspace is set to and what one person prefers are two operations, done by
 * different people, with different consequences — §3's first question, and it is
 * first because it is the one that decides. They were two tabs on one screen,
 * which is the same cram with a control bar over it.
 *
 * ⚠️ A CONTROL SOMEBODY CANNOT USE IS ABSENT, NOT BROKEN. A setting whose
 * permission the reader does not hold is not rendered at all — showing it
 * disabled invites them to ask for it, which is sometimes right and is a
 * decision the workspace's owner should be making, not a screen.
 *
 * ⚠️ A SETTING BEHIND AN ENTITLEMENT IS SHOWN AND LOCKED, WHICH IS THE OPPOSITE
 * CHOICE, AND DELIBERATELY. That one is something they can buy, so hiding it
 * hides the offer; the lock is the offer.
 */

import type { AreaBook, SettingBook, SettingDef, Level } from "@engine/kernel";
import { areasOn, disclose, settingsIn, settingsOn } from "@engine/kernel";
import { EditRow, type Refusal } from "./edit.js";
import { Group, ToggleRow } from "../parts/surfaces.js";
import { Nothing } from "../parts/state.js";
import { Whichever } from "../frame/screen.js";
import { glyphOf } from "../frame/shell.js";
import { notice } from "../frame/overlay.js";

export interface SettingsProps {
  readonly book: SettingBook;
  /** ⚠️ The pages these rows live on. Declared by the app — see `AreaDef`. */
  readonly areas: AreaBook;
  readonly level: Level;
  /**
   * ⚠️ WHICH PAGE THE ADDRESS NAMES, and it is an address rather than a state
   * for `Whichever`'s reason: going back from an area lands on the list, not on
   * whatever was before the whole surface.
   */
  readonly area?: string;
  readonly onArea: (id: string) => void;
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
  /**
   * ⚠️ IT ANSWERS WITH THE REFUSAL, WHICH IS WHAT MAKES THE SHEET HONEST.
   * Fire-and-forget, a failed save is a toast beside a row that has already
   * repainted itself with the value the server threw away. Returning the refusal
   * lets the sheet stay open holding what was typed. Nothing back means it
   * landed.
   */
  readonly onChange: (id: string, value: unknown) => Refusal | Promise<Refusal>;
}

/** ⚠️ Absent, not disabled — see the header. */
const visible = (def: SettingDef, held: ReadonlySet<string>): boolean =>
  !def.needs || held.has(def.needs);

/**
 * ⚠️ A SWITCH THAT WAS REFUSED HAS NOWHERE ELSE TO SAY SO. Every other kind
 * opens a sheet and the refusal renders in it; this one applied instantly, so
 * the sentence goes where instant failures go. Dropping it would leave a row
 * showing "On" over a server that said no.
 */
const flip = async (said: Refusal | Promise<Refusal>): Promise<void> => {
  const why = await said;
  /* ⚠️ THE TITLE, BECAUSE A TOAST IS ONE LINE. The rest of the refusal — the
     detail, the reference — has nowhere to go here, which is the honest cost of
     a control that applies without a sheet, and the reason only a switch does. */
  if (why) notice.fail(why.title);
};

export function Settings(props: SettingsProps) {
  const { book, areas, level, area, onArea, held } = props;

  /*
    ⚠️ AN AREA WHOSE EVERY ROW IS HIDDEN IS NOT A DESTINATION EITHER. `areasOn`
    answers what the LEVEL has; a reader without the permission behind those rows
    would still be offered the page and find it empty, which is the same failure
    as an undeclared area, one filter later.
  */
  const pages = areasOn(book, areas, level)
    .filter((a) => settingsIn(book, level, a.id).some((s) => visible(s, held)));

  if (!pages.length) return <Nothing icon={glyphOf("settings")} says="Nothing to change here" />;

  return (
    <Whichever
      items={pages}
      id={(a) => a.id}
      name={(a) => a.label}
      said={(a) => a.said}
      icon={(a) => glyphOf(a.icon)}
      chosen={area}
      onChoose={onArea}
      nothing={{ icon: glyphOf("settings"), says: "Nothing to change here" }}
      then={(a) => <Page {...props} area={a.id} label={a.label} said={a.said} />}
    />
  );
}

function Page({
  book, level, area, label, said, under, stored, held, includes, onChange,
}: SettingsProps & { readonly area: string; readonly label: string; readonly said: string }) {
  const rows = settingsIn(book, level, area).filter((s) => visible(s, held));

  return (
    /*
      ⚠️ ONE CARD, CARRYING BOTH SENTENCES: what this page is about, and whose
      settings these are. Those were a heading per group and a line repeated on
      every card — the product's name written four times on a workspace with one
      product.
    */
    <Group label={label} under={under ?? said}>
      {rows.map((def) => {
        const locked = !!def.entitlement && includes ? !includes(def.entitlement) : false;
        const shown = disclose(def, stored);
        const value = "value" in shown ? shown.value : undefined;
        const set = "set" in shown ? shown.set : undefined;
        /* ⚠️ Shown and locked, because it is something they can buy — so the
           reason rides on the row rather than as a chip under it. */
        const help = locked ? "Your plan does not include this" : def.field.help;

        /* ⚠️ A SWITCH STAYS INLINE, AND IT IS THE ONLY KIND THAT DOES — see
           `edit.tsx`. It is its own value, and undoing it is one press. */
        if (def.field.kind === "bool") {
          return (
            <ToggleRow
              key={def.id}
              label={def.field.label}
              under={help}
              value={value === true}
              isDisabled={locked || value === undefined}
              onChange={(next) => void flip(onChange(def.id, next))}
            />
          );
        }

        return (
          <EditRow
            key={def.id}
            spec={def.field}
            name={def.id}
            value={value}
            set={set}
            under={help}
            locked={locked}
            onSave={(next) => onChange(def.id, next)}
          />
        );
      })}
    </Group>
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
