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

import type { ReactNode } from "react";
import type { Sky } from "../sky.css.js";
import { Lockup } from "../brand/mark.js";

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
   * ⚠️ ONLY WHEN IT IS NOT FINE. A standing on every row is a column of green
   * nobody reads, and the one that matters stops standing out.
   */
  readonly standing?: { readonly label: string; readonly urgent: boolean };
}

export interface AccountHomeProps {
  readonly person: Person;
  /** ⚠️ A WORD, NEVER A GRADIENT. The page names the light; it does not draw it. */
  readonly sky?: Sky;
  /** ⚠️ `null` is NOT ANSWERED YET. `[]` is answered, and empty. */
  readonly workspaces: readonly Workspace[] | null;
  readonly onGo: (to: string) => void;
  readonly onClose: () => void;
}

/* ------------------------------------------------------------------ view --- */

const PRODUCT_NAME: Record<Product, string> = { kova: "Kova", scena: "Scena", tessa: "Tessa" };

export function AccountHome({ person, workspaces, sky = "silk", onGo, onClose }: AccountHomeProps) {
  return (
    <div className="page">
      {/* ⚠️ BEHIND THE TOP, NOT BEHIND THE PAGE. The light falls where the screen
          announces itself and is gone by the first card — a field that carried on
          under the content would be a tint, and a tint is paint. */}
      <div className="sky" data-sky={sky} aria-hidden="true" />
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
        <button type="button" className="round-button" aria-label="Close" onClick={onClose}><Close /></button>
        <h1><Lockup word="Account Center" /></h1>
      </header>

      <section>
        <div className="card">
          <Item icon={<Portrait />} title="Your details" detail="Your name, photo and address" onGo={() => onGo("account.profile")} />
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
          <div className="card">
            {workspaces.map((w) => (
              <Item
                key={w.tenantId}
                mark={<span className="well mark" data-product={w.product} aria-hidden="true">{w.name.slice(0, 1)}</span>}
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
        <div className="card">
          <Item icon={<Shield />} title="Consent and legal" detail="What you have agreed to" onGo={() => onGo("account.privacy")} />
          <Item icon={<Download />} title="Download your data" detail="Everything we hold about you" onGo={() => onGo("account.export")} />
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
    <button type="button" className="item" onClick={onGo}>
      {mark ?? (icon ? <span className="well" data-tone={iconTone}>{icon}</span> : null)}
      <span className="item-body">
        <span className="item-title">{title}</span>
        {detail ? <span className="item-detail">{detail}</span> : null}
      </span>
      <Chevron />
    </button>
  );
}

/* ⚠️ Drawn here rather than imported. Six glyphs is not a set worth a package,
   and a set is a decision to make once there are screens to make it for. */

const Glyph = ({ children }: { readonly children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none"
       stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const Chevron = (): ReactNode => (
  <svg className="chevron" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none"
       stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const Close = (): ReactNode => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"
       stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const Portrait = (): ReactNode => <Glyph><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></Glyph>;
const Key = (): ReactNode => <Glyph><circle cx="8.6" cy="15.4" r="4.4" /><path d="M11.8 12.2 20 4" /><path d="m16.6 7.4 2.6 2.6" /><path d="m14.2 9.8 2.6 2.6" /></Glyph>;
/* ⚠️ NOT `Sliders`. `slide` is another product's core noun, and the kernel's
   vocabulary guard refuses it in platform code precisely so a shared control and
   a product's own object cannot end up one letter apart in the same file. */
const Adjust = (): ReactNode => <Glyph><path d="M4 8h9M19 8h1M4 16h4M14 16h6" /><circle cx="16" cy="8" r="2.2" /><circle cx="11" cy="16" r="2.2" /></Glyph>;
const Shield = (): ReactNode => <Glyph><path d="M12 3.2 5 6v6c0 4.5 3 7.7 7 8.8 4-1.1 7-4.3 7-8.8V6z" /></Glyph>;
const Download = (): ReactNode => <Glyph><path d="M12 3.5v11m0 0 4-4m-4 4-4-4M4.5 19.5h15" /></Glyph>;
const Heartbreak = (): ReactNode => (
  <Glyph><path d="M12 20.2s-7.2-4.5-7.2-9.4A3.9 3.9 0 0 1 12 8.1a3.9 3.9 0 0 1 7.2 2.7c0 4.9-7.2 9.4-7.2 9.4Z" /><path d="m12 8.1-2 3.6h4L12 15.4" /></Glyph>
);
