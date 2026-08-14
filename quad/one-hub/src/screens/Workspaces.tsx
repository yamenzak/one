/**
 * YOUR WORKSPACES — the whole of the account door.
 *
 * ⚠️ THIS IS A LIST OF ADDRESSES, NOT A LIST OF THINGS TO OPEN IN PLACE. A
 * workspace is its own origin; going to one is a full page load, and the Hub
 * hands it over rather than trying to be it.
 *
 * ⚠️ LEAVING IS ALWAYS OFFERED. A person who cannot get out of a workspace they
 * were invited to is a person whose only route is asking whoever invited them.
 * The runtime refuses the one case that matters — the last person who can manage
 * members walking out would not close the workspace, it would make it
 * unreachable with the bill still running — and says so, so this screen does not
 * have to guess at it.
 */

import { useState } from "react";
import { Button, Card, Separator } from "@heroui/react";
import { Cluster, Row, SPACE, Stack, TYPE, Title, Trouble } from "@quad/web";
import type { Problem } from "@quad/kernel";
import { api } from "../api.js";
import { setupUrl, tenantUrl, type Where } from "../door.js";
import { useSession } from "../session.js";


export function Workspaces({ where }: { readonly where: Where }) {
  const { me, refresh, leave } = useSession();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  if (me === null || me === "nobody") return null;

  const depart = async (slug: string) => {
    setLeaving(slug);
    setProblem(null);
    const out = await api.post("me.leave", { slug });
    setLeaving(null);
    if (!out.ok) return setProblem(out.problem);
    await refresh();
  };

  return (
    <Stack space="roomy">
      <header className={`flex flex-wrap items-baseline ${SPACE.snug}`}>
        <Title>Your workspaces</Title>
        <span className={`${TYPE.note} ml-auto`}>{me.email}</span>
        <Button variant="ghost" onPress={() => { void leave(); }}>Sign out</Button>
      </header>

      {problem ? <Trouble problem={problem} /> : null}

      {me.tenants.length === 0
        ? (
          /* ⚠️ AN EMPTY LIST IS A FACT HERE, and it is only ever rendered once
             `me.who` has actually answered — see `session.tsx`. What it must not
             say is "you have none" when what happened is that we could not
             ask. */
          <Card>
            <Card.Header>
              <Card.Title>You are not in any workspace yet</Card.Title>
              <Card.Description>
                Start one, or open the invitation somebody sent you — signing in
                claims it automatically.
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <Button variant="primary" onPress={() => { location.assign(setupUrl(where, location)); }}>
                Start a workspace
              </Button>
            </Card.Content>
          </Card>
        )
        : (
          <div className={`flex flex-col ${SPACE.snug}`}>
            {me.tenants.map((t) => (
              <Card key={t.slug}>
                <Card.Header>
                  <Card.Title>{t.name}</Card.Title>
                  <Card.Description>{t.slug}.{where.root}</Card.Description>
                </Card.Header>
                <Card.Content>
                  <Cluster>
                    <Button
                      variant="primary"
                      onPress={() => { location.assign(tenantUrl(t.slug, where, location)); }}
                    >
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      isPending={leaving === t.slug}
                      onPress={() => { void depart(t.slug); }}
                    >
                      Leave
                    </Button>
                  </Cluster>
                </Card.Content>
              </Card>
            ))}

            <Separator />
            <Row>
              <Button variant="secondary" onPress={() => { location.assign(setupUrl(where, location)); }}>
                Start another workspace
              </Button>
            </Row>
          </div>
        )}
    </Stack>
  );
}
