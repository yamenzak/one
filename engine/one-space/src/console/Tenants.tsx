/**
 * WORKSPACES — every one on this deployment, and the way into one.
 *
 * ⚠️ IT IS A LIST AND NOTHING ELSE. It used to carry the whole of a workspace's
 * administration in a tray hanging off a table cell — a product picker, an
 * entitlement picker, a number and a list of what had already been moved. A
 * workspace is a subject; it gets a screen (`OneTenant.tsx`).
 *
 * ⚠️ AND THE STANDING IS READ FROM THE WORKSPACE, WHICH IS WHERE IT LIVES. This
 * asked each PRODUCT for a status — `t.apps.some((a) => a.status === "past_due")`
 * — and `op.tenants` has answered apps as `{id, on}` since the membership moved
 * to the workspace. So the field was always `undefined`: the chip could not
 * appear, the phone row could not say "past due", and the plan column read `—`
 * for every workspace on the deployment. The local interface declared the fields
 * the payload does not carry, so nothing could typecheck it and nothing did.
 *
 * ⚠️ THE SHAPE HERE IS THE PAYLOAD'S SHAPE NOW, and that is the fix rather than
 * the two lines. A hand-written interface beside a call is a promise nobody
 * checks; one that promises MORE than the answer is a screen that reads
 * `undefined` and draws it as a fact.
 */

import { Chip } from "@heroui/react";
import { Listing, Screen, TableWaiting, Tally, glyphOf, placeFace, sentence } from "@engine/design";
import type { EntitlementDef, PlanSpec } from "@engine/kernel";
import { useLoad } from "../centre/data.js";

/** ⚠️ A product this workspace has, and whether it is switched on. Nothing else
    hangs here: the plan, the standing and the adjustments are the WORKSPACE's. */
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
  readonly closedAt: string | null;
  /** ⚠️ ONE MEMBERSHIP, AT THE WORKSPACE — see the header. */
  readonly planId: string | null;
  readonly status: string | null;
  /** ⚠️ Given rather than bought; the two look identical without it. */
  readonly compedAt: string | null;
  readonly apps: readonly Held[];
}

interface AppLine {
  readonly id: string;
  readonly name: string;
  readonly mark: string;
  readonly entitlements: Readonly<Record<string, EntitlementDef>>;
}

interface Answer {
  readonly items: readonly TenantLine[];
  readonly apps: readonly AppLine[];
  readonly plans: readonly PlanSpec[];
}

/**
 * ⚠️ THE ONE WORD WORTH CARRYING, AND NOTHING WHEN ALL IS WELL. Closed wins over
 * behind: a workspace that has left is not a payment problem, and saying both
 * makes neither of them the answer.
 */
const standing = (t: TenantLine): "closed" | "past_due" | "given" | null =>
  t.closedAt ? "closed"
    : t.status === "past_due" ? "past_due"
      : t.compedAt ? "given"
        : null;

const SAID: Readonly<Record<string, string>> = {
  closed: "Closed", past_due: "Behind", given: "Given",
};

const TONE: Readonly<Record<string, "default" | "warning" | "danger">> = {
  closed: "danger", past_due: "warning", given: "default",
};

export function Tenants({ onGo }: { readonly onGo: (id: string) => void }) {
  const of = useLoad<Answer>("op.tenants");
  const count = of.of.status === "ready" ? of.of.data.items.length : null;

  return (
    /* ⚠️ `list`, and it carries NO primary action — a workspace is created by
       somebody signing up at the setup door, never by an operator. A "new
       workspace" button here would be a control for a thing that does not
       exist, which is worse than an absent one. */
    <Screen
      shape="list"
      /* ⚠️ HOW MANY THERE ARE IS A FACT ABOUT THE SCREEN, so it goes under the
         title. It is also the one number an operator quotes. */
      under={count === null
        ? undefined
        : <Tally value={count} format={(n) => `${n} on this deployment`} count />}
      of={of.of}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      waiting={<TableWaiting cols={4} rows={6} />}
      nothing={{
        icon: glyphOf("workspace"),
        says: "No workspaces yet",
        under: "The first one arrives through the setup door",
      }}
      then={(data) => {
        const planOf = (t: TenantLine): string =>
          data.plans.find((p) => p.id === t.planId)?.name ?? t.planId ?? "—";

        return (
          <Listing
            label="Workspaces"
            of={{ status: "ready", data: data.items }}
            rowKey={(t) => t.id}
            says={{ icon: glyphOf("workspace"), nothing: "No workspaces yet" }}
            /* ⚠️ PAGING IS NOT FINDING. Ten a page over a deployment's whole
               customer list is twenty presses to reach a name somebody already
               knows — and the name, the address and the country are the three
               things they would type. */
            find={{
              label: "Find a workspace",
              of: (t) => `${t.name} ${t.slug} ${t.country} ${t.shardId}`,
            }}
            /*
              ⚠️ FOUR COLUMNS IN A PHONE'S WIDTH IS NOT A TABLE — see `Listing`.
              "Northwind Strength" wrapped to two lines, "DE · eu-1" to two more,
              and the control column was off the edge. The same rows, with what
              identifies a workspace on one line and where it lives under it.
            */
            onOpen={(t) => onGo(t.id)}
            asRow={(t) => {
              const state = standing(t);
              return {
                name: t.name,
                face: placeFace(t.slug),
                under: `${t.slug} · ${t.country} · ${planOf(t)}`,
                /* ⚠️ THE STATE IS A CHIP IN THE CORNER RATHER THAN THE LAST WORD
                   OF A DOT-RUN. An operator scanning a list is looking for the
                   one that is wrong, and a word at the end of a grey sentence is
                   the one place it cannot be seen. */
                ...(state
                  ? {
                    aside: (
                      <Chip color={TONE[state]} variant="soft">
                        <Chip.Label>{SAID[state]}</Chip.Label>
                      </Chip>
                    ),
                  }
                  : {}),
              };
            }}
            cols={[
              {
                id: "name", label: "Workspace", cell: (t) => t.name,
                by: (a, b) => a.name.localeCompare(b.name),
              },
              { id: "slug", label: "Address", cell: (t) => t.slug },
              { id: "where", label: "Where", cell: (t) => `${t.country} · ${t.shardId}` },
              /* ⚠️ ONE MEMBERSHIP, NAMED. This listed a plan per product — a
                 shape that ended when plans moved to the workspace — and read a
                 field the answer does not carry, so every row said `—`. */
              { id: "plan", label: "On", cell: planOf },
              {
                id: "products", label: "Products",
                cell: (t) => t.apps.length
                  ? t.apps.map((a) => {
                    const app = data.apps.find((x) => x.id === a.id);
                    /* ⚠️ AN APP ID IS NOT A NAME, and `sentence` is the last
                       resort for a product this deployment no longer serves. */
                    return `${app?.name ?? sentence(a.id)}${a.on ? "" : " (off)"}`;
                  }).join(" · ")
                  : "—",
              },
              {
                id: "state", label: "",
                cell: (t) => {
                  const state = standing(t);
                  return state
                    ? <Chip color={TONE[state]} variant="soft"><Chip.Label>{SAID[state]}</Chip.Label></Chip>
                    : null;
                },
              },
            ]}
          />
        );
      }}
    />
  );
}
