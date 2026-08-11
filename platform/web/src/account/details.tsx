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
import type { Problem } from "@one/kernel";
import { Face } from "../avatar.js";
import { Back, Edit, Lens, Tick } from "../icon.js";
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
    <div className="page stagger">
      <header className="page-top">
        <button type="button" className="round-button press" aria-label="Back" onClick={onBack}><Back /></button>
        {/* ⚠️ THE TITLE AND THE FACE SHARE A LINE, and the face is the one thing on
            this screen that is not a row — it is what the person looks like, so it
            is shown rather than described. */}
        <div className="title-row">
          <Heading className="page-name">Your details</Heading>
          <button type="button" className="portrait press" onClick={onPickPhoto} aria-label="Change your photo">
            <Face kind="person" src={person.avatarUrl} name={person.name ?? person.email} className="portrait-face alive" />
            <span className="portrait-badge" aria-hidden="true"><Lens /></span>
          </button>
        </div>
      </header>

      <section>
        <h2>Personal</h2>
        {/* ⚠️ ONE CARD, NOT ONE PER FIELD. These are all the same kind of thing
            about the same person; a card each turns a short list into a stack of
            boxes with more edge than content. */}
        <div className="card entries stagger">
          {fields.map((f) => (
            <button type="button" className="entry press-flat" key={f.name} onClick={() => setEditing(f.name)}>
              <span className="entry-label">{f.label}<Edit className="pencil" /></span>
              <span className="entry-value">
                {f.name === "email" ? person.email : person.name ?? <span className="entry-unset">Not set</span>}
                {/* ⚠️ A MARK RATHER THAN THE WORD. "Verified" beside an address is
                    a label explaining a state that has one universally understood
                    symbol — and the word is wider than the thing it qualifies at
                    small sizes. The tick still SAYS it, to a reader. */}
                {f.name === "email" && emailVerified
                  ? <span className="verified"><Tick size={12} label="Verified" /></span>
                  : null}
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
