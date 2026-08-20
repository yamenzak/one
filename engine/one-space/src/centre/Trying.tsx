/**
 * TRY THINGS EARLY — the workspace's own side of a flag.
 *
 * ⚠️ `setBy: "tenant"` WAS A WORD UNTIL THIS EXISTED. A flag can declare that the
 * workspace decides for itself; the kernel resolved it, the store held it, the
 * operator could see it — and there was nowhere for a workspace to say so. The
 * whole narrowing algebra had one caller, in a browser, drawing a switch on the
 * operator's screen.
 *
 * ⚠️ AND WHAT IS OFFERED IS WHAT THE CALLER MAY ACTUALLY SET. `flag.list` filters
 * to flags this door can decide and drops any the deployment has switched off —
 * `off` above is absorbing, so a control for one would change nothing, which is
 * worse than an absent control.
 */

import { Await, FlagConsole, Nothing, RowsWaiting, Screen, appFace, glyphOf, notice, useDay }
  from "@engine/design";
import type { FlagBook } from "@engine/kernel";
import { instant } from "@engine/kernel";
import { api } from "../api.js";
import { useLoad } from "./data.js";
import type { CentreView } from "./data.js";

interface Item {
  readonly id: string;
  readonly label: string;
  readonly why: string;
  readonly on: boolean;
  /** ⚠️ `null` is "following the deployment" — see `flag.list`. */
  readonly chosen: boolean | null;
}

export function Trying({ view, app }: {
  readonly view: CentreView;
  readonly app?: string;
}) {
  const today = useDay(instant());
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
    <Screen shape="settings" under="Features we are still trying, and whether you want them">
      <Await
        of={list.of}
        waiting={<RowsWaiting rows={2} lead={false} />}
        again={list.again}
        isNothing={(d) => d.items.length === 0}
        nothing={<Nothing icon={glyphOf("flag")} says="Nothing is being tried here yet" />}
        then={(data) => {
          /*
            ⚠️ THE BOOK IS REBUILT FROM WHAT THE SERVER SENT, not read from a
            manifest the page does not hold. The centre is one bundle for every
            product (see `centre-ops.ts`), so what travels is data — and the
            shared console draws from a book, which is what this makes.
          */
          const book: FlagBook = Object.fromEntries(data.items.map((f) => [f.id, {
            id: f.id, label: f.label, why: f.why,
            stage: "trying" as const, fallback: f.on, setBy: "tenant" as const,
          }]));
          return (
            <FlagConsole
              book={book}
              level="tenant"
              label={spec?.name}
              face={spec ? appFace(spec.id, spec.mark) : undefined}
              /* ⚠️ THE SERVER'S ANSWER IS THE VALUE, and the row shows it. Every
                 flag here is already resolved for this workspace, so the console
                 is told the deployment agrees and the workspace's own row is what
                 it draws — one answer, from the walk the gate made. */
              deployment={Object.fromEntries(data.items.map((f) => [f.id, true]))}
              tenant={Object.fromEntries(
                data.items.filter((f) => f.chosen !== null).map((f) => [f.id, f.chosen as boolean]),
              )}
              today={today}
              onSet={(id, on) => void set(id, on)}
            />
          );
        }}
      />
    </Screen>
  );
}
