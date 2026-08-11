/**
 * SIGN-IN METHODS — how you get in, and where you already are.
 *
 * ⚠️ THE REFERENCE HAS FOUR FACTORS AND WE HAVE TWO, so this screen is shorter
 * and says so rather than inventing rows. There is no passcode: a passcode is a
 * password with fewer characters, and the platform is passwordless by decision
 * (SPEC — email OTP and passkeys, nothing else). There is no "sign in with
 * biometrics" switch either, because a passkey IS the biometric — the face or the
 * finger unlocks the key on the device and never leaves it. A toggle labelled
 * "biometrics" beside a list of passkeys would be the same thing offered twice.
 *
 * ⚠️ THE EMAIL CODE CANNOT BE TURNED OFF, AND THE ROW SAYS SO INSTEAD OF
 * PRETENDING. It is the recovery path: the way back in when every passkey is on a
 * phone at the bottom of a lake. A switch that refuses is worse than no switch —
 * it invites the one action it will not perform.
 *
 * ⚠️ AND REMOVING THE LAST PASSKEY IS ALLOWED. It leaves the account on the email
 * code alone, which is exactly where an account starts, so refusing would be the
 * product deciding somebody may not undo a thing they chose. What it does is SAY
 * so first.
 */

import type { ElementType, ReactNode } from "react";
import { Add, Device, Key, Letter } from "../icon.js";
import { Button } from "../button.js";
import { Blank, Card, Item, Pill, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";

/** A registered credential. `credentials` in the identity store. */
export interface Passkey {
  readonly id: string;
  /** What the device called itself when it was registered. */
  readonly label: string;
  readonly added: string;
  /** ⚠️ ABSENT IS NEVER USED, NOT UNKNOWN — the counter says so. */
  readonly lastUsed?: string;
  /** The one this browser just authenticated with, if any. */
  readonly current?: boolean;
}

/** A live session. `sessions` in the regional store. */
export interface Device {
  readonly id: string;
  /** Which product, and which workspace's door it was opened at. */
  readonly app: string;
  readonly since: string;
  readonly current?: boolean;
}

export interface SignInMethodsProps {
  readonly email: string;
  /** ⚠️ `null` is NOT ANSWERED YET. `[]` is answered, and there are none. */
  readonly passkeys: readonly Passkey[] | null;
  readonly devices: readonly Device[] | null;
  readonly onAddPasskey: () => void;
  readonly onRemovePasskey: (id: string) => void;
  readonly onSignOut: (id: string) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function SignInMethods({
  email, passkeys, devices, onAddPasskey, onRemovePasskey, onSignOut, onBack, Heading = "h1",
}: SignInMethodsProps): ReactNode {
  return (
    <Screen
      leave="up"
      onLeave={onBack}
      title={<Title as={Heading}>Sign-in methods</Title>}
      /* ⚠️ THE SENTENCE IS HERE BECAUSE THE SCREEN HOLDS THREE UNRELATED THINGS.
         "Your details" needed none — its title is the whole content. */
      lede="How you get in, and where you are signed in."
      /* ⚠️ THE ONE THING THE SCREEN IS FOR, IN THE HEADER. At the foot of the list
         it would make somebody read the list to find out they could have skipped
         it — and on an account with no passkeys the list is empty. */
      action={<Button tone="loud" icon={<Add />} onClick={onAddPasskey}>Add passkey</Button>}
    >
      <Section name="Passkeys">
        {passkeys === null ? (
          <Waiting rows={2} />
        ) : passkeys.length === 0 ? (
          /* ⚠️ IT SAYS WHY, NOT JUST THAT. An empty list of a thing most people
             have never deliberately created is the one place a product has to
             explain itself, and "No passkeys" explains nothing. */
          <Blank title="No passkeys yet">
            A passkey signs you in with the face, fingerprint or PIN your device
            already uses. It never leaves the device, so there is nothing to
            phish and nothing to remember.
          </Blank>
        ) : (
          <Card>
            {passkeys.map((k) => (
              <Item
                key={k.id}
                icon={<Key />}
                title={k.label}
                /* ⚠️ ONE SHORT FACT, BECAUSE THE ROW CARRIES A BUTTON. A row with
                   an action has about half a phone's width for words: "Added 4
                   March · last used 2 days ago" wrapped to two lines and pushed
                   the pill onto a third, and every row was half again as tall as
                   it had reason to be. Two shortenings later the pill went too —
                   at that width a badge is a second line by itself.

                   ⚠️ THE ONE IN YOUR HAND SAYS SO INSTEAD OF SAYING WHEN. "Remove"
                   on a list of near-identical device names is a question about
                   which one, and the answer matters more than a timestamp that is
                   obviously "just now". Everything else answers what somebody
                   deciding what to remove is actually asking. */
                detail={k.current ? "This device" : k.lastUsed ? `Last used ${k.lastUsed}` : "Never used"}
                /* ⚠️ AN ACTION, SO THE ROW ITSELF DOES NOT GO ANYWHERE. Two
                   targets on one line means a finger that meant "remove" and
                   landed a millimetre left opens something instead. */
                action={<Button tone="quiet" onClick={() => onRemovePasskey(k.id)}>Remove</Button>}
              />
            ))}
          </Card>
        )}
      </Section>

      <Section name="Email code">
        <Card>
          {/* ⚠️ NO ACTION AND NO CHEVRON, because there is nothing to do here. The
              address is changed on Your details, where the address lives; a second
              way to reach the same editor is a second place to keep in step. */}
          <Item
            icon={<Letter />}
            title={email}
            /* ⚠️ NO "ALWAYS ON" BADGE, BECAUSE THE ABSENCE OF A CONTROL SAYS IT.
               The pill and the sentence were the same statement twice, and the
               pill cost a third line. A row with no action has the full width for
               its words, so the sentence can be the whole answer. */
            detail="A code is sent here when you sign in without a passkey"
          />
        </Card>
      </Section>

      <Section name="Where you are signed in">
        {devices === null ? (
          <Waiting rows={2} />
        ) : devices.length === 0 ? (
          <Blank title="Nowhere else" />
        ) : (
          <Card>
            {devices.map((d) => (
              <Item
                key={d.id}
                icon={<Device />}
                title={d.app}
                detail={
                  <>
                    Since {d.since}
                    {d.current ? <Pill>This device</Pill> : null}
                  </>
                }
                /* ⚠️ THE ONE YOU ARE ON HAS NO BUTTON. Signing yourself out from a
                   list of devices is a control that closes the screen it is on,
                   which reads as a crash. Leaving is the avatar menu's job. */
                action={d.current ? undefined : <Button tone="quiet" onClick={() => onSignOut(d.id)}>Sign out</Button>}
              />
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}
