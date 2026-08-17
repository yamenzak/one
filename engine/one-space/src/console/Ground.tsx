/**
 * GROUND — where the records actually are, and how much room is left.
 *
 * ⚠️ A CEILING IS A PLACEMENT HINT, NEVER A WALL. Placement prefers a shard
 * under its ceiling and falls back rather than refusing — a workspace that
 * cannot be created because a number in a table was reached is an outage
 * caused by bookkeeping. So the question is "how full", which is a ratio.
 *
 * ⚠️ AND A RATIO AGAINST A LIMIT IS A `Meter`, NOT TWO NUMBERS IN A SENTENCE.
 * "3 of 500 workspaces" makes somebody do the arithmetic to find out whether
 * that is fine; a bar answers it before they have read the words (DESIGN.md §4).
 * This screen showed the sum in text and then a warning chip once it was already
 * too late — which is the whole failure the chart vocabulary exists to prevent.
 */

import { Board, Group, Meter, Screen, Tile, sentence } from "@engine/design";
import type { Shard } from "@engine/kernel";
import { useLoad } from "../centre/data.js";

export function Ground() {
  const of = useLoad<{ items: readonly Shard[] }>("op.shards");

  return (
    /*
      ⚠️ `board` — THE ONE SCREEN IN THE HUB WHOSE ITEMS ARE MEASURES RATHER THAN
      DESTINATIONS. A shard is a name, a place and a fullness; three of those
      down a column on a wide screen is three bars using a tenth of the room they
      exist to be compared in. Side by side they are one glance.

      ⚠️ AND THE FIRST IS `wide`, WHICH IS WHAT MAKES IT A BOARD RATHER THAN A
      GRID. A wall of identical tiles says every one matters equally, which is
      almost never true; the shard placement prefers is the one an operator
      looks at first, and a grid has exactly one channel for saying so.

      ⚠️ No primary: a shard is declared by the deployment, never added here.
    */
    <Screen
      shape="board"
      of={of.of}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      nothing={{ says: "No shard is registered", under: "Placement has nowhere to put a workspace" }}
      then={(data) => (
        <Board>
          {data.items.map((s, i) => (
            <Tile key={s.id} wide={i === 0}>
              {/* ⚠️ THE SHARD'S NAME IS THE GROUP'S, AND WHERE IT IS IS THE ONE
                  FACT THAT IS NOT THE BAR. Which schemas are applied is a list,
                  and a list of two words belongs under the name rather than in
                  a sentence of its own. */}
              {/* ⚠️ WHOSE SHARD IT IS BELONGS IN THE HEADING, NOT IN THE BAR. A
                  dedicated shard reads as an ALARMINGLY EMPTY one otherwise — a
                  meter at 1 of 500 with nothing saying it is that way on
                  purpose, which is a capacity problem an operator would then go
                  and "fix" by placing somebody on it. */}
              <Group
                label={s.id}
                under={s.dedicatedTo
                  ? `${s.where} · kept for one workspace`
                  : `${s.where} · ${s.apps.map(sentence).join(", ") || "no schemas applied"}`}
              >
                <div className="px-4 py-3">
                  <Meter
                    label="Workspaces"
                    value={s.tenants}
                    limit={s.ceiling}
                    suffix={s.tenants >= s.ceiling ? "past its ceiling" : ""}
                  />
                </div>
              </Group>
            </Tile>
          ))}
        </Board>
      )}
    />
  );
}
