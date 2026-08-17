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
import { BellRing } from "lucide-react";
import { Button } from "@heroui/react";
import { ControlRow, FieldRow, Group, NoteRow, Screen, TYPE, notice } from "@engine/design";
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
          <Group label="Push notifications">
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
            {push.publicKey ? (
              /*
                ⚠️ SHOWN BECAUSE IT IS WHAT A BROWSER SUBSCRIBES WITH, and the
                one value somebody debugging a device needs to compare. It is
                public by definition — it travels to every push service on every
                send.
              */
              <FieldRow
                label="Public key"
                /* ⚠️ `code`, because it IS one — 87 characters of base64url that
                   somebody compares against a browser rather than reads. */
                value={<span className={`break-all ${TYPE.code}`}>{push.publicKey}</span>}
              />
            ) : null}
          </Group>

          {!push.live ? (
            <Group>
              <ControlRow
                icon={<BellRing />}
                label="Generate a keypair"
                under="Made here — there is nothing to paste in"
              >
                <Button size="sm" isDisabled={busy} onPress={() => void generate(false)}>
                  {busy ? "Generating…" : "Generate"}
                </Button>
              </ControlRow>
            </Group>
          ) : (
            <Group label="Replacing it">
              <NoteRow>
                A browser subscribes to the public key above, so a new one makes every
                device that is subscribed today unreachable — permanently, and with
                nothing telling them. Each person has to turn notifications on again.
              </NoteRow>
              <ControlRow
                label="Replace the keypair"
                under={`${push.devices} device${push.devices === 1 ? "" : "s"} would be unsubscribed`}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={busy}
                  onPress={() => void generate(true)}
                >
                  {busy ? "Replacing…" : "Replace"}
                </Button>
              </ControlRow>
            </Group>
          )}
        </>
      )}
    />
  );
}
