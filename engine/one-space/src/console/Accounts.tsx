/**
 * ACCOUNTS — everybody who has ever signed in here, and the way to one.
 *
 * ⚠️ THE CONSOLE COULD SEE EVERY WORKSPACE AND NOBODY IN ONE. A person is the
 * subject of half the support a deployment ever does — who are they, where do
 * they belong, what were they promised — and answering any of it meant knowing
 * a workspace first and reading its roster. So "give my friend a workspace"
 * began by typing an address into a form on a screen that listed no addresses,
 * with no way to tell a typo from somebody who had not signed up yet.
 *
 * ⚠️ IT IS A LIST AND NOTHING ELSE, like `Tenants`. A person is a subject and
 * gets a screen (`OneAccount.tsx`); what an operator can DO about them is there,
 * beside the facts the decision needs.
 *
 * ⚠️ AND IT CARRIES NO PRIMARY ACTION. An account is made by somebody asking for
 * a sign-in code, never by an operator — a "new person" button here would be a
 * control for a thing that does not exist. Giving something to an address that
 * has not signed up yet happens on the address's own screen, which is reachable
 * by typing it.
 */

import { Chip } from "@heroui/react";
import {
  Listing, Screen, TableWaiting, Tally, When, glyphOf, whoFace,
} from "@engine/design";
import type { Instant } from "@engine/kernel";
import { useLoad } from "../centre/data.js";

interface AccountLine {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly at: string;
  readonly workspaces: number;
  /** ⚠️ The bare commercial count an operator set — see `op.account.commercial`. */
  readonly granted: number;
  /** ⚠️ How many gifts are still LIVE, not how many were ever made. */
  readonly waiting: number;
  readonly operator: boolean;
}

interface Answer {
  readonly items: readonly AccountLine[];
}

export function Accounts({ onGo }: { readonly onGo: (email: string) => void }) {
  const of = useLoad<Answer>("op.accounts");
  const count = of.of.status === "ready" ? of.of.data.items.length : null;

  return (
    <Screen
      shape="list"
      /* ⚠️ HOW MANY THERE ARE IS A FACT ABOUT THE SCREEN, and it is the one
         number an operator quotes — the same rule the workspace list follows. */
      under={count === null
        ? undefined
        : <Tally value={count} format={(n) => `${n} on this deployment`} count />}
      of={of.of}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      waiting={<TableWaiting cols={4} rows={6} />}
      nothing={{
        icon: glyphOf("people"),
        says: "Nobody has signed in yet",
        under: "An account appears the first time somebody asks for a code",
      }}
      then={(data) => (
        <Listing
          label="Accounts"
          of={{ status: "ready", data: data.items }}
          rowKey={(a) => a.id}
          says={{ icon: glyphOf("people"), nothing: "Nobody has signed in yet" }}
          /* ⚠️ PAGING IS NOT FINDING. An operator arrives here holding an
             address somebody gave them over the phone; twenty presses through a
             deployment's whole customer list is not how they get to it. */
          find={{ label: "Find somebody", of: (a) => `${a.email} ${a.name ?? ""}` }}
          onOpen={(a) => onGo(a.email)}
          asRow={(a) => ({
            /* ⚠️ THE ADDRESS IS THE NAME, because most people have never set
               one. A row headed by a blank with the address underneath is a
               list of empty rows on the day a deployment opens. */
            name: a.name || a.email,
            /* ⚠️ SEEDED ON THE ACCOUNT, NEVER THE ADDRESS — see `whoFace`. A
               face that moved when somebody changed their email would be
               decoration; this is the same face they wear in every workspace. */
            face: whoFace(a.id),
            under: a.name ? a.email : undefined,
            /* ⚠️ WAITING OUTRANKS OPERATOR, because one is a thing to do and the
               other is a fact. A person holding a gift nobody has applied is the
               row somebody came to this screen for. */
            ...(a.waiting
              ? {
                aside: (
                  <Chip variant="soft">
                    <Chip.Label>{a.waiting === 1 ? "1 waiting" : `${a.waiting} waiting`}</Chip.Label>
                  </Chip>
                ),
              }
              : a.operator
                ? {
                  aside: (
                    <Chip color="accent" variant="soft"><Chip.Label>Operator</Chip.Label></Chip>
                  ),
                }
                : {}),
          })}
          cols={[
            {
              id: "who", label: "Who", cell: (a) => a.name || a.email,
              by: (x, y) => (x.name || x.email).localeCompare(y.name || y.email),
            },
            { id: "email", label: "Address", cell: (a) => a.email },
            {
              id: "workspaces", label: "In",
              cell: (a) => (a.workspaces === 1 ? "1 workspace" : `${a.workspaces} workspaces`),
              by: (x, y) => x.workspaces - y.workspaces,
            },
            {
              id: "since", label: "Since", cell: (a) => <When at={a.at as Instant} />,
              by: (x, y) => (x.at < y.at ? -1 : 1),
            },
            {
              id: "state", label: "",
              cell: (a) => (a.waiting
                ? <Chip variant="soft"><Chip.Label>{a.waiting} waiting</Chip.Label></Chip>
                : a.operator
                  ? <Chip color="accent" variant="soft"><Chip.Label>Operator</Chip.Label></Chip>
                  : null),
            },
          ]}
        />
      )}
    />
  );
}
