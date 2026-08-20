/**
 * ONE FLAG — the three states, and who holds an exception.
 *
 * ⚠️ A SWITCH WITH THREE STATES IS NOT A TOGGLE, AND THE THIRD IS THE USEFUL
 * ONE. On for everybody, off for everybody, and following its own declaration
 * while named workspaces differ. The list screen can only ever show two of
 * those, so a trial — the entire point of `trying` — was unreachable from the
 * console: one press of "off" and the feature could never be given to anybody,
 * because the deployment's `off` is ABSORBING (see `resolve`).
 *
 * ⚠️ AND AN EXCEPTION IS UNDONE BY NAME, NOT BY ID. Somebody decided three weeks
 * ago that Eastgate should have this early; the screen that lets them change
 * their mind has to say "Eastgate".
 */

import { useState } from "react";
import { Button } from "@heroui/react";
import {
  Await, ControlRow, Group, Lookup, NavRow, NoteRow, Nothing, RowsWaiting, Screen,
  TYPE, glyphOf, notice, placeFace, useShown,
} from "@engine/design";
import type { FlagDef } from "@engine/kernel";
import { sayDate } from "@engine/kernel";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

interface Holder {
  readonly id: string; readonly name: string; readonly slug: string; readonly on: boolean;
}

interface Answer {
  readonly def: FlagDef;
  readonly app: { readonly id: string; readonly name: string; readonly mark: string };
  /** ⚠️ `null` IS A STATE, not a missing value — it is "follows its declaration". */
  readonly deployment: boolean | null;
  readonly holders: readonly Holder[];
}

interface Workspaces {
  readonly items: readonly { readonly id: string; readonly name: string }[];
}

/**
 * ⚠️ THE THIRD STATE IS NAMED AFTER WHAT IT DOES, NOT AFTER ITS STORAGE. "No
 * row" and "null" are true and useless; what an operator is choosing is whether
 * this decision is theirs or the declaration's, and only in the latter case can
 * a workspace differ. The copy says so on the row rather than in a paragraph
 * above it.
 */
const STATES: readonly {
  readonly id: "on" | "off" | "declared";
  readonly label: string;
  readonly said: (def: FlagDef) => string;
}[] = [
  { id: "on", label: "On for everybody", said: () => "Every workspace has it" },
  {
    id: "declared",
    label: "As declared",
    said: (def) => (def.fallback
      ? "On, except where a workspace turns it off"
      : "Off, except where a workspace is given it"),
  },
  {
    id: "off",
    label: "Off for everybody",
    /* ⚠️ SAYS WHAT IT TAKES AWAY. Off here outranks every workspace — that is
       what makes it a kill switch, and it is also why somebody reaching for it
       to run a trial gets the opposite of what they wanted. */
    said: () => "Nobody has it, and no workspace can be given it",
  },
];

const stateOf = (at: boolean | null) => (at === true ? "on" : at === false ? "off" : "declared");

export function Switch({ id }: { readonly id: string }) {
  const shown = useShown();
  const flag = useLoad<Answer>("op.flag", { id });
  const all = useLoad<Workspaces>("op.tenants");
  const [adding, setAdding] = useState<string | null>(null);

  const set = async (body: Record<string, unknown>, said: string) => {
    const out = await api.post("op.flag.set", { id, ...body });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(said);
    flag.again();
  };

  return (
    /* ⚠️ `settings` — every control saves the moment it is pressed, and the
       shape refuses a primary outright. */
    <Screen shape="settings">
      <Await
        of={flag.of}
        waiting={<RowsWaiting rows={3} />}
        again={flag.again}
        then={(data) => (
          <>
            <Group label={data.def.label} under={data.def.why}>
              {STATES.map((s) => (
                <ControlRow key={s.id} label={s.label} under={s.said(data.def)}>
                  {s.id === stateOf(data.deployment)
                    ? <span className={TYPE.note}>In force</span>
                    : (
                      <Button
                        /* ⚠️ Taking it from everybody is the one that gets the red. */
                        variant={s.id === "off" ? "danger-soft" : "secondary"}
                        onPress={() => void set(
                          { on: s.id === "declared" ? null : s.id === "on" },
                          s.id === "declared"
                            ? "Back to what the product declares."
                            : s.id === "on" ? "On for every workspace." : "Off everywhere.",
                        )}
                      >
                        Switch
                      </Button>
                    )}
                </ControlRow>
              ))}
              {/* ⚠️ THE RETIREMENT IS SAID BEFORE IT PASSES, not only after. A
                  flag due to go in three weeks read exactly like one with no end
                  at all, and the whole reason a `trying` flag carries a date is
                  that somebody is supposed to see it coming. */}
              {data.def.retire
                ? (
                  <NoteRow>
                    {`Being tried in ${data.app.name} until ${sayDate(shown, data.def.retire, "long")}. `}
                    After that it should be the product, and this switch should go.
                  </NoteRow>
                )
                : null}
            </Group>

            {/*
              ⚠️ THE EXCEPTIONS ARE A LIST OF WORKSPACES, AND ONLY REACHABLE WHILE
              THE DEPLOYMENT IS NOT DECIDING. With the switch on or off for
              everybody, a workspace row would be a control that changes nothing:
              `off` outranks it outright, and `on` is already what it would give.
              A control that cannot do anything is worse than an absent one.
            */}
            <Group
              label="Workspaces that differ"
              under={data.deployment === null
                ? "Give it to one workspace early, or hold one back"
                : "Only while this follows its declaration — the switch above outranks these"}
            >
              {data.holders.length === 0
                ? (
                  <Nothing
                    icon={glyphOf("workspace")}
                    says="Every workspace follows the switch above"
                  />
                )
                : data.holders.map((h) => (
                  <ControlRow
                    key={h.id}
                    face={placeFace(h.slug)}
                    label={h.name}
                    under={h.on ? "Given it early" : "Held back"}
                  >
                    <Button
                      variant="secondary"
                      onPress={() => void set(
                        { on: null, tenant: h.id },
                        `${h.name} follows the switch again.`,
                      )}
                    >
                      Clear
                    </Button>
                  </ControlRow>
                ))}

              {/* ⚠️ ONE CONTROL, AND IT PICKS THE WORKSPACE RATHER THAN TYPING AN
                  ID. There are two hundred of them at most, so a lookup is the
                  whole answer and a search endpoint would be a round trip in
                  front of a question already answered. */}
              <Await
                of={all.of}
                waiting={<RowsWaiting rows={1} lead={false} />}
                again={all.again}
                then={(list) => (
                  <ControlRow label="Add a workspace" wide>
                    <Lookup
                      label="Workspace"
                      value={adding}
                      onChange={setAdding}
                      placeholder="Type to search"
                      options={list.items
                        .filter((t) => !data.holders.some((h) => h.id === t.id))
                        .map((t) => ({ id: t.id, label: t.name }))}
                    />
                  </ControlRow>
                )}
              />
              {adding
                ? (
                  <NavRow
                    icon={glyphOf("check")}
                    label={data.def.fallback ? "Hold this workspace back" : "Give it to this workspace"}
                    under="Applies immediately"
                    onOpen={() => {
                      const at = adding;
                      setAdding(null);
                      void set({ on: !data.def.fallback, tenant: at }, "Saved.");
                    }}
                  />
                )
                : null}
            </Group>
          </>
        )}
      />
    </Screen>
  );
}
