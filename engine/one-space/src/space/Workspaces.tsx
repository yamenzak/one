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
import {
  Group, Nothing, PersonRow, Screen, glyphOf, placeFace, sentence,
} from "@engine/design";
import { useSession } from "../session.js";
import { here, spaceAt, isHere, setupUrl, tenantUrl } from "../door.js";
import { pathOf, type Where } from "./where.js";

export function Workspaces({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { me, where } = useSession();
  const person = me && me !== "nobody" ? me : null;
  const belongs = person?.tenants ?? [];

  /*
    ⚠️ A WORKSPACE IS MANAGED AT ITS OWN ADDRESS, so opening one from anywhere
    else TRAVELS — and arrives with OneSpace already open on it. The alternative
    is a screen that loads here and refuses every call it makes, because its
    records and its operations are at the other origin.
  */
  const open = (slug: string) => {
    if (!where) return;
    if (isHere(slug, where)) { onGo({ at: "workspace", slug }); return; }
    location.assign(spaceAt(tenantUrl(slug, where, location), pathOf({ at: "workspace", slug })));
  };

  /* ⚠️ STARTING ONE IS ALWAYS OFFERED, AND THIS IS THE ONLY PLACE IT LIVES FOR
     SOMEBODY WHO IS ALREADY SIGNED IN. The signpost used to carry it and does
     not exist any more; the sign-in carries it for people with no session. A
     person with one workspace who wants a second had nowhere to go. */
  const start = () => { if (where) location.assign(setupUrl(where, here())); };

  return (
    /* ⚠️ `list`, and STARTING ONE IS THE PRIMARY. It used to be a `+` row under
       the list of workspaces you already belong to — which is a row somebody
       scrolls past on the way to nothing, since the list above it is the thing
       they came for. Declared, it docks and crowns like every other. */
    <Screen
      shape="list"
      does={{ label: "Start a workspace", onDo: start }}
    >
      {person && belongs.length === 0
        ? (
          /* ⚠️ THE MARK IS THE SCREEN'S OWN NOUN — a workspace, not a shrug. */
          <Nothing
            icon={glyphOf("workspace")}
            says="You are not in any workspace yet"
            under="An invitation arrives by email, and signing in as that address claims it"
          />
        )
        : (
          /* ⚠️ A FACE PER ROW, LIKE THE ROSTER AND LIKE THE HOME. A workspace is
             a thing with a name somebody recognises; a list of them with no mark
             is a list of strings, and it was the one list in OneSpace with no
             lead at all. */
          <Group>
            {belongs.map((w) => (
              <PersonRow
                key={w.slug}
                goes
                face={placeFace(w.slug)}
                name={w.name}
                under={said(w.apps, w.platformRole)}
                /* ⚠️ THE STANDING WINS OVER THE COUNT, because they are not
                   equally urgent: unread notes are a workspace to visit and a
                   failed payment is one about to stop working. Two chips on one
                   row would make the reader rank them, which is this row's job
                   rather than theirs. */
                /* ⚠️ AND `given` SITS BETWEEN THEM. It outranks a count for the
                   same reason arrears do — it is a fact about whether this
                   workspace keeps working — and is outranked by arrears, which
                   are about to stop it. */
                aside={w.attention
                  ? <Chip color="warning" variant="soft"><Chip.Label>Needs attention</Chip.Label></Chip>
                  : w.given
                    ? <Chip variant="soft"><Chip.Label>Given</Chip.Label></Chip>
                    : (w.unseen ?? 0) > 0
                      ? <Chip color="accent" variant="soft"><Chip.Label>{w.unseen}</Chip.Label></Chip>
                      : undefined}
                onOpen={() => open(w.slug)}
              />
            ))}
          </Group>
        )}
    </Screen>
  );
}

/** ⚠️ The role and the products, which is what the row is for — see the header. */
const said = (apps: readonly string[] | undefined, role: string | null | undefined): string => {
  /* ⚠️ AN APP ID IS NOT A NAME — see `sentence`. `me.who` carries ids because it
     answers before there is a tenancy to read manifests from, so every row read
     "hello · owner" on a screen where nothing else is lower case. */
  const products = (apps ?? []).map(sentence).join(" · ");
  /* ⚠️ AND SO IS A ROLE. The comment above described both halves of this line
     and the code sentence-cased one of them, so every row read "Hello · owner"
     — a product's name beside the key the roster stores. */
  const said = role ? sentence(role) : null;
  if (!said) return products || "Waiting for you to claim it";
  return products ? `${products} · ${said}` : said;
};
