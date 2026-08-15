/**
 * SWITCHES — our own flags, and the one that closes every door.
 *
 * ⚠️ MAINTENANCE IS ABOUT US, AND THE COPY HAS TO SAY SO. Nobody reading the
 * notice did anything and nobody can pay to end it — so the screen names what
 * it withholds and from whom, rather than offering a mode picker with three
 * words in it.
 *
 * ⚠️ AND `readonly` IS THE ONE WORTH REACHING FOR. Reads keep serving, so
 * people find their records where they left them; only the writes wait.
 */

import { Button, Card, Chip } from "@heroui/react";
import { Await, FlagConsole, Section, Stack, RowsWaiting, notice } from "@quad/web";
import type { FlagBook } from "@quad/kernel";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

interface FlagsAnswer {
  readonly books: Readonly<Record<string, FlagBook>>;
  readonly deployment: Readonly<Record<string, boolean>>;
}

const MODES: readonly { readonly id: "off" | "readonly" | "full"; readonly label: string; readonly said: string }[] = [
  { id: "off", label: "Open", said: "Everything is serving" },
  { id: "readonly", label: "Reading only", said: "Writes wait; nobody is signed out" },
  { id: "full", label: "Closed", said: "Every door but this one is withheld" },
];

export function Switches() {
  const flags = useLoad<FlagsAnswer>("op.flags");
  const care = useLoad<{ mode: string }>("op.maintenance");

  const set = async (id: string, on: boolean) => {
    const out = await api.post("op.flag.set", { id, on });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(on ? "On for the whole deployment." : "Off for the whole deployment.");
    flags.again();
  };

  const mode = async (next: string) => {
    const out = await api.post("op.maintenance.set", { mode: next });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(next === "off" ? "Everything is serving again." : "Saved. Every door reads it on the next request.");
    care.again();
  };

  return (
    <Stack space="roomy">
      <Section label="Maintenance" under="Ours, not theirs — nobody reading the notice did anything">
        <Await
          of={care.of}
          waiting={<RowsWaiting rows={1} />}
          again={care.again}
          then={(now) => (
            <Card>
              <Card.Header>
                <Card.Title>The deployment is {MODES.find((m) => m.id === now.mode)?.label.toLowerCase()}</Card.Title>
                <Card.Description>
                  The operator door, sign-in and leaving always keep working
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <Stack space="snug">
                  {MODES.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between">
                      <span>{m.label} — {m.said}</span>
                      {m.id === now.mode
                        ? <Chip color="success" variant="primary"><Chip.Label>Now</Chip.Label></Chip>
                        : (
                          <Button
                            variant={m.id === "full" ? "danger-soft" : "secondary"}
                            onPress={() => void mode(m.id)}
                          >
                            {m.id === "off" ? "Open it" : `Switch to ${m.label.toLowerCase()}`}
                          </Button>
                        )}
                    </div>
                  ))}
                </Stack>
              </Card.Content>
            </Card>
          )}
        />
      </Section>

      <Section label="Switches" under="Ours to turn on, per product, for everybody">
        <Await
          of={flags.of}
          waiting={<RowsWaiting rows={3} />}
          again={flags.again}
          isNothing={(d) => Object.keys(d.books).length === 0}
          then={(data) => (
            <Stack space="roomy">
              {Object.entries(data.books).map(([appId, book]) => (
                <Section key={appId} label={appId}>
                  <FlagConsole
                    book={book}
                    level="operator"
                    deployment={data.deployment}
                    today={new Date().toISOString().slice(0, 10)}
                    onSet={(id, on) => void set(id, on)}
                  />
                </Section>
              ))}
            </Stack>
          )}
        />
      </Section>
    </Stack>
  );
}
