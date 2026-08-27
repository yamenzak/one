/**
 * THE RECORD, THE DOCUMENTS AND WHO ELSE RECEIVES ANYTHING.
 *
 * ⚠️ THE PROCESSING RECORD IS DERIVED FROM THE DECLARATIONS AND RENDERED, never
 * written. It is the one document whose whole value is that it matches what the
 * software actually does — a hand-written one is accurate on the day it is typed
 * and drifts silently from then on.
 *
 * ⚠️ AND A SUB-PROCESSOR IS SHOWN WITH WHERE IT IS. "Which countries does our
 * data go to" is the first question any customer's own compliance team asks, and
 * a list of company names without it answers nothing.
 */

import * as React from "react";
import type { DocumentDef, Instant, NeedBook, RopaEntry, SubProcessorBook } from "@engine/kernel";
import { sayDate, sayList } from "@engine/kernel";
import { Button, Card, Chip } from "@heroui/react";
import { ControlRow, FieldRow, Group, NavRow } from "../parts/surfaces.js";
import { glyphOf } from "../frame/shell.js";
import { AgreedMark } from "../parts/marks.js";
import { Listed, useShown } from "../parts/said.js";
import { TableWaiting } from "../parts/state.js";
import { BOX, ROOM, SPACE } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";

/**
 * ⚠️ THE REGISTER'S TABLE ARRIVES WITH THE SCREEN THAT DRAWS IT — see
 * `listing-table.tsx`. This module is reached from `main.tsx` (the terms can be
 * read from the sign-in screen), so a `Table` named here is a table in the entry
 * chunk of every app on the engine.
 */
const Grid = React.lazy(() =>
  import("../parts/listing-table.js").then((m) => ({ default: m.PlainTable })));

export function Ropa({ rows }: { readonly rows: readonly RopaEntry[] }) {
  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {rows.map((row) => (
        <Group key={row.of} label={row.of} under={row.why}>
          <div className={`flex flex-col ${SPACE.tight}`}>
              <div className={`flex flex-wrap ${SPACE.tight}`}>
                {row.holdings.map((h) => (
                  <Chip key={h} color={h === "sensitive" ? "warning" : "default"} variant="soft">
                    <Chip.Label>{h}</Chip.Label>
                  </Chip>
                ))}
              </div>
              <span>
                {row.retention === null
                  ? "Kept while the workspace exists"
                  : `Kept for ${row.retention} days`}
              </span>
              {/* ⚠️ Named with their country — see the header. */}
              {row.recipients.length
                ? <span>Shared with <Listed of={row.recipients} /></span>
                : <span>Not shared with anybody outside this deployment</span>}
            </div>
        </Group>
      ))}
    </div>
  );
}

export interface DocumentsProps {
  readonly documents: readonly DocumentDef[];
  /** What is still owed. An acceptance of an older version is no acceptance. */
  readonly outstanding?: readonly DocumentDef[];
  /**
   * ⚠️ OPENING IS THE ONLY THING A ROW DOES, AND THAT IS THE CORRECTION. These
   * rows carried a button reading "Read and accept" that only accepted — there
   * was nowhere in this component a document could be read. Agreeing is one
   * decision about the whole list and belongs to the screen; a row's job is to
   * show somebody what they are being asked.
   */
  readonly onOpen: (id: string) => void;
}

export function Documents({ documents, outstanding = [], signed, onOpen }: DocumentsProps & {
  /**
   * ⚠️ WHEN EACH ONE WAS AGREED, AND TO WHICH VERSION. Absent on the wall, which
   * is about what is still owed and has no history to show yet; present on the
   * account centre, which is only about the history.
   *
   * ⚠️ AND IT IS THE SAME RENDERER EITHER WAY. Agreeing to something and looking
   * it up months later are the same list with one more fact on the row, which is
   * what stops the two surfaces disagreeing about a document's name or version.
   */
  readonly signed?: Readonly<Record<string, { readonly at: string; readonly version: string }>>;
}) {
  const owed = new Set(outstanding.map((d) => d.id));
  /*
    ⚠️ AN OWED DOCUMENT IS MARKED ONLY WHERE IT IS THE EXCEPTION. On the sign-up
    wall every row is owed, so an amber line on each of them is texture — the
    page itself is the alarm. In the account centre one document waiting to be
    accepted sits among documents that are merely published, and "Not agreed
    yet" in the same grey as "Published Feb 1, 2026" is the one line asking
    something of the reader, hidden among lines that ask nothing.
  */
  const mixed = owed.size > 0 && owed.size < documents.length;
  /* ⚠️ FORMATTED HERE, IN THE READER'S OWN CONVENTIONS. A date built with
     `toLocaleString` would be the one date in the product ignoring what somebody
     chose. */
  const shown = useShown();

  return (
    /*
      ⚠️ A DOCUMENT IS A ROW, NOT A CARD. Each one was a `Card` with a title, a
      version and a lone chip in its content — three levels of chrome around two
      facts and one control, once per document, on a screen that is a list of
      documents.

      ⚠️ ONE LINE UNDER THE TITLE, AND IT IS THE ONE SOMEBODY CAME TO READ. The
      row carried a version badge beside the name as well, which is a third fact
      on a row that already has a title, a state and a date — and the version is
      printed inside the document it opens, so the badge was a reference nobody
      needed at the moment of choosing what to open.

      ⚠️ AND A VERSION IS A DAY, SO IT IS SAID AS ONE. `2026-08-01` in a badge is
      the database's spelling of a date, shown to a reader who told us how they
      write them. What the row says instead is when the wording was published,
      in their own conventions — the same fact, legible.
    */
    <Group>
      {documents.map((doc) => {
        const one = signed?.[doc.id];
        return (
          <NavRow
            key={doc.id}
            icon={glyphOf("file")}
            label={doc.title}
            under={one
              ? (
                <span className={`inline-flex items-center ${SPACE.hair}`}>
                  <span aria-hidden="true" className="inline-flex size-4 shrink-0">
                    <AgreedMark />
                  </span>
                  {one.version === doc.version
                    ? `Agreed ${sayDate(shown, one.at as Instant, "short")}`
                    : `Earlier version agreed ${sayDate(shown, one.at as Instant, "short")}`}
                </span>
              )
              : owed.has(doc.id)
                ? <span data-ink={mixed ? "warning" : undefined}>Not agreed yet</span>
                : `Published ${sayDate(shown, doc.version, "short")}`}
            onOpen={() => onOpen(doc.id)}
          />
        );
      })}
    </Group>
  );
}

export function SubProcessors({ book }: { readonly book: SubProcessorBook }) {
  const all = Object.values(book);
  const shown = useShown();
  return (
    /* ⚠️ ITS OWN BOX, NOT THE SCREEN'S — see `BOX`. This is the same collapse
       `Listing` makes, and it was making it on the viewport: a disclosure drawn
       in one column of a two-column page got the four-column table because the
       MONITOR was wide, which is the case the paragraph below was written to
       prevent. */
    <div className={BOX}>
      {/*
        ⚠️ FOUR COLUMNS IN A PHONE'S WIDTH IS NOT A TABLE. It rendered as a
        sideways scroll box with "Runs the service and stores the records" broken
        one word per line and the column that matters — what they actually
        receive — cut off past the edge. This is a disclosure somebody READS, so
        on a phone each party is a small block of labelled facts, which is what
        `FieldRow` is for.
      */}
      <div className={`${ROOM.narrow} flex flex-col ${SPACE.snug}`}>
        {all.map((p) => (
          <Group key={p.id} label={p.name}>
            <FieldRow label="What they do" value={p.role} />
            <FieldRow label="Where" value={p.country} />
            <FieldRow label="What they receive" value={<Listed of={p.receives} />} />
          </Group>
        ))}
      </div>

      {/*
        ⚠️ AND A TABLE WHERE THERE IS ROOM, because comparing countries down a
        column is the question a customer's compliance team actually has. Both
        render and CSS picks one — a width read in JavaScript is wrong on the
        first paint and in every server-rendered test.

        ⚠️ `Table.Content` IS THE TABLE. `Table` is the frame; the collection is
        the react-aria half. A `Table.Column` outside one throws "cannot be
        rendered outside a collection" during render, so this did not degrade —
        it took the WHOLE Data & Trust screen down to a blank page, in every
        build, while the typechecker and every suite stayed green.
      */}
      <div className={ROOM.wide}>
        <React.Suspense fallback={<TableWaiting cols={4} rows={Math.min(all.length, 6)} />}>
          <Grid
            label="Sub-processors"
            cols={[
              { id: "who", label: "Who" },
              { id: "role", label: "What they do" },
              { id: "where", label: "Where" },
              { id: "receives", label: "What they receive" },
            ]}
            rows={all.map((p) => ({
              key: p.id,
              /* ⚠️ A CELL IS A STRING, so this is the one of the three that
                 cannot be `Listed` — the same sentence, said by the same
                 function, one layer down. */
              cells: [p.name, p.role, p.country, sayList(shown, p.receives)],
            }))}
          />
        </React.Suspense>
      </div>
    </div>
  );
}

/**
 * WHERE IT ACTUALLY LIVES — the infrastructure holding somebody's records, and
 * whether it can be held to the jurisdiction they were promised.
 *
 * ⚠️ THIS IS THE HALF OF A PRIVACY NOTICE THAT IS USUALLY A SENTENCE SOMEBODY
 * WROTE. "Your data is stored in the EU" is either true of every store the
 * product touches or it is not true at all, and the difference is invisible from
 * outside: a bucket in the right jurisdiction and a queue with none look
 * identical to everybody except a regulator.
 *
 * ⚠️ SO IT IS DERIVED FROM `AppSpec.needs`, WHICH IS THE SAME DECLARATION THE
 * RECONCILER PROVISIONS FROM. One list: what a product needs, where it was made,
 * and what it can promise. A store that cannot keep the promise is shown saying
 * so rather than omitted — a record that quietly lists only the compliant half
 * is the one that gets somebody in trouble.
 */
export function WhereItLives(
  { needs, keeps }: {
    readonly needs: NeedBook;
    /** ⚠️ The kernel's table, passed rather than imported, so this stays a view. */
    readonly keeps: Readonly<Record<string, boolean>>;
  },
) {
  const all = Object.values(needs);
  if (!all.length) return null;
  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {all.map((n) => (
        <Group key={n.id} label={n.why}>
          <FieldRow label="What holds it" value={KIND_SAID[n.kind] ?? n.kind} />
          <FieldRow label="What goes through it" value={n.holds === "none" ? "Nothing personal" : n.holds} />
          {/*
            ⚠️ NAMED IN BOTH DIRECTIONS. A store that can be pinned to a region
            says so; one that cannot says that, and a reader can tell which
            without knowing anything about the vendor.
          */}
          <FieldRow
            label="Kept in one region"
            value={keeps[n.kind] ? "Yes" : "No — so nothing personal is put through it here"}
          />
        </Group>
      ))}
    </div>
  );
}

/** ⚠️ A vendor's product name means nothing to the person reading this. */
const KIND_SAID: Readonly<Record<string, string>> = {
  d1: "A database", r2: "File storage", kv: "A cache",
  queue: "A work queue", ai: "A model provider", do: "A live session",
};
