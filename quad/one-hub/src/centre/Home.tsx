/**
 * HOME — where a workspace day starts.
 *
 * ⚠️ CROSS-APP, WHICH IS THE POINT OF THE CENTRE. The products a workspace has
 * switched on, what arrived while you were away, and who you are here — one
 * glance, then a tap into the product where the actual work is.
 */

import { Button, Card, Chip } from "@heroui/react";
import { Grid, Section, Stack, Title } from "@quad/web";
import type { CentreView } from "./data.js";

export function Home({ view, unread, onGo }: {
  readonly view: CentreView;
  readonly unread: number | null;
  readonly onGo: (path: string) => void;
}) {
  const role = view.you.platformRole;

  return (
    <Stack space="roomy">
      <Title under={roleSaid(role)}>{view.tenant.name}</Title>

      {/* ⚠️ Zero is texture, and unknown is nothing — never a confident "0". */}
      {unread ? (
        <Card>
          <Card.Header>
            <Card.Title>While you were away</Card.Title>
            <Card.Description>
              {unread === 1 ? "One thing happened." : `${unread} things happened.`}
            </Card.Description>
          </Card.Header>
          <Card.Footer>
            <Button variant="primary" onPress={() => onGo("/inbox")}>Open your inbox</Button>
          </Card.Footer>
        </Card>
      ) : null}

      <Section label="Your products" under="One roster, one bill, one door — shared by everything here">
        <Grid min="14rem">
          {view.apps.map((app) => (
            <Card key={app.id}>
              <Card.Header>
                <Card.Title>{app.mark} {app.name}</Card.Title>
                {view.you.appRoles[app.id]
                  ? (
                    <Card.Description>
                      You are {an(view.you.appRoles[app.id]!)} here.
                    </Card.Description>
                  )
                  : <Card.Description>You are not a user of this one.</Card.Description>}
              </Card.Header>
              <Card.Footer>
                <Button variant="secondary" onPress={() => onGo(`/${app.id}`)}>
                  Open {app.name}
                </Button>
              </Card.Footer>
            </Card>
          ))}
        </Grid>
      </Section>

      {role === "owner" || role === "manager" ? (
        <Section label="Run the workspace">
          <Grid min="14rem">
            <Card>
              <Card.Header>
                <Card.Title>People</Card.Title>
                <Card.Description>Invite somebody, change a role, sell a package.</Card.Description>
              </Card.Header>
              <Card.Footer>
                <Button variant="secondary" onPress={() => onGo("/people")}>Open People</Button>
              </Card.Footer>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Money</Card.Title>
                <Card.Description>Your plan, your bill, your credits.</Card.Description>
              </Card.Header>
              <Card.Footer>
                <Button variant="secondary" onPress={() => onGo("/money")}>Open Money</Button>
              </Card.Footer>
            </Card>
          </Grid>
        </Section>
      ) : null}

      {role ? (
        <Chip color="default" variant="soft">
          <Chip.Label>Signed in as {view.you.email ?? "you"}</Chip.Label>
        </Chip>
      ) : null}
    </Stack>
  );
}

const roleSaid = (role: string | null): string => {
  switch (role) {
    case "owner": return "You run this workspace.";
    case "manager": return "You run the roster and the settings here.";
    case "staff": return "You are on the team.";
    case "customer": return "Welcome back.";
    default: return "";
  }
};

const an = (word: string): string =>
  `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
