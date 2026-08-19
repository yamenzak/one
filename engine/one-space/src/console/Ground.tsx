/**
 * SHARDS — where the records actually are, and how much room is left.
 *
 * ⚠️ A CEILING IS A PLACEMENT HINT, NEVER A WALL. Placement prefers a shard
 * under its ceiling and falls back rather than refusing — a workspace that
 * cannot be created because a number in a table was reached is an outage
 * caused by bookkeeping. So the question is "how full", which is a ratio.
 *
 * ⚠️ AND A RATIO AGAINST A LIMIT IS A `Meter`, NOT TWO NUMBERS IN A SENTENCE.
 * "3 of 500 workspaces" makes somebody do the arithmetic to find out whether
 * that is fine; a bar answers it before they have read the words (DESIGN.md §4).
 *
 * ⚠️ ONE CARD, ONE BAR PER SHARD — NOT A BOARD. A `board` puts two tiles across
 * a phone, so each shard got 190 pixels for a heading, a place, a label and a
 * value: measured, "62 of 500" wrapped onto three lines and the two tiles were
 * different heights. Bars stacked in one card are ALSO comparable — better,
 * because they start at the same x and are the same width — and the whole
 * argument for the board was comparison.
 */

import { Group, Meter, Screen, glyphOf, sentence } from "@engine/design";
import { SPACE, TYPE } from "@engine/design";
import { sayWhere, type Shard } from "@engine/kernel";
import { useLoad } from "../centre/data.js";

export function Ground() {
  const of = useLoad<{ items: readonly Shard[] }>("op.shards");

  return (
    /* ⚠️ No primary: a shard is declared by the deployment, never added here. */
    <Screen
      shape="list"
      under="Where records are kept, and how full each one is"
      of={of.of}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      nothing={{
        icon: glyphOf("database"),
        says: "No shard is registered",
        under: "Placement has nowhere to put a workspace",
      }}
      then={(data) => (
        <Group>
          {data.items.map((s) => (
            /* ⚠️ NO PADDING OF ITS OWN. This was a `div` with `px-4 py-3` inside
               a card that already insets both — 32 pixels on the left where
               every other row in the product sits at 16, and nothing saying
               which of the two was the wrong one. A card gives a non-row child
               exactly what a row has (`CARD_OTHERS`). */
            <div key={s.id} className={`flex flex-col ${SPACE.tight}`}>
              <Meter
                /* ⚠️ THE SHARD IS THE BAR'S LABEL. It was a `Group` heading with
                   a bar under it saying "Workspaces" — two labels for one
                   measure, on a screen where every measure is workspaces. */
                label={s.id}
                value={s.tenants}
                limit={s.ceiling}
                suffix={s.tenants >= s.ceiling ? "past its ceiling" : ""}
              />
              {/* ⚠️ WHOSE SHARD IT IS BELONGS BESIDE THE BAR. A dedicated one
                  reads as an ALARMINGLY EMPTY one otherwise — a meter at 1 of
                  500 with nothing saying it is that way on purpose, which is a
                  capacity problem an operator would then go and "fix" by
                  placing somebody on it. */}
              {/* ⚠️ THE PLACE IS A PLACE, NOT THE KEY. `where` is `eu` | `global`
                  — values the placement branches on, and printed raw a shard
                  read "eu · Hello". See `sayWhere` in the kernel. */}
              <span className={TYPE.note}>
                {s.dedicatedTo
                  ? `In ${sayWhere(s.where)} · kept for one workspace`
                  : `In ${sayWhere(s.where)} · ${s.apps.map(sentence).join(", ") || "no schemas applied"}`}
              </span>
            </div>
          ))}
        </Group>
      )}
    />
  );
}
