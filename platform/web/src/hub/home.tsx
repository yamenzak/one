/**
 * THE HUB — three places, and nothing else on the page.
 *
 * ⚠️ IT WAS ONE LONG LIST AND THE LIST HAD NO SUBJECT. Your name, your passkeys,
 * your preferences, your vault, your workspaces, your credits, your legal record
 * and the button that closes everything, in one column — so "change my language"
 * and "start a business" were adjacent rows, and somebody arriving had to read
 * the whole page to find out what kind of place they were in.
 *
 * ⚠️ SO IT IS THREE CROWNS AND A NAME. What you ARE, what you BELONG TO, what
 * you MAY START. Each is a destination rather than a setting, which is exactly
 * what a crown says and exactly what a row does not — and the page is now
 * scanned in one pass rather than read.
 *
 * ⚠️ AND A CROWN IS NEVER DRAWN OVER NOTHING. The Marketplace is absent for
 * somebody who may open nothing and holds no credits — which is most people
 * holding an account here, because they are a customer of somebody else's
 * workspace. A named place with nothing in it is a promise the next screen
 * takes back.
 *
 * ⚠️ IT IS A MODAL ROUTE, NOT A TAB. The hub is presented OVER whatever somebody
 * was doing and returns them to it, which is why the way out is a dismiss rather
 * than a back arrow.
 */

import type { ElementType, ReactNode } from "react";
import { Lockup } from "../brand/mark.js";
import { Crown, HUES } from "../crown.js";
import { Screen, Section } from "../screen.js";
import type { Balance } from "./credits.js";
import type { Where } from "./routes.js";
import type { Workspace } from "./workspaces.js";

/**
 * ⚠️ ONE SHAPE FOR THE PERSON, DECLARED HERE AND IMPORTED. Three screens show a
 * name, an address and a face; declared per screen, the fourth one takes
 * `avatar` where the others take `avatarUrl` and nobody notices until a face is
 * missing on one screen out of four.
 */
export interface Person {
  readonly name?: string | null;
  readonly email: string;
  readonly avatarUrl?: string | null;
}

export interface HubHomeProps {
  readonly person: Person;
  /**
   * ⚠️ NULL UNTIL KNOWN, AND THE CROWN SAYS SO. `[]` is "you are in none", which
   * is a real answer somebody may need to see — rendering it during a round trip
   * is a wrong answer wearing a loading state's excuse.
   */
  readonly workspaces: readonly Workspace[] | null;
  readonly sharedCount?: number | null;
  /**
   * ⚠️ WHAT THIS PERSON MAY OPEN. Empty means no Marketplace at all — see the
   * header. It is the server's answer, from the provisioning grant, and never a
   * guess a screen makes.
   */
  readonly openable?: readonly { readonly id: string }[];
  /** ⚠️ `undefined` is a deployment with no credits; `null` is "not yet known". */
  readonly balance?: Balance | null;
  /**
   * ⚠️ WHETHER THIS PERSON RUNS THE DEPLOYMENT, and it draws a FOURTH crown.
   * Almost nobody holds this, which is exactly why it is a crown rather than a
   * row: an area that appears for one person in ten thousand must not make the
   * screen look different to everybody else, and three areas plus an absent one
   * is the same screen.
   */
  readonly operator?: boolean;
  readonly onGo: (to: Where) => void;
  readonly onClose: () => void;
  readonly Heading?: ElementType;
}

/**
 * ⚠️ THE FOOT OF EACH CROWN IS THE ONE FACT THAT SAVES OPENING IT, and the rule
 * is the same everywhere: `null` waits, a number speaks, and nothing at all is
 * better than a confident wrong answer. Somebody with four workspaces told
 * "None yet" for the length of a round trip is the defect this platform has a
 * written rule about.
 */
const workspacesFoot = (workspaces: readonly Workspace[] | null): ReactNode | null => {
  if (workspaces === null) return null;
  if (workspaces.length === 0) return "None yet";
  const wrong = workspaces.filter((w) => w.standing?.urgent).length;
  /* ⚠️ THE PROBLEM WINS THE LINE. A count of workspaces is a fact; one that needs
     attention is a reason, and only one of the two is worth the outside of the
     card. */
  if (wrong > 0) return `${wrong} ${wrong === 1 ? "needs" : "need"} attention`;
  return `${workspaces.length} ${workspaces.length === 1 ? "workspace" : "workspaces"}`;
};

const marketFoot = (openable: number, balance: Balance | null | undefined): ReactNode | null => {
  if (balance === null) return null;
  if (balance && balance.total > 0) return `${balance.total.toLocaleString()} credits`;
  return openable === 0 ? "Credits and top-ups" : `${openable} ${openable === 1 ? "product" : "products"} to start`;
};

export function HubHome({
  person, workspaces, sharedCount = null, openable = [], balance, operator = false, onGo, onClose, Heading = "h1",
}: HubHomeProps): ReactNode {
  const market = openable.length > 0 || balance !== undefined;

  return (
    <Screen
      leave="dismiss"
      onLeave={onClose}
      /* ⚠️ NAMED HERE, NOT PASSED IN. The hub is silk and it is not a choice a
         caller gets to make: the light is part of what this surface IS, the same
         way the lockup is, and a prop would let one app's hub look like a
         different product's. */
      sky="silk"
      name="Hub"
      /* ⚠️ THE LOCKUP IS THE TITLE, MARK INCLUDED, and the word is `Hub` rather
         than any of the three things under it. It holds an Account Center, a
         Workspace list and a Marketplace; naming it after one makes the other two
         look like they wandered in — which is how "new workspace" ended up beside
         "change your language". */
      title={<Heading className="page-title"><Lockup word="Hub" /></Heading>}
      lede={person.name ? `Signed in as ${person.name}` : person.email}
    >
      {/*
        ⚠️ ONE SECTION WITH NO NAME, because three crowns ARE the page. A heading
        over them would be naming the screen a second time, and the screen is
        already named by the lockup above.
      */}
      <Section>
        <Crown
          word="Account Center"
          hue={HUES.account}
          said="Your name, how you sign in, what you have agreed to, and the vault only you can open."
          foot={sharedCount === null ? null
            : sharedCount === 0 ? "Nothing shared"
              : `${sharedCount} ${sharedCount === 1 ? "thing" : "things"} shared`}
          onGo={() => onGo({ at: "account" })}
        />
        <Crown
          word="Workspaces"
          hue={HUES.workspaces}
          said="Everywhere you belong, across every product — and where each one stands."
          foot={workspacesFoot(workspaces)}
          onGo={() => onGo({ at: "workspaces" })}
        />
        {market ? (
          <Crown
            word="Marketplace"
            hue={HUES.market}
            said="Start something new, and top up the credits every product spends."
            foot={marketFoot(openable.length, balance)}
            onGo={() => onGo({ at: "market" })}
          />
        ) : null}
        {/*
          ⚠️ THE CONSOLE IS ABSENT FOR EVERYBODY WHO IS NOT AN OPERATOR, and the
          server decides — this is what stops it being OFFERED, never what stops
          it being reached. Every operation behind it carries `platform:operate`,
          which is held by nothing a workspace can grant.
        */}
        {operator ? (
          <Crown
            word="Console"
            hue={HUES.console}
            said="Every product on this deployment, what each one sells, and the keys they all share."
            onGo={() => onGo({ at: "console" })}
          />
        ) : null}
      </Section>
    </Screen>
  );
}
