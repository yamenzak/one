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
 * ⚠️ AND A LONG LIST CAN BE SEARCHED, BECAUSE PAGING IS NOT FINDING. Ten rows a
 * page over two hundred workspaces is twenty presses to reach a name somebody
 * already knows — and the operator's list is the one place in the product where
 * every customer on the deployment is a row. What a row matches ON is the
 * caller's (`find.of`), for the same reason `asRow` is: nothing in `cols` says
 * which values a person would type.
 *
 * ⚠️ AND THE CALLER SAYS HOW IT COLLAPSES, BECAUSE ONLY THE CALLER KNOWS. Which
 * column is the name, which is the line under it, which belongs in the corner —
 * none of that is recoverable from `cols`, and a component guessing it is a
 * component that guesses wrong on the third table anybody writes. A table with
 * no `asRow` keeps scrolling, which is right for one nobody opens on a phone.
 */

import * as React from "react";
import { Pagination } from "@heroui/react";
import { Await, Nothing, TableWaiting, type Loaded } from "./state.js";
import type { ListingTableProps } from "./listing-table.js";
import type { FaceOf } from "./face.js";
import { Group, PersonRow } from "./surfaces.js";
import { TextInput } from "./forms.js";
import { glyphOf } from "../frame/shell.js";
import { SPACE } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";

/**
 * ⚠️ THE GRID ARRIVES WHEN ONE IS DRAWN — see `listing-table.tsx`. Naming
 * `Table` here put HeroUI's table, the react-aria grid under it and
 * `@internationalized/date` under that into every screen on every app, phone
 * home screens included. Measured: 53 KB plus 29 KB of a date library, in the
 * entry chunk, for three screens nobody opens first.
 *
 * ⚠️ AND THE CAST IS WHAT KEEPS THE ROW TYPE. `React.lazy` is typed for a
 * concrete component and erases a type parameter on the way through, so without
 * this the grid takes `unknown` rows — and `cols` would stop being checked
 * against the thing they read, which is the one guarantee this component has.
 */
const Grid = React.lazy(() =>
  import("./listing-table.js").then((m) => ({ default: m.ListingTable }))) as unknown as
  <T>(props: ListingTableProps<T>) => React.ReactElement;

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
  /** ⚠️ `icon` IS THE TABLE'S OWN NOUN — see `Nothing`. */
  readonly says?: {
    readonly nothing: string;
    readonly under?: string;
    readonly icon?: React.ReactNode;
  };
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
    /** ⚠️ WHO OR WHAT, NOT A PICTURE — `whoFace`/`placeFace`/`appFace`. */
    readonly face?: FaceOf;
  };
  /**
   * ⚠️ WHAT A ROW MATCHES ON, AND ABSENT MEANS NO SEARCH AT ALL. A short list
   * with a search box is furniture; the field appears only where the caller has
   * said what would be typed.
   *
   * ⚠️ AND SUPPLYING IT IS PERMISSION RATHER THAN AN INSTRUCTION. The field is
   * drawn only once the list is longer than one page — a caller cannot know how
   * many rows a deployment will have, and every one of them would otherwise
   * ship a search box over the three rows it has on the first day.
   */
  readonly find?: {
    readonly of: (row: T) => string;
    /** What somebody is looking for here. Two or three words. */
    readonly label?: string;
  };
}

export function Listing<T>(
  { of, cols, rowKey, onOpen, pageSize = 10, says, again, label, asRow, find }: ListingProps<T>,
) {
  const [order, setOrder] = React.useState<{ readonly id: string; readonly up: boolean } | null>(null);
  const [page, setPage] = React.useState(1);
  const [looking, setLooking] = React.useState("");

  return (
    <Await
      of={of}
      waiting={<TableWaiting cols={cols.length} rows={Math.min(pageSize, 6)} />}
      nothing={says
        ? <Nothing icon={says.icon} says={says.nothing} under={says.under} />
        : undefined}
      again={again}
      then={(rows) => {
        /* ⚠️ MATCHED FOLDED AND TRIMMED, because nobody types a workspace's
           capitalisation and half of them are pasted with a space on the end. */
        const want = looking.trim().toLowerCase();
        /* ⚠️ AND THE FIELD ONLY APPEARS ONCE THERE IS SOMETHING TO FIND. A
           labelled search box over five rows is a control taller than two of
           the rows it filters, at the top of a screen where everything is
           already visible — furniture, which is what this prop's own comment
           refuses one line up. The floor is a page: below it the list IS the
           answer, above it somebody is scrolling or paging for a name they
           already know. */
        const finding = find && rows.length > pageSize ? find : undefined;
        const found = want && finding
          ? rows.filter((r) => finding.of(r).toLowerCase().includes(want))
          : rows;
        const sorter = order ? cols.find((c) => c.id === order.id)?.by : undefined;
        const sorted = sorter
          ? [...found].sort((a, b) => (order?.up ? sorter(a, b) : sorter(b, a)))
          : found;
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
          <div className={`flex min-w-0 flex-col ${finding ? SPACE.snug : ""}`}>
            {finding ? (
              <TextInput
                label={finding.label ?? "Find one"}
                value={looking}
                onChange={(v) => { setLooking(v); setPage(1); }}
                before={glyphOf("search")}
              />
            ) : null}
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
              {/* ⚠️ THE FALLBACK IS THE SAME SKELETON THE LOAD USES, so the
                  wait for the chunk and the wait for the rows look like one
                  wait rather than two different faults. */}
              <React.Suspense
                fallback={<TableWaiting cols={cols.length} rows={Math.min(pageSize, 6)} />}
              >
                <Grid
                  rows={shown}
                  cols={cols}
                  rowKey={rowKey}
                  label={label}
                  onOpen={onOpen}
                  order={order}
                  onOrder={setOrder}
                />
              </React.Suspense>
            </div>
            {sorted.length > pageSize ? (
              <Paged page={at} pages={pages} count={sorted.length} pageSize={pageSize} onPage={setPage} />
            ) : null}
            {/* ⚠️ A SEARCH THAT FOUND NOTHING IS NOT AN EMPTY LIST. `says` is
                what is true when the deployment HAS none; this is what is true
                when the words do not match, and answering the first with the
                second tells somebody their workspaces are gone. */}
            {finding && want && sorted.length === 0 ? (
              <Nothing icon={glyphOf("search")} says="Nothing matches that" />
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
