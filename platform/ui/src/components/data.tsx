/**
 * SHOWING THINGS — the surfaces a product reads rather than fills in.
 *
 * ⚠️ EVERY ONE OF THESE IS ON `RENDERER_OWNS`, so an app cannot build its own.
 * That is the whole reason they are here: a breadcrumb, a toast and a table are
 * exactly the components that get rebuilt per screen, and three of anything is
 * three different answers to the same question.
 */

import { useId, type ReactNode } from "react";
import { borrow, TONE } from "../borrowed.js";
import { Text, NoData } from "./primitives.js";
import { Icon, type IconName } from "./icon.js";

/* -------------------------------------------------------------- position --- */

export interface Crumb { readonly id: string; readonly label: string; readonly onGo?: () => void }

/**
 * ⚠️ A BREADCRUMB IS A PATH, NOT A HISTORY. It says where this page sits, so the
 * last item is the page itself and is not a link — a trail of where somebody has
 * been is the back button, and it already exists.
 */
export const Breadcrumbs = ({ trail }: { readonly trail: readonly Crumb[] }) => (
  <nav data-one="breadcrumb" className={borrow("breadcrumbs")} aria-label="Breadcrumb">
    <ol>
      {trail.map((c, i) => (
        <li key={c.id} data-one="breadcrumb-item" {...(i === trail.length - 1 ? { "aria-current": "page" as const } : {})}>
          {i === trail.length - 1
            ? <Text role="body">{c.label}</Text>
            : <button type="button" data-one="breadcrumb-link" onClick={c.onGo}><Text role="body">{c.label}</Text></button>}
        </li>
      ))}
    </ol>
  </nav>
);

export interface PageHeaderProps {
  readonly title: string;
  readonly detail?: string;
  readonly trail?: readonly Crumb[];
  /** ⚠️ ONE primary. A header with three buttons has no primary at all. */
  readonly action?: ReactNode;
}

export const PageHeader = ({ title, detail, trail, action }: PageHeaderProps) => (
  <header data-one="page-header">
    {trail ? <Breadcrumbs trail={trail} /> : null}
    <div data-one="page-header-row">
      <span data-one="page-header-text">
        <Text role="title">{title}</Text>
        {detail ? <Text role="caption" muted>{detail}</Text> : null}
      </span>
      {action ? <span data-one="page-header-action">{action}</span> : null}
    </div>
  </header>
);

/** ⚠️ `Stage`, not `Step`: `motion.ts` already owns that word for a timeline. */
export interface Stage { readonly id: string; readonly label: string }

/**
 * ⚠️ IT SAYS WHERE SOMEBODY IS AND HOW MUCH IS LEFT, which is the only reason to
 * draw one. Steps with no count is a decoration; a count with no current step is
 * a progress bar wearing labels.
 */
export const Steps = ({ steps, at }: { readonly steps: readonly Stage[]; readonly at: string }) => {
  const index = Math.max(0, steps.findIndex((s) => s.id === at));
  return (
    <ol data-one="steps" className={borrow("steps")} aria-label={`Step ${index + 1} of ${steps.length}`}>
      {steps.map((s, i) => (
        <li
          key={s.id}
          data-one="step"
          data-state={i < index ? "done" : i === index ? "current" : "ahead"}
          {...(i === index ? { "aria-current": "step" as const } : {})}
        >
          <Text role="caption">{s.label}</Text>
        </li>
      ))}
    </ol>
  );
};

export interface PaginationProps {
  readonly page: number;
  readonly pages: number;
  readonly onGo?: (page: number) => void;
}

/**
 * ⚠️ IT SAYS WHICH PAGE OF HOW MANY. A pair of arrows with no position is a
 * control somebody presses until something familiar appears.
 */
export const Pagination = ({ page, pages, onGo }: PaginationProps) => (
  <nav data-one="pagination" aria-label="Pages">
    <button type="button" data-one="pagination-prev" disabled={page <= 1} aria-label="Previous page" onClick={() => onGo?.(page - 1)}>
      <Icon name="back" />
    </button>
    <Text role="caption" numeric>{`${page} of ${pages}`}</Text>
    {/* ⚠️ A MATCHED PAIR. An arrow one way and a chevron the other is two
        different promises about one control. */}
    <button type="button" data-one="pagination-next" disabled={page >= pages} aria-label="Next page" onClick={() => onGo?.(page + 1)}>
      <Icon name="forward" />
    </button>
  </nav>
);

/* ------------------------------------------------------------------ data --- */

export interface Column<T> {
  readonly id: string;
  readonly label: string;
  /** ⚠️ Numeric columns align right and use tabular figures. Nothing else does. */
  readonly numeric?: boolean;
  readonly cell: (row: T) => ReactNode;
}

/**
 * ⚠️ A TABLE IS FOR COMPARING ROWS, AND A PHONE CANNOT. At a narrow container it
 * is a list of records instead — same data, same order, one component. Two
 * components is where "the mobile version is missing a column" comes from.
 */
export function Table<T>({ columns, rows, caption, keyOf }: {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly caption: string;
  readonly keyOf: (row: T) => string;
}) {
  return (
    <div data-one="table-scroll">
      <table data-one="table" className={borrow("table")}>
        <caption data-one="table-caption">{caption}</caption>
        <thead>
          <tr>{columns.map((c) => <th key={c.id} scope="col" data-numeric={c.numeric ? "" : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={keyOf(r)}>
              {columns.map((c) => <td key={c.id} data-numeric={c.numeric ? "" : undefined}>{c.cell(r) ?? <NoData />}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface StatProps {
  readonly label: string;
  /** ⚠️ `null` is not zero. A statistic nobody has computed says so. */
  readonly value: ReactNode | null;
  readonly detail?: string;
  /** A movement, which is the one thing a number on its own cannot say. */
  readonly trend?: { readonly direction: "up" | "down"; readonly label: string; readonly good: boolean };
}

export const Stat = ({ label, value, detail, trend }: StatProps) => (
  <div data-one="stat">
    <Text role="caption" muted>{label}</Text>
    <span data-one="stat-value" data-numeric="">{value === null ? <NoData /> : value}</span>
    {trend ? (
      /* ⚠️ UP IS NOT GOOD. Spend up and weight down are both bad news, so the
         tone comes from `good` and never from the arrow's direction. */
      <span data-one="stat-trend" data-direction={trend.direction} data-tone={trend.good ? TONE.success : TONE.danger}>
        <Text role="caption">{trend.label}</Text>
      </span>
    ) : null}
    {detail ? <Text role="caption" muted>{detail}</Text> : null}
  </div>
);

export interface ProgressProps {
  /** ⚠️ `null` means the length is UNKNOWN, which is a different animation. */
  readonly value: number | null;
  readonly max?: number;
  readonly label: string;
}

/**
 * ⚠️ INDETERMINATE IS A DIFFERENT COMPONENT-STATE, NOT A ZERO. A determinate bar
 * sitting at 0% is a claim that nothing has happened; an indeterminate one says
 * the length is not known, which is usually the truth.
 */
export const Progress = ({ value, max = 100, label }: ProgressProps) => (
  <div data-one="progress" data-state={value === null ? "unknown" : "ready"}>
    <progress
      className={borrow("progress")}
      value={value ?? undefined}
      max={max}
      aria-label={label}
    />
    {value === null ? null : <Text role="caption" numeric>{`${Math.round((value / max) * 100)}%`}</Text>}
  </div>
);

/* ------------------------------------------------------------- disclosure --- */

export interface DisclosureProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly open?: boolean;
}

/**
 * ⚠️ WHAT IS INSIDE MUST BE SKIPPABLE, NOT SECRET. Disclosure is for detail
 * somebody may not need — never for a required field or an error, both of which
 * are then invisible to the person who most needs them.
 */
export const Disclosure = ({ title, children, open }: DisclosureProps) => (
  <details data-one="disclosure" className={borrow("collapse")} open={open}>
    <summary data-one="disclosure-summary"><Text role="subtitle">{title}</Text><Icon name="chevron" /></summary>
    <div data-one="disclosure-body">{children}</div>
  </details>
);

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly destructive?: boolean;
  readonly onRun?: () => void;
}

/**
 * ⚠️ A MENU IS ACTIONS ON ONE THING, NOT NAVIGATION. Destinations belong to the
 * one navigation surface — a menu that holds places is a second answer to "where
 * am I", which is the failure the whole navigation section exists to prevent.
 */
export const Menu = ({ label, items }: { readonly label: string; readonly items: readonly MenuItem[] }) => (
  <ul data-one="menu" className={borrow("menu")} role="menu" aria-label={label}>
    {items.map((i) => (
      <li key={i.id} role="none">
        <button type="button" role="menuitem" data-one="menu-item" data-tone={i.destructive ? TONE.danger : undefined} onClick={i.onRun}>
          {i.icon ? <Icon name={i.icon} /> : null}
          <Text role="body">{i.label}</Text>
        </button>
      </li>
    ))}
  </ul>
);

/* --------------------------------------------------------------- feedback --- */

export interface ToastProps {
  readonly tone: "success" | "warning" | "danger" | "info";
  readonly title: string;
  /** ⚠️ Required on anything undoable. A toast is where an undo can still exist. */
  readonly undo?: { readonly label: string; readonly onUndo: () => void };
  readonly onDismiss?: () => void;
}

/**
 * ⚠️ A TOAST IS FOR SOMETHING THAT ALREADY HAPPENED. It never asks a question and
 * never holds the only copy of information — it disappears, and a message that
 * disappears cannot be the way somebody learns something they needed.
 *
 * ⚠️ AND `danger` IS A STATUS THAT STAYS. A failure in a toast is a failure the
 * reader may never see; it is announced assertively and it does not time out.
 */
export const Toast = ({ tone, title, undo, onDismiss }: ToastProps) => (
  <div
    data-one="toast"
    className={borrow("alert", [`-${TONE[tone]}`])}
    data-tone={tone}
    data-persistent={tone === "danger" ? "" : undefined}
    role={tone === "danger" ? "alert" : "status"}
    aria-live={tone === "danger" ? "assertive" : "polite"}
  >
    <span data-one="toast-icon" data-tone={tone}><Icon name={tone} /></span>
    <Text role="body">{title}</Text>
    {/* ⚠️ ONE COLUMN FOR WHAT CAN BE DONE, ALWAYS PRESENT. Floating each action
        to the end put them wherever the message length left them, so two toasts
        in a row had their buttons in different places. */}
    <span data-one="toast-actions">
      {undo ? <button type="button" data-one="toast-undo" onClick={undo.onUndo}><Text role="body">{undo.label}</Text></button> : null}
      <button type="button" data-one="toast-dismiss" aria-label="Dismiss" onClick={onDismiss}><Icon name="close" /></button>
    </span>
  </div>
);

/**
 * ⚠️ A TOOLTIP MAY NEVER CARRY THE ONLY COPY OF ANYTHING. It is unreachable by
 * touch, so anything it says has to exist somewhere a finger can find. It
 * decorates; it does not inform.
 */
export const Tooltip = ({ hint, children }: { readonly hint: string; readonly children: ReactNode }) => {
  const id = useId();
  return (
    <span data-one="tooltip" aria-describedby={id}>
      {children}
      <span data-one="tooltip-text" id={id} role="tooltip">{hint}</span>
    </span>
  );
};

/**
 * ⚠️ WAITING IS A SHAPE WHEN THE SHAPE IS KNOWN, and a spinner only when it is
 * not. `Skeleton` is the first case; this is the second, and choosing it for a
 * list is what makes a page jump when the list arrives.
 */
export const Spinner = ({ label }: { readonly label: string }) => (
  <span data-one="spinner" className={borrow("loading")} role="status" aria-label={label} />
);

/** ⚠️ Space separates; a rule is for when space alone would be ambiguous. */
export const Divider = ({ label }: { readonly label?: string }) => (
  <div data-one="divider" className={borrow("divider")} role="separator">
    {label ? <Text role="caption" muted>{label}</Text> : null}
  </div>
);

