/**
 * WHAT YOU AGREED TO — every document, the version, and the day you signed it.
 *
 * ⚠️ THE RECORD EXISTED AND NOBODY COULD READ IT. `acceptance` keeps a row per
 * person per document per VERSION, which is the history the whole legal design
 * is built to keep — and the only surface over it was the WALL, which shows what
 * is still owed and disappears the moment it is. Somebody asking "what did I
 * agree to, and when" had the answer in the database and nowhere on the screen.
 *
 * ⚠️ IT IS PER PERSON, NOT PER WORKSPACE, WHICH IS WHY IT IS HERE. One account
 * accepts the terms once for the whole deployment (`platform-schema.ts` keeps
 * `acceptance` in the DIRECTORY for exactly that reason), and a business
 * agreement is signed inside one workspace and names it. Both belong under the
 * person who signed them.
 *
 * ⚠️ AND THIS IS THE ONE CARD IN THE ACCOUNT CENTRE THAT WEARS A WORLD.
 * AMBIENCE.md's rule is that ambience everywhere is ambience nowhere: a card
 * earns a ground when it is a destination or a RESULT, never when it is four
 * rows of settings. A record of what somebody has bound themselves to is the
 * closest thing this product has to a document, and it is the only card here
 * that is neither a menu nor a control — so it is the one that earns it, and
 * `Group`'s `sky` had no caller in the app until now.
 */

import { Chip, Link } from "@heroui/react";
import { Dated, FieldRow, Group, NoteRow, Nothing, SPACE, Screen, glyphOf } from "@engine/design";
import type { Instant } from "@engine/kernel";
import { useLoad } from "../centre/data.js";
import { groundOf } from "./where.js";

interface Signed {
  readonly document: string;
  readonly version: string;
  readonly at: string;
  readonly where: string | null;
}

interface Paper {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly version: string;
  readonly url: string;
  readonly mustAccept?: boolean;
}

interface Agreements {
  readonly documents: readonly Paper[];
  readonly accepted: readonly Signed[];
}

export function Agreed() {
  const of = useLoad<Agreements>("me.agreements");

  return (
    <Screen
      shape="detail"
      of={of.of}
      again={of.again}
      isNothing={(d) => d.accepted.length === 0 && d.documents.length === 0}
      nothing={{
        icon: glyphOf("file"),
        says: "This deployment publishes no documents",
        under: "Nothing has been put in front of you to agree to",
      }}
      then={(data) => <Papers of={data} />}
    />
  );
}

function Papers({ of }: { readonly of: Agreements }) {
  /* ⚠️ NEWEST FIRST, AND THE COMPARISON IS LEXICOGRAPHIC BECAUSE `at` IS AN
     `Instant` — which is the whole reason nothing is stored in a reader's own
     conventions. */
  const signed = [...of.accepted].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const titleOf = (id: string) => of.documents.find((d) => d.id === id)?.title ?? id;

  return (
    <>
      {/* ⚠️ THE WORLD IS SEEDED ON THE CARD'S SUBJECT, so it is this deployment's
          own ground rather than a picture — `useScenery` derives it, and a
          second card of agreements would look like this one rather than like a
          different product. */}
      <Group
        /* ⚠️ NOT THE SCREEN'S OWN NAME AGAIN. The frame already says "What you
           agreed to"; a card under it repeating the words is the same heading
           twice, which pushes the first row below the fold to say nothing. */
        label="Signed by you"
        under="The version you saw, and the day you saw it"
        /* ⚠️ ASKED, NEVER TYPED. `scene.test.mjs` refuses a screen that writes
           a material into itself — one surface naming `glow` by hand is how the
           door into a workspace became the single place that workspace's world
           was missing. `groundOf` is the one decider, and it says this address
           is ruled rather than woven because a record of what somebody signed is
           a DOCUMENT, which is the only thing in the account centre that is. */
        sky={groundOf({ at: "agreed" })}
        /* ⚠️ ITS OWN SEED, so the card is a document ON the desk rather than a
           second print of the desk — see `Place`, which stamped the page's own
           ground at card size and looked never wrong and never right. */
        seedling="agreed|card"
      >
        {signed.length === 0
          ? (
            <NoteRow>
              You have not agreed to anything yet. Whatever is required is asked
              before it is needed, never after.
            </NoteRow>
          )
          : signed.map((one) => (
            /* ⚠️ A FACT WITH A DATE, WHICH IS `FieldRow` — not a person and not
               a destination. The date is the VALUE because it is what somebody
               came to read; the document is what they are reading it about. */
            <FieldRow
              key={`${one.document}-${one.version}-${one.where ?? ""}`}
              label={titleOf(one.document)}
              value={<Dated at={one.at as Instant} />}
              /* ⚠️ THE WORKSPACE IS NAMED WHERE THERE IS ONE. A business
                 agreement signed inside a workspace and a personal one signed
                 for the account are different acts, and a list that drew them
                 identically would be a record nobody could check. */
              under={one.where ? `${one.where} · version ${one.version}` : `Version ${one.version}`}
            />
          ))}
      </Group>

      {/* ⚠️ WHAT IS CURRENT, BESIDE WHAT WAS SIGNED — because a version somebody
          agreed to and the version published today are different facts, and the
          gap between them is the one thing this screen can show that a wall
          cannot. The wording itself is served publicly at its own address;
          carrying it here would be a second copy that drifts. */}
      <Group label="Published now" under="The wording in force today">
        {of.documents.map((d) => (
          <FieldRow
            key={d.id}
            label={d.title}
            value={(
              <span className={`flex items-center ${SPACE.tight}`}>
                {/* ⚠️ ONLY WHERE IT SAYS SOMETHING. A mark on every row is
                    texture; one on the document whose CURRENT version this
                    person has not agreed to is the reason they opened this. */}
                {signed.some((one) => one.document === d.id && one.version === d.version)
                  ? null
                  : d.mustAccept
                    ? <Chip color="warning" variant="soft"><Chip.Label>Not yet</Chip.Label></Chip>
                    : null}
                <Link href={d.url}>Read</Link>
              </span>
            )}
            under={`Version ${d.version}`}
          />
        ))}
        {of.documents.length === 0
          ? <Nothing icon={glyphOf("file")} says="Nothing is published yet" />
          : null}
      </Group>
    </>
  );
}
