/**
 * ONE PRODUCT'S PLANS — the decision, on its own screen.
 *
 * ⚠️ IT LEFT THE BILL BECAUSE A PRICE LIST IS NOT A STATEMENT. Somebody reads a
 * bill monthly and changes a plan about once a year, and stacking every
 * product's catalogue under the total meant a workspace with six products
 * scrolled past six price lists to find out what it owed (DESIGN.md §3).
 */

import { Chip } from "@heroui/react";
import { Await, FigureWaiting, Nothing, Shelf, Stack, notice } from "@quad/web";
import { useLoad, type MoneyView } from "./data.js";

export function Plan({ app }: { readonly app: string }) {
  const money = useLoad<MoneyView>("money.view");

  return (
    <Await
      of={money.of}
      waiting={<FigureWaiting count={1} />}
      again={money.again}
      then={(data) => {
        const held = data.apps.find((a) => a.id === app);
        if (!held) return <Nothing says="No such product here" />;
        return (
          <Stack space="snug">
            {held.status === "past_due"
              ? (
                <Chip color="warning" variant="soft">
                  <Chip.Label>The last payment did not go through — the plan holds while it retries.</Chip.Label>
                </Chip>
              )
              : null}
            <Shelf
              plans={held.plans}
              entitlements={held.entitlements}
              current={held.planId ?? undefined}
              /* ⚠️ Honest until the payment rail lands: choosing is recorded
                 nowhere, so the screen says so instead of pretending. */
              onChoose={() => notice.warn("Changing plans arrives with the payment rail.")}
            />
          </Stack>
        );
      }}
    />
  );
}
