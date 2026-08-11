/**
 * THE PRIMITIVES — small, and closed on purpose.
 *
 * ⚠️ A COMPONENT NAMES A ROLE AND NEVER A COLOUR. There is no `color` prop, no
 * `style` escape and no `className` passthrough on anything here. One arbitrary
 * colour is all it takes for the exhaustive sweep to stop being a guarantee, and
 * a passthrough is an arbitrary colour with a friendly name.
 *
 * ⚠️ AND NO COMPONENT HOLDS A DURATION. Motion arrives as a role in a scene, so
 * two components physically cannot run competing timelines.
 */

import type { ReactNode } from "react";
import type { Interaction } from "../state.js";
import type { Role } from "../motion.js";
import { semanticForm } from "../ground.js";
import type { Oklch } from "../colour.js";
import { SEMANTIC } from "../semantic.js";
import { borrow, SIZE, TONE } from "../borrowed.js";

/* ---------------------------------------------------------------- surface --- */

/** How far from the canvas. ⚠️ Relative — nothing here names an absolute tone. */
export type Depth = 0 | 1 | 2 | 3;

export interface SurfaceProps {
  readonly depth?: Depth;
  readonly role?: Role;
  readonly children?: ReactNode;
  /** ⚠️ The ONE way a semantic tone reaches a surface, and it is a token name. */
  readonly tone?: "success" | "warning" | "danger" | "info";
  readonly as?: "div" | "section" | "article" | "aside" | "li";
}

const surfaceVars = (depth: Depth): Record<string, string> => ({
  background: depth === 0 ? "var(--canvas)" : `var(--surface-${depth})`,
  color: depth === 0 ? "var(--canvas-ink)" : `var(--surface-${depth}-ink)`,
});

export function Surface({ depth = 1, role = "content", tone, children, as: Tag = "div" }: SurfaceProps) {
  return (
    <Tag
      data-one="surface"
      /* ⚠️ Depth stays OURS: the library has one card, and how far a card is
         from the light is the thing this language computes. */
      className={depth === 0 ? undefined : borrow("card")}
      data-depth={depth}
      data-role={role}
      {...(tone ? { "data-tone": tone } : {})}
      style={surfaceVars(depth)}
    >
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------- text --- */

/** The roles, closed. ⚠️ A size is never chosen; a role is. */
export type TextRole = "display" | "title" | "subtitle" | "body" | "caption" | "micro";

export interface TextProps {
  readonly role?: TextRole;
  readonly muted?: boolean;
  /** ⚠️ Tabular figures on anything numeric. A number that reflows as it ticks is a bug. */
  readonly numeric?: boolean;
  readonly children?: ReactNode;
}

export function Text({ role = "body", muted, numeric, children }: TextProps) {
  return (
    <span data-one="text" data-role={role} {...(muted ? { "data-muted": "" } : {})} {...(numeric ? { "data-numeric": "" } : {})}>
      {children}
    </span>
  );
}

/**
 * ⚠️ A VALUE SLOT WITH NOTHING IN IT TAKES `null` AND RENDERS THIS.
 *
 * An em dash at display size is not a placeholder, it is a horizontal rule — it
 * reads as a divider with a caption under it, which looks broken rather than
 * empty. It is also the one placeholder assistive technology cannot convey.
 */
export const NoData = ({ label = "No data yet" }: { readonly label?: string }) => (
  <span data-one="no-data" aria-label={label}>
    <Text role="caption" muted>{label}</Text>
  </span>
);

/* ----------------------------------------------------------------- button --- */

export interface ButtonProps {
  readonly kind?: "primary" | "tonal" | "quiet" | "destructive";
  readonly size?: "sm" | "md" | "lg";
  readonly state?: Interaction;
  /**
   * ⚠️ REQUIRED WHENEVER THE STATE REFUSES. A control that refuses without
   * saying why is the most common product failure there is — and a locked one
   * carries the way out, because a disabled control cannot sell anything.
   */
  readonly reason?: string;
  readonly resolve?: string;
  readonly children?: ReactNode;
  readonly onPress?: () => void;
}

export function Button({ kind = "tonal", size = "md", state = "idle", reason, resolve, children, onPress }: ButtonProps) {
  const refusing = state === "disabled" || state === "locked";
  if (refusing && !reason) {
    /*
      Thrown rather than rendered: a refusal with no explanation is not a
      degraded button, it is a dead end, and shipping one silently is how a
      product accumulates controls nobody can get past.
    */
    throw new Error("Button: `disabled` and `locked` require a `reason`");
  }
  return (
    <button
      type="button"
      data-one="button"
      /*
        ⚠️ THE LIBRARY DRAWS THE PILL; THE SHEET PLACES IT. `kind` and `size` are
        OUR words, mapped in `borrowed.ts` — a component that knew the library's
        names is a component where somebody eventually writes one inline, and
        then a sixth kind exists that the language never declared.
      */
      className={borrow("button", [
        kind === "primary" ? "-primary" : kind === "quiet" ? "-ghost" : kind === "destructive" ? `-${TONE.danger}` : "-neutral",
        SIZE[size],
      ])}
      data-kind={kind}
      data-size={size}
      data-state={state}
      /*
        ⚠️ LOCKED IS NOT DISABLED. A locked control stays focusable and readable
        so it can explain itself and offer the way out; only a genuinely
        inapplicable one is removed from the tab order.
      */
      disabled={state === "disabled" || state === "busy"}
      /*
        ⚠️ A LOCKED CONTROL IS NOT DISABLED, INCLUDING TO ASSISTIVE TECHNOLOGY.
        It is actionable — pressing it is how somebody reaches the plan that
        would unlock it — so marking it unavailable announces the opposite of
        what it does and removes the one route out of the state.
      */
      aria-disabled={state === "disabled" || state === "busy" ? true : undefined}
      aria-busy={state === "busy" ? true : undefined}
      aria-describedby={reason ? "reason" : undefined}
      {...(resolve ? { "data-resolve": resolve } : {})}
      onClick={onPress}
    >
      <span data-one="button-label">{children}</span>
      {reason ? <span data-one="reason" id="reason">{reason}</span> : null}
    </button>
  );
}

/* ------------------------------------------------------------------- row --- */

export interface RowProps {
  readonly lead?: ReactNode;
  readonly title: ReactNode;
  readonly detail?: ReactNode;
  /** ⚠️ `null` renders `NoData`. Callers say what they know. */
  readonly value?: ReactNode | null;
  readonly onOpen?: () => void;
}

/**
 * ⚠️ THE WHOLE ROW IS THE TARGET, not the glyph inside it. A 24px icon in a 56px
 * row is a 56px target — and a hit area smaller than the floor is one people
 * miss on a moving train, which is where most of this is used.
 */
export function Row({ lead, title, detail, value, onOpen }: RowProps) {
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag data-one="row" data-interactive={onOpen ? "" : undefined} {...(onOpen ? { type: "button" as const, onClick: onOpen } : {})}>
      {lead ? <span data-one="row-lead">{lead}</span> : null}
      <span data-one="row-body">
        <Text role="body">{title}</Text>
        {detail ? <Text role="caption" muted>{detail}</Text> : null}
      </span>
      <span data-one="row-value">{value === null ? <NoData /> : value}</span>
    </Tag>
  );
}

/* -------------------------------------------------------------- feedback --- */

export interface CalloutProps {
  readonly tone: "success" | "warning" | "danger" | "info";
  /**
   * The ground this sits on, so the form is DECIDED rather than chosen.
   *
   * ⚠️ AN AUTHOR NEVER WRITES A CONDITIONAL ABOUT THIS AND NEVER LEARNS THE
   * THRESHOLD. Green success on a green ambience can clear every contrast floor
   * and still fail completely, because a signal's job is to differ from its
   * CONTEXT — and a rule that has to be remembered per call site is one that is
   * remembered on the screens somebody was thinking about.
   */
  readonly ground?: Oklch;
  readonly title: string;
  readonly children?: ReactNode;
}

/**
 * ⚠️ NEVER COLOUR ALONE, AT ANY SATURATION. Every state carries a word and an
 * icon, so a greyscale screenshot and a person with deuteranopia read the same
 * screen. `contained` is the form a colliding tone takes: the colour demotes to
 * an edge and an icon on a neutral surface.
 */
export function Callout({ tone, ground, title, children }: CalloutProps) {
  /*
    ⚠️ THE COLOUR DEMOTES TO AN EDGE AND AN ICON on a neutral surface when it
    would be confusable — the signal keeps two of its four axes (word and icon)
    and gives up the one that stopped working. Tone is the least load-bearing of
    the four and is always the first to go.
  */
  const form = ground ? semanticForm(SEMANTIC[tone], ground) : "tone";
  return (
    <div data-one="callout" className={borrow("alert", [`-${TONE[tone]}`])} data-tone={tone} data-form={form} role={tone === "danger" ? "alert" : "status"}>
      <span data-one="callout-icon" aria-hidden="true" data-tone={tone} />
      <Text role="subtitle">{title}</Text>
      {children ? <Text role="body">{children}</Text> : null}
    </div>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly detail?: string;
  readonly action?: ReactNode;
}

export const EmptyState = ({ title, detail, action }: EmptyStateProps) => (
  <div data-one="empty-state">
    <Text role="subtitle">{title}</Text>
    {detail ? <Text role="body" muted>{detail}</Text> : null}
    {action}
  </div>
);

/**
 * ⚠️ MATCHES THE REAL LAYOUT'S GEOMETRY. A skeleton that does not is worse than
 * a spinner: it promises a shape and then the content arrives somewhere else, so
 * the page jumps under whoever was already reading it.
 */
export const Skeleton = ({ rows = 3 }: { readonly rows?: number }) => (
  <div data-one="skeleton" aria-hidden="true" data-rows={rows}>
    {Array.from({ length: rows }, (_, i) => <span key={i} data-one="skeleton-row" className={borrow("skeleton")} />)}
  </div>
);
