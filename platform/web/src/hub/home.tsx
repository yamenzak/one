/**
 * THE ACCOUNT HOME — one person, everything they have, across every product.
 *
 * ⚠️ IT IS A MODAL ROUTE, NOT A TAB. The hub is presented OVER
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
import { Mark } from "../mark.js";
import { Lockup } from "../brand/mark.js";
import { Add, Adjust, Guard, Heartbreak, Key, Onward, Save } from "../icon.js";
import { Pill } from "../capsule.js";
import { Blank, Card, Item, Waiting } from "../list.js";
import type { Where } from "./routes.js";
import { CreditsRow, type Balance } from "./credits.js";
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

/** One product somebody may start something in, from `me.products`. */
export interface Openable {
  readonly id: string;
  readonly name: string;
  /** One line: what somebody would open a workspace here to do. */
  readonly does: string;
  /** ⚠️ Derived by the runtime from the product's root — never composed here. */
  readonly setupAt: string;
}

export interface HubHomeProps {
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
  /**
   * PRODUCTS THIS PERSON MAY OPEN A WORKSPACE IN — `me.products`.
   *
   * ⚠️ AN EMPTY LIST IS THE ORDINARY CASE AND IT DRAWS NOTHING. Most people with
   * an account here are somebody's client or somebody's colleague; a "New
   * workspace" button on their hub offers them a thing they cannot do
   * and would not want, and the refusal they would meet says so far too late.
   *
   * ⚠️ AND IT IS NOT WHAT MAKES THE CONTROL SAFE. `identity.workspace.create`
   * refuses an address with no grant on a product that is sold — a button the
   * screen does not draw is a decoration, and the route is in the API document.
   */
  readonly openable?: readonly Openable[];
  /**
   * ⚠️ A DESTINATION, NOT A NAME. It was a string — `"account.profile"` — matched
   * by whoever mounted the surface, so a row could name a screen nobody had built
   * and the only symptom was a press that did nothing. Every row here now hands
   * back an address the router can parse and print, which makes an unbuilt
   * destination a type error rather than a dead control.
   */
  readonly onGo: (to: Where) => void;
  /**
   * ⚠️ IT LEAVES FOR THE PRODUCT'S OWN SETUP DOOR, which is the only place a
   * workspace is created. The hub is served by one worker and every
   * other product is a different one — creating a Kova workspace from here would
   * mean this worker writing a membership into Kova's regional store, which it has
   * no binding for and must never have. So this hands over rather than doing it.
   */
  /**
   * ⚠️ THE BALANCE, AND `undefined` MEANS THIS DEPLOYMENT HAS NO CREDITS AT ALL —
   * which is different from `null`, meaning it has some and they are still being
   * fetched. A section that rendered a confident zero during a round trip is the
   * same bug as one that renders an empty list as a fact.
   */
  readonly balance?: Balance | null;
  /**
   * ⚠️ LEAVING THE ACCOUNT CENTRE IS NOT A DESTINATION INSIDE IT. A workspace row
   * goes INTO that workspace — another product, at another address, outside this
   * surface entirely — so it cannot be a `Where`, and folding it into `onGo`
   * would put a route in the union that no screen here can ever render.
   */
  readonly onOpenWorkspace: (tenantId: string) => void;
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

/**
 * ⚠️ IT SAYS WHAT IT MAKES, NOT WHAT IT OPENS. "New workspace" is the thing
 * somebody gets; "Create" is what the button does to the database.
 *
 * ⚠️ AND IT GOES TO THE MARKETPLACE RATHER THAN STRAIGHT TO A SETUP DOOR. A
 * workspace is created against a subscription somebody already started, so the
 * step between here and the door is choosing a plan — this row used to open a
 * picker of products and hand over, which skipped the one question that has to be
 * answered before a workspace can exist at all.
 */
const StartRow = ({ onGo }: { readonly onGo: () => void }): ReactNode => (
  <Item icon={<Add />} title="New workspace" detail="Choose a plan" onGo={onGo} />
);

export function HubHome({
  person, workspaces, sharedCount = null, openable = [], balance, onGo, onOpenWorkspace, onClose, Heading = "h1",
}: HubHomeProps): ReactNode {
  return (
    <Screen
      leave="dismiss"
      onLeave={onClose}
      /* ⚠️ NAMED HERE, NOT PASSED IN. The hub is silk and it is not a
         choice a caller gets to make: the light is part of what this surface IS,
         the same way the lockup is, and a prop would let one app's hub
         look like a different product's. */
      sky="silk"
      /* ⚠️ THE LOCKUP IS THE TITLE, MARK INCLUDED. This surface belongs to the
         account rather than to the product the person happens to be in, and the
         mark beside the name is what says so — a bare word here is the name of a
         settings page, which is exactly what this is not.

         ⚠️ AND THE WORD IS `Hub` RATHER THAN ANY OF THE THREE THINGS UNDER IT.
         It holds an Account Center, a Workspace Hub and a Marketplace, and
         naming it after one of them makes the other two look like they wandered
         in — which is how "new workspace" ended up beside "change your
         language". */
      title={<Heading className="page-title"><Lockup word="Hub" /></Heading>}
    >
      <Section name="Account Center">
        <Card>
          {/* ⚠️ THEIR OWN FACE, NOT A DRAWING OF A PERSON. Every other row on this
              card is named by a symbol because it is about a KIND of thing; this
              one is about them, and the same generated face they will see on the
              screen it opens is what says so. */}
          <Item
            mark={<Mark kind="person" src={person.avatarUrl} name={person.name ?? person.email} className="alive" />}
            title="Your details" detail="Your name, photo and address"
            onGo={() => onGo({ at: "details" })}
          />
          <Item icon={<Key />} title="Sign-in methods" detail="Passkeys, codes and devices" onGo={() => onGo({ at: "security" })} />
          <Item icon={<Adjust />} title="Preferences" detail="Theme, language, units and feedback" onGo={() => onGo({ at: "preferences" })} />
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
      <VaultCrown shared={sharedCount} onGo={() => onGo({ at: "vault" })} />

      <Section name="Workspace Hub">
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
                mark={<Mark kind="workspace" src={w.face} name={w.name} product={w.product} className="alive" />}
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
                onGo={() => onOpenWorkspace(w.tenantId)}
              />
            ))}
            {/*
              ⚠️ NOTHING HERE, BECAUSE THE MARKETPLACE IS RIGHT BELOW. This
              carried a "New workspace" row while the Marketplace section carried
              "Start something new" — two controls, one destination, a screen
              saying the same thing twice in two vocabularies. The named area
              wins: a duplicate makes the section header decoration.
            */}
          </Card>
        )}
        {/*
          ⚠️ AND IT IS OFFERED HERE WITH NO WORKSPACES AT ALL, which is the one
          case where the duplicate is not one: an empty list, an invitation that
          has not come, and the single thing somebody arriving from the website
          came to do. Making them find a section header first is making them read
          the page before they can act on it.
        */}
        {workspaces?.length === 0 && openable.length ? (
          <Card>
            <StartRow onGo={() => onGo({ at: "market" })} />
          </Card>
        ) : null}
      </Section>

      {/*
        ⚠️ CREDITS ARE THE ACCOUNT'S AND SO THEY ARE HERE, not inside a product.
        Bought once and spent wherever somebody works, a balance shown only inside
        one workspace is a number that looks like that workspace's — which is how
        somebody comes to top up the wrong one.
      */}
      {/*
        ⚠️ THE MARKETPLACE IS THE THIRD AREA AND IT IS NAMED, not implied by a
        button in somebody else's list. Credits sit under it because they are
        BOUGHT — grouped with the workspaces they are spent in, a balance reads
        as one workspace's, which is how somebody comes to top up the wrong one.
      */}
      {openable.length || balance !== undefined ? (
        <Section name="Marketplace">
          <Card>
            {openable.length ? (
              <Item icon={<Add />} title="Start something new" detail="Every product on one account" onGo={() => onGo({ at: "market" })} />
            ) : null}
            {balance !== undefined ? <CreditsRow balance={balance} onGo={() => onGo({ at: "credits" })} /> : null}
          </Card>
        </Section>
      ) : null}

      <Section name="Privacy">
        <Card>
          <Item icon={<Guard />} title="Consent and legal" detail="What you have agreed to" onGo={() => onGo({ at: "legal" })} />
          <Item icon={<Save />} title="Download your data" detail="Everything we hold about you" onGo={() => onGo({ at: "export" })} />
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
          <Item icon={<Heartbreak />} tone="alarm" title="Close your account" onGo={() => onGo({ at: "close" })} />
        </Card>
      </Section>
    </Screen>
  );
}

/**
 * THE VAULT, AS A PLACE.
 *
 * ⚠️ IT CARRIES ITS OWN LIGHT AND ITS OWN LOCKUP, which is what makes it read as
 * somewhere rather than as a row that got bigger. The hub's own name
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
    {/*
      ⚠️ IT DESCRIBES THE MECHANISM, NEVER THE CONTENTS. It said "your body, your
      health, your goals", which is one product's list of data categories written
      into a package every product draws from — and the vault is not a coaching
      feature: the same card stands over a company's record of an employee. A
      surface that enumerates what it holds also has to be edited every time an
      app declares a fact, and no app can edit this file.
    */}
    <span className="crown-said">
      Sensitive things about you, held by your account — you choose who sees each
      one, and for how long.
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
