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

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Add, Device, Key, Letter, Locked } from "../icon.js";
import { Button } from "../button.js";
import { Mark } from "../mark.js";
import { Chip, Pill } from "../capsule.js";
import { Blank, Card, Item, Waiting } from "../list.js";
import { Confirm } from "../confirm.js";
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
  /**
   * ⚠️ A SESSION IS ALWAYS SOMEBODY'S WORKSPACE, which is what makes its face the
   * right mark for the row. `sessions.origin` is a tenant's door, so the identity
   * is known — and a column of identical monitors tells nobody which of four
   * workspaces they are about to sign out of.
   */
  readonly workspaceFace?: string;
  readonly workspaceName?: string;
  readonly product?: string;
}

export interface SignInMethodsProps {
  readonly email: string;
  /** ⚠️ `null` is NOT ANSWERED YET. `[]` is answered, and there are none. */
  readonly passkeys: readonly Passkey[] | null;
  readonly devices: readonly Device[] | null;
  readonly onAddPasskey: () => void;
  /** ⚠️ RESOLVES TO A `Problem` OR TO NULL. Never throws, never a string. */
  readonly onRemovePasskey: (id: string) => Promise<Problem | null>;
  readonly onSignOut: (id: string) => Promise<Problem | null>;
  /**
   * ⚠️ LEAVING THE DEVICE YOU ARE HOLDING, WHICH NOTHING OFFERED. The row for
   * this device carried no control and the comment beside it said leaving was
   * "the avatar menu's job" — a menu this platform does not
   * have. So there was no way to sign out anywhere in the product, on the one
   * screen whose subject is where you are signed in.
   */
  readonly onSignOutHere: () => Promise<Problem | null>;
  /**
   * ⚠️ EVERY DEVICE AND EVERY PRODUCT, WHICH IS WHAT SOMEBODY WHO LOST A PHONE
   * IS LOOKING FOR. It is a defensive action, so it is offered plainly and asks
   * for nothing beyond the press — friction here helps whoever has the phone.
   */
  readonly onSignOutEverywhere: () => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function SignInMethods({
  email, passkeys, devices, onAddPasskey, onRemovePasskey, onSignOut,
  onSignOutHere, onSignOutEverywhere, onBack, Heading = "h1",
}: SignInMethodsProps): ReactNode {
  /* ⚠️ ONE ASK AT A TIME, HELD AS WHAT IS BEING ASKED rather than as a boolean
     plus an id. A flag and an id kept apart is how a sheet comes to be open with
     nothing selected — or worse, open about the row somebody closed it on. */
  const [asking, setAsking] = useState<
    | { readonly kind: "passkey"; readonly it: Passkey }
    | { readonly kind: "device"; readonly it: Device }
    | { readonly kind: "here" }
    | { readonly kind: "everywhere" }
    | null
  >(null);
  const last = passkeys !== null && passkeys.length === 1;

  return (
    <Screen
      leave="up"
      onLeave={onBack}
      name="Sign-in methods"
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
                action={<Button tone="quiet" onClick={() => setAsking({ kind: "passkey", it: k })}>Remove</Button>}
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
                mark={
                  <Mark
                    kind="workspace" src={d.workspaceFace}
                    name={d.workspaceName ?? d.app} product={d.product}
                    badge={<Device size={14} />}
                  />
                }
                title={d.app}
                detail={
                  <>
                    Since {d.since}
                    {d.current ? <Pill>This device</Pill> : null}
                  </>
                }
                /* ⚠️ THE ONE YOU ARE ON HAS A BUTTON TOO, AND IT USED NOT TO.
                   The argument was that signing yourself out closes the screen it
                   is on and reads as a crash — true, and answered by saying what
                   will happen rather than by removing the only way to leave a
                   shared computer. Nothing else in this platform signs anybody
                   out. */
                action={
                  <Button tone="quiet" onClick={() => setAsking(d.current ? { kind: "here" } : { kind: "device", it: d })}>
                    Sign out
                  </Button>
                }
              />
            ))}
            {/* ⚠️ THE ROW SOMEBODY LOOKS FOR AFTER LOSING A PHONE, and it is at
                the end of this list rather than in a menu because this is where
                they are already looking. Quiet rather than red: it is a
                DEFENSIVE action, and a list of ordinary facts with a red control
                in it teaches people to ignore red. */}
            <Item
              icon={<Locked />}
              title="Sign out everywhere"
              /* ⚠️ SHORT BECAUSE THE ROW IS. A marked row that goes somewhere holds one
                 line, and the title already says everywhere; the sentence that
                 matters — which products, and how soon — is on the sheet. */
              detail="Including this one"
              onGo={() => setAsking({ kind: "everywhere" })}
            />
          </Card>
        )}
      </Section>

      {/* ⚠️ TWO CONSEQUENCES, TWO GATES, FROM THE SAME SHEET. Signing a browser
          out can be undone by signing in again, so it asks and no more. Removing
          the LAST passkey leaves the account on the email code alone — recoverable,
          but only through an inbox — so that one asks for a tick, and only that
          one: a gate on every removal would train people to tick without
          reading, which is what makes the gate on the row that matters useless. */}
      <Confirm
        open={asking !== null}
        title={
          asking?.kind === "here" ? "Sign out on this device?"
            : asking?.kind === "everywhere" ? "Sign out everywhere?"
              : asking?.kind === "device" ? "Sign out of this workspace?"
                : "Remove this passkey?"
        }
        lede={
          /* ⚠️ IT SAYS WHAT IT DOES *NOT* DO. Sessions are per origin by design,
             so leaving here leaves nothing else — and somebody on a shared
             computer who believes otherwise walks away from an open product. */
          asking?.kind === "here"
            ? "You will be signed out of your account on this device. The products you are signed into are not affected \u2014 use \u201CSign out everywhere\u201D for those."
            : asking?.kind === "everywhere"
              ? "Every device signs out, including this one, and every product with it. Others may take a few minutes to notice. You can sign back in at any time."
              : asking?.kind === "device"
            ? (
              <>
                {/* ⚠️ THE WORKSPACE APPEARS AS ITSELF rather than as its name in
                    the middle of a sentence — the same face that is on the row
                    behind this sheet, so there is nothing to match up. */}
                Whoever is using{" "}
                <Chip face={<Mark kind="workspace" size="sm" src={asking.it.workspaceFace} name={asking.it.workspaceName ?? asking.it.app} product={asking.it.product} />}>
                  {asking.it.workspaceName ?? asking.it.app}
                </Chip>{" "}
                will be signed out. You can sign in again at any time.
              </>
            )
            : last
              ? "This is your last passkey. You will sign in with a code sent to your email until you add another."
              : `${asking?.kind === "passkey" ? asking.it.label : "This device"} will no longer sign you in. You can add it again later.`
        }
        verb={asking?.kind === "passkey" ? "Remove" : "Sign out"}
        gate={asking?.kind === "passkey" && last ? { kind: "tick", label: "I understand I will sign in by email until I add another passkey." } : undefined}
        tone={asking?.kind === "passkey" && last ? "alarm" : undefined}
        onConfirm={async () =>
          asking === null ? null
            : asking.kind === "here" ? onSignOutHere()
              : asking.kind === "everywhere" ? onSignOutEverywhere()
                : asking.kind === "device" ? onSignOut(asking.it.id)
                  : onRemovePasskey(asking.it.id)
        }
        onClose={() => setAsking(null)}
      />
    </Screen>
  );
}
