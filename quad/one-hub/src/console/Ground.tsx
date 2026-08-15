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

import { Await, Group, Meter, Nothing, RowsWaiting, Stack, sentence } from "@quad/web";
import type { Shard } from "@quad/kernel";
import { useLoad } from "../centre/data.js";

export function Ground() {
  const of = useLoad<{ items: readonly Shard[] }>("op.shards");

  return (
    /* ⚠️ The crown already says "Ground" and what it is — see `Hub.tsx`. */
    <Await
      of={of.of}
      waiting={<RowsWaiting rows={2} />}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      nothing={<Nothing says="No shard is registered" under="Placement has nowhere to put a workspace" />}
      then={(data) => (
        <Stack space="roomy">
          {data.items.map((s) => (
            /* ⚠️ THE SHARD'S NAME IS THE GROUP'S, AND WHERE IT IS IS THE ONE
               FACT THAT IS NOT THE BAR. Which schemas are applied is a list, and
               a list of two words belongs under the name rather than in a
               sentence of its own. */
            <Group key={s.id} label={s.id} under={`${s.where} · ${s.apps.map(sentence).join(", ") || "no schemas applied"}`}>
              <div className="px-4 py-3">
                <Meter
                  label="Workspaces"
                  value={s.tenants}
                  limit={s.ceiling}
                  suffix={s.tenants >= s.ceiling ? "past its ceiling — placement prefers elsewhere" : ""}
                />
              </div>
            </Group>
          ))}
        </Stack>
      )}
    />
  );
}
