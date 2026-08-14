/**
 * DATA & TRUST — what is held, who touches it, and the ways out.
 *
 * ⚠️ SAID PLAINLY OR NOT AT ALL. The legal documents and the sub-processor list
 * come from the manifests, so they cannot drift from what the products actually
 * do. The account-wide actions — export, leaving, closing — live at the account
 * centre because they are about YOU everywhere, and this screen says so instead
 * of duplicating them behind a second door.
 */

import { Button, Card } from "@heroui/react";
import { Documents, Section, Stack, SubProcessors } from "@quad/web";
import type { Where } from "../door.js";
import { accountUrl } from "../door.js";
import type { CentreView } from "./data.js";

export function Trust({ view, where }: {
  readonly view: CentreView;
  readonly where: Where | null;
}) {
  const documented = view.apps.filter((a) => Object.keys(a.documents).length > 0);
  const processing = view.apps.filter((a) => Object.keys(a.processors).length > 0);

  return (
    <Stack space="roomy">
      <Section
        label="Data & Trust"
        under="What is held about people, and the promises around it"
      >
        <Stack space="roomy">
          {documented.map((app) => (
            <Section key={app.id} label={`${app.name} — the documents`}>
              <Documents documents={Object.values(app.documents)} outstanding={[]} onAccept={() => {}} />
            </Section>
          ))}
          {processing.map((app) => (
            <Section
              key={app.id}
              label={`${app.name} — who else touches the data`}
              under="Every third party a fact can reach, named"
            >
              <SubProcessors book={app.processors} />
            </Section>
          ))}
          {!documented.length && !processing.length
            ? (
              <Card>
                <Card.Header>
                  <Card.Title>Nothing to disclose</Card.Title>
                  <Card.Description>
                    The products here declare no legal documents and no sub-processors.
                  </Card.Description>
                </Card.Header>
              </Card>
            )
            : null}
        </Stack>
      </Section>

      <Section
        label="You, everywhere"
        under="Export, sessions and closing cover every workspace, so they live there"
      >
        <Card>
          <Card.Content>
            <Button
              variant="secondary"
              onPress={() => { if (where) location.assign(accountUrl(where, location)); }}
            >
              Open your account
            </Button>
          </Card.Content>
        </Card>
      </Section>
    </Stack>
  );
}
