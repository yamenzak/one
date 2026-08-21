/**
 * A SPREADSHEET SOMEBODY ALREADY HAS.
 *
 * ⚠️ NOBODY TYPES IN EIGHT HUNDRED PRODUCTS. Every real customer arrives holding
 * a stock list, a supplier's catalogue or an export from whatever they are
 * leaving, and a product whose first instruction is "now enter your catalogue"
 * is one that is evaluated for an afternoon and abandoned. This screen is the
 * difference between a trial and a workspace.
 *
 * ⚠️ THE MAPPING IS SHOWN AND EDITABLE, WHICH IS THE WHOLE MIDDLE STEP. A guess
 * that put the supplier's name in the product name for eight hundred rows is
 * indistinguishable from a successful import until somebody goes looking for a
 * product, months later. The guess is worth making because it is right most of
 * the time; showing it is what makes being wrong survivable.
 *
 * ⚠️ AND EVERY REFUSED ROW IS NAMED WITH ITS LINE NUMBER. An import that quietly
 * skipped eleven of eight hundred is the worst outcome available here: the
 * catalogue looks complete and there is no record of what happened.
 */

import * as React from "react";
import {
  Choice, ControlRow, Group, LongText, NoteRow, Screen, Section, Stat, StatRow,
  Steps, glyphOf, type Option,
} from "@engine/design";

/** One row, as the preview answered it. See `Planned` — this is its wire shape. */
export interface Row {
  readonly line: number;
  readonly verdict: "new" | "update" | "refused";
  readonly why: string;
  readonly name: string;
  readonly code: string;
  readonly location: string;
  readonly supplier: string;
  readonly quantity: number | null;
}

export interface Seen {
  readonly header: readonly string[];
  readonly columns: Readonly<Record<string, number>>;
  readonly tally: { readonly new: number; readonly update: number; readonly refused: number };
  readonly rows: readonly Row[];
}

/** What was actually done, once the button was pressed. */
export interface Done {
  readonly made: number;
  readonly changed: number;
  readonly received: number;
  readonly learned: number;
  readonly refused: readonly string[];
}

/**
 * ⚠️ THE FIELDS IN THE ORDER SOMEBODY READS THEM, and the labels are this
 * workspace's own words where it has any — a hospital pharmacist mapping a
 * column called "Shelf" is reading somebody else's product.
 */
export interface Mappable {
  readonly id: string;
  readonly label: string;
}

/**
 * ⚠️ THE ORDER IS THE ORDER SOMEBODY READS THEIR OWN SHEET IN, left to right —
 * what it is, what identifies it, how it is counted, how many and where. A list
 * ordered by how the app stores things makes a person hunt for the one column
 * they know is wrong.
 *
 * ⚠️ AND THE PLACE'S LABEL IS OVERWRITTEN WITH THE WORKSPACE'S OWN WORD by
 * whatever renders this — a ward is not a shelf, and the noun on the mapping row
 * is where somebody decides which column it means.
 */
export const MAPPABLE: readonly Mappable[] = [
  { id: "name", label: "Name" },
  { id: "brand", label: "Brand" },
  { id: "code", label: "Barcode" },
  { id: "category", label: "Category" },
  { id: "unit", label: "Counted in" },
  { id: "par", label: "Tell me below" },
  { id: "quantity", label: "How many" },
  { id: "location", label: "Location" },
  { id: "supplier", label: "Supplier" },
];

export interface ImportProps {
  readonly title?: string;
  readonly text: string;
  readonly onText: (text: string) => void;
  /** ⚠️ `null` until a preview has been asked for — never an empty preview. */
  readonly seen: Seen | null;
  readonly fields: readonly Mappable[];
  readonly columns: Readonly<Record<string, number>>;
  readonly onColumn: (field: string, at: number) => void;
  readonly done: Done | null;
  readonly busy: boolean;
  readonly onSee: () => void;
  readonly onImport: () => void;
  readonly onAgain: () => void;
}

/** ⚠️ The sentinel the door reads as "leave this column out" — see `IGNORED`. */
const OFF = "-1";

const STEPS = [
  { id: "paste", label: "Paste" },
  { id: "check", label: "Check" },
  { id: "done", label: "Done" },
];

/*
  ⚠️ THE VERDICT IN WORDS RATHER THAN A COLOUR. Three greens and a red is a
  legend somebody has to learn; "New" and "Already here" are the answer.
*/
const SAID: Readonly<Record<Row["verdict"], string>> = {
  new: "New",
  update: "Already here",
  refused: "Not imported",
};

/* ⚠️ WHAT THE ROW SAYS UNDER ITS NAME — the reason first where there is one,
   because a refusal is the only thing on this screen somebody has to act on. */
const under = (row: Row): string => [
  row.verdict === "refused" ? row.why : "",
  row.code,
  row.quantity === null ? "" : `${row.quantity} in ${row.location || "—"}`,
  row.supplier,
].filter(Boolean).join(" · ");

export function Import({
  title, text, onText, seen, fields, columns, onColumn, done, busy,
  onSee, onImport, onAgain,
}: ImportProps) {
  const at = done ? "done" : seen ? "check" : "paste";

  /* ⚠️ EVERY HEADING PLUS "LEAVE IT OUT", because turning a column off is the
     correction somebody makes most — a warehouse code in a "Location" column
     that means nothing here. */
  const choices = React.useMemo((): readonly Option[] => [
    { id: OFF, label: "Leave it out" },
    ...(seen?.header ?? []).map((head, i) => ({ id: String(i), label: head || `Column ${i + 1}` })),
  ], [seen]);

  return (
    <Screen
      shape="form"
      title={title}
      under="Nothing changes until you say so"
      /*
        ⚠️ THE PRIMARY SAYS WHAT WILL HAPPEN, WITH THE NUMBER IN IT. "Import" is
        a button somebody presses to find out; "Add 412 products" is a decision
        they have already made by the time their thumb lands.
      */
      does={done
        ? { op: "product.import", label: "Import another", icon: glyphOf("add"), onDo: onAgain }
        : seen
          ? {
            op: "product.import",
            label: seen.tally.new + seen.tally.update === 0
              ? "Nothing to import"
              : `Import ${seen.tally.new + seen.tally.update} products`,
            icon: glyphOf("check"),
            onDo: onImport,
            disabled: busy || seen.tally.new + seen.tally.update === 0,
          }
          /* ⚠️ THE PREVIEW IS ITS OWN OPERATION AND ITS OWN GATE. Naming the
             import here would grey out the one control that costs nothing and
             is the whole reason somebody trusts what happens next. */
          : {
            op: "product.preview",
            label: "See what it would do",
            icon: glyphOf("search"),
            onDo: onSee,
            disabled: busy || text.trim() === "",
          }}
    >
      <Steps at={at} steps={STEPS} />

      {done
        ? (
          <>
            <Section label="What happened">
              <StatRow>
                <Stat label="Added" value={done.made} />
                <Stat label="Changed" value={done.changed} />
                <Stat label="Put on a shelf" value={done.received} />
              </StatRow>
              {done.learned
                ? (
                  <NoteRow>
                    {done.learned === 1
                      ? "One supplier was added"
                      : `${done.learned} suppliers were added`}
                  </NoteRow>
                )
                : null}
            </Section>
            {/*
              ⚠️ THE REFUSALS SURVIVE THE SUCCESS SCREEN, and they are the reason
              this section exists at all. A green tick over "412 imported" with
              eleven rows silently missing is the failure this whole path is
              built to avoid.
            */}
            {done.refused.length
              ? (
                <Section
                  label={done.refused.length === 1
                    ? "1 row was not imported"
                    : `${done.refused.length} rows were not imported`}
                >
                  <Group>
                    {done.refused.map((why) => <NoteRow key={why}>{why}</NoteRow>)}
                  </Group>
                </Section>
              )
              : null}
          </>
        )
        : null}

      {!done && seen
        ? (
          <>
            {/*
              ⚠️ THE MAPPING FIRST, ABOVE THE ROWS. A person who scrolls a list of
              four hundred names before reaching the control that fixes them has
              already decided the import is wrong.
            */}
            <Section
              label="Which column is which"
              under="Guessed from your headings — change anything that is wrong"
            >
              <Group>
                {fields.map((field) => (
                  <ControlRow key={field.id} label={field.label} wide>
                    <Choice
                      label={field.label}
                      value={String(columns[field.id] ?? -1)}
                      onChange={(id) => { onColumn(field.id, Number(id)); }}
                      options={choices}
                    />
                  </ControlRow>
                ))}
              </Group>
            </Section>

            <Section label="What would happen">
              <StatRow>
                <Stat label="New" value={seen.tally.new} />
                <Stat label="Already here" value={seen.tally.update} />
                <Stat label="Refused" value={seen.tally.refused} upIsGood={false} />
              </StatRow>
            </Section>

            {/*
              ⚠️ REFUSALS FIRST AND SEPARATED. Everything else on this screen is
              a thing that will happen; these are the rows somebody has to go and
              fix in their own file, and buried in line order they are found by
              scrolling.
            */}
            {seen.tally.refused
              ? (
                <Section label="These will not be imported">
                  <Group>
                    {seen.rows.filter((r) => r.verdict === "refused").map((row) => (
                      <ControlRow key={row.line} label={`Line ${row.line}`} under={under(row)}>
                        <span data-ink="danger">{SAID[row.verdict]}</span>
                      </ControlRow>
                    ))}
                  </Group>
                </Section>
              )
              : null}

            <Section label="Row by row">
              <Group>
                {seen.rows.filter((r) => r.verdict !== "refused").map((row) => (
                  <ControlRow
                    key={row.line}
                    label={row.name || row.code || `Line ${row.line}`}
                    under={under(row)}
                  >
                    <span data-ink="muted">{SAID[row.verdict]}</span>
                  </ControlRow>
                ))}
                {seen.rows.some((r) => r.verdict !== "refused")
                  ? null
                  : <NoteRow>Every row was refused</NoteRow>}
              </Group>
            </Section>
          </>
        )
        : null}

      {!done && !seen
        ? (
          <Section label="Your rows">
            <LongText
              label="Paste them here"
              value={text}
              onChange={onText}
              placeholder={"Name\tBrand\tBarcode\tQuantity\tShelf"}
              /* ⚠️ SAID WHERE IT IS TRUE. "Copy the whole sheet including the
                 heading row" is the one instruction that decides whether the
                 mapping works at all, so it sits under the box rather than in a
                 help centre. */
              help="Copy the whole sheet from Excel or Numbers, heading row included."
            />
          </Section>
        )
        : null}
    </Screen>
  );
}
