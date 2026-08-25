/**
 * SWITCHES — our own flags, per product, one row each.
 *
 * ⚠️ A FLAG IS OUR DECISION AND AN ENTITLEMENT IS THEIR PURCHASE. A customer
 * told to upgrade for something we have turned off has been sold something that
 * does not exist, so an unset flag answers "no such thing" and never "pay us".
 *
 * ⚠️ MAINTENANCE USED TO BE ON THIS SCREEN AND IS ITS OWN NOW. It is not a
 * product decision about one feature — it is us withholding everything from
 * everybody, which is an incident rather than a Tuesday. Sharing a page put the
 * two at one weight and made the screen open with a paragraph explaining which
 * half you were looking at, which is the tell (DESIGN.md §7).
 *
 * ⚠️ AND A SWITCH IS NO LONGER A TOGGLE HERE, BECAUSE IT HAS THREE STATES. On for
 * everybody, off for everybody, and — the one a trial needs — following its own
 * declaration while named workspaces hold an exception. A toggle can say two of
 * those, so the third was unreachable and no customer could ever be given a
 * feature early. Each flag descends to its own page (DESIGN.md §3).
 */

import {
  Region,
  Group, NavRow, Screen, appFace, glyphOf, useDay,
} from "@engine/design";
import type { FlagBook, FlagDef } from "@engine/kernel";
import { instant, overdue } from "@engine/kernel";
import type { Where } from "../space/where.js";
import { useLoad } from "../centre/data.js";

interface FlagsAnswer {
  /** ⚠️ THE APP, NOT JUST ITS BOOK — see `op.flags`. A section headed by a key
      capitalised into a name is a name nobody declared. */
  readonly apps: readonly {
    readonly id: string; readonly name: string; readonly mark: string;
    readonly book: FlagBook;
  }[];
  readonly deployment: Readonly<Record<string, boolean>>;
  /** How many workspaces hold an exception — see `flagExceptions`. */
  readonly tried: Readonly<Record<string, { readonly on: number; readonly off: number }>>;
}

/** ⚠️ The verb agrees too — "11 workspaces differs" is a sentence nobody wrote. */
const SOME = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many} ${n === 1 ? "differs" : "differ"}`;

/**
 * ⚠️ ONE LINE, AND IT IS THE MOST ALARMING TRUE THING. A row carrying the stage,
 * the state and the exception count in three chips is three facts of which one
 * matters, and the reader has to work out which. Past its date beats an
 * exception beats the plain state, because that is the order somebody would want
 * to be told.
 */
export function saying(
  def: FlagDef,
  at: boolean | undefined,
  tried: { readonly on: number; readonly off: number } | undefined,
  late: boolean,
): string {
  if (late) return "Past its retirement date — this should be the product now";
  const state = at === true ? "On for everybody"
    : at === false ? "Off for everybody"
      : def.fallback ? "On unless a workspace says otherwise" : "Off unless a workspace says so";
  const some = (tried?.on ?? 0) + (tried?.off ?? 0);
  return some ? `${state} · ${SOME(some, "workspace", "workspaces")}` : state;
}

export function Switches({ onGo }: { readonly onGo: (to: Where) => void }) {
  /* ⚠️ THE OPERATOR'S OWN DAY, NOT UTC'S. A flag scheduled to end "today" is
     read against the day the person reading it is having. */
  const today = useDay(instant());
  const flags = useLoad<FlagsAnswer>("op.flags");

  return (
    /* ⚠️ `list` — every row leads somewhere and nothing is set from here. */
    <Screen shape="list" under="What is switched on, and for whom">
      <Region
        bones="rows"
        of={flags.of}
        again={flags.again}
        isNothing={(d) => d.apps.length === 0}
        nothing={{ icon: glyphOf("flag"), says: "No product here declares a flag" }}
        then={(data) => (
          /* ⚠️ NO `Stack` — see `Keys.tsx`. The screen's own rhythm is the DOM's,
             so a column here collapses every product into one block. */
          <>
            {data.apps.map((app) => {
              const late = new Set(overdue(app.book, today as never));
              return (
                <Group key={app.id} label={app.name} face={appFace(app.id, app.mark)}>
                  {Object.values(app.book).map((def) => (
                    <NavRow
                      key={def.id}
                      icon={glyphOf("flag")}
                      label={def.label}
                      under={saying(def, data.deployment[def.id], data.tried[def.id],
                        late.has(def.id))}
                      onOpen={() => onGo({ at: "switch", id: def.id })}
                    />
                  ))}
                </Group>
              );
            })}
          </>
        )}
      />
    </Screen>
  );
}
