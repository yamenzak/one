/**
 * CHANGING ONE FACT — the one sheet, for every field in the product.
 *
 * ⚠️ OUTSIDE A FORM, A GENERIC SURFACE SHOWS THE VALUE AND A WAY TO CHANGE IT —
 * NEVER THE CONTROL ITSELF. A list of live inputs is a list of things that might
 * already have saved and might not: nothing says which row is dirty, a stray tap
 * on a phone edits a setting somebody was scrolling past, and every control has
 * to carry its own pending and failed states inline. A row reading
 * "Accent · #3f7d58 · ✎" says what is true, and the change is a deliberate act
 * with somewhere to put the outcome.
 *
 * ⚠️ A FORM IS THE EXCEPTION AND IT IS THE OBVIOUS ONE. Writing a note, signing
 * in, creating a workspace: several fields answered together and submitted once.
 * There the inputs ARE the screen and the Save is the screen's one act.
 *
 * ⚠️ A SWITCH IS THE OTHER EXCEPTION, AND FOR THE OPPOSITE REASON. It is its own
 * value — there is nothing a row could show that the control does not already —
 * and it is one press to undo. `ToggleRow` stays inline; everything else comes
 * here.
 *
 * ⚠️ AND THE WHOLE LIFECYCLE LIVES HERE, ONCE. Prefilled from what is stored,
 * the declaration's own help under it, working while it saves, the server's
 * refusal shown against the field rather than as a toast that has already gone —
 * and the sheet stays open on a refusal, because closing it throws away what
 * somebody typed at the exact moment they need it back.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import type { FieldSpec } from "@engine/kernel";
import { sentence, TYPE } from "../tokens/type.js";
import { Field } from "./field.js";
import { Tray } from "../frame/overlay.js";
import { Stack } from "../parts/arrange.js";
import { Trouble } from "../parts/state.js";
import { FieldRow, Swatch } from "../parts/surfaces.js";

/**
 * ⚠️ WHAT A SAVE ANSWERS WITH: nothing when it landed, a sentence when it did
 * not. A boolean would leave the screen to invent the words, and the server's
 * own refusal — "that pair is too close to read" — is the only one worth showing.
 */
export type Refusal = string | null | undefined | void;

/* ------------------------------------------------------------------ shown --- */

/**
 * A STORED VALUE, IN WORDS.
 *
 * ⚠️ THE KIND CHOOSES HOW IT READS, exactly as it chooses the control — so a
 * row and the sheet it opens are two views of one declaration rather than two
 * screens that happen to agree today.
 *
 * ⚠️ AND `undefined` IS NOT EMPTY. A value that has not arrived says nothing;
 * "Not set" over a field that is set is a wrong answer wearing a loading
 * state's excuse, and somebody will change it back.
 */
export function Shown({ spec, value, set }: {
  readonly spec: FieldSpec;
  readonly value: unknown;
  /** For a secret: whether one is stored. The value itself never arrives. */
  readonly set?: boolean;
}) {
  if (set !== undefined) return <Says>{set ? "Stored" : "Not set"}</Says>;
  if (value === undefined) return <span className={TYPE.note}>…</span>;

  switch (spec.kind) {
    case "bool":
      return <Says>{value === true ? "On" : "Off"}</Says>;

    case "enum": {
      const id = typeof value === "string" ? value : "";
      if (!id) return <Empty />;
      /* ⚠️ THE OPTION'S NAME, NOT ITS ID — `field.tsx`'s argument, on the other
         side of the same declaration. A row reading `not_started` is a wire
         value that leaked onto a screen. */
      return <Says>{spec.labels?.[id] ?? sentence(id)}</Says>;
    }

    case "colour": {
      const hex = typeof value === "string" ? value : "";
      if (!hex) return <Empty />;
      /* ⚠️ THE DISC AND THE HEX, NEVER THE DISC ALONE. See `Swatch` — a colour
         near the card's own ground is invisible, and the row would then have no
         answer in it at all. */
      return (
        <>
          <Swatch colour={hex} label={spec.label} />
          <Says>{hex}</Says>
        </>
      );
    }

    case "number":
    case "money":
      return typeof value === "number" && Number.isFinite(value)
        ? <Says>{String(value)}</Says>
        : <Empty />;

    default: {
      const said = typeof value === "string" ? value : value === null ? "" : String(value);
      if (!said) return <Empty />;
      /* ⚠️ ONE LINE, WHATEVER IS STORED. A `long` field holds paragraphs, and a
         row that grows to hold them breaks the rhythm of every row beside it —
         the whole value is one press away. */
      return <span className="min-w-0 truncate">{said}</span>;
    }
  }
}

const Says = ({ children }: { readonly children: React.ReactNode }) =>
  <span className="min-w-0 truncate">{children}</span>;

/** ⚠️ Said, not blank. An empty row reads as a screen that failed to load. */
const Empty = () => <span className={TYPE.note}>Not set</span>;

/* ------------------------------------------------------------------- sheet --- */

export interface EditProps {
  /** The field's own label is the sheet's title — one name for one fact. */
  readonly spec: FieldSpec;
  readonly name: string;
  readonly value: unknown;
  /** For a secret: whether one is stored. The value itself never arrives. */
  readonly set?: boolean;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly onSave: (next: unknown) => Refusal | Promise<Refusal>;
}

export function Edit({ spec, name, value, set, open, onOpen, onSave }: EditProps) {
  /*
    ⚠️ THE DRAFT IS SEEDED FROM WHAT IS STORED EACH TIME THE SHEET OPENS, not
    once at mount. Held from mount, a sheet reopened after a save shows the value
    it had before it — and one reopened after somebody dismissed a half-typed
    change would show that half, which is a draft nobody asked to keep.
  */
  const [draft, setDraft] = React.useState<unknown>(value);
  const [working, setWorking] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) { setDraft(value); setProblem(null); }
  }, [open, value]);

  const save = async () => {
    setWorking(true);
    setProblem(null);
    try {
      const said = await onSave(draft);
      /* ⚠️ OPEN ON A REFUSAL, CLOSED ON A SAVE. A sheet that closes either way
         throws away what somebody typed at the moment they most need it back. */
      if (said) { setProblem(said); return; }
      onOpen(false);
    } catch {
      setProblem("That did not save. Try again.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Tray
      title={spec.label}
      isOpen={open}
      onOpenChange={onOpen}
      actions={
        <Button variant="primary" isPending={working} onPress={() => void save()}>
          Save
        </Button>
      }
    >
      <Stack space="snug">
        {/* ⚠️ THE EXPLANATION IS THE SHEET'S, NOT THE CONTROL'S, because the
            title above already IS the field's name. Left to the control, the
            name was printed twice — once as the heading and once again in the
            library's own `Label` directly under it, which is the doubling
            `bare` was written for. So the control goes bare and the
            declaration's help stands on its own line where it can be read
            before the control rather than after it. */}
        {spec.help ? <p className={TYPE.note}>{spec.help}</p> : null}
        <Field
          bare
          name={name}
          spec={spec}
          value={draft}
          set={set}
          disabled={working}
          onChange={setDraft}
        />
        {/* ⚠️ AGAINST THE FIELD, NOT IN A TOAST. A refusal about what somebody
            just typed belongs where they can read it while they fix it; a toast
            is gone by the time they look back at the control. `Trouble` is the
            one shape a refusal takes, so this reads like every other one. */}
        {problem ? (
          <Trouble
            problem={{
              code: "field.refused", status: 422, title: problem,
              retryable: false, tone: "warning",
            }}
          />
        ) : null}
      </Stack>
    </Tray>
  );
}

/* --------------------------------------------------------------------- row --- */

/**
 * THE PAIR, WIRED — the value in a row, the sheet behind its edit.
 *
 * ⚠️ ONE COMPONENT RATHER THAN TWO PLUS A `useState` PER CALLER. Every settings
 * surface needs the same three lines of open/close state, and three lines
 * copied per screen is three places for a sheet to be left open after a save.
 */
export function EditRow({ spec, name, value, set, under, locked, onSave }: {
  readonly spec: FieldSpec;
  readonly name: string;
  readonly value: unknown;
  readonly set?: boolean;
  /** Why it reads the way it does — a plan that does not cover it. */
  readonly under?: React.ReactNode;
  /**
   * ⚠️ NO WAY IN, RATHER THAN A SHEET THAT REFUSES. A locked row still shows
   * what it is set to, because that is the offer; opening a sheet whose Save
   * cannot land is a dead end with a button on it.
   */
  readonly locked?: boolean;
  readonly onSave: (next: unknown) => Refusal | Promise<Refusal>;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <FieldRow
        label={spec.label}
        value={<Shown spec={spec} value={value} set={set} />}
        under={under}
        onEdit={locked || value === undefined ? undefined : () => setOpen(true)}
      />
      <Edit
        spec={spec}
        name={name}
        value={value}
        set={set}
        open={open}
        onOpen={setOpen}
        onSave={onSave}
      />
    </>
  );
}
