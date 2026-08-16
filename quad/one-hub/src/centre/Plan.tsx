/**
 * ONE PRODUCT'S PLANS — the decision, on its own screen.
 *
 * ⚠️ IT LEFT THE BILL BECAUSE A PRICE LIST IS NOT A STATEMENT. Somebody reads a
 * bill monthly and changes a plan about once a year, and stacking every
 * product's catalogue under the total meant a workspace with six products
 * scrolled past six price lists to find out what it owed (DESIGN.md §3).
 */

import { Chip } from "@heroui/react";
import { Screen, Shelf, notice } from "@quad/design";
import { useLoad, type MoneyView } from "./data.js";

export function Plan({ app }: { readonly app: string }) {
  const money = useLoad<MoneyView>("money.view");

  return (
    /* ⚠️ `decision` — one object, one choice, staged. It is the one shape whose
       whole job is to make a purchase legible, and nothing else is on it. */
    <Screen
      shape="decision"
      of={money.of}
      again={money.again}
      isNothing={(d) => !d.apps.some((a) => a.id === app)}
      nothing={{ says: "No such product here" }}
      then={(data) => {
        const held = data.apps.find((a) => a.id === app)!;
        return (
          <>
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
          </>
        );
      }}
    />
  );
}
