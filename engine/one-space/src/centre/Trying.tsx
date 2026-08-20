/**
 * TRY THINGS EARLY — what this workspace has been given, and who in it has it.
 *
 * ⚠️ THIS IS THE ORDINARY WAY A FEATURE SHIPS, AND THE SECOND HALF WAS MISSING.
 * We release to a WORKSPACE; the workspace decides which of its own people get
 * it. The platform had the first half — an operator could give a feature to one
 * customer — and nowhere for the customer to hand it to four of their staff.
 *
 * ⚠️ AND WHAT IS LISTED IS WIDER THAN WHAT IS TOGGLEABLE. A flag only WE may
 * switch, released to this workspace, is still one the workspace can share among
 * its people — so the list carries it and `mayChoose` decides whether the
 * workspace switch appears. Filtering on "can you toggle it" hid exactly the
 * flags a customer was given.
 */

import {
  Await, Group, NavRow, Nothing, RowsWaiting, Screen, ToggleRow,
  appFace, glyphOf, notice,
} from "@engine/design";
import type { Where } from "../space/where.js";
import { api } from "../api.js";
import { useLoad } from "./data.js";
import type { CentreView } from "./data.js";

interface Item {
  readonly id: string;
  readonly label: string;
  readonly why: string;
  /** What this workspace as a whole has. */
  readonly on: boolean;
  /** ⚠️ `null` is "following the deployment" — see `flag.list`. */
  readonly chosen: boolean | null;
  /** Whether the workspace may move the workspace switch at all. */
  readonly mayChoose: boolean;
  /** How many of its own people it has decided for. */
  readonly people: number;
}

/** ⚠️ The verb agrees too — "4 people differs" is a sentence nobody wrote. */
const SOME = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many} ${n === 1 ? "differs" : "differ"}`;

export function Trying({ view, app, slug, onGo }: {
  readonly view: CentreView;
  readonly app?: string;
  readonly slug: string;
  readonly onGo: (to: Where) => void;
}) {
  const only = app ?? view.apps[0]?.id;
  const spec = view.apps.find((a) => a.id === only);
  const list = useLoad<{ items: readonly Item[] }>("flag.list", only ? { app: only } : {});

  const set = async (id: string, on: boolean) => {
    const out = await api.post("flag.set", { id, on, ...(only ? { app: only } : {}) });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(on ? "On for this workspace." : "Off for this workspace.");
    list.again();
  };

  return (
    <Screen shape="list" under="Features we are still trying, and who here has them">
      <Await
        of={list.of}
        waiting={<RowsWaiting rows={2} />}
        again={list.again}
        isNothing={(d) => d.items.length === 0}
        nothing={<Nothing icon={glyphOf("flag")} says="Nothing is being tried here yet" />}
        then={(data) => (
          <Group label={spec?.name} face={spec ? appFace(spec.id, spec.mark) : undefined}>
            {data.items.map((f) => (
              /*
                ⚠️ TWO SHAPES, AND WHICH ONE IS A FACT ABOUT THE FLAG. A workspace
                that may move the switch gets a switch; one that may only share
                what it was given gets a row that leads to its people. Drawing a
                disabled toggle for the second is a control that says "you cannot"
                where the truthful answer is "not this — that".
              */
              f.mayChoose
                ? (
                  <ToggleRow
                    key={f.id}
                    label={f.label}
                    under={f.people
                      ? `${f.why} · ${SOME(f.people, "person", "people")}`
                      : f.why}
                    value={f.on}
                    onChange={(next) => void set(f.id, next)}
                  />
                )
                : (
                  <NavRow
                    key={f.id}
                    icon={glyphOf("flag")}
                    label={f.label}
                    under={f.on
                      ? (f.people ? SOME(f.people, "person", "people") : "Everybody here")
                      : "Not yet"}
                    onOpen={() => onGo({ at: "tried", slug, id: f.id })}
                  />
                )
            ))}
            {/* ⚠️ THE WAY IN TO THE PEOPLE, for the flags whose row is a switch.
                A toggle cannot also lead somewhere, so the descent is its own
                row rather than a chevron nobody can press. */}
            {data.items.filter((f) => f.mayChoose && f.on).map((f) => (
              <NavRow
                key={`who-${f.id}`}
                icon={glyphOf("people")}
                label={`Who has ${f.label.toLowerCase()}`}
                under={f.people
                  ? `${SOME(f.people, "person", "people")} from the rest`
                  : "Everybody here"}
                onOpen={() => onGo({ at: "tried", slug, id: f.id })}
              />
            ))}
          </Group>
        )}
      />
    </Screen>
  );
}
