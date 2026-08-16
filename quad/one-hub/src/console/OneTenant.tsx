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
  AmountRow, ControlRow, Group, Identity, NumberInput, RowsWaiting, Screen, Stack, Tray,
  appFace, notice, placeFace, sentence,
} from "@quad/design";
import type { Allowance, EntitlementDef, PlanSpec } from "@quad/kernel";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

interface Held {
  readonly id: string;
  readonly planId: string | null;
  readonly status: string | null;
  readonly adjustments: Readonly<Record<string, Allowance>>;
}

interface TenantLine {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string;
  readonly shardId: string;
  readonly closedAt: string | null;
  readonly apps: readonly Held[];
}

interface AppLine {
  readonly id: string;
  readonly name: string;
  readonly mark: string;
  readonly entitlements: Readonly<Record<string, EntitlementDef>>;
  readonly plans: readonly PlanSpec[];
}

export function OneTenant({ id }: { readonly id: string }) {
  const of = useLoad<{ items: readonly TenantLine[]; apps: readonly AppLine[] }>("op.tenants");

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
              aside={tenant.closedAt
                ? <Chip color="danger" variant="soft"><Chip.Label>Closed</Chip.Label></Chip>
                : undefined}
            />

            <Group>
              {tenant.apps.map((held) => {
                const app = data.apps.find((a) => a.id === held.id);
                const moved = Object.keys(held.adjustments).length;
                return (
                  <ControlRow
                    key={held.id}
                    face={appFace(held.id, app?.mark)}
                    label={app?.name ?? sentence(held.id)}
                    under={[
                      held.planId ?? "no plan",
                      held.status === "past_due" ? "payment failed" : "",
                      moved ? `${moved} adjusted` : "",
                    ].filter(Boolean).join(" · ")}
                  >
                    {app
                      ? <AdjustTray tenant={tenant} app={app} held={held} onDone={of.again} />
                      : null}
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
 * ⚠️ THE SHEET IS PER PRODUCT NOW, so the product picker is gone — the row it
 * opened from already said which one. One less decision in a place somebody is
 * typing a number under pressure.
 */
function AdjustTray({ tenant, app, held, onDone }: {
  readonly tenant: TenantLine;
  readonly app: AppLine;
  readonly held: Held;
  readonly onDone: () => void;
}) {
  const keys = Object.entries(app.entitlements).filter(([, d]) => !d.reserved);
  const [key, setKey] = useState(keys[0]?.[0] ?? "");
  const [value, setValue] = useState<number | undefined>(undefined);

  const write = async (next: number | null, which = key) => {
    const out = await api.post("op.tenant.adjust", { tenant: tenant.id, app: app.id, key: which, value: next });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(next === null ? "Back to the plan's own number." : `${which} is ${next} for ${tenant.name}.`);
    onDone();
  };

  return (
    <Tray
      trigger={<Button variant="ghost">Adjust</Button>}
      title={`${app.name} for ${tenant.name}`}
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
              amount={held.adjustments[id] === undefined ? "—" : String(held.adjustments[id])}
              aside={held.adjustments[id] === undefined
                ? <Button variant="ghost" onPress={() => setKey(id)}>Change</Button>
                : <Button variant="ghost" onPress={() => void write(null, id)}>Clear</Button>}
            />
          ))}
        </Group>
        <NumberInput
          label={`New number for ${app.entitlements[key]?.label ?? key}`}
          value={value}
          onChange={setValue}
          help="Absolute, either direction. -1 is unlimited."
        />
      </Stack>
    </Tray>
  );
}
