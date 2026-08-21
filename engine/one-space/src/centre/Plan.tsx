/**
 * THE MEMBERSHIP — the decision, on its own screen.
 *
 * ⚠️ IT LEFT THE BILL BECAUSE A PRICE LIST IS NOT A STATEMENT. Somebody reads a
 * bill monthly and changes a plan about once a year, and stacking the catalogue
 * under the total meant scrolling past it to find out what was owed
 * (DESIGN.md §3).
 *
 * ⚠️ AND THERE IS ONE PLAN, NOT ONE PER PRODUCT. This screen used to be a
 * product's catalogue and took an app id; the membership covers every product a
 * workspace has switched on, so a catalogue per app was the same list drawn once
 * per product with the same answer on each.
 */

import { Chip } from "@heroui/react";
import { Screen, Shelf, notice } from "@engine/design";
import { api } from "../api.js";
import { useLoad, type MoneyView } from "./data.js";

export function Plan() {
  const money = useLoad<MoneyView>("money.view");

  return (
    /* ⚠️ `decision` — one object, one choice, staged. It is the one shape whose
       whole job is to make a purchase legible, and nothing else is on it. */
    <Screen
      shape="decision"
      of={money.of}
      again={money.again}
      then={(data) => (
        <>
          {data.status === "past_due"
            ? (
              <Chip color="warning" variant="soft">
                <Chip.Label>The last payment did not go through — the plan holds while it retries.</Chip.Label>
              </Chip>
            )
            : null}
          <Shelf
            plans={data.plans}
            entitlements={data.entitlements}
            current={data.plan?.id ?? undefined}
            /* ⚠️ WHETHER ANYBODY IS PAYING FOR THIS. Without it the shelf printed
               the catalogue's price over a workspace with no card — so a cash
               customer, a friend and a demo about to end all read a bill
               describing somebody else's arrangement. */
            given={data.given}
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
              const out = await api.post<{ url: string }>("money.checkout", { plan: planId });
              if (!out.ok) { notice.fail(out.problem.title); return; }
              window.location.assign(out.value.url);
            })()}
          />
        </>
      )}
    />
  );
}
