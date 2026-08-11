/**
 * THE ACCOUNT HOME — one person, everything they have, across every product.
 *
 * ⚠️ THIS IS THE FIRST SCREEN IN `platform/`, and nothing is extracted out of it
 * yet. There is no design system underneath it on purpose: the components come
 * out of screens once a second screen needs the same thing, and the rules get
 * written when a defect makes one necessary. Anything here that looks like it
 * wants to be a component probably does — it stays until something else asks.
 *
 * ⚠️ IT LIVES AT `/account` IN EVERY APP rather than at a door of its own. The
 * session is per-app by design (PLAN §2.4), so a separate origin would mean
 * signing in again to manage the account you are already signed into — and it
 * would be a fourth product to brand. The screens are the platform's; the host
 * is whichever app the person happens to be in.
 */

import type { ReactNode } from "react";

/* ------------------------------------------------------------------ data --- */

/**
 * ⚠️ THE SHAPES MIRROR WHAT THE PLATFORM CAN ACTUALLY ANSWER TODAY, which is
 * how a screen stays honest about the operations behind it. Where a field has no
 * operation yet it is marked, rather than invented — a screen that renders a
 * number nothing can supply is a promise the product has to keep later.
 */
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
   * ⚠️ ONLY WHEN IT IS NOT FINE. A standing shown on every row is a row of
   * green ticks nobody reads, and the one that matters stops standing out.
   */
  readonly standing?: { readonly label: string; readonly urgent: boolean };
}

export interface AccountHomeProps {
  readonly person: Person;
  /** ⚠️ `null` is NOT ANSWERED YET. `[]` is answered, and empty. */
  readonly workspaces: readonly Workspace[] | null;
  /** How many passkeys and live sessions — for the security row's summary. */
  readonly security?: { readonly passkeys: number; readonly devices: number };
  readonly units?: string;
  readonly locale?: string;
  readonly onGo: (to: string) => void;
}

/* ------------------------------------------------------------------ view --- */

const PRODUCT_NAME: Record<Product, string> = {
  kova: "Kova",
  scena: "Scena",
  tessa: "Tessa",
};

/** Initials from a name, falling back to the address. Never more than two. */
export function initials(person: Person): string {
  const source = person.name?.trim() || person.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : source.slice(0, 2)).toUpperCase();
}

export function AccountHome({ person, workspaces, security, units, locale, onGo }: AccountHomeProps) {
  /* ⚠️ Owned, not joined: an export is of what somebody can take with them. */
  const owned = (workspaces ?? []).filter((w) => w.role.toLowerCase() === "owner").length;
  return (
    <main className="account">
      {/*
        ⚠️ AN EMAIL IS NOT A DISPLAY NAME, AND IT MUST NOT BE SET LIKE ONE. Put
        in the heading at heading size it wrapped mid-word — "b.okonkwo@gmail." /
        "com" — because an address has no spaces to break at. With no name the
        heading is the ADDRESS, set as an address; and the action is not "Edit",
        it is the thing actually worth doing.
      */}
      <header className="you" data-unnamed={person.name ? undefined : ""}>
        <span className="face" aria-hidden="true">{initials(person)}</span>
        <div className="you-text">
          <h1>{person.name || person.email}</h1>
          {/* ⚠️ The address stays visible even when there is a name: it is what
              every workspace invitation was sent to, and the thing somebody is
              actually checking when they open this screen. */}
          {person.name ? <p className="quiet">{person.email}</p> : null}
        </div>
        <button type="button" className="quiet-button" onClick={() => onGo("account.profile")}>
          {person.name ? "Edit" : "Add your name"}
        </button>
      </header>

      <section>
        <h2>Workspaces</h2>
        {workspaces === null ? (
          /* ⚠️ IT HOLDS THE SHAPE THE ANSWER WILL TAKE. A sentence where a list
             is about to be means the page jumps the moment it arrives, under
             whoever had started reading. */
          <ul className="rows" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i}><span className="row row-waiting"><span className="mark waiting" /><span className="row-text">
                <span className="waiting line" /><span className="waiting line short" /></span></span></li>
            ))}
          </ul>
        ) : workspaces.length === 0 ? (
          <div className="empty">
            <p>You are not in any workspace yet.</p>
            <p className="quiet">
              An invitation arrives by email, at <strong>{person.email}</strong>.
            </p>
          </div>
        ) : (
          <ul className="rows">
            {workspaces.map((w) => (
              <li key={w.tenantId}>
                <button type="button" className="row" onClick={() => onGo(`workspace:${w.tenantId}`)}>
                  {/* ⚠️ THE COLOUR IS THE PRODUCT AND THE LETTER IS THE
                      WORKSPACE. The letter alone repeated what the row title
                      already said, and two workspaces starting with the same
                      letter were indistinguishable — while the one thing a
                      CROSS-PRODUCT list has to make scannable, which product a
                      row belongs to, was readable only as text. */}
                  <span className="mark" data-product={w.product} aria-hidden="true">{w.name.slice(0, 1)}</span>
                  <span className="row-text">
                    <span className="row-title">{w.name}</span>
                    <span className="quiet">{PRODUCT_NAME[w.product]} · {w.role}</span>
                  </span>
                  {w.standing ? (
                    <span className="pill" data-urgent={w.standing.urgent ? "" : undefined}>{w.standing.label}</span>
                  ) : null}
                  <Chevron />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Your account</h2>
        <ul className="rows">
          <Link
            to="account.security"
            title="Security"
            detail={security ? `${count(security.passkeys, "passkey")} · ${count(security.devices, "device")}` : "Passkeys and where you are signed in"}
            onGo={onGo}
          />
          <Link
            to="account.preferences"
            title="Preferences"
            detail={[units, locale].filter(Boolean).join(" · ") || "Units, language and how dates read"}
            onGo={onGo}
          />
          <Link to="account.privacy" title="Privacy and consent" detail="What you have agreed to, and what we hold" onGo={onGo} />
        </ul>
      </section>

      <section>
        <h2>Leaving</h2>
        <ul className="rows">
          {/* ⚠️ THE DETAIL IS A FACT ABOUT THIS PERSON, NOT A SLOGAN. "Every
              workspace you own" was shown to somebody who owns none — a row
              describing something that does not apply, which is how a screen
              teaches people not to read the second line. */}
          <Link
            to="account.export"
            title="Download everything"
            detail={owned > 0 ? `${count(owned, "workspace")} you own, and everything in ${owned === 1 ? "it" : "them"}` : "Your account, and anything attached to it"}
            onGo={onGo}
          />
          {/* ⚠️ THE IRREVERSIBLE ONE IS LAST, ALONE, AND NAMED PLAINLY. It is
              not in the same group as the ordinary rows above, and it does not
              share a row with anything somebody might be aiming at. */}
          <Link to="account.delete" title="Delete your account" detail="Everything, everywhere, after thirty days" danger onGo={onGo} />
        </ul>
      </section>
    </main>
  );
}

/* ----------------------------------------------------------------- parts --- */

/* ⚠️ These are local on purpose. They are used twice on ONE screen, which is not
   yet evidence that the language needs them — the second SCREEN is. */

function Link({ to, title, detail, danger, onGo }: {
  readonly to: string; readonly title: string; readonly detail: string;
  readonly danger?: boolean; readonly onGo: (to: string) => void;
}) {
  return (
    <li>
      <button type="button" className="row" data-destination="" data-danger={danger ? "" : undefined} onClick={() => onGo(to)}>
        <span className="row-text">
          <span className="row-title">{title}</span>
          <span className="quiet">{detail}</span>
        </span>
        <Chevron />
      </button>
    </li>
  );
}

const Chevron = (): ReactNode => (
  <svg className="chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
       fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

/** "1 passkey" / "2 passkeys" — no library for one plural. */
const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
