/**
 * THE VALUE EDITOR — one field, one sheet, one way it can go wrong.
 *
 * ⚠️ ONE SHEET FOR EVERY FIELD, AND THAT IS THE POINT. A screen per editable
 * value is how a settings area comes to have nine ways of saying "saved" and
 * four of saying "that didn't work" — and the ones that get written last are the
 * ones nobody sees until they fail. There is one lifecycle here, and every field
 * in the account borrows it.
 *
 * ⚠️ THE FAILURE IS A `Problem`, NEVER A STRING. The platform already refuses to
 * hand a provider's prose to a person (`@one/kernel/problem`): what comes back is
 * a title we wrote, a detail composed from structured values, per-field messages
 * for a form to place in place, whether trying again could plausibly work, and a
 * reference the person can quote. Rendering that as `String(err)` in a toast
 * throws away every one of those and puts a stack trace on a phone.
 *
 * ⚠️ THE ACTION HOLDS ITS OWN STATE. A button that is submitted twice because it
 * looked idle is a duplicate write; a button that says "Save" after saving is a
 * person wondering whether it took. Idle, disabled, saving, saved, failed — and
 * the sheet closes itself on saved, after long enough to have been seen.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Problem } from "@one/kernel";

/** What a value is, which is all the sheet needs to draw the right control. */
export type FieldKind = "text" | "email";

export interface EditableField {
  /** ⚠️ THE KEY A `Problem`'s `fields` IS KEYED BY. Same name, or a per-field
   *  message renders nowhere and the sheet reports a general failure instead. */
  readonly name: string;
  readonly kind: FieldKind;
  /** The question, set large. "Your name", not "Name". */
  readonly title: string;
  /** One sentence, only when the field needs one. Most do not. */
  readonly lede?: string;
  readonly label: string;
  readonly placeholder?: string;
  /** ⚠️ THE CURRENT VALUE, HELD. An editor that opens empty asks the person to
   *  retype what is already there, and a blank field reads as "unset". */
  readonly value: string;
  readonly maxLength?: number;
  /** Refuse before the round trip. Returns the reason, or null when it is fine. */
  readonly check?: (next: string) => string | null;
}

export interface ValueEditorProps {
  readonly field: EditableField | null;
  /** ⚠️ RESOLVES TO A `Problem` OR TO NULL. Never throws, never a string. */
  readonly onSave: (name: string, value: string) => Promise<Problem | null>;
  readonly onClose: () => void;
}

type Saving =
  | { readonly at: "idle" }
  | { readonly at: "saving" }
  | { readonly at: "saved" }
  | { readonly at: "failed"; readonly problem: Problem };

/** Long enough to register as an answer, short enough not to be a wait. */
const SEEN_MS = 850;

export function ValueEditor({ field, onSave, onClose }: ValueEditorProps): ReactNode {
  return (
    <Dialog.Root open={field !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        {/* ⚠️ KEYED ON THE FIELD, so opening a second editor is a new component
            rather than the previous one with its value swapped underneath — which
            is how a failure from the last field ends up displayed under the next
            one's input. */}
        <Dialog.Content className="sheet" aria-describedby={undefined}>
          {field ? <Editing key={field.name} field={field} onSave={onSave} onClose={onClose} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Editing({ field, onSave, onClose }: { readonly field: EditableField } & Omit<ValueEditorProps, "field">) {
  const [value, setValue] = useState(field.value);
  const [state, setState] = useState<Saving>({ at: "idle" });
  const inputId = useId();
  const noteId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const trimmed = value.trim();
  const local = field.check?.(trimmed) ?? null;
  const unchanged = trimmed === field.value.trim();
  /* ⚠️ A LOCAL COMPLAINT IS NOT SHOWN WHILE TYPING. "Not a valid email" under a
     half-typed address is the interface arguing with somebody mid-word; it is
     what the disabled action says, and it is spoken only once they try. */
  const shown = state.at === "failed" ? (state.problem.fields?.[field.name] ?? null) : null;
  const general = state.at === "failed" && !shown ? state.problem : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unchanged || local || state.at === "saving") return;
    setState({ at: "saving" });
    const problem = await onSave(field.name, trimmed);
    if (problem) { setState({ at: "failed", problem }); return; }
    setState({ at: "saved" });
    timer.current = setTimeout(onClose, SEEN_MS);
  };

  return (
    <form className="sheet-body" onSubmit={submit} noValidate>
      <header className="sheet-top">
        <Dialog.Title className="sheet-title">{field.title}</Dialog.Title>
        {field.lede ? <p className="lede">{field.lede}</p> : null}
      </header>

      <div className="field">
        <label className="field-label" htmlFor={inputId}>{field.label}</label>
        {/* ⚠️ THE CLEAR IS INSIDE THE FIELD AND ONLY WHEN THERE IS SOMETHING TO
            CLEAR. A control that is always there but does nothing half the time
            is one the person learns to distrust. */}
        <div className="field-box" data-wrong={shown ? "" : undefined}>
          <input
            id={inputId}
            className="field-input"
            name={field.name}
            type={field.kind === "email" ? "email" : "text"}
            inputMode={field.kind === "email" ? "email" : undefined}
            autoComplete={field.kind === "email" ? "email" : "name"}
            autoCapitalize={field.kind === "email" ? "none" : "words"}
            spellCheck={false}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            value={value}
            aria-invalid={shown ? true : undefined}
            aria-describedby={shown ? noteId : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              /* A failure describes a value that no longer exists. */
              if (state.at !== "idle") setState({ at: "idle" });
            }}
            autoFocus
          />
          {value ? (
            <button type="button" className="field-clear" aria-label="Clear" onClick={() => { setValue(""); setState({ at: "idle" }); }}>
              <Cross />
            </button>
          ) : null}
        </div>
        {shown ? <p className="note wrong" id={noteId}>{shown}</p> : null}
      </div>

      {/* ⚠️ A GENERAL FAILURE SITS WITH THE ACTION THAT CAUSED IT, not at the top
          of a screen the person has scrolled away from. `ref` is quiet and it is
          there so support can be given something to look up — withholding a
          provider's words without offering it is just an unhelpful message. */}
      {general ? (
        <p className="note wrong" role="alert">
          <strong>{general.title}</strong>
          {general.detail ? <> {general.detail}</> : null}
          <span className="note-ref">{general.ref}</span>
        </p>
      ) : null}

      <div className="sheet-actions">
        <button type="submit" className="primary" data-state={state.at}
          disabled={unchanged || local !== null || state.at === "saving" || state.at === "saved"}>
          <span className="primary-label">
            {state.at === "saving" ? "Saving" : state.at === "saved" ? "Saved" : general?.retryable ? "Try again" : "Save"}
          </span>
          {state.at === "saving" ? <Spinner /> : null}
          {state.at === "saved" ? <Tick /> : null}
        </button>
        {/* ⚠️ THE REASON THE ACTION IS OFF IS WRITTEN DOWN. A disabled button with
            no explanation is a dead end, and "nothing has changed" is a different
            dead end from "that is not an email address". */}
        {local && !unchanged ? <p className="note">{local}</p> : null}
      </div>
    </form>
  );
}

const Cross = (): ReactNode => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const Tick = (): ReactNode => (
  <svg className="primary-sign" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

/* ⚠️ A RING, NOT A LABEL THAT SAYS "…". It has to be visibly moving: a button
   that has changed its word and nothing else is one people press again. */
const Spinner = (): ReactNode => (
  <svg className="primary-sign spin" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
    <path d="M12 3a9 9 0 0 1 9 9" />
  </svg>
);
