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
 * ⚠️ AND IT IS THE SAME LIST THE SIGN-UP WALL DRAWS — `DocumentList`, with the
 * dates added. This screen first had a list of its own beside a second card of
 * what was published: two renderers for one thing, which is how a document comes
 * to have a different name on two screens, and two cards where the second
 * heading sat hard against the first. One list, one row per document, and the
 * row says the version, whether it is still owed, and when it was agreed.
 * Pressing it opens the wording in the same sheet the wall opens.
 *
 * ⚠️ AND NO WORLD IN HERE. The ambience belongs to the card that leads to this
 * screen, not to the cards on it — a page whose every block wears a ground is
 * the jungle AMBIENCE.md bans, and the row that offers a destination is the
 * thing that should look like one.
 */

import { Group, Screen } from "@engine/design";
import { DocumentList } from "../legal.js";
import { useLoad } from "../centre/data.js";

interface Signed {
  readonly document: string;
  readonly version: string;
  readonly at: string;
  readonly where: string | null;
}

interface Agreements {
  readonly documents: readonly { readonly id: string }[];
  readonly owed: readonly { readonly id: string }[];
  readonly accepted: readonly Signed[];
}

export function Agreed() {
  const of = useLoad<Agreements>("me.agreements");

  return (
    <Screen
      shape="detail"
      of={of.of}
      again={of.again}
      then={(data) => {
        /* ⚠️ THE LATEST ACCEPTANCE PER DOCUMENT. A document agreed twice is two
           rows — that history is the point of keeping the version in the key —
           but this row answers "when did I last agree to this", so the newest
           wins, and the comparison is lexicographic because `at` is an
           `Instant`. */
        const when: Record<string, { at: string; version: string }> = {};
        for (const one of data.accepted) {
          const had = when[one.document];
          if (!had || had.at < one.at) when[one.document] = { at: one.at, version: one.version };
        }
        /*
          ⚠️ TWO SECTIONS, BECAUSE ONE LIST COULD NOT ANSWER THE QUESTION IT WAS
          FOR. Six documents in a column with three carrying a date and three
          carrying nothing reads as "did I agree to those or are they just
          here?" — the reader has to infer the meaning of an ABSENCE, which is
          the one thing a list should never ask. Split, each heading says which
          it is and the rows underneath need no interpreting.

          ⚠️ AND THE SECOND IS ONLY DRAWN WHEN THERE IS ONE. An empty "Not
          agreed" heading is a section that exists to report nothing.
        */
        const mine = data.documents.filter((d) => when[d.id]);
        const rest = data.documents.filter((d) => !when[d.id]);
        return (
          <>
            <Group label="Agreed" under="What you accepted, which version, and when">
              <DocumentList show={mine} outstanding={data.owed} signed={when} />
            </Group>
            {rest.length ? (
              /* ⚠️ NOT "OUTSTANDING". Most of these are published for reading
                 and were never put in front of anybody — a heading implying a
                 debt would invent one. What is genuinely owed says so on its own
                 row, and the wall is what stops somebody past it. */
              <Group
                label="Published, not signed"
                under="Here to read. You will be asked when one applies"
              >
                <DocumentList show={rest} outstanding={data.owed} />
              </Group>
            ) : null}
          </>
        );
      }}
    />
  );
}
