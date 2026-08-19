/**
 * ONE WORKSPACE, FROM THE OPERATOR'S SIDE.
 *
 * ⚠️ EVERY FACT ABOUT A WORKSPACE USED TO HANG OFF A TABLE CELL. The list drew
 * a row and a tray, and the tray held a product picker, an entitlement picker, a
 * number field and the list of what had already been adjusted — a screen's worth
 * of decisions inside a popover, on a phone, in a table that scrolled sideways.
 * The moment a customer holds six products across two branches, that is not a
 * design, it is a hiding place (DESIGN.md §3).
 *
 * ⚠️ SO THE WORKSPACE IS THE SUBJECT AND THE PRODUCTS ARE ITS ROWS. What it is
 * on, per product; where it lives; what has been moved for it and by how much.
 * The adjustment is still a sheet, because typing a number is a step and not a
 * screen — but it opens from the product it changes rather than from a cell.
 */

import { useState } from "react";
import { Button, Chip } from "@heroui/react";
import {
  AmountRow, ControlRow, Credits, FieldRow, Group, Identity, Nothing, NumberInput, Row,
  RowsWaiting, Screen, Stack, TYPE, TextInput, Tray, appFace, glyphOf, notice, placeFace,
  sentence, useShown,
} from "@engine/design";
import type { Allowance, EntitlementDef, PlanSpec } from "@engine/kernel";
import { bytesOfGb, isBusiness, sayAllowance, sayDate, sayNumber, type Instant } from "@engine/kernel";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

/** ⚠️ A product, and whether it is switched ON — a workspace keeps one it
    turned off. Nothing about money hangs here any more: the plan, the standing
    and the adjustments are the WORKSPACE's, and reading them per product was N
    copies of one answer with the console drawing whichever came first. */
interface Held {
  readonly id: string;
  readonly on: boolean;
}

interface TenantLine {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string;
  readonly shardId: string;
  /** ⚠️ What it IS, beside what it bought (D21). */
  readonly kind?: "personal" | "commercial";
  readonly legalName?: string | null;
  readonly closedAt: string | null;
  /** ⚠️ One membership, at the workspace. */
  readonly planId: string | null;
  readonly status: string | null;
  /** ⚠️ Given rather than bought — the two look identical without this. */
  readonly compedAt: string | null;
  readonly adjustments: Readonly<Record<string, Allowance>>;
  readonly apps: readonly Held[];
}

/**
 * ⚠️ WHAT IS WRONG WITH THIS WORKSPACE, IN ONE ANSWER, OR NOTHING AT ALL. A row
 * that says "active" is a row that exists to say nothing; what an operator opened
 * this screen for is the case where it does not.
 */
const standing = (t: TenantLine): {
  readonly says: string; readonly under?: string; readonly ink: "warning" | "danger";
} | null => {
  if (t.closedAt) return { says: "Closed", under: "It is on its way out", ink: "danger" };
  if (t.status === "past_due") {
    return { says: "Behind on payment", under: "Read-only once the grace runs out", ink: "warning" };
  }
  if (t.status && t.status !== "active" && t.status !== "trialing") {
    return { says: sentence(t.status), ink: "warning" };
  }
  return null;
};

interface AppLine {
  readonly id: string;
  readonly name: string;
  readonly mark: string;
  readonly entitlements: Readonly<Record<string, EntitlementDef>>;
}

/** ⚠️ What one workspace holds, read separately — see `op.tenant.money`. */
interface MoneyLine {
  readonly wallet: {
    readonly granted: number; readonly bought: number; readonly held: number;
    readonly spendable: number; readonly owedMilli: number; readonly owing: boolean;
  };
  readonly auto: { readonly packId: string | null; readonly below: number; readonly error: string | null };
  /** ⚠️ What a month grants, and what the plan alone would — see `allowanceFor`. */
  readonly allowance: {
    readonly monthly: number; readonly plan: number; readonly comped: string | null;
  };
  readonly statement: readonly {
    readonly at: string; readonly delta: number; readonly reason: string;
  }[];
}

export function OneTenant({ id }: { readonly id: string }) {
  const of = useLoad<{
    items: readonly TenantLine[];
    apps: readonly AppLine[];
    plans: readonly PlanSpec[];
  }>("op.tenants");

  return (
    /* ⚠️ `detail` — one subject and its facts, with no primary: an operator
       comes here to LOOK, and the one thing they change is per product, so it
       opens from the product's own row. */
    <Screen
      shape="detail"
      of={of.of}
      again={of.again}
      waiting={<RowsWaiting rows={3} />}
      isNothing={(d) => !d.items.some((t) => t.id === id)}
      nothing={{
        icon: glyphOf("workspace"),
        says: "No such workspace",
        under: "It may have been closed since this list was read",
      }}
      then={(data) => {
        const tenant = data.items.find((t) => t.id === id)!;
        return (
          <>
            {/* ⚠️ A SCREEN ABOUT A WORKSPACE OPENS WITH ITS NAME AND WHERE IT
                LIVES — the shape §4 asks for, and the two facts an operator
                needs before any of the rest means anything. */}
            <Identity
              face={placeFace(tenant.slug)}
              name={tenant.name}
              under={`${tenant.slug} · ${tenant.country} · ${tenant.shardId}`}
              /* ⚠️ CLOSED WINS THE ONE SLOT. A closed workspace's kind is not
                 what an operator opened this screen to find out, and two chips
                 side by side make neither of them the answer. */
              /* ⚠️ AND IT IS ONE WORD. This carried the registered name — up to
                 forty characters in a capsule beside a title — so the chip was
                 wider than the heading it sat next to and wrapped on a phone.
                 What it is belongs here; WHAT IT IS CALLED is a fact, and a
                 fact is a row. */
              aside={tenant.closedAt
                ? <Chip color="danger" variant="soft"><Chip.Label>Closed</Chip.Label></Chip>
                : isBusiness(tenant.kind ?? "personal")
                  ? <Chip variant="soft"><Chip.Label>Business</Chip.Label></Chip>
                  : undefined}
            />

            {/* ⚠️ THE MEMBERSHIP IS ONE ROW ABOVE THE PRODUCTS, because it is
                one row of truth. Drawn per product it was the same plan four
                times, and the adjustment tray beside each of them wrote to the
                same place. */}
            {/*
              ⚠️ THE ACTIONS ARE AT THE FOOT, NOT IN THE ROW'S CONTROL SLOT. Two
              ghost buttons in a `ControlRow` fit on a desktop and wrap on a
              phone — measured: they stacked under the label, left-aligned, with
              nothing around them saying they were controls, so the card read as
              a plan with two words printed under it. A card with something to do
              about it is what `does` is for.

              ⚠️ AND THE FACTS ARE ROWS RATHER THAN A DOT-RUN. "given, not bought
              · past_due · 1 adjusted" is three unrelated answers in one grey
              line, and the one that matters — nobody is paying for this — was
              the middle of it.
            */}
            <Group
              label="Membership"
              does={
                <Row space="tight">
                  <PlanTray tenant={tenant} plans={data.plans} onDone={of.again} />
                  <AdjustTray tenant={tenant} apps={data.apps} onDone={of.again} />
                </Row>
              }
            >
              <FieldRow
                label="Plan"
                value={data.plans.find((p) => p.id === tenant.planId)?.name ?? "No plan"}
                /* ⚠️ GIVEN IS SAID HERE, because everything else reads
                   differently once it is: a comped workspace has no invoice, so
                   "has not paid" is not a question to ask about it. */
                under={tenant.compedAt ? "Given, not bought" : undefined}
              />
              {standing(tenant) ? (
                <FieldRow
                  label="Standing"
                  /* ⚠️ IN THE TONE, because it is the one fact on the card that
                     is a problem — and a monochrome product has exactly one
                     channel for saying so. */
                  value={<span data-ink={standing(tenant)!.ink}>{standing(tenant)!.says}</span>}
                  under={standing(tenant)!.under}
                />
              ) : null}
              {tenant.legalName ? (
                <FieldRow label="Registered as" value={tenant.legalName} />
              ) : null}
              {Object.keys(tenant.adjustments).length ? (
                /* ⚠️ WHICH KEYS, NOT HOW MANY. "1" over the word "seats" is a
                   count and its own footnote; what an operator needs to know is
                   which of a workspace's limits somebody has moved. */
                <FieldRow
                  label="Adjusted for this workspace"
                  /* ⚠️ AND THEY ARE NAMED, NOT KEYED. `seats` under a sentence in
                     sentence case is the identifier the entitlement is stored
                     under, printed where its name was meant. */
                  value={Object.keys(tenant.adjustments).map(sentence).join(", ")}
                />
              ) : null}
            </Group>

            <Money tenant={tenant} />

            <Group label="Products">
              {tenant.apps.map((held) => {
                const app = data.apps.find((a) => a.id === held.id);
                return (
                  <ControlRow
                    key={held.id}
                    face={appFace(held.id, app?.mark)}
                    label={app?.name ?? sentence(held.id)}
                    under={held.on ? undefined : "switched off"}
                  >
                    <Row space="tight">
                      <AppSwitch tenant={tenant} held={held} onDone={of.again} />
                    </Row>
                  </ControlRow>
                );
              })}
              {/* ⚠️ A ROW WITH AN EMPTY CONTROL IS NOT AN EMPTY STATE. It drew a
                  label and a blank slot, which reads as a product whose switch
                  failed to load. */}
              {tenant.apps.length === 0
                ? <Nothing icon={glyphOf("apps")} says="No product is switched on here" />
                : null}
            </Group>
          </>
        );
      }}
    />
  );
}

/**
 * TURNING A PRODUCT ON, OR OFF, FOR THIS WORKSPACE.
 *
 * ⚠️ OFF IS NOT REMOVED, AND THE COPY HAS TO SAY SO, because the button looks
 * exactly like one that deletes. The records stay, the tables stay, and turning
 * it back on is the same press again — so this is `secondary` rather than
 * `danger`, and the sentence afterwards is what happened rather than a warning
 * about what might have.
 */
function AppSwitch({ tenant, held, onDone }: {
  readonly tenant: TenantLine;
  readonly held: Held;
  readonly onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const set = async (on: boolean) => {
    setBusy(true);
    const out = await api.post("op.tenant.app", { tenant: tenant.id, app: held.id, on });
    setBusy(false);
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(on
      ? `${sentence(held.id)} is on for ${tenant.name}.`
      : `${sentence(held.id)} is off for ${tenant.name}. Nothing was deleted.`);
    onDone();
  };

  return (
    <Button variant="secondary" isPending={busy} onPress={() => void set(!held.on)}>
      {held.on ? "Turn off" : "Turn on"}
    </Button>
  );
}

/**
 * ⚠️ THE SHEET IS THE WORKSPACE'S, over every key its membership could hold.
 * It was per product, which was the shape while plans were — and under one
 * membership that meant four trays writing to the same row, each showing a
 * quarter of what was on it.
 */
function AdjustTray({ tenant, apps, onDone }: {
  readonly tenant: TenantLine;
  readonly apps: readonly AppLine[];
  readonly onDone: () => void;
}) {
  const keys = Object.entries(
    Object.fromEntries(apps.flatMap((a) => Object.entries(a.entitlements))),
  ).filter(([, d]) => !d.reserved);
  const reader = useShown();
  const [key, setKey] = useState(keys[0]?.[0] ?? "");
  const [value, setValue] = useState<number | undefined>(undefined);
  const of = keys.find(([id]) => id === key)?.[1];
  const label = of?.label ?? key;

  const write = async (next: number | null, which = key) => {
    /* ⚠️ TYPED IN GIGABYTES AND STORED IN BYTES — see `sayAllowance`. The field
       asks in the unit somebody thinks in; the store never changes. */
    const store = next !== null && keys.find(([id]) => id === which)?.[1]?.unit === "bytes"
      ? bytesOfGb(next) : next;
    const out = await api.post("op.tenant.adjust", { tenant: tenant.id, key: which, value: store });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(next === null
      ? "Back to the plan's own number."
      : `${sentence(which)} is ${sayAllowance(reader, of, store ?? undefined)} for ${tenant.name}.`);
    onDone();
  };

  return (
    <Tray
      /* ⚠️ `secondary` — THIS IS A CARD'S FOOT, and a ghost there is a word
         floating under a list of facts with nothing saying it can be pressed.
         A button says so by being one (DESIGN.md §5). */
      trigger={<Button variant="secondary">Adjust</Button>}
      title={`What ${tenant.name} gets`}
      actions={
        <Button
          slot="close"
          variant="primary"
          isDisabled={value === undefined || !key}
          onPress={() => void write(value ?? 0)}
        >
          Set it
        </Button>
      }
    >
      <Stack space="roomy">
        {/* ⚠️ EVERY ENTITLEMENT IS A ROW WITH ITS OWN NUMBER ON IT, rather than
            a picker and a field. The operator is looking for the one that is
            wrong, and a `Select` hides fourteen of them behind a fifteenth. */}
        <Group label="What this workspace gets">
          {keys.map(([id, def]) => (
            <AmountRow
              key={id}
              label={def.label}
              under={id === key ? "changing this one" : undefined}
              amount={sayAllowance(reader, def, tenant.adjustments[id])}
              aside={tenant.adjustments[id] === undefined
                ? <Button variant="ghost" onPress={() => setKey(id)}>Change</Button>
                : <Button variant="ghost" onPress={() => void write(null, id)}>Clear</Button>}
            />
          ))}
        </Group>
        <NumberInput
          label={`New number for ${label}`}
          value={value}
          onChange={setValue}
          help={of?.unit === "bytes"
            ? "Gigabytes. Absolute, either direction. -1 is unlimited."
            : "Absolute, either direction. -1 is unlimited."}
        />
      </Stack>
    </Tray>
  );
}

/**
 * WHAT THIS WORKSPACE HOLDS, AND WHAT WE CAN PUT INTO IT.
 *
 * ⚠️ THE OPERATOR COULD ADJUST WHAT A WORKSPACE MAY DO AND COULD NOT SEE WHAT IT
 * HAD. Every support conversation about credits starts with "how many do they
 * have and where did they go", and answering it meant reading the database by
 * hand — so the console's one billing power changed a number nobody on this side
 * could look at.
 *
 * ⚠️ IT IS LOADED SEPARATELY FROM THE LIST, deliberately. `op.tenants` draws
 * every workspace on the deployment; putting a wallet, a statement and a
 * standing instruction on each of those rows is three more queries per workspace
 * for a screen that shows none of them.
 */
function Money({ tenant }: { readonly tenant: TenantLine }) {
  const reader = useShown();
  const of = useLoad<MoneyLine>("op.tenant.money", { tenant: tenant.id });

  if (of.of.status !== "ready") {
    return (
      <Group label="Wallet">
        <RowsWaiting rows={2} />
      </Group>
    );
  }
  const { wallet, auto, statement, allowance } = of.of.data;

  return (
    <>
      {/* ⚠️ GIVING CREDITS IS THE CARD'S ACTION, AT ITS FOOT. It was a row whose
          control was a tray trigger, so on a phone the button wrapped under its
          own label and sat in the middle of a list of balances looking like one
          of them. */}
      <Group
        label="Wallet"
        does={<CompTray tenant={tenant} onDone={of.again} />}
      >
        {/* ⚠️ THE TWO BALANCES, because one figure that drops on the first of
            the month is a support conversation every month for ever. */}
        <AmountRow
          label="This month's allowance"
          under="Ends when the month does"
          amount={<Credits value={wallet.granted} as="inline" />}
        />
        <AmountRow
          label="Credits they bought"
          under="Never expires"
          amount={<Credits value={wallet.bought} as="inline" />}
        />
        {/*
          ⚠️ WHAT A MONTH GRANTS, AND WHETHER IT IS THE PLAN'S OWN NUMBER. An
          override honoured in the product and invisible here is one nobody can
          explain to the customer asking about it — and it is set from the same
          tray as every other adjustment, which is why it is a row and not a
          control of its own.
        */}
        <AmountRow
          label="Granted every month"
          under={allowance.monthly === allowance.plan
            ? "What their plan includes"
            : `Set for this workspace — their plan gives ${sayNumber(reader, allowance.plan)}`}
          amount={<Credits value={allowance.monthly} as="inline" />}
        />
        {wallet.owedMilli > 0 ? (
          <AmountRow
            tone="warning"
            label="Owed"
            under={wallet.owing
              ? "The workspace is read-only until this clears"
              : "Collected on the next sweep"}
            amount={<Credits value={Math.ceil(wallet.owedMilli / 1000)} as="inline" />}
          />
        ) : null}
        {/*
          ⚠️ AND WHY A STANDING CHARGE LAST FAILED. It is the answer to the
          question the customer is about to ask, and nobody was present when the
          bank gave it.

          ⚠️ THE LABEL IS WHAT HAPPENED AND THE BANK'S WORDS ARE THE DETAIL. This
          had them the other way round — "Your card was declined" as the row's
          own name — so a sentence written by somebody else's payment processor,
          addressed to the customer, was the heading of a row on our console.
        */}
        {auto.error ? (
          <AmountRow
            tone="warning"
            label="Standing top-up failed"
            under={auto.error}
            amount={<Credits value={auto.below} as="inline" />}
          />
        ) : null}
      </Group>

      {statement.length > 0 ? (
        <Group label="Recent movements">
          {statement.slice(0, 10).map((m, i) => (
            <AmountRow
              key={`${m.at}-${i}`}
              label={m.reason}
              under={sayDate(reader, m.at as Instant)}
              amount={<Credits value={m.delta} as="inline" signed />}
            />
          ))}
        </Group>
      ) : null}
    </>
  );
}

/**
 * CREDITS PUT IN BY US.
 *
 * ⚠️ THE REASON IS REQUIRED, AND IT GOES ON THE STATEMENT THE CUSTOMER READS.
 * This is the only write in the system that adds money with no payment behind
 * it, and a balance that moved with nothing explaining it is the one thing
 * nobody can reconstruct.
 *
 * ⚠️ AND IT ONLY EVER ADDS. Taking credits back is a refund decision with a
 * payment behind it, not an operator's edit — a control that could do both is
 * one where a mistyped sign empties somebody's wallet.
 */
function CompTray({ tenant, onDone }: {
  readonly tenant: TenantLine;
  readonly onDone: () => void;
}) {
  const [credits, setCredits] = useState<number | undefined>(undefined);
  const [why, setWhy] = useState("");

  const give = async () => {
    const out = await api.post("op.tenant.comp", { tenant: tenant.id, credits, why });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${credits} credits added for ${tenant.name}.`);
    setCredits(undefined);
    setWhy("");
    onDone();
  };

  return (
    <Tray
      trigger={<Button variant="secondary">Give credits</Button>}
      title={`Give credits to ${tenant.name}`}
      actions={
        <Button
          slot="close"
          variant="primary"
          isDisabled={!(credits && credits > 0) || !why.trim()}
          onPress={() => void give()}
        >
          Give them
        </Button>
      }
    >
      <Stack space="roomy">
        <NumberInput label="Credits" value={credits} min={1} onChange={setCredits} />
        <TextInput
          label="Why"
          value={why}
          onChange={setWhy}
          help="This is what they will read on their own statement."
        />
      </Stack>
    </Tray>
  );
}

/**
 * PUTTING A WORKSPACE ON A PLAN NOBODY IS PAYING FOR.
 *
 * ⚠️ THE COPY SAYS WHAT IT IS, because the control looks exactly like the
 * customer's own plan picker and is not one. Nothing is charged, no invoice
 * exists, and the workspace's credits come from our clock rather than Stripe's —
 * an operator who thinks they moved somebody onto a paid plan will wonder for a
 * month why no payment arrived.
 *
 * ⚠️ AND THE LOBBY IS THE WAY BACK. Comping the parking plan is how a comp ends;
 * a separate "un-comp" would be a second verb for the same write, which is how
 * the two come to disagree.
 */
function PlanTray({ tenant, plans, onDone }: {
  readonly tenant: TenantLine;
  readonly plans: readonly PlanSpec[];
  readonly onDone: () => void;
}) {
  const reader = useShown();
  const [pick, setPick] = useState(tenant.planId ?? "");

  const give = async () => {
    const out = await api.post("op.tenant.plan", { tenant: tenant.id, plan: pick });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${tenant.name} is on ${plans.find((p) => p.id === pick)?.name ?? pick}. Nothing was charged.`);
    onDone();
  };

  return (
    <Tray
      trigger={<Button variant="secondary">Give a plan</Button>}
      title={`Give ${tenant.name} a plan`}
      actions={
        <Button slot="close" variant="primary" isDisabled={!pick} onPress={() => void give()}>
          Give it
        </Button>
      }
    >
      <Stack space="roomy">
        {/* ⚠️ EVERY PLAN IS A ROW WITH ITS PRICE AND ITS CREDITS ON IT. An
            operator is choosing what to give away, and the two numbers that
            decide it are the ones the picker would hide. */}
        <Group label="What they get">
          {[...plans].sort((a, b) => a.order - b.order).map((plan) => (
            <AmountRow
              key={plan.id}
              label={plan.name}
              under={plan.parking
                ? "The lobby — this is how a comp ends"
                : `${sayNumber(reader, plan.credits)} credits a month`}
              amount={plan.id === pick ? "giving this" : "—"}
              aside={plan.id === pick
                ? undefined
                : <Button variant="ghost" onPress={() => setPick(plan.id)}>Choose</Button>}
            />
          ))}
        </Group>
        <span className={TYPE.note}>
          Nothing is charged and no invoice is raised. Their credits are granted
          on our own clock every month until somebody pays.
        </span>
      </Stack>
    </Tray>
  );
}
