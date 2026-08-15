/**
 * WORKSPACES — everywhere you belong, across every product.
 *
 * ⚠️ IT IS A LIST RATHER THAN A GRID, AND THE SECOND LINE IS THE REASON. A
 * product has a mark and a name; a workspace has a ROLE and a STANDING —
 * "Kova · owner", "Payment failed" — and those are what somebody scans for. A
 * grid of marks would hide the one thing that makes this list worth opening.
 *
 * ⚠️ AND A ROW OPENS THE WORKSPACE'S OWN SCREEN, NOT THE PRODUCT. For as long
 * as every row left for another origin, the one place somebody could see all
 * their workspaces was the one place they could do nothing about any of them.
 * Opening the product is still one press, from in there, where it is a decision
 * rather than the only thing the row does.
 */

import { Chip } from "@heroui/react";
import { Group, NavRow, Nothing, Stack } from "@quad/web";
import { useSession } from "../session.js";
import { hubAt, isHere, tenantUrl } from "../door.js";
import { pathOf, type Where } from "./where.js";

export function Workspaces({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { me, where } = useSession();
  const person = me && me !== "nobody" ? me : null;
  const belongs = person?.tenants ?? [];

  /*
    ⚠️ A WORKSPACE IS MANAGED AT ITS OWN ADDRESS, so opening one from anywhere
    else TRAVELS — and arrives with the hub already open on it. The alternative
    is a screen that loads here and refuses every call it makes, because its
    records and its operations are at the other origin.
  */
  const open = (slug: string) => {
    if (!where) return;
    if (isHere(slug, where)) { onGo({ at: "workspace", slug }); return; }
    location.assign(hubAt(tenantUrl(slug, where, location), pathOf({ at: "workspace", slug })));
  };

  if (person && belongs.length === 0) {
    return (
      <Nothing
        says="You are not in any workspace yet"
        under="An invitation arrives by email, and signing in as that address claims it"
      />
    );
  }

  return (
    <Stack space="roomy">
      <Group>
        {belongs.map((w) => (
          <NavRow
            key={w.slug}
            label={w.name}
            under={said(w.apps, w.platformRole)}
            aside={w.attention
              ? <Chip color="warning" variant="soft"><Chip.Label>Needs attention</Chip.Label></Chip>
              : undefined}
            onOpen={() => open(w.slug)}
          />
        ))}
      </Group>
    </Stack>
  );
}

/** ⚠️ The role and the products, which is what the row is for — see the header. */
const said = (apps: readonly string[] | undefined, role: string | null | undefined): string => {
  const products = (apps ?? []).join(" · ");
  if (!role) return products || "Waiting for you to claim it";
  return products ? `${products} · ${role}` : role;
};
