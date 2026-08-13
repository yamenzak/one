/**
 * THE WORKSPACES — everywhere you belong, across every product.
 *
 * ⚠️ IT IS A LIST AND NOT A GRID, WHICH IS THE OPPOSITE CHOICE THE MARKETPLACE
 * MAKES, and the reason is what the second line carries. A product on a shelf
 * has a logo and a name; a workspace has a ROLE and a STANDING — "Kova · Owner",
 * "Payment failed" — and those are facts somebody scans for. A grid of marks
 * would hide the one thing that makes this list worth opening.
 *
 * ⚠️ A ROW OPENS THE WORKSPACE'S OWN SCREEN RATHER THAN THE WORKSPACE. For as
 * long as it left for another origin, the one place somebody could see all their
 * workspaces was the one place they could do nothing about any of them — and
 * "what does this one actually include" had no screen at all, in a product whose
 * whole billing model is ceilings. Opening the product is still one press, from
 * there, where it is a decision rather than the only thing the row does.
 *
 * ⚠️ AND STARTING ONE IS NOT HERE. That is the Marketplace, one level up: a
 * workspace is created against a subscription somebody buys, so the control
 * belongs where the buying is. This screen carried a "New workspace" row while
 * the Marketplace carried "Start something new" — one destination, two
 * vocabularies, and the section header that named the area read as decoration.
 */

import type { ElementType, ReactNode } from "react";
import { Pill } from "../capsule.js";
import { Blank, Card, Item, Waiting } from "../list.js";
import { Mark } from "../mark.js";
import { Screen, Section, Title } from "../screen.js";

/** ⚠️ The product's own word, so a row says what it is rather than an id. */
export type Product = "kova" | "tessa" | "scena";
const PRODUCT_NAME: Record<Product, string> = { kova: "Kova", scena: "Scena", tessa: "Tessa" };

export interface Workspace {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly product: Product;
  readonly role: string;
  readonly face?: string | null;
  /**
   * ⚠️ ONLY WHERE IT IS WORTH SAYING. A pill on every row is texture; a pill on
   * the one workspace that stopped paying is the reason somebody opened this.
   */
  readonly standing?: { readonly label: string; readonly urgent: boolean };
}

export interface WorkspacesProps {
  /** ⚠️ Null until known. `[]` is "you are in none", which is a real answer. */
  readonly workspaces: readonly Workspace[] | null;
  /** Where somebody with none is sent, when there is anything for them to start. */
  readonly onStart?: () => void;
  /** ⚠️ Its own screen in the hub, not the product — see the header. */
  readonly onOpen: (tenantId: string) => void;
  readonly onBack: () => void;
  readonly email: string;
  readonly Heading?: ElementType;
}

export function WorkspacesScreen({
  workspaces, onStart, onOpen, onBack, email, Heading = "h1",
}: WorkspacesProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name="Workspaces" sky="silk"
      title={<Title as={Heading}>Workspaces</Title>}
      lede="Everywhere you belong, across every product."
    >
      <Section>
        {workspaces === null ? <Waiting /> : workspaces.length === 0 ? (
          /*
            ⚠️ THE EMPTY STATE SAYS WHERE AN INVITATION ARRIVES, because that is
            the other way into a workspace and the one somebody in this state is
            usually waiting on. "You are in none" alone is a fact with no next
            step in it.
          */
          <Blank title="You are not in any workspace yet">
            An invitation arrives by email, at {email}.
          </Blank>
        ) : (
          <Card>
            {workspaces.map((w) => (
              <Item
                key={w.tenantId}
                mark={<Mark kind="workspace" src={w.face ?? undefined} name={w.name} product={w.product} className="alive" />}
                title={w.name}
                /* ⚠️ THE STANDING SITS ON THE SECOND LINE, WITH THE REST OF THE
                   METADATA. Beside the title it competed with the one thing that
                   identifies the row, and a workspace called "Corniche Screens"
                   was clipped to "Corniche Scre…" to make room for a pill. */
                detail={
                  <>
                    {PRODUCT_NAME[w.product]} · {w.role}
                    {w.standing ? <Pill tone={w.standing.urgent ? "warn" : "quiet"}>{w.standing.label}</Pill> : null}
                  </>
                }
                onGo={() => onOpen(w.tenantId)}
              />
            ))}
          </Card>
        )}
        {/*
          ⚠️ THE ONE PLACE THIS SCREEN OFFERS STARTING ONE, and only into an empty
          list. Somebody arriving from the website with nothing has a screen with
          a sentence on it; making them go back up and find a section header is
          making them read the page before they can act.
        */}
        {workspaces?.length === 0 && onStart ? (
          <Card>
            <Item title="Start one" detail="Choose a product and a plan" onGo={onStart} />
          </Card>
        ) : null}
      </Section>
    </Screen>
  );
}
