/**
 * EVERY TABLE IN THE SYSTEM, AND THE ONLY MODULE ALLOWED TO NAME ONE.
 *
 * ⚠️ IT IS HERE FOR THE SAME REASON `pickers.tsx` IS. The design system has one
 * barrel, so a `Table` named anywhere inside it put HeroUI's table — and the
 * react-aria grid, selection and collection machinery under it, and
 * `@internationalized/date` under THAT — into the module graph of every screen
 * on every app, including a phone's home screen, which has no table on it.
 * Measured through the source map: the single largest module in the entry chunk
 * once the calendar had moved, at 53 KB, plus 29 KB of a date library nothing
 * on that screen renders.
 *
 * ⚠️ AND IT IS ONE MODULE FOR ALL THREE TABLES BECAUSE SPLITTING ONE AT A TIME
 * SAVED NOTHING. `Listing` was moved out first and the entry did not shrink by a
 * kilobyte, because the sub-processor register and the plan comparison were
 * still naming `Table` statically two directories away. A heavy component has to
 * have exactly ONE static importer or it has none — that is what
 * `scripts/weight.test.mjs` checks, and it is the only version of this rule that
 * holds.
 *
 * ⚠️ THE TABLE RATHER THAN THE WHOLE LISTING, though. Everything else `Listing`
 * does is cheap and half of it is what a PHONE sees: the search field, the
 * paging, the empty state, and the row-shaped fallback `asRow` draws instead of
 * a grid. A phone that never renders a table should never fetch one.
 *
 * ⚠️ AND THE STATE STAYS WITH THE FRAME. Sorting, paging and what somebody typed
 * belong to `Listing` — this draws what it is given and reports a sort. A grid
 * holding its own order is a grid whose order resets whenever the chunk that
 * holds it is replaced.
 */

import * as React from "react";
import { Table } from "@heroui/react";
import type { Col } from "./listing.js";

export interface ListingTableProps<T> {
  readonly rows: readonly T[];
  readonly cols: readonly Col<T>[];
  readonly rowKey: (row: T) => string;
  readonly label?: string;
  readonly onOpen?: (row: T) => void;
  readonly order: { readonly id: string; readonly up: boolean } | null;
  readonly onOrder: (order: { readonly id: string; readonly up: boolean }) => void;
}

export function ListingTable<T>(
  { rows, cols, rowKey, label, onOpen, order, onOrder }: ListingTableProps<T>,
) {
  return (
    /* ⚠️ `Table` IS THE FRAME AND `Table.Content` IS THE TABLE — the sorting and
       row-action props live on Content, which is the react-aria half. Putting
       them on the frame typechecks nothing and does nothing, silently. */
    <Table>
      <Table.ScrollContainer>
        <Table.Content
          aria-label={label}
          sortDescriptor={order
            ? { column: order.id, direction: order.up ? "ascending" : "descending" }
            : undefined}
          onSortChange={(d) => onOrder({ id: String(d.column), up: d.direction === "ascending" })}
        >
          <Table.Header>
            {cols.map((c, i) => (
              <Table.Column
                key={c.id}
                id={c.id}
                isRowHeader={i === 0}
                allowsSorting={c.by !== undefined}
                className={c.numeric ? "text-end" : undefined}
              >
                {c.label}
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row
                key={rowKey(row)}
                onAction={onOpen ? () => onOpen(row) : undefined}
              >
                {cols.map((c) => (
                  <Table.Cell
                    key={c.id}
                    className={c.numeric ? "text-end tabular-nums" : undefined}
                  >
                    {c.cell(row)}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

/**
 * A TABLE THAT IS ONLY A TABLE — no sorting, no paging, no `Loaded`.
 *
 * ⚠️ TWO SURFACES NEED ONE AND NEITHER IS A LISTING: the sub-processor register
 * on the Data & Trust screen, and the plan comparison in the catalogue. Both
 * were written against `Table` directly, which is what kept it in the entry
 * after `Listing` had been split out.
 *
 * ⚠️ `Table.Content` IS THE TABLE. `Table` is the frame; the collection is the
 * react-aria half, and a `Table.Column` outside one throws "cannot be rendered
 * outside a collection" DURING RENDER — so it does not degrade, it takes the
 * whole screen to a blank page, in every build, with the typechecker and every
 * suite green. That is why there is one implementation of this rather than one
 * per caller.
 */
export interface PlainCol {
  readonly id: string;
  readonly label: React.ReactNode;
  /** Right-aligned, tabular figures. For amounts, counts, anything compared. */
  readonly numeric?: boolean;
}

export function PlainTable({ label, cols, rows }: {
  readonly label: string;
  readonly cols: readonly PlainCol[];
  /** ⚠️ Cells in column order. A row shorter than `cols` renders blanks. */
  readonly rows: readonly {
    readonly key: string;
    readonly cells: readonly React.ReactNode[];
  }[];
}) {
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label={label}>
          <Table.Header>
            {cols.map((c, i) => (
              <Table.Column
                key={c.id}
                id={c.id}
                isRowHeader={i === 0}
                className={c.numeric ? "text-end" : undefined}
              >
                {c.label}
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.key}>
                {cols.map((c, i) => (
                  <Table.Cell
                    key={c.id}
                    className={c.numeric ? "text-end tabular-nums" : undefined}
                  >
                    {row.cells[i]}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
