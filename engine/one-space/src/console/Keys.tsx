/**
 * WHAT THE DEPLOYMENT WAS TOLD — the operator's side of `config.ts`.
 *
 * ⚠️ A SECRET IS NEVER DRAWN, ONLY ITS STATE. There is no route that answers a
 * live key, so this screen could not show one if it wanted to — which is the
 * point: a console that could read a Stripe key back is a console that is a way
 * to take one out of the deployment.
 *
 * ⚠️ AND `set` IS NOT THE WHOLE STATE. A value stored under a rotated
 * `CONFIG_SECRET` is present and undecryptable, and telling somebody it is
 * simply "not set" sends them to re-enter it while the lane goes on failing for
 * a reason this screen denied. Three states, three sentences.
 *
 * ⚠️ THE LANES ARE CARDS BECAUSE THEY ARE SET TOGETHER OR NOT AT ALL. A sender
 * address without a provider sends nothing; a Stripe key without a webhook
 * secret takes money and never hears that it landed. Grouping them is what makes
 * a half-configured lane look half-configured.
 */

import { useState } from "react";
import { Button } from "@heroui/react";
import {
  ControlRow, Group, NoteRow, RowsWaiting, Screen, Stack, TextInput, Tray,
  notice, sentence,
} from "@engine/design";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

interface Credential {
  readonly id: string;
  readonly label: string;
  readonly said: string;
  readonly secret: boolean;
  readonly lane: string;
  readonly set: boolean;
  readonly value: string | null;
  readonly readable: boolean;
}

interface Answer {
  readonly items: readonly Credential[];
  readonly canKeepSecrets: boolean;
}

/** ⚠️ The three states, in the words somebody can act on. */
const stateOf = (it: Credential): string => {
  if (!it.set) return "not set";
  if (!it.readable) return "stored, but this deployment can no longer read it";
  return it.secret ? "set" : it.value ?? "set";
};

export function Keys() {
  const of = useLoad<Answer>("op.config");

  return (
    /* ⚠️ `settings` — independent controls, each saving on its own, no submit
       anywhere and no primary. The shape refuses one outright. */
    <Screen
      shape="settings"
      of={of.of}
      again={of.again}
      waiting={<RowsWaiting rows={4} />}
      then={(data) => {
        const lanes = [...new Set(data.items.map((c) => c.lane))];
        return (
          <Stack space="roomy">
            {/* ⚠️ SAID ONCE, ABOVE EVERYTHING, because it is the deployment's
                own state rather than any one row's — and repeated per row it
                would be four copies of one sentence. */}
            {data.canKeepSecrets ? null : (
              <Group label="Nothing can be kept here yet">
                <NoteRow>
                  This deployment has no <code>CONFIG_SECRET</code> bound, so a key
                  cannot be stored — it would sit in the database in the clear.
                  Set the secret and reload. An address can still be saved.
                </NoteRow>
              </Group>
            )}

            {lanes.map((lane) => (
              <Group key={lane} label={sentence(lane)}>
                {data.items.filter((c) => c.lane === lane).map((it) => (
                  <ControlRow
                    key={it.id}
                    label={it.label}
                    under={`${it.said} · ${stateOf(it)}`}
                  >
                    <Enter it={it} canKeepSecrets={data.canKeepSecrets} onDone={of.again} />
                  </ControlRow>
                ))}
              </Group>
            ))}
          </Stack>
        );
      }}
    />
  );
}

/**
 * ⚠️ A SHEET RATHER THAN AN INLINE FIELD, and not for tidiness: pasting a live
 * secret key is a step somebody does deliberately, and an inline box in a list
 * of four is one an errant click clears. Clearing is offered as its own control,
 * because turning a lane off has to be as reachable as turning it on.
 */
function Enter({ it, canKeepSecrets, onDone }: {
  readonly it: Credential;
  readonly canKeepSecrets: boolean;
  readonly onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const blocked = it.secret && !canKeepSecrets;

  const write = async (next: string) => {
    const out = await api.post("op.config.set", { key: it.id, value: next });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(next.trim() ? `${it.label} is set.` : `${it.label} is cleared.`);
    setValue("");
    onDone();
  };

  return (
    <Tray
      trigger={<Button variant="ghost" isDisabled={blocked}>{it.set ? "Replace" : "Set"}</Button>}
      title={it.label}
      actions={
        <Button
          slot="close"
          variant="primary"
          isDisabled={!value.trim()}
          onPress={() => void write(value)}
        >
          Save it
        </Button>
      }
    >
      <Stack space="roomy">
        <TextInput
          label={it.label}
          value={value}
          onChange={setValue}
          /* ⚠️ NEVER THE STORED VALUE AS A PLACEHOLDER. A secret has none to
             show, and showing an address there would read as already typed. */
          placeholder={it.secret ? "Paste it here" : it.value ?? ""}
          help={it.said}
        />
        {it.set ? (
          <Group>
            <ControlRow
              label="Clear it"
              under="The lane behind it stops rather than running on a stale value"
            >
              <Button slot="close" variant="danger-soft" onPress={() => void write("")}>
                Clear
              </Button>
            </ControlRow>
          </Group>
        ) : null}
      </Stack>
    </Tray>
  );
}
