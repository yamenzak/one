/**
 * WHO HAS THIS — one feature, and this workspace's own people.
 *
 * ⚠️ THE SECOND HALF OF HOW A FEATURE SHIPS. We release it to a workspace; the
 * workspace hands it to some of its own staff first. Both halves are decisions
 * somebody makes and later reverses, and the reversal is what needs a name on
 * the screen — three weeks on, an account id says nothing to the person who made
 * the call.
 *
 * ⚠️ AND A ROW SAYS WHICH DIRECTION THE EXCEPTION GOES. "Given it early" and
 * "held back" are opposite decisions and they look identical as a switch that is
 * on or off, so the row says which relative to what everybody else here has.
 */

import { Await, Group, NoteRow, Nothing, RowsWaiting, Screen, ToggleRow, glyphOf, notice, whoFace }
  from "@engine/design";
import { api } from "../api.js";
import { useLoad } from "./data.js";
import type { CentreView } from "./data.js";

interface Person {
  readonly accountId: string;
  readonly email: string;
  /** ⚠️ `null` is "the same as everybody else here" — see `flag.people`. */
  readonly chosen: boolean | null;
  readonly on: boolean;
}

interface Answer {
  /** ⚠️ The feature names itself — see `flag.people`. */
  readonly label: string;
  readonly why: string;
  /** What this workspace as a whole has, so a row can say which way it differs. */
  readonly workspace: boolean;
  readonly items: readonly Person[];
}

export function Tried({ view, id }: {
  readonly view: CentreView;
  readonly id: string;
}) {
  /* ⚠️ ONE PRODUCT, AND IT IS THE ONE THE WORKSPACE IS IN. A flag id is unique
     within a manifest, so the app is only needed to pick which manifest — and a
     workspace with one product has already answered it. */
  const only = view.apps[0]?.id;
  const who = useLoad<Answer>("flag.people", { id, ...(only ? { app: only } : {}) });

  const set = async (person: string, on: boolean | null, said: string) => {
    const out = await api.post("flag.person", { id, person, on, ...(only ? { app: only } : {}) });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(said);
    who.again();
  };

  return (
    <Screen shape="settings">
      <Await
        of={who.of}
        waiting={<RowsWaiting rows={3} />}
        again={who.again}
        isNothing={(d) => d.items.length === 0}
        nothing={<Nothing icon={glyphOf("people")} says="Nobody here has an account yet" />}
        then={(data) => (
          <Group
            label={data.label}
            under={data.workspace
              ? "Everybody here has it unless you hold them back"
              : "Nobody here has it unless you give it to them"}
          >
            {data.items.map((p) => (
              <ToggleRow
                key={p.accountId}
                face={whoFace(p.accountId)}
                label={p.email}
                /* ⚠️ SAYS WHICH WAY IT DIFFERS, not what the switch is. A row
                   reading "off" beside a workspace where nobody has it is true
                   and says nothing; "held back" and "given it early" are the two
                   decisions somebody actually made. */
                under={p.chosen === null
                  ? "Same as everybody here"
                  : p.chosen
                    ? (data.workspace ? "Same as everybody here" : "Given it early")
                    : (data.workspace ? "Held back" : "Same as everybody here")}
                value={p.on}
                onChange={(next) => void set(
                  p.accountId,
                  /* ⚠️ BACK TO `null` RATHER THAN TO THE OPPOSITE. Switching
                     somebody to what the workspace already gives them is not a
                     decision about that person — storing one would leave a
                     permanent exception that agrees with the default today and
                     silently disagrees the day the workspace switch moves. */
                  next === data.workspace ? null : next,
                  next ? `${p.email} has it.` : `${p.email} does not.`,
                )}
              />
            ))}
            <NoteRow>
              Somebody with no row follows the workspace, so they get it when everybody does.
            </NoteRow>
          </Group>
        )}
      />
    </Screen>
  );
}
