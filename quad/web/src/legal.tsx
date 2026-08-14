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

import type { DocumentDef, RopaEntry, SubProcessorBook } from "@quad/kernel";
import { Button, Card, Chip, Separator, Table } from "@heroui/react";

export function Ropa({ rows }: { readonly rows: readonly RopaEntry[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <Card key={row.of}>
          <Card.Header>
            <Card.Title>{row.of}</Card.Title>
            <Card.Description>{row.why}</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
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
    <div className="flex flex-col gap-3">
      {documents.map((doc) => (
        <Card key={doc.id}>
          <Card.Header>
            <Card.Title>{doc.title}</Card.Title>
            {/* ⚠️ The version is a DATE, because "did they accept the one from
                before the change" is the only question ever asked of it. */}
            <Card.Description>Version of {doc.version}</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="flex flex-wrap items-center gap-3">
              {owed.has(doc.id)
                ? <Button variant="primary" onPress={() => onAccept(doc.id)}>Read and accept</Button>
                : <Chip color="success" variant="soft"><Chip.Label>Accepted</Chip.Label></Chip>}
            </div>
          </Card.Content>
          <Separator />
        </Card>
      ))}
    </div>
  );
}

export function SubProcessors({ book }: { readonly book: SubProcessorBook }) {
  return (
    <Table aria-label="Sub-processors">
      <Table.Header>
        <Table.Column isRowHeader>Who</Table.Column>
        <Table.Column>What they do</Table.Column>
        <Table.Column>Where</Table.Column>
        <Table.Column>What they receive</Table.Column>
      </Table.Header>
      <Table.Body>
        {Object.values(book).map((p) => (
          <Table.Row key={p.id}>
            <Table.Cell>{p.name}</Table.Cell>
            <Table.Cell>{p.role}</Table.Cell>
            <Table.Cell>{p.country}</Table.Cell>
            <Table.Cell>{p.receives.join(", ")}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
