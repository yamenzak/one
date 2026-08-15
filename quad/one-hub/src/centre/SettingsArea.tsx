/**
 * SETTINGS — generated from the declarations, two authorities on one screen.
 *
 * ⚠️ NO APP WROTE ANY OF THIS. Each product's declared settings render through
 * the platform's one Settings surface; the workspace's rows save with the
 * declaration's own `needs`, a person's rows are theirs. The notification
 * policy is the same two levels: the workspace sets a ceiling, you narrow your
 * own — same door, different authority, and the screen says which is which.
 */

import { useState } from "react";
import { Button, Card } from "@heroui/react";
import {
  Await, FormWaiting, LongText, NotificationPolicy, Row, Section, Settings, Stack, notice,
} from "@quad/web";
import { settingsOn } from "@quad/kernel";
import { api } from "../api.js";
import { useLoad, type CentreApp, type CentreView } from "./data.js";

export function SettingsArea({ view }: { readonly view: CentreView }) {
  return (
    <Stack space="roomy">
      <Section
        label="Settings"
        under="Workspace choices need workspace authority — yours are yours"
      >
        <Stack space="roomy">
          {view.apps.map((app) => <AppSettings key={app.id} view={view} app={app} />)}
        </Stack>
      </Section>

      <NotificationsSection view={view} />

      {view.you.platform.includes("tenant:manage")
        ? view.apps.map((app) => <Wording key={app.id} app={app} />)
        : null}
    </Stack>
  );
}

/* ----------------------------------------------------------------- wording --- */

interface WordingLine {
  readonly id: string;
  readonly summary: string;
  readonly variables: readonly string[];
  readonly declared: string;
  readonly prompt: string | null;
}

/**
 * ⚠️ ONLY WHAT THE PRODUCT SAID IS YOURS. The server sends the brandable
 * actions and nothing else, so this screen cannot offer a wording the write
 * would refuse — and a drafting tone being the workspace's while an extraction
 * rule is not is the product's decision, said once in its manifest.
 */
function Wording({ app }: { readonly app: CentreApp }) {
  const of = useLoad<{ items: readonly WordingLine[] }>("ai.wording", { app: app.id });

  return (
    <Await
      of={of.of}
      waiting={<FormWaiting fields={1} />}
      again={of.again}
      isNothing={(d) => d.items.length === 0}
      nothing={null}
      then={(data) => (
        <Section
          label={`${app.name} — in your own words`}
          under="What the AI features say on your behalf, when you want it said differently"
        >
          <Stack space="snug">
            {data.items.map((line) => (
              <WordingRow key={line.id} app={app} line={line} onDone={of.again} />
            ))}
          </Stack>
        </Section>
      )}
    />
  );
}

function WordingRow({ app, line, onDone }: {
  readonly app: CentreApp;
  readonly line: WordingLine;
  readonly onDone: () => void;
}) {
  const [text, setText] = useState(line.prompt ?? line.declared);

  const save = async (prompt: string | null) => {
    const out = await api.post("ai.word", { app: app.id, action: line.id, prompt });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(prompt === null ? "Back to the product's own words." : "Saved.");
    onDone();
  };

  return (
    <Card>
      <Card.Header>
        <Card.Title>{line.summary}</Card.Title>
        <Card.Description>
          {line.prompt ? "In your words" : "The product's own words"}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Stack space="snug">
          <LongText
            label="Instructions"
            value={text}
            onChange={setText}
            help={`It may name ${line.variables.map((v) => `{${v}}`).join(", ")} and nothing else.`}
          />
          <Row>
            <Button variant="primary" onPress={() => void save(text)}>Save</Button>
            {line.prompt
              ? (
                <Button variant="ghost" onPress={() => { setText(line.declared); void save(null); }}>
                  Use the product's words
                </Button>
              )
              : null}
          </Row>
        </Stack>
      </Card.Content>
    </Card>
  );
}

/* ---------------------------------------------------------------- settings --- */

interface StoredAnswer {
  readonly tenant: Readonly<Record<string, { value?: unknown; set?: boolean }>>;
  readonly person: Readonly<Record<string, { value?: unknown }>>;
}

function AppSettings({ view, app }: { readonly view: CentreView; readonly app: CentreApp }) {
  const stored = useLoad<StoredAnswer>("setting.read", { app: app.id });
  const held = new Set([...app.permissions]);

  const hasTenant = settingsOn(app.settings, "tenant").length > 0;
  const hasPerson = settingsOn(app.settings, "person").length > 0;
  if (!hasTenant && !hasPerson) return null;

  const write = async (id: string, value: unknown) => {
    const out = await api.post("setting.write", { app: app.id, id, value });
    if (!out.ok) { notice.fail(out.problem.title); stored.again(); return; }
    notice.ok("Saved.");
  };

  return (
    <Await
      of={stored.of}
      waiting={<FormWaiting fields={3} />}
      again={stored.again}
      then={(data) => (
        <Stack space="roomy">
          {hasTenant ? (
            <Section label={`${app.name} — this workspace`}>
              <Settings
                book={app.settings}
                level="tenant"
                stored={flat(data.tenant)}
                held={held}
                onChange={(id, value) => void write(id, value)}
              />
            </Section>
          ) : null}
          {hasPerson ? (
            <Section label={`${app.name} — just for you`}>
              <Settings
                book={app.settings}
                level="person"
                stored={flat(data.person)}
                held={held}
                onChange={(id, value) => void write(id, value)}
              />
            </Section>
          ) : null}
        </Stack>
      )}
    />
  );
}

/* The wire shape is `disclose`'s — `{value}` or `{set}` — and the screen reads
   a flat record. A secret never has a value here, by construction. */
const flat = (
  rows: Readonly<Record<string, { value?: unknown; set?: boolean }>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(rows)
    .filter(([, v]) => v.value !== undefined)
    .map(([k, v]) => [k, v.value]));

/* ----------------------------------------------------------- notifications --- */

interface PolicyAnswer {
  readonly policy: Readonly<Record<string, readonly ("inbox" | "email" | "push")[]>>;
  readonly preference: Readonly<Record<string, readonly ("inbox" | "email" | "push")[]>>;
}

function NotificationsSection({ view }: { readonly view: CentreView }) {
  const stored = useLoad<PolicyAnswer>("inbox.settings");
  const manage = view.you.platform.includes("tenant:manage");

  const narrow = async (id: string, channels: readonly string[]) => {
    const out = await api.post("inbox.preference", { type: id, channels });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Saved.");
    stored.again();
  };

  const ceiling = async (id: string, channels: readonly string[]) => {
    const out = await api.post("inbox.policy", { type: id, channels });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok("Saved for the whole workspace.");
    stored.again();
  };

  return (
    <Await
      of={stored.of}
      waiting={<FormWaiting fields={2} />}
      again={stored.again}
      then={(data) => (
        <Stack space="roomy">
          {view.apps.map((app) => {
            const held = new Set(app.permissions);
            return (
              <Stack key={app.id} space="roomy">
                <Section
                  label={`${app.name} — how you are told`}
                  under="Email and push you may refuse — the inbox keeps the record"
                >
                  <NotificationPolicy
                    book={app.notifications}
                    level="person"
                    policy={data.policy}
                    preference={data.preference}
                    held={held}
                    available={["inbox", "email", "push"]}
                    onChange={(id, channels) => void narrow(id, channels)}
                  />
                </Section>
                {manage ? (
                  <Section
                    label={`${app.name} — the workspace's ceiling`}
                    under="The ceiling everybody narrows their own settings under"
                  >
                    <NotificationPolicy
                      book={app.notifications}
                      level="tenant"
                      policy={data.policy}
                      preference={{}}
                      held={held}
                      available={["inbox", "email", "push"]}
                      onChange={(id, channels) => void ceiling(id, channels)}
                    />
                  </Section>
                ) : null}
              </Stack>
            );
          })}
        </Stack>
      )}
    />
  );
}
