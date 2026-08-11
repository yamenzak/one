/**
 * CONFIRM — one sheet for every "are you sure", and three ways of being sure.
 *
 * ⚠️ THE GATE IS CHOSEN BY CONSEQUENCE, NOT BY TASTE. A press for what can be
 * done again; a tick for what cannot be undone but is small; typing the thing's
 * own name for what destroys something with a name. Every dialog inventing its
 * own is how a product ends up asking for a typed confirmation to sign out of a
 * browser and a single tap to delete a workspace.
 *
 * ⚠️ A GATE IS FRICTION, AND FRICTION IS ONLY HONEST WHEN IT BUYS ATTENTION. It
 * cannot make an action reversible and it cannot make somebody read; what it does
 * is stop the press that was already in flight when the sheet appeared. That is
 * the whole justification, and it is why the default is a plain press.
 *
 * ⚠️ IT SHARES THE VALUE EDITOR'S LIFECYCLE RATHER THAN RESEMBLING IT. Idle,
 * working, done, failed, and the same note in the hand for each — `useCommit`.
 * Two implementations of "what happens after you press the button" is how one of
 * them comes to forget to disable itself.
 *
 * ⚠️ AND IT IS DISMISSIBLE. Leaving without deciding IS a decision here, and the
 * only one the person can make for free. A confirm you cannot escape is a trap
 * wearing a question mark.
 */

import { useState, type ReactNode } from "react";
import type { Problem } from "@one/kernel";
import { Button } from "./button.js";
import { useCommit } from "./commit.js";
import { Field } from "./field.js";
import { Tick } from "./icon.js";
import { Sheet } from "./sheet.js";

export type Gate =
  /** Nothing more than the press. For what can simply be done again. */
  | { readonly kind: "press" }
  /** A box to tick. For what cannot be undone but takes nothing with it. */
  | { readonly kind: "tick"; readonly label: string }
  /**
   * The thing's own name, typed. For what destroys something that HAS a name —
   * and the name is shown, because this is a test of attention, not of memory.
   */
  | { readonly kind: "type"; readonly phrase: string; readonly label: string };

export interface ConfirmProps {
  readonly open: boolean;
  readonly title: string;
  /**
   * What will actually happen. One sentence, in the future tense, concrete.
   *
   * ⚠️ MARKUP RATHER THAN A STRING, so the thing being acted on can appear as
   * itself — a chip with its face — instead of as its name in the middle of a
   * sentence. That is the whole difference between "are you sure about Corniche
   * Screens" and pointing at it.
   */
  readonly lede: ReactNode;
  /** The verb on the button. "Remove", never "OK" — a verb is a description. */
  readonly verb: string;
  readonly gate?: Gate;
  /** ⚠️ `alarm` colours the ACTION, and only where the thing is unrecoverable. */
  readonly tone?: "alarm";
  readonly onConfirm: () => Promise<Problem | null>;
  readonly onClose: () => void;
}

export function Confirm({ open, title, lede, verb, gate, tone, onConfirm, onClose }: ConfirmProps): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} dismissible label={title}>
      {/* ⚠️ KEYED ON THE TITLE, so a second confirm is a new component rather than
          the previous one with its question swapped underneath — which is how a
          ticked box survives into a question nobody has read yet. */}
      {open ? <Asking key={title} {...{ title, lede, verb, gate, tone, onConfirm, onClose }} /> : null}
    </Sheet>
  );
}

function Asking({ title, lede, verb, gate = { kind: "press" }, tone, onConfirm, onClose }: Omit<ConfirmProps, "open">) {
  const [typed, setTyped] = useState("");
  const [ticked, setTicked] = useState(false);
  const { state, run, reset } = useCommit(onConfirm, onClose);

  const passed =
    gate.kind === "press" ? true
      : gate.kind === "tick" ? ticked
        : typed.trim().toLowerCase() === gate.phrase.trim().toLowerCase();

  const problem = state.at === "failed" ? state.problem : null;

  return (
    <div className="sheet-body">
      <header className="sheet-top">
        <h2 className="sheet-title">{title}</h2>
        <p className="lede">{lede}</p>
      </header>

      {gate.kind === "type" ? (
        /* ⚠️ THE PHRASE IS SHOWN, as the placeholder. Hiding it makes this a
            memory test, which fails the careful and passes the lucky — and
            somebody who genuinely means to do this then has to leave to go and
            look it up. */
        <Field
          label={gate.label}
          value={typed}
          placeholder={gate.phrase}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onValue={(next) => { setTyped(next); reset(); }}
        />
      ) : null}

      {gate.kind === "tick" ? (
        /* ⚠️ A LABEL THAT IS THE WHOLE TARGET. A 20-pixel box beside words that
           are not part of the control is the smallest hit area in the product,
           placed on the one question that matters most. */
        <label className="check">
          <input type="checkbox" checked={ticked} onChange={(e) => { setTicked(e.target.checked); reset(); }} />
          <span className="check-box" aria-hidden="true"><Tick size={14} /></span>
          <span>{gate.label}</span>
        </label>
      ) : null}

      {problem ? (
        <p className="note wrong" role="alert">
          <strong>{problem.title}</strong>
          {problem.detail ? <> {problem.detail}</> : null}
          <span className="note-ref">{problem.ref}</span>
        </p>
      ) : null}

      <div className="sheet-actions">
        <Button
          tone="loud" wide data-tone-alarm={tone === "alarm" ? "" : undefined}
          data-state={state.at}
          disabled={!passed || state.at === "working" || state.at === "done"}
          onClick={() => void run()}
          sign={state.at === "done" ? <Tick className="button-sign" size={21} /> : undefined}
        >
          {state.at === "working" ? "Working" : state.at === "done" ? "Done" : problem?.retryable ? "Try again" : verb}
        </Button>
        {/* ⚠️ THE REASON THE ACTION IS OFF IS WRITTEN DOWN, because a gate nobody
            has satisfied looks exactly like a button that is broken. */}
        {!passed ? (
          <p className="note">
            {gate.kind === "tick" ? "Tick the box to continue." : `Type ${gate.kind === "type" ? gate.phrase : ""} to continue.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
