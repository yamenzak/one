/**
 * ROWS AND COLUMNS, WITH THE FOUR OUTCOMES BUILT IN.
 *
 * ⚠️ A TABLE IS A SURFACE, SO IT ANSWERS ALL FOUR QUESTIONS — waiting, nothing,
 * trouble, content — through `Loaded`, exactly like every other surface. The
 * table that takes a plain array is the table that renders "No results" during
 * the round trip and again when the request fails; this one cannot.
 *
 * ⚠️ NUMBERS SIT RIGHT, ON TABULAR FIGURES. A column of amounts ragged-left is
 * unreadable at a glance, which is the only way anybody reads a table. The
 * column says `numeric` once; every cell and its header obey.
 *
 * ⚠️ SORTING IS THE CALLER'S COMPARATOR, NOT A STRING GUESS. A column is
 * sortable when it says how (`by`) — sorting "€1,480.00" as text puts €9 above
 * €80 and nobody files the bug because it looks plausibly ordered.
 *
 * ⚠️ AND PAGES APPEAR ONLY WHEN THERE ARE PAGES. A pager under nine rows is
 * furniture; the table paginates itself past `pageSize` and stays honest about
 * the count either way.
 *
 * ⚠️ A TABLE ON A PHONE IS NOT A TABLE, WHICH IS WHY `asRow` EXISTS. Three
 * columns in a 340px column is a horizontal scroll box with two of them cut off
 * mid-word — the roster shipped exactly that, and the `ScrollContainer` doing
 * its job is what made it look deliberate. Columns are for comparing values
 * down a page, and a phone has no page to compare down.
 *
 * ⚠️ AND THE CALLER SAYS HOW IT COLLAPSES, BECAUSE ONLY THE CALLER KNOWS. Which
 * column is the name, which is the line under it, which belongs in the corner —
 * none of that is recoverable from `cols`, and a component guessing it is a
 * component that guesses wrong on the third table anybody writes. A table with
 * no `asRow` keeps scrolling, which is right for one nobody opens on a phone.
 */

import * as React from "react";
import { Pagination, Table } from "@heroui/react";
import { Await, Nothing, TableWaiting, type Loaded } from "./state.js";
import { Group, PersonRow } from "./surfaces.js";
import { TYPE } from "../tokens/type.js";

export interface Col<T> {
  readonly id: string;
  readonly label: string;
  /** Right-aligned, tabular figures. For amounts, counts, anything compared. */
  readonly numeric?: boolean;
  readonly cell: (row: T) => React.ReactNode;
  /** Present = sortable, and this is the order. */
  readonly by?: (a: T, b: T) => number;
}

export interface ListingProps<T> {
  readonly of: Loaded<readonly T[]>;
  readonly cols: readonly Col<T>[];
  readonly rowKey: (row: T) => string;
  /** A row that goes somewhere. */
  readonly onOpen?: (row: T) => void;
  /** Rows per page. The pager appears only past this. */
  readonly pageSize?: number;
  /** What is true when the answer is legitimately no rows. */
  readonly says?: { readonly nothing: string; readonly under?: string };
  readonly again?: () => void;
  /** What this table is, for the screen reader. */
  readonly label: string;
  /**
   * ⚠️ THE SAME ROWS WHERE THERE IS NO ROOM FOR COLUMNS — see the header. The
   * corner takes whatever the table put in its last columns: a state, a count,
   * a control.
   */
  readonly asRow?: (row: T) => {
    readonly name: string;
    readonly under?: string;
    readonly aside?: React.ReactNode;
    readonly face?: string;
  };
}

export function Listing<T>(
  { of, cols, rowKey, onOpen, pageSize = 10, says, again, label, asRow }: ListingProps<T>,
) {
  const [order, setOrder] = React.useState<{ readonly id: string; readonly up: boolean } | null>(null);
  const [page, setPage] = React.useState(1);

  return (
    <Await
      of={of}
      waiting={<TableWaiting cols={cols.length} rows={Math.min(pageSize, 6)} />}
      nothing={says ? <Nothing says={says.nothing} under={says.under} /> : undefined}
      again={again}
      then={(rows) => {
        const sorter = order ? cols.find((c) => c.id === order.id)?.by : undefined;
        const sorted = sorter
          ? [...rows].sort((a, b) => (order?.up ? sorter(a, b) : sorter(b, a)))
          : rows;
        const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
        const at = Math.min(page, pages);
        const shown = sorted.slice((at - 1) * pageSize, at * pageSize);

        return (
          /* ⚠️ `min-w-0` OR THE SCROLL CONTAINER NEVER SCROLLS. A flex item's
             floor is its content, so a table wider than the column made the
             COLUMN wider — the header's last label was cut off by the page's
             own edge and the whole screen scrolled sideways, while the
             `ScrollContainer` that exists to prevent exactly that sat there
             with nothing to do. */
          <div className="flex min-w-0 flex-col">
            {/*
              ⚠️ BOTH SHAPES RENDER AND CSS PICKS ONE, rather than a hook
              measuring the viewport. A width read in JavaScript is a width that
              is wrong on the first paint and right one frame later, which is a
              table that visibly becomes a list every time somebody opens the
              screen — and it is wrong in every server-rendered test.
            */}
            {asRow ? (
              <div className="md:hidden">
                <Group>
                  {shown.map((row) => {
                    const it = asRow(row);
                    return (
                      <PersonRow
                        key={rowKey(row)}
                        goes={onOpen !== undefined}
                        name={it.name}
                        under={it.under}
                        aside={it.aside}
                        face={it.face}
                        onOpen={() => onOpen?.(row)}
                      />
                    );
                  })}
                </Group>
              </div>
            ) : null}

            <div className={asRow ? "hidden md:block" : undefined}>
            {/* ⚠️ `Table` is the frame and `Table.Content` is the table — the
                sorting and row-action props live on Content, which is the
                react-aria half. Putting them on the frame typechecks nothing
                and does nothing, silently. */}
            <Table>
              <Table.ScrollContainer>
                <Table.Content
                  aria-label={label}
                  sortDescriptor={order ? { column: order.id, direction: order.up ? "ascending" : "descending" } : undefined}
                  onSortChange={(d) => setOrder({ id: String(d.column), up: d.direction === "ascending" })}
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
                {shown.map((row) => (
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
            </div>
            {sorted.length > pageSize ? (
              <Paged page={at} pages={pages} count={sorted.length} pageSize={pageSize} onPage={setPage} />
            ) : null}
          </div>
        );
      }}
    />
  );
}

/**
 * ⚠️ THE WINDOW IS FIVE, WITH THE ENDS ALWAYS REACHABLE. A pager that lists
 * every page is a ruler; one that hides the last page makes "how many are
 * there" a scroll. First, last, and a window around here — the shape every
 * product converges on because it is the one that answers both questions.
 */
export function Paged({ page, pages, count, pageSize, onPage }: {
  readonly page: number;
  readonly pages: number;
  readonly count: number;
  readonly pageSize: number;
  readonly onPage: (page: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);

  const near = new Set([1, pages, page - 1, page, page + 1]);
  const shown: (number | "…")[] = [];
  for (let n = 1; n <= pages; n++) {
    if (near.has(n)) shown.push(n);
    else if (shown[shown.length - 1] !== "…") shown.push("…");
  }

  return (
    <Pagination>
      <Pagination.Summary>
        <span className={TYPE.note}>{from}–{to} of {count}</span>
      </Pagination.Summary>
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous isDisabled={page <= 1} onPress={() => onPage(page - 1)}>
            <Pagination.PreviousIcon />
          </Pagination.Previous>
        </Pagination.Item>
        {shown.map((n, i) => (
          <Pagination.Item key={i}>
            {n === "…" ? (
              <Pagination.Ellipsis />
            ) : (
              <Pagination.Link isActive={n === page} onPress={() => onPage(n)}>{n}</Pagination.Link>
            )}
          </Pagination.Item>
        ))}
        <Pagination.Item>
          <Pagination.Next isDisabled={page >= pages} onPress={() => onPage(page + 1)}>
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}
