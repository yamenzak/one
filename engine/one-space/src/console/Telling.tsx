/**
 * TELLING — whether this deployment can reach anybody's phone, and the one
 * decision behind it.
 *
 * ⚠️ THE SCREEN GENERATES A KEYPAIR AND WILL NOT ACCEPT ONE. Every guide on the
 * web tells an operator to run a command line tool and paste two strings into a
 * form; that form is a private key travelling through a clipboard, an autofill
 * store and a request log to reach a database. There is also nothing to paste —
 * the pair means nothing outside this deployment — so the honest control is a
 * button, and the field is a mistake wearing a convention.
 *
 * ⚠️ AND "CONFIGURED" IS NOT "REACHING ANYBODY", so the count is beside it. A
 * keypair with zero devices is the state of a deployment that generated one and
 * where nobody has turned notifications on — which is fine on day one and a
 * question on day ninety, and only the number can tell them apart.
 *
 * ⚠️ REPLACING IS A SECOND, DIFFERENTLY-WORDED DECISION. A browser subscribes TO
 * a public key, so a new one makes every existing device undeliverable for ever,
 * with a 403 nothing surfaces. The refusal from the first press is what turns
 * into the sentence beside the second.
 */

import { useState } from "react";
import { Button } from "@heroui/react";
import {
  ControlRow, FieldRow, Group, NoteRow, Reveal, SPACE, Screen, TYPE, glyphOf, notice,
} from "@engine/design";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

interface PushAnswer {
  readonly live: boolean;
  /** ⚠️ The PUBLIC half only. The private key has no screen, ever. */
  readonly publicKey: string | null;
  readonly devices: number;
}

export function Telling() {
  const of = useLoad<PushAnswer>("op.push");
  const [busy, setBusy] = useState(false);

  const generate = async (replace: boolean) => {
    setBusy(true);
    try {
      const said = await api.post<{ publicKey: string }>("op.push.generate", { replace });
      if (!said.ok) { notice.fail(said.problem.title); return; }
      notice.ok(replace
        ? "New keypair. Everybody has to turn notifications on again."
        : "Push is live.");
      of.again();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      shape="settings"
      of={of.of}
      again={of.again}
      then={(push) => (
        <>
          {/* ⚠️ UNLABELLED: the crown already says "Push notifications", and a
              card repeating it is the same words twice on a screen with two
              cards on it. */}
          <Group>
            <FieldRow
              label="State"
              value={push.live ? "Live" : "Not set up"}
              under={push.live
                ? undefined
                : "Nobody can be sent a notification until this deployment has a keypair"}
            />
            {push.live ? (
              <FieldRow
                label="Devices subscribed"
                value={String(push.devices)}
                /* ⚠️ ZERO IS A SENTENCE RATHER THAN A NUMBER ON ITS OWN. It is
                   the reading somebody would otherwise mistake for a fault. */
                under={push.devices === 0
                  ? "Nobody has turned notifications on yet"
                  : undefined}
              />
            ) : null}
            {/*
              ⚠️ BEHIND A DISCLOSURE, BECAUSE IT IS EIGHTY-SEVEN CHARACTERS OF
              BASE64. It is public by definition — it travels to every push
              service on every send — and it is the one value somebody debugging
              a device needs to compare, so it stays reachable. What it is not is
              a FACT about this deployment: printed in full it was two wrapped
              lines of monospace, taller than the two answers above it and the
              first thing the eye landed on.

              ⚠️ AND IT IS A ROW IN THIS CARD, NOT A CARD OF ITS OWN. One control
              inside a card is a control with a box drawn round it (DESIGN.md
              §4), and it read as a lonely button floating between two blocks.
            */}
            {push.publicKey ? (
              <Reveal label="Public key">
                <div className={`${SPACE.tight} ${TYPE.code} break-all`}>{push.publicKey}</div>
              </Reveal>
            ) : null}
          </Group>

          {!push.live ? (
            <Group>
              <ControlRow
                icon={glyphOf("bell-ring")}
                label="Generate a keypair"
                under="Made here — there is nothing to paste in"
              >
                <Button size="sm" isDisabled={busy} onPress={() => void generate(false)}>
                  {busy ? "Generating…" : "Generate"}
                </Button>
              </ControlRow>
            </Group>
          ) : (
            /* ⚠️ THE CARD IS NAMED FOR WHAT IT DOES, and the action is its
               foot. "Replacing it" is a heading about a heading; what somebody
               is deciding is whether to replace the keypair, and the card that
               asks is the card that says so. */
            <Group
              label="Replace the keypair"
              under={`${push.devices} device${push.devices === 1 ? "" : "s"} would stop being reachable`}
              does={
                <Button variant="danger-soft" isDisabled={busy} onPress={() => void generate(true)}>
                  {busy ? "Replacing…" : "Replace"}
                </Button>
              }
            >
              <NoteRow>
                A new key makes every subscribed device unreachable, permanently and
                silently. Each person has to turn notifications on again.
              </NoteRow>
            </Group>
          )}
        </>
      )}
    />
  );
}
