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
 * ⚠️ IT IS NOT THE ACCOUNT'S, AND IT WAS FILED THERE BY ACCIDENT OF BIRTH. It
 * names no account concept and imports none — a field, a save that resolves to a
 * `Problem` or to null, and a sheet. It was written for the account centre and
 * lived in its folder for exactly that long.
 *
 * ⚠️ THE ACTION HOLDS ITS OWN STATE. A button that is submitted twice because it
 * looked idle is a duplicate write; a button that says "Save" after saving is a
 * person wondering whether it took. Idle, disabled, saving, saved, failed — and
 * the sheet closes itself on saved, after long enough to have been seen.
 */

import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Problem } from "@one/kernel";
import { Button } from "./button.js";
import { useCommit } from "./commit.js";
import { Lockup } from "./brand/mark.js";
import { Field } from "./field.js";
import { Spinner, Tick } from "./icon.js";
import { Sheet } from "./sheet.js";

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
  /**
   * THE VAULT FACT THIS FIELD **IS**, where it is one.
   *
   * ⚠️ SET FROM A DECLARATION, NEVER BY A SCREEN. An app cannot store a vault
   * fact in its own table — `shadowProblems` refuses the collection at boot — so
   * a field bound to one has nowhere else to save to. The binding is not an
   * option somebody remembers to take; it is the only thing that composes.
   *
   * ⚠️ AND IT IS WHY A VAULT FIELD CANNOT BE AN APP'S OWN FIELD. An app that asked
   * for a fact at `compute` cannot READ IT BACK, so it cannot populate the value
   * it just collected — the form would open empty next time. The value comes from
   * the person's own vault read, which the app never sees.
   */
  readonly fact?: string;
  /**
   * ⚠️ WHERE IT STANDS, IN THE WORDS THE VAULT ALREADY USES. Passed in rather than
   * derived here, because the sentence belongs to one function and a second copy
   * is how an editor comes to promise what the vault screen refuses.
   */
  readonly kept?: string;
  /** Refuse before the round trip. Returns the reason, or null when it is fine. */
  readonly check?: (next: string) => string | null;
}

export interface ValueEditorProps {
  readonly field: EditableField | null;
  /** ⚠️ RESOLVES TO A `Problem` OR TO NULL. Never throws, never a string. */
  readonly onSave: (name: string, value: string) => Promise<Problem | null>;
  readonly onClose: () => void;
}

/**
 * ⚠️ A SHEET SITS ON THE BOTTOM EDGE, AND ON A PHONE THE KEYBOARD IS THE BOTTOM
 * EDGE. Focusing the input opens a keyboard over the whole sheet — the field, the
 * message and the action all behind it, with no way to know they are there. It is
 * the defect that makes a bottom sheet on a phone unusable, and it does not
 * reproduce on any desktop, in any test, at any width.
 *
 * ⚠️ MEASURING IS THE GOOD ANSWER AND IT IS NOT ALWAYS AVAILABLE. `visualViewport`
 * is the only API that knows a keyboard is up — a keyboard is not a layout box, so
 * on iOS `100dvh` and `position: fixed` are both still measuring a viewport whose
 * bottom the person can no longer see. Where a browser resizes the layout instead,
 * the same measurement comes out as zero, which is correct: there the sheet was
 * already clear of it.
 *
 * ⚠️ AND INSIDE AN IFRAME NOTHING KNOWS. A frame's `visualViewport` describes the
 * FRAME, and a frame does not change size when a keyboard opens over the page
 * embedding it — so the measurement is a truthful zero about the wrong viewport
 * and the sheet stays exactly where it was. No API fixes this and no measurement
 * detects it, which is why an embedded preview of this page kept reporting the bug
 * that the page itself no longer had.
 *
 * ⚠️ SO THE FALLBACK IS POSITIONAL RATHER THAN NUMERIC. If a field inside the
 * sheet holds the focus and nothing measured a keyboard, the sheet goes to the TOP
 * of the viewport — the one place a keyboard has never been. It is cruder than
 * gliding up by exactly the right amount, and it cannot be wrong.
 *
 * ⚠️ AND MEASUREMENT, ONCE PROVEN, IS TRUSTED FOREVER. Without that the fallback
 * fires on the way BACK: a keyboard dismissed while its field still holds focus
 * reports zero, which is indistinguishable from never having been able to measure
 * — so the sheet lifted to the top at the exact moment it should have settled
 * down, and stayed there. A device that measured a keyboard once can measure the
 * next one, and a zero from it means the keyboard is gone.
 *
 * ⚠️ WHERE NOTHING CAN MEASURE, THERE IS NO SIGNAL FOR THE KEYBOARD CLOSING AT
 * ALL. Dismissing it does not blur the field, no viewport changes, nothing
 * resizes. Pressing the sheet itself is what gives the field up — which settles
 * the sheet back down, and is the only honest way out of a state nothing reports.
 */
/**
 * How much of the layout viewport the keyboard is standing on.
 *
 * ⚠️ PURE, SO IT CAN BE CHECKED. A soft keyboard cannot be opened in any headless
 * browser, so the one part of this that can be wrong — a sign, a missing clamp, a
 * forgotten scroll offset — is the one part no test could otherwise reach.
 */
/* ⚠️ BOTH CLAMPS, AND THE INNER ONE IS NOT OBVIOUS. `offsetTop` goes NEGATIVE
   during a rubber-band over-scroll on iOS — no keyboard involved — and subtracting
   a negative ADDS, so the sheet would jump upwards by the over-scroll for as long
   as the finger was moving. */
export const keyboardInset = (layoutHeight: number, viewHeight: number, viewTop: number): number =>
  Math.max(0, Math.round(layoutHeight - viewHeight - Math.max(0, viewTop)));

/** Where a sheet has to sit: gliding up by a measured amount, or out of reach. */
export type Lift = "measured" | "top";

/**
 * ⚠️ FOUR CONDITIONS, AND EVERY ONE OF THEM IS LOAD-BEARING. A measured amount
 * means the glide is available and correct. Typing is the only evidence a keyboard
 * exists when nothing can measure one — but it is equally true of a laptop, where
 * there is no keyboard to clear. A coarse pointer separates the two. And `proven`
 * is whether this device has ever reported a keyboard at all: without it, a
 * keyboard DISMISSED while its field keeps focus reports the same zero as a device
 * that cannot measure, so the sheet lifted exactly when it should have settled.
 */
export const liftFor = (measured: number, typing: boolean, touch: boolean, proven: boolean): Lift =>
  !proven && measured === 0 && typing && touch ? "top" : "measured";

/* ⚠️ THE SESSION, NOT THE SHEET. Whether this browser can see a keyboard is a
   fact about the browser; re-learning it per sheet means the first field edited
   after every open pays the wrong behaviour again. */
let everMeasured = false;

function useKeyboardInset(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const view = typeof window === "undefined" ? undefined : window.visualViewport;
    const root = document.documentElement;

    const apply = () => {
      const hidden = view ? keyboardInset(window.innerHeight, view.height, view.offsetTop) : 0;
      if (hidden > 0) everMeasured = true;
      root.style.setProperty("--keyboard", `${hidden}px`);
      const focused = document.activeElement;
      const typing = focused instanceof HTMLElement
        && focused.matches("input, textarea")
        && focused.closest(".sheet") !== null;
      const touch = window.matchMedia("(pointer: coarse)").matches;
      const lift = liftFor(hidden, typing, touch, everMeasured);
      document.querySelectorAll<HTMLElement>(".sheet").forEach((sheet) => { sheet.dataset.lift = lift; });
    };

    apply();
    view?.addEventListener("resize", apply);
    view?.addEventListener("scroll", apply);
    /* `focus` does not bubble; `focusin` does. */
    document.addEventListener("focusin", apply);
    document.addEventListener("focusout", apply);
    return () => {
      view?.removeEventListener("resize", apply);
      view?.removeEventListener("scroll", apply);
      document.removeEventListener("focusin", apply);
      document.removeEventListener("focusout", apply);
      root.style.removeProperty("--keyboard");
    };
  }, [active]);
}

export function ValueEditor({ field, onSave, onClose }: ValueEditorProps): ReactNode {
  useKeyboardInset(field !== null);
  return (
    /* ⚠️ DISMISSIBLE, because leaving a value alone is a complete answer. The
       sheet that refuses is for the small number of questions where not deciding
       is itself a decision — and "I would rather not rename myself today" is not
       one of them. */
    <Sheet open={field !== null} onClose={onClose} dismissible label={field?.title}>
      {/* ⚠️ KEYED ON THE FIELD, so opening a second editor is a new component
          rather than the previous one with its value swapped underneath — which is
          how a failure from the last field ends up displayed under the next one's
          input. */}
      {field ? <ValueEditorBody key={field.name} field={field} onSave={onSave} onClose={onClose} /> : null}
    </Sheet>
  );
}

/**
 * ⚠️ THE BODY IS SEPARATE FROM THE PRESENTATION, and the reason is that a portal
 * renders nothing outside a browser. Welded to the sheet, everything it says —
 * including where a vault fact goes, which is the whole point of saying it — would
 * be unreachable by any check.
 */
export function ValueEditorBody({ field, onSave = async () => null, onClose = () => undefined }: {
  readonly field: EditableField;
} & Partial<Omit<ValueEditorProps, "field">>) {
  const [value, setValue] = useState(field.value);
  /* ⚠️ THE SAME LIFECYCLE THE CONFIRM SHEET USES, not one that resembles it. */
  const { state, run, reset } = useCommit(
    () => onSave(field.name, value.trim()),
    onClose,
  );
  const trimmed = value.trim();
  const local = field.check?.(trimmed) ?? null;
  const unchanged = trimmed === field.value.trim();
  /* ⚠️ A LOCAL COMPLAINT IS NOT SHOWN WHILE TYPING. "Not a valid email" under a
     half-typed address is the interface arguing with somebody mid-word; it is
     what the disabled action says, and it is spoken only once they try. */
  const shown = state.at === "failed" ? (state.problem.fields?.[field.name] ?? null) : null;
  const general = state.at === "failed" && !shown ? state.problem : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unchanged || local) return;
    void run();
  };

  return (
    <form className="sheet-body" onSubmit={submit} noValidate>
      <header className="sheet-top">
        <Dialog.Title className="sheet-title">{field.title}</Dialog.Title>
        {field.lede ? <p className="lede">{field.lede}</p> : null}
      </header>

      <Field
        label={field.label}
        name={field.name}
        type={field.kind === "email" ? "email" : "text"}
        inputMode={field.kind === "email" ? "email" : undefined}
        autoComplete={field.kind === "email" ? "email" : "name"}
        autoCapitalize={field.kind === "email" ? "none" : "words"}
        spellCheck={false}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        value={value}
        wrong={shown}
        clearable
        autoFocus
        /* A failure describes a value that no longer exists. */
        onValue={(next) => { setValue(next); reset(); }}
      />

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

      {/*
        ⚠️ WHERE IT GOES, AT THE MOMENT SOMEBODY GIVES IT. A vault fact handled
        silently would teach nobody that it is different — and the whole value of
        the vault is that the person knows. It sits UNDER the input rather than
        beside it: a control next to a field reads as part of the field, and
        deciding a disclosure while filling a form is the moment somebody is least
        equipped to think about it.

        ⚠️ IT REPORTS AND DOES NOT DECIDE. The rung is changed in the vault, which
        is one press away and is the only place that control is defined.
      */}
      {field.fact ? (
        <p className="note kept">
          <Lockup word="Vault" />
          {field.kept ? <span className="kept-said">{field.kept}</span> : null}
        </p>
      ) : null}

      <div className="actions">
        <Button tone="loud" wide type="submit" data-state={state.at}
          disabled={unchanged || local !== null || state.at === "working" || state.at === "done"}
          sign={state.at === "working" ? <Spinner /> : state.at === "done" ? <Tick className="button-sign" size={21} /> : undefined}>
          {state.at === "working" ? "Saving" : state.at === "done" ? "Saved" : general?.retryable ? "Try again" : "Save"}
        </Button>
        {/* ⚠️ THE REASON THE ACTION IS OFF IS WRITTEN DOWN. A disabled button with
            no explanation is a dead end, and "nothing has changed" is a different
            dead end from "that is not an email address". */}
        {local && !unchanged ? <p className="note">{local}</p> : null}
      </div>
    </form>
  );
}
