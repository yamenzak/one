/**
 * TENANTS — every workspace on this deployment, and the way into one.
 *
 * ⚠️ IT IS A LIST AND NOTHING ELSE. It used to carry the whole of a workspace's
 * administration in a tray hanging off a table cell — a product picker, an
 * entitlement picker, a number and a list of what had already been moved. A
 * workspace is a subject; it gets a screen (`OneTenant.tsx`).
 */

import { Chip } from "@heroui/react";
import { Listing, Screen, TableWaiting, glyphOf, placeFace, sentence } from "@engine/design";
import type { Allowance, EntitlementDef, PlanSpec } from "@engine/kernel";
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

export function Tenants({ onGo }: { readonly onGo: (id: string) => void }) {
  const of = useLoad<{ items: readonly TenantLine[]; apps: readonly AppLine[] }>("op.tenants");

  return (
    /* ⚠️ `list`, and it carries NO primary action — a workspace is created by
       somebody signing up at the setup door, never by an operator. A "new
       workspace" button here would be a control for a thing that does not
       exist, which is worse than an absent one. */
    <Screen
      shape="list"
      of={of.of}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      waiting={<TableWaiting cols={4} rows={6} />}
      nothing={{
        icon: glyphOf("workspace"),
        says: "No workspaces yet",
        under: "The first one arrives through the setup door",
      }}
      then={(data) => (
        <Listing
          label="Workspaces"
          of={{ status: "ready", data: data.items }}
          rowKey={(t) => t.id}
          says={{ icon: glyphOf("workspace"), nothing: "No workspaces yet" }}
          /*
            ⚠️ FOUR COLUMNS IN A PHONE'S WIDTH IS NOT A TABLE — see `Listing`.
            "Northwind Strength" wrapped to two lines, "DE · eu-1" to two more,
            and the control column was off the edge. The same rows, with what
            identifies a workspace on one line and where it lives under it.
          */
          onOpen={(t) => onGo(t.id)}
          asRow={(t) => ({
            name: t.name,
            face: placeFace(t.slug),
            under: [t.slug, `${t.country} · ${t.shardId}`, standing(t)]
              .filter(Boolean).join(" · "),
          })}
          cols={[
            { id: "name", label: "Workspace", cell: (t) => t.name, by: (a, b) => a.name.localeCompare(b.name) },
            { id: "slug", label: "Address", cell: (t) => t.slug },
            { id: "where", label: "Where", cell: (t) => `${t.country} · ${t.shardId}` },
            {
              id: "plans", label: "On",
              /* ⚠️ AN APP ID IS NOT A NAME, AND `sentence` WAS ONLY THE SECOND
                 BEST ANSWER. It capitalises a key — right for "hello", wrong for
                 anything hyphenated or capitalised in its own manifest — and the
                 answer already carries every product's DECLARED name beside the
                 workspaces. Looked up, this column says what the product calls
                 itself; `sentence` stays as the last resort for a product this
                 deployment no longer serves. */
              cell: (t) => t.apps.length
                ? t.apps.map((a) => {
                  const app = data.apps.find((x) => x.id === a.id);
                  return `${app?.name ?? sentence(a.id)}: ${a.planId ?? "—"}`;
                }).join(" · ")
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
          ]}
        />
      )}
    />
  );
}

/** ⚠️ The one word worth carrying to a phone row, and nothing when all is well. */
const standing = (t: TenantLine): string =>
  t.closedAt ? "closed" : t.apps.some((a) => a.status === "past_due") ? "past due" : "";
