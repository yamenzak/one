/**
 * THE FORM — a field is a label, a control, a hint and a fault, in that order.
 *
 * ⚠️ AN APP MAY NOT BUILD THESE. `RENDERER_OWNS` says so, and the guard refuses
 * a raw `<input>` anywhere outside this package — so what is here is not a
 * convenience, it is the only way a product can ask somebody for anything.
 *
 * ⚠️ A FAULT IS ATTACHED TO ITS FIELD, NEVER FLOATING. A message somewhere else
 * on the screen is a message about a control the reader has to go and find; the
 * one attached here is announced with the control by every screen reader and
 * read beside it by everybody else.
 *
 * ⚠️ AND A LABEL IS NEVER A PLACEHOLDER. Placeholder-as-label disappears the
 * moment somebody types, which is exactly when they most need to know what the
 * box was for — and it is invisible to voice control at all times.
 */

import { useId, type ReactNode } from "react";
import { borrow, TONE } from "../borrowed.js";
import { Text } from "./primitives.js";
import { Icon } from "./icon.js";

/* ------------------------------------------------------------------ field --- */

export interface FieldProps {
  readonly label: string;
  /** ⚠️ Rendered under the control, before any fault. Never a placeholder. */
  readonly hint?: string;
  /** ⚠️ Present means invalid: the control is marked and the text is announced. */
  readonly fault?: string;
  readonly optional?: boolean;
  readonly children: (bound: BoundControl) => ReactNode;
}

/** What a control needs in order to be described by its own label and fault. */
export interface BoundControl {
  readonly id: string;
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
}

export function Field({ label, hint, fault, optional, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const faultId = fault ? `${id}-fault` : undefined;
  /*
    ⚠️ BOTH, NOT WHICHEVER. A field with a hint AND a fault must announce the
    fault and still say what the box was for — dropping the hint on failure is
    how somebody gets told they are wrong and not told what right looks like.
  */
  const describedBy = [hintId, faultId].filter(Boolean).join(" ") || undefined;

  return (
    <div data-one="field" data-invalid={fault ? "" : undefined}>
      <label data-one="field-label" htmlFor={id}>
        <Text role="body">{label}</Text>
        {/* ⚠️ OPTIONAL IS MARKED, NOT REQUIRED. On a form where most things are
            required, marking the exceptions is one badge instead of nine. */}
        {optional ? <Text role="caption" muted>Optional</Text> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(fault) })}
      {hint ? <span data-one="field-hint" id={hintId}><Text role="caption" muted>{hint}</Text></span> : null}
      {fault ? (
        <span data-one="field-fault" id={faultId} role="alert">
          <Icon name="close" />
          <Text role="caption">{fault}</Text>
        </span>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- controls --- */

interface ControlBase {
  readonly bound: BoundControl;
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly disabled?: boolean;
}

export interface InputProps extends ControlBase {
  readonly kind?: "text" | "email" | "tel" | "url" | "number" | "search" | "date" | "time";
  /** ⚠️ An EXAMPLE, never the label. See the note at the top of this file. */
  readonly example?: string;
}

export const Input = ({ bound, kind = "text", example, value, onChange, disabled }: InputProps) => (
  <input
    data-one="input"
    className={borrow("input")}
    id={bound.id}
    type={kind}
    value={value}
    placeholder={example}
    disabled={disabled}
    aria-describedby={bound.describedBy}
    aria-invalid={bound.invalid || undefined}
    onChange={(e) => onChange?.(e.currentTarget.value)}
  />
);

export const Textarea = ({ bound, value, onChange, disabled, rows = 4 }: ControlBase & { readonly rows?: number }) => (
  <textarea
    data-one="textarea"
    className={borrow("textarea")}
    id={bound.id}
    rows={rows}
    value={value}
    disabled={disabled}
    aria-describedby={bound.describedBy}
    aria-invalid={bound.invalid || undefined}
    onChange={(e) => onChange?.(e.currentTarget.value)}
  />
);

export interface Choice { readonly value: string; readonly label: string }

export const Select = ({ bound, options, value, onChange, disabled }: ControlBase & { readonly options: readonly Choice[] }) => (
  <select
    data-one="select"
    className={borrow("select")}
    id={bound.id}
    value={value}
    disabled={disabled}
    aria-describedby={bound.describedBy}
    aria-invalid={bound.invalid || undefined}
    onChange={(e) => onChange?.(e.currentTarget.value)}
  >
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

export interface SwitchProps {
  readonly label: string;
  readonly on: boolean;
  readonly onToggle?: (on: boolean) => void;
  readonly disabled?: boolean;
  /** ⚠️ Required when disabled: a control that refuses says why. */
  readonly reason?: string;
}

/**
 * ⚠️ A SWITCH TAKES EFFECT IMMEDIATELY AND SAYS SO BY MOVING. It is the one
 * control with no Save beside it, which is why it must never be used for
 * anything that needs confirming — that is a checkbox in a form with a button.
 */
export function Switch({ label, on, onToggle, disabled, reason }: SwitchProps) {
  if (disabled && !reason) throw new Error("Switch: a disabled switch requires a `reason`");
  const id = useId();
  return (
    <div data-one="switch" data-on={on ? "" : undefined}>
      <label data-one="switch-label" htmlFor={id}><Text role="body">{label}</Text></label>
      <input
        data-one="switch-control"
        className={borrow("toggle")}
        id={id}
        type="checkbox"
        role="switch"
        checked={on}
        disabled={disabled}
        aria-describedby={reason ? `${id}-why` : undefined}
        onChange={(e) => onToggle?.(e.currentTarget.checked)}
      />
      {reason ? <span data-one="switch-reason" id={`${id}-why`}><Text role="caption" muted>{reason}</Text></span> : null}
    </div>
  );
}

export interface CheckProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onCheck?: (checked: boolean) => void;
  readonly disabled?: boolean;
}

export const Check = ({ label, checked, onCheck, disabled }: CheckProps) => {
  const id = useId();
  return (
    <div data-one="checkbox">
      <input data-one="checkbox-control" className={borrow("checkbox")} id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onCheck?.(e.currentTarget.checked)} />
      <label data-one="checkbox-label" htmlFor={id}><Text role="body">{label}</Text></label>
    </div>
  );
};

export interface ChooseProps {
  readonly name: string;
  readonly options: readonly Choice[];
  readonly value: string;
  readonly onChoose?: (value: string) => void;
}

/** ⚠️ One of a few, all visible. Past about five this is a `Select`. */
export const Choose = ({ name, options, value, onChoose }: ChooseProps) => (
  <div data-one="radio" role="radiogroup" aria-label={name}>
    {options.map((o) => (
      <label key={o.value} data-one="radio-option" data-chosen={o.value === value ? "" : undefined}>
        <input data-one="radio-control" className={borrow("radio")} type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChoose?.(o.value)} />
        <Text role="body">{o.label}</Text>
      </label>
    ))}
  </div>
);

/**
 * ⚠️ `Dial`, NOT `Slider` — and the reason is a real collision rather than
 * taste. `slide` is another product's core noun, and the kernel's vocabulary
 * guard refuses it in shared code precisely so that a shared control and a
 * product's own object cannot end up one letter apart in the same file.
 */
export interface DialProps extends ControlBase {
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  /** ⚠️ The value is shown as a NUMBER too. A slider alone cannot be read back. */
  readonly format?: (value: number) => string;
}

export const Dial = ({ bound, min, max, step = 1, value, format, onChange, disabled }: DialProps) => (
  <div data-one="dial">
    <input
      data-one="dial-control"
      className={borrow("range")}
      id={bound.id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-describedby={bound.describedBy}
      onChange={(e) => onChange?.(e.currentTarget.value)}
    />
    {/* ⚠️ A slider with no read-out is a control nobody can set precisely. */}
    <span data-one="dial-value" data-numeric=""><Text role="caption">{format ? format(Number(value ?? min)) : String(value ?? min)}</Text></span>
  </div>
);

/* ------------------------------------------------------------------- form --- */

export interface FormProps {
  readonly title?: string;
  readonly children: ReactNode;
  readonly onSubmit?: () => void;
}

export const Form = ({ title, children, onSubmit }: FormProps) => (
  <form data-one="form" aria-label={title} onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
    {children}
  </form>
);

export interface SaveBarProps {
  readonly dirty: boolean;
  readonly busy?: boolean;
  readonly onSave?: () => void;
  readonly onDiscard?: () => void;
  readonly count?: number;
}

/**
 * ⚠️ IT APPEARS WHEN THERE IS SOMETHING TO SAVE AND NOT BEFORE. A save bar that
 * is always there is a permanent claim that work is outstanding, and people stop
 * reading it — which is precisely when the one time it mattered goes unread.
 *
 * ⚠️ AND DISCARD IS NEVER THE PRIMARY. It is the destructive half of the pair,
 * so it is quiet and it sits away from the thumb.
 */
export function SaveBar({ dirty, busy, onSave, onDiscard, count }: SaveBarProps) {
  if (!dirty) return null;
  return (
    <div data-one="save-bar" role="region" aria-label="Unsaved changes">
      <Text role="body">{count && count > 1 ? `${count} unsaved changes` : "Unsaved changes"}</Text>
      <span data-one="save-bar-actions">
        <button type="button" data-one="save-bar-discard" onClick={onDiscard}><Text role="body">Discard</Text></button>
        <button type="button" data-one="save-bar-save" data-busy={busy ? "" : undefined} aria-busy={busy || undefined} onClick={onSave}>
          <Text role="body">{busy ? "Saving" : "Save"}</Text>
        </button>
      </span>
    </div>
  );
}

export interface BulkActionsProps {
  readonly selected: number;
  readonly actions: readonly { readonly id: string; readonly label: string; readonly destructive?: boolean; readonly onRun?: () => void }[];
  readonly onClear?: () => void;
}

/**
 * ⚠️ IT NAMES THE COUNT, AND THE DESTRUCTIVE ONE IS MARKED. "Delete" over an
 * unstated selection is the single most expensive control in any product — the
 * count is the last place the mistake can be caught.
 */
export function BulkActions({ selected, actions, onClear }: BulkActionsProps) {
  if (selected === 0) return null;
  return (
    <div data-one="bulk-actions" role="region" aria-label={`${selected} selected`}>
      <Text role="body">{selected === 1 ? "1 selected" : `${selected} selected`}</Text>
      <span data-one="bulk-actions-list">
        {actions.map((a) => (
          <button key={a.id} type="button" data-one="bulk-actions-item" data-tone={a.destructive ? TONE.danger : undefined} onClick={a.onRun}>
            <Text role="body">{a.label}</Text>
          </button>
        ))}
        <button type="button" data-one="bulk-actions-clear" onClick={onClear} aria-label="Clear selection"><Icon name="close" /></button>
      </span>
    </div>
  );
}

