/**
 * RUNNING AN OPERATION A SCREEN DECLARED — the form, from `OperationSpec.input`.
 *
 * ⚠️ WITHOUT THIS A DECLARED SCREEN IS READ-ONLY, AND THAT IS NOT A SCREEN. A
 * body names its acts in `does`; the kernel checks the ids, the gate reads the
 * permissions and the agent surface exposes them — and between all of that and a
 * person pressing the button there was nothing. Every port would have had to
 * leave its actions behind in the app, which is the split this whole arc exists
 * to close.
 *
 * ⚠️ THE FORM IS THE DECLARATION, WHICH IS WHY THERE IS ONE OF THESE RATHER THAN
 * ONE PER OPERATION. `input` is `Fields`, the same shape a collection's are, so
 * the controls, the labels, the help, the required marks and the per-field
 * refusals all come from `Field` — the component every settings surface, every
 * vault sheet and every editor in this deployment already draws with.
 *
 * ⚠️ AN OPERATION THAT TAKES NOTHING TAKES NO FORM. Opening a sheet with a title
 * and one button in it to confirm a press somebody has already made is a second
 * press for nothing; those run straight away. What a destructive one needs is a
 * CONFIRMATION, which is `Confirm`'s job and a different question from this one.
 *
 * ⚠️ AND IT STAYS OPEN ON A REFUSAL — the same rule `Edit` follows, for the same
 * reason. A sheet that closes either way throws away what somebody typed at the
 * exact moment they need it back.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import {
  PLATFORM_PROBLEMS, problem, refusedOn,
  type Fields, type Problem,
} from "@engine/kernel";
import { Field } from "./field.js";
import { TYPE } from "../tokens/type.js";
import { Tray } from "../frame/overlay.js";
import { Stack } from "../parts/arrange.js";
import { Trouble } from "../parts/state.js";

/**
 * ⚠️ THE ANSWER IS A `Problem` OR NOTHING, never a boolean. A caller that
 * reported success as `false` would have the refusal's whole sentence, its
 * code, its tone and its reference thrown away at the seam — and the sheet
 * would draw the platform's generic apology over a server that said exactly
 * what was wrong.
 */
export type Ran = Problem | null;

export interface DoingProps {
  /** The operation's id — what `does` named. */
  readonly id: string;
  /** ⚠️ In the reader's terms, from `OperationSpec.summary`. */
  readonly summary: string;
  /** ⚠️ `OperationSpec.input`. Empty means it runs on the press. */
  readonly input: Fields;
  /**
   * ⚠️ WHICH OF THOSE THE SCREEN SUPPLIES — see `Fill`. They are not drawn: the
   * item somebody opened and the day it is are facts the screen is standing on,
   * and a form asking for either puts a row id in front of a person who would
   * have to copy it out of a URL.
   */
  readonly fills?: Readonly<Record<string, unknown>>;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly run: (input: Record<string, unknown>) => Promise<Ran>;
}

export function Doing({ id, summary, input, fills, open, onOpen, run }: DoingProps) {
  const names = unasked(input, fills);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [working, setWorking] = React.useState(false);
  const [refused, setRefused] = React.useState<Problem | null>(null);

  /* ⚠️ SEEDED EACH TIME IT OPENS, NOT ONCE AT MOUNT — see `Edit`. Held from
     mount, a sheet reopened after a run shows what was typed into the last one. */
  React.useEffect(() => {
    if (open) { setDraft({}); setRefused(null); }
  }, [open]);

  const go = async () => {
    setWorking(true);
    setRefused(null);
    try {
      const said = await run(draft);
      if (said) { setRefused(said); return; }
      onOpen(false);
    } catch {
      /* ⚠️ A THROW IS THE PLATFORM'S OWN FAILURE AND IT SAYS SO FROM THE
         CATALOGUE — nothing here knows what went wrong, which is what
         `platform.unavailable` is worded for. */
      setRefused(problem(PLATFORM_PROBLEMS, "platform.unavailable"));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Tray
      /* ⚠️ THE SUMMARY, WHICH IS THE ONE SENTENCE THE OPERATION ALREADY HAS IN
         the reader's terms. A title assembled from the id would be
         "Supplier create", and a title typed here would be a second name for
         one thing, drifting from the one the agent surface reads. */
      title={summary}
      isOpen={open}
      onOpenChange={onOpen}
      actions={
        <Button variant="primary" isPending={working} onPress={() => void go()}>
          {/* ⚠️ THE OPERATION'S OWN WORDS AGAIN. "Confirm" is what a dialogue
              says when it has nothing to say; the summary is what somebody
              pressed for. */}
          {summary}
        </Button>
      }
    >
      <Stack space="snug">
        {names.map((name) => {
          const spec = input[name]!;
          return (
            <Stack key={name} space="tight">
              {spec.help ? <p className={TYPE.note}>{spec.help}</p> : null}
              <Field
                name={name}
                spec={spec}
                value={draft[name]}
                disabled={working}
                onChange={(next) => setDraft((was) => ({ ...was, [name]: next }))}
                /* ⚠️ THE REFUSAL ABOUT THIS INPUT, UNDER THIS INPUT. The door
                   validates every declared field and names the ones it refused;
                   showing only the title would put "that does not look right"
                   over a form with nothing marked on it. */
                error={refusedOn(refused, name)}
              />
            </Stack>
          );
        })}
        {/* ⚠️ NOTHING AT ALL WHERE THERE IS NOTHING TO FILL IN. `Doing` is only
            mounted for an operation that takes something — see `runs` — so an
            empty body here means a declaration changed under a sheet somebody
            already had open, and an empty tray says that better than a blank. */}
        {names.length === 0
          ? <p className={TYPE.note}>Nothing to fill in — {id} runs on its own.</p>
          : null}
        {refused ? <Trouble problem={refused} /> : null}
      </Stack>
    </Tray>
  );
}

/**
 * WHAT IS LEFT FOR A PERSON TO FILL IN — the form's fields, in declared order.
 *
 * ⚠️ EXPORTED, AND PURE, BECAUSE IT IS THE DECISION RATHER THAN THE DRAWING. The
 * sheet is an overlay: it renders through a portal, so nothing about which
 * fields it drew is visible to a test that is not driving a browser. Naming the
 * choice makes it assertable in a plain suite, which is where a rule this
 * consequential belongs — a filled field drawn as a question is a row id put in
 * front of somebody, and it would otherwise only be caught by looking.
 */
export const unasked = (
  input: Fields | undefined, fills: Readonly<Record<string, unknown>> = {},
): readonly string[] => Object.keys(input ?? {}).filter((name) => !(name in fills));

/**
 * ⚠️ WHETHER AN OPERATION NEEDS ASKING AT ALL, decided in one place. A caller
 * checking `Object.keys(input).length` itself is a caller that will one day
 * check it differently from this one — and the two disagreeing means either a
 * sheet with nothing in it or a write that happens without being asked for.
 *
 * ⚠️ AND WHAT THE SCREEN FILLS IN DOES NOT COUNT AS ASKING. `batch.open` takes
 * the batch and the day and nothing else; both are the screen's, so there is
 * nothing left to put in a form — and a sheet holding one button to confirm a
 * press somebody already made is a second press for nothing.
 */
export const asks = (
  input: Fields | undefined, fills: Readonly<Record<string, unknown>> = {},
): boolean => unasked(input, fills).length > 0;
