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

import { Button } from "@heroui/react";
import {
  Await, ControlRow, FlagConsole, Group, NoteRow, Nothing, RowsWaiting, Screen, Stack,
  TYPE, notice, sentence,
} from "@quad/web";
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
    /* ⚠️ `settings` — two independent controls, each saving the moment it is
       pressed, and no submit anywhere. The shape refuses a primary outright. */
    <Screen shape="settings">
      {/* ⚠️ The crown already says "Switches" — see `Hub.tsx`. This screen drew
          it a second time over the flags, four lines under the first. */}
      <Await
        of={care.of}
        waiting={<RowsWaiting rows={1} />}
        again={care.again}
        then={(now) => (
          /*
            ⚠️ THREE STATES ARE THREE ROWS, AND THE ONE IN FORCE IS MARKED. It
            was a `Card` holding three sentences with a button under each — so
            the choice read as three separate decisions rather than as one
            setting with three values, and the current one wore a green chip on
            a monochrome product for a state that is neither good nor bad.
          */
          <Group
            label="Maintenance"
            under="Ours, not theirs — nobody reading the notice did anything"
          >
            {MODES.map((m) => (
              <ControlRow key={m.id} label={m.label} under={m.said}>
                {m.id === now.mode
                  ? <span className={TYPE.note}>In force</span>
                  : (
                    <Button
                      /* ⚠️ Closing every door is the one that gets the red. */
                      variant={m.id === "full" ? "danger-soft" : "secondary"}
                      onPress={() => void mode(m.id)}
                    >
                      Switch
                    </Button>
                  )}
              </ControlRow>
            ))}
            {/* ⚠️ THE EXEMPTIONS ARE THE FEATURE, so they are stated where the
                switch is rather than in a description above it. */}
            <NoteRow>
              The operator door, signing in and leaving always keep working, whatever this is set to.
            </NoteRow>
          </Group>
        )}
      />

      <Await
        of={flags.of}
        waiting={<RowsWaiting rows={3} />}
        again={flags.again}
        isNothing={(d) => Object.keys(d.books).length === 0}
        nothing={<Nothing says="No product here declares a flag" />}
        then={(data) => (
          <Stack space="roomy">
            {Object.entries(data.books).map(([appId, book]) => (
              <FlagConsole
                key={appId}
                book={book}
                level="operator"
                /* ⚠️ AN APP ID IS NOT A NAME — see `sentence`. These headings
                   read "hello" and "kova" at display weight, in a column where
                   nothing else is lower case. */
                label={sentence(appId)}
                deployment={data.deployment}
                today={new Date().toISOString().slice(0, 10)}
                onSet={(id, on) => void set(id, on)}
              />
            ))}
          </Stack>
        )}
      />
    </Screen>
  );
}
