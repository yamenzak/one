/**
 * MAINTENANCE — the one switch that closes every door.
 *
 * ⚠️ THIS IS ABOUT US, AND THE COPY HAS TO SAY SO. Nobody reading the notice did
 * anything and nobody can pay to end it — so the screen names what it withholds
 * and from whom, rather than offering a mode picker with three words in it.
 *
 * ⚠️ AND `readonly` IS THE ONE WORTH REACHING FOR. Reads keep serving, so people
 * find their records where they left them; only the writes wait.
 *
 * ⚠️ IT SHARED A SCREEN WITH THE FLAGS AND SHOULD NOT HAVE. A flag is a product
 * decision about one feature, taken on an ordinary Tuesday; this is an incident.
 * Together they put the switch that withholds the whole product at the same
 * weight as a list of things being tried, one scroll apart, reachable by the same
 * accident — and the screen had to open with a paragraph explaining which half
 * somebody was looking at, which is the tell (DESIGN.md §7).
 */

import { Button } from "@heroui/react";
import {
  Await, ControlRow, Group, NoteRow, RowsWaiting, Screen, TYPE, notice,
} from "@engine/design";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

/**
 * ⚠️ THREE STATES ARE THREE ROWS, AND THE ONE IN FORCE IS MARKED. It was a
 * `Card` holding three sentences with a button under each — so the choice read
 * as three separate decisions rather than as one setting with three values, and
 * the current one wore a green chip on a monochrome product for a state that is
 * neither good nor bad.
 */
const MODES: readonly {
  readonly id: "off" | "readonly" | "full";
  readonly label: string;
  readonly said: string;
}[] = [
  { id: "off", label: "Open", said: "Everything is serving" },
  { id: "readonly", label: "Reading only", said: "Writes wait; nobody is signed out" },
  { id: "full", label: "Closed", said: "Every door but this one is withheld" },
];

export function Maintenance() {
  const care = useLoad<{ mode: string }>("op.maintenance");

  const mode = async (next: string) => {
    const out = await api.post("op.maintenance.set", { mode: next });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(next === "off"
      ? "Everything is serving again."
      : "Saved. Every door reads it on the next request.");
    care.again();
  };

  return (
    /* ⚠️ `settings` — one control, saving the moment it is pressed, and no submit
       anywhere. The shape refuses a primary outright. */
    <Screen shape="settings" under="What is being served, and what is held">
      <Await
        of={care.of}
        waiting={<RowsWaiting rows={3} />}
        again={care.again}
        then={(now) => (
          <Group label="Maintenance" under="This is about us. Nobody reading the notice did anything">
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
    </Screen>
  );
}
