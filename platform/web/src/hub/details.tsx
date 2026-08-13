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
 * ⚠️ THE WAY OUT IS AN ARROW HERE, AND AN × ON THE HOME — and neither screen
 * decides that any more. It is `Screen`'s, from where the screen SITS: the root
 * of a presentation is dismissed, a screen inside one is left upwards.
 *
 * ⚠️ AND THERE IS NO SKY HERE. The light is the ARRIVAL — it falls where the
 * account announces itself, once. Repeated on every screen inside it stops being
 * an arrival and becomes a tint the product wears.
 */

import { useState, type ElementType, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Mark } from "../mark.js";
import { Edit, Lens, Tick } from "../icon.js";
import { Card, Entry, Unset } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import { ValueEditor, type EditableField } from "../editor.js";
import type { Person } from "./home.js";

export interface AccountDetailsProps {
  readonly person: Person;
  /** ⚠️ WHEN THEY JOINED. Read-only: a fact about the account, not a setting. */
  readonly since?: string;
  readonly emailVerified?: boolean;
  readonly onSave: (name: string, value: string) => Promise<Problem | null>;
  readonly onPickPhoto: () => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
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
    <Screen
      leave="up"
      onLeave={onBack}
      name="Your details"
      /* ⚠️ THE TITLE AND THE FACE SHARE A LINE, and the face is the one thing on
         this screen that is not a row — it is what the person looks like, so it is
         shown rather than described. */
      title={
        <div className="title-row">
          <Title as={Heading}>Your details</Title>
          <button type="button" className="portrait press" onClick={onPickPhoto} aria-label="Change your photo">
            <Mark
              kind="person" size="lg" src={person.avatarUrl}
              name={person.name ?? person.email} className="alive"
              /* ⚠️ THE BADGE IS THE MARK'S OWN NOW. Written as a second absolutely
                 positioned element beside the picture it sat at the bounding box's
                 corner — which on a CIRCLE is empty space, and is why the camera
                 looked stuck to the outside of somebody's photograph. */
              badge={<Lens />}
            />
          </button>
        </div>
      }
    >
      <Section name="Personal">
        {/* ⚠️ ONE CARD, NOT ONE PER FIELD. These are all the same kind of thing
            about the same person; a card each turns a short list into a stack of
            boxes with more edge than content. */}
        <Card className="entries">
          {fields.map((f) => (
            <Entry key={f.name} label={f.label} affordance={<Edit className="pencil" />} onEdit={() => setEditing(f.name)}>
              {f.name === "email" ? person.email : person.name ?? <Unset>Not set</Unset>}
              {/* ⚠️ A MARK RATHER THAN THE WORD. "Verified" beside an address is a
                  label explaining a state that has one universally understood
                  symbol — and the word is wider than the thing it qualifies at
                  small sizes. The tick still SAYS it, to a reader. */}
              {f.name === "email" && emailVerified
                ? <span className="verified"><Tick size={12} label="Verified" /></span>
                : null}
            </Entry>
          ))}
          {since ? <Entry label="Member since">{since}</Entry> : null}
        </Card>
      </Section>

      <ValueEditor
        field={fields.find((f) => f.name === editing) ?? null}
        onSave={onSave}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}
