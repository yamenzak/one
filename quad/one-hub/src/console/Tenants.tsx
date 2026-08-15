/**
 * TENANTS — every workspace, what it is on, and the one write that moves it.
 *
 * ⚠️ AN ADJUSTMENT IS ABSOLUTE AND EITHER DIRECTION, and it is deliberately not
 * the grandfathering column: that one holds a workspace at what it was sold and
 * only ratchets up, so a shared write would make "give this studio ten seats" a
 * one-way door. Clearing one key restores the plan's value, and clears nothing
 * else.
 */

import { useState } from "react";
import { Button, Card, Chip } from "@heroui/react";
import {
  Await, Choice, Listing, NumberInput, Stack, TableWaiting, Tray, notice, sentence,
} from "@quad/web";
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

export function Tenants() {
  const of = useLoad<{ items: readonly TenantLine[]; apps: readonly AppLine[] }>("op.tenants");

  return (
    /* ⚠️ The crown already says "Tenants" and what they are — see `Hub.tsx`.
       This drew both again, four lines under the first. */
    <Await
      of={of.of}
      waiting={<TableWaiting cols={4} rows={6} />}
      again={of.again}
      then={(data) => (
        <Listing
          label="Workspaces"
          of={{ status: "ready", data: data.items }}
          rowKey={(t) => t.id}
          says={{ nothing: "No workspaces yet", under: "The first one arrives through the setup door" }}
          /*
            ⚠️ FOUR COLUMNS IN A PHONE'S WIDTH IS NOT A TABLE — see `Listing`.
            "Northwind Strength" wrapped to two lines, "DE · eu-1" to two more,
            and the control column was off the edge. The same rows, with what
            identifies a workspace on one line and where it lives under it.
          */
          asRow={(t) => ({
            name: t.name,
            under: [t.slug, `${t.country} · ${t.shardId}`, standing(t)]
              .filter(Boolean).join(" · "),
            aside: <AdjustTray tenant={t} apps={data.apps} onDone={of.again} />,
          })}
          cols={[
            { id: "name", label: "Workspace", cell: (t) => t.name, by: (a, b) => a.name.localeCompare(b.name) },
            { id: "slug", label: "Address", cell: (t) => t.slug },
            { id: "where", label: "Where", cell: (t) => `${t.country} · ${t.shardId}` },
            {
              id: "plans", label: "On",
              /* ⚠️ AN APP ID IS NOT A NAME — see `sentence`. The column read
                 "kova: —" beside a workspace whose own name is capitalised. */
              cell: (t) => t.apps.length
                ? t.apps.map((a) => `${sentence(a.id)}: ${a.planId ?? "—"}`).join(" · ")
                : "—",
            },
            {
              id: "state", label: "",
              cell: (t) => t.closedAt
                ? <Chip color="danger" variant="soft"><Chip.Label>Closed</Chip.Label></Chip>
                : t.apps.some((a) => a.status === "past_due")
                  ? <Chip color="warning" variant="soft"><Chip.Label>Past due</Chip.Label></Chip>
                  : null,
            },
            {
              id: "act", label: "",
              cell: (t) => <AdjustTray tenant={t} apps={data.apps} onDone={of.again} />,
            },
          ]}
        />
      )}
    />
  );
}

/** ⚠️ The one word worth carrying to a phone row, and nothing when all is well. */
const standing = (t: TenantLine): string =>
  t.closedAt ? "closed" : t.apps.some((a) => a.status === "past_due") ? "past due" : "";

function AdjustTray({ tenant, apps, onDone }: {
  readonly tenant: TenantLine;
  readonly apps: readonly AppLine[];
  readonly onDone: () => void;
}) {
  const held = apps.filter((a) => tenant.apps.some((h) => h.id === a.id));
  const [appId, setAppId] = useState(held[0]?.id ?? "");
  const app = held.find((a) => a.id === appId) ?? held[0];
  const keys = Object.entries(app?.entitlements ?? {}).filter(([, d]) => !d.reserved);
  const [key, setKey] = useState(keys[0]?.[0] ?? "");
  const [value, setValue] = useState<number | undefined>(undefined);

  const write = async (next: number | null) => {
    const out = await api.post("op.tenant.adjust", { tenant: tenant.id, app: appId, key, value: next });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(next === null ? "Back to the plan's own number." : `${key} is ${next} for ${tenant.name}.`);
    onDone();
  };

  const current = tenant.apps.find((h) => h.id === appId)?.adjustments ?? {};

  return (
    <Tray
      trigger={<Button variant="ghost" aria-label={`Adjust ${tenant.name}`}>Adjust</Button>}
      title={tenant.name}
    >
      <Stack space="roomy">
        <Choice
          label="Product"
          value={appId}
          onChange={(v) => setAppId(v ?? appId)}
          options={held.map((a) => ({ id: a.id, label: a.name }))}
        />
        <Choice
          label="What to change"
          value={key}
          onChange={(v) => setKey(v ?? key)}
          options={keys.map(([id, def]) => ({ id, label: def.label }))}
        />
        <NumberInput
          label="To"
          value={value}
          onChange={setValue}
          help="Absolute, either direction. -1 is unlimited."
        />
        <Button
          variant="primary"
          isDisabled={value === undefined || !key || !appId}
          onPress={() => void write(value ?? 0)}
        >
          Set it
        </Button>
        {Object.keys(current).length ? (
          <Card>
            <Card.Header>
              <Card.Title>Adjusted already</Card.Title>
              <Card.Description>Clearing one puts the plan's own number back</Card.Description>
            </Card.Header>
            <Card.Content>
              <Stack space="tight">
                {Object.entries(current).map(([id, held2]) => (
                  <div key={id} className="flex items-center justify-between">
                    <span>{id}: {String(held2)}</span>
                    <Button variant="ghost" onPress={() => { setKey(id); void write(null); }}>Clear</Button>
                  </div>
                ))}
              </Stack>
            </Card.Content>
          </Card>
        ) : null}
      </Stack>
    </Tray>
  );
}
