/**
 * THE ACCOUNT HOME — one person, everything they have, across every product.
 *
 * ⚠️ IT IS A MODAL ROUTE, NOT A TAB. The account centre is presented OVER
 * whichever app the person is in and rendered outside that app's shell — so there
 * is no navigation bar, no tabs and no product chrome on it, and the way out is a
 * CLOSE rather than a back.
 *
 * ⚠️ IT LIVES AT `/account` IN EVERY APP rather than at a door of its own. The
 * session is per-app by design (PLAN §2.4), so a separate origin would mean
 * signing in again to manage the account you are already signed into — and it
 * would be a fourth product to brand.
 *
 * ⚠️ AND IT IS NOW ALMOST ENTIRELY VOCABULARY. What is left in this file is the
 * ARRANGEMENT: which rows, in what order, under which names. Every shape it is
 * drawn with came out of it and moved to `screen.tsx`, `list.tsx` and `ui.css.ts`
 * — which is what makes the next screen an afternoon rather than a week.
 */

import type { CSSProperties, ElementType, ReactNode } from "react";
import { Face } from "../avatar.js";
import { Lockup } from "../brand/mark.js";
import { Adjust, Guard, Heartbreak, Key, Onward, Save } from "../icon.js";
import { Blank, Card, Item, Pill, Waiting } from "../list.js";
import { Screen, Section } from "../screen.js";

/* ------------------------------------------------------------------ data --- */

export interface Person {
  readonly name?: string;
  readonly email: string;
  /** The generated face, or the photograph they uploaded instead. */
  readonly avatarUrl?: string;
}

/** One product a workspace belongs to. Not `app`: an app is a deployment. */
export type Product = "kova" | "scena" | "tessa";

export interface Workspace {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly product: Product;
  /** What this person is here. The membership row's role. */
  readonly role: string;
  /**
   * ⚠️ THE WORKSPACE'S OWN MARK. When it has uploaded one that is what it looks
   * like; otherwise this is the generated face, which the API produces from the
   * workspace id and serves from a URL that can be cached forever.
   */
  readonly face?: string;
  /**
   * ⚠️ ONLY WHEN IT IS NOT FINE. A standing on every row is a column of green
   * nobody reads, and the one that matters stops standing out.
   */
  readonly standing?: { readonly label: string; readonly urgent: boolean };
}

export interface AccountHomeProps {
  readonly person: Person;
  /** ⚠️ `null` is NOT ANSWERED YET. `[]` is answered, and empty. */
  readonly workspaces: readonly Workspace[] | null;
  /**
   * HOW MANY OF THEIR OWN FACTS ARE SHARED WITH ANYBODY, RIGHT NOW.
   *
   * ⚠️ A COUNT AND NOTHING ELSE. Which facts and with whom is the vault's own
   * screen; putting either on a card here would be somebody's body on the first
   * page of their account, readable by whoever is standing behind them.
   *
   * ⚠️ AND `null` IS NOT ANSWERED YET, which keeps the card whole while the
   * number is coming. The card is a DESTINATION — it renders and is pressable
   * with no answer at all — so only the fact waits, and "Nothing shared" is
   * never shown to somebody who is sharing four things.
   */
  readonly sharedCount?: number | null;
  readonly onGo: (to: string) => void;
  readonly onClose: () => void;
  /**
   * ⚠️ THE ELEMENT THAT NAMES THE SCREEN BELONGS TO WHOEVER PRESENTS IT. Standing
   * on its own this is an `h1`; inside a dialog the title is what LABELS the
   * dialog, so the presenter passes its own and the name exists once.
   */
  readonly Heading?: ElementType;
}

/* ------------------------------------------------------------------ view --- */

const PRODUCT_NAME: Record<Product, string> = { kova: "Kova", scena: "Scena", tessa: "Tessa" };

export function AccountHome({ person, workspaces, sharedCount = null, onGo, onClose, Heading = "h1" }: AccountHomeProps): ReactNode {
  return (
    <Screen
      leave="dismiss"
      onLeave={onClose}
      /* ⚠️ NAMED HERE, NOT PASSED IN. The account centre is silk and it is not a
         choice a caller gets to make: the light is part of what this surface IS,
         the same way the lockup is, and a prop would let one app's account centre
         look like a different product's. */
      sky="silk"
      /* ⚠️ THE LOCKUP IS THE TITLE, MARK INCLUDED. This surface belongs to the
         account rather than to the product the person happens to be in, and the
         mark beside the name is what says so — "Account Center" on its own is the
         name of a settings page, which is exactly what this is not. */
      title={<Heading className="page-title"><Lockup word="Account Center" /></Heading>}
    >
      <Section>
        <Card>
          {/* ⚠️ THEIR OWN FACE, NOT A DRAWING OF A PERSON. Every other row on this
              card is named by a symbol because it is about a KIND of thing; this
              one is about them, and the same generated face they will see on the
              screen it opens is what says so. */}
          <Item
            mark={<Face kind="person" src={person.avatarUrl} name={person.name ?? person.email} className="well alive" />}
            title="Your details" detail="Your name, photo and address"
            onGo={() => onGo("account.profile")}
          />
          <Item icon={<Key />} title="Sign-in methods" detail="Passkeys, codes and devices" onGo={() => onGo("account.security")} />
          <Item icon={<Adjust />} title="Preferences" detail="Theme, language, units and feedback" onGo={() => onGo("account.preferences")} />
        </Card>
      </Section>

      {/*
        ⚠️ A CARD OF ITS OWN, AND NOT A ROW, because it is not the same kind of
        thing as the three above it. Those are settings — somewhere to go and
        change something. This is a PLACE: the one part of the account that is
        not about using a product, and the only part that keeps its meaning for
        somebody who has left every product.

        ⚠️ ON THE ACCOUNT'S OWN SURFACE RATHER THAN UNDER AN APP, for the same
        reason. A fact here belongs to the person and outlives every product they
        use; a vault reachable only from inside the app that wanted the data
        would be a control somebody loses by leaving.
      */}
      <VaultCrown shared={sharedCount} onGo={() => onGo("account.vault")} />

      <Section name="Workspaces">
        {workspaces === null ? (
          <Waiting />
        ) : workspaces.length === 0 ? (
          <Blank title="You are not in any workspace yet">
            An invitation arrives by email, at {person.email}.
          </Blank>
        ) : (
          <Card>
            {workspaces.map((w) => (
              <Item
                key={w.tenantId}
                mark={<Face kind="workspace" src={w.face} name={w.name} tone={w.product} className="well alive" />}
                title={w.name}
                /* ⚠️ THE STANDING SITS ON THE SECOND LINE, WITH THE REST OF THE
                   METADATA. Beside the title it competed with the one thing that
                   identifies the row, and a workspace called "Corniche Screens"
                   was clipped to "Corniche Scre…" to make room for a pill. */
                detail={
                  <>
                    {PRODUCT_NAME[w.product]} · {w.role}
                    {w.standing ? <Pill urgent={w.standing.urgent}>{w.standing.label}</Pill> : null}
                  </>
                }
                onGo={() => onGo(`workspace:${w.tenantId}`)}
              />
            ))}
          </Card>
        )}
      </Section>

      <Section name="Privacy">
        <Card>
          <Item icon={<Guard />} title="Consent and legal" detail="What you have agreed to" onGo={() => onGo("account.privacy")} />
          <Item icon={<Save />} title="Download your data" detail="Everything we hold about you" onGo={() => onGo("account.export")} />
        </Card>
      </Section>

      {/*
        ⚠️ THE IRREVERSIBLE ONE IS ITS OWN CARD, and it is not written in red. A
        separate card is what says "this is not one of the settings above"; red
        words in a list of settings read as an error somebody has to fix. The
        colour goes on the SYMBOL, which is where a warning belongs.
      */}
      <Section>
        <Card>
          <Item icon={<Heartbreak />} tone="alarm" title="Close your account" onGo={() => onGo("account.delete")} />
        </Card>
      </Section>
    </Screen>
  );
}

/**
 * THE VAULT, AS A PLACE.
 *
 * ⚠️ IT CARRIES ITS OWN LIGHT AND ITS OWN LOCKUP, which is what makes it read as
 * somewhere rather than as a row that got bigger. The account centre's own name
 * is set the same way one screen up — mark and word as one object — so a second
 * lockup inside it says, in the only vocabulary the surface has, that this is a
 * thing of the same order and not a setting.
 *
 * ⚠️ THE LIGHT IS A DIFFERENT HUE FROM THE PAGE'S, AND ONLY THE HUE. Same
 * mechanism, same variant, one number moved — so it is unmistakably its own
 * without being a second design. A card lit exactly like the page behind it
 * would be a card with a gradient in it.
 *
 * ⚠️ AND THE WHOLE CARD IS THE TARGET. A button inside it would be a second
 * thing to hit on one surface, and the surface is already the thing being
 * offered.
 */
const VaultCrown = ({ shared, onGo }: {
  readonly shared: number | null;
  readonly onGo: () => void;
}): ReactNode => (
  <button type="button" className="crown press" onClick={onGo}>
    {/*
      ⚠️ AURORA RATHER THAN THE PAGE'S SILK. Silk is ribbons across a wide field
      and needs the width to read as fabric; at card size it is two bright
      streaks. Aurora is three broad sources with a wide falloff, which is what
      still reads as light in something small.
    */}
    <div className="sky" data-sky="aurora" data-in="card" style={{ "--sky-h": 268 } as CSSProperties} aria-hidden="true" />
    <span className="crown-name"><Lockup word="Vault" /></span>
    <span className="crown-said">
      Your body, your health, your goals — kept here rather than in any app that
      asks. You choose who sees each one, and for how long.
    </span>
    <span className="crown-foot">
      {/* ⚠️ THE FACT WAITS AND THE CARD DOES NOT. A destination renders with no
          answer at all; only the number is unknown, and "Nothing shared" shown
          to somebody sharing four things is worse than showing nothing. */}
      {shared === null ? <span className="waiting line short" /> : null}
      {shared === 0 ? "Nothing is shared" : null}
      {shared !== null && shared > 0 ? `${shared} ${shared === 1 ? "thing is" : "things are"} shared` : null}
      <Onward className="chevron" />
    </span>
  </button>
);
