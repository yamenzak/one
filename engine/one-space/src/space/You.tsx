/**
 * YOU — who you are, everywhere.
 *
 * ⚠️ EVERYTHING HERE FOLLOWS THE PERSON RATHER THAN THE WORKSPACE. The address
 * you sign in with, what you have been told, how you want to be told it, the way
 * out of an account — none of them belongs to any one workspace, and filing them
 * under one means visiting four places to change one fact about yourself.
 *
 * ⚠️ THE FACE IS THE SCREEN'S SHAPE, AND THE EMAIL IS THE FACE'S CAPTION. It was
 * a `FieldRow` in a card of its own — a labelled fact about a person, on a screen
 * whose crown already said it was about them. `Identity` says the same thing in
 * the shape every account surface anybody trusts uses, and it gives this screen a
 * silhouette that is not the silhouette of every other screen (DESIGN.md §4).
 *
 * ⚠️ AND SIGNING OUT IS THE LAST ROW OF THE LAST CARD, NOT A CARD OF ITS OWN. A
 * card is a container for a GROUP; one button inside one is a button with a box
 * drawn round it. Every phone anybody owns puts sign-out at the bottom of the
 * account list, after a rule, and there is no reason to be different.
 */

import { field } from "@engine/kernel";
import {
  EditRow, Group, Identity, NavRow, Place, Screen, glyphOf, whoFace,
} from "@engine/design";
import { api } from "../api.js";
import { useSession } from "../session.js";
import { SignOut } from "./SignOut.js";
import { groundOf, nameOf, type Where } from "./where.js";

/**
 * ⚠️ A NAME IS OFFERED, NOT DEMANDED, AND IT IS 80 CHARACTERS. `holds: "identity"`
 * is what puts it in the erasure walk and in the processing record without
 * anybody remembering to — the field declares what it is and the rest follows.
 */
const NAME = field.text({
  label: "Your name",
  holds: "identity",
  max: 80,
  help: "What a roster, an invitation and a notification call you. Leave it blank to be your address.",
});

export function You({ onGo }: { readonly onGo: (to: Where) => void }) {
  const { me, where, refresh } = useSession();
  const person = me && me !== "nobody" ? me : null;

  return (
    /* ⚠️ `detail` — one subject (you), the two places that are yours, and the
       one destructive thing. Signing out is NOT a primary action: a primary is
       what the screen is FOR, and nobody opens their account to leave it. It is
       a card of its own, in the danger voice (DESIGN.md §5). */
    <Screen shape="detail">
      {/* ⚠️ THE NAME IS THE HEADING AND THE ADDRESS IS ITS CAPTION — and when
          there is no name, the address is the heading and nothing is repeated
          under it. The column existed from the first commit, `upsertAccount`
          wrote `null` into it at the one call site there is, and no route
          answered it: a screen called "You" introduced everybody to themselves
          by their email address. */}
      <Identity
        face={person ? whoFace(person.accountId) : undefined}
        name={person?.name ?? person?.email ?? "You"}
        under={[person?.name ? person.email : null, person?.operator ? "Operator" : null]
          .filter(Boolean).join(" · ") || undefined}
      />

      {/* ⚠️ ITS OWN CARD, BECAUSE A CARD HOLDS ONE KIND OF THING. A fact you can
          change sitting as the first row of a menu makes the menu five
          destinations and one setting, and the eye has to read each row to find
          out which it is. A sheet rather than an inline field is the same rule
          every settings surface here follows — `EditRow` is where it lives. */}
      <Group>
        <EditRow
          spec={NAME}
          name="name"
          value={person?.name ?? ""}
          onSave={async (next) => {
            const out = await api.post("me.name", { name: String(next ?? "") });
            if (!out.ok) return out.problem;
            await refresh();
            return null;
          }}
        />
      </Group>

      <Group>
        {/* ⚠️ ON EVERY DOOR, AND THE SCOPE IS WHAT CHANGES. This was gated to a
            workspace because the screen behind it called a MEMBER operation,
            which 404s where there is no tenancy — so the row was hidden rather
            than the read being fixed, and the one address that spans every
            workspace could not say that any of them needed somebody.
            `InboxScreen` picks `me.inbox` or `inbox.list` from the door now. */}
        <NavRow
          icon={glyphOf("inbox")}
          label="Inbox"
          under={where?.kind === "tenant" ? undefined : "Everywhere you belong"}
          onOpen={() => onGo({ at: "inbox" })}
        />
        <NavRow
          icon={glyphOf("bell")}
          label="How you are told"
          /* ⚠️ A LINE LIKE ITS NEIGHBOURS. It was the one row in this card with
             a bare label between two that had one, which reads as a row whose
             description failed to load rather than as a shorter row. */
          under="Which notifications reach you, and where"
          onOpen={() => onGo({ at: "told" })}
        />
        {/* ⚠️ YOURS, NOT A WORKSPACE'S. What you prefer follows you into every
            workspace you are in, so it is filed under you rather than under one
            of them — which is exactly the test the inbox above fails. */}
        {/* ⚠️ UNDER YOU, BECAUSE THE WALK BEHIND IT CROSSES EVERY WORKSPACE.
            Filed under one of them it would answer for a fraction of what is
            held and say so in a heading nobody reads. */}
        <NavRow
          icon={glyphOf("shield")}
          label="Your data"
          under="Take a copy of everything we hold, or delete it"
          onOpen={() => onGo({ at: "data" })}
        />
        {/* ⚠️ ABOVE THE PRODUCTS' OWN PREFERENCES, because it governs every one
            of them. A date is written the same way in every product here, and a
            row filed under one of them would say otherwise. */}
        <NavRow
          icon={glyphOf("calendar")}
          label={nameOf({ at: "formats" })}
          under="Dates, times, numbers and measurements, everywhere"
          onOpen={() => onGo({ at: "formats" })}
        />
        {/* ⚠️ ON THIS DEVICE, AND THE LINE SAYS SO. Every other row here follows
            the person into every workspace and onto every screen they open; the
            theme and the motion stay on the machine they were chosen on, which
            is a difference somebody has to be told rather than discover by
            setting it once and finding it undone on their phone. */}
        <NavRow
          icon={glyphOf("sun")}
          label={nameOf({ at: "looks" })}
          under="Theme and how much moves — on this device"
          onOpen={() => onGo({ at: "looks" })}
        />
        <NavRow
          icon={glyphOf("cog")}
          label="Your preferences"
          under="How products behave for you, wherever you are"
          onOpen={() => onGo({ at: "prefs" })}
        />
      </Group>

      {/*
        ⚠️ A DESTINATION, NOT A ROW, AND IT IS THE ONE CARD HERE THAT WEARS A
        WORLD. Everything above is a menu — five rows of settings, which
        AMBIENCE.md says never earns a ground. What somebody has bound themselves
        to is a RECORD, and a record is the one thing in the account centre that
        is a place to go rather than a control to move.

        ⚠️ THE MATERIAL IS ASKED, NEVER TYPED. `scene.test.mjs` refuses a screen
        that writes a family into itself; `groundOf` is the one decider and it
        says this address is ruled rather than woven, because it is a document.

        ⚠️ UNDER YOU, BECAUSE AN AGREEMENT IS SIGNED BY A PERSON. One account
        accepts the terms once for the whole deployment, and a business agreement
        names the workspace it was signed in — both are facts about the hand that
        signed, not about a workspace.
      */}
      <Place
        name={nameOf({ at: "agreed" })}
        said="Every document you have accepted, which version, and the day you agreed"
        sky={groundOf({ at: "agreed" })}
        /* ⚠️ NO FACE, AND `foot` IS A SENTENCE RATHER THAN A GAP. `appFace`'s
           glyph is a manifest's own MARK — a character it prints literally — so
           passing a glyph NAME drew the word "file" in the plate; and `foot`
           left null draws a skeleton, which on a card with nothing loading is a
           grey bar that never resolves. The world and the words are what make
           this a destination; a plate with an initial in it would say only that
           somebody wanted one there. */
        foot="Read what you signed"
        onOpen={() => onGo({ at: "agreed" })}
      />

      <SignOut />

    </Screen>
  );
}
