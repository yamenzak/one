/**
 * ONE KIT — what is in it, what is missing, and whether anybody may call it done.
 *
 * ⚠️ THE MISSING LIST IS THE SCREEN. A tray is either complete or it is a list
 * of things to go and find, and the second is what somebody is standing there
 * holding the screen for. Everything else on the page is context for that list.
 *
 * ⚠️ AND "BUILT" IS A CLAIM WITH A NAME ON IT. It is refused while anything is
 * short, because "this tray is complete" said over a tray missing a clamp is the
 * failure the whole record exists to prevent — and the button says so rather
 * than sitting there enabled and then arguing.
 *
 * ⚠️ A STRAY IS MARKED AND NEVER BLOCKS. Something in the kit that does not
 * belong is worth seeing every time and is not a reason to strand somebody who
 * has a reason for it — refusing over one is how a rule gets worked around.
 */

import {
  AmountRow, Confirm, FieldRow, Group, NavRow, NoteRow, Screen, Section,
  Viewfinder, glyphOf, type Loaded,
} from "@engine/design";
import { Button } from "@heroui/react";
/* ⚠️ ONE BOX IS ONE CODE — the fold the reader has no way to know. */
import { foldScan } from "../code.js";


/** One object in the kit. */
export interface Member {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  /** ⚠️ True where nothing in the recipe asked for it — see `checkKit`. */
  readonly stray: boolean;
}

/** One product the kit has too few of. */
export interface Missing {
  readonly product: string;
  readonly name: string;
  readonly want: number;
  readonly have: number;
}

export interface KitProps {
  readonly title?: string;
  readonly name: string;
  readonly code: string;
  readonly state: "open" | "built" | "broken";
  readonly built: string;
  readonly where: string;
  readonly of: Loaded<readonly Member[]>;
  readonly missing: readonly Missing[];
  readonly again: () => void;
  readonly back: () => void;
  readonly onRead: (code: string) => void;
  readonly onOpen: (unit: string) => void;
  readonly onTake: (unit: string) => void;
  readonly onBuild: () => void;
  readonly onBreak: () => void;
}

/* ⚠️ EXPORTED, BECAUSE THE PRODUCT'S SCREEN LISTS THESE TOO — see `Item`'s. Two
   spellings of "complete" is how a list and the screen it opens come to describe
   one tray differently. */
export const KIT_SAID: Readonly<Record<KitProps["state"], string>> = {
  open: "Being put together", built: "Complete", broken: "Broken up",
};

export function Kit({
  name, code, state, built, where, of, missing, again, back,
  onRead, onOpen, onTake, onBuild, onBreak,
}: KitProps) {
  const short = missing.length;

  return (
    <Screen
      shape="detail"
      title={name}
      under={[code, KIT_SAID[state]].filter(Boolean).join(" · ")}
      back={back}
      /* ⚠️ THE DOCKED ACT IS THE ONE THAT FINISHES IT, and it is absent rather
         than disabled while anything is short — a button that can only refuse is
         a button somebody presses to find out why. The missing list above it is
         the answer it would have given. */
      does={state === "open" && !short
        ? { op: "kit.build", label: "It is complete", onDo: onBuild }
        : undefined}
      of={of}
      again={again}
      isNothing={(rows) => rows.length === 0 && !short}
      nothing={{
        icon: glyphOf("layers"),
        says: "Nothing in it yet",
        under: "Scan an item's label to put it in",
      }}
      then={(members) => (
        <>
          {state === "open"
            ? (
              <Viewfinder
              /* ⚠️ ONE BOX IS ONE CODE — see `foldScan`. A pack carrying an EAN-13
                 and a DataMatrix decodes as both, in an unstable order. */
              fold={foldScan}
                says="Scan an item's label to put it in"
                onRead={onRead}
                typed={{
                  label: "Or type the item's code",
                  placeholder: "What is printed on it",
                }}
              />
            )
            : null}

          <Group label="Now">
            <FieldRow label="Standing" value={KIT_SAID[state]} />
            {built ? <FieldRow label="Built" value={built} /> : null}
            {where ? <FieldRow label="Where" value={where} /> : null}
          </Group>

          {/*
            ⚠️ MISSING BEFORE PRESENT, WHICH IS THE OPPOSITE OF HOW A KIT READS
            ON PAPER AND THE RIGHT WAY ROUND HERE. Somebody looking at this
            screen is either finishing the tray or checking it; both questions
            are answered by the short list, and putting the twenty things that
            ARE in it first makes them scroll past the answer.
          */}
          {short
            ? (
              <Section label="Still needed">
                <Group>
                  {missing.map((line) => (
                    <AmountRow
                      key={line.product}
                      label={line.name}
                      /* ⚠️ ON EVERY ROW, INCLUDING THE ONES AT ZERO. Hidden
                         where nothing is in yet, two rows of the same list read
                         as two different kinds of fact — and the bare figure
                         beside them is how many are SHORT, which is the number
                         this line explains. */
                      under={`${line.have} of ${line.want} in it`}
                      amount={<span data-ink="warning">{line.want - line.have}</span>}
                    />
                  ))}
                </Group>
              </Section>
            )
            : null}

          <Section label="In it">
            <Group>
              {members.map((member) => (
                <NavRow
                  key={member.id}
                  label={member.name}
                  /* ⚠️ THE STRAY IS SAID ON ITS OWN ROW rather than counted in a
                     summary. The person is holding the tray and has to take one
                     particular thing out of it. */
                  under={member.stray ? "Does not belong in this kit" : member.code}
                  onOpen={() => { onOpen(member.id); }}
                  aside={state === "broken"
                    ? undefined
                    : (
                      <Button size="sm" variant="ghost" onPress={() => { onTake(member.id); }}>
                        Take out
                      </Button>
                    )}
                />
              ))}
              {members.length ? null : <NoteRow>Nothing in it yet</NoteRow>}
            </Group>
          </Section>

          {/*
            ⚠️ TAKING SOMETHING OUT OF A BUILT KIT UN-BUILDS IT, and saying so
            here is what stops it being a surprise. Somebody needs the clamp;
            refusing them would make the app the thing between a person and their
            work. What must not survive is the claim.
          */}
          {state === "built"
            ? <NoteRow icon={glyphOf("alert")}>Taking anything out makes it incomplete again</NoteRow>
            : null}

          {state === "broken"
            ? null
            : (
              <Group
                label="Breaking it up"
                under="Everything in it goes back to the shelf"
                does={(
                  <Confirm
                    trigger={<Button variant="secondary">Break it up</Button>}
                    title="Break this kit up?"
                    act={{ op: "kit.break", label: "Break it up", tone: "danger", onDo: onBreak }}
                  >
                    {members.length
                      ? `${members.length} item${members.length === 1 ? "" : "s"} go back to the shelf, and this kit is finished.`
                      : "This kit is finished. Its record stays as it is."}
                  </Confirm>
                )}
              >
                <NoteRow>The record stays. A broken kit is never re-opened</NoteRow>
              </Group>
            )}
        </>
      )}
    />
  );
}
