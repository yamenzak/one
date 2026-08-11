/**
 * YOUR DETAILS — what the platform knows about one person, and nothing more.
 *
 * ⚠️ IT HOLDS THREE THINGS, AND THAT IS HONEST. A 4DL account is a photo, a name
 * and an email address; the reference this follows is a bank, so its version
 * carries an address, a date of birth and a tax residency. Padding this screen to
 * match would mean inventing columns — and a field a product collects and never
 * uses is a liability it has to erase on request, defend in a breach and explain
 * in a policy. Units, language and layout are real and live on Preferences,
 * because they are how a person reads things rather than who they are.
 *
 * ⚠️ THE WAY OUT IS AN ARROW HERE, AND AN × ON THE HOME. This screen is one level
 * INSIDE the presentation, so leaving it goes up rather than dismissing; the home
 * is the root of the presentation, so leaving that dismisses it. The two controls
 * are different because the two actions are.
 *
 * ⚠️ THE TITLE IS LEFT AND LARGE, WHERE THE HOME'S IS CENTRED. The home is named
 * by the brand — a lockup, on the axis of the page. A screen inside it is named by
 * what it is, and a heading that is read rather than recognised belongs at the
 * start of the line.
 *
 * ⚠️ AND THERE IS NO SKY HERE. The light is the ARRIVAL — it falls where the
 * account announces itself, once. Repeated on every screen inside it stops being
 * an arrival and becomes a tint the product wears, which is the difference between
 * light and paint. It also has to be legible behind a left-aligned heading and a
 * photograph, and it is not.
 */

import { useState, type ReactNode } from "react";
import * as Avatar from "@radix-ui/react-avatar";
import type { Problem } from "@one/kernel";
import { ValueEditor, type EditableField } from "./editor.js";
import type { Person } from "./home.js";

export interface AccountDetailsProps {
  readonly person: Person;
  /** ⚠️ WHEN THEY JOINED. Read-only: a fact about the account, not a setting. */
  readonly since?: string;
  readonly emailVerified?: boolean;
  readonly onSave: (name: string, value: string) => Promise<Problem | null>;
  readonly onPickPhoto: () => void;
  readonly onBack: () => void;
  readonly Heading?: React.ElementType;
}

/* ⚠️ THE FIELDS ARE DATA, NOT MARKUP. Each one names the key its failures come
   back under, the control it needs and the question it asks — so adding a field
   is a row in a list rather than a block of JSX with its own opinions about
   spacing, its own error placement and its own idea of what "saved" looks like. */
const fieldsFor = (person: Person): readonly EditableField[] => [
  {
    name: "name",
    kind: "text",
    title: "Your name",
    label: "Full name",
    placeholder: "As you would like to be addressed",
    value: person.name ?? "",
    maxLength: 80,
    check: (v) => (v.length === 0 ? "Your name cannot be empty." : null),
  },
  {
    name: "email",
    kind: "email",
    title: "Your email address",
    /* ⚠️ IT SAYS WHAT WILL HAPPEN, because this one is not an edit — it is the
       sign-in factor, and the change does not take until the new address answers. */
    lede: "This is how you sign in. We will send a code to the new address before anything changes.",
    label: "Email address",
    value: person.email,
    maxLength: 254,
    check: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "That does not look like an email address."),
  },
];

export function AccountDetails({
  person, since, emailVerified, onSave, onPickPhoto, onBack, Heading = "h1",
}: AccountDetailsProps): ReactNode {
  const [editing, setEditing] = useState<string | null>(null);
  const fields = fieldsFor(person);

  return (
    <div className="page">
      <header className="page-top">
        <button type="button" className="round-button" aria-label="Back" onClick={onBack}><Arrow /></button>
        {/* ⚠️ THE TITLE AND THE FACE SHARE A LINE, and the face is the one thing on
            this screen that is not a row — it is what the person looks like, so it
            is shown rather than described. */}
        <div className="title-row">
          <Heading className="page-name">Your details</Heading>
          <button type="button" className="portrait" onClick={onPickPhoto} aria-label="Change your photo">
            <Avatar.Root className="portrait-face">
              <Avatar.Image className="portrait-image" src={person.avatarUrl} alt="" />
              <Avatar.Fallback className="portrait-letter" aria-hidden="true">
                {(person.name ?? person.email).slice(0, 1).toUpperCase()}
              </Avatar.Fallback>
            </Avatar.Root>
            <span className="portrait-badge" aria-hidden="true"><Camera /></span>
          </button>
        </div>
      </header>

      <section>
        <h2>Personal</h2>
        {/* ⚠️ ONE CARD, NOT ONE PER FIELD. These are all the same kind of thing
            about the same person; a card each turns a short list into a stack of
            boxes with more edge than content. */}
        <div className="card entries">
          {fields.map((f) => (
            <button type="button" className="entry" key={f.name} onClick={() => setEditing(f.name)}>
              <span className="entry-label">{f.label}<Pencil /></span>
              <span className="entry-value">
                {f.name === "email" ? person.email : person.name ?? <span className="entry-unset">Not set</span>}
                {f.name === "email" && emailVerified ? <span className="pill">Verified</span> : null}
              </span>
            </button>
          ))}
          {/* ⚠️ NO PENCIL, BECAUSE THERE IS NOTHING TO PRESS. A read-only fact
              rendered in the shape of an editable one is a control that does
              nothing, which is worse than a fact with no control at all. */}
          {since ? (
            <div className="entry" data-fixed="">
              <span className="entry-label">Member since</span>
              <span className="entry-value">{since}</span>
            </div>
          ) : null}
        </div>
      </section>

      <ValueEditor
        field={fields.find((f) => f.name === editing) ?? null}
        onSave={onSave}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

const Arrow = (): ReactNode => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
  </svg>
);

const Pencil = (): ReactNode => (
  <svg className="pencil" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m14.5 6.5 3 3" />
  </svg>
);

const Camera = (): ReactNode => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8.5h3.5L8 6h8l1.5 2.5H21v11H3z" /><circle cx="12" cy="13.5" r="3.4" />
  </svg>
);
