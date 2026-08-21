/**
 * WHICH PRODUCTS THIS WORKSPACE HAS, AND WHAT ELSE IT COULD.
 *
 * ⚠️ THE PAIR IS THE SCREEN. A list of what is on is a status; the same list
 * BESIDE what is available is a decision somebody can make. Answering only the
 * first is why the way to add a product used to be to ask us — a workspace was
 * founded with whatever the deployment happened to hand it, and only an operator
 * could change it afterwards, in a console the customer cannot open.
 *
 * ⚠️ OFF IS NOT GONE, AND THE COPY SAYS SO EVERY TIME. What ends is
 * reachability: the records stay, the schema stays applied, and switching it
 * back on returns everything. A toggle that erased would be the most destructive
 * control in the product, reachable by a mis-tap, with no confirmation between.
 *
 * ⚠️ AND THE LAST ONE CANNOT BE SWITCHED OFF. A workspace with nothing on has no
 * screens — including this one — so it is a door that locks from the inside. The
 * server refuses it; here the switch is simply disabled and says why, because a
 * control that fails when pressed is worse than one that explains itself first.
 */

import {
  Await, Group, NoteRow, Nothing, RowsWaiting, Screen, ToggleRow,
  appFace, glyphOf, notice,
} from "@engine/design";
import { api } from "../api.js";
import { useLoad } from "./data.js";
import type { CentreView } from "./data.js";

interface Item {
  readonly id: string;
  readonly name: string;
  readonly mark: string;
  /** Whether this workspace has it switched on. */
  readonly on: boolean;
  /** ⚠️ Whether it is the ONLY one on — see the header. */
  readonly last: boolean;
}

export function Apps({ view }: { readonly view: CentreView }) {
  const list = useLoad<{ items: readonly Item[] }>("app.list");

  const set = async (id: string, on: boolean, name: string) => {
    const out = await api.post(on ? "app.add" : "app.remove", { id });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    /* ⚠️ THE CONSEQUENCE, NOT THE VERB. "Saved" over a switch says nothing the
       switch does not; what somebody needs to know is that everybody here just
       gained or lost a product, and that losing it kept the records. */
    notice.ok(on
      ? `${name} is on for everybody here.`
      : `${name} is off. Its records are kept.`);
    list.again();
  };

  return (
    <Screen
      shape="list"
      under="What this workspace uses — add or remove them at any time"
      /* ⚠️ THE SAME KEY THE OPERATION ASKS FOR. A screen that drew its controls
         for everybody and let the route refuse is a screen offering something it
         cannot deliver — see D15. */
      refused={view.you.platform.includes("tenant:manage")
        ? undefined
        : { says: "Only an owner or a manager may change this" }}
    >
      <Await
        of={list.of}
        waiting={<RowsWaiting rows={2} />}
        again={list.again}
        isNothing={(d) => d.items.length === 0}
        /* ⚠️ A DEPLOYMENT MAY OFFER NOTHING, and that is a sentence rather than a
           failure — a self-host with one product built in has nothing here to
           choose between. */
        nothing={<Nothing icon={glyphOf("apps")} says="This deployment offers nothing to add" />}
        then={(data) => (
          <Group>
            {data.items.map((p) => (
              <ToggleRow
                key={p.id}
                /* ⚠️ THE PRODUCT'S OWN FACE. A list under identical glyphs is a
                   list where the label is the only thing telling them apart. */
                face={appFace(p.id, p.mark)}
                label={p.name}
                under={p.last
                  ? "The only one switched on"
                  : p.on ? "On for everybody here" : "Not switched on"}
                value={p.on}
                isDisabled={p.last}
                onChange={(next) => void set(p.id, next, p.name)}
              />
            ))}
            {/* ⚠️ SAID ONCE, AT THE BOTTOM, RATHER THAN UNDER EVERY ROW. It is
                true of every switch here and a row that repeats it is a row
                nobody reads by the third one. */}
            <NoteRow>
              Switching a product off hides it. Nothing is deleted, and switching
              it back on returns everything.
            </NoteRow>
          </Group>
        )}
      />
    </Screen>
  );
}
