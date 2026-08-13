/**
 * THE OPERATOR CONSOLE — the deployment's, not one product's.
 *
 * ⚠️ IT WAS ONE CONSOLE PER PRODUCT, and the cost was not tidiness. There is ONE
 * Stripe account, ONE Google account and ONE Turnstile widget behind every
 * product here, so three consoles meant three sign-ins and three places to paste
 * one key — and the copy nobody re-pasted failed in a way nobody attributed to
 * the rotation. The store is shared and its rows are keyed by app, so one door
 * writes them all.
 *
 * ⚠️ IT IS A PICKER FIRST AND A PANEL SECOND, because every question here starts
 * with "which product". A console that answered for whichever product happened
 * to be serving it is a console per product with extra steps.
 *
 * ⚠️ AND THE SHARED HALF IS ITS OWN PLACE RATHER THAN A COLUMN ON EVERY PRODUCT.
 * A key that belongs to the deployment shown inside each product's panel is a
 * key somebody edits from Kova's screen and is surprised to find changed in
 * Scena's — which is correct behaviour and reads as a bug, every time.
 */

import type { ElementType, ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Pill } from "../capsule.js";
import { Blank, Card, Item, Unset, Waiting } from "../list.js";
import { Mark } from "../mark.js";
import { Screen, Section, Title } from "../screen.js";
import { Tiles } from "../tiles.js";
import { money, type Included } from "./offer.js";
import type { Where } from "./routes.js";

/** One product, as `admin.apps` answers. */
export interface Product {
  readonly appId: string;
  readonly appName: string;
  readonly manifestVersion: string;
  /** How many plans carry an operator edit. `0` is a catalogue as shipped. */
  readonly changed: number;
}

export interface ConsoleProps {
  /** ⚠️ Null until known. `[]` is a deployment whose apps have not booted yet. */
  readonly products: readonly Product[] | null;
  readonly onGo: (to: Where) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function ConsoleScreen({ products, onGo, onBack, Heading = "h1" }: ConsoleProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name="Console" sky="silk"
      title={<Title as={Heading}>Console</Title>}
      lede="Every product on this deployment, and what they all share."
    >
      <Section name="Products">
        {products === null ? <Waiting rows={2} /> : products.length === 0 ? (
          /*
            ⚠️ AN EMPTY LIST IS A DEPLOYMENT WHOSE PRODUCTS HAVE NOT BOOTED, not a
            deployment with none — a declaration is published on a worker's first
            request, so a product nobody has visited since it deployed is absent.
            Saying that is the difference between a screen somebody waits on and
            one they open a ticket about.
          */
          <Blank title="Nothing has reported in yet">
            A product publishes what it declares the first time it serves a request.
          </Blank>
        ) : (
          <Tiles
            tiles={products.map((p) => ({
              id: p.appId,
              name: p.appName,
              mark: <Mark kind="product" name={p.appName} />,
              /* ⚠️ THE ONE FACT WORTH A SECOND LINE: whether somebody has edited
                 what this product sells. A version number is texture. */
              ...(p.changed > 0 ? { said: `${p.changed} edited` } : {}),
              onGo: () => onGo({ at: "product-config", product: p.appId }),
            }))}
          />
        )}
      </Section>

      <Section name="Shared by all of them">
        <Card>
          {/*
            ⚠️ ONE PLACE FOR THE KEYS EVERY PRODUCT READS. This is the row that
            replaces pasting a Stripe key three times — and the reason a rotated
            key is now one edit rather than three, one of which is forgotten.
          */}
          <Item
            title="Shared configuration"
            detail="The one Stripe account, the one mail lane, the one Turnstile widget"
            onGo={() => onGo({ at: "shared-config" })}
          />
          <Item title="Workspaces" detail="Every workspace on the deployment, whoever serves it" onGo={() => onGo({ at: "tenants" })} />
          <Item title="Maintenance" detail="Close every door, and say why" onGo={() => onGo({ at: "maintenance" })} />
        </Card>
      </Section>
    </Screen>
  );
}

/* ------------------------------------------------------------ one product --- */

/** One configuration key, as `admin.config` answers. */
export interface Key {
  readonly key: string;
  /** ⚠️ `true`/`false` for a SECRET: whether it is set, never what it is. */
  readonly value: string | boolean;
  readonly secret: boolean;
  readonly shared: boolean;
  readonly source: "app" | "shared" | "unset";
}

export interface KeysProps {
  /** The product these belong to, or `null` for the deployment's own shared store. */
  readonly product: { readonly id: string; readonly name: string } | null;
  readonly keys: readonly Key[] | null;
  readonly onEdit: (key: string) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
  /** ⚠️ False on a deployment that binds no shared store — said, never hidden. */
  readonly hasShared?: boolean;
}

/**
 * ⚠️ WHERE A VALUE CAME FROM IS THE COLUMN THAT MATTERS, and it is the one a
 * console usually omits. "It is set" and "it is set HERE" are different answers
 * with different fixes: an operator looking at a key that resolves from the
 * shared store and typing a local value has just pinned this product to a copy
 * that will not follow the next rotation, and nothing would tell them.
 */
export const saidAs = (key: Key): ReactNode => {
  if (key.source === "unset") return <Unset>Not set</Unset>;
  if (key.source === "shared") return <Pill tone="quiet">Shared</Pill>;
  return key.secret ? <Pill tone="ok">Set</Pill> : <span className="value">{String(key.value)}</span>;
};

export function KeysScreen({ product, keys, onEdit, onBack, Heading = "h1", hasShared = true }: KeysProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name={product ? product.name : "Shared"} sky="silk"
      title={<Title as={Heading}>{product ? product.name : "Shared configuration"}</Title>}
      lede={product
        ? "What this product reads, and where each value comes from. A secret can be set and never read back."
        : "Set once here, read by every product. A secret can be set and never read back."}
    >
      {/*
        ⚠️ A DEPLOYMENT WITH NO SHARED STORE SAYS SO AT THE TOP, once. Every key
        below would otherwise resolve from this product alone and look correct —
        which it is, and which is not what somebody reading this screen assumes.
      */}
      {!hasShared ? (
        <Section>
          <p className="note">This deployment binds no shared configuration store, so nothing here is shared.</p>
        </Section>
      ) : null}

      <Section>
        {keys === null ? <Waiting rows={4} /> : keys.length === 0 ? (
          <Blank title="Nothing to configure">This product reads no configuration.</Blank>
        ) : (
          <Card>
            {keys.map((k) => (
              /*
                ⚠️ THE KEY IS THE TITLE, verbatim. It is what an operator finds it
                by, what a deploy guide names, and what a support conversation
                quotes — a friendly label here would be a second name for one
                thing, and the one people say out loud is whichever they saw.
              */
              <Item
                key={k.key}
                title={k.key}
                /*
                  ⚠️ THE STATE IS IN THE DETAIL, NOT THE ACTION SLOT. A row goes
                  somewhere or carries something on the right, never both — and
                  putting it right makes the row unpressable AND silently drops
                  what was in it. That is three times in this hub: a trial pill, a
                  credit pack's price, and this. The rule is `Item`'s own and it
                  bites every screen that has a value and a destination.
                */
                /*
                  ⚠️ THE STATE IS IN THE DETAIL, NOT THE ACTION SLOT. A row goes
                  somewhere or carries something on the right, never both — and
                  putting it right makes the row unpressable AND silently drops
                  what was in it. That is `Item`'s own rule and it has bitten four
                  screens in this hub.

                  ⚠️ AND "write-only" IS SAID ONCE FOR THE SCREEN rather than on
                  every secret row. Repeated per row it wrapped to two lines and
                  made the secrets the tallest, loudest things on a list whose
                  subject is which keys are SET — a rule stated four times is
                  texture, and the sheet that edits one says it again where it
                  actually matters.
                */
                detail={saidAs(k)}
                onGo={() => onEdit(k.key)}
              />
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

/* --------------------------------------------------------------- catalogue --- */

/*
  ⚠️ THE SHELF'S OWN SHAPE, not a third copy. A plan's lines are `Included` in
  `offer.ts`; a console declaring its own would be the same list under two names,
  and the console is exactly where a mismatch would be read as a price change.
*/
export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly price: { readonly minor: number; readonly currency: string };
  readonly period: "month" | "year";
  readonly trialDays: number;
  readonly includes: readonly Included[];
  /** ⚠️ Whether an operator has moved this plan away from what shipped. */
  readonly edited?: boolean;
}

export interface CatalogueProps {
  readonly product: { readonly id: string; readonly name: string };
  readonly plans: readonly Plan[] | null;
  readonly onEdit: (planId: string) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

/**
 * ⚠️ AN EDITED PLAN IS MARKED, AND THAT IS THE WHOLE REASON THE DECLARATION IS
 * PUBLISHED. Without the shipped catalogue beside the overrides, every price on
 * this screen looks like the one the product was built with — so an operator
 * cannot tell their own change from the app's default, and the question they
 * open this screen with has no answer on it.
 */
export function CatalogueScreen({ product, plans, onEdit, onBack, Heading = "h1" }: CatalogueProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name={product.name} sky="silk"
      title={<Title as={Heading}>What {product.name} sells</Title>}
      lede="Declared by the product, and edited here."
    >
      <Section>
        {plans === null ? <Waiting rows={3} /> : plans.length === 0 ? (
          <Blank title="Not on sale">This product declares no plans.</Blank>
        ) : (
          <Card>
            {plans.map((p) => (
              <Item
                key={p.id}
                title={p.name}
                detail={
                  <>
                    {/* ⚠️ THE STOREFRONT'S OWN FORMATTER. A console with its own
                        is a console that can disagree with the price somebody was
                        actually charged, which is the one number here that has to
                        be right. */}
                    {money(p.price)} a {p.period}
                    {p.trialDays > 0 ? ` · ${p.trialDays} days free` : ""}
                    {p.edited ? <Pill tone="quiet">Edited</Pill> : null}
                  </>
                }
                onGo={() => onEdit(p.id)}
              />
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}
