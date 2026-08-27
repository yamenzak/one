/**
 * THE SHEET THAT ASKS BEFORE A RECORD LEAVES — and says what leaving means.
 *
 * ⚠️ "DELETE" STOPPED BEING TRUE AND THE SCREEN HAS TO CATCH UP — see `Aside`.
 * The verb now moves a record into the trash for thirty days; a dialog that says
 * "This cannot be undone" is describing a product that no longer exists, and it
 * is the more expensive direction of wrong. Somebody who believes a delete is
 * permanent hesitates over every one of them, asks a colleague, leaves the
 * catalogue full of things nobody dares remove — which is exactly the state the
 * trash was built to end.
 *
 * ⚠️ AND THE ALTERNATIVE IS OFFERED HERE, BECAUSE HERE IS WHERE THE DECISION IS.
 * Two buttons on the record's own page — Delete and Freeze — ask somebody to
 * know the difference before they have a reason to care about it. The moment
 * they care is the moment they have pressed Delete: half the time what they
 * actually meant was "stop showing me this", and that is a different button
 * with different consequences. The sheet asks the first question, and the second
 * is one press away inside it.
 *
 * ⚠️ THE WINDOW IS THE KERNEL'S NUMBER, NEVER A SENTENCE. `BIN_DAYS` is what the
 * sweep reads; a "30 days" typed into copy is a promise that goes on being made
 * after somebody changes the job.
 */

import * as React from "react";
import { Button, Drawer } from "@heroui/react";
import { BIN_DAYS } from "@engine/kernel";
import { TYPE } from "../tokens/type.js";
import { SPACE } from "../tokens/metrics.js";
import { ActionRow } from "./surfaces.js";
import { glyphOf } from "../frame/shell.js";

/** Which question the sheet is currently asking. */
type Asking = "bin" | "freeze";

export interface PutAsideProps {
  /** ⚠️ The button itself. The root is a `DialogTrigger` and wires it — see `Leaving`. */
  readonly trigger: React.ReactNode;
  /**
   * ⚠️ WHAT IT IS CALLED, IN THE QUESTION. "Delete this?" over a list somebody
   * has scrolled is a question about whichever row they think is selected;
   * "Delete Casting resin, clear?" is a question with one answer.
   */
  readonly name: string;
  /** The collection's own word for one of them — "product", "shelf", "batch". */
  readonly of: string;
  readonly onBin: () => void;
  /**
   * WHICH QUESTION IT OPENS WITH.
   *
   * ⚠️ `freeze` IS FOR A COLLECTION WITH NO DELETE AT ALL — see
   * `CollectionSpec.without`. There the bin is not a slower way out, it is an
   * operation that does not exist, and opening on a question whose button
   * cannot run is worse than not offering it.
   */
  readonly opens?: Asking;
  /**
   * ⚠️ ABSENT WHERE FREEZING MEANS NOTHING, and then the sheet does not mention
   * it. A record nothing else can point at — a draft, a session — has no history
   * to keep resolving, so "keep it out of the way" is a second name for the same
   * outcome with a different clean-up date.
   */
  readonly onFreeze?: (() => void) | undefined;
}

/**
 * ⚠️ THE TWO QUESTIONS, EACH IN ITS OWN WORDS. A shared body with the noun
 * swapped would read as one thing done two ways; they are two different things,
 * and the sentences are where the difference is taught.
 */
export const SAYS: Readonly<Record<Asking, {
  readonly title: (name: string) => string;
  readonly says: (of: string) => string;
  readonly then: string;
  readonly does: string;
}>> = {
  bin: {
    title: (name) => `Delete ${name}?`,
    says: (of) => `It comes off every list. The ${of} itself is kept, so anything `
      + "that points at it goes on working.",
    then: `You can put it back for the next ${BIN_DAYS} days. After that it is destroyed.`,
    does: "Move to trash",
  },
  freeze: {
    title: (name) => `Put ${name} out of the way?`,
    says: (of) => `It comes off every list and stays where it is. Nothing that `
      + `points at the ${of} changes — its history goes on reading correctly.`,
    then: "It is never destroyed, and you can bring it back whenever you like.",
    does: "Put it away",
  },
};

export function PutAside({ trigger, name, of, onBin, onFreeze, opens = "bin" }: PutAsideProps) {
  const [asking, setAsking] = React.useState<Asking>(opens);
  const said = SAYS[asking];

  return (
    <Drawer
      /* ⚠️ THE QUESTION RESETS WHEN THE SHEET CLOSES. Left on `freeze`, the next
         press of Delete anywhere on the screen opens the wrong question — and it
         is the wrong question in the direction nobody checks, because the sheet
         somebody meant to read carefully is the one they now recognise. */
      onOpenChange={(open) => { if (!open) setAsking(opens); }}
    >
      {trigger}
      <Drawer.Backdrop>
        <Drawer.Content>
          {/* ⚠️ `alertdialog`, FOR THE REASON `Confirm` KEEPS IT. It is what
              makes a screen reader announce the question rather than wait to be
              asked — a real affordance, and free. */}
          <Drawer.Dialog role="alertdialog">
            <Drawer.Handle />
            <Drawer.Header>
              <Drawer.Heading>{said.title(name)}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              <div className={`flex flex-col ${SPACE.snug}`}>
                <p className={TYPE.body}>{said.says(of)}</p>
                {/* ⚠️ WHAT HAPPENS NEXT IS ITS OWN LINE, and it is the line that
                    stops somebody hesitating. Folded into the paragraph above it
                    reads as a caveat; on its own it is the answer to the
                    question they are actually asking. */}
                <p className={TYPE.body}>{said.then}</p>
                {/*
                  ⚠️ THE OTHER WAY, OFFERED ONLY FROM THE FIRST QUESTION. From
                  inside the freeze sheet a link back to delete would be a dialog
                  that talks somebody INTO the destructive option, which is the
                  one direction a confirmation must never travel.
                */}
                {asking === "bin" && onFreeze
                  ? (
                    /* ⚠️ A ROW THAT DOES SOMETHING RATHER THAN GOING SOMEWHERE,
                       which is what it is: it changes the question this sheet is
                       asking, in place, without closing anything. */
                    <ActionRow
                      icon={glyphOf("box")}
                      label="Keep it, out of the way"
                      under="It stays where it is, and is never destroyed"
                      onDo={() => { setAsking("freeze"); }}
                    />
                  )
                  : null}
              </div>
            </Drawer.Body>
            {/* ⚠️ THE WAY OUT FIRST AND THE ACT LAST — the footer's own grammar,
                so the consequential button is arrived at rather than landed on. */}
            <Drawer.Footer>
              <Button slot="close" variant="tertiary">Cancel</Button>
              <Button
                slot="close"
                /* ⚠️ ONLY THE BIN IS DANGEROUS, and dressing both in red would
                   say the two outcomes are the same weight. Freezing destroys
                   nothing and is undone by one press. */
                variant={asking === "bin" ? "danger" : "primary"}
                onPress={asking === "bin" ? onBin : onFreeze}
              >
                {said.does}
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
