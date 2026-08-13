/**
 * THE MARKETPLACE — what there is to start, and the only place money is taken.
 *
 * ⚠️ THIS IS WHERE THE PARKING STATE WENT. A workspace used to be created first,
 * held on no plan, and gated until somebody paid — a product given away, kept
 * alive by a state whose only job was to be escapable. Buying first removes the
 * state and the gate together, so this screen is not a settings page that happens
 * to take a card: it is the step before a workspace can exist.
 *
 * ⚠️ AND IT IS A THIRD AREA, NOT A ROW IN THE ACCOUNT CENTRE. What you are is one
 * question, what you belong to is another, and what you may start is a third —
 * flattened into one list of settings, "new workspace" sits beside "change your
 * language", which is a purchase and a preference wearing the same row.
 *
 * ⚠️ NOTHING HERE MINTS ANYTHING PAID. A trial is free and this platform may
 * grant one; being paid up is a claim about money and only the thing that took it
 * may make it. Every paid path hands over to the provider and comes back.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Pill } from "../capsule.js";
import { Button } from "../button.js";
import { Confirm } from "../confirm.js";
import { Disclose } from "../disclose.js";
import { Card, Item, Blank, Waiting } from "../list.js";
import { Mark } from "../mark.js";
import { Screen, Section, Title } from "../screen.js";
import { Tiles } from "../tiles.js";
import { CreditsRow, type Balance } from "./credits.js";
import { dayOf, priceOf, type Included, type Plan } from "./offer.js";
import { standsAs, type Holding } from "./plan.js";
import type { Where } from "./routes.js";

/* ⚠️ RE-EXPORTED RATHER THAN MOVED OUT OF SIGHT. `offer.ts` exists to break an
   import cycle (see its header); the shelf is still where a reader looks for what
   a plan is, and a barrel that renamed them at the same time would be two
   vocabularies for one catalogue. */
export { priceOf, type Included, type Plan };

/* ------------------------------------------------------------------ shape --- */

/** One product on the shelf, as the hub sees it. */
export interface Sellable {
  readonly id: string;
  readonly name: string;
  readonly does: string;
  /** ⚠️ False where the person is not let in yet — see the provisioning grant. */
  readonly open: boolean;
}

/* ----------------------------------------------------------------- picker --- */

export interface MarketProps {
  readonly products: readonly Sellable[];
  /**
   * ⚠️ WHAT THIS ACCOUNT IS ALREADY ON, ABOVE WHAT IT COULD START. Somebody
   * opening the marketplace has usually come to deal with something they already
   * pay for — a card that failed, a trial about to end, a subscription bought
   * with no workspace on it — and a screen that opens with a shop makes them
   * look for the one screen that answers that. `null` waits.
   */
  readonly holdings?: readonly Holding[] | null;
  /** ⚠️ `undefined` is a deployment with no credits; `null` is "not yet known". */
  readonly balance?: Balance | null;
  readonly onGo: (to: Where) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}


/**
 * ⚠️ A PRODUCT SOMEBODY IS NOT LET INTO IS SHOWN AND SAID SO, NOT HIDDEN. Hiding
 * it makes the marketplace a different shape per person, so "where is Scena" has
 * no answer anybody can act on; saying so is one word and it names the way in.
 */
export function MarketScreen({
  products, holdings = null, balance, onGo, onBack, Heading = "h1",
}: MarketProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name="Marketplace" sky="silk"
      title={<Title as={Heading}>Marketplace</Title>}
      lede="Everything you can start, on one account."
    >
      {/*
        ⚠️ WHAT YOU ARE ON COMES FIRST, and a subscription with no workspace is
        the row this section exists for. Bought, paid, pointed at nothing — it was
        on the wire and on no screen, so somebody who closed the tab after paying
        had an empty workspace list and no address that would finish it.
      */}
      {holdings === null || holdings.length > 0 ? (
        <Section name="What you are on">
          {holdings === null ? <Waiting rows={1} /> : (
            <Card>
              {holdings.map((h) => (
                <Item
                  key={h.id}
                  mark={<Mark kind="product" name={h.productName} />}
                  title={h.productName}
                  titleAs="wordmark"
                  /* ⚠️ THE STATE ON THE SECOND LINE, from the same function the
                     plan screen's hero uses — two ways of saying "past due" is
                     two screens that can disagree about somebody's standing. */
                  detail={standsAs(h, dayOf)}
                  onGo={() => onGo({ at: "plan", subscription: h.id })}
                />
              ))}
            </Card>
          )}
        </Section>
      ) : null}

      {/*
        ⚠️ THE PRODUCTS ARE A GRID, NOT ROWS. A product on a shelf has a logo and
        a name and nothing else worth a line; set as rows that is a column of
        mostly empty space where the eye reads every label to find one it
        recognises. What it sells is on the shelf, which is one press away.
      */}
      <Section name={products.length > 0 ? "Start something new" : undefined}>
        {products.length === 0 ? (
          <Blank title="Nothing to start yet">No product on this deployment is being sold.</Blank>
        ) : (
          <Tiles
            tiles={products.map((p) => ({
              id: p.id,
              name: p.name,
              mark: <Mark kind="product" name={p.name} />,
              /* ⚠️ SHOWN AND SAID, NEVER HIDDEN. Hidden, the grid is a different
                 shape per person, so "where is Scena" has no answer anybody can
                 act on. */
              ...(p.open ? { onGo: () => onGo({ at: "shelf", product: p.id }) } : { said: "Not open to you" }),
            }))}
          />
        )}
      </Section>

      {/*
        ⚠️ CREDITS ARE HERE BECAUSE THEY ARE BOUGHT. Grouped with the workspaces
        they are spent in, a balance reads as one workspace's — which is how
        somebody comes to top up the wrong one.
      */}
      {balance !== undefined ? (
        <Section>
          <Card>
            <CreditsRow balance={balance} onGo={() => onGo({ at: "credits" })} />
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ shelf --- */

export interface ShelfProps {
  readonly product: Sellable;
  /** ⚠️ Null while it is being fetched. `[]` is "this product sells nothing". */
  readonly plans: readonly Plan[] | null;
  /**
   * ⚠️ WHETHER A TRIAL IS STILL AVAILABLE COMES FROM THE SERVER. It knows what
   * this account has already had; a screen that assumed would offer a free
   * fortnight the next screen takes back.
   */
  readonly trialAvailable: boolean;
  /** ⚠️ False on a deployment with no payment provider — said, never hidden. */
  readonly chargeable: boolean;
  readonly onStart: (planId: string) => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/**
 * ⚠️ THE CARD SAYS WHAT THE PLAN INCLUDES, FROM THE SAME DECLARATIONS THE GATE
 * ENFORCES. A price list written beside the enforcement drifts from it, and the
 * drift is discovered by somebody who bought a thing the product then refuses.
 */
export function ShelfScreen({
  product, plans, trialAvailable, chargeable, onStart, onBack, Heading = "h1",
}: ShelfProps): ReactNode {
  const [asking, setAsking] = useState<Plan | null>(null);

  return (
    <Screen leave="up" onLeave={onBack} name={product.name} sky="silk"
      title={<Title as={Heading}>{product.name}</Title>}
      lede={product.does}
    >
      {/*
        ⚠️ A DEPLOYMENT THAT CANNOT TAKE A PAYMENT SAYS SO HERE, at the top, once.
        A price list with buttons that all refuse is a screen that wastes
        somebody's decision before telling them it could not have been made.
      */}
      {!chargeable ? (
        <Section>
          <p className="note">This deployment has no payment provider set up, so nothing can be charged yet.</p>
        </Section>
      ) : null}

      <Section>
        {plans === null ? <Waiting /> : plans.length === 0 ? (
          <Blank title="Not on sale">This product has no plans yet.</Blank>
        ) : (
          <Card>
            {/*
              ⚠️ ONE ROW PER PLAN, AND WHAT IT INCLUDES IS UNDER IT RATHER THAN ON
              THE PAGE. Rendered flat, three plans of three entitlements is nine
              rows repeating the same three labels — and a real catalogue is four
              plans of eight, which is a wall somebody scrolls past to reach a
              button. Disclosed, the whole shelf is three lines, several can be
              open at once, and comparing is a thing somebody chooses to do.

              ⚠️ THE TRIAL IS IN THE DETAIL, NOT ON THE RIGHT. A row either goes
              somewhere or carries an action, never both — with a pill in the
              action slot this row stopped being pressable and the pill was the
              only thing on it. `item-detail` takes a capsule, which is the shape
              the workspace rows already use.
            */}
            {plans.map((plan) => (
              <Disclose
                key={plan.id}
                title={plan.name}
                detail={
                  <>
                    {priceOf(plan.price, plan.period)}
                    {trialAvailable && plan.trialDays > 0
                      ? <Pill tone="ok">{plan.trialDays} days free</Pill>
                      : null}
                  </>
                }
              >
                <Card>
                  {plan.includes.map((line) => (
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
                <div className="actions">
                  <Button tone="loud" wide onClick={() => setAsking(plan)}>
                    {trialAvailable && plan.trialDays > 0 ? "Start the trial" : `Choose ${plan.name}`}
                  </Button>
                </div>
              </Disclose>
            ))}
          </Card>
        )}
      </Section>

      {/*
        ⚠️ THE CONFIRMATION NAMES WHAT HAPPENS AND WHAT IT COSTS. A trial and a
        charge are different sentences, and a screen that used one for both is a
        screen that has surprised somebody with a bill.
      */}
      <Confirm
        open={asking !== null}
        title={asking ? (trialAvailable && asking.trialDays > 0 ? `Start ${asking.trialDays} days free` : `Subscribe to ${asking.name}`) : ""}
        lede={asking
          ? (trialAvailable && asking.trialDays > 0
            ? `Nothing is charged today. After ${asking.trialDays} days it is ${priceOf(asking.price, asking.period)}, and you can stop before then.`
            : `${priceOf(asking.price, asking.period)}, starting now.`)
          : ""}
        verb={asking && trialAvailable && asking.trialDays > 0 ? "Start the trial" : "Continue to payment"}
        onConfirm={async () => (asking ? onStart(asking.id) : null)}
        onClose={() => setAsking(null)}
      />
    </Screen>
  );
}
