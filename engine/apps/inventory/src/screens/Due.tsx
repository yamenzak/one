/**
 * RUNNING OUT — everything with a date on it, soonest first.
 *
 * ⚠️ THIS IS WHERE EVERY NOTE THE NIGHT SENDS LANDS, and that is what it is for.
 * A notification says "three things out of date" and a person taps it; a screen
 * that could not answer "which three" would make the note a rumour, and a rumour
 * arriving at five in the morning is worse than no note at all.
 *
 * ⚠️ TWO CLOCKS, ONE LIST, AND THEY STAY APART. A carton of cream and a fire
 * extinguisher's inspection are the same arithmetic and completely different
 * working days — mixed into one column somebody has to read every row to find
 * out which kind of problem they are looking at.
 *
 * ⚠️ AND WHAT IS ALREADY GONE COMES FIRST. Everything else on this screen is
 * something to plan around; those are things on a shelf that must not be used,
 * and a list ordered purely by date buries them under whatever was recorded with
 * an older date and is perfectly fine.
 */

import {
  AmountRow, Group, NoteRow, Screen, Section, glyphOf, type Loaded,
} from "@engine/design";

/** One thing with a date, whichever clock put it there. */
export interface Dated {
  readonly id: string;
  /* ⚠️ THE PRODUCT AS WELL AS THE ROW, BECAUSE THAT IS WHAT THE ROW OPENS. A
     batch has no screen of its own — its deliveries are listed on the product's
     — so a row carrying only its own id could be drawn and not followed. */
  readonly product: string;
  readonly name: string;
  /** ⚠️ The lot, the serial — whatever identifies THIS one, or empty. */
  readonly which: string;
  readonly on: string;
  readonly standing: "gone" | "soon" | "fine";
  /** ⚠️ Signed, because "four days ago" and "in four days" are one question. */
  readonly days: number;
  /** ⚠️ Which clock decided — see `effectiveExpiry`. Empty on a service. */
  readonly by: string;
}

export interface DueProps {
  readonly title?: string;
  readonly of: Loaded<readonly Dated[]>;
  /** ⚠️ Items due for a service. A different clock, so a different section. */
  readonly services: readonly Dated[];
  readonly again: () => void;
  readonly onOpen: (row: Dated) => void;
  readonly onItem: (row: Dated) => void;
}

/*
  ⚠️ THE DAYS IN WORDS, AND THE NUMBER IS NOT THE SENTENCE. "−3" is arithmetic;
  "3 days ago" is what somebody reads at arm's length in a store room, and it is
  the difference between a list that is scanned and a list that is decoded.
*/
export const sayDays = (days: number): string => {
  if (days < -1) return `${-days} days ago`;
  if (days === -1) return "yesterday";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
};

/* ⚠️ WHY IT EXPIRES WHEN IT DOES, because a shelf that says "expires Tuesday"
   and cannot say why is a shelf nobody trusts — and the answer surprises people
   often enough to matter: a box with a 2028 date on it that was opened last
   month is out next week. */
const SAID_BY: Readonly<Record<string, string>> = {
  printed: "printed on it",
  opened: "since it was opened",
  processed: "since it was released",
};

const under = (row: Dated): string =>
  [row.which, sayDays(row.days), SAID_BY[row.by] ?? ""].filter(Boolean).join(" · ");

export function Due({ title, of, services, again, onOpen, onItem }: DueProps) {
  return (
    <Screen
      shape="list"
      title={title}
      under="Everything with a date on it, soonest first"
      of={of}
      again={again}
      isNothing={(rows) => rows.length === 0 && services.length === 0}
      nothing={{
        icon: glyphOf("check"),
        says: "Nothing running out",
        under: "Record an expiry when you receive something and it appears here",
      }}
      then={(rows) => (
        <>
          {/*
            ⚠️ OUT OF DATE FIRST, AND SEPARATED. These are the only rows on the
            screen that are a rule rather than a plan: nothing here may be used,
            and mixed into a list ordered by date they sit wherever the arithmetic
            puts them.
          */}
          {rows.some((r) => r.standing === "gone")
            ? (
              <Section label="Out of date">
                <Group>
                  {rows.filter((r) => r.standing === "gone").map((row) => (
                    <AmountRow
                      key={row.id}
                      label={row.name}
                      under={under(row)}
                      amount={<span data-ink="danger">{row.on}</span>}
                      onOpen={() => { onOpen(row); }}
                    />
                  ))}
                </Group>
              </Section>
            )
            : null}

          <Section label="Expiring">
            <Group>
              {rows.filter((r) => r.standing !== "gone").map((row) => (
                <AmountRow
                  key={row.id}
                  label={row.name}
                  under={under(row)}
                  amount={(
                    <span data-ink={row.standing === "soon" ? "warning" : undefined}>
                      {row.on}
                    </span>
                  )}
                  onOpen={() => { onOpen(row); }}
                />
              ))}
              {/* ⚠️ SAID WHERE IT IS TRUE. An absent section is indistinguishable
                  from one that failed to load, and "nothing expiring" is a real
                  answer to the question somebody arrived with. */}
              {rows.some((r) => r.standing !== "gone")
                ? null
                : <NoteRow>Nothing else expiring</NoteRow>}
            </Group>
          </Section>

          <Section label="Due for a service">
            <Group>
              {services.map((row) => (
                <AmountRow
                  key={row.id}
                  label={row.name}
                  under={under(row)}
                  amount={(
                    <span
                      data-ink={row.standing === "gone"
                        ? "danger"
                        : row.standing === "soon" ? "warning" : undefined}
                    >
                      {row.on}
                    </span>
                  )}
                  onOpen={() => { onItem(row); }}
                />
              ))}
              {services.length ? null : <NoteRow>Nothing due</NoteRow>}
            </Group>
          </Section>
        </>
      )}
    />
  );
}
