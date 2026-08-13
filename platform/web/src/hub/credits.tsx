/**
 * CREDITS — one balance, every product, and the two kinds it is made of.
 *
 * ⚠️ A SINGLE TOTAL IS A NUMBER THAT DROPS OVERNIGHT. A plan grants an allowance
 * every period and it does not roll over; a pack is bought and never expires.
 * Shown as one figure, somebody watches it fall by three thousand on the first of
 * the month with nothing on the screen having said it would — and the support
 * conversation that follows is about whether we took their credits.
 *
 * ⚠️ SO THE SCREEN SAYS WHAT LEAVES AND WHEN, BEFORE IT LEAVES. That is the whole
 * job of the top of this page, and it is why the two halves are separate rows
 * rather than a tooltip on one.
 *
 * ⚠️ AND IT IS THE ACCOUNT'S, NOT A WORKSPACE'S. Credits bought once are spent
 * wherever somebody works, which is what makes this a hub screen rather than a
 * settings page inside one product.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Pill } from "../capsule.js";
import { Confirm } from "../confirm.js";
import { Blank, Card, Item, Waiting } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import { dayOf, money } from "./offer.js";

/* ------------------------------------------------------------------ shape --- */

export interface Balance {
  readonly total: number;
  readonly granted: number;
  readonly purchased: number;
  /** ⚠️ Null where nothing perishes, which is an account holding only packs. */
  readonly expiring: { readonly at: string; readonly amount: number } | null;
}

export interface Pack {
  readonly id: string;
  readonly name: string;
  readonly price: { readonly minor: number; readonly currency: string };
  readonly credits: number;
}

export interface Movement {
  readonly kind: string;
  /** Signed. A grant is positive, a spend negative — one column, one sum. */
  readonly amount: number;
  readonly reason: string;
  readonly productId: string | null;
  readonly at: string;
}

/**
 * What a ledger row was for, in the reader's words.
 *
 * ⚠️ THE REASON IS A MACHINE'S STRING AND MUST NOT REACH A SCREEN RAW.
 * `hold:draft-plan` is what the ledger stores and it is the right thing to store;
 * printed on a page it makes somebody's own spending look like a log file, which
 * is the surest way to make a balance feel like something being done TO them.
 */
export const saidAs = (reason: string): string => {
  const [kind, rest] = reason.split(":");
  if (kind === "allowance") return "Monthly allowance";
  if (kind === "pack") return "Credits bought";
  if (kind === "topup") return "Added by support";
  if (!rest) return kind ?? reason;
  /* ⚠️ The feature's own id, unhyphenated. It is the app's word for the thing
     somebody actually did, which is closer to their language than ours is. */
  return rest.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
};

const titled = (id: string): string => id.replace(/^./, (c) => c.toUpperCase());

/* ----------------------------------------------------------------- screen --- */

export interface CreditsProps {
  /** ⚠️ Null until known. `0` is a real answer and must not be shown while loading. */
  readonly balance: Balance | null;
  readonly history: readonly Movement[];
  readonly packs: readonly Pack[];
  readonly chargeable: boolean;
  readonly onBuy: (packId: string) => Promise<Problem | null>;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function CreditsScreen({
  balance, history, packs, chargeable, onBuy, onBack, Heading = "h1",
}: CreditsProps): ReactNode {
  const [asking, setAsking] = useState<Pack | null>(null);

  return (
    <Screen leave="up" onLeave={onBack} name="Credits" sky="silk"
      title={<Title as={Heading}>Credits</Title>}
    >
      {/*
        ⚠️ THE TOTAL IS THE HERO, NOT A ROW CALLED "Balance". It is the one number
        somebody opened this screen for, and as a row it was the same size and
        weight as "Bought" — a label and a figure, third in a stack of three,
        indistinguishable from its own components.

        ⚠️ AND IT WAITS RATHER THAN SHOWING A ZERO. `0` is a real answer and the
        one most likely to send somebody to support; shown for the length of a
        round trip it is a wrong answer wearing a loading state's excuse.
      */}
      <div className="hero">
        <span className="hero-name value">
          {balance === null ? <span className="waiting line short" /> : balance.total.toLocaleString()}
        </span>
        <span className="hero-said">
          {balance === null ? "" : balance.expiring
            ? `${balance.expiring.amount.toLocaleString()} expire on ${dayOf(balance.expiring.at)}`
            : "Credits, spendable in every product"}
        </span>
      </div>

      <Section>
        {balance === null ? <Waiting rows={2} /> : (
          <Card>
            {/*
              ⚠️ THE TWO HALVES UNDER THE TOTAL. Somebody arriving wants one
              number; somebody arriving because the number changed wants these
              two, and burying them behind a control means the second person
              leaves without an answer.
            */}
            {/* ⚠️ THE EXPIRY IS SAID ONCE, IN THE HERO. Repeated on this row it
                was the same sentence twice on one screen, forty pixels apart —
                which reads as two facts that happen to agree. */}
            {balance.granted > 0 ? (
              <Item
                title="From your plan"
                detail="Renewed every month, and does not roll over"
                action={<span className="value">{balance.granted.toLocaleString()}</span>}
              />
            ) : null}
            {balance.purchased > 0 ? (
              <Item
                title="Bought"
                /* ⚠️ SAID OUT LOUD, because the whole reason for two rows is that
                   one of them goes away and the other does not. */
                detail="No expiry"
                action={<span className="value">{balance.purchased.toLocaleString()}</span>}
              />
            ) : null}
          </Card>
        )}
      </Section>

      {packs.length > 0 ? (
        <Section name="Top up">
          <Card>
            {packs.map((pack) => (
              /*
                ⚠️ THE PRICE IS IN THE DETAIL, NOT ON THE RIGHT. A row either goes
                somewhere or carries an action, never both — with the price in the
                action slot this row stopped being pressable and the price
                disappeared, which on a shopping row is the one thing that may
                never be missing.
              */
              <Item
                key={pack.id}
                title={pack.name}
                detail={`${pack.credits.toLocaleString()} credits · ${money(pack.price)}`}
                onGo={chargeable ? () => setAsking(pack) : undefined}
              />
            ))}
          </Card>
          {/* ⚠️ SAID ONCE, UNDER THE THING IT IS ABOUT. Rows that quietly do
              nothing teach people the screen is broken. */}
          {!chargeable ? <p className="note">Nothing can be charged until this deployment has a payment provider.</p> : null}
        </Section>
      ) : null}

      <Section name="Where they went">
        {history.length === 0 ? (
          <Blank title="Nothing yet">Credits you are granted or spend will be listed here.</Blank>
        ) : (
          <Card>
            {history.map((row, i) => (
              <Item
                key={`${row.at}-${i}`}
                title={saidAs(row.reason)}
                /* ⚠️ THE PRODUCT'S NAME, NOT ITS ID. `kova` in a column of
                   sentences reads as a log line — and this screen is somebody's
                   own spending, which is the last place to make them feel they
                   are reading a machine's notes about them. */
                detail={`${dayOf(row.at)}${row.productId ? ` · ${titled(row.productId)}` : ""}`}
                /*
                  ⚠️ A SPEND AND A GRANT ARE THE SAME COLUMN WITH A SIGN, and the
                  sign is what a reader is scanning for. Two columns, or a colour
                  per row, is a ledger dressed as an alert list.
                */
                action={<span className="value">{row.amount > 0 ? `+${row.amount.toLocaleString()}` : row.amount.toLocaleString()}</span>}
              />
            ))}
          </Card>
        )}
      </Section>

      <Confirm
        open={asking !== null}
        title={asking ? `Buy ${asking.name}` : ""}
        lede={asking
          ? `${asking.credits.toLocaleString()} credits for ${money(asking.price)}. They do not expire, and they work in every product.`
          : ""}
        verb="Continue to payment"
        onConfirm={async () => (asking ? onBuy(asking.id) : null)}
        onClose={() => setAsking(null)}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------- row --- */

/**
 * The credits row on the hub's own home.
 *
 * ⚠️ IT CARRIES THE NUMBER, because a row that only says "Credits" is a row
 * somebody has to open to find out whether they need to. And it carries the
 * expiry as a pill only when there IS one — a state worth saying, said once.
 */
export const CreditsRow = ({ balance, onGo }: {
  readonly balance: Balance | null;
  readonly onGo: () => void;
}): ReactNode => (
  <Item
    title="Credits"
    detail={balance === null ? undefined : `${balance.total.toLocaleString()} left`}
    action={balance?.expiring ? <Pill tone="warn">Some expire soon</Pill> : undefined}
    onGo={onGo}
  />
);
