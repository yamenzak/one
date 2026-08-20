/**
 * SHARDS — where the records actually are, how full each one is, and who is
 * moving between them.
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
 *
 * ⚠️ AND A MOVE IN FLIGHT IS ON THIS PAGE RATHER THAN THE INVENTORY'S. It was
 * filed under what the deployment stands on, which is true of it and is not what
 * it is: a move is the only thing that changes which bar a workspace counts
 * against, and it holds that workspace read-only while it runs. Read here it is
 * beside the capacity it is fixing; read there it was a fifth subject on a page
 * that already had four.
 */

import { ControlRow, Group, Meter, Screen, Stack, glyphOf, sentence } from "@engine/design";
import { SPACE, TYPE } from "@engine/design";
import { sayWhere, type Shard } from "@engine/kernel";
import { Chip } from "@heroui/react";
import { useLoad } from "../centre/data.js";

interface Move {
  readonly tenant_id: string;
  readonly from_shard: string;
  readonly to_shard: string;
  readonly state: string;
  readonly detail: string | null;
}

export function Shards() {
  const of = useLoad<{ items: readonly Shard[] }>("op.shards");
  const moves = useLoad<{ items: readonly Move[] }>("op.moves");

  return (
    /* ⚠️ No primary: a shard is declared by the deployment, never added here. */
    <Screen
      shape="list"
      under="Where records are kept, how full each one is, and what is moving"
      of={of.of}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      nothing={{
        icon: glyphOf("database"),
        says: "No shard is registered",
        under: "Placement has nowhere to put a workspace",
      }}
      then={(data) => {
        const moving = moves.of.status === "ready"
          ? moves.of.data.items.filter((m) => m.state !== "gone") : [];
        return (
          <Stack space="roomy">
            {/*
              ⚠️ WHAT IS HAPPENING NOW GOES ABOVE WHAT IS TRUE. A move holds a
              workspace read-only while it runs, so it is not something to learn
              about from its owner — and it is absent entirely the rest of the
              time, which is why it is a card rather than an empty section.
            */}
            {moving.length
              ? (
                <Group label="Moving" under="A workspace is read-only until its copy is verified">
                  {moving.map((m) => (
                    <ControlRow
                      key={`${m.tenant_id}-${m.to_shard}`}
                      label={`${m.from_shard} → ${m.to_shard}`}
                      under={m.detail ?? m.tenant_id}
                    >
                      <Chip color={m.state === "copying" ? "warning" : "default"} variant="soft">
                        <Chip.Label>{sentence(m.state)}</Chip.Label>
                      </Chip>
                    </ControlRow>
                  ))}
                </Group>
              )
              : null}

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
          </Stack>
        );
      }}
    />
  );
}
