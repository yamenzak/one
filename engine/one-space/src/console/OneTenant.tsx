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
  AmountRow, ControlRow, Credits, Group, Identity, NumberInput, Row, RowsWaiting, Screen,
  Stack, TextInput, Tray, appFace, notice, placeFace, sentence,
} from "@engine/design";
import type { Allowance, EntitlementDef, PlanSpec } from "@engine/kernel";
import { isBusiness } from "@engine/kernel";
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
  readonly adjustments: Readonly<Record<string, Allowance>>;
  readonly apps: readonly Held[];
}

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
      nothing={{ says: "No such workspace", under: "It may have been closed since this list was read" }}
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
              aside={tenant.closedAt
                ? <Chip color="danger" variant="soft"><Chip.Label>Closed</Chip.Label></Chip>
                : isBusiness(tenant.kind ?? "personal")
                  ? <Chip variant="soft"><Chip.Label>{tenant.legalName || "A business"}</Chip.Label></Chip>
                  : undefined}
            />

            {/* ⚠️ THE MEMBERSHIP IS ONE ROW ABOVE THE PRODUCTS, because it is
                one row of truth. Drawn per product it was the same plan four
                times, and the adjustment tray beside each of them wrote to the
                same place. */}
            <Group label="Membership">
              <ControlRow
                label={data.plans.find((p) => p.id === tenant.planId)?.name ?? "No plan"}
                under={[
                  tenant.status === "past_due" ? "payment failed" : tenant.status ?? "",
                  Object.keys(tenant.adjustments).length
                    ? `${Object.keys(tenant.adjustments).length} adjusted`
                    : "",
                ].filter(Boolean).join(" · ")}
              >
                <AdjustTray tenant={tenant} apps={data.apps} onDone={of.again} />
              </ControlRow>
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
              {tenant.apps.length === 0
                ? <ControlRow label="No product here"><span /></ControlRow>
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
  const [key, setKey] = useState(keys[0]?.[0] ?? "");
  const [value, setValue] = useState<number | undefined>(undefined);
  const label = keys.find(([id]) => id === key)?.[1]?.label ?? key;

  const write = async (next: number | null, which = key) => {
    const out = await api.post("op.tenant.adjust", { tenant: tenant.id, key: which, value: next });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(next === null ? "Back to the plan's own number." : `${which} is ${next} for ${tenant.name}.`);
    onDone();
  };

  return (
    <Tray
      trigger={<Button variant="ghost">Adjust</Button>}
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
              amount={tenant.adjustments[id] === undefined ? "—" : String(tenant.adjustments[id])}
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
          help="Absolute, either direction. -1 is unlimited."
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
  const of = useLoad<MoneyLine>("op.tenant.money", { tenant: tenant.id });

  if (of.of.status !== "ready") {
    return (
      <Group label="Wallet">
        <RowsWaiting rows={2} />
      </Group>
    );
  }
  const { wallet, auto, statement } = of.of.data;

  return (
    <>
      <Group label="Wallet">
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
        {/* ⚠️ AND WHY A STANDING CHARGE LAST FAILED. It is the answer to the
            question the customer is about to ask, and nobody was present when
            the bank gave it. */}
        {auto.error ? (
          <AmountRow
            tone="warning"
            label={auto.error}
            under="Their standing top-up did not go through"
            amount={<Credits value={auto.below} as="inline" />}
          />
        ) : null}
        <ControlRow label="Give them credits" under="Lands where a purchase does, and never expires">
          <CompTray tenant={tenant} onDone={of.again} />
        </ControlRow>
      </Group>

      {statement.length > 0 ? (
        <Group label="Recent movements">
          {statement.slice(0, 10).map((m, i) => (
            <AmountRow
              key={`${m.at}-${i}`}
              label={m.reason}
              under={new Date(m.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
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
      trigger={<Button variant="ghost">Give credits</Button>}
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
