/**
 * MONEY — what this workspace pays, and what is left to spend.
 *
 * ⚠️ ONE BILL FOR A BUSINESS WITH SEVERAL OF OUR PRODUCTS. That is the thing the
 * whole inversion is for, and this screen is where a customer either sees it or
 * does not: one figure, one row per product — not three emails on three days
 * from what looks like three companies.
 *
 * ⚠️ AND CHOOSING A PLAN IS A DIFFERENT SCREEN, WHICH IS THE CORRECTION HERE.
 * A bill is read monthly and a plan is changed once a year; one is a fact and
 * the other is a purchase (DESIGN.md §3). Stacking every product's price list
 * under the bill meant a workspace with six products scrolled past six
 * catalogues to find out what it owed. The product's row IS the way in.
 */

import { Chip } from "@heroui/react";
import { AmountRow, Bill, Group, Screen, appFace, glyphOf } from "@engine/design";
import { useLoad, type CentreView, type MoneyView } from "./data.js";

export function Money({ view, onGo }: {
  readonly view: CentreView;
  readonly onGo: (appId: string) => void;
}) {
  void view;
  const money = useLoad<MoneyView>("money.view");

  return (
    /* ⚠️ `figure` — one number is what the screen is for and everything under it
       supports that number. No primary action: a bill is READ. Changing a plan
       is a purchase and it is its own screen (`Plan.tsx`). */
    <Screen
      shape="figure"
      of={money.of}
      again={money.again}
      then={(data) => {
        const priced = new Map(data.bill.lines.map((l) => [l.appId, l]));
        return (
          <>
            <Bill
              lines={data.bill.lines}
              total={data.bill.total}
              currency={data.bill.currency}
              appName={(id) => data.apps.find((a) => a.id === id)?.name ?? id}
            />

            {/* ⚠️ CREDITS IS A ROW, NOT A SECOND HERO. It is a real number and
                it is not the one this screen answers — two figures side by side
                make the reader decide which is the subject before reading
                either. */}
            <Group>
              <AmountRow
                icon={glyphOf("coins")}
                label="Credits"
                under="Spent by AI features"
                amount={data.balance.spendable.toLocaleString("en")}
              />
            </Group>

            {/* ⚠️ ONE ROW PER PRODUCT, AND IT OPENS THAT PRODUCT'S PLANS. The
                row says what it is on and what that costs; the catalogue is one
                tap away rather than four screens of scrolling. */}
            <Group>
              {data.apps.map((app) => {
                const line = priced.get(app.id);
                const plan = app.plans.find((p) => p.id === app.planId);
                return (
                  <AmountRow
                    key={app.id}
                    face={appFace(app.id, app.mark)}
                    label={app.name}
                    under={app.status === "past_due"
                      ? "The last payment did not go through"
                      : plan?.name ?? "No plan yet"}
                    amount={line
                      ? new Intl.NumberFormat("en", { style: "currency", currency: line.currency })
                        .format(line.price / 100)
                      : "Free"}
                    aside={app.status === "past_due"
                      ? <Chip color="warning" variant="soft"><Chip.Label>!</Chip.Label></Chip>
                      : undefined}
                    onOpen={() => onGo(app.id)}
                  />
                );
              })}
            </Group>
          </>
        );
      }}
    />
  );
}
