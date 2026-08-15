/**
 * MONEY — two directions, one area, clearly separated.
 *
 * ⚠️ WHAT THE WORKSPACE PAYS US IS ONE BILL, one line per product — the promise
 * the whole inversion makes, drawn from the same rows a charge would collect.
 * What its customers pay THE WORKSPACE lives with the packages in People; here
 * it is the shelf side: which plan each product is on, and what a step up
 * would include.
 *
 * ⚠️ ONE FIGURE, THEN ROWS. This screen was three stacked card decks — a titled
 * bill card, a titled credits card, and a grid of plan cards each holding the
 * same five-line entitlement table. Every fact on it was true and none of it was
 * readable. It is the hub's own grammar now, which is the grammar of every other
 * screen here: the number somebody came for, and rows under it.
 */

import { Chip } from "@heroui/react";
import {
  AmountRow, Await, Bill, FigureWaiting, Group, Section, Shelf, Stack, distinguishing, glyphOf,
  notice,
} from "@quad/web";
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
          {/* ⚠️ The crown names the screen — see hub/Hub.tsx. */}
          <Bill
            lines={data.bill.lines}
            total={data.bill.total}
            currency={data.bill.currency}
            appName={(id) => data.apps.find((a) => a.id === id)?.name ?? id}
          />

          {/* ⚠️ CREDITS IS A ROW, NOT A SECOND HERO. It is a real number and it
              is not the one this screen answers — a card of its own beside the
              bill made two figures compete, and the reader has to decide which
              is the subject before reading either. */}
          <Group>
            <AmountRow
              icon={glyphOf("coins")}
              label="Credits"
              under="Spent by AI features"
              amount={data.balance.spendable.toLocaleString("en")}
            />
          </Group>

          {/* ⚠️ NO GLYPH CHARACTER IN THE LABEL. `app.mark` is a text character
              from a manifest, so it renders at whatever weight and baseline the
              reader's font gives it, beside a name that already says which
              product this is.

              ⚠️ AND NO LABEL AT ALL ON A WORKSPACE WITH ONE PRODUCT — see
              `distinguishing`. The crown already said which screen and which
              workspace; a third heading naming the only product there is is a
              line to read before the prices. */}
          {data.apps.map((app) => (
            <Section key={app.id} label={distinguishing(data.apps, app.name)}
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
