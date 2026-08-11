/**
 * THE ACCOUNT HOME — one person, everything they have, across every product.
 *
 * ⚠️ IT IS A MODAL ROUTE, NOT A TAB. The account centre is presented OVER
 * whichever app the person is in and rendered outside that app's shell — so
 * there is no navigation bar, no tabs and no product chrome on it, and the way
 * out is a CLOSE rather than a back. That is why the top-left control is an ×
 * here and an arrow on every screen below it: × dismisses the presentation, ←
 * goes up inside it.
 *
 * ⚠️ IT LIVES AT `/account` IN EVERY APP rather than at a door of its own. The
 * session is per-app by design (PLAN §2.4), so a separate origin would mean
 * signing in again to manage the account you are already signed into — and it
 * would be a fourth product to brand.
 *
 * ⚠️ THE SHAPE FOLLOWS A REFERENCE AND NOTHING HERE IS EXTRACTED YET. Components,
 * tokens, rules and guards come after the screens are agreed, not before.
 */

import type { ElementType, ReactNode } from "react";
import { Face } from "../avatar.js";
import { Lockup } from "../brand/mark.js";
import { Adjust, Close, Guard, Heartbreak, Key, Onward, Save } from "../icon.js";

/* ------------------------------------------------------------------ data --- */

export interface Person {
  readonly name?: string;
  readonly email: string;
  /** `accounts.avatar_url` exists; nothing writes it yet. */
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
  readonly onGo: (to: string) => void;
  readonly onClose: () => void;
  /**
   * ⚠️ THE ELEMENT THAT NAMES THE SCREEN BELONGS TO WHOEVER PRESENTS IT. Standing
   * on its own this is an `h1`; inside a dialog the title is what LABELS the
   * dialog, so the presenter passes its own and the name exists once. The
   * alternative — a visually hidden second copy — is a name written twice, and
   * then changed in one place.
   */
  readonly Heading?: ElementType;
}

/* ------------------------------------------------------------------ view --- */

const PRODUCT_NAME: Record<Product, string> = { kova: "Kova", scena: "Scena", tessa: "Tessa" };

export function AccountHome({ person, workspaces, onGo, onClose, Heading = "h1" }: AccountHomeProps) {
  return (
    <div className="page stagger">
      {/* ⚠️ BEHIND THE TOP, NOT BEHIND THE PAGE. The light falls where the screen
          announces itself and is gone by the first card — a field that carried on
          under the content would be a tint, and a tint is paint. */}
      {/* ⚠️ NAMED HERE, NOT PASSED IN. The account centre is silk and it is not a
          choice a caller gets to make: the light is part of what this surface IS,
          the same way the lockup is, and a prop would let one app's account centre
          look like a different product's. */}
      <div className="sky" data-sky="silk" aria-hidden="true" />
      {/*
        ⚠️ THE LOCKUP IS THE TITLE, MARK INCLUDED. This surface belongs to the
        account rather than to the product the person happens to be in, and the
        mark beside the name is what says so — "Account Center" on its own is the
        name of a settings page, which is exactly what this is not. Nothing else
        names the screen.
      */}
      <header className="page-top">
        {/* ⚠️ × AND NOT AN ARROW. This is the root of a presentation laid over the
            app, so the control dismisses it rather than walking back through it. */}
        <button type="button" className="round-button press" aria-label="Close" onClick={onClose}><Close /></button>
        <Heading className="page-title"><Lockup word="Account Center" /></Heading>
      </header>

      <section>
        <div className="card stagger">
          {/* ⚠️ THEIR OWN FACE, NOT A DRAWING OF A PERSON. Every other row on this
              card is named by a symbol because it is about a KIND of thing; this
              one is about them, and the same generated face they will see on the
              screen it opens is what says so. It is also the only row whose mark
              is different every time somebody else looks at it. */}
          <Item
            mark={<Face kind="person" src={person.avatarUrl} name={person.name ?? person.email} className="well alive" />}
            title="Your details" detail="Your name, photo and address" onGo={() => onGo("account.profile")}
          />
          <Item icon={<Key />} title="Sign-in methods" detail="Passkeys, codes and devices" onGo={() => onGo("account.security")} />
          <Item icon={<Adjust />} title="Preferences" detail="Units, language and dates" onGo={() => onGo("account.preferences")} />
        </div>
      </section>

      <section>
        <h2>Workspaces</h2>
        {workspaces === null ? (
          /* ⚠️ It holds the shape of what is coming, or the page jumps under
             whoever had started reading it. */
          <div className="card" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div className="item" key={i}>
                <span className="well waiting" />
                <span className="item-body">
                  <span className="waiting line" />
                  <span className="waiting line short" />
                </span>
              </div>
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div className="card blank">
            <p className="blank-title">You are not in any workspace yet</p>
            <p className="lede">An invitation arrives by email, at {person.email}.</p>
          </div>
        ) : (
          <div className="card stagger">
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
                    {w.standing ? <span className="pill" data-urgent={w.standing.urgent ? "" : undefined}>{w.standing.label}</span> : null}
                  </>
                }
                onGo={() => onGo(`workspace:${w.tenantId}`)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Privacy</h2>
        <div className="card stagger">
          <Item icon={<Guard />} title="Consent and legal" detail="What you have agreed to" onGo={() => onGo("account.privacy")} />
          <Item icon={<Save />} title="Download your data" detail="Everything we hold about you" onGo={() => onGo("account.export")} />
        </div>
      </section>

      {/*
        ⚠️ THE IRREVERSIBLE ONE IS ITS OWN CARD, and it is not written in red. A
        separate card is what says "this is not one of the settings above"; red
        words in a list of settings read as an error somebody has to fix. The
        colour goes on the SYMBOL, which is where a warning belongs.
      */}
      <section>
        <div className="card">
          <Item icon={<Heartbreak />} iconTone="alarm" title="Close your account" onGo={() => onGo("account.delete")} />
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- parts --- */

/* ⚠️ Local on purpose. Used several times on ONE screen, which is not yet
   evidence that the platform needs them — a second SCREEN is. */

function Item({ icon, mark, title, detail, iconTone, onGo }: {
  readonly icon?: ReactNode;
  readonly mark?: ReactNode;
  readonly title: string;
  readonly detail?: ReactNode;
  readonly iconTone?: "alarm";
  readonly onGo: () => void;
}) {
  return (
    <button type="button" className="item press-flat" onClick={onGo}>
      {mark ?? (icon ? <span className="well" data-tone={iconTone}>{icon}</span> : null)}
      <span className="item-body">
        <span className="item-title">{title}</span>
        {detail ? <span className="item-detail">{detail}</span> : null}
      </span>
      <Onward className="chevron" />
    </button>
  );
}
