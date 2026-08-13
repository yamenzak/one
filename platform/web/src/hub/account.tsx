/**
 * THE ACCOUNT CENTER — who you are, and nothing about what you use it for.
 *
 * ⚠️ IT WAS THE WHOLE HUB, AND THAT IS WHY IT NEEDED SPLITTING. One screen held
 * your name, your passkeys, your preferences, your vault, your workspaces, your
 * credits, your legal record and the button that closes everything — so "change
 * my language" and "start a business" were adjacent rows, and the page had no
 * answer to what kind of place it was.
 *
 * ⚠️ THE VAULT IS HERE RATHER THAN ONE LEVEL UP, and it is the one judgement in
 * the split worth stating. It is not a setting — it is a PLACE, which is why it
 * keeps its crown — but it is a place about the PERSON, and the person is what
 * this area is. Left at the top it would be a fourth thing beside three areas,
 * which reads as an area; put here it is the most important thing in the one
 * area it belongs to.
 *
 * ⚠️ AND THE LEGAL RECORD IS HERE FOR THE SAME REASON. What you agreed to and
 * what we hold about you are facts about the account, not about any workspace —
 * they survive leaving every product, which is precisely the test.
 */

import type { ElementType, ReactNode } from "react";
import { Crown, HUES } from "../crown.js";
import { Mark } from "../mark.js";
import { Adjust, Guard, Heartbreak, Key, Save } from "../icon.js";
import { Card, Item } from "../list.js";
import { Screen, Section, Title } from "../screen.js";
import type { Person } from "./home.js";
import type { Where } from "./routes.js";

export interface AccountProps {
  readonly person: Person;
  /** ⚠️ Null until known — a confident "Nothing shared" is worse than a wait. */
  readonly sharedCount?: number | null;
  readonly onGo: (to: Where) => void;
  readonly onBack: () => void;
  readonly Heading?: ElementType;
}

export function AccountScreen({
  person, sharedCount = null, onGo, onBack, Heading = "h1",
}: AccountProps): ReactNode {
  return (
    <Screen leave="up" onLeave={onBack} name="Account Center" sky="silk"
      title={<Title as={Heading}>Account Center</Title>}
      lede="Who you are, wherever you use it."
    >
      <Section>
        <Card>
          {/* ⚠️ THEIR OWN FACE, NOT A DRAWING OF A PERSON. Every other row here is
              named by a symbol because it is about a KIND of thing; this one is
              about them, and the same generated face they will see on the screen
              it opens is what says so. */}
          <Item
            mark={<Mark kind="person" src={person.avatarUrl ?? undefined} name={person.name ?? person.email} className="alive" />}
            title="Your details" detail="Your name, photo and address"
            onGo={() => onGo({ at: "details" })}
          />
          <Item icon={<Key />} title="Sign-in methods" detail="Passkeys, codes and devices" onGo={() => onGo({ at: "security" })} />
          <Item icon={<Adjust />} title="Preferences" detail="Theme, language, units and feedback" onGo={() => onGo({ at: "preferences" })} />
        </Card>
      </Section>

      {/*
        ⚠️ A CROWN RATHER THAN A ROW, because it is not the same kind of thing as
        the three above it. Those are settings — somewhere to go and change
        something. This is a PLACE: the one part of the account that is not about
        using a product, and the only part that keeps its meaning for somebody who
        has left every product.
      */}
      <Crown
        word="Vault"
        /* ⚠️ THE ONE CROWN THAT KEEPS THE MARK, because "4° Vault" is what the
           thing is called — see `CrownProps.marked`. */
        marked
        hue={HUES.account}
        /* ⚠️ IT DESCRIBES THE MECHANISM, NEVER THE CONTENTS. It once said "your
           body, your health, your goals" — one product's data categories written
           into a surface every product draws from, which also has to be edited
           every time an app declares a fact. */
        said="Sensitive things about you, held by your account — you choose who sees each one, and for how long."
        foot={sharedCount === null ? null
          : sharedCount === 0 ? "Nothing is shared"
            : `${sharedCount} ${sharedCount === 1 ? "thing is" : "things are"} shared`}
        onGo={() => onGo({ at: "vault" })}
      />

      <Section name="Your record">
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
