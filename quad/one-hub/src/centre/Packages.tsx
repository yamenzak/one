/**
 * PACKAGES — what this workspace sells to its own customers.
 *
 * ⚠️ IT IS A CATALOGUE, AND IT LEFT THE ROSTER. Composing a package is the same
 * gesture as composing a role with a clock on it (D16) — which is an argument
 * about the mechanism, not about the screen. A roster answers "who works here";
 * this answers "what do we sell". One control changes a person's access and the
 * other changes a price.
 *
 * ⚠️ ONE LIST ACROSS EVERY PRODUCT, NOT ONE CARD EACH. Six products meant six
 * cards, most of them holding an empty state and a button — so the screen was
 * mostly furniture. The product a package belongs to is a fact about the row.
 */

import { useState } from "react";
import { Button, Chip } from "@heroui/react";
import {
  Agree, AmountRow, Await, Confirm, Group, MoneyInput, NumberInput, Picks, RowsWaiting, Nothing, Stack,
  TextInput, Tray, glyphOf, NavRow, notice, money as saidMoney,
} from "@quad/web";
import { api } from "../api.js";
import { useLoad, type CentreApp, type CentreView, type PackageLine } from "./data.js";

export function Packages({ view }: { readonly view: CentreView }) {
  if (!view.you.platform.includes("member:manage")) {
    return (
      <Nothing
        says="Only an owner or a manager may sell packages"
        under="Ask somebody who runs this workspace"
      />
    );
  }
  return (
    <Stack space="roomy">
      {view.apps.map((app) => <AppPackages key={app.id} app={app} among={view.apps.length} />)}
    </Stack>
  );
}

function AppPackages({ app, among }: { readonly app: CentreApp; readonly among: number }) {
  const sold = useLoad<{ items: readonly PackageLine[] }>("package.list", { app: app.id });

  return (
    <Await
      of={sold.of}
      waiting={<RowsWaiting rows={2} />}
      again={sold.again}
      then={(data) => (
        /* ⚠️ AN EMPTY SHELF IS AN EMPTY STATE WITH THE WAY OUT IN IT, not a card
           holding one button (DESIGN.md §4). Once there is anything to list, the
           way to add another is the last row of the list — which is where every
           "make a new one" in this hub sits. */
        data.items.length === 0
          ? (
            <Nothing
              says={among > 1 ? `Nothing on sale for ${app.name}` : "Nothing on sale yet"}
              under="A package is what a customer buys: some access, a price, and a clock"
              does={<ComposeTray app={app} onDone={sold.again} first />}
            />
          )
          : (
            /* ⚠️ The product's name only where there is more than one of them. */
            <Group label={among > 1 ? app.name : undefined}>
              {data.items.map((p) => (
                <AmountRow
                  key={p.id}
                  label={p.name}
                  under={`Every ${p.periodDays} days`}
                  amount={saidMoney(p.priceCents, p.currency)}
                  aside={<ArchiveButton app={app} pkg={p} onDone={sold.again} />}
                />
              ))}
              <ComposeTray app={app} onDone={sold.again} />
            </Group>
          )
      )}
    />
  );
}

function ArchiveButton({ app, pkg, onDone }: {
  readonly app: CentreApp; readonly pkg: PackageLine; readonly onDone: () => void;
}) {
  const archive = async () => {
    const out = await api.post("package.archive", { id: pkg.id, app: app.id });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${pkg.name} is off the shelf. Live holdings run out their clock.`);
    onDone();
  };
  return (
    <Confirm
      trigger={<Button variant="ghost">Stop selling</Button>}
      title={`Stop selling ${pkg.name}?`}
      act={{ label: "Stop selling", onDo: () => void archive() }}
    >
      Nobody new can buy it. Anybody holding it keeps it until their time runs out.
    </Confirm>
  );
}

/* ⚠️ A SELECTION'S EMPTY IS A FACT, NOT A LOADING STATE. Nothing is picked
   until the person picks it — this is form input, and the `Loaded` rule is
   about answers that have not arrived. */
const NOTHING_PICKED: readonly string[] = [];

function ComposeTray({ app, onDone, first }: {
  readonly app: CentreApp;
  readonly onDone: () => void;
  /** ⚠️ The first one is a decision on an empty screen; the rest are a row. */
  readonly first?: boolean;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | undefined>(500);
  const [period, setPeriod] = useState<number | undefined>(30);
  const [grace, setGrace] = useState<number | undefined>(3);
  const [grants, setGrants] = useState(NOTHING_PICKED);
  const [oncePer, setOncePer] = useState(false);

  const compose = async () => {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const out = await api.post("package.create", {
      app: app.id, id, name: name.trim(),
      priceCents: price ?? 0, currency: "EUR",
      periodDays: period ?? 30, graceDays: grace ?? 3,
      grants, oncePer,
    });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(`${name.trim()} is on the shelf.`);
    setName(""); setGrants(NOTHING_PICKED);
    onDone();
  };

  return (
    <div>
      <Tray
        /* ⚠️ ON AN EMPTY SHELF IT IS THE DECISION AND WEARS `primary`; under a
           list it is one more row, the way every "make a new one" in this hub
           is a row at the foot of the list it adds to. */
        trigger={first
          ? <Button variant="primary">Compose a package</Button>
          : <NavRow icon={glyphOf("add")} label="Compose a package" />}
        title={`A package in ${app.name}`}
        actions={
          <Button
            slot="close"
            variant="primary"
            isDisabled={!name.trim() || grants.length === 0}
            onPress={() => void compose()}
          >
            Put it on the shelf
          </Button>
        }
      >
        <Stack space="roomy">
          <TextInput label="Name" value={name} onChange={setName} placeholder="Strength coaching" />
          <MoneyInput label="Price" currency="EUR" value={price} onChange={setPrice}
            help="Zero is a real price — a free package works the same way." />
          <NumberInput label="Days one purchase buys" value={period} onChange={setPeriod} min={1} />
          <NumberInput label="Grace days" value={grace} onChange={setGrace} min={0}
            help="After expiry it still works this long, while both sides are told." />
          <Picks
            label="What holding it lets them do"
            value={grants}
            onChange={setGrants}
            options={app.sellable.map((p) => ({ id: p, label: p }))}
          />
          <Agree label="One per customer" value={oncePer} onChange={setOncePer}
            help="A starter offer. The ledger remembers even after it lapses." />
        </Stack>
      </Tray>
    </div>
  );
}
