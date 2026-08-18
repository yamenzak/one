/**
 * MONEY — what this workspace pays, what it holds, and what it is spending.
 *
 * ⚠️ ONE BILL FOR A BUSINESS WITH SEVERAL OF OUR PRODUCTS. That is the thing the
 * whole inversion is for, and this screen is where a customer either sees it or
 * does not: one figure, one membership — not three emails on three days from
 * what looks like three companies.
 *
 * ⚠️ AND CHOOSING A PLAN IS A DIFFERENT SCREEN. A bill is read monthly and a
 * plan is changed once a year; one is a fact and the other is a purchase
 * (DESIGN.md §3). The plan's row is the way in.
 *
 * ⚠️ THE WALLET IS UNDER THE BILL RATHER THAN BESIDE IT. Two heroes on one
 * screen make the reader decide which is the subject before reading either — so
 * the bill answers "what does this cost" and everything below it answers "what
 * have I got and where is it going", in that order.
 */

import { Chip } from "@heroui/react";
import { isBusiness, type Kind } from "@engine/kernel";
import {
  AmountRow, Bill, Credits, Group, Screen, Storage, Wallet, glyphOf, notice,
} from "@engine/design";
import { api } from "../api.js";
import { useLoad, type CentreView, type MoneyView } from "./data.js";

/** ⚠️ A movement is dated, and a statement without dates is a list of amounts. */
const on = (at: string): string =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function Money({ view, onGo }: {
  readonly view: CentreView;
  readonly onGo: () => void;
}) {
  void view;
  const money = useLoad<MoneyView>("money.view");

  /*
    ⚠️ THE CHECKOUT ANSWERS WITH A URL AND WE FOLLOW IT. Nothing is granted here
    — the session is Stripe's and the credits arrive from a signed event — so
    the only thing this handler may do is navigate.
  */
  const buy = async (packId: string) => {
    const got = await api.post<{ url: string }>("money.topup", { pack: packId });
    if (got.ok) globalThis.location.assign(got.value.url);
  };

  /* ⚠️ RE-READ AFTER THE WRITE, because the answer this screen shows is the
     server's. A control that kept its own copy would show an instruction that
     was refused as though it had been saved. */
  const arm = async (packId: string | null, below: number) => {
    const got = await api.post("money.auto", { pack: packId ?? "", below });
    if (!got.ok) { notice.fail(got.problem.title); return; }
    money.again();
  };

  return (
    /* ⚠️ `figure` — one number is what the screen is for and everything under it
       supports that number. No primary action: a bill is READ. */
    <Screen
      shape="figure"
      of={money.of}
      again={money.again}
      then={(data) => (
        <>
          <Bill
            lines={data.bill.lines}
            total={data.bill.total}
            currency={data.bill.currency}
            mixed={data.mixed}
            appName={(id) => data.apps.find((a) => a.id === id)?.name ?? id}
          />

          {/* ⚠️ THE MEMBERSHIP IS ONE ROW, AND IT IS THE WAY TO THE CATALOGUE.
              One plan covers every product here, so a row per product would be
              the same answer repeated once per app. */}
          <Group>
            <AmountRow
              icon={glyphOf("bank")}
              label={data.plan?.name ?? "No plan yet"}
              under={data.status === "past_due"
                ? "The last payment did not go through"
                : data.plan && isBusiness(data.plan.kind as Kind) ? "A business" : "Personal"}
              amount={data.bill.total > 0
                ? new Intl.NumberFormat("en", { style: "currency", currency: data.bill.currency })
                  .format(data.bill.total / 100)
                : "Free"}
              aside={data.status === "past_due"
                ? <Chip color="warning" variant="soft"><Chip.Label>!</Chip.Label></Chip>
                : undefined}
              onOpen={onGo}
            />
          </Group>

          <Wallet
            granted={data.wallet.granted}
            bought={data.wallet.bought}
            held={data.wallet.held}
            owed={Math.ceil(data.wallet.owedMilli / 1000)}
            spentByApp={data.spent}
            appName={(id) => data.apps.find((a) => a.id === id)?.name ?? id}
            packs={data.packs}
            onBuy={(id) => { void buy(id); }}
            armed={data.armed}
            onArm={(packId, below) => { void arm(packId, below); }}
          />

          <Storage
            used={data.storage.used}
            included={data.storage.included}
            creditsPerGbMonth={data.storage.creditsPerGbMonth}
          />

          {/*
            ⚠️ THE STATEMENT, BECAUSE A BALANCE WITH NO HISTORY IS A NUMBER
            SOMEBODY HAS TO TAKE ON TRUST. "Where did my credits go" is the first
            question a shared wallet provokes, and this is the answer.
          */}
          {data.statement.length > 0 ? (
            <Group label="Recent movements">
              {data.statement.slice(0, 12).map((m, i) => (
                <AmountRow
                  key={`${m.at}-${i}`}
                  label={m.reason}
                  under={on(m.at)}
                  amount={<Credits value={m.delta} as="inline" signed />}
                />
              ))}
            </Group>
          ) : null}
        </>
      )}
    />
  );
}
