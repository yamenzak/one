/**
 * GROUND — where the records actually are, and how much room is left.
 *
 * ⚠️ A CEILING IS A PLACEMENT HINT, NEVER A WALL. Placement prefers a shard
 * under its ceiling and falls back rather than refusing — a workspace that
 * cannot be created because a number in a table was reached is an outage
 * caused by bookkeeping. The bar says how full, and past it says so plainly.
 */

import { Card, Chip } from "@heroui/react";
import { Await, Figure, Grid, RowsWaiting, Section, Stack } from "@quad/web";
import type { Shard } from "@quad/kernel";
import { useLoad } from "../centre/data.js";

export function Ground() {
  const of = useLoad<{ items: readonly Shard[] }>("op.shards");

  return (
    <Section label="Ground" under="Where records live, per region, and the room left">
      <Await
        of={of.of}
        waiting={<RowsWaiting rows={2} />}
        again={of.again}
        isNothing={(d) => d.items.length === 0}
        then={(data) => (
          <Grid min="15rem">
            {data.items.map((s) => (
              <Card key={s.id}>
                <Card.Header>
                  <Card.Title>{s.id}</Card.Title>
                  <Card.Description>{s.where} · {s.apps.join(", ") || "no schemas applied"}</Card.Description>
                </Card.Header>
                <Card.Content>
                  <Stack space="tight">
                    <Figure value={s.tenants.toLocaleString("en")} of={`of ${s.ceiling.toLocaleString("en")} workspaces`} />
                    {s.tenants >= s.ceiling
                      ? (
                        <Chip color="warning" variant="soft">
                          <Chip.Label>Past its ceiling — placement still works, it just prefers elsewhere</Chip.Label>
                        </Chip>
                      )
                      : null}
                  </Stack>
                </Card.Content>
              </Card>
            ))}
          </Grid>
        )}
      />
    </Section>
  );
}
