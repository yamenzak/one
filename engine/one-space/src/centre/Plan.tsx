/**
 * ONE PRODUCT'S PLANS — the decision, on its own screen.
 *
 * ⚠️ IT LEFT THE BILL BECAUSE A PRICE LIST IS NOT A STATEMENT. Somebody reads a
 * bill monthly and changes a plan about once a year, and stacking every
 * product's catalogue under the total meant a workspace with six products
 * scrolled past six price lists to find out what it owed (DESIGN.md §3).
 */

import { Chip } from "@heroui/react";
import { Screen, Shelf, notice } from "@engine/design";
import { api } from "../api.js";
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
              /*
                ⚠️ CHOOSING OPENS A PAGE STRIPE OWNS, AND GRANTS NOTHING. The
                plan is stamped only when a signed event says the money moved —
                so closing the tab leaves the workspace exactly where it was,
                which is the behaviour somebody who changes their mind expects.

                ⚠️ AND A FULL PAGE LOAD, NOT A NEW TAB. A popup is what a browser
                blocks and what a phone loses behind the app it came from; the
                return address is already carried in the session.
              */
              onChoose={(planId) => void (async () => {
                const out = await api.post<{ url: string }>(
                  "money.checkout", { app, plan: planId });
                if (!out.ok) { notice.fail(out.problem.title); return; }
                window.location.assign(out.value.url);
              })()}
            />
          </>
        );
      }}
    />
  );
}
