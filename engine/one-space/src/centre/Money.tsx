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

import { useMemo, useState } from "react";
import { Button, Chip } from "@heroui/react";
import { isBusiness, sayDate, type Instant, type Kind } from "@engine/kernel";
import {
  AmountRow, Bill, Confirm, ControlRow, Credits, Group, Lookup, Screen, Storage, TYPE, Wallet,
  glyphOf, notice, useMoney, useShown,
} from "@engine/design";
import { api } from "../api.js";
/* ⚠️ Aliased, because `money` is this screen's own loader and the list is the
   currencies somebody may pick from — two different things one word away. */
import { money as currencyList, moneyName } from "../currencies.js";
import { useCentre, useLoad, type CentreView, type MoneyView } from "./data.js";

export function Money({ view, onGo }: {
  readonly view: CentreView;
  readonly onGo: () => void;
}) {
  const price = useMoney();
  const shown = useShown();
  const money = useLoad<MoneyView>("money.view");
  /* ⚠️ THE SAME READ THE SCREEN ABOVE ALREADY WAITED ON — `useLoad` answers from
     its cache, so this is a handle on the refetch rather than a second call. The
     currency is on `centre.view`, so changing it has to re-read that one. */
  const { again } = useCentre();
  const may = view.you.platform.includes("tenant:manage");

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
              amount={data.bill.total > 0 ? price(data.bill.total, data.bill.currency) : "Free"}
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
                  under={sayDate(shown, m.at as Instant)}
                  amount={<Credits value={m.delta} as="inline" signed />}
                />
              ))}
            </Group>
          ) : null}

          {/* ⚠️ WHAT THIS WORKSPACE'S OWN FIGURES ARE IN, WHICH IS NOT WHAT WE
              BILL IT IN. Both live here because both are money and somebody
              looking for either looks here — and the two being on one screen is
              exactly what stops them being confused for each other. */}
          <TheirCurrency
            currency={view.tenant.currency ?? ""}
            may={may}
            onSaved={() => { void again(); }}
          />
        </>
      )}
    />
  );
}

/**
 * WHAT THIS WORKSPACE KEEPS ITS BOOKS IN.
 *
 * ⚠️ IT RE-LABELS, IT NEVER CONVERTS, AND THAT IS THE SENTENCE ON THE SHEET. A
 * conversion needs a rate on a date, and inventing one prints a guess as a fact;
 * so changing this asserts what the workspace's figures always meant. Right on
 * the first day, wrong once there is real money in the books — which is a
 * judgement the person makes, and can only make if we say it plainly.
 *
 * ⚠️ AND IT IS READ-ONLY WHERE SOMEBODY MAY NOT CHANGE IT, never hidden. Which
 * currency a figure is in is a fact everybody here needs; only setting it is an
 * administration.
 */
function TheirCurrency({ currency, may, onSaved }: {
  readonly currency: string;
  readonly may: boolean;
  readonly onSaved: () => void;
}) {
  const [want, setWant] = useState(currency);
  const options = useMemo(
    () => currencyList().map((one) => ({ id: one.code, label: one.label })),
    [],
  );

  const save = async () => {
    const got = await api.post("tenant.currency", { currency: want });
    if (!got.ok) { notice.fail(got.problem.title); return; }
    notice.ok(`Amounts here are now in ${want}`);
    onSaved();
  };

  return (
    <Group label="Your own currency">
      <ControlRow
        label="Amounts in this workspace"
        under={may
          ? "Changing this re-labels every figure already recorded — it converts nothing"
          : "Set by whoever runs this workspace"}
      >
        {may
          ? (
            <Lookup
              label="Currency"
              value={want}
              options={options}
              onChange={setWant}
            />
          )
          : <span className={TYPE.note}>{moneyName(currency)}</span>}
      </ControlRow>
      {may && want && want !== currency
        ? (
          <ControlRow label="" under={`Every amount already recorded will read as ${want}`}>
            <Confirm
              trigger={<Button variant="primary">Change it</Button>}
              title={`Read every amount here as ${want}?`}
              act={{ label: "Change it", onDo: () => { void save(); } }}
            >
              Nothing is converted. Figures recorded in {moneyName(currency)} keep
              their numbers and will be shown in {moneyName(want)}.
            </Confirm>
          </ControlRow>
        )
        : null}
    </Group>
  );
}
