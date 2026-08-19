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
 * ⚠️ THE STATE IS THE ROW'S SECOND LINE AND NOTHING ELSE IS. Every row used to
 * read `${what the key is for} · ${state}` — and the `said` sentences are long
 * ("`cloudflare` sends through this Worker's binding. `off` refuses rather than
 * pretending."), so the one word somebody is scanning for was the last of
 * twenty, after a wrap, in the same grey as the rest. What a key is FOR belongs
 * where somebody is about to type one, which is the sheet, and it is already
 * there as the field's help.
 *
 * ⚠️ AND A HALF-SET LANE SAYS SO, ON THE CARD. Grouping the keys of a lane was
 * supposed to make a half-configured one look half-configured; it does not,
 * because two rows reading "set" and "not set" is a fact per row and no verdict
 * over the pair. The verdict is the lane's — `LANES` in `config.ts` — because
 * what the combination DOES is knowable there and nowhere else.
 */

import { useState } from "react";
import { sayDate, type Instant } from "@engine/kernel";
import { Button } from "@heroui/react";
import {
  ControlRow, FieldRow, Group, NoteRow, RowsWaiting, Screen, Stack, TextInput,
  Tray, notice, sentence, useShown,
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

/** ⚠️ The lane's own verdict on its rows — see `LANES` in `config.ts`. */
interface Lane {
  readonly id: string;
  readonly name: string;
  readonly half: string;
  readonly off: string;
  readonly needed: boolean;
}

interface Parked {
  readonly id: string;
  readonly kind: string;
  readonly at: string;
  readonly why: string;
}

interface Answer {
  readonly items: readonly Credential[];
  readonly lanes: readonly Lane[];
  readonly canKeepSecrets: boolean;
  readonly parked: readonly Parked[];
}

/**
 * ⚠️ THE THREE STATES, AND THE MIDDLE ONE IS A FAILURE WEARING A FACT'S CLOTHES.
 * "Stored, but this deployment can no longer read it" in the same grey as "set"
 * is a lane that is off and a screen that looks fine.
 */
const stateOf = (it: Credential): { readonly says: string; readonly ink?: "danger" } => {
  if (!it.set) return { says: "Not set" };
  if (!it.readable) return { says: "Stored, and no longer readable", ink: "danger" };
  return { says: it.secret ? "Set" : it.value ?? "Set" };
};

/**
 * ⚠️ WHY A PAYMENT WAS NOT APPLIED, IN WORDS. The column holds the reason as a
 * key the code branches on, and the screen was printing it — `no_tenant`, to an
 * operator, under a heading about money. A reason nobody added here still reads
 * as words rather than as an identifier, because `sentence` is the floor.
 */
const WHY: Readonly<Record<string, string>> = {
  no_tenant: "No workspace holds that customer",
};

/**
 * ⚠️ EVERY ROW SET, OR SOME, OR NONE — and only the middle one is always wrong.
 * `null` is a lane with nothing to say, which is what a working lane looks like.
 */
const verdict = (
  lane: Lane, rows: readonly Credential[],
): { readonly says: string; readonly ink?: "warning" | "danger" } | null => {
  if (rows.some((r) => r.set && !r.readable)) {
    return { says: "Something here is stored under a secret this deployment no longer has", ink: "danger" };
  }
  const set = rows.filter((r) => r.set).length;
  if (set === rows.length) return null;
  if (set > 0) return { says: lane.half, ink: "warning" };
  return lane.needed ? { says: lane.off, ink: "warning" } : { says: lane.off };
};

export function Keys() {
  const reader = useShown();
  const of = useLoad<Answer>("op.config");

  return (
    /* ⚠️ `settings` — independent controls, each saving on its own, no submit
       anywhere and no primary. The shape refuses one outright. */
    <Screen
      shape="settings"
      under="What this deployment was told, and what is still running on nothing"
      of={of.of}
      again={of.again}
      waiting={<RowsWaiting rows={4} />}
      then={(data) => (
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

          {/*
            ⚠️ SHOWN ONLY WHEN THERE IS ONE, and it belongs on this screen
            because this is where somebody is standing when a payment did not
            land. Each row is money that arrived against a workspace nothing
            could place — the failure the table exists to make visible rather
            than to record silently.

            ⚠️ AND IT IS A RECORD, NOT A CONTROL. These were `ControlRow`s
            holding an empty `<span />` — a settings row with the control
            missing, which reads as a button that failed to render. Nothing
            here can apply one: Stripe will not re-send an event to fix an
            attribution problem, so the remedy is in Stripe and the row's job
            is to say what happened and give the id to quote.
          */}
          {data.parked.length ? (
            <Group
              label="Payments that could not be placed"
              under="Each one arrived signed and was recorded rather than applied. Settle it in Stripe"
            >
              {data.parked.map((p) => (
                <FieldRow
                  key={p.id}
                  label={p.kind}
                  value={<span data-ink="warning">{WHY[p.why] ?? sentence(p.why)}</span>}
                  under={`${p.id} · ${sayDate(reader, p.at as Instant)}`}
                />
              ))}
            </Group>
          ) : null}

          {data.lanes.map((lane) => {
            const rows = data.items.filter((c) => c.lane === lane.id);
            if (!rows.length) return null;
            const said = verdict(lane, rows);
            return (
              <Group
                key={lane.id}
                label={lane.name}
                /* ⚠️ THE VERDICT WEARS THE TONE AND THE ROWS DO NOT. Four toned
                   lines in one card is a card with no verdict in it — the ink
                   marks the one sentence that is about the lane as a whole. */
                under={said ? <span data-ink={said.ink}>{said.says}</span> : undefined}
              >
                {rows.map((it) => {
                  const state = stateOf(it);
                  return (
                    <ControlRow
                      key={it.id}
                      label={it.label}
                      under={<span data-ink={state.ink}>{state.says}</span>}
                    >
                      <Enter it={it} canKeepSecrets={data.canKeepSecrets} onDone={of.again} />
                    </ControlRow>
                  );
                })}
              </Group>
            );
          })}
        </Stack>
      )}
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
          /* ⚠️ WHAT THE KEY IS FOR, HERE AND NOT ON THE ROW. This is the one
             moment it is worth reading — see the header. */
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
