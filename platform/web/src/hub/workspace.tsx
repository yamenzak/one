/**
 * ONE WORKSPACE — what it includes, what it has chosen, and where it stands.
 *
 * ⚠️ THE WORKSPACE LIST WENT NOWHERE, which is the gap this fills. Every row on
 * it opened another origin, so the one place somebody can see all their
 * workspaces was the one place they could do nothing about any of them — and
 * "what does this workspace actually include" had no screen at all, in a product
 * whose whole billing model is ceilings.
 *
 * ⚠️ WHAT IT INCLUDES IS DERIVED FROM THE ENTITLEMENT WALK, never listed here.
 * The same resolution the gate performs — plan, then what the workspace was
 * grandfathered at, then what an operator adjusted — with its working shown. A
 * screen that listed the plan's own numbers would disagree with the gate for
 * exactly the workspaces somebody had helped, which are the ones most likely to
 * be looking.
 *
 * ⚠️ AND THE SETTINGS ARE THE PRODUCT'S DECLARATION, rendered. Nothing on this
 * screen names a setting; `declared.tsx` turns the manifest into controls, so a
 * setting added to a product appears here and one removed stops appearing.
 */

import type { ElementType, ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Pill } from "../capsule.js";
import { Away } from "../away.js";
import { Card, Item, Waiting } from "../list.js";
import { Mark } from "../mark.js";
import { Screen, Section, Title } from "../screen.js";
import { DeclaredSettings, type Declaration, type Values } from "./declared.js";
import type { Where } from "./routes.js";

/**
 * One RESOLVED ceiling, as `explainEntitlements` answers.
 *
 * ⚠️ IT IS NOT `Included`, WHICH IS THE SHELF'S. That is what a plan says it
 * gives; this is what the walk decided this workspace actually has, and the two
 * differ for precisely the workspaces somebody has helped. One name for both
 * would be the second vocabulary the barrel's own header warns about — and the
 * one people would quote is whichever they read first.
 *
 * ⚠️ `source` IS WHY THIS IS WORTH A SCREEN. A number alone cannot tell somebody
 * their studio has been held at what it was sold, or that support raised
 * something for them — and both are the reasons a workspace's ceilings differ
 * from the plan's, which is the question this answers.
 */
export interface Resolved {
  readonly key: string;
  readonly label: string;
  readonly value: number | boolean;
  readonly unlimited: boolean;
  /** What the plan alone would give. Shown only where it differs. */
  readonly plan?: number | boolean;
  readonly source: "plan" | "grandfathered" | "adjusted";
}

export interface WorkspaceProps {
  readonly workspace: {
    readonly tenantId: string;
    readonly name: string;
    readonly product: string;
    readonly productName: string;
    readonly role: string;
    /** Where this workspace actually is, so the row can leave for it. */
    readonly at: string;
    readonly face?: string | null;
  };
  /** ⚠️ Null until known. */
  readonly included: readonly Resolved[] | null;
  readonly plan: { readonly name: string; readonly said: string } | null;
  readonly declared: Declaration;
  readonly values: Values | null;
  readonly onSet: (key: string, value: string | number | boolean) => Promise<Problem | null>;
  /**
   * ⚠️ ABSENT MEANS THIS PERSON MAY NOT CHANGE ANYTHING HERE, which is the
   * ordinary case: most people in a workspace are not its owner. The settings
   * are still SHOWN — what a workspace has chosen is not a secret from the
   * people it applies to — and every control is stood down.
   */
  readonly mayWrite?: (key: string) => boolean;
  readonly onGo: (to: Where) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/** ⚠️ One shape for every ceiling, so `-1` never reaches a screen as a number. */
export const amountOf = (line: Resolved): string =>
  line.unlimited ? "Unlimited"
    : typeof line.value === "boolean" ? (line.value ? "Included" : "—")
      : line.value.toLocaleString();

export function WorkspaceScreen({
  workspace, included, plan, declared, values, onSet, mayWrite, onGo, onBack, Heading = "h1",
}: WorkspaceProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name={workspace.name} sky="silk"
      title={<Title as={Heading}>{workspace.name}</Title>}
      lede={`${workspace.productName} · ${workspace.role}`}
    >
      <Section>
        <Card>
          <Item
            mark={<Mark kind="workspace" src={workspace.face ?? undefined} name={workspace.name} product={workspace.product} className="alive" />}
            title="Open it"
            detail={`Go to ${workspace.name} in ${workspace.productName}`}
            away={workspace.at}
          />
          {/*
            ⚠️ THE PLAN IS A ROW HERE AND A SCREEN ONE LEVEL AWAY. What somebody
            needs on this screen is which plan and whether anything is wrong; the
            price, the renewal and the way out belong to the subscription, which
            is about the account rather than about this workspace.
          */}
          {plan ? (
            <Item title={plan.name} detail={plan.said} onGo={() => onGo({ at: "market" })} />
          ) : null}
        </Card>
      </Section>

      <Section name="What it includes">
        {included === null ? <Waiting rows={3} /> : (
          <Card>
            {included.map((line) => (
              <Item
                key={line.key}
                title={line.label}
                /*
                  ⚠️ ONLY A MOVED ROW IS TAGGED. A badge on every line is texture;
                  a badge on the two that differ from the plan is the answer to
                  "why does this workspace have more than the plan says".
                */
                detail={line.source === "plan" ? undefined : (
                  <>
                    {line.source === "grandfathered" ? "Held at what you were sold" : "Set for this workspace"}
                    <Pill tone="quiet">{line.source === "grandfathered" ? "Grandfathered" : "Adjusted"}</Pill>
                  </>
                )}
                action={<span className="value">{amountOf(line)}</span>}
              />
            ))}
          </Card>
        )}
      </Section>

      {/*
        ⚠️ AND THE SETTINGS ARE WHATEVER THE PRODUCT DECLARES. Nothing below names
        one — see the header.
      */}
      <DeclaredSettings declared={declared} values={values} onSet={onSet} {...(mayWrite ? { mayWrite } : {})} />
    </Screen>
  );
}
