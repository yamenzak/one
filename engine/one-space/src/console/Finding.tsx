/**
 * FINDING THINGS — what is indexed, what is waiting, and what the index refused.
 *
 * ⚠️ THE REFUSALS ARE WHY THIS SCREEN EXISTS. Everything else here is a number
 * that goes up on its own; a refused item is a record somebody saved that will
 * never be findable, and a refusal is terminal on purpose — so without a screen
 * naming them they would sit there for ever while the pending count looked
 * healthy and search quietly had a hole in it.
 *
 * ⚠️ AND IT SAYS WHEN NOTHING IS INDEXING AT ALL. Zero indexed on a deployment
 * with no account token is not an empty index, it is an index that cannot be
 * written to — and drawing those two the same way is a green light wired to
 * nothing.
 *
 * ⚠️ IT NAMES COLLECTIONS AND NEVER RECORDS. This reads across every workspace
 * on the deployment; what an operator needs is which product refused and why,
 * and anything more would make the console a window onto customers' own words.
 */

import {
  Grid, Group, NavRow, Screen, Stack, Stat, glyphOf, useShown,
} from "@engine/design";
import { sayMoment, type Instant } from "@engine/kernel";
import { useLoad } from "../centre/data.js";

interface Refused {
  readonly collection: string;
  readonly app: string;
  readonly why: string;
  readonly at: string;
}

interface Answer {
  readonly wired: boolean;
  readonly shards: number;
  readonly indexed: number;
  readonly pending: number;
  readonly failed: number;
  readonly gone: number;
  readonly refused: readonly Refused[];
  readonly apps: readonly {
    readonly id: string;
    readonly instance: string | null;
    readonly collections: readonly string[];
  }[];
}

export function Finding() {
  const of = useLoad<Answer>("op.search");
  const shown = useShown();

  return (
    <Screen shape="list" under="What is findable, and what the index would not take"
      of={of.of} again={of.again}
      then={(at) => (
        <>
          {/*
            ⚠️ THE REFUSALS FIRST, BECAUSE THEY OUTRANK EVERY COUNT UNDER THEM. A
            refused item is somebody's record that search will never return, and
            it does not clear itself.
          */}
          {at.failed ? (
            <Group label="Would not index"
              under="These records are saved and will not be found until this is cleared">
              {at.refused.map((r) => (
                <NavRow
                  key={`${r.app}:${r.collection}:${r.at}`}
                  icon={glyphOf("alert")}
                  label={`${r.app} · ${r.collection}`}
                  under={<span data-ink="danger">{r.why} · {sayMoment(shown, r.at as Instant)}</span>}
                />
              ))}
            </Group>
          ) : null}

          {/*
            ⚠️ AND THE STATE OF THE LANE ITSELF, WHICH IS NOT A COUNT. With no
            account token nothing can create an instance or push an item, so
            every number below is a number about work that is not happening.
          */}
          {at.wired ? null : (
            <Group label="Nothing is indexing">
              <NavRow
                icon={glyphOf("database")}
                label="No account token"
                under={(
                  <span data-ink="warning">
                    Records are being marked as they change and nothing is carrying them.
                    Set the Cloudflare token, and the next pass sends everything waiting.
                  </span>
                )}
              />
            </Group>
          )}

          {/*
            ⚠️ FOUR FIGURES RATHER THAN A SENTENCE, because they are read
            together: "findable" alone says nothing without "waiting" beside it.
            `Grid` fits as many across as the width allows, so the same block is
            one column on a phone with no breakpoint written anywhere.
          */}
          <Group label="What is in the index">
            <Grid min="8rem">
              <Stat label="Findable" value={at.indexed} />
              {/* ⚠️ WAITING IS ORDINARY, NOT A FAULT. The job runs every quarter
                  hour, so a number here is the system working. */}
              <Stat label="Waiting" value={at.pending} />
              <Stat label="To remove" value={at.gone} />
              <Stat label="Refused" value={at.failed} />
            </Grid>
          </Group>

          <Group label="What each product indexes"
            under="Named on the collection, and nothing else is sent">
            {at.apps.length ? at.apps.map((a) => (
              <NavRow
                key={a.id}
                icon={glyphOf("bank")}
                label={a.id}
                under={a.collections.join(", ")}
              />
            )) : (
              <Stack space="tight">
                <small data-ink="muted">
                  No collection here says it is searchable, so there is nothing to index.
                </small>
              </Stack>
            )}
          </Group>
        </>
      )}
    />
  );
}
