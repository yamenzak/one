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

import type { DocumentDef, NeedBook, RopaEntry, SubProcessorBook } from "@engine/kernel";
import { Button, Card, Chip, Table } from "@heroui/react";
import { ControlRow, FieldRow, Group } from "../parts/surfaces.js";
import { SPACE } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";

export function Ropa({ rows }: { readonly rows: readonly RopaEntry[] }) {
  return (
    <div className={`flex flex-col ${SPACE.snug}`}>
      {rows.map((row) => (
        <Card key={row.of}>
          <Card.Header>
            <Card.Title>{row.of}</Card.Title>
            <Card.Description>{row.why}</Card.Description>
          </Card.Header>
          <Card.Content>
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
                ? <span>Shared with: {row.recipients.join(", ")}</span>
                : <span>Not shared with anybody outside this deployment</span>}
            </div>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

export interface DocumentsProps {
  readonly documents: readonly DocumentDef[];
  /** What is still owed. An acceptance of an older version is no acceptance. */
  readonly outstanding: readonly DocumentDef[];
  readonly onAccept: (id: string) => void;
}

export function Documents({ documents, outstanding, onAccept }: DocumentsProps) {
  const owed = new Set(outstanding.map((d) => d.id));
  return (
    /*
      ⚠️ A DOCUMENT IS A ROW, NOT A CARD. Each one was a `Card` with a title, a
      version and a lone chip in its content — three levels of chrome around two
      facts and one control, once per document, on a screen that is a list of
      documents.

      ⚠️ AND "ACCEPTED" IS A NOTE RATHER THAN A GREEN CHIP. `success` is for
      something that just WENT WELL — a payment cleared, a job finished — and a
      standing fact about a signature from months ago is not that. Two green
      pills stacked were the only colour on a monochrome screen, which read as an
      alert rather than as a record.
    */
    <Group>
      {documents.map((doc) => (
        <ControlRow
          key={doc.id}
          label={doc.title}
          /* ⚠️ The version is a DATE, because "did they accept the one from
             before the change" is the only question ever asked of it. */
          under={`Version of ${doc.version}`}
        >
          {owed.has(doc.id)
            ? <Button variant="primary" onPress={() => onAccept(doc.id)}>Read and accept</Button>
            : <span className={TYPE.note}>Accepted</span>}
        </ControlRow>
      ))}
    </Group>
  );
}

export function SubProcessors({ book }: { readonly book: SubProcessorBook }) {
  const all = Object.values(book);
  return (
    <>
      {/*
        ⚠️ FOUR COLUMNS IN A PHONE'S WIDTH IS NOT A TABLE. It rendered as a
        sideways scroll box with "Runs the service and stores the records" broken
        one word per line and the column that matters — what they actually
        receive — cut off past the edge. This is a disclosure somebody READS, so
        on a phone each party is a small block of labelled facts, which is what
        `FieldRow` is for.
      */}
      <div className={`md:hidden flex flex-col ${SPACE.snug}`}>
        {all.map((p) => (
          <Group key={p.id} label={p.name}>
            <FieldRow label="What they do" value={p.role} />
            <FieldRow label="Where" value={p.country} />
            <FieldRow label="What they receive" value={p.receives.join(", ")} />
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
      <div className="hidden md:block">
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Sub-processors">
              <Table.Header>
                <Table.Column id="who" isRowHeader>Who</Table.Column>
                <Table.Column id="role">What they do</Table.Column>
                <Table.Column id="where">Where</Table.Column>
                <Table.Column id="receives">What they receive</Table.Column>
              </Table.Header>
              <Table.Body>
                {all.map((p) => (
                  <Table.Row key={p.id}>
                    <Table.Cell>{p.name}</Table.Cell>
                    <Table.Cell>{p.role}</Table.Cell>
                    <Table.Cell>{p.country}</Table.Cell>
                    <Table.Cell>{p.receives.join(", ")}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </div>
    </>
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
