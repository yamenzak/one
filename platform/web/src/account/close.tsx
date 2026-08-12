/**
 * CLOSE YOUR ACCOUNT — the one action here that cannot be undone, and the seven
 * days in which it can.
 *
 * ⚠️ LEAVING IS ALWAYS ALLOWED, WHICH IS A CLAIM THE PLATFORM MAKES EVERYWHERE
 * AND HAD NO SCREEN FOR. The exit lane survives the standing gate, the consent
 * gate and maintenance precisely so that a person who will not pay, will not
 * agree or has simply had enough can take their account and go — and the row on
 * the account home pointed at nothing.
 *
 * ⚠️ IT IS A DELAY, NOT A DIALOG. Seven days of "closing" beats any amount of
 * friction in front of the button: friction cannot make an action reversible and
 * cannot make anybody read, while a week can be changed by somebody who pressed it
 * at two in the morning. So the confirm asks once, plainly, and the screen after it
 * is about how to come back.
 *
 * ⚠️ AND WHAT STANDS IN THE WAY IS NAMED BEFORE THE BUTTON. An account is
 * somebody's memberships: closing one where they are the last person who can
 * manage a workspace would leave it running, billed and impossible to re-enter.
 * The refusal that teaches names those workspaces; the one that does not just says
 * no, in a sentence about permissions.
 *
 * ⚠️ THE GATE IS `tick`, NOT `type`. Typing a phrase is for destroying something
 * that HAS a name — a workspace, a file. An account is not a thing with a name to
 * copy, and asking somebody to type their own address to leave is friction that
 * reads as an obstacle rather than as a check.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Button } from "../button.js";
import { Confirm } from "../confirm.js";
import { Heartbreak } from "../icon.js";
import { Blank, Card, Item } from "../list.js";
import { Screen, Section, Title } from "../screen.js";

/** One workspace that would be left without anybody who can manage it. */
export interface Stranded {
  readonly tenantId: string;
  readonly name: string;
  /** The product it belongs to, for the face's colour. Never shown as a word. */
  readonly product?: string;
  readonly face?: string;
}

export interface CloseAccountProps {
  /**
   * ⚠️ `null` IS NOT ANSWERED YET. The difference matters more here than anywhere
   * else on this surface: an empty blocking list means "nothing stands in the
   * way", and showing that before the answer arrives puts a working Close button
   * in front of somebody whose workspaces would be stranded.
   */
  readonly blocking: readonly Stranded[] | null;
  /** The day it closes, where it already is closing. */
  readonly closesOn: string | null;
  readonly onClose: () => Promise<Problem | null>;
  readonly onCancel: () => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function CloseAccountScreen({
  blocking, closesOn, onClose, onCancel, onBack, Heading = "h1",
}: CloseAccountProps): ReactNode {
  const [asking, setAsking] = useState<"close" | "cancel" | null>(null);

  /* ⚠️ ALREADY CLOSING IS A DIFFERENT SCREEN, not the same one with a banner. The
     only thing to decide here is whether to come back, and every word about what
     closing does is about a decision that has been made. */
  if (closesOn) {
    return (
      <Screen leave="up" onLeave={onBack} name="Closing"
        title={<Title as={Heading}>Your account is closing</Title>}
        lede={`Everything is deleted on ${closesOn}. Until then you can change your mind and nothing is lost.`}
      >
        <Section>
          <Button tone="loud" wide onClick={() => setAsking("cancel")}>Keep my account</Button>
        </Section>
        <Confirm
          open={asking === "cancel"}
          title="Keep your account"
          lede="Your account stays open and nothing is deleted. You can close it again at any time."
          verb="Keep it"
          onConfirm={onCancel}
          onClose={() => setAsking(null)}
        />
      </Screen>
    );
  }

  const stuck = blocking !== null && blocking.length > 0;

  return (
    <Screen leave="up" onLeave={onBack} name="Close your account"
      title={<Title as={Heading}>Close your account</Title>}
      lede="Your account, your vault and everything either holds. Reversible for seven days, then gone."
    >
      <Section>
        {/* ⚠️ WHAT IT TAKES WITH IT, PLAINLY, BEFORE ANYTHING IS PRESSED. The
            vault is the sentence that matters: a fact in it survives leaving every
            workspace, which is exactly why closing the account is the one action
            that reaches it. */}
        <p className="note">
          This deletes how you sign in, what you have agreed to, and your vault —
          including facts you shared with a workspace, which lose the copy your
          account was keeping. Workspaces you are only a member of carry on without
          you.
        </p>
      </Section>

      {/* ⚠️ WHAT STANDS IN THE WAY, NAMED. A refusal that lists the workspaces is
          one somebody can act on — hand it over, or close it — where "you cannot
          do this" is a wall with no door in it. */}
      {stuck ? (
        <Section name="These would be left with nobody">
          <Card>
            {blocking.map((w) => (
              <Item key={w.tenantId} title={w.name}
                detail="You are the only person who can manage it" />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section>
        {blocking === null
          /* ⚠️ THE BUTTON WAITS FOR THE ANSWER. Rendered enabled while the
             blocking list is still coming, it is a working Close for somebody
             whose workspaces would be stranded. */
          ? <Blank title="Checking what this would affect" />
          : (
            <Button
              tone="quiet" wide disabled={stuck}
              onClick={() => setAsking("close")}
              icon={<Heartbreak size={19} />}
            >
              {stuck ? "Hand those over first" : "Close my account"}
            </Button>
          )}
      </Section>

      <Confirm
        open={asking === "close"}
        title="Close your account"
        lede="Everything is kept for seven days and then permanently deleted. You can change your mind from the sign-in screen until then."
        verb="Close my account"
        tone="alarm"
        /* ⚠️ A TICK, BECAUSE IT IS UNDOABLE FOR A WEEK AND TAKES NOTHING WITH IT
           TODAY. The typed phrase is for destroying something with a name; asking
           somebody to type their own address on the way out is an obstacle wearing
           a check's clothes. */
        gate={{ kind: "tick", label: "I understand everything will be deleted" }}
        onConfirm={onClose}
        onClose={() => setAsking(null)}
      />
    </Screen>
  );
}
