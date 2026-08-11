/**
 * CHOOSE — one of a few, in a sheet.
 *
 * ⚠️ IT IS A SHEET RATHER THAN A SUB-SCREEN, AND THE LINE IS THE NUMBER OF
 * OPTIONS. Three themes or two languages behind a whole screen is a navigation
 * somebody has to come back from for a decision that took no thought; twenty
 * languages, searchable, is a screen. Below about eight it is a sheet.
 *
 * ⚠️ THE CURRENT ONE IS TICKED, NOT SELECTED-LOOKING. A row with a different
 * ground reads as focus or as hover; a tick is the only mark that says "this is
 * what it is now" without also implying something is about to happen to it.
 *
 * ⚠️ AND CHOOSING CLOSES IT. There is no Save: the choice IS the action, exactly
 * as it is for a switch, so a confirm step would be asking somebody to agree with
 * themselves. What that costs is a way to fail, which the caller reports the same
 * way the switch does — by handing back a `Problem` and being put back.
 */

import type { ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Tick } from "./icon.js";
import { Card, Item } from "./list.js";
import { Sheet } from "./sheet.js";

export interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
  /** One line, only where the label leaves a real question. */
  readonly detail?: string;
}

export interface ChooseProps<T extends string> {
  readonly open: boolean;
  readonly title: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onPick: (next: T) => Promise<Problem | null> | void;
  readonly onClose: () => void;
}

export function Choose<T extends string>({ open, title, options, value, onPick, onClose }: ChooseProps<T>): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} dismissible label={title}>
      <div className="sheet-body">
        <header className="sheet-top">
          <h2 className="sheet-title">{title}</h2>
        </header>
        {/* ⚠️ THE SAME ROW AS EVERY OTHER LIST, not a copy of its markup. An
            option that drifted from `Item` — a title that stopped truncating, a
            detail that stopped wrapping — would look wrong only in a sheet, which
            is the one place nobody has a row beside it to compare against. */}
        <Card>
          {options.map((o) => (
            <Item
              key={o.value}
              title={o.label}
              detail={o.detail}
              current={o.value === value}
              sign={o.value === value ? <Tick className="chosen" size={20} label="Current" /> : undefined}
              onGo={() => { void onPick(o.value); onClose(); }}
            />
          ))}
        </Card>
      </div>
    </Sheet>
  );
}
