/**
 * ONE SUBSCRIPTION — what it costs, where it stands, and the three things
 * somebody opens it to do.
 *
 * ⚠️ THIS IS WHERE `me.subscriptions` HAD NO SURFACE. Every fact on this screen
 * has been on the wire since billing moved to the account: the plan, the status,
 * the ladder's next rung, and the setup door for a subscription that has been
 * paid for and not yet pointed at a workspace. What there was no screen for was
 * ANY of it — so somebody who bought, closed the tab and came back had a paid
 * subscription, an empty workspace list, and no address in the product that would
 * finish it.
 *
 * ⚠️ IT OPENS WITH THE STATE, NOT WITH A LIST OF FEATURES. What am I on, is it
 * fine, and when does the next thing happen — three questions somebody has before
 * they have any interest in what the plan includes. A screen that opened with the
 * entitlements would be answering the fourth question first, which is why the
 * hero is large and centred and the benefits are under it.
 *
 * ⚠️ AND THE WAY OUT IS ITS OWN CARD AT THE BOTTOM, NEVER A QUICK ACTION.
 * Cancelling is irreversible for the seven days it is not, and putting it in a
 * row of circles beside "Top up" makes the destructive one the same size and
 * shape as the one that spends money on staying.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Instant, Problem, StandingState } from "@one/kernel";
import { Confirm } from "../confirm.js";
import { Add, Heartbreak, Outward, Swap, Wallet } from "../icon.js";
import { Card, Item } from "../list.js";
import { Mark } from "../mark.js";
import { Screen, Section, Title } from "../screen.js";
import { Quick } from "../tiles.js";
import { dayOf, priceOf, type Included, type Money } from "./offer.js";
import type { Where } from "./routes.js";

/**
 * ⚠️ THE SHAPE `me.subscriptions` ANSWERS WITH, PLUS THE PLAN'S OWN CARD. The
 * catalogue is the shelf's, and it is joined by whoever mounts this rather than
 * by the screen — one product's plan read from another product's shelf is the
 * defect a screen doing its own joining would eventually ship.
 */
export interface Holding {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  /** ⚠️ Null while nothing has been paid for. `pendingPlanId` is not a plan. */
  readonly planName: string | null;
  readonly price: Money | null;
  readonly period: "month" | "year";
  /**
   * ⚠️ THE STANDING COMES FROM THE SAME FUNCTION THE GATE READS. A screen that
   * worked out "past due" its own way can disagree with the door somebody is
   * being turned away from, and the one they believe is the screen.
   */
  readonly standing: StandingState;
  readonly trialEndsAt?: Instant | null;
  /** The workspace it pays for, once there is one. */
  readonly workspace?: { readonly tenantId: string; readonly name: string; readonly at: string } | null;
  /** ⚠️ Where to go and finish, for a subscription with no workspace yet. */
  readonly setupAt?: string | null;
  /**
   * ⚠️ WHERE SOMEBODY PAYS. A screen that says "payment failed" and offers no
   * address that fixes it has told somebody they have a problem and left them to
   * find the door — which is the whole reason arrears reach support instead of
   * the provider's own portal.
   */
  readonly payAt?: string | null;
  readonly includes: readonly Included[];
}

/**
 * ⚠️ ONE LINE UNDER THE NAME, AND IT IS THE MOST URGENT TRUE THING. A plan
 * screen that says "renews on 1 September" to somebody whose card was declined
 * is a screen that has told them the reassuring half of the truth.
 */
export const standsAs = (holding: Holding, day: (at: string) => string): string => {
  const { reason, nextAt } = holding.standing;
  if (reason === "closing") return nextAt ? `Closing ${day(nextAt)}` : "Closing";
  if (reason === "arrears") return "Payment failed";
  if (reason === "setup") return "Choose a plan to start";
  if (holding.trialEndsAt) return `Free until ${day(holding.trialEndsAt)}`;
  if (!holding.price) return "Nothing is being charged";
  return priceOf(holding.price, holding.period);
};

/**
 * WHAT IS ABOUT TO HAPPEN, IN A SENTENCE — and only where something is.
 *
 * ⚠️ IT IS SEPARATE FROM THE LINE ABOVE BECAUSE THE TWO GO IN DIFFERENT PLACES.
 * "Payment failed" fits under a plan name and in a row's second line; "this
 * workspace is read-only until 4 September" fits in neither, and putting it in
 * both is how a marketplace row came to render as "Payment failed — this
 * workspace is rea…". A state is a label; a consequence is a sentence.
 */
export const consequenceOf = (holding: Holding, day: (at: string) => string): string | null => {
  const { standing, reason, nextAt } = holding.standing;
  if (reason === "closing") {
    return nextAt
      ? `Everything here is kept until ${day(nextAt)} and erased after that. Cancelling the closure puts it back.`
      : "Everything here is kept until the closing date and erased after that.";
  }
  if (reason !== "arrears") return null;
  const now = standing === "grace" ? "Everything still works"
    : standing === "read_only" ? "This workspace is read-only — nothing is lost"
      : "This workspace is closed until it is paid";
  return nextAt ? `${now}, until ${day(nextAt)}.` : `${now}.`;
};

export interface PlanProps {
  readonly holding: Holding;
  /** ⚠️ False on a deployment with no payment provider — said, never hidden. */
  readonly chargeable: boolean;
  readonly onGo: (to: Where) => void;
  readonly onCancel: () => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function PlanScreen({
  holding, chargeable, onGo, onCancel, onBack, Heading = "h1",
}: PlanProps): ReactNode {
  const [asking, setAsking] = useState(false);
  const wrong = holding.standing.reason === "arrears";
  const closing = holding.standing.reason === "closing";
  const said = consequenceOf(holding, dayOf);

  return (
    <Screen leave="up" onLeave={onBack} name={holding.productName} sky="silk"
      title={<Title as={Heading}>{holding.productName}</Title>}
    >
      {/*
        ⚠️ THE HERO IS A STATE, NOT A HEADING. The plan's name at the size of a
        headline and the one sentence that matters under it — which is what
        somebody opened this to read, and what a list of rows makes them assemble
        for themselves out of four labels.
      */}
      <div className="hero">
        <span className="hero-name">{holding.planName ?? "No plan"}</span>
        {/*
          ⚠️ THE STATE IS THE LINE, AND ITS COLOUR IS THE WHOLE SIGNAL. This
          carried a "Needs attention" pill under it as well, which said nothing
          the words above it did not — a second capsule repeating the sentence it
          sits under is the texture this interface has a rule against. A line
          that goes amber is one thing changing, and it is impossible to miss.
        */}
        <span className="hero-said" data-tone={wrong ? "warn" : undefined}>{standsAs(holding, dayOf)}</span>
        {/* ⚠️ THE CONSEQUENCE IS A SENTENCE, and it is here rather than in the
            line above because "payment failed" fits under a plan name and "this
            workspace is read-only until 4 September" does not — see
            `consequenceOf`. */}
        {said ? <span className="hero-note">{said}</span> : null}
      </div>

      {/*
        ⚠️ THE TWO OR THREE THINGS SOMEBODY CAME TO DO, as a row rather than a
        stack of full-width buttons — which is a screen that looks like a
        decision when it is a menu. The third act is the one that changes: a
        subscription with a workspace opens it, and one without offers the door
        that makes it. That door is the whole recovery for somebody who paid and
        closed the tab, and it existed on the wire with nowhere to press it.
      */}
      <Quick
        acts={[
          /* ⚠️ PAYING COMES FIRST WHERE PAYING IS THE PROBLEM, and is absent
             everywhere else. A "Pay" circle on a subscription in good standing
             is an invitation to pay twice. */
          ...(wrong && holding.payAt
            ? [{ id: "pay", icon: <Wallet />, label: "Pay now", onGo: () => { location.href = holding.payAt!; } }]
            : []),
          { id: "plan", icon: <Swap />, label: "Change plan", onGo: () => onGo({ at: "shelf", product: holding.productId }) },
          { id: "credits", icon: <Add />, label: "Top up", onGo: () => onGo({ at: "credits" }) },
          /*
            ⚠️ AND NOTHING HERE FOR A SUBSCRIPTION WITH NO WORKSPACE, because the
            row below IS that control and it is the better one — it says why the
            door exists. A circle labelled "Set it up" above a row labelled "Set
            it up" is one destination offered twice, which is the same thing the
            workspace list stopped doing.
          */
          ...(holding.workspace
            ? [{ id: "open", icon: <Outward />, label: "Open", onGo: () => { location.href = holding.workspace!.at; } }]
            : []),
        ]}
      />

      {/*
        ⚠️ A SUBSCRIPTION WITH NOWHERE TO POINT SAYS SO IN WORDS TOO. The circle
        above is what somebody presses; this is what tells them why there is one —
        and it is the state that reads as money taken for nothing until it is
        named.
      */}
      {!holding.workspace && holding.setupAt ? (
        <Section>
          <Card>
            <Item
              title="Set it up"
              detail="You have paid for this. Making the workspace is the last step."
              away={holding.setupAt}
            />
          </Card>
        </Section>
      ) : null}

      {holding.workspace ? (
        <Section>
          <Card>
            <Item
              mark={<Mark kind="workspace" name={holding.workspace.name} product={holding.productId} className="alive" />}
              title={holding.workspace.name}
              detail="The workspace this pays for"
              away={holding.workspace.at}
            />
          </Card>
        </Section>
      ) : null}

      {holding.includes.length > 0 ? (
        <Section name="What it includes">
          <Card>
            {holding.includes.map((line) => (
              <Item
                key={line.key}
                title={line.label}
                action={
                  <span className="value">
                    {line.unlimited ? "Unlimited"
                      : typeof line.value === "boolean" ? (line.value ? "Included" : "—")
                        : line.value.toLocaleString()}
                  </span>
                }
              />
            ))}
          </Card>
        </Section>
      ) : null}

      {!chargeable ? (
        <Section>
          <p className="note">This deployment has no payment provider set up, so nothing is being charged.</p>
        </Section>
      ) : null}

      {/*
        ⚠️ ITS OWN CARD, AND NOT WRITTEN IN RED. A separate card is what says
        "this is not one of the things above"; red words in a list read as an
        error somebody has to fix. The colour goes on the symbol.

        ⚠️ AND IT IS ABSENT WHILE IT IS ALREADY CLOSING. Offering somebody the
        thing they have already done is how a second confirmation gets pressed by
        a person trying to undo the first.
      */}
      {closing ? null : (
        <Section>
          <Card>
            <Item icon={<Heartbreak />} tone="alarm" title="Cancel this subscription" onGo={() => setAsking(true)} />
          </Card>
        </Section>
      )}

      <Confirm
        open={asking}
        title="Cancel this subscription"
        /* ⚠️ IT NAMES WHAT SURVIVES AND FOR HOW LONG. "Are you sure?" is a
           question nobody can answer, because the thing being asked about is
           exactly what they do not know. */
        lede={holding.workspace
          ? `${holding.workspace.name} stays open until the end of what you have paid for, and is closed after that. Nothing is deleted before then.`
          : "Nothing has been set up on this yet, so nothing is lost."}
        verb="Cancel it"
        tone="alarm"
        onConfirm={onCancel}
        onClose={() => setAsking(false)}
      />
    </Screen>
  );
}
