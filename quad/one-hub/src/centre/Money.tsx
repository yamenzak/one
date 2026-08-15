/**
 * MONEY — two directions, one area, clearly separated.
 *
 * ⚠️ WHAT THE WORKSPACE PAYS US IS ONE BILL, one line per product — the promise
 * the whole inversion makes, drawn from the same rows a charge would collect.
 * What its customers pay THE WORKSPACE lives with the packages in People; here
 * it is the shelf side: which plan each product is on, and what a step up
 * would include.
 */

import { Card, Chip } from "@heroui/react";
import { Await, Bill, Figure, FigureWaiting, Grid, Section, Shelf, Stack, notice } from "@quad/web";
import { useLoad, type CentreView, type MoneyView } from "./data.js";

export function Money({ view }: { readonly view: CentreView }) {
  void view;
  const money = useLoad<MoneyView>("money.view");

  return (
    <Await
      of={money.of}
      waiting={<FigureWaiting count={2} />}
      again={money.again}
      then={(data) => (
        <Stack space="roomy">
          {/* ⚠️ THE TWO FIGURES SIT SIDE BY SIDE, BECAUSE THEY ARE ONE ANSWER.
              What this costs and what is left to spend are the two numbers
              somebody opens this screen for; stacked, each took a third of a
              phone and the second was below the fold on a desktop. The crown
              names the screen — see hub/Hub.tsx. */}
          <Grid min="18rem">
            <Bill
              lines={data.bill.lines}
              total={data.bill.total}
              currency={data.bill.currency}
              appName={(id) => data.apps.find((a) => a.id === id)?.name ?? id}
            />

            <Card>
              <Card.Header>
                <Card.Title>Credits</Card.Title>
                <Card.Description>What the generating features spend.</Card.Description>
              </Card.Header>
              <Card.Content>
                <Figure value={data.balance.spendable.toLocaleString("en")} of="left to spend" />
              </Card.Content>
            </Card>
          </Grid>

          {/* ⚠️ NO GLYPH CHARACTER IN THE LABEL. `app.mark` is a text character
              from a manifest, so it renders at whatever weight and baseline the
              reader's font gives it, beside a name that already says which
              product this is. */}
          {data.apps.map((app) => (
            <Section key={app.id} label={app.name}
              under={app.planId ? undefined : "This product has no plan yet."}>
              <Stack space="snug">
                {app.status === "past_due"
                  ? (
                    <Chip color="warning" variant="soft">
                      <Chip.Label>The last payment did not go through — the plan holds while it retries.</Chip.Label>
                    </Chip>
                  )
                  : null}
                <Shelf
                  plans={app.plans}
                  entitlements={app.entitlements}
                  current={app.planId ?? undefined}
                  /* ⚠️ Honest until the payment rail lands: choosing is recorded
                     nowhere, so the screen says so instead of pretending. */
                  onChoose={() => notice.warn("Changing plans arrives with the payment rail.")}
                />
              </Stack>
            </Section>
          ))}
        </Stack>
      )}
    />
  );
}
