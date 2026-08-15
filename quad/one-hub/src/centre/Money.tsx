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
import { Await, Bill, Figure, FigureWaiting, Section, Shelf, Stack, notice } from "@quad/web";
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

          <Card>
            <Card.Header>
              <Card.Title>Credits</Card.Title>
              <Card.Description>
                Spent by the features that generate things. Topping up is coming with the payment rail.
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <Figure value={data.balance.spendable.toLocaleString("en")} of="credits available" />
            </Card.Content>
          </Card>

          {data.apps.map((app) => (
            <Section key={app.id} label={`${app.mark} ${app.name}`}
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
