/**
 * A FIELD — a label, a box, and the one message that belongs under it.
 *
 * ⚠️ EXTRACTED AT ITS SECOND USE, which is the confirm sheet's typed gate. Its
 * stylesheet had already moved to the vocabulary; only the markup was still
 * inside the value editor, so the second surface that needed a text input was one
 * copy-paste away from a field whose error sat somewhere slightly different.
 *
 * ⚠️ A FILL, AND THE ONLY BORDER IT EVER HAS IS THE ONE THAT MEANS SOMETHING. A
 * field outlined at rest has nowhere left to go when it is wrong, which is how a
 * form ends up saying "wrong" in red text under a field that looks unchanged.
 *
 * ⚠️ THE MESSAGE IS ITS OWN, AND IT IS SPOKEN. `aria-describedby` and
 * `aria-invalid` are set from the same value that draws the outline, so a reader
 * is told what a sighted person is shown rather than hearing a valid field.
 */

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Close } from "./icon.js";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id"> {
  readonly label: string;
  readonly value: string;
  readonly onValue: (next: string) => void;
  /** Shown under the box and drawn on it. Absent is not "valid", it is "unsaid". */
  readonly wrong?: string | null;
  /** ⚠️ ONLY WHERE THERE IS SOMETHING TO CLEAR. A control that is always there
   *  and does nothing half the time is one people learn to distrust. */
  readonly clearable?: boolean;
  /**
   * One line under the box, in the field's own spacing — a preview of what was
   * typed, not an instruction.
   *
   * ⚠️ IT IS INSIDE THE FIELD BECAUSE OF WHERE IT ENDS UP OTHERWISE. Written as
   * the next child of the form it inherits the form's gap, which is the same
   * distance as the gap to the button below — so a line about the field above
   * reads as a line about the control beneath it. This is the whole reason the
   * prop exists rather than each screen putting a paragraph after the field.
   */
  readonly under?: ReactNode;
}

export function Field({ label, value, onValue, wrong, clearable, under, ...rest }: FieldProps): ReactNode {
  const id = useId();
  const noteId = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="field-box" data-wrong={wrong ? "" : undefined}>
        <input
          id={id}
          className="field-input"
          value={value}
          aria-invalid={wrong ? true : undefined}
          aria-describedby={wrong ? noteId : undefined}
          onChange={(e) => onValue(e.target.value)}
          {...rest}
        />
        {clearable && value ? (
          <button type="button" className="field-clear press" aria-label="Clear" onClick={() => onValue("")}>
            <Close size={15} />
          </button>
        ) : null}
      </div>
      {/* ⚠️ A REFUSAL REPLACES THE HINT RATHER THAN JOINING IT. Two lines under
          one box is a wall in the one place a person is trying to fix something,
          and only one of the two is what they need to read. */}
      {wrong ? <p className="note wrong" id={noteId}>{wrong}</p> : under ? <p className="note">{under}</p> : null}
    </div>
  );
}
