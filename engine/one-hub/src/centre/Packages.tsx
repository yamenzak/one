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
  Agree, AmountRow, Await, Choice, Confirm, Group, MoneyInput, NumberInput, Picks, RowsWaiting,
  Nothing, Screen, Stack, TextInput, Tray, notice, money as saidMoney,
} from "@engine/design";
import { api } from "../api.js";
import { useLoad, type CentreApp, type CentreView, type PackageLine } from "./data.js";

export function Packages({ view }: { readonly view: CentreView }) {
  const [composing, setComposing] = useState(false);
  const [pass, bump] = useState(0);
  const mayNot = !view.you.platform.includes("member:manage");

  return (
    <>
      {/*
        ⚠️ ONE "COMPOSE A PACKAGE" FOR THE WHOLE SCREEN, NOT ONE PER PRODUCT.
        Every product's shelf used to carry its own, so a workspace with six
        products had six identical primary buttons down one page and none of
        them was THE action. Which product it goes on is a question the sheet
        asks — and only where there is more than one to ask about.
      */}
      <Screen
        shape="list"
        refused={mayNot
          ? {
            says: "Only an owner or a manager may sell packages",
            under: "Ask somebody who runs this workspace",
          }
          : undefined}
        does={mayNot ? undefined : { label: "Compose a package", onDo: () => setComposing(true) }}
      >
        {view.apps.map((app) => (
          <AppPackages key={`${app.id}:${pass}`} app={app} among={view.apps.length} />
        ))}
      </Screen>

      {composing
        ? (
          <ComposeTray
            apps={view.apps}
            onClose={() => setComposing(false)}
            onDone={() => { bump((n) => n + 1); setComposing(false); }}
          />
        )
        : null}
    </>
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
        /* ⚠️ THE WAY TO ADD IS THE SCREEN'S, NOT THIS BLOCK'S — see `Packages`.
           An empty shelf says what a package IS, because that is what somebody
           who has never made one needs, and the control is already docked
           under their thumb. */
        data.items.length === 0
          ? (
            <Nothing
              says={among > 1 ? `Nothing on sale for ${app.name}` : "Nothing on sale yet"}
              under="A package is what a customer buys: some access, a price, and a clock"
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

function ComposeTray({ apps, onDone, onClose }: {
  readonly apps: readonly CentreApp[];
  readonly onDone: () => void;
  readonly onClose: () => void;
}) {
  const [appId, setAppId] = useState(apps[0]?.id ?? "");
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | undefined>(500);
  const [period, setPeriod] = useState<number | undefined>(30);
  const [grace, setGrace] = useState<number | undefined>(3);
  const [grants, setGrants] = useState(NOTHING_PICKED);
  const [oncePer, setOncePer] = useState(false);

  const app = apps.find((a) => a.id === appId);

  const compose = async () => {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const out = await api.post("package.create", {
      app: appId, id, name: name.trim(),
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
    <Tray
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="A package"
      actions={
        <Button
          slot="close"
          variant="primary"
          isDisabled={!name.trim() || grants.length === 0 || !appId}
          onPress={() => void compose()}
        >
          Put it on the shelf
        </Button>
      }
    >
      <Stack space="roomy">
        {/* ⚠️ ASKED ONLY WHERE THERE IS SOMETHING TO ASK. A picker with one
            option is a decision somebody has to make and cannot get wrong,
            which is a decision that should not have been offered. */}
        {apps.length > 1
          ? (
            <Choice
              label="In which product"
              value={appId}
              onChange={(v) => { setAppId(v ?? ""); setGrants(NOTHING_PICKED); }}
              options={apps.map((a) => ({ id: a.id, label: a.name }))}
            />
          )
          : null}
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
          options={(app?.sellable ?? []).map((p) => ({ id: p, label: p }))}
        />
        <Agree label="One per customer" value={oncePer} onChange={setOncePer}
          help="A starter offer. The ledger remembers even after it lapses." />
      </Stack>
    </Tray>
  );
}
